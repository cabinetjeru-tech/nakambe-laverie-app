-- PÉDAGOGUE.IA — quotas de générations par jour et suivi du coût de l'IA.

-- Nombre maximal de générations par jour pour chaque formule (null = illimité).
alter table public.formules add column quota_jour integer check (quota_jour is null or quota_jour > 0);
update public.formules set quota_jour = case id when 'journalier' then 4 when 'mensuel' then 5 when 'annuel' then 6 else 5 end;

-- Une ligne par appel à l'IA : jetons consommés et coût estimé (dollars US, tarif public du modèle).
create table public.usages (
  id bigint generated always as identity primary key,
  utilisateur_id uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  modele text not null,
  jetons_entree integer not null default 0,
  jetons_sortie integer not null default 0,
  jetons_cache_lecture integer not null default 0,
  jetons_cache_ecriture integer not null default 0,
  cout_usd numeric(12, 6) not null default 0,
  besoin text,
  -- false pour une simple question de précision (ne compte pas dans le quota)
  decompte boolean not null default true
);
create index usages_utilisateur_jour on public.usages (utilisateur_id, cree_le desc);
create index usages_jour on public.usages (cree_le desc);
alter table public.usages enable row level security;
