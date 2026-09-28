
-- Pass journalier (appliqué le 2026-09-28) : 200 FCFA pour 24 h.
insert into public.formules (id, libelle, prix_fcfa, duree_jours, ordre)
values ('journalier', 'Pass journalier (24 h)', 200, 1, 0)
on conflict (id) do update set libelle = excluded.libelle, prix_fcfa = excluded.prix_fcfa, duree_jours = excluded.duree_jours, active = true, ordre = excluded.ordre;
