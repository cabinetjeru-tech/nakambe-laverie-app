"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeacherContext } from "@/lib/conversation";
import { conversationTitle, splitDocuments } from "@/lib/documents";
import { downloadWord, printHtml } from "@/lib/export";
import { CLASSES } from "@/lib/search";
import { newId, store, type Conversation, type Source, type StoredMessage, type TeacherDoc } from "@/lib/store";
import { DISCIPLINES, TEMPLATES } from "@/lib/templates";
import { Markdown } from "./markdown";

type LibraryDoc = { id: string; title: string; type: string; classes: string[]; disciplines: string[]; source: string | null; status: string | null; notice: string | null };
type Status = { loading: boolean; required: boolean; granted: boolean; configured: boolean; library: LibraryDoc[] };

const FOLLOW_UPS = [
  "Adapte cette production pour une classe faible.",
  "Prépare une version pour les élèves avancés.",
  "Ajoute un barème détaillé.",
  "Rends-la plus courte et plus directe.",
  "Continue.",
];

export function KibaruApp() {
  const [status, setStatus] = useState<Status>({ loading: true, required: false, granted: false, configured: true, library: [] });
  const [context, setContext] = useState<TeacherContext>({});
  const [docs, setDocs] = useState<TeacherDoc[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const a = (await (await fetch("/api/acces")).json()) as { required: boolean; granted: boolean };
      if (a.required && !a.granted) {
        setStatus({ loading: false, required: true, granted: false, configured: true, library: [] });
        return;
      }
      const r = await fetch("/api/referentiels");
      const j = (await r.json()) as { configured: boolean; documents: LibraryDoc[] };
      setStatus({ loading: false, required: a.required, granted: true, configured: j.configured, library: j.documents ?? [] });
    } catch {
      setStatus((s) => ({ ...s, loading: false, granted: true }));
    }
  }, []);

  useEffect(() => {
    setContext(store.context());
    setDocs(store.docs());
    setConversations(store.conversations());
    void loadStatus();
  }, [loadStatus]);

  const current = useMemo(() => conversations.find((c) => c.id === currentId) ?? null, [conversations, currentId]);

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

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setSidebar(false);
    let convId = currentId;
    const userMsg: StoredMessage = { role: "user", content };
    const base = current?.messages ?? [];
    if (!convId) {
      convId = newId();
      const conv: Conversation = { id: convId, title: conversationTitle(content), updatedAt: Date.now(), messages: [userMsg] };
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
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history,
          context,
          documents: docs.filter((d) => d.enabled).map((d) => ({ id: d.id, title: d.title, type: d.type, text: d.text })),
        }),
      });
      if (res.status === 401) {
        setStatus((s) => ({ ...s, required: true, granted: false }));
        throw new Error("Votre accès a expiré : saisissez de nouveau le code d'accès.");
      }
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
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
          const ev = JSON.parse(line) as { type: string; text?: string; message?: string; sources?: Source[] };
          if (ev.type === "meta") sources = ev.sources ?? [];
          else if (ev.type === "delta") answer += ev.text ?? "";
          else if (ev.type === "error") throw new Error(ev.message);
        }
        if (Date.now() - lastPaint > 80) {
          lastPaint = Date.now();
          setAssistant({ role: "assistant", content: answer, sources });
        }
      }
      setAssistant({ role: "assistant", content: answer, sources });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setAssistant({ role: "assistant", content: answer ? `${answer}\n\n_(Production interrompue.)_` : "_(Production interrompue.)_", sources });
      } else {
        setAssistant({ role: "assistant", content: `${answer ? `${answer}\n\n` : ""}**Erreur :** ${(e as Error).message}`, sources, error: !answer });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function newConversation() {
    if (busy) abortRef.current?.abort();
    setCurrentId(null);
    setInput("");
    setSidebar(false);
    inputRef.current?.focus();
  }

  function applyTemplate(build: (c: TeacherContext) => string) {
    setInput(build(context));
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const i = el.value.indexOf("[");
      if (i >= 0) el.setSelectionRange(i, el.value.indexOf("]", i) + 1);
    }, 0);
  }

  if (status.loading) {
    return <div className="flex min-h-dvh items-center justify-center text-muted">Chargement…</div>;
  }
  if (status.required && !status.granted) {
    return <AccessGate onGranted={loadStatus} />;
  }

  const messages = current?.messages ?? [];
  const last = messages[messages.length - 1];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <button
          type="button"
          className="whitespace-nowrap rounded-md border border-line px-2 py-1 text-sm lg:hidden"
          onClick={() => setSidebar((s) => !s)}
          aria-expanded={sidebar}
          aria-controls="panneau"
        >
          Ma classe
        </button>
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={newConversation} className="whitespace-nowrap rounded-lg bg-faso px-3 py-1.5 text-sm font-semibold text-white hover:bg-faso-dark">
            <span className="sm:hidden">Nouveau</span>
            <span className="hidden sm:inline">Nouvelle préparation</span>
          </button>
        </div>
      </header>

      {!status.configured && (
        <div className="border-b border-rouge/30 bg-rouge-50 px-4 py-2 text-sm text-rouge">
          L&apos;assistant n&apos;est pas encore configuré : l&apos;administrateur doit renseigner la clé <code>ANTHROPIC_API_KEY</code>.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          id="panneau"
          className={`${sidebar ? "fixed inset-x-0 top-[53px] bottom-0 z-20 block" : "hidden"} w-full overflow-y-auto border-r border-line bg-white lg:static lg:block lg:w-80 lg:shrink-0`}
        >
          <ContextPanel context={context} onChange={updateContext} />
          <DocumentsPanel library={status.library} docs={docs} onChange={updateDocs} context={context} />
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
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.length === 0 ? (
                <Welcome context={context} onTemplate={applyTemplate} libraryCount={status.library.length} />
              ) : (
                <div className="space-y-5">
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="fade-in ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-faso px-4 py-2.5 text-[15px] text-white">
                        {m.content}
                      </div>
                    ) : (
                      <AssistantMessage key={i} message={m} streaming={busy && i === messages.length - 1} context={context} />
                    ),
                  )}
                  {busy && last?.role === "user" && (
                    <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted">
                      KIBARU FASO prépare votre document…
                    </div>
                  )}
                  {!busy && last?.role === "assistant" && !last.error && (
                    <div className="flex flex-wrap gap-2">
                      {FOLLOW_UPS.map((f) => (
                        <button key={f} type="button" onClick={() => void send(f)} className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink hover:border-faso hover:text-faso">
                          {f.replace(/\.$/, "")}
                        </button>
                      ))}
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
                <button type="submit" disabled={!input.trim()} className="h-[52px] rounded-xl bg-faso px-5 text-sm font-semibold text-white disabled:opacity-40">
                  Envoyer
                </button>
              )}
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-muted">
              KIBARU FASO est un assistant : vérifiez, adaptez et validez chaque contenu avant de l&apos;utiliser en classe.
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" />
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold tracking-wide text-faso-dark">KIBARU FASO</div>
        <div className="hidden text-[11px] text-muted sm:block">L&apos;intelligence pédagogique au service de l&apos;enseignant</div>
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
        <p className="mt-5 text-sm text-muted">Saisissez le code d&apos;accès communiqué par votre établissement ou par l&apos;administrateur de KIBARU FASO.</p>
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

function Welcome({ context, onTemplate, libraryCount }: { context: TeacherContext; onTemplate: (b: (c: TeacherContext) => string) => void; libraryCount: number }) {
  return (
    <div className="fade-in">
      <h1 className="text-2xl font-bold text-faso-dark">Bonjour, que préparons-nous aujourd&apos;hui ?</h1>
      <p className="mt-2 text-[15px] text-muted">
        Renseignez votre classe dans le panneau « Ma classe », choisissez une action ou écrivez directement votre demande.
        {context.classe || context.discipline ? (
          <>
            {" "}
            Contexte actuel : <strong className="text-ink">{[context.classe, context.discipline, context.theme].filter(Boolean).join(" · ")}</strong>.
          </>
        ) : null}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTemplate(t.build)}
            className="rounded-xl border border-line bg-white p-3.5 text-left transition hover:border-faso hover:shadow-sm"
          >
            <div className="font-semibold text-faso-dark">{t.label}</div>
            <div className="mt-0.5 text-xs text-muted">{t.hint}</div>
          </button>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-line bg-white p-4 text-sm leading-6">
        <div className="font-semibold">Transparence des contenus</div>
        <p className="mt-1 text-muted">Chaque production distingue :</p>
        <ul className="mt-1 space-y-1">
          <li>
            <span className="badge badge-source">SOURCE</span> information retrouvée dans les documents de référence, avec son renvoi <span className="cite">R1</span> ;
          </li>
          <li>
            <span className="badge badge-proposition">PROPOSITION KIBARU</span> contenu pédagogique proposé par l&apos;intelligence artificielle ;
          </li>
          <li>
            <span className="badge badge-verifier">À VÉRIFIER</span> information dont le caractère officiel n&apos;a pas pu être confirmé.
          </li>
        </ul>
        <p className="mt-2 text-muted">
          {libraryCount > 0
            ? `${libraryCount} document(s) de référence disponible(s) dans la bibliothèque.`
            : "Aucun document de référence n'est encore chargé dans la bibliothèque : ajoutez vos programmes et guides dans « Documents de référence » pour que KIBARU FASO s'appuie dessus."}
        </p>
      </div>
    </div>
  );
}

function AssistantMessage({ message, streaming, context }: { message: StoredMessage; streaming: boolean; context: TeacherContext }) {
  const fullRef = useRef<HTMLDivElement | null>(null);
  const partRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [copied, setCopied] = useState(false);
  const parts = useMemo(() => (streaming ? [] : splitDocuments(message.content)), [message.content, streaming]);
  const baseTitle = ["KIBARU FASO", context.discipline, context.classe, context.theme].filter(Boolean).join(" — ");

  const exportPart = (kind: "print" | "word", key: string | null, label: string) => {
    const el = key ? partRefs.current[key] : fullRef.current;
    if (!el) return;
    const withFooter = key !== "doc1"; // le sujet distribué aux élèves ne porte pas de mention KIBARU
    const title = `${baseTitle} — ${label}`;
    if (kind === "print") printHtml(title, el.innerHTML, withFooter);
    else downloadWord(title, el.innerHTML, withFooter);
  };

  return (
    <div className="fade-in rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:px-5">
      <div ref={fullRef} className={`prose-kibaru ${streaming ? "caret" : ""}`}>
        <Markdown text={message.content} sources={message.sources} />
      </div>

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
                {s.source ? ` — ${s.source}` : ""}
                {s.status ? <span className="text-rouge"> · {s.status}</span> : null} · {s.origin === "enseignant" ? "document de l'enseignant" : "bibliothèque de référence"}
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
          <ActionButton onClick={() => exportPart("print", null, "Document complet")}>Imprimer</ActionButton>
          <ActionButton onClick={() => exportPart("word", null, "Document complet")}>Word</ActionButton>
          {parts.map((p) => (
            <span key={p.key} className="contents">
              <ActionButton onClick={() => exportPart("print", p.key, p.title)}>Imprimer : {p.title.toLowerCase()}</ActionButton>
              <ActionButton onClick={() => exportPart("word", p.key, p.title)}>Word : {p.title.toLowerCase()}</ActionButton>
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
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
          {DISCIPLINES.map((d) => (
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
          Établissement
          <input value={context.etablissement ?? ""} onChange={(e) => onChange({ etablissement: e.target.value })} placeholder="Lycée…" className={inputCls} />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">Ces informations accompagnent chacune de vos demandes. Elles restent enregistrées sur cet appareil.</p>
    </Section>
  );
}

function DocumentsPanel({ library, docs, onChange, context }: { library: LibraryDoc[]; docs: TeacherDoc[]; onChange: (d: TeacherDoc[]) => void; context: TeacherContext }) {
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
    <Section title="Documents de référence">
      <div className="text-xs text-muted">
        <div className="font-semibold text-ink">Bibliothèque ({library.length})</div>
        {library.length === 0 ? (
          <p className="mt-1">Aucun document officiel n&apos;est encore chargé par l&apos;administrateur.</p>
        ) : (
          <>
            {(context.classe || context.discipline) && <p className="mt-1">{matching.length} applicable(s) à votre classe et discipline.</p>}
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
              {library.map((d) => (
                <li key={d.id} className={matching.includes(d) ? "text-ink" : "opacity-50"} title={d.notice ?? undefined}>
                  {d.title} <span className="text-muted">· {d.type}</span>
                  {d.status && <div className="text-[11px] text-rouge">{d.status}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="mt-4 text-xs">
        <div className="font-semibold text-ink">Mes documents ({docs.length})</div>
        <p className="mt-1 text-muted">Programmes, guides, fiches… (PDF, Word, texte). Le texte est lu puis conservé sur cet appareil uniquement.</p>
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

function HistoryPanel({ conversations, currentId, onOpen, onDelete }: { conversations: Conversation[]; currentId: string | null; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <Section title={`Mes préparations (${conversations.length})`}>
      {conversations.length === 0 ? (
        <p className="text-xs text-muted">Vos préparations apparaîtront ici (enregistrées sur cet appareil).</p>
      ) : (
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${c.id === currentId ? "bg-faso-50" : "hover:bg-surface"}`}>
              <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 truncate text-left" title={c.title}>
                {c.title}
              </button>
              <button type="button" onClick={() => onDelete(c.id)} className="text-xs text-muted hover:text-rouge" aria-label="Supprimer">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
