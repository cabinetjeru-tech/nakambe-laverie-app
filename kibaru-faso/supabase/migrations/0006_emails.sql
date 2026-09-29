-- PÉDAGOGUE.IA — journal des e-mails automatiques (un seul envoi par clé : bienvenue, paiement, rappel…).
create table public.emails_envoyes (
  cle text primary key,
  type text not null,
  utilisateur_id uuid references public.profils (id) on delete cascade,
  destinataire text not null,
  cree_le timestamptz not null default now()
);
create index emails_envoyes_type on public.emails_envoyes (type, cree_le desc);
alter table public.emails_envoyes enable row level security;
-- Aucune politique : lecture et écriture réservées au serveur (clé secrète).
