import Anthropic from "@anthropic-ai/sdk";
import { hasAccess } from "@/lib/access";
import { compteCourant } from "@/lib/comptes";
import { CONTACT } from "@/lib/contact";
import { accountsEnabled } from "@/lib/supabase/server";
import { chatRequestSchema, formatContextBlock, MAX_TEACHER_DOCS_CHARS, normalizeHistory, searchQuery } from "@/lib/conversation";
import { decide, decisionSummary, formatDecisionBlock, identifyConversation } from "@/lib/base/decision";
import { finalCheck } from "@/lib/base/final-check";
import { getBase } from "@/lib/library";
import { aiErrorMessage, streamAnswer } from "@/lib/llm";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { formatReferenceBlock, isApplicable, resolveBase, searchDocuments, type ArchivedDoc, type RefDocument } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  // Comptes enseignants : connexion et abonnement en cours obligatoires. Sinon, code d'accès partagé.
  let who = clientIp(req);
  if (accountsEnabled()) {
    const compte = await compteCourant().catch(() => null);
    if (!compte) return jsonError(401, "Connectez-vous à votre espace enseignant.");
    if (compte.profil.suspendu) return jsonError(403, `Votre compte est suspendu. Contactez ${CONTACT.entreprise} au ${CONTACT.telephone}.`);
    if (!compte.acces) return jsonError(402, "Votre abonnement n'est pas actif : abonnez-vous dans « Mon compte » pour continuer.");
    who = compte.profil.id;
  } else if (!hasAccess(req)) return jsonError(401, "Code d'accès requis.");
  const perMinute = Number(process.env.KIBARU_RATE_LIMIT) || 12;
  const rl = rateLimit(`chat:${who}`, perMinute, 60_000);
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

  // Documents : base documentaire PÉDAGOGUE.IA + bibliothèque personnelle de l'enseignant.
  let library: RefDocument[] = [];
  let pending: Awaited<ReturnType<typeof getBase>>["pending"] = [];
  let registryIds: string[] = [];
  try {
    const base = await getBase();
    ({ docs: library, pending } = base);
    registryIds = [...base.registry.map((e) => e.meta.documentId), ...library.map((d) => d.documentId), ...pending.map((p) => p.documentId)].filter((x): x is string => !!x);
  } catch (e) {
    console.error("[chat] base documentaire indisponible :", (e as Error).message);
  }
  const teacherDocs: RefDocument[] = parsed.data.documents.map((d) => ({
    id: `ens:${d.id}`,
    title: d.title,
    type: d.type,
    origin: "enseignant",
    classes: [],
    disciplines: [],
    sourceLevel: 4,
    text: d.text,
  }));
  // Versions : seules les ressources consultables sont recherchées ; l'historique est seulement signalé.
  const { usable, history: versionHistory } = resolveBase([...library, ...teacherDocs]);
  // Moteur de décision, étape 1 : périmètre de la demande (la demande écrite l'emporte sur le contexte).
  const profile = identifyConversation(history.filter((m) => m.role === "user").map((m) => m.content), context);
  const applies = (d: { classes: string[]; disciplines: string[] }) => isApplicable(d, profile.classe, profile.matiere);
  const catalogue = usable.filter(applies);
  const historyHere: ArchivedDoc[] = [
    ...versionHistory.filter((h) => applies(h.doc)),
    ...pending.filter(applies).map((p) => ({
      doc: { id: p.path, title: p.title, type: "", origin: "bibliotheque" as const, classes: p.classes, disciplines: p.disciplines, documentId: p.documentId, statut: p.statut },
      reason: "fiche enregistrée mais texte non encore intégré : aucun contenu consultable",
    })),
  ];
  const excerpts = searchDocuments(catalogue, searchQuery(history, context), { limit: 8 });
  // Étapes 2 à 6 : ressources du périmètre, versions, remplacements, confiance documentaire.
  const decision = decide(profile, catalogue, excerpts, versionHistory.filter((h) => applies(h.doc)), pending.filter(applies));

  // Le dernier message reçoit le contexte et les extraits ; l'historique reste inchangé (cache efficace).
  const last = history[history.length - 1]!;
  const prefix = [formatContextBlock(context), formatDecisionBlock(decision), formatReferenceBlock(catalogue, excerpts, historyHere)].filter(Boolean).join("\n\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) =>
    i === history.length - 1
      ? { role: "user", content: `${prefix}\n\n<demande_enseignant>\n${last.content}\n</demande_enseignant>` }
      : { role: m.role, content: m.content },
  );

  const sources = excerpts.map((e) => ({ label: e.label, title: e.doc.title, type: e.doc.type, origin: e.doc.origin, source: e.doc.source ?? null, statut: e.doc.statut ?? null, documentId: e.doc.documentId ?? null, version: e.doc.version ?? null, year: e.doc.year ?? null }));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "meta", sources, libraryCount: catalogue.length, decision: decisionSummary(decision) });
      try {
        const gen = streamAnswer(messages);
        let answer = "";
        let r = await gen.next();
        while (!r.done) {
          answer += r.value;
          send({ type: "delta", text: r.value });
          r = await gen.next();
        }
        if (r.value === "refusal") send({ type: "delta", text: "\n\n_Je ne peux pas traiter cette demande. Reformulez-la en lien avec votre préparation pédagogique._" });
        if (r.value === "max_tokens") send({ type: "delta", text: "\n\n_(Production interrompue car trop longue : demandez « continue » pour la suite.)_" });
        // Contrôle final automatique : signale à l'enseignant ce qui mérite relecture (la réponse n'est pas modifiée).
        const check = finalCheck({
          answer,
          labels: excerpts.map((e) => e.label),
          knownIds: registryIds,
          confidence: decision.confidence,
          needs: profile.needs,
          questionExpected: !!profile.question,
          fiche: profile.fiche,
          mode: profile.mode,
          dureeAnnoncee: profile.duree,
          evaluation: profile.module02 ? profile.evaluation : undefined,
          remediation: profile.module03,
          progression: profile.module04 ? profile.progression : undefined,
        });
        send({ type: "done", check });
      } catch (e) {
        console.error("[chat]", (e as Error).message);
        send({ type: "error", message: aiErrorMessage(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
