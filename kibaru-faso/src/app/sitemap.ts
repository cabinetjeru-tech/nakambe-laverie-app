import type { MetadataRoute } from "next";
import { SITE } from "@/lib/campagne";
import { fichesPubliees } from "@/lib/vitrine-serveur";

export const revalidate = 3600;

/** Plan du site pour Google : pages publiques et fiches gratuites. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL?.trim() || SITE).replace(/\/$/, "");
  const fiches = await fichesPubliees().catch(() => []);
  return [
    { url: `${base}/decouvrir`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/fiches`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/conditions`, changeFrequency: "yearly", priority: 0.2 },
    ...fiches.map((f) => ({ url: `${base}/fiches/${f.slug}`, lastModified: new Date(f.maj_le), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
