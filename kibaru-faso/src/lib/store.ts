"use client";

/**
 * Données de l'enseignant conservées uniquement dans son navigateur (localStorage) :
 * conversations, contexte de la classe, documents personnels. Avec les comptes enseignants, les conversations
 * sont aussi sauvegardées en ligne (voir /api/preparations) ; ce stockage local sert alors de copie sur l'appareil.
 */

import type { TeacherContext } from "./conversation";
import type { Category } from "./documents";
import type { DecisionSummary } from "./base/decision";

export type Source = { label: string; title: string; type: string; origin: "bibliotheque" | "enseignant"; source: string | null; statut?: string | null; documentId?: string | null; version?: string | null; year?: string | null };
export type StoredMessage = { role: "user" | "assistant"; content: string; sources?: Source[]; decision?: DecisionSummary; check?: string[]; error?: boolean };
export type Conversation = { id: string; title: string; category?: Category; updatedAt: number; messages: StoredMessage[] };
export type TeacherDoc = { id: string; title: string; type: string; text: string; enabled: boolean; addedAt: number };

const BASE_KEYS = { conversations: "kibaru:conversations", context: "kibaru:contexte", docs: "kibaru:documents" };
let KEYS = { ...BASE_KEYS };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  /**
   * Comptes enseignants : chaque compte a ses propres données sur l'appareil (ordinateur partagé).
   * Les données enregistrées avant la création des comptes sont reprises une fois par le premier compte connecté.
   */
  setScope(userId: string | null) {
    if (!userId) {
      KEYS = { ...BASE_KEYS };
      return;
    }
    KEYS = {
      conversations: `${BASE_KEYS.conversations}:${userId}`,
      context: `${BASE_KEYS.context}:${userId}`,
      docs: `${BASE_KEYS.docs}:${userId}`,
    };
    try {
      for (const k of Object.keys(BASE_KEYS) as (keyof typeof BASE_KEYS)[]) {
        const legacy = localStorage.getItem(BASE_KEYS[k]);
        if (legacy !== null && localStorage.getItem(KEYS[k]) === null) localStorage.setItem(KEYS[k], legacy);
        localStorage.removeItem(BASE_KEYS[k]);
      }
    } catch {
      // stockage indisponible : rien à reprendre
    }
  },
  conversations: () => read<Conversation[]>(KEYS.conversations, []),
  saveConversations(list: Conversation[]) {
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    // En cas de stockage plein, on abandonne les conversations les plus anciennes.
    for (let n = sorted.length; n >= 1; n--) if (write(KEYS.conversations, sorted.slice(0, n))) return;
  },
  context: () => read<TeacherContext>(KEYS.context, {}),
  saveContext: (c: TeacherContext) => write(KEYS.context, c),
  docs: () => read<TeacherDoc[]>(KEYS.docs, []),
  saveDocs: (d: TeacherDoc[]) => write(KEYS.docs, d),
};

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
