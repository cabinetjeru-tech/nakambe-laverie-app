-- PÉDAGOGUE.IA — essai gratuit de 24 h à l'inscription, parrainage et commissions (20 % de chaque paiement du filleul).

alter table public.abonnements drop constraint abonnements_origine_check;
alter table public.abonnements add constraint abonnements_origine_check check (origine in ('paiement', 'admin', 'essai'));

alter table public.profils add column code_parrainage text unique;
alter table public.profils add column parrain_id uuid references public.profils (id) on delete set null;
create index profils_parrain on public.profils (parrain_id);

create function public.nouveau_code_parrainage() returns text
language plpgsql set search_path = '' as $$
declare c text;
begin
  loop
    -- 6 caractères sans ambiguïté (pas de 0/O ni 1/I/L).
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') into c
    from generate_series(1, 6);
    exit when not exists (select 1 from public.profils where code_parrainage = c);
  end loop;
  return c;
end;
$$;

update public.profils set code_parrainage = public.nouveau_code_parrainage() where code_parrainage is null;
alter table public.profils alter column code_parrainage set not null;

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  parrain_id uuid not null references public.profils (id) on delete cascade,
  filleul_id uuid not null references public.profils (id) on delete cascade,
  paiement_id uuid not null unique references public.paiements (id) on delete cascade,
  montant_fcfa integer not null check (montant_fcfa >= 0),
  taux numeric(5, 2) not null,
  statut text not null default 'due' check (statut in ('due', 'versee', 'annulee')),
  versee_le timestamptz,
  reference_versement text,
  cree_le timestamptz not null default now()
);
create index commissions_parrain on public.commissions (parrain_id, cree_le desc);
alter table public.commissions enable row level security;
create policy "commissions : lecture des siennes" on public.commissions for select to authenticated using ((select auth.uid()) = parrain_id);

-- Inscription : profil, code de parrainage, parrain (code transmis à l'inscription) et essai gratuit de 24 h.
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parrain uuid;
begin
  select id into parrain from public.profils
  where code_parrainage = upper(nullif(trim(new.raw_user_meta_data ->> 'parrain'), ''));
  insert into public.profils (id, email, nom, code_parrainage, parrain_id)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'nom', ''), public.nouveau_code_parrainage(), parrain);
  insert into public.abonnements (utilisateur_id, debut, fin, origine, note)
  values (new.id, now(), now() + interval '24 hours', 'essai', 'Essai gratuit de 24 h à l''inscription');
  return new;
end;
$$;

revoke execute on function public.creer_profil() from public, anon, authenticated;
revoke execute on function public.nouveau_code_parrainage() from public, anon, authenticated;
