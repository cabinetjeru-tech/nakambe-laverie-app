-- PÉDAGOGUE.IA — WhatsApp professionnel : conversations reçues par l'API WhatsApp Cloud (Meta), réponses de
-- l'agent IA et des conseillers. Écritures par le serveur uniquement : RLS active, aucune politique.

create table public.whatsapp_contacts (
  wa_id text primary key,                       -- numéro international sans « + » (ex. 22670000000)
  nom text,                                     -- nom du profil WhatsApp
  profil_id uuid references public.profils (id) on delete set null,
  ia_active boolean not null default true,      -- false : un conseiller a repris la conversation
  a_traiter boolean not null default false,     -- demande d'un humain, message non textuel, incident
  motif text,
  dernier_message timestamptz not null default now(),
  cree_le timestamptz not null default now()
);
create index whatsapp_contacts_recents on public.whatsapp_contacts (dernier_message desc);
alter table public.whatsapp_contacts enable row level security;

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null references public.whatsapp_contacts (wa_id) on delete cascade,
  sens text not null check (sens in ('entrant', 'sortant')),
  auteur text not null check (auteur in ('client', 'ia', 'conseiller', 'systeme')),
  texte text not null,
  wa_message_id text unique,                    -- identifiant Meta : évite de traiter deux fois un même message
  cree_le timestamptz not null default now()
);
create index whatsapp_messages_conversation on public.whatsapp_messages (wa_id, cree_le desc);
alter table public.whatsapp_messages enable row level security;
