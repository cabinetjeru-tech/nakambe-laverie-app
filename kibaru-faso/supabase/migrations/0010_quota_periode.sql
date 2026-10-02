-- PÉDAGOGUE.IA — quota sur la durée de la formule et pondération des générations.

-- Nombre maximal de générations sur toute la durée de la formule (null = pas de plafond de période).
-- Complète quota_jour (plafond quotidien, anti-rafale).
alter table public.formules add column if not exists quota_periode integer check (quota_periode is null or quota_periode > 0);

-- Unités décomptées par génération : 1 en mode standard ou rapide, 2 en mode expert (modèle plus coûteux).
alter table public.usages add column if not exists unites smallint not null default 1 check (unites between 0 and 10);
