"use client";

import { useCallback, useEffect, useState } from "react";
import { IconeWhatsApp } from "./partage-reseaux";

/** Onglet « WhatsApp » de l'espace admin : conversations du WhatsApp professionnel, réponses de l'IA et des conseillers. */

type Contact = {
  wa_id: string;
  nom: string | null;
  profil_id: string | null;
  ia_active: boolean;
  a_traiter: boolean;
  motif: string | null;
  dernier_message: string;
  apercu: { texte: string; auteur: string } | null;
};
type Message = { id: string; sens: "entrant" | "sortant"; auteur: "client" | "ia" | "conseiller" | "systeme"; texte: string; cree_le: string };
type Donnees = { config: { ok: boolean; manquantes: string[] }; webhook: string; contacts: Contact[]; messages: Message[] };

const AUTEUR: Record<Message["auteur"], string> = { client: "Client", ia: "Agent IA", conseiller: "Conseiller", systeme: "Message automatique" };
const heure = (d: string) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const numero = (w: string) => `+${w.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5")}`;

export function WhatsAppAdmin() {
  const [d, setD] = useState<Donnees | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [texte, setTexte] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    const r = await fetch(`/api/admin/whatsapp${sel ? `?wa_id=${sel}` : ""}`).catch(() => null);
    if (r?.ok) setD((await r.json()) as Donnees);
  }, [sel]);

  useEffect(() => {
    void charger();
    const t = setInterval(() => void charger(), 20_000);
    return () => clearInterval(t);
  }, [charger]);

  async function action(corps: Record<string, unknown>, ok?: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMsg(r?.ok ? (ok ?? null) : `Erreur : ${j?.error ?? "réseau indisponible"}`);
    await charger();
    return !!r?.ok;
  }

  if (!d) return <p className="text-sm text-muted">Chargement…</p>;
  const contact = d.contacts.find((c) => c.wa_id === sel) ?? null;
  const aTraiter = d.contacts.filter((c) => c.a_traiter).length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-4 text-sm">
        <h2 className="flex items-center gap-2 font-bold text-faso-dark">
          <span className="text-[#25D366]">
            <IconeWhatsApp />
          </span>
          WhatsApp professionnel · +226 03 70 37 17
        </h2>
        <p className="mt-1 text-muted">
          L&apos;agent IA répond aux demandes de renseignements (offre, tarifs, inscription, paiement, parrainage). Il passe la main à un conseiller quand la personne le demande,
          pour un problème de paiement ou de compte, une licence établissement, ou quand il n&apos;est pas sûr. Vous recevez alors un e-mail et la conversation apparaît en rouge
          ci-dessous.
        </p>
        {d.config.ok ? (
          <p className="mt-2 rounded-lg bg-faso-50 p-2 font-semibold text-faso-dark">✅ Connexion à WhatsApp configurée.</p>
        ) : (
          <div className="mt-2 rounded-lg border border-or/60 bg-or-50 p-3">
            <p className="font-semibold">⚙️ WhatsApp pas encore relié. Variables à ajouter dans Vercel : {d.config.manquantes.join(", ")}.</p>
            <p className="mt-1 text-xs">
              Adresse du webhook à déclarer chez Meta : <code className="rounded bg-white px-1">{d.webhook}</code> (champ « messages »). Le mode d&apos;emploi pas à pas est dans
              docs/WHATSAPP.md.
            </p>
          </div>
        )}
      </section>

      {msg && <p className="rounded-lg border border-line bg-white p-2 text-sm">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-xl border border-line bg-white">
          <div className="border-b border-line px-3 py-2 text-sm font-semibold">
            Conversations ({d.contacts.length}){aTraiter ? <span className="ml-2 rounded-full bg-rouge px-2 py-0.5 text-xs text-white">{aTraiter} à traiter</span> : null}
          </div>
          {d.contacts.length === 0 && <p className="p-4 text-sm text-muted">Aucune conversation pour le moment.</p>}
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
            {d.contacts.map((c) => (
              <li key={c.wa_id}>
                <button type="button" onClick={() => setSel(c.wa_id)} className={`w-full px-3 py-2.5 text-left ${sel === c.wa_id ? "bg-faso-50" : "hover:bg-surface"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm">{c.nom || numero(c.wa_id)}</strong>
                    <span className="shrink-0 text-[11px] text-muted">{heure(c.dernier_message)}</span>
                  </div>
                  <div className="truncate text-xs text-muted">{c.apercu ? `${c.apercu.auteur === "client" ? "" : "↩ "}${c.apercu.texte}` : "—"}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                    {c.a_traiter && <span className="rounded-full bg-rouge-50 px-2 py-0.5 text-rouge">À traiter{c.motif ? ` · ${c.motif}` : ""}</span>}
                    <span className={`rounded-full px-2 py-0.5 ${c.ia_active ? "bg-faso-50 text-faso-dark" : "bg-surface text-muted"}`}>{c.ia_active ? "IA active" : "Conseiller"}</span>
                    {c.profil_id && <span className="rounded-full bg-or-50 px-2 py-0.5 text-[#7a5a00]">Enseignant inscrit</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-xl border border-line bg-white">
          {!contact ? (
            <p className="m-auto p-6 text-center text-sm text-muted">Choisissez une conversation pour la lire et y répondre.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <div>
                  <strong>{contact.nom || numero(contact.wa_id)}</strong> <span className="text-xs text-muted">{numero(contact.wa_id)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.ia_active ? (
                    <button type="button" disabled={busy} onClick={() => void action({ action: "ia", wa_id: contact.wa_id, active: false }, "Vous avez repris la conversation : l'IA ne répond plus à ce contact.")} className="rounded-lg border border-line px-3 py-1 text-xs">
                      Reprendre la main
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void action({ action: "ia", wa_id: contact.wa_id, active: true }, "L'agent IA répond de nouveau à ce contact.")} className="rounded-lg bg-faso px-3 py-1 text-xs font-semibold text-white">
                      Rendre la main à l&apos;IA
                    </button>
                  )}
                  {contact.a_traiter && (
                    <button type="button" disabled={busy} onClick={() => void action({ action: "traite", wa_id: contact.wa_id }, "Conversation marquée traitée.")} className="rounded-lg border border-line px-3 py-1 text-xs">
                      Marquer traité
                    </button>
                  )}
                  <a href={`https://wa.me/${contact.wa_id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#25D366] px-3 py-1 text-xs font-semibold text-[#128C7E]">
                    Ouvrir dans WhatsApp
                  </a>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-surface p-4" style={{ maxHeight: 460 }}>
                {d.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sens === "entrant" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        m.sens === "entrant" ? "bg-white" : m.auteur === "conseiller" ? "bg-[#d9fdd3]" : m.auteur === "ia" ? "bg-faso-50" : "bg-or-50"
                      }`}
                    >
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {AUTEUR[m.auteur]} · {heure(m.cree_le)}
                      </div>
                      {m.texte}
                    </div>
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await action({ action: "repondre", wa_id: contact.wa_id, texte }, "Réponse envoyée.")) setTexte("");
                }}
                className="flex gap-2 border-t border-line p-3"
              >
                <textarea
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  rows={2}
                  placeholder="Votre réponse de conseiller (envoyée sur WhatsApp)…"
                  className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:border-faso focus:outline-none"
                />
                <button type="submit" disabled={busy || !texte.trim()} className="self-end rounded-lg bg-[#25D366] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                  Envoyer
                </button>
              </form>
              <p className="px-3 pb-2 text-[11px] text-muted">
                WhatsApp n&apos;autorise les réponses libres que dans les 24 h qui suivent le dernier message du client. Au-delà, répondez depuis l&apos;application WhatsApp
                Business.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
