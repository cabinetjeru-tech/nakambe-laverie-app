import "server-only";
import { enregistrerUsage } from "../comptes";
import { debutJour } from "../couts";
import { emailConfigure, envoyerUneFois } from "../email/envoi";
import { emailAdminWhatsApp } from "../email/modeles";
import { journaliserErreur } from "../journal";
import { adminClient } from "../supabase/server";
import { repondre } from "./agent";
import { envoyerTexte, marquerLu } from "./envoi";
import { demandeHumain, type MessageRecu } from "./meta";

/**
 * Traitement d'un message reçu sur le WhatsApp professionnel : enregistrement, réponse de l'agent IA ou passage à
 * un conseiller, plafonds de coût. Ne lève jamais d'erreur (Meta renverrait la notification en boucle).
 */

const RELAIS =
  "Merci pour votre message 🙏 Je transmets votre demande à un conseiller de MEGAVISION, qui vous répond ici même dès que possible (en semaine, de 8 h à 18 h).";
const NON_TEXTE = "Merci ! Pour l'instant, je ne peux lire que les messages écrits. Pouvez-vous écrire votre question ? Un conseiller verra aussi votre message.";
const ERREUR = "Merci pour votre message 🙏 Un conseiller de MEGAVISION vous répond très vite.";

const plafondContact = () => Number(process.env.WHATSAPP_MAX_PAR_CONTACT_JOUR) || 30;
const plafondJour = () => Number(process.env.WHATSAPP_MAX_REPONSES_JOUR) || 300;

/** Chiffres seuls, 8 derniers (numéro burkinabè sans indicatif) : rapproche le numéro WhatsApp d'un profil enseignant. */
const finNumero = (t: string) => t.replace(/\D/g, "").slice(-8);

async function profilDuNumero(waId: string): Promise<string | null> {
  const { data } = await adminClient().from("profils").select("id, telephone").not("telephone", "is", null).limit(20000);
  const fin = finNumero(waId);
  return (data ?? []).find((p) => finNumero((p.telephone as string) ?? "") === fin)?.id ?? null;
}

async function alerterConseillers(waId: string, nom: string | null, motif: string, texte: string) {
  if (!emailConfigure()) return;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const heure = new Date().toISOString().slice(0, 13);
  for (const a of admins)
    await envoyerUneFois({
      cle: `whatsapp:${waId}:${heure}:${a}`,
      type: "admin_whatsapp",
      to: a,
      email: () => emailAdminWhatsApp({ numero: `+${waId}`, nom, motif, texte, lienAdmin: `${(process.env.APP_URL?.trim() || "https://pedagogue-ia.vercel.app").replace(/\/$/, "")}/admin` }),
    });
}

async function envoyerEtEnregistrer(waId: string, texte: string, auteur: "ia" | "conseiller" | "systeme") {
  await envoyerTexte(waId, texte);
  await adminClient().from("whatsapp_messages").insert({ wa_id: waId, sens: "sortant", auteur, texte });
}

async function passerLaMain(waId: string, nom: string | null, motif: string, dernier: string, message = RELAIS) {
  const db = adminClient();
  await db.from("whatsapp_contacts").update({ ia_active: false, a_traiter: true, motif }).eq("wa_id", waId);
  if (message) await envoyerEtEnregistrer(waId, message, "systeme").catch((e: Error) => journaliserErreur("whatsapp", `envoi relais ${waId} : ${e.message}`, null));
  await alerterConseillers(waId, nom, motif, dernier);
}

export async function traiterMessage(m: MessageRecu): Promise<void> {
  const db = adminClient();
  try {
    // 1. Contact (créé au premier message) et message entrant, une seule fois par identifiant Meta.
    const { data: existant } = await db.from("whatsapp_contacts").select("*").eq("wa_id", m.de).maybeSingle();
    if (!existant) await db.from("whatsapp_contacts").insert({ wa_id: m.de, nom: m.nom, profil_id: await profilDuNumero(m.de) });
    const texte = m.texte ?? `(message ${m.type} non lisible)`;
    const { error: doublon } = await db.from("whatsapp_messages").insert({ wa_id: m.de, sens: "entrant", auteur: "client", texte, wa_message_id: m.id });
    if (doublon) return; // déjà reçu (Meta renvoie parfois la même notification)
    await db.from("whatsapp_contacts").update({ dernier_message: new Date().toISOString(), ...(m.nom ? { nom: m.nom } : {}) }).eq("wa_id", m.de);
    await marquerLu(m.id);

    const { data: c } = await db.from("whatsapp_contacts").select("*").eq("wa_id", m.de).single();
    // 2. Conversation reprise par un conseiller : l'IA se tait, le message attend une réponse humaine.
    if (!c.ia_active) {
      await db.from("whatsapp_contacts").update({ a_traiter: true }).eq("wa_id", m.de);
      await alerterConseillers(m.de, c.nom, c.motif ?? "nouveau message", texte);
      return;
    }
    if (!m.texte) {
      await envoyerEtEnregistrer(m.de, NON_TEXTE, "systeme");
      await db.from("whatsapp_contacts").update({ a_traiter: true, motif: `message ${m.type}` }).eq("wa_id", m.de);
      return;
    }
    if (demandeHumain(m.texte)) return passerLaMain(m.de, c.nom, "demande un conseiller", m.texte);

    // 3. Plafonds de coût : par contact et pour l'ensemble des conversations du jour.
    const jour = debutJour().toISOString();
    const [{ count: siens }, { count: tous }] = await Promise.all([
      db.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("wa_id", m.de).eq("auteur", "ia").gte("cree_le", jour),
      db.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("auteur", "ia").gte("cree_le", jour),
    ]);
    if ((siens ?? 0) >= plafondContact()) return passerLaMain(m.de, c.nom, "conversation longue (plafond IA atteint)", m.texte);
    if ((tous ?? 0) >= plafondJour()) return passerLaMain(m.de, c.nom, "plafond quotidien de réponses IA atteint", m.texte, ERREUR);

    // 4. Réponse de l'agent, avec les 12 derniers messages de la conversation.
    const { data: hist } = await db.from("whatsapp_messages").select("auteur, texte").eq("wa_id", m.de).neq("auteur", "systeme").order("cree_le", { ascending: false }).limit(12);
    const r = await repondre(((hist ?? []) as { auteur: "client" | "ia" | "conseiller"; texte: string }[]).reverse(), c.profil_id);
    await envoyerEtEnregistrer(m.de, r.texte, "ia");
    await enregistrerUsage({ utilisateurId: c.profil_id, modele: r.modele, consommation: r.consommation, besoin: "whatsapp", decompte: false });
    if (r.relais) await passerLaMain(m.de, c.nom, r.motif ?? "relais demandé par l'IA", m.texte, "");
  } catch (e) {
    await journaliserErreur("whatsapp", `${m.de} : ${(e as Error).message}`, null);
    // Le client ne reste jamais sans réponse : message d'attente et alerte des conseillers.
    await passerLaMain(m.de, m.nom, "erreur de l'agent IA", m.texte ?? "", ERREUR).catch(() => undefined);
  }
}

/** Réponse d'un conseiller depuis l'espace admin (dans la fenêtre de 24 h ouverte par le dernier message du client). */
export async function repondreCommeConseiller(waId: string, texte: string): Promise<void> {
  await envoyerEtEnregistrer(waId, texte, "conseiller");
  await adminClient().from("whatsapp_contacts").update({ a_traiter: false }).eq("wa_id", waId);
}
