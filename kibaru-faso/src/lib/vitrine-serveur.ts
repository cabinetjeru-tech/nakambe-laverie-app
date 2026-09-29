import "server-only";
import { adminClient, accountsEnabled } from "./supabase/server";
import { arrondiVitrine, seuilCompteur, type FichePublique, type Temoignage } from "./vitrine";

/** Lectures publiques de la vitrine (témoignages publiés, fiches publiées, compteurs). Jamais d'erreur : vitrine vide. */

export async function temoignagesPublies(limite = 6): Promise<Temoignage[]> {
  if (!accountsEnabled()) return [];
  const { data } = await adminClient().from("temoignages").select("*").eq("publie", true).order("ordre").order("cree_le", { ascending: false }).limit(limite);
  return (data ?? []) as Temoignage[];
}

export type ResumeFiche = Pick<FichePublique, "slug" | "titre" | "classe" | "discipline" | "resume" | "cree_le" | "maj_le">;

export async function fichesPubliees(limite = 500): Promise<ResumeFiche[]> {
  if (!accountsEnabled()) return [];
  const { data } = await adminClient()
    .from("fiches_publiques")
    .select("slug, titre, classe, discipline, resume, cree_le, maj_le")
    .eq("publie", true)
    .order("cree_le", { ascending: false })
    .limit(limite);
  return (data ?? []) as ResumeFiche[];
}

export async function fichePubliee(slug: string): Promise<FichePublique | null> {
  if (!accountsEnabled() || !/^[a-z0-9-]{3,120}$/.test(slug)) return null;
  const { data } = await adminClient().from("fiches_publiques").select("*").eq("slug", slug).eq("publie", true).maybeSingle();
  return (data as FichePublique | null) ?? null;
}

export async function compterVue(slug: string): Promise<void> {
  await adminClient().rpc("compter_vue_fiche", { s: slug });
}

/** Compteurs publics, affichés seulement au-delà du seuil (null sinon). */
export async function compteursPublics(): Promise<{ enseignants: number | null; preparations: number | null }> {
  if (!accountsEnabled()) return { enseignants: null, preparations: null };
  const db = adminClient();
  const [{ count: e }, { count: p }] = await Promise.all([
    db.from("profils").select("id", { count: "exact", head: true }),
    db.from("usages").select("id", { count: "exact", head: true }).eq("decompte", true),
  ]);
  const seuil = seuilCompteur();
  return {
    enseignants: (e ?? 0) >= seuil ? arrondiVitrine(e ?? 0) : null,
    preparations: (p ?? 0) >= seuil * 5 ? arrondiVitrine(p ?? 0) : null,
  };
}
