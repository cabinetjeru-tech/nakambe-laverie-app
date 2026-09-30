import "server-only";
import { fusionnerBase, type DocumentEnLigne } from "./base/en-ligne";
import { loadBase, type BaseLoad } from "./base/load";
import { accountsEnabled, adminClient } from "./supabase/server";

/**
 * Base documentaire PÉDAGOGUE.IA (dossier `base-documentaire/`), chargée une fois par instance serveur
 * puis gardée en mémoire. Toute mise à jour de la base passe par un redéploiement : les instructions
 * de PÉDAGOGUE.IA (prompt) ne changent pas quand les documents changent.
 */

let cache: Promise<BaseLoad> | null = null;

/** Documents déposés depuis /admin : relus au plus toutes les 60 s (ou aussitôt après une modification). */
let enLigne: { lu: number; rows: Promise<DocumentEnLigne[]> } | null = null;
const DUREE_CACHE = 60_000;

export function invaliderBaseEnLigne() {
  enLigne = null;
}

function documentsEnLigne(): Promise<DocumentEnLigne[]> {
  if (!accountsEnabled()) return Promise.resolve([]);
  if (!enLigne || Date.now() - enLigne.lu > DUREE_CACHE) {
    const rows = Promise.resolve(
      adminClient()
        .from("base_documents")
        .select("*")
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return (data ?? []) as DocumentEnLigne[];
        }),
    ).catch((e: Error) => {
      console.error("[base-documentaire] documents en ligne indisponibles :", e.message);
      enLigne = null;
      return [] as DocumentEnLigne[];
    });
    enLigne = { lu: Date.now(), rows };
  }
  return enLigne.rows;
}

/** Base complète : documents du dépôt Git + documents déposés depuis l'espace admin. */
export async function getBase(): Promise<BaseLoad> {
  const [fichiers, rows] = await Promise.all([getBaseFichiers(), documentsEnLigne()]);
  return fusionnerBase(fichiers, rows);
}

function getBaseFichiers(): Promise<BaseLoad> {
  if (!cache) {
    cache = loadBase()
      .then((r) => {
        for (const i of r.issues) console.warn(`[base-documentaire] ${i.level} — ${i.path} : ${i.message}`);
        return r;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}
