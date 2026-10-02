-- PÉDAGOGUE.IA — l'essai gratuit devient « 1 fiche offerte » (au lieu de 24 h d'accès).
-- L'accès d'essai reste ouvert 30 jours pour laisser le temps de l'utiliser ; le nombre de générations
-- offertes est plafonné par l'application (QUOTA_ESSAI, 1 par défaut).
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parrain uuid;
begin
  select id into parrain from public.profils
  where code_parrainage = upper(nullif(trim(new.raw_user_meta_data ->> 'parrain'), ''));
  insert into public.profils (id, email, nom, code_parrainage, parrain_id)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'nom', ''), public.nouveau_code_parrainage(), parrain);
  insert into public.abonnements (utilisateur_id, debut, fin, origine, note)
  values (new.id, now(), now() + interval '30 days', 'essai', '1 fiche offerte à l''inscription (valable 30 jours)');
  return new;
end;
$$;

revoke execute on function public.creer_profil() from public, anon, authenticated;
