-- PÉDAGOGUE.IA — ambassadeurs, pass 24 h déduit de l'annuel, licences établissement.
-- Toutes les écritures passent par les routes serveur (clé secrète) : RLS active, aucune politique.

-- ---------------------------------------------------------------- Ambassadeurs
-- Enseignants relais (un par région ou discipline) : leurs filleuls sont suivis à part et leur commission
-- peut être plus élevée que le parrainage ordinaire. Un ambassadeur actif touche sa commission même sans
-- abonnement personnel (son accès lui est en général offert).
create table public.ambassadeurs (
  profil_id uuid primary key references public.profils (id) on delete cascade,
  region text,
  zone text,
  disciplines text,
  taux numeric(5, 2) check (taux is null or (taux > 0 and taux <= 50)),
  objectif_mois integer check (objectif_mois is null or objectif_mois > 0),
  actif boolean not null default true,
  note text,
  cree_le timestamptz not null default now()
);
alter table public.ambassadeurs enable row level security;

-- ---------------------------------------------------------------- Pass 24 h déduit de l'annuel
-- Les pass payés dans les 7 jours précédant un abonnement annuel sont déduits de son prix.
alter table public.paiements add column credit_pass_fcfa integer not null default 0 check (credit_pass_fcfa >= 0);
alter table public.paiements add column passes_deduits uuid[];
alter table public.paiements add column deduit_par uuid references public.paiements (id) on delete set null;

-- ---------------------------------------------------------------- Licences établissement
-- Un établissement achète N places (paiement reçu hors ligne) ; ses enseignants les activent avec un code.
create table public.etablissements (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  ville text,
  contact_nom text,
  contact_telephone text,
  contact_email text,
  places integer not null check (places > 0 and places <= 5000),
  formule_id text references public.formules (id) default 'annuel',
  duree_jours integer not null default 365 check (duree_jours > 0 and duree_jours <= 730),
  montant_fcfa integer not null default 0 check (montant_fcfa >= 0),
  code text not null unique,
  ambassadeur_id uuid references public.profils (id) on delete set null,
  actif boolean not null default true,
  expire_le timestamptz,
  note text,
  cree_le timestamptz not null default now()
);
alter table public.etablissements enable row level security;

create table public.etablissement_membres (
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  utilisateur_id uuid not null references public.profils (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (etablissement_id, utilisateur_id)
);
create index etablissement_membres_utilisateur on public.etablissement_membres (utilisateur_id);
alter table public.etablissement_membres enable row level security;

alter table public.abonnements drop constraint abonnements_origine_check;
alter table public.abonnements add constraint abonnements_origine_check check (origine in ('paiement', 'admin', 'essai', 'licence'));

-- Réserve une place de façon atomique (verrou sur l'établissement : jamais plus de membres que de places).
-- Renvoie l'établissement si la place est prise, une erreur explicite sinon.
create or replace function public.rejoindre_licence(p_code text, p_utilisateur uuid)
returns table (etablissement_id uuid, nom text, formule_id text, duree_jours integer)
language plpgsql security definer set search_path = '' as $$
declare e public.etablissements;
declare n integer;
begin
  select * into e from public.etablissements where code = upper(trim(p_code)) for update;
  if not found or not e.actif then raise exception 'LICENCE_INCONNUE'; end if;
  if e.expire_le is not null and e.expire_le <= now() then raise exception 'LICENCE_EXPIREE'; end if;
  if exists (select 1 from public.etablissement_membres m where m.etablissement_id = e.id and m.utilisateur_id = p_utilisateur) then
    raise exception 'LICENCE_DEJA_MEMBRE';
  end if;
  select count(*) into n from public.etablissement_membres m where m.etablissement_id = e.id;
  if n >= e.places then raise exception 'LICENCE_COMPLETE'; end if;
  insert into public.etablissement_membres (etablissement_id, utilisateur_id) values (e.id, p_utilisateur);
  return query select e.id, e.nom, e.formule_id, e.duree_jours;
end;
$$;
revoke execute on function public.rejoindre_licence(text, uuid) from public, anon, authenticated;
grant execute on function public.rejoindre_licence(text, uuid) to service_role;
