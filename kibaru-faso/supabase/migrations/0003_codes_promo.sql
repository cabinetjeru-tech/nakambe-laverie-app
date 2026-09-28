-- PÉDAGOGUE.IA — codes promo de campagne (remise en % sur un paiement, une fois par enseignant).

create table public.codes_promo (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  description text,
  remise_pct integer not null check (remise_pct between 1 and 90),
  actif boolean not null default true,
  expire_le timestamptz,
  max_utilisations integer check (max_utilisations is null or max_utilisations > 0),
  cree_le timestamptz not null default now()
);
alter table public.codes_promo enable row level security;

alter table public.paiements add column code_promo text references public.codes_promo (code);
alter table public.paiements add column prix_initial_fcfa integer;
create index paiements_code_promo on public.paiements (code_promo) where code_promo is not null;

insert into public.codes_promo (code, description, remise_pct, expire_le)
values ('LANCEMENT', 'Offre de lancement PÉDAGOGUE.IA', 25, now() + interval '45 days');
