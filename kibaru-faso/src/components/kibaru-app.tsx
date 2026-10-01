"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPES_SEANCE, type TeacherContext } from "@/lib/conversation";
import { CATEGORIES, classify, conversationTitle, isStudentCopy, splitDocuments, type Category } from "@/lib/documents";
import { downloadPdf, downloadWord, printHtml, type OptionsDocument } from "@/lib/export";
import type { DecisionSummary } from "@/lib/base/decision";
import { STATUT_LABELS, typeLabel, type Statut } from "@/lib/base/structure";
import { CYCLES } from "@/lib/search";
import { OptionsClasses } from "./options-classes";
import { newId, store, type Conversation, type Source, type StoredMessage, type TeacherDoc } from "@/lib/store";
import { disciplinesPour, EVAL_COMMANDS, FICHE_COMMANDS, MODIFICATIONS, PROG_COMMANDS, REMED_COMMANDS, TEMPLATES, type Template } from "@/lib/templates";
import { RemedFormDialog } from "./remed-form";
import { ProgFormDialog } from "./prog-form";
import { EvalFormDialog } from "./eval-form";
import { FicheFormDialog } from "./fiche-form";
import { Markdown } from "./markdown";
import { CONTACT } from "@/lib/contact";
import { BoutonInstaller } from "./installer";
import {
  IconeAccueil,
  IconeClasse,
  IconeCompte,
  IconeCorrige,
  IconeDevoir,
  IconeDossier,
  IconeEnvoyer,
  IconeFiche,
  IconeInfo,
  IconeModele,
  IconePlus,
  IconeProgression,
  IconeRemediation,
  IconeReprendre,
  IconeRetour,
} from "./icones";
import { AbonnementScreen, AuthScreen, ComptePanel, type CompteInfo, type EtatCompte, type PaiementInfo } from "./compte";

type LibraryDoc = {
  id: string;
  documentId: string | null;
  title: string;
  type: string;
  category: string | null;
  categoryLabel: string;
  classes: string[];
  disciplines: string[];
  source: string | null;
  organisme: string | null;
  year: string | null;
  version: string | null;
  sourceLevel: number | null;
  priority: string | null;
  statut: Statut | null;
  observations: string | null;
  notice: string | null;
  note: string | null;
  verifiedAt: string | null;
  reason?: string;
};
type PendingDoc = { path: string; documentId?: string; title: string; statut: Statut; categoryLabel: string };
type Status = {
  loading: boolean;
  /** libre : aucun contrôle ; code : code partagé ; comptes : espace enseignant avec abonnement. */
  mode: "libre" | "code" | "comptes";
  required: boolean;
  granted: boolean;
  configured: boolean;
  library: LibraryDoc[];
  history: LibraryDoc[];
  pending: PendingDoc[];
  etat?: EtatCompte;
};
type CompteReponse = {
  mode: Status["mode"];
  granted: boolean;
  compte?: CompteInfo | null;
  formules?: EtatCompte["formules"];
  paiementDisponible?: boolean;
  paiements?: PaiementInfo[];
  parrainage?: EtatCompte["parrainage"];
  quota?: EtatCompte["quota"];
};
const PARRAIN_KEY = "kibaru:parrain";

const RELIABILITY: Record<number, string> = {
  1: "Niveau 1 — document officiel",
  2: "Niveau 2 — programme ou guide officiellement reconnu",
  3: "Niveau 3 — document institutionnel complémentaire",
  4: "Niveau 4 — ressource secondaire",
  5: "Niveau 5 — connaissance générale",
};

export function KibaruApp() {
  const [status, setStatus] = useState<Status>({ loading: true, mode: "libre", required: false, granted: false, configured: true, library: [], history: [], pending: [] });
  const [compteOpen, setCompteOpen] = useState(false);
  /** Message après un retour de paiement ou un lien e-mail. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Lien « mot de passe oublié » : l'enseignant choisit un nouveau mot de passe. */
  const [reinit, setReinit] = useState(false);
  /** Code du parrain (lien d'invitation ?parrain=CODE), gardé jusqu'à l'inscription. */
  const [parrain, setParrain] = useState<string | null>(null);
  /** Arrivée depuis la page de présentation : ouvrir directement l'inscription. */
  const [inscription, setInscription] = useState(false);
  const scopeRef = useRef<string | null | undefined>(undefined);
  /** Version (updatedAt) de chaque préparation déjà sauvegardée en ligne. */
  const syncedRef = useRef<Map<string, number> | null>(null);
  const [context, setContext] = useState<TeacherContext>({});
  const [docs, setDocs] = useState<TeacherDoc[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  /** Sur téléphone, le panneau montre soit « Ma classe », soit « Mes préparations » (barre de navigation du bas). */
  const [vuePanneau, setVuePanneau] = useState<"classe" | "preparations">("classe");
  const [commandesOuvertes, setCommandesOuvertes] = useState(false);
  const [ficheOpen, setFicheOpen] = useState(false);
  /** Formulaire du Module 02 ouvert, avec le type d'évaluation présélectionné. */
  const [evalOpen, setEvalOpen] = useState<string | null>(null);
  const [remedOpen, setRemedOpen] = useState(false);
  const [progOpen, setProgOpen] = useState(false);
  // Rubrique de l'action rapide choisie, retenue tant que l'enseignant garde le début du texte proposé.
  const [pendingCategory, setPendingCategory] = useState<{ category: Category; prefix: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /** Données locales de l'enseignant (propres à son compte sur cet appareil). */
  const applyScope = useCallback((scope: string | null) => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    store.setScope(scope);
    setContext(store.context());
    setDocs(store.docs());
    setConversations(store.conversations());
    syncedRef.current = null;
  }, []);

  /** Préparations en ligne : fusion avec la copie de l'appareil (la version la plus récente l'emporte). */
  const loadPreparations = useCallback(async () => {
    const r = await fetch("/api/preparations").catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json()) as { conversations: Conversation[] };
    syncedRef.current = new Map(j.conversations.map((c) => [c.id, c.updatedAt]));
    setConversations((local) => {
      const byId = new Map(local.map((c) => [c.id, c]));
      for (const c of j.conversations) {
        const l = byId.get(c.id);
        if (!l || l.updatedAt <= c.updatedAt) byId.set(c.id, c);
      }
      const next = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      store.saveConversations(next);
      return next;
    });
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const a = (await (await fetch("/api/compte")).json()) as CompteReponse;
      const etat: EtatCompte | undefined =
        a.mode === "comptes"
          ? { compte: a.compte ?? null, formules: a.formules ?? [], paiementDisponible: !!a.paiementDisponible, paiements: a.paiements ?? [], granted: a.granted, parrainage: a.parrainage ?? null, quota: a.quota ?? null }
          : undefined;
      applyScope(a.mode === "comptes" ? (a.compte?.email.toLowerCase() ?? null) : null);
      if (!a.granted && a.mode !== "libre") {
        setStatus({ loading: false, mode: a.mode, required: true, granted: false, configured: true, library: [], history: [], pending: [], etat });
        return;
      }
      if (a.mode === "comptes") void loadPreparations();
      const r = await fetch("/api/referentiels");
      const j = (await r.json()) as { configured: boolean; documents: LibraryDoc[]; history: LibraryDoc[]; pending: PendingDoc[] };
      setStatus({ loading: false, mode: a.mode, required: a.mode !== "libre", granted: true, configured: j.configured, library: j.documents ?? [], history: j.history ?? [], pending: j.pending ?? [], etat });
    } catch {
      setStatus((s) => ({ ...s, loading: false, granted: true }));
    }
  }, [applyScope, loadPreparations]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("reinit")) setReinit(true);
    const code = (q.get("parrain") ?? "").trim().toUpperCase();
    try {
      if (/^[A-Z0-9]{6}$/.test(code)) localStorage.setItem(PARRAIN_KEY, code);
      setParrain(localStorage.getItem(PARRAIN_KEY));
    } catch {
      if (/^[A-Z0-9]{6}$/.test(code)) setParrain(code);
    }
    if (q.get("inscription")) setInscription(true);
    // Raccourci de l'application installée (appui long sur l'icône) : « Mon compte ».
    if (q.get("compte")) {
      setCompteOpen(true);
      window.history.replaceState(null, "", "/");
    }
    if ((q.get("parrain") || q.get("inscription")) && !q.get("paiement") && !q.get("reinit")) window.history.replaceState(null, "", "/");
    if (q.get("erreur_lien")) setNotice("Ce lien a expiré ou a déjà été utilisé. Recommencez la démarche.");
    const tx = q.get("paiement");
    if (q.get("erreur_lien") || tx) window.history.replaceState(null, "", "/");
    if (!tx) {
      void loadStatus();
      return;
    }
    // Retour de la page de paiement : l'état réel est revérifié auprès du service de paiement.
    void (async () => {
      setNotice("Vérification de votre paiement…");
      const r = await fetch("/api/paiement/verifier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction: tx }) }).catch(() => null);
      const j = (await r?.json().catch(() => ({}))) as { statut?: string; error?: string } | undefined;
      setNotice(
        j?.statut === "reussi"
          ? "✅ Paiement confirmé : votre abonnement est actif. Bon travail !"
          : j?.statut === "en_attente"
            ? "⏳ Paiement en cours de confirmation par l'opérateur. Actualisez la page dans une minute."
            : j?.statut === "echoue" || j?.statut === "annule"
              ? "❌ Le paiement n'a pas abouti. Aucun montant n'a été validé : vous pouvez réessayer."
              : (j?.error ?? "Impossible de vérifier le paiement pour le moment. Actualisez la page dans une minute."),
      );
      await loadStatus();
    })();
  }, [loadStatus]);

  // Sauvegarde en ligne des préparations modifiées ou supprimées (comptes enseignants), une fois la réponse terminée.
  useEffect(() => {
    const synced = syncedRef.current;
    if (status.mode !== "comptes" || !status.granted || busy || !synced) return;
    const t = setTimeout(() => {
      for (const c of conversations) {
        if (synced.get(c.id) === c.updatedAt) continue;
        synced.set(c.id, c.updatedAt);
        const retry = () => synced.delete(c.id);
        void fetch("/api/preparations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((r) => {
          if (!r.ok) retry();
        }, retry);
      }
      const ids = new Set(conversations.map((c) => c.id));
      for (const id of [...synced.keys()]) {
        if (ids.has(id)) continue;
        synced.delete(id);
        void fetch(`/api/preparations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [conversations, busy, status.mode, status.granted]);

  const current = useMemo(() => conversations.find((c) => c.id === currentId) ?? null, [conversations, currentId]);

  // Bouton « retour » du navigateur ou du téléphone : une préparation ouverte ajoute une entrée d'historique,
  // le retour ramène à l'accueil au lieu de quitter l'application.
  useEffect(() => {
    if (currentId && window.history.state?.conv !== currentId) window.history.pushState({ conv: currentId }, "");
  }, [currentId]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      abortRef.current?.abort();
      setCurrentId((e.state as { conv?: string } | null)?.conv ?? null);
      setSidebar(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [current?.messages.length, busy]);

  const updateContext = (patch: Partial<TeacherContext>) => {
    setContext((c) => {
      const next = { ...c, ...patch };
      store.saveContext(next);
      return next;
    });
  };

  const updateDocs = (next: TeacherDoc[]) => {
    setDocs(next);
    if (!store.saveDocs(next)) alert("Espace de stockage du navigateur insuffisant : ce document ne sera pas conservé après fermeture.");
  };

  const persist = (updater: (list: Conversation[]) => Conversation[]) => {
    setConversations((list) => {
      const next = updater(list);
      store.saveConversations(next);
      return next;
    });
  };

  async function send(text: string, ctxOverride?: TeacherContext, fresh?: { category: Category }) {
    const ctx = ctxOverride ?? context;
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setSidebar(false);
    // « fresh » : nouvelle préparation (ex. fiche lancée depuis le formulaire), même si une conversation est ouverte.
    let convId = fresh ? null : currentId;
    const userMsg: StoredMessage = { role: "user", content };
    const base = fresh ? [] : current?.messages ?? [];
    if (!convId) {
      convId = newId();
      const conv: Conversation = { id: convId, title: conversationTitle(content), category: fresh?.category ?? (pendingCategory && content.startsWith(pendingCategory.prefix) ? pendingCategory.category : classify(content)), updatedAt: Date.now(), messages: [userMsg] };
      setPendingCategory(null);
      persist((list) => [conv, ...list]);
      setCurrentId(convId);
    } else {
      persist((list) => list.map((c) => (c.id === convId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, userMsg] } : c)));
    }
    const id = convId;
    const history = [...base.filter((m) => !m.error), userMsg].map((m) => ({ role: m.role, content: m.content }));
    const setAssistant = (msg: StoredMessage) =>
      persist((list) =>
        list.map((c) => {
          if (c.id !== id) return c;
          const msgs = [...c.messages];
          if (msgs[msgs.length - 1]?.role === "assistant") msgs[msgs.length - 1] = msg;
          else msgs.push(msg);
          return { ...c, updatedAt: Date.now(), messages: msgs };
        }),
      );

    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    let sources: Source[] = [];
    let decision: DecisionSummary | undefined;
    let check: string[] | undefined;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history,
          context: ctx,
          documents: docs.filter((d) => d.enabled).map((d) => ({ id: d.id, title: d.title, type: d.type, text: d.text })),
        }),
      });
      if (res.status === 401) {
        setStatus((s) => ({ ...s, required: true, granted: false }));
        throw new Error("Votre accès a expiré : saisissez de nouveau le code d'accès.");
      }
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        // Session expirée ou abonnement terminé : l'écran de connexion ou d'abonnement reprend la main.
        if (status.mode === "comptes" && [401, 402, 403, 429].includes(res.status)) void loadStatus();
        throw new Error(j.error || "Le service n'a pas répondu.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastPaint = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; message?: string; sources?: Source[]; decision?: DecisionSummary; check?: string[] };
          if (ev.type === "meta") {
            sources = ev.sources ?? [];
            decision = ev.decision;
          }
          else if (ev.type === "delta") answer += ev.text ?? "";
          else if (ev.type === "done") check = ev.check;
          else if (ev.type === "error") throw new Error(ev.message);
        }
        if (Date.now() - lastPaint > 80) {
          lastPaint = Date.now();
          setAssistant({ role: "assistant", content: answer, sources, decision });
        }
      }
      setAssistant({ role: "assistant", content: answer, sources, decision, check });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setAssistant({ role: "assistant", content: answer ? `${answer}\n\n_(Production interrompue.)_` : "_(Production interrompue.)_", sources, decision });
      } else {
        setAssistant({ role: "assistant", content: `${answer ? `${answer}\n\n` : ""}**Erreur :** ${(e as Error).message}`, sources, decision, error: !answer });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  /** Retour à l'accueil : via l'historique quand la préparation y a été ajoutée, pour garder le bouton du navigateur cohérent. */
  function goHome() {
    if (window.history.state?.conv) window.history.back();
    else newConversation();
  }

  function newConversation() {
    if (busy) abortRef.current?.abort();
    setCurrentId(null);
    setInput("");
    setPendingCategory(null);
    setSidebar(false);
    inputRef.current?.focus();
  }

  /** Pré-remplit la zone de saisie et sélectionne le premier élément à compléter entre crochets. */
  function prefill(text: string) {
    setInput(text);
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const i = el.value.indexOf("[");
      if (i >= 0) el.setSelectionRange(i, el.value.indexOf("]", i) + 1);
    }, 0);
  }

  function applyTemplate(t: Template) {
    if (t.action === "fiche-form") {
      setFicheOpen(true);
      return;
    }
    if (t.action === "remed-form") {
      setRemedOpen(true);
      return;
    }
    if (t.action === "prog-form") {
      setProgOpen(true);
      return;
    }
    if (t.action === "eval-form") {
      setEvalOpen(t.evalType ?? "devoir surveillé");
      return;
    }
    const text = t.build(context);
    if (!currentId) setPendingCategory({ category: t.category, prefix: text.slice(0, Math.min(20, text.indexOf("[") >= 0 ? text.indexOf("[") : 20)) });
    prefill(text);
  }

  if (status.loading) {
    return <div className="flex min-h-dvh items-center justify-center text-muted">Chargement…</div>;
  }
  if (status.mode === "comptes" && status.etat) {
    if (!status.etat.compte || reinit)
      return (
        <AuthScreen
          initial={reinit ? "nouveau" : parrain || inscription ? "inscription" : "connexion"}
          notice={notice ?? undefined}
          parrain={parrain}
          onDone={() => {
            try {
              localStorage.removeItem(PARRAIN_KEY);
            } catch {
              // stockage indisponible
            }
            setReinit(false);
            setNotice(null);
            void loadStatus();
          }}
        />
      );
    if (!status.granted) return <AbonnementScreen etat={status.etat} onChange={loadStatus} message={notice} />;
  } else if (status.required && !status.granted) {
    return <AccessGate onGranted={loadStatus} />;
  }
  const compte = status.etat?.compte ?? null;

  const messages = current?.messages ?? [];
  const last = messages[messages.length - 1];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
        {currentId && (
          <button
            type="button"
            onClick={goHome}
            className="flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 py-1 text-sm font-semibold text-faso hover:border-faso"
            aria-label="Retour à l'accueil"
          >
            <IconeRetour className="h-4 w-4" /> <span className="hidden sm:inline">Accueil</span>
          </button>
        )}
        <Brand />
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {compte && (
            <button
              type="button"
              onClick={() => (setCompteOpen(true), void loadStatus())}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2 py-1.5 text-sm font-semibold text-faso-dark hover:border-faso sm:px-3"
              aria-label="Mon compte"
            >
              <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-faso-100 text-[11px] font-bold uppercase">
                {(compte.nom || compte.email).charAt(0)}
              </span>
              <span className="hidden md:inline">Mon compte</span>
            </button>
          )}
          <button type="button" onClick={newConversation} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-faso px-3 py-1.5 text-sm font-semibold text-white hover:bg-faso-dark">
            <IconePlus className="h-4 w-4" /> Nouvelle préparation
          </button>
        </div>
      </header>

      {notice && (
        <div className="flex items-start justify-between gap-3 border-b border-faso/30 bg-faso-50 px-4 py-2 text-sm text-faso-dark">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-muted" aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
      {compte?.essai && (
        <div className="border-b border-or/40 bg-or-50 px-4 py-2 text-sm">
          🎁 Essai gratuit : il vous reste <strong>{compte.heuresRestantes} h</strong>.{" "}
          <button type="button" onClick={() => (setCompteOpen(true), void loadStatus())} className="font-semibold text-faso underline underline-offset-2">
            S&apos;abonner
          </button>
        </div>
      )}
      {compte && !compte.essai && compte.role !== "admin" && compte.joursRestants > 0 && compte.joursRestants <= 5 && (
        <div className="border-b border-or/40 bg-or-50 px-4 py-2 text-sm">
          Votre abonnement se termine dans {compte.joursRestants} jour{compte.joursRestants > 1 ? "s" : ""}.{" "}
          <button type="button" onClick={() => (setCompteOpen(true), void loadStatus())} className="font-semibold text-faso underline underline-offset-2">
            Prolonger
          </button>
        </div>
      )}

      {compteOpen && status.etat?.compte && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="compte-titre" onClick={() => setCompteOpen(false)}>
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="compte-titre" className="text-lg font-bold text-faso-dark">
                Mon compte
              </h2>
              <button type="button" onClick={() => setCompteOpen(false)} className="text-muted hover:text-rouge" aria-label="Fermer">
                ✕
              </button>
            </div>
            <ComptePanel etat={status.etat} onChange={loadStatus} />
          </div>
        </div>
      )}

      {!status.configured && (
        <div className="border-b border-rouge/30 bg-rouge-50 px-4 py-2 text-sm text-rouge">
          L&apos;assistant n&apos;est pas encore configuré : l&apos;administrateur doit renseigner la clé <code>ANTHROPIC_API_KEY</code>.
        </div>
      )}

      {progOpen && (
        <ProgFormDialog
          context={context}
          onClose={() => setProgOpen(false)}
          onSubmit={(message, patch) => {
            const next = { ...context, ...patch };
            updateContext(patch);
            setProgOpen(false);
            setCurrentId(null);
            void send(message, next, { category: "progression" });
          }}
        />
      )}

      {remedOpen && (
        <RemedFormDialog
          context={context}
          onClose={() => setRemedOpen(false)}
          onSubmit={(message, patch) => {
            const next = { ...context, ...patch };
            updateContext(patch);
            setRemedOpen(false);
            setCurrentId(null);
            void send(message, next, { category: "remediation" });
          }}
        />
      )}

      {evalOpen && (
        <EvalFormDialog
          context={context}
          initialType={evalOpen}
          onClose={() => setEvalOpen(null)}
          onSubmit={(message, patch) => {
            const next = { ...context, ...patch };
            updateContext(patch);
            setEvalOpen(null);
            setCurrentId(null);
            void send(message, next, { category: /interrogation|evaluation|évaluation|composition|blanc/i.test(message.split("\n")[0]!) ? "evaluation" : "devoir" });
          }}
        />
      )}

      {ficheOpen && (
        <FicheFormDialog
          context={context}
          onClose={() => setFicheOpen(false)}
          onSubmit={(message, patch) => {
            const next = { ...context, ...patch };
            updateContext(patch);
            setFicheOpen(false);
            setCurrentId(null);
            void send(message, next, { category: "cours" });
          }}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          id="panneau"
          className={`${sidebar ? "fixed inset-x-0 top-[53px] bottom-[60px] z-20 block" : "hidden"} w-full overflow-y-auto border-r border-line bg-white lg:static lg:block lg:w-80 lg:shrink-0`}
        >
          <div className={vuePanneau === "preparations" ? "hidden lg:block" : ""}>
            <ContextPanel context={context} onChange={updateContext} />
          </div>
          <div className={vuePanneau === "classe" ? "hidden lg:block" : ""}>
          <HistoryPanel
            conversations={conversations}
            currentId={currentId}
            onOpen={(id) => {
              setCurrentId(id);
              setSidebar(false);
            }}
            onDelete={(id) => {
              if (!confirm("Supprimer cette conversation ?")) return;
              persist((list) => list.filter((c) => c.id !== id));
              if (id === currentId) setCurrentId(null);
            }}
          />
          </div>
          <div className={vuePanneau === "preparations" ? "hidden lg:block" : ""}>
            <ProfilePanel context={context} onChange={updateContext} />
            <DocumentsPanel
              library={status.library}
              history={status.history}
              pending={status.pending}
              docs={docs}
              onChange={updateDocs}
              context={context}
              admin={compte?.role === "admin"}
            />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.length === 0 ? (
                <Welcome
                  context={context}
                  onTemplate={applyTemplate}
                  onFiche={() => setFicheOpen(true)}
                  onEval={() => setEvalOpen("devoir surveillé")}
                  onRemed={() => setRemedOpen(true)}
                  onProg={() => setProgOpen(true)}
                  libraryCount={status.library.length}
                  prenom={prenomDe(context.enseignant || compte?.nom)}
                  derniere={conversations.reduce<Conversation | null>((a, c) => (!a || c.updatedAt > a.updatedAt ? c : a), null)}
                  onOpen={(id) => setCurrentId(id)}
                />
              ) : (
                <div className="space-y-5">
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="fade-in ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-faso px-4 py-2.5 text-[15px] text-white">
                        {m.content}
                      </div>
                    ) : (
                      <AssistantMessage key={i} message={m} streaming={busy && i === messages.length - 1} context={context} admin={compte?.role === "admin"} compte={compte} />
                    ),
                  )}
                  {busy && last?.role === "user" && (
                    <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted">
                      PÉDAGOGUE.IA prépare votre document…
                    </div>
                  )}
                  {!busy && last?.role === "assistant" && !last.error && last.decision?.missing?.includes("classe") && (
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-muted">Choisir la classe</div>
                      <div className="space-y-1.5">
                        {CYCLES.map((cy) => (
                          <div key={cy.code} className="flex flex-wrap items-center gap-1.5">
                            <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-muted sm:w-28">{cy.label}</span>
                            {cy.classes.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  updateContext({ classe: c });
                                  void send(`Classe : ${c}.`, { ...context, classe: c });
                                }}
                                className="rounded-full border border-faso bg-white px-3 py-1 text-sm font-semibold text-faso hover:bg-faso-50"
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!busy && last?.role === "assistant" && !last.error && !last.decision?.missing?.includes("classe") && last.decision?.missing?.includes("matiere") && (
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-muted">Choisir la matière</div>
                      <div className="flex flex-wrap gap-2">
                        {[...new Set([last.decision?.matiereSuggeree, ...disciplinesPour(context.classe ?? last.decision?.classe).slice(0, 10)].filter((x): x is string => !!x))].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              updateContext({ discipline: m });
                              void send(`Matière : ${m}.`, { ...context, discipline: m });
                            }}
                            className="rounded-full border border-faso bg-white px-3 py-1 text-sm text-faso hover:bg-faso-50"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!busy && last?.role === "assistant" && !last.error && !last.decision?.missing?.length && (
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-muted">{last.decision?.fiche ? "Commandes de la fiche" : last.decision?.module02 ? "Commandes de l'évaluation" : last.decision?.module03 ? "Commandes de la remédiation" : last.decision?.module04 ? "Commandes de la progression" : "Modifier cette production"}</div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const liste = last.decision?.fiche ? FICHE_COMMANDS : last.decision?.module02 ? EVAL_COMMANDS : last.decision?.module03 ? REMED_COMMANDS : last.decision?.module04 ? PROG_COMMANDS : MODIFICATIONS;
                          return commandesOuvertes ? liste : liste.slice(0, 4);
                        })().map((m) => (
                          <button
                            key={m.label}
                            type="button"
                            onClick={() => (m.prompt.includes("[") ? prefill(m.prompt) : void send(m.prompt))}
                            className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink hover:border-faso hover:text-faso"
                          >
                            {m.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCommandesOuvertes((v) => !v)}
                          className="rounded-full border border-dashed border-faso/50 px-3 py-1 text-xs font-semibold text-faso hover:bg-faso-50"
                        >
                          {commandesOuvertes ? "Moins" : "Plus d'actions…"}
                        </button>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>
          </div>

          <form
            className="border-t border-line bg-white px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <label htmlFor="demande" className="sr-only">
                Votre demande
              </label>
              <textarea
                id="demande"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={Math.min(8, Math.max(2, input.split("\n").length))}
                placeholder="Ex. : Prépare une séance de mathématiques de 6e sur les fractions pour 55 minutes."
                className="min-h-[52px] flex-1 resize-none rounded-xl border border-line px-3 py-2.5 text-[15px] focus:border-faso focus:outline-none"
              />
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="h-[52px] rounded-xl border border-rouge px-4 text-sm font-semibold text-rouge">
                  Arrêter
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Envoyer"
                  className="flex h-[52px] items-center gap-2 rounded-xl bg-faso px-4 text-sm font-semibold text-white disabled:opacity-40 sm:px-5"
                >
                  <IconeEnvoyer className="h-5 w-5" /> <span className="hidden sm:inline">Envoyer</span>
                </button>
              )}
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl truncate text-[11px] text-muted">Vérifiez et adaptez chaque contenu avant de l&apos;utiliser en classe.</p>
          </form>
        </main>
      </div>

      <nav className="grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigation principale">
        {(
          [
            ["Accueil", IconeAccueil, !sidebar && !currentId, () => (setSidebar(false), currentId ? goHome() : undefined)],
            ["Préparations", IconeDossier, sidebar && vuePanneau === "preparations", () => (setVuePanneau("preparations"), setSidebar((v) => !(v && vuePanneau === "preparations")))],
            ["Nouveau", IconePlus, false, newConversation],
            ["Ma classe", IconeClasse, sidebar && vuePanneau === "classe", () => (setVuePanneau("classe"), setSidebar((v) => !(v && vuePanneau === "classe")))],
            ["Compte", IconeCompte, compteOpen, () => (compte ? (setCompteOpen(true), void loadStatus()) : undefined)],
          ] as [string, (p: { className?: string }) => React.ReactNode, boolean, () => void][]
        ).map(([libelle, Icone, actif, action]) =>
          libelle === "Nouveau" ? (
            <button key={libelle} type="button" onClick={action} className="flex flex-col items-center justify-end gap-1 pb-2 pt-1 text-[11px] font-semibold text-faso">
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-faso text-white shadow-md ring-4 ring-white">
                <Icone className="h-6 w-6" />
              </span>
              {libelle}
            </button>
          ) : (
            <button
              key={libelle}
              type="button"
              onClick={action}
              disabled={libelle === "Compte" && !compte}
              aria-current={actif ? "page" : undefined}
              className={`flex flex-col items-center justify-end gap-1 pb-2 pt-1 text-[11px] font-medium disabled:opacity-30 ${actif ? "text-faso" : "text-muted"}`}
            >
              <Icone className="h-5 w-5" />
              {libelle}
            </button>
          ),
        )}
      </nav>
    </div>
  );
}

/** Prénom ou civilité pour l'accueil : « M. Issa Ouédraogo » → « M. Ouédraogo », « Awa Traoré » → « Awa ». */
function prenomDe(nom: string | null | undefined): string | null {
  const mots = (nom ?? "").trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return null;
  if (/^(m\.?|mme|mlle|monsieur|madame|dr)$/i.test(mots[0]!)) return mots.length > 1 ? `${mots[0]} ${mots[mots.length - 1]}` : null;
  return mots[0]!;
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={32} height={32} className="h-7 w-7 shrink-0 rounded-lg sm:h-8 sm:w-8" />
      <div className="leading-tight">
        <div className="whitespace-nowrap text-[13px] font-extrabold tracking-wide text-faso-dark sm:text-[15px]">PÉDAGOGUE.IA</div>
        <div className="hidden text-[11px] text-muted sm:block">L&apos;intelligence au service de la pédagogie</div>
      </div>
    </div>
  );
}

function AccessGate({ onGranted }: { onGranted: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const r = await fetch("/api/acces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setPending(false);
          if (r.ok) onGranted();
          else setError(j.error ?? "Code refusé.");
        }}
      >
        <Brand />
        <p className="mt-5 text-sm text-muted">Saisissez le code d&apos;accès communiqué par votre établissement ou par {CONTACT.entreprise}.</p>
        <label htmlFor="code" className="mt-4 block text-sm font-medium">
          Code d&apos;accès
        </label>
        <input
          id="code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line px-3 py-2 focus:border-faso focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-rouge">{error}</p>}
        <button type="submit" disabled={!code || pending} className="mt-4 w-full rounded-lg bg-faso py-2 font-semibold text-white disabled:opacity-50">
          {pending ? "Vérification…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}

function Welcome({
  context,
  onTemplate,
  onFiche,
  onEval,
  onRemed,
  onProg,
  libraryCount,
  prenom,
  derniere,
  onOpen,
}: {
  context: TeacherContext;
  onTemplate: (t: Template) => void;
  onFiche: () => void;
  onEval: () => void;
  onRemed: () => void;
  onProg: () => void;
  libraryCount: number;
  prenom: string | null;
  derniere: Conversation | null;
  onOpen: (id: string) => void;
}) {
  const [tous, setTous] = useState(false);
  const raccourcis = tous ? TEMPLATES : TEMPLATES.filter((t) => t.main);
  const generateurs: [string, string, (p: { className?: string }) => React.ReactNode, () => void][] = [
    ["Fiche pédagogique", "Déroulement minuté, trace écrite, évaluation", IconeFiche, onFiche],
    ["Devoir et évaluation", "Sujet, corrigé, barème, versions A/B/C", IconeDevoir, onEval],
    ["Remédiation", "Diagnostic et activités de soutien", IconeRemediation, onRemed],
    ["Progression", "Répartition par semaine et par chapitre", IconeProgression, onProg],
  ];
  const heure = new Date().getHours();
  const salut = heure >= 18 || heure < 4 ? "Bonsoir" : "Bonjour";
  return (
    <div className="fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-faso-dark">
            {salut}
            {prenom ? ` ${prenom}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-muted">Que préparez-vous aujourd&apos;hui ?</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustration-enseignante.svg"
          alt="Enseignante burkinabè préparant ses fiches"
          width={480}
          height={360}
          className="w-28 shrink-0 rounded-2xl border border-line sm:w-44"
        />
      </div>
      <BoutonInstaller className="mt-3" />

      {derniere && (
        <button
          type="button"
          onClick={() => onOpen(derniere.id)}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:border-faso"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-or-50 text-[#7a5a00]">
            <IconeReprendre />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Reprendre</span>
            <span className="block truncate font-semibold text-ink">{derniere.title}</span>
          </span>
          <span aria-hidden className="text-muted">
            ›
          </span>
        </button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {generateurs.map(([titre, detail, Icone, action]) => (
          <button
            key={titre}
            type="button"
            onClick={action}
            className="flex flex-col gap-2 rounded-xl border border-faso/25 bg-white p-3.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition hover:border-faso hover:shadow-sm sm:flex-row sm:items-start sm:gap-3 sm:p-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-faso-50 text-faso">
              <Icone className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[15px] font-bold leading-snug text-faso-dark">{titre}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Demandes rapides</div>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {raccourcis.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              onClick={() => onTemplate(t)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink hover:border-faso hover:text-faso"
            >
              <IconeModele id={t.id} className="h-4 w-4 text-faso" />
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTous((v) => !v)}
            className="shrink-0 rounded-full border border-dashed border-faso/50 px-3 py-1.5 text-sm font-semibold text-faso hover:bg-faso-50"
          >
            {tous ? "Moins" : `Plus (${TEMPLATES.length - TEMPLATES.filter((t) => t.main).length})`}
          </button>
        </div>
      </div>

      <p className="mt-5 text-sm text-muted">
        Indiquez votre classe, votre matière et votre besoin dans « Ma classe » ou directement dans votre message.
        {context.classe || context.discipline ? (
          <>
            {" "}
            Contexte actuel : <strong className="text-ink">{[context.classe, context.discipline, context.theme].filter(Boolean).join(" · ")}</strong>.
          </>
        ) : null}
      </p>

      <details className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-sm leading-6">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink">
          <IconeInfo className="h-4 w-4 text-faso" /> Comment lire les étiquettes des réponses ?
        </summary>
        <ul className="mt-2 space-y-1">
          <li>
            <span className="badge badge-source">SOURCE PÉDAGOGUE.IA</span> information issue d&apos;une ressource de la base, avec son renvoi <span className="cite">R1</span> ;
          </li>
          <li>
            <span className="badge badge-proposition">PROPOSITION PÉDAGOGUE.IA</span> production pédagogique de l&apos;IA, à partir des sources disponibles ;
          </li>
          <li>
            <span className="badge badge-general">CONNAISSANCE GÉNÉRALE</span> connaissance générale de l&apos;IA, pas de la base ;
          </li>
          <li>
            <span className="badge badge-verifier">À VÉRIFIER</span> information sans confirmation documentaire suffisante.
          </li>
        </ul>
        <p className="mt-2 text-muted">
          {libraryCount > 0
            ? `${libraryCount} ressource(s) dans la base documentaire. Ces étiquettes ne sont pas imprimées.`
            : "Les réponses sont des propositions à vérifier, jamais des prescriptions officielles. Ces étiquettes ne sont pas imprimées."}
        </p>
      </details>
    </div>
  );
}

/** Administration : publier une préparation dans la bibliothèque publique (/fiches). */
async function publierFiche(contenu: string, context: TeacherContext) {
  const titreParDefaut = (contenu.match(/^#{1,3}\s+(.+)$/m)?.[1] ?? context.theme ?? "").replace(/[*_`]/g, "").trim();
  const titre = window.prompt("Titre de la fiche publique (visible sur Google) :", titreParDefaut);
  if (!titre?.trim()) return;
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "fiche_publier", titre: titre.trim(), classe: context.classe || undefined, discipline: context.discipline || undefined, contenu }),
  }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string; message?: string };
  alert(r?.ok ? `Fiche publiée : ${j.message ?? ""}` : `Publication impossible : ${j.error ?? "erreur réseau"}`);
}

function AssistantMessage({
  message,
  streaming,
  context,
  admin = false,
  compte = null,
}: {
  message: StoredMessage;
  streaming: boolean;
  context: TeacherContext;
  admin?: boolean;
  compte?: Pick<CompteInfo, "nom" | "etablissement" | "ville"> | null;
}) {
  const fullRef = useRef<HTMLDivElement | null>(null);
  const partRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [copied, setCopied] = useState(false);
  const parts = useMemo(() => (streaming ? [] : splitDocuments(message.content)), [message.content, streaming]);
  const baseTitle = ["PÉDAGOGUE.IA", context.discipline, context.classe, context.theme].filter(Boolean).join(" — ");

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const exportPart = (kind: "print" | "word" | "pdf", key: string | null, label: string) => {
    const el = key ? partRefs.current[key] : fullRef.current;
    if (!el) return;
    const copieEleve = isStudentCopy(label); // le sujet distribué aux élèves ne porte ni mention PÉDAGOGUE.IA ni nom de l'enseignant
    // Copie élève : ni mention de la plateforme dans le pied de page, ni dans le titre (imprimé en en-tête par les navigateurs).
    const title = !copieEleve ? `${baseTitle} — ${label}` : [context.discipline, context.classe, label].filter(Boolean).join(" — ");
    const options: OptionsDocument = {
      pied: !copieEleve,
      copieEleve,
      intitule: key ? label : undefined,
      entete: {
        administration: context.administration,
        etablissement: context.etablissement || compte?.etablissement || undefined,
        ville: context.ville || compte?.ville || undefined,
        anneeScolaire: context.anneeScolaire,
        enseignant: context.enseignant || compte?.nom || undefined,
        discipline: context.discipline,
        classe: context.classe,
        duree: context.duree,
        theme: context.theme,
      },
    };
    if (kind === "print") printHtml(title, el.innerHTML, options);
    else if (kind === "word") downloadWord(title, el.innerHTML, options);
    else {
      setPdfBusy(label);
      downloadPdf(title, el.innerHTML, options)
        .catch((e) => (console.error("[pdf]", e), alert("Téléchargement PDF impossible sur cet appareil : utilisez « Imprimer » puis « Enregistrer en PDF ».")))
        .finally(() => setPdfBusy(null));
    }
  };

  return (
    <div className="fade-in rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:px-5">
      {message.decision && <DecisionBar d={message.decision} />}
      <div ref={fullRef} className={`prose-kibaru ${streaming ? "caret" : ""}`}>
        <Markdown text={message.content} sources={message.sources} />
      </div>
      {!streaming && message.check && <CheckBox check={message.check} />}

      {parts.length > 0 && (
        <div hidden>
          {parts.map((p) => (
            <div key={p.key} ref={(el) => void (partRefs.current[p.key] = el)}>
              <Markdown text={p.markdown} sources={message.sources} />
            </div>
          ))}
        </div>
      )}

      {!streaming && message.sources && message.sources.length > 0 && (
        <details className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer font-medium text-ink">Extraits consultés ({message.sources.length})</summary>
          <ul className="mt-1.5 space-y-0.5">
            {message.sources.map((s) => (
              <li key={s.label}>
                <span className="cite">{s.label}</span> {s.title}
                {s.documentId ? ` [${s.documentId}]` : ""}
                {s.version ? `, version ${s.version}` : ""}
                {s.year ? `, ${s.year}` : ""}
                {s.source ? ` — ${s.source}` : ""}
                {s.statut ? <span className={s.statut === "ACTIF" ? "text-faso-dark" : "text-rouge"}> · {STATUT_LABELS[s.statut as Statut] ?? s.statut}</span> : null} · {s.origin === "enseignant" ? "ma bibliothèque" : "base documentaire PÉDAGOGUE.IA"}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!streaming && !message.error && message.content && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3 text-xs">
          <ActionButton
            onClick={async () => {
              await navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copié" : "Copier"}
          </ActionButton>
          <ActionButton onClick={() => exportPart("pdf", null, "Document complet")}>{pdfBusy === "Document complet" ? "Préparation du PDF…" : "⬇ Télécharger PDF"}</ActionButton>
          <ActionButton onClick={() => exportPart("print", null, "Document complet")}>Imprimer</ActionButton>
          <ActionButton onClick={() => exportPart("word", null, "Document complet")}>Word</ActionButton>
          {admin && <ActionButton onClick={() => void publierFiche(message.content, context)}>🌍 Publier dans la bibliothèque</ActionButton>}
          {parts.map((p) => (
            <span key={p.key} className="contents">
              <ActionButton onClick={() => exportPart("pdf", p.key, p.title)}>{pdfBusy === p.title ? "Préparation…" : `⬇ PDF : ${p.title.toLowerCase()}`}</ActionButton>
              <ActionButton onClick={() => exportPart("print", p.key, p.title)}>Imprimer : {p.title.toLowerCase()}</ActionButton>
              <ActionButton onClick={() => exportPart("word", p.key, p.title)}>Word : {p.title.toLowerCase()}</ActionButton>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const CONFIDENCE_STYLE: Record<string, string> = {
  ELEVEE: "bg-faso-50 text-faso-dark ring-faso/30",
  MOYENNE: "bg-or-50 text-[#7a5a00] ring-or/50",
  FAIBLE: "bg-rouge-50 text-rouge ring-rouge/30",
  NON_CONFIRMEE: "bg-surface text-muted ring-line",
  AUCUNE: "bg-surface text-muted ring-line",
};

/** Résultat du moteur de décision pédagogique pour cette réponse. */
function DecisionBar({ d }: { d: DecisionSummary }) {
  const scope = [d.classe, d.matiere && `${d.matiere}${d.matiereDeduite ? " (déduite du thème)" : ""}`].filter(Boolean).join(" · ") || "périmètre non précisé";
  return (
    <details className={`mb-3 rounded-lg px-3 py-1.5 text-xs ring-1 ${CONFIDENCE_STYLE[d.confidence] ?? CONFIDENCE_STYLE.NON_CONFIRMEE}`}>
      <summary className="cursor-pointer">
        <span className="font-bold">Confiance documentaire : {d.label}</span>{" "}
        <span className="opacity-80">
          — {scope} · {d.actives} ressource(s) ACTIVE(S){d.pending?.length ? ` · ${d.pending.length} non encore intégrée(s)` : ""}
        </span>
      </summary>
      <div className="mt-1 space-y-0.5 text-ink">
        {d.besoins?.length ? <p>Besoin identifié : {d.besoins.join(" + ")}.</p> : null}
        <p>{d.explanation.charAt(0).toUpperCase() + d.explanation.slice(1)}.</p>
        {d.sources?.length ? (
          <ul className="list-disc pl-4">
            {d.sources.map((x) => (
              <li key={x.id}>
                {x.id} — {x.priorite}, {x.statut}
              </li>
            ))}
          </ul>
        ) : null}
        {d.pending?.length ? <p className="text-muted">Ressources du registre NON ENCORE INTÉGRÉES : {d.pending.join(", ")}.</p> : null}
      </div>
    </details>
  );
}

/** Contrôle final automatique : points à relire signalés après la génération. */
function CheckBox({ check }: { check: string[] }) {
  if (!check.length)
    return (
      <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-faso-50 px-3 py-2 text-xs font-semibold text-faso-dark ring-1 ring-faso/20">
        <IconeCorrige className="h-4 w-4" /> Vérifications automatiques réussies : durées, points, sources et étiquettes.
      </p>
    );
  return (
    <div className="mt-3 rounded-lg bg-or-50 px-3 py-2 text-xs text-[#6b4f00] ring-1 ring-or/50">
      <div className="font-bold">
        À relire avant utilisation — {check.length} point{check.length > 1 ? "s" : ""}
      </div>
      <ul className="mt-1 list-disc pl-4">
        {check.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

function StatutBadge({ statut }: { statut: Statut }) {
  const cls = statut === "ACTIF" ? "badge-source" : statut === "PROVISOIRE" ? "badge-proposition" : statut === "A_VERIFIER" ? "badge-verifier" : "badge-general";
  return <span className={`badge ${cls} !text-[9px]`}>{STATUT_LABELS[statut]}</span>;
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md border border-line px-2.5 py-1 font-medium text-ink hover:border-faso hover:text-faso">
      {children}
    </button>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="border-b border-line px-4 py-3">
      <summary className="cursor-pointer text-sm font-bold text-faso-dark">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const inputCls = "mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";

function ContextPanel({ context, onChange }: { context: TeacherContext; onChange: (p: Partial<TeacherContext>) => void }) {
  return (
    <Section title="Ma classe">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-muted">
          Classe
          <select value={context.classe ?? ""} onChange={(e) => onChange({ classe: e.target.value || undefined })} className={inputCls}>
            <option value="">—</option>
            <OptionsClasses />
          </select>
        </label>
        <label className="text-xs font-medium text-muted">
          Durée
          <input value={context.duree ?? ""} onChange={(e) => onChange({ duree: e.target.value })} placeholder="55 minutes" className={inputCls} />
        </label>
      </div>
      <label className="mt-2 block text-xs font-medium text-muted">
        Discipline
        <input list="disciplines" value={context.discipline ?? ""} onChange={(e) => onChange({ discipline: e.target.value })} placeholder="Mathématiques" className={inputCls} />
        <datalist id="disciplines">
          {disciplinesPour(context.classe).map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      <label className="mt-2 block text-xs font-medium text-muted">
        Thème ou chapitre
        <input value={context.theme ?? ""} onChange={(e) => onChange({ theme: e.target.value })} placeholder="Les fractions" className={inputCls} />
      </label>
      <label className="mt-2 block text-xs font-medium text-muted">
        Niveau et difficultés de la classe
        <textarea
          value={context.niveau ?? ""}
          onChange={(e) => onChange({ niveau: e.target.value })}
          rows={2}
          placeholder="Classe hétérogène, difficultés en calcul mental…"
          className={`${inputCls} resize-y`}
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-muted">
          Effectif
          <input value={context.effectif ?? ""} onChange={(e) => onChange({ effectif: e.target.value })} placeholder="85 élèves" className={inputCls} />
        </label>
        <label className="text-xs font-medium text-muted">
          Type de séance
          <select value={context.typeSeance ?? ""} onChange={(e) => onChange({ typeSeance: e.target.value || undefined })} className={inputCls}>
            <option value="">—</option>
            {TYPES_SEANCE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">Ces informations accompagnent chacune de vos demandes. Elles restent enregistrées sur cet appareil.</p>
    </Section>
  );
}

function DocumentsPanel({
  library,
  history,
  pending,
  docs,
  onChange,
  context,
  admin = false,
}: {
  library: LibraryDoc[];
  history: LibraryDoc[];
  pending: PendingDoc[];
  docs: TeacherDoc[];
  onChange: (d: TeacherDoc[]) => void;
  context: TeacherContext;
  admin?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: TeacherDoc[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await fetch("/api/extract", { method: "POST", body: fd });
        const j = (await r.json()) as { text?: string; error?: string; truncated?: boolean };
        if (!r.ok || !j.text) throw new Error(j.error ?? "Lecture impossible.");
        added.push({ id: newId(), title: file.name.replace(/\.(pdf|docx|txt|md)$/i, ""), type: "document de l'enseignant", text: j.text, enabled: true, addedAt: Date.now() });
        if (j.truncated) setError(`« ${file.name} » est très long : seul le début a été conservé.`);
      } catch (e) {
        setError(`« ${file.name} » : ${(e as Error).message}`);
      }
    }
    if (added.length) onChange([...docs, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const matching = library.filter(
    (d) =>
      (!context.classe || d.classes.length === 0 || d.classes.includes(context.classe)) &&
      (!context.discipline || d.disciplines.length === 0 || d.disciplines.some((x) => x.toLowerCase().includes(context.discipline!.toLowerCase()) || context.discipline!.toLowerCase().includes(x.toLowerCase()))),
  );

  return (
    <Section title="Documents" defaultOpen={false}>
      {/* Base documentaire : visible par l'enseignant dès qu'elle contient des ressources ; le registre technique reste réservé à l'administration. */}
      {(admin || library.length > 0) && (
      <div className="mb-4 text-xs text-muted">
        <div className="font-semibold text-ink">Base documentaire PÉDAGOGUE.IA ({library.length})</div>
        {library.length === 0 ? (
          <p className="mt-1">Aucune ressource consultable n&apos;est encore intégrée.</p>
        ) : (
          <>
            {(context.classe || context.discipline) && <p className="mt-1">{matching.length} applicable(s) à votre classe et discipline.</p>}
            <div className="mt-1 max-h-72 space-y-2 overflow-y-auto">
              {[...new Set(library.map((d) => d.categoryLabel))].map((cat) => (
                <div key={cat}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</div>
                  <ul className="mt-0.5 space-y-1.5">
                    {library
                      .filter((d) => d.categoryLabel === cat)
                      .map((d) => (
                        <li key={d.id} className={matching.includes(d) ? "text-ink" : "opacity-50"} title={[d.notice, d.note].filter(Boolean).join("\n") || undefined}>
                          <div>
                            {d.statut && <StatutBadge statut={d.statut} />} {d.title}
                          </div>
                          <div className="text-[11px] text-muted">
                            {[d.documentId, typeLabel(d.type), d.year, d.version && `version ${d.version}`, d.sourceLevel && `source niveau ${d.sourceLevel}`].filter(Boolean).join(" · ")}
                          </div>
                          {d.note && <div className="text-[11px] text-rouge">{d.note}</div>}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
        {admin && pending.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer">Registre : {pending.length} ressource(s) NON ENCORE INTÉGRÉE(S)</summary>
            <ul className="mt-1 space-y-1">
              {pending.map((d) => (
                <li key={d.path}>
                  <span className="font-mono text-[10px]">{d.documentId}</span> {d.title}
                  <span className="text-muted"> · {STATUT_LABELS[d.statut]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {admin && history.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer">Historique des versions ({history.length}) — non consultées</summary>
            <ul className="mt-1 space-y-1">
              {history.map((d) => (
                <li key={d.id}>
                  {d.title}
                  {d.version ? ` (version ${d.version})` : ""} — <span className="italic">{d.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      )}

      <div className="text-xs">
        <div className="font-semibold text-ink">Ma bibliothèque ({docs.length})</div>
        <p className="mt-1 text-muted">
          Ajoutez vos propres documents (programme, cours, sujets en PDF, Word ou texte) : PÉDAGOGUE.IA s&apos;en servira pour vos préparations. Ils restent sur cet
          appareil.
        </p>
        <ul className="mt-2 space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={() => onChange(docs.map((x) => (x.id === d.id ? { ...x, enabled: !x.enabled } : x)))}
                aria-label={`Utiliser ${d.title}`}
                className="accent-faso"
              />
              <span className="min-w-0 flex-1 truncate" title={d.title}>
                {d.title}
              </span>
              <span className="text-muted">{Math.max(1, Math.round(d.text.length / 1000))} k</span>
              <button
                type="button"
                onClick={() => confirm(`Retirer « ${d.title} » ?`) && onChange(docs.filter((x) => x.id !== d.id))}
                className="text-rouge hover:underline"
                aria-label={`Retirer ${d.title}`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" multiple hidden onChange={(e) => void upload(e.target.files)} />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="mt-2 w-full rounded-lg border border-dashed border-faso py-2 font-semibold text-faso hover:bg-faso-50 disabled:opacity-50"
        >
          {uploading ? "Lecture en cours…" : "Ajouter un document"}
        </button>
        {error && <p className="mt-2 text-rouge">{error}</p>}
      </div>
    </Section>
  );
}

/** Profil de l'enseignant (Module 01, section 5) : personnalisation uniquement, conservé sur cet appareil. */
function ProfilePanel({ context, onChange }: { context: TeacherContext; onChange: (p: Partial<TeacherContext>) => void }) {
  return (
    <Section title="Mon profil" defaultOpen={false}>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs font-medium text-muted">
          Nom de l&apos;enseignant
          <input value={context.enseignant ?? ""} onChange={(e) => onChange({ enseignant: e.target.value })} placeholder="M. / Mme …" className={inputCls} />
        </label>
        <label className="col-span-2 text-xs font-medium text-muted">
          En-tête administratif (facultatif)
          <input
            value={context.administration ?? ""}
            onChange={(e) => onChange({ administration: e.target.value })}
            placeholder="Ministère… / Direction régionale…"
            className={inputCls}
          />
        </label>
        <label className="col-span-2 text-xs font-medium text-muted">
          Établissement
          <input value={context.etablissement ?? ""} onChange={(e) => onChange({ etablissement: e.target.value })} placeholder="Lycée…" className={inputCls} />
        </label>
        <label className="text-xs font-medium text-muted">
          Ville
          <input value={context.ville ?? ""} onChange={(e) => onChange({ ville: e.target.value })} placeholder="Tenkodogo" className={inputCls} />
        </label>
        <label className="text-xs font-medium text-muted">
          Année scolaire
          <input value={context.anneeScolaire ?? ""} onChange={(e) => onChange({ anneeScolaire: e.target.value })} placeholder="2026-2027" className={inputCls} />
        </label>
        <label className="col-span-2 text-xs font-medium text-muted">
          Préférences pédagogiques
          <textarea
            value={context.preferences ?? ""}
            onChange={(e) => onChange({ preferences: e.target.value })}
            rows={2}
            placeholder="Travail en groupes, beaucoup d'exemples concrets…"
            className={`${inputCls} resize-y`}
          />
        </label>
        <label className="col-span-2 text-xs font-medium text-muted">
          Format habituel des fiches
          <select value={context.mode ?? "standard"} onChange={(e) => onChange({ mode: e.target.value })} className={inputCls}>
            <option value="standard">Standard (fiche complète)</option>
            <option value="expert">Expert (plus de détails)</option>
            <option value="rapide">Rapide (l&apos;essentiel)</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Ces informations remplissent l&apos;en-tête des documents imprimés (établissement, enseignant, année scolaire) sans modifier les exigences officielles. Elles
        restent sur cet appareil.
      </p>
    </Section>
  );
}

/** Date courte d'une préparation : « aujourd'hui », « hier », « 12 sept. ». */
function dateCourte(t: number): string {
  const d = new Date(t);
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(new Date()) - jour(d)) / 86_400_000);
  if (ecart === 0) return "aujourd'hui";
  if (ecart === 1) return "hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

function HistoryPanel({ conversations, currentId, onOpen, onDelete }: { conversations: Conversation[]; currentId: string | null; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState<Category | "tout">("tout");
  const [recherche, setRecherche] = useState("");
  const counts = new Map<Category, number>();
  for (const c of conversations) {
    const k = c.category ?? classify(c.title);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const q = recherche
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const shown = [...conversations]
    .filter((c) => filter === "tout" || (c.category ?? classify(c.title)) === filter)
    .filter((c) => !q || c.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${active ? "border-faso bg-faso text-white" : "border-line text-ink hover:border-faso"}`;
  return (
    <Section title={`Mes préparations (${conversations.length})`}>
      {conversations.length === 0 ? (
        <p className="text-xs text-muted">Vos fiches, devoirs, corrigés, évaluations et progressions apparaîtront ici.</p>
      ) : (
        <>
          {conversations.length > 4 && (
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher (ex. digestion, 3e, Thalès)"
              aria-label="Rechercher dans mes préparations"
              className={`${inputCls} mb-2`}
            />
          )}
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
            <button type="button" className={chip(filter === "tout")} onClick={() => setFilter("tout")}>
              Tout ({conversations.length})
            </button>
            {(Object.keys(CATEGORIES) as Category[])
              .filter((k) => counts.get(k))
              .map((k) => (
                <button key={k} type="button" className={chip(filter === k)} onClick={() => setFilter(k)}>
                  {CATEGORIES[k]} ({counts.get(k)})
                </button>
              ))}
          </div>
          <ul className="space-y-0.5">
            {shown.map((c) => (
              <li key={c.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${c.id === currentId ? "bg-faso-50" : "hover:bg-surface"}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-faso-50 text-faso">
                  <IconeModele id={(c.category ?? classify(c.title)) === "cours" ? "lecon" : (c.category ?? classify(c.title))} className="h-4 w-4" />
                </span>
                <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left" title={c.title}>
                  <span className="block truncate">{c.title}</span>
                  <span className="block text-[11px] text-muted">{dateCourte(c.updatedAt)}</span>
                </button>
                <button type="button" onClick={() => onDelete(c.id)} className="px-1 text-xs text-muted hover:text-rouge" aria-label={`Supprimer ${c.title}`}>
                  ✕
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-2 text-xs text-muted">Aucune préparation ne correspond.</li>}
          </ul>
        </>
      )}
    </Section>
  );
}
