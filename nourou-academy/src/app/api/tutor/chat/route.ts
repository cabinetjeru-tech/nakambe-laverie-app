import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { checkQuota } from "@/lib/ai/quota";
import { AiUnavailableError, aiStatus, streamText, type LlmMessage, type LlmPart } from "@/lib/ai/llm";
import { buildTutorSystem, type TutorMode } from "@/lib/ai/tutor";
import { getAiSettings } from "@/lib/settings";
import { detectFileType } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const modes = ["free", "explain", "simplify", "examples", "exercise", "quiz", "path", "gaps", "remediation", "oral"] as const;
const schema = z.object({
  message: z.string().max(4000),
  mode: z.enum(modes).default("free"),
  courseId: z.string().max(40).optional(),
  lessonId: z.string().max(40).optional(),
  conversationId: z.string().max(40).optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!(await aiStatus()).chat) return jsonError(503, new AiUnavailableError().message);
  const rl = rateLimit(`tutor:${user.id}`, 20, 60_000);
  if (!rl.ok) return jsonError(429, `Trop de messages rapprochés. Réessaie dans ${rl.retryAfter} s.`);
  const quota = await checkQuota(user, "TUTOR");
  if (!quota.ok) return jsonError(429, quota.message);

  const fd = await req.formData();
  const parsed = schema.safeParse({
    message: fd.get("message") ?? "",
    mode: fd.get("mode") || "free",
    courseId: fd.get("courseId") || undefined,
    lessonId: fd.get("lessonId") || undefined,
    conversationId: fd.get("conversationId") || undefined,
  });
  if (!parsed.success) return jsonError(400, "Requête invalide.");
  const { mode, lessonId } = parsed.data;
  let { courseId } = parsed.data;
  const message = parsed.data.message.trim();

  // Pièce jointe (image ou PDF) pour l'analyse multimodale.
  const parts: LlmPart[] = [];
  let attachmentName: string | null = null;
  const file = fd.get("file");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > 4 * 1024 * 1024) return jsonError(413, "Pièce jointe trop volumineuse (4 Mo max).");
    const buf = Buffer.from(await file.arrayBuffer());
    const t = detectFileType(buf, file.name);
    if (!t) return jsonError(415, "Format de pièce jointe non pris en charge.");
    if (t.mime === "application/pdf") parts.push({ type: "pdf", data: buf.toString("base64") });
    else if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(t.mime))
      parts.push({ type: "image", mediaType: t.mime as "image/png", data: buf.toString("base64") });
    else return jsonError(415, "Seules les images (PNG, JPEG, WebP) et les PDF sont acceptés.");
    attachmentName = file.name.slice(0, 120);
  }
  if (!message && parts.length === 0) return jsonError(400, "Message vide.");

  // Conversation : appartenance vérifiée.
  let conversation = parsed.data.conversationId
    ? await prisma.tutorConversation.findFirst({ where: { id: parsed.data.conversationId, userId: user.id } })
    : null;
  if (!conversation) {
    conversation = await prisma.tutorConversation.create({
      data: { userId: user.id, courseId: courseId ?? null, lessonId: lessonId ?? null, title: (message || attachmentName || "Nouvelle discussion").slice(0, 70) },
    });
  }
  courseId = courseId ?? conversation.courseId ?? undefined;

  const settings = await getAiSettings();
  const previous = await prisma.tutorMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: settings.maxContextMessages,
  });
  previous.reverse();

  const history = previous.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n");
  const { system, citations } = await buildTutorSystem({
    user: { id: user.id, role: user.role, name: user.name, level: user.level },
    question: message || "Analyse la pièce jointe.",
    courseId,
    lessonId,
    mode: mode as TutorMode,
    history,
  });

  const llmMessages: LlmMessage[] = previous.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const userContent: LlmPart[] = [...parts, { type: "text", text: `<message_apprenant>\n${message || "Peux-tu analyser ce document / cette image et m'expliquer ?"}\n</message_apprenant>` }];
  llmMessages.push({ role: "user", content: userContent });

  await prisma.tutorMessage.create({
    data: { conversationId: conversation.id, role: "user", content: message || "(pièce jointe)", attachments: attachmentName ? [{ name: attachmentName }] : [] },
  });

  const encoder = new TextEncoder();
  const convId = conversation.id;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "meta", conversationId: convId, citations });
      let answer = "";
      try {
        for await (const delta of streamText({ system, messages: llmMessages, feature: parts.length ? "VISION" : "TUTOR", userId: user.id, maxTokens: 8000 })) {
          answer += delta;
          send({ type: "delta", text: delta });
        }
        const saved = await prisma.tutorMessage.create({
          data: { conversationId: convId, role: "assistant", content: answer, citations: citations as object },
        });
        await prisma.tutorConversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });
        send({ type: "done", messageId: saved.id });
      } catch (e) {
        const msg = e instanceof AiUnavailableError ? e.message : "Le tuteur n'a pas pu répondre (service IA indisponible). Réessaie dans un instant.";
        console.error("[tutor]", (e as Error).message);
        if (answer) await prisma.tutorMessage.create({ data: { conversationId: convId, role: "assistant", content: answer, citations: citations as object } });
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
