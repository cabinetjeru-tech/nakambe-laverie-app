import "server-only";
import { loadBase, type BaseLoad } from "./base/load";

/**
 * Base documentaire PÉDAGOGUE.IA (dossier `base-documentaire/`), chargée une fois par instance serveur
 * puis gardée en mémoire. Toute mise à jour de la base passe par un redéploiement : les instructions
 * de PÉDAGOGUE.IA (prompt) ne changent pas quand les documents changent.
 */

let cache: Promise<BaseLoad> | null = null;

export function getBase(): Promise<BaseLoad> {
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
