"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { BookOpen, FileText, ImagePlus, Loader2, Mic, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";

export type TutorCitation = {
  n: number;
  courseTitle: string;
  documentTitle: string;
  lessonId: string | null;
  lessonTitle: string | null;
  heading: string | null;
  page: number | null;
};
export type TutorMsg = { id?: string; role: "user" | "assistant"; content: string; citations?: TutorCitation[]; attachmentName?: string };
export type TutorCapabilities = { chat: boolean; voiceServer: boolean; vision: boolean };

const MODES: { id: string; label: string }[] = [
  { id: "explain", label: "Explique autrement" },
  { id: "simplify", label: "Plus simple" },
  { id: "examples", label: "Exemples concrets" },
  { id: "exercise", label: "Exercice pratique" },
  { id: "quiz", label: "Interroge-moi" },
  { id: "gaps", label: "Mes lacunes" },
  { id: "remediation", label: "Remédiation" },
  { id: "path", label: "Mon parcours" },
];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getBrowserRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function stripForSpeech(md: string) {
  return md
    .replace(/\[S\d+\]/g, "")
    .replace(/[#*_`>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .slice(0, 3800);
}

export function TutorChat({
  tutorName,
  capabilities,
  courseId,
  lessonId,
  initialConversationId,
  initialMessages = [],
  compact = false,
  onConversation,
  placeholder,
}: {
  tutorName: string;
  capabilities: TutorCapabilities;
  courseId?: string | null;
  lessonId?: string | null;
  initialConversationId?: string | null;
  initialMessages?: TutorMsg[];
  compact?: boolean;
  onConversation?: (id: string) => void;
  placeholder?: string;
}) {
  const [messages, setMessages] = useState<TutorMsg[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [oral, setOral] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [browserVoice, setBrowserVoice] = useState({ stt: false, tts: false });
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    setBrowserVoice({ stt: !!getBrowserRecognition(), tts: typeof window !== "undefined" && "speechSynthesis" in window });
  }, []);

  useEffect(() => {
    setMessages(initialMessages);
    setConversationId(initialConversationId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const canSpeak = capabilities.voiceServer || browserVoice.tts;
  const canListen = capabilities.voiceServer || browserVoice.stt;

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingIdx(null);
  }, []);

  const speak = useCallback(
    async (text: string, idx: number) => {
      stopSpeaking();
      const clean = stripForSpeech(text);
      if (!clean.trim()) return;
      setSpeakingIdx(idx);
      if (capabilities.voiceServer) {
        try {
          const res = await fetch("/api/tutor/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Synthèse vocale indisponible");
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => setSpeakingIdx(null);
          await audio.play();
          return;
        } catch (e) {
          if (!browserVoice.tts) {
            setError((e as Error).message);
            setSpeakingIdx(null);
            return;
          }
        }
      }
      if (browserVoice.tts) {
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = "fr-FR";
        const fr = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
        if (fr) u.voice = fr;
        u.onend = () => setSpeakingIdx(null);
        window.speechSynthesis.speak(u);
      }
    },
    [capabilities.voiceServer, browserVoice.tts, stopSpeaking],
  );

  async function send(text: string, mode = oral ? "oral" : "free") {
    const content = text.trim();
    if ((!content && !file) || busy) return;
    setError(null);
    setBusy(true);
    const userMsg: TutorMsg = { role: "user", content: content || "(pièce jointe)", attachmentName: file?.name };
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    const fd = new FormData();
    fd.set("message", content);
    fd.set("mode", mode);
    if (courseId) fd.set("courseId", courseId);
    if (lessonId) fd.set("lessonId", lessonId);
    if (conversationId) fd.set("conversationId", conversationId);
    if (file) fd.set("file", file);
    setFile(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let answer = "";
    let newConversationId: string | null = null;
    try {
      const res = await fetch("/api/tutor/chat", { method: "POST", body: fd, signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Le tuteur est momentanément indisponible.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let citations: TutorCitation[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; conversationId?: string; citations?: TutorCitation[]; message?: string; messageId?: string };
          if (ev.type === "meta") {
            if (ev.conversationId) {
              newConversationId = ev.conversationId;
              setConversationId(ev.conversationId);
              onConversation?.(ev.conversationId);
            }
            citations = ev.citations ?? [];
          } else if (ev.type === "delta" && ev.text) {
            answer += ev.text;
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: answer, citations };
              return copy;
            });
          } else if (ev.type === "error") {
            throw new Error(ev.message || "Erreur du tuteur.");
          }
        }
      }
      if (oral && answer) speak(answer, messages.length + 1);
      // Nouvelle discussion en plein écran : on l'ouvre dans l'historique.
      if (!compact && !conversationId && newConversationId) router.replace(`/espace/tuteur?c=${newConversationId}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      setMessages((m) => (m[m.length - 1]?.role === "assistant" && !m[m.length - 1]?.content ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function startListening() {
    setError(null);
    if (capabilities.voiceServer && typeof MediaRecorder !== "undefined") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const fd = new FormData();
          fd.set("audio", blob, `voix.${(rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm"}`);
          setBusy(true);
          try {
            const res = await fetch("/api/tutor/transcribe", { method: "POST", body: fd });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || "Transcription impossible.");
            setBusy(false);
            if (oral) await send(j.text, "oral");
            else setInput((v) => (v ? v + " " : "") + j.text);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        };
        recorderRef.current = rec;
        rec.start();
        setRecording(true);
        return;
      } catch {
        if (!browserVoice.stt) {
          setError("Accès au micro refusé ou indisponible.");
          return;
        }
      }
    }
    const Rec = getBrowserRecognition();
    if (!Rec) return;
    const r = new Rec();
    r.lang = "fr-FR";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0]?.transcript ?? "").join(" ");
      if (oral) void send(text, "oral");
      else setInput((v) => (v ? v + " " : "") + text);
    };
    r.onend = () => setRecording(false);
    r.onerror = () => {
      setRecording(false);
      setError("La reconnaissance vocale du navigateur a échoué.");
    };
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  }

  function stopListening() {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    recognitionRef.current?.stop();
  }

  if (!capabilities.chat) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {tutorName} n'est pas encore activé sur cette plateforme : un administrateur doit configurer un fournisseur d'IA (Anthropic ou OpenAI) dans
        Administration › Paramètres › IA.
      </div>
    );
  }

  return (
    <div className={clsx("flex min-h-0 flex-col", compact ? "h-full" : "h-[calc(100dvh-12rem)] min-h-[480px]")}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-sky-50 p-4 text-sm text-navy">
            <div className="font-semibold">Bonjour, je suis {tutorName} 👋</div>
            <p className="mt-1 text-muted">
              Pose-moi une question sur ta formation, demande une explication plus simple, un exercice ou un quiz. Je m'appuie sur les supports de tes
              cours et je cite mes sources.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={clsx("fade-in flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={clsx(
                "max-w-[92%] rounded-2xl px-4 py-3 text-sm",
                m.role === "user" ? "rounded-br-md bg-navy text-white" : "rounded-bl-md border border-line bg-white",
              )}
            >
              {m.role === "user" ? (
                <>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.attachmentName && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-sky-200">
                      <FileText className="h-3 w-3" aria-hidden /> {m.attachmentName}
                    </div>
                  )}
                </>
              ) : m.content ? (
                <>
                  <div className="prose-nga" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 border-t border-line pt-2">
                      <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
                        <BookOpen className="h-3.5 w-3.5" aria-hidden /> Sources consultées
                      </div>
                      <ul className="space-y-0.5 text-xs text-muted">
                        {m.citations.map((c) => (
                          <li key={c.n}>
                            <span className="font-semibold text-navy">[S{c.n}]</span>{" "}
                            {c.lessonId ? (
                              <Link href={`/espace/lecon/${c.lessonId}`} className="text-sky underline-offset-2 hover:underline">
                                {c.lessonTitle ?? c.documentTitle}
                              </Link>
                            ) : (
                              c.documentTitle
                            )}
                            {c.heading ? ` — ${c.heading}` : ""}
                            {c.page ? ` (p. ${c.page})` : ""} · <span className="italic">{c.courseTitle}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {canSpeak && !busy && (
                    <button
                      type="button"
                      onClick={() => (speakingIdx === i ? stopSpeaking() : speak(m.content, i))}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline"
                    >
                      {speakingIdx === i ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {speakingIdx === i ? "Arrêter la lecture" : "Écouter"}
                    </button>
                  )}
                </>
              ) : (
                <span className="typing inline-flex gap-1" aria-label={`${tutorName} rédige sa réponse`}>
                  <span /><span /><span />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={busy}
            onClick={() => send(input.trim() || `${m.label}${lessonId ? " (leçon en cours)" : ""}`, m.id)}
            className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-navy hover:border-sky hover:bg-sky-50 disabled:opacity-50"
          >
            {m.label}
          </button>
        ))}
      </div>

      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-navy">
          <FileText className="h-3.5 w-3.5" aria-hidden /> <span className="truncate">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Retirer la pièce jointe" className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 shadow-soft focus-within:border-sky"
      >
        {capabilities.vision && (
          <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-sky-50 hover:text-navy" title="Joindre une image ou un PDF">
            <ImagePlus className="h-5 w-5" aria-hidden />
            <span className="sr-only">Joindre une image ou un PDF</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 8 * 1024 * 1024) setError("Fichier trop volumineux (8 Mo max).");
                else setFile(f ?? null);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={placeholder ?? `Écris ta question à ${tutorName}…`}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm focus:outline-none"
          aria-label="Votre message"
        />
        {canListen && (
          <button
            type="button"
            onClick={recording ? stopListening : startListening}
            disabled={busy && !recording}
            className={clsx(
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              recording ? "animate-pulse bg-red-600 text-white" : "text-muted hover:bg-sky-50 hover:text-navy",
            )}
            title={recording ? "Arrêter l'enregistrement" : "Parler au tuteur"}
            aria-label={recording ? "Arrêter l'enregistrement" : "Parler au tuteur"}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-200 text-navy" aria-label="Arrêter">
            <Loader2 className="h-4 w-4 animate-spin" />
          </button>
        ) : (
          <button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy text-white disabled:opacity-40" disabled={!input.trim() && !file} aria-label="Envoyer">
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
      <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted">
        {canSpeak && canListen ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={oral} onChange={(e) => setOral(e.target.checked)} className="h-3.5 w-3.5" />
            Conversation orale {capabilities.voiceServer ? "" : "(voix du navigateur)"}
          </label>
        ) : (
          <span />
        )}
        <span>L'IA peut se tromper : vérifie les points importants avec tes supports.</span>
      </div>
    </div>
  );
}
