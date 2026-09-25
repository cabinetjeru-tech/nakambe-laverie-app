import "server-only";
import OpenAI, { toFile } from "openai";
import { getAiSettings, getSecret } from "../settings";
import { recordUsage } from "./quota";
import { AiUnavailableError } from "./llm";

/**
 * Voix : reconnaissance vocale (français) et synthèse vocale via l'API OpenAI.
 * Si aucune clé OpenAI n'est configurée, ces fonctions lèvent AiUnavailableError :
 * l'interface bascule alors sur les capacités vocales natives du navigateur
 * lorsqu'elles existent, ou masque les boutons vocaux. Rien n'est simulé.
 */

async function client() {
  const key = await getSecret("ai.openaiKey");
  if (!key) throw new AiUnavailableError("La voix côté serveur nécessite une clé OpenAI.");
  return new OpenAI({ apiKey: key });
}

export async function transcribe(audio: Buffer, filename: string, userId: string): Promise<string> {
  const s = await getAiSettings();
  const c = await client();
  let ok = false;
  try {
    const res = await c.audio.transcriptions.create({
      file: await toFile(audio, filename),
      model: s.sttModel,
      language: "fr",
    });
    ok = true;
    return res.text;
  } finally {
    await recordUsage({ userId, feature: "STT", provider: "openai", model: s.sttModel, units: audio.length, success: ok });
  }
}

export async function synthesize(text: string, userId: string): Promise<ArrayBuffer> {
  const s = await getAiSettings();
  const c = await client();
  let ok = false;
  try {
    const res = await c.audio.speech.create({
      model: s.ttsModel,
      voice: s.ttsVoice as "alloy",
      input: text.slice(0, 4000),
      response_format: "mp3",
      instructions: "Parle en français, d'un ton chaleureux, clair et pédagogique, à un rythme posé.",
    });
    ok = true;
    return await res.arrayBuffer();
  } finally {
    await recordUsage({ userId, feature: "TTS", provider: "openai", model: s.ttsModel, units: text.length, success: ok });
  }
}
