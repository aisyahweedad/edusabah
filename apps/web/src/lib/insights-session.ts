export const ACTIVE_INSIGHTS_KEY = "edusabah.insights.active";

export function readActiveInsightConversation(): string | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_INSIGHTS_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { conversationId?: string }).conversationId ?? null;
  } catch {
    return null;
  }
}

export function saveActiveInsightConversation(conversationId: string): void {
  try {
    sessionStorage.setItem(ACTIVE_INSIGHTS_KEY, JSON.stringify({ conversationId }));
  } catch {
    // Storage can be unavailable in private mode.
  }
}

export function clearActiveInsightConversation(): void {
  try {
    sessionStorage.removeItem(ACTIVE_INSIGHTS_KEY);
  } catch {
    // Ignore storage errors.
  }
}
