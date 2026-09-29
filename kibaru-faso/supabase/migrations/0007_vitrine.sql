-- PÉDAGOGUE.IA — vitrine : témoignages d'enseignants et bibliothèque de fiches publiques (référencement).

create table public.temoignages (
  id uuid primary key default gen_random_uuid(),
  -- Avis déposé depuis « Mon compte » (un par enseignant) ; null pour un avis saisi par l'administration.
  utilisateur_id uuid unique references public.profils (id) on delete cascade,
  nom text not null,
  fonction text,
  ville text,
  texte text not null check (char_length(texte) between 10 and 600),
  note integer not null default 5 check (note between 1 and 5),
  publie boolean not null default false,
  ordre integer not null default 0,
  cree_le timestamptz not null default now()
);
create index temoignages_publies on public.temoignages (publie, ordre, cree_le desc);

create table public.fiches_publiques (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,120}$'),
  titre text not null,
  classe text,
  discipline text,
  resume text,
  contenu text not null,
  publie boolean not null default true,
  vues integer not null default 0,
  auteur_id uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index fiches_publiques_liste on public.fiches_publiques (publie, cree_le desc);

create or replace function public.compter_vue_fiche(s text) returns void
language sql set search_path = public as $$
  update public.fiches_publiques set vues = vues + 1 where slug = s and publie;
$$;
revoke execute on function public.compter_vue_fiche(text) from public, anon, authenticated;

alter table public.temoignages enable row level security;
alter table public.fiches_publiques enable row level security;
-- Aucune politique : lecture et écriture par le serveur uniquement (clé secrète).
