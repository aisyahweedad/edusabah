import type { ComplaintCategory } from "@k-aecs/shared";

/**
 * Lightweight per-chat conversation state for the guided complaint wizard.
 * In-memory by design for a single-instance bot; swap for Redis in production.
 */

export type WizardStep = "category" | "title" | "description" | "location" | "confirm";

export interface WizardDraft {
  category?: ComplaintCategory;
  title?: string;
  description?: string;
  location?: string;
}

export type ChatState =
  | { kind: "idle" }
  | { kind: "consent" }
  | { kind: "wizard"; step: WizardStep; data: WizardDraft }
  | { kind: "lookup" }
  | { kind: "question" };

const store = new Map<number, ChatState>();

export function getState(chatId: number): ChatState {
  return store.get(chatId) ?? { kind: "idle" };
}

export function setState(chatId: number, state: ChatState): void {
  store.set(chatId, state);
}

export function clearState(chatId: number): void {
  store.delete(chatId);
}
