/** Sites officiels depuis lesquels le serveur peut importer un document (protection contre les liens arbitraires). */
const HOTES = ["education.gov.bf", "fasoeducation.bf"];

export function hoteOfficiel(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return HOTES.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
