-- PÉDAGOGUE.IA — comptes enseignants, abonnements, paiements mobile money, préparations sauvegardées.
-- Toutes les écritures passent par les routes serveur de l'application (clé secrète) : les politiques RLS
-- n'autorisent aux enseignants que la lecture de leurs propres lignes.

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nom text,
  telephone text,
  etablissement text,
  ville text,
  role text not null default 'enseignant' check (role in ('enseignant', 'admin')),
  suspendu boolean not null default false,
  cree_le timestamptz not null default now()
);

create table public.formules (
  id text primary key,
  libelle text not null,
  prix_fcfa integer not null check (prix_fcfa > 0),
  duree_jours integer not null check (duree_jours > 0),
  active boolean not null default true,
  ordre integer not null default 0
);

insert into public.formules (id, libelle, prix_fcfa, duree_jours, ordre) values
  ('mensuel', 'Abonnement mensuel', 2000, 30, 1),
  ('annuel', 'Abonnement annuel', 15000, 365, 2);

create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.profils (id) on delete cascade,
  formule_id text not null references public.formules (id),
  montant_fcfa integer not null,
  fournisseur text not null default 'cinetpay',
  transaction_id text not null unique,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'reussi', 'echoue', 'annule')),
  moyen text,
  detail jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index paiements_utilisateur on public.paiements (utilisateur_id, cree_le desc);

create table public.abonnements (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.profils (id) on delete cascade,
  formule_id text references public.formules (id),
  debut timestamptz not null,
  fin timestamptz not null,
  origine text not null check (origine in ('paiement', 'admin')),
  paiement_id uuid unique references public.paiements (id),
  note text,
  cree_le timestamptz not null default now(),
  check (fin > debut)
);
create index abonnements_utilisateur on public.abonnements (utilisateur_id, fin desc);

create table public.preparations (
  id text not null,
  utilisateur_id uuid not null references public.profils (id) on delete cascade,
  titre text not null default '',
  categorie text,
  contenu jsonb not null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  primary key (utilisateur_id, id)
);
create index preparations_maj on public.preparations (utilisateur_id, maj_le desc);

-- Profil créé automatiquement à l'inscription.
create function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profils (id, email, nom)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'nom', ''));
  return new;
end;
$$;
create trigger apres_inscription after insert on auth.users
  for each row execute function public.creer_profil();

alter table public.profils enable row level security;
alter table public.formules enable row level security;
alter table public.paiements enable row level security;
alter table public.abonnements enable row level security;
alter table public.preparations enable row level security;

create policy "profil : lecture du sien" on public.profils for select to authenticated using ((select auth.uid()) = id);
create policy "formules : lecture des actives" on public.formules for select to anon, authenticated using (active);
create policy "paiements : lecture des siens" on public.paiements for select to authenticated using ((select auth.uid()) = utilisateur_id);
create policy "abonnements : lecture des siens" on public.abonnements for select to authenticated using ((select auth.uid()) = utilisateur_id);
create policy "preparations : lecture des siennes" on public.preparations for select to authenticated using ((select auth.uid()) = utilisateur_id);

-- La fonction du déclencheur ne doit pas être appelable par l'API.
revoke execute on function public.creer_profil() from public, anon, authenticated;
