"use client";

/**
 * Données de l'enseignant conservées uniquement dans son navigateur (localStorage) :
 * conversations, contexte de la classe, documents personnels. Rien n'est stocké sur le serveur.
 */

import type { TeacherContext } from "./conversation";
import type { Category } from "./documents";
import type { DecisionSummary } from "./base/decision";

export type Source = { label: string; title: string; type: string; origin: "bibliotheque" | "enseignant"; source: string | null; statut?: string | null; documentId?: string | null; version?: string | null; year?: string | null };
export type StoredMessage = { role: "user" | "assistant"; content: string; sources?: Source[]; decision?: DecisionSummary; error?: boolean };
export type Conversation = { id: string; title: string; category?: Category; updatedAt: number; messages: StoredMessage[] };
export type TeacherDoc = { id: string; title: string; type: string; text: string; enabled: boolean; addedAt: number };

const KEYS = { conversations: "kibaru:conversations", context: "kibaru:contexte", docs: "kibaru:documents" };

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
