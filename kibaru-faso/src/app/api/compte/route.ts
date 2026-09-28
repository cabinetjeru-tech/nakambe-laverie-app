import { z } from "zod";
import { accessRequired, hasAccess } from "@/lib/access";
import { compteCourant, formules, parrainage } from "@/lib/comptes";
import { paiementDisponible } from "@/lib/paiement/cinetpay";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * État du compte pour l'interface.
 *  - mode « comptes » : Supabase configuré, chaque enseignant se connecte et s'abonne ;
 *  - mode « code » : code d'accès partagé (KIBARU_ACCESS_CODE) ; mode « libre » : aucun contrôle.
 */
export async function GET(req: Request) {
  if (!accountsEnabled()) {
    const required = accessRequired();
    return Response.json({ mode: required ? "code" : "libre", granted: hasAccess(req) });
  }
  const [compte, offres] = await Promise.all([
    compteCourant().catch((e: Error) => {
      console.error("[compte]", e.message);
      return null;
    }),
    formules().catch(() => []),
  ]);
  return Response.json({
    mode: "comptes",
    granted: !!compte?.acces,
    compte: compte && {
      email: compte.profil.email,
      nom: compte.profil.nom,
      telephone: compte.profil.telephone,
      etablissement: compte.profil.etablissement,
      ville: compte.profil.ville,
      role: compte.profil.role,
      suspendu: compte.profil.suspendu,
      fin: compte.fin?.toISOString() ?? null,
      joursRestants: compte.joursRestants,
      heuresRestantes: compte.heuresRestantes,
      essai: compte.essai,
    },
    parrainage: compte ? await parrainage(compte.profil).catch(() => null) : null,
    formules: offres,
    paiementDisponible: paiementDisponible(),
    paiements: compte ? await derniersPaiements(compte.profil.id) : [],
  });
}

async function derniersPaiements(id: string) {
  const { data } = await adminClient()
    .from("paiements")
    .select("transaction_id, formule_id, montant_fcfa, statut, moyen, cree_le")
    .eq("utilisateur_id", id)
    .order("cree_le", { ascending: false })
    .limit(10);
  return data ?? [];
}

const profilSchema = z.object({
  nom: z.string().trim().max(120).optional(),
  telephone: z.string().trim().max(30).optional(),
  etablissement: z.string().trim().max(160).optional(),
  ville: z.string().trim().max(80).optional(),
});

/** Mise à jour du profil de l'enseignant connecté. */
export async function PATCH(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Comptes non configurés." }, { status: 404 });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const parsed = profilSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Informations invalides." }, { status: 400 });
  const patch = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v || null]));
  const { error } = await adminClient().from("profils").update(patch).eq("id", compte.profil.id);
  if (error) return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  return Response.json({ ok: true });
}
