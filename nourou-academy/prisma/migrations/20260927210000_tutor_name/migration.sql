-- Nouveau nom du tuteur IA : « Chafik IA » (remplace l'ancien nom s'il est encore enregistré dans l'identité).
UPDATE "Setting"
SET "value" = jsonb_set("value"::jsonb, '{tutorName}', '"Chafik IA"'), "updatedAt" = now()
WHERE "key" = 'brand' AND "value"::jsonb ->> 'tutorName' = 'Noura IA';
