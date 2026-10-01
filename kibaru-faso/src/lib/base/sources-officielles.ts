/**
 * Sites officiels depuis lesquels le serveur peut importer un document (protection contre les liens arbitraires).
 * bop.bf : Boîte à Outils du Préscolaire, qui publie les curricula du préscolaire du ministère (Commission nationale des programmes scolaires).
 */
export const HOTES_OFFICIELS = ["education.gov.bf", "fasoeducation.bf", "bop.bf"];
const HOTES = HOTES_OFFICIELS;

export function hoteOfficiel(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return HOTES.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
