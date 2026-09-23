/** « Beauté Divine & Co » → « beaute-divine-co » (a–z, 0–9, tirets ; 3 à 40 caractères). */
export function slugify(input: string, maxLength = 40): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `${slug || 'salon'}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Sous-domaines réservés à la plateforme. */
export const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'admin', 'static', 'cdn', 'mail', 'support', 'status', 'docs', 'moi']);
