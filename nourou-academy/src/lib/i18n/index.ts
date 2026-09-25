import { fr, type MessageKey } from "./fr";

/**
 * Internationalisation : le français est la langue par défaut (champ User.locale).
 * Pour ajouter une langue (ex. anglais) : créer en.ts avec les mêmes clés et l'ajouter ci-dessous.
 */
const dictionaries: Record<string, Partial<Record<MessageKey, string>>> = { fr };

export const locales = Object.keys(dictionaries);

export function t(key: MessageKey, locale = "fr"): string {
  return dictionaries[locale]?.[key] ?? fr[key];
}
