-- PÉDAGOGUE.IA — documents officiels déposés depuis l'espace admin (programmes, guides, référentiels…).
-- Le texte est extrait dans le navigateur de l'administrateur ; seul le texte et les métadonnées sont conservés.
create table public.base_documents (
  id text primary key check (char_length(id) between 3 and 60),
  titre text not null,
  type text not null default 'RESSOURCE_COMPLEMENTAIRE',
  classes text[] not null default '{}',
  disciplines text[] not null default '{}',
  organisme text,
  annee text,
  version text,
  statut text not null default 'A_VERIFIER' check (statut in ('ACTIF', 'PROVISOIRE', 'A_VERIFIER', 'REMPLACE', 'ARCHIVE')),
  source text,
  url text,
  niveau_source integer check (niveau_source between 1 and 5),
  avertissement text,
  observations text,
  fichier_nom text,
  texte text not null,
  ajoute_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
alter table public.base_documents enable row level security;
-- Aucune politique : lecture et écriture réservées au serveur (clé secrète).
