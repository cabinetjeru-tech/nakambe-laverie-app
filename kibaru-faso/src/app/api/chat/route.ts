import Anthropic from "@anthropic-ai/sdk";
import { hasAccess } from "@/lib/access";
import { chatRequestSchema, formatContextBlock, MAX_TEACHER_DOCS_CHARS, normalizeHistory, searchQuery } from "@/lib/conversation";
import { getLibrary } from "@/lib/library";
import { AiUnavailableError, streamAnswer } from "@/lib/llm";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { formatReferenceBlock, isApplicable, searchDocuments, type RefDocument } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!hasAccess(req)) return jsonError(401, "Code d'accès requis.");
  const perMinute = Number(process.env.KIBARU_RATE_LIMIT) || 12;
  const rl = rateLimit(`chat:${clientIp(req)}`, perMinute, 60_000);
  if (!rl.ok) return jsonError(429, `Trop de demandes rapprochées. Réessayez dans ${rl.retryAfter} s.`);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Requête invalide.");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Requête invalide.");
  const { context } = parsed.data;
  const history = normalizeHistory(parsed.data.messages);
  if (history.length === 0 || history[history.length - 1]!.role !== "user") return jsonError(400, "Message vide.");
  const teacherChars = parsed.data.documents.reduce((s, d) => s + d.text.length, 0);
  if (teacherChars > MAX_TEACHER_DOCS_CHARS) return jsonError(413, "Vos documents sont trop volumineux : retirez-en un ou plusieurs.");

  // Documents : bibliothèque de référence + documents ajoutés par l'enseignant.
  let library: RefDocument[] = [];
  try {
    library = await getLibrary();
  } catch (e) {
    console.error("[chat] bibliothèque indisponible :", (e as Error).message);
  }
  const teacherDocs: RefDocument[] = parsed.data.documents.map((d) => ({
    id: `ens:${d.id}`,
    title: d.title,
    type: d.type,
    origin: "enseignant",
    classes: [],
    disciplines: [],
    text: d.text,
  }));
  const all = [...library, ...teacherDocs];
  const catalogue = all.filter((d) => isApplicable(d, context.classe, context.discipline));
  const excerpts = searchDocuments(catalogue, searchQuery(history, context), { limit: 8 });

  // Le dernier message reçoit le contexte et les extraits ; l'historique reste inchangé (cache efficace).
  const last = history[history.length - 1]!;
  const prefix = [formatContextBlock(context), formatReferenceBlock(catalogue, excerpts)].filter(Boolean).join("\n\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) =>
    i === history.length - 1
      ? { role: "user", content: `${prefix}\n\n<demande_enseignant>\n${last.content}\n</demande_enseignant>` }
      : { role: m.role, content: m.content },
  );

  const sources = excerpts.map((e) => ({ label: e.label, title: e.doc.title, type: e.doc.type, origin: e.doc.origin, source: e.doc.source ?? null, status: e.doc.status ?? null }));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "meta", sources, libraryCount: catalogue.length });
      try {
        const gen = streamAnswer(messages);
        let r = await gen.next();
        while (!r.done) {
          send({ type: "delta", text: r.value });
          r = await gen.next();
        }
        if (r.value === "refusal") send({ type: "delta", text: "\n\n_Je ne peux pas traiter cette demande. Reformulez-la en lien avec votre préparation pédagogique._" });
        if (r.value === "max_tokens") send({ type: "delta", text: "\n\n_(Production interrompue car trop longue : demandez « continue » pour la suite.)_" });
        send({ type: "done" });
      } catch (e) {
        let message = "KIBARU FASO n'a pas pu répondre (service momentanément indisponible). Réessayez dans un instant.";
        if (e instanceof AiUnavailableError) message = e.message;
        else if (e instanceof Anthropic.RateLimitError) message = "Le service est très sollicité. Réessayez dans une minute.";
        else if (e instanceof Anthropic.AuthenticationError) message = "La clé API configurée est invalide. Prévenez l'administrateur.";
        console.error("[chat]", (e as Error).message);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
