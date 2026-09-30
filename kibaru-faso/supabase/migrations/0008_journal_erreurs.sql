-- PÉDAGOGUE.IA — journal des erreurs techniques (IA, paiement…) pour le diagnostic depuis l'espace admin.
create table public.journal_erreurs (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  source text not null,
  detail text not null,
  utilisateur_id uuid references public.profils (id) on delete set null
);
create index journal_erreurs_recentes on public.journal_erreurs (cree_le desc);
alter table public.journal_erreurs enable row level security;
-- Aucune politique : lecture et écriture réservées au serveur (clé secrète).
