import {
  AgentHarness,
  InMemorySessionStorage,
  Session,
  type AgentHarnessTool,
} from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  Type,
  type Model,
  type Models,
  type TSchema,
  type ThinkingLevel,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { loadEnv } from "@k-aecs/config";
import { getDb } from "@k-aecs/database";
import { aiRuns, aiToolCalls, messages } from "@k-aecs/database/schema";
import type { Citation, Role } from "@k-aecs/shared";
import { createRegistry, type ToolContext, type ToolDefinition } from "@k-aecs/tools";
import { buildSystemPrompt } from "./system-prompt.js";

export interface HarnessActor extends ToolContext {
  /** Telegram numeric id (citizens) or officer user id (staff). */
  actorId: string;
  role: Role | null;
  /** Telegram chat id when the run originates from Telegram. */
  telegramUserId?: string;
}

export interface HarnessRunInput {
  userMessage: string;
  actor: HarnessActor;
  conversationId: string;
  systemPrompt?: string;
  intent?: string;
  channelId?: string;
  signal?: AbortSignal;
}

export interface HarnessToolCallRecord {
  toolName: string;
  ok: boolean;
  argsSnippet?: string;
  resultChars: number;
  resultPreview?: string;
  latencyMs?: number;
  error?: string;
}

/** Internal runtime record for one tool execution while auditing. */
interface ToolExecutionRecord {
  name: string;
  args: unknown;
  ok: boolean;
  latencyMs?: number;
  result?: string;
  error?: string;
}

export interface HarnessRunResult {
  status: "ok" | "error";
  text: string;
  reasoning?: string;
  usage: { input: number; output: number; reasoning: number; total: number; costUsd: number };
  runId: string;
  toolCalls: HarnessToolCallRecord[];
  citations: Citation[];
  error?: string;
}

const PROVIDER_ID = "k-aecs";

/** TypeBox parameter schemas mirroring the zod schemas in @k-aecs/tools. */
const PARAM_SCHEMAS: Record<string, TSchema> = {
  web_search: Type.Object({ query: Type.String({ minLength: 1 }) }),
  fetch_url: Type.Object({
    url: Type.String(),
    max_chars: Type.Optional(Type.Number({ minimum: 1000, maximum: 20000 })),
  }),
};

/** Map env HARNESS_THINKING_LEVEL to a pi thinking level ("off" = do not set). */
export function mapThinkingLevel(
  level: string | undefined,
): ThinkingLevel | undefined {
  switch (level) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return undefined;
  }
}

export function buildChatModel(): Model<"openai-completions"> {
  const env = loadEnv();
  return {
    id: env.AI_CHAT_MODEL,
    name: env.AI_CHAT_MODEL,
    api: "openai-completions",
    provider: PROVIDER_ID,
    baseUrl: env.AI_CHAT_BASE_URL.replace(/\/+$/, ""),
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: env.AI_CHAT_CONTEXT_WINDOW,
    maxTokens: Math.max(1024, Math.min(32_000, env.AI_CHAT_CONTEXT_WINDOW)),
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  };
}

export interface Gateways {
  models: Models;
  providerId: string;
  modelId: string;
}

/** Models collection with one custom OpenAI-compatible provider ("k-aecs"). */
export function createGateways(): Gateways {
  const env = loadEnv();
  const model = buildChatModel();
  const models = createModels();
  models.setProvider(
    createProvider({
      id: PROVIDER_ID,
      name: "EduSabah gateway",
      baseUrl: model.baseUrl,
      models: [model],
      auth: {
        apiKey: {
          name: "EduSabah AI gateway key",
          resolve: async () => {
            // Local gateways (vLLM/llama.cpp) are frequently keyless; an empty
            // key simply yields no Authorization header.
            const key = env.AI_CHAT_API_KEY;
            return {
              auth: key ? { apiKey: key } : {},
              source: key ? "AI_CHAT_API_KEY" : "keyless local gateway",
            };
          },
        },
      },
      api: openAICompletionsApi(),
    }),
  );
  return { models, providerId: PROVIDER_ID, modelId: model.id };
}

/** Build a fresh session per run; conversation history is rehydrated from the
 * DB into the prompt (see buildHistoryPrefix) because the Pi session storage
 * is in-memory per process. */
export function buildSession(conversationId: string): Session {
  const storage = new InMemorySessionStorage({
    metadata: { id: conversationId, createdAt: new Date().toISOString() },
  });
  return new Session(storage);
}

/**
 * Rehydrate recent conversation history from the messages table so the model
 * remembers earlier turns (UC-01 context retention). Without this, every run
 * starts blank and the assistant re-asks the same questions forever.
 */
async function buildHistoryPrompt(
  conversationId: string,
  currentUserMessage: string,
): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(40);

  // The current user message is already persisted by the caller before the
  // run; drop the trailing duplicate so it is not injected twice.
  const prior = rows.slice(0, -1);
  if (!prior.length) return "";

  const turns = prior
    .slice(-16)
    .map((m) => `${m.role === "user" ? "Citizen" : "You"}: ${m.content}`)
    .join("\n\n");

  return [
    "<conversation_history>",
    "Below is the recent transcript of this Telegram conversation. Use it as",
    "context: never re-ask for information the citizen has already provided,",
    "and refer back to earlier answers instead of starting over.",
    "",
    turns,
    "",
    "</conversation_history>",
    "",
    `The citizen's latest message is: ${currentUserMessage}`,
    "",
  ].join("\n");
}

/** Wrap a registry tool definition in the pi AgentHarnessTool shape. */
export function toHarnessTool(
  def: ToolDefinition,
  timeoutMs: number,
  keepArgs: boolean,
  records: ToolExecutionRecord[],
): AgentHarnessTool<ToolContext> {
  return {
    name: def.name,
    description: def.description,
    label: def.name,
    parameters: PARAM_SCHEMAS[def.name] ?? Type.Object({}),
    executionMode: "sequential",
    execute: async (toolCallId, params, _signal, onUpdate, context) => {
      const start = Date.now();
      const record: ToolExecutionRecord = {
        name: def.name,
        args: keepArgs ? params : { redacted: true },
        ok: false,
      };
      records.push(record);
      let raw: string;
      try {
        raw = await runWithToolTimeout(
          def.execute(params as Record<string, unknown>, context),
          def.timeoutMs ?? 30_000,
          `tool ${def.name}`,
        );
        record.ok = true;
        record.latencyMs = Date.now() - start;
        record.result = raw;
        onUpdate?.({
          content: [{ type: "text", text: raw }],
          details: { len: raw.length },
        });
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        throw error instanceof Error
          ? error
          : new Error(`tool ${def.name} failed: ${String(error)}`);
      }
      return {
        content: [{ type: "text", text: raw }],
        details: {
          toolCallId,
          latencyMs: record.latencyMs,
          resultChars: raw.length,
        },
      };
    },
  };
}

function runWithToolTimeout(promise: Promise<string>, ms: number, label: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function textFromAssistant(  assistant:
    | { content: Array<{ type: string; text?: string }> }
    | undefined,
): string {
  if (!assistant) return "";
  return (assistant.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function usageArgs(assistant: { usage?: { input?: number; output?: number; reasoning?: number; totalTokens?: number; cost?: { input?: number; output?: number; total?: number } } }) {
  const usage = assistant.usage;
  return {
    tokensInput: usage?.input ?? 0,
    tokensOutput: usage?.output ?? 0,
    tokensReasoning: usage?.reasoning ?? 0,
    costUsdMicros: Math.round((usage?.cost?.total ?? (usage?.cost?.input ?? 0) + (usage?.cost?.output ?? 0)) * 1_000_000),
  };
}

/**
 * Run one harness turn: build the Pi AgentHarness with the tools this actor may
 * use, execute it, and persist the run + tool-call audit.
 */
export async function runHarness(input: HarnessRunInput): Promise<HarnessRunResult> {
  const env = loadEnv();
  const { models, modelId } = createGateways();
  const registry = createRegistry();
  const definitions = registry.authorizedFor(input.actor);

  const records: ToolExecutionRecord[] = [];
  const tools = definitions.map((def) =>
    toHarnessTool(def, env.HARNESS_STREAM_TIMEOUT_MS, env.AUDIT_KEEP_ARGS, records),
  );

  const session = buildSession(input.conversationId);
  const model =
    models.getModel(PROVIDER_ID, modelId) as
      | Model<"openai-completions">
      | undefined;
  if (!model) {
    throw new Error(`model ${modelId} not found on provider ${PROVIDER_ID}`);
  }

  // Tool context: citizens carry their Telegram id so intake tools can
  // attribute the ticket to the right account.
  const toolContext: ToolContext = {
    ...input.actor,
    telegramChatId: input.actor.telegramUserId ?? input.channelId,
  };

  const systemPrompt =
    input.systemPrompt ??
    buildSystemPrompt({
      actorKind: input.actor.actorKind,
      roleLabel: input.actor.role ?? undefined,
      researchMode: input.actor.role === "political_secretary",
    });

  const harness = new AgentHarness<ToolContext>({
    session,
    models,
    model,
    thinkingLevel: mapThinkingLevel(env.HARNESS_THINKING_LEVEL),
    systemPrompt,
    tools,
    activeToolNames: tools.map((t) => t.name),
    toolContext,
    streamOptions: { timeoutMs: env.HARNESS_STREAM_TIMEOUT_MS },
  });

  const startedAt = new Date();
  let runId: string = crypto.randomUUID();
  const writeRecord = (runId: string, record: ToolExecutionRecord) => {
    const { getString } = (() => {
      const preview = record.result;
      const args = record.args;
      return {
        getString: (v: unknown, cap = 2000) =>
          typeof v === "string" ? v.slice(0, cap) : JSON.stringify(v)?.slice(0, cap) ?? "",
      };
    })();
    return {
      runId,
      toolName: record.name,
      ok: record.ok,
      args: env.AUDIT_KEEP_ARGS ? getString(record.args, 4000) : undefined,
      resultChars: record.result
        ? typeof record.result === "string"
          ? record.result.length
          : JSON.stringify(record.result).length
        : 0,
      resultPreview: getString(record.result, 2000),
      latencyMs: record.latencyMs,
      error: record.error,
    };
  };

  let status: "ok" | "error" = "ok";
  let errorMessage: string | undefined;
  let finalText = "";
  let usageValues = { tokensInput: 0, tokensOutput: 0, tokensReasoning: 0, costUsdMicros: 0 };

  try {
    const signal = input.signal;
    let aborted = false;
    const abortListener = () => {
      aborted = true;
      void harness.abort();
    };
    signal?.addEventListener("abort", abortListener, { once: true });
    try {
      // Rehydrate history so multi-turn chats keep context (fixes the
      // "asks the same questions forever" loop).
      const promptWithHistory =
        (await buildHistoryPrompt(input.conversationId, input.userMessage)) + input.userMessage;
      const assistant = await harness.prompt(promptWithHistory);
      finalText = textFromAssistant(assistant);
      usageValues = usageArgs(assistant);
      if (aborted) status = "error";
    } finally {
      signal?.removeEventListener("abort", abortListener);
    }
    if (status === "error") errorMessage = "aborted";
  } catch (error) {
    status = "error";
    errorMessage = error instanceof Error ? error.message : String(error);
    finalText = finalText || "";
  }

  const runName = `run-${runId.slice(0, 8)}`;
  const db = getDb();
  try {
    runId = (
      await db
        .insert(aiRuns)
        .values({
          conversationId: input.conversationId,
          channelId: input.channelId,
          actorKind: input.actor.actorKind,
          actorId: input.actor.actorId,
          role: input.actor.role ?? undefined,
          intent: input.intent,
          model: modelId,
          provider: PROVIDER_ID,
          status,
          userMessage: input.userMessage,
          userMessageHash: sha256(input.userMessage),
          assistantText: finalText || undefined,
          tokensInput: usageValues.tokensInput,
          tokensOutput: usageValues.tokensOutput,
          tokensReasoning: usageValues.tokensReasoning,
          promptChars: input.userMessage.length + (systemPrompt?.length ?? 0),
          turns: 1,
          citations: [],
          costUsdMicros: usageValues.costUsdMicros,
          error: errorMessage,
          startedAt,
          finishedAt: new Date(),
        })
        .returning({ id: aiRuns.id })
    )[0]?.id ?? runId;

    if (records.length) {
      await db
        .insert(aiToolCalls)
        .values(records.map((r) => writeRecord(runId, r)));
    }
  } catch (logError) {
    // Never let audit plumbing fail a response that already succeeded.
    console.error("[harness] failed to persist audit", logError);
  }

  return {
    status,
    text: finalText,
    usage: {
      input: usageValues.tokensInput,
      output: usageValues.tokensOutput,
      reasoning: usageValues.tokensReasoning,
      total: usageValues.tokensInput + usageValues.tokensOutput,
      costUsd: usageValues.costUsdMicros / 1_000_000,
    },
    runId,
    toolCalls: records.map((r) => ({
      toolName: r.name,
      ok: r.ok,
      argsSnippet: env.AUDIT_KEEP_ARGS
        ? JSON.stringify(r.args)?.slice(0, 4000)
        : undefined,
      resultChars: r.result
        ? typeof r.result === "string"
          ? r.result.length
          : JSON.stringify(r.result).length
        : 0,
      resultPreview:
        typeof r.result === "string" ? r.result.slice(0, 2000) : undefined,
      latencyMs: r.latencyMs,
      error: r.error,
    })),
    citations: [],
    error: errorMessage,
  };
}

function sha256(value: string): string {
  try {
    // node:crypto available in all our runtimes; fall back to a stable FNV
    // derivative if a bundler drops it.
    return createHash("sha256").update(value).digest("hex");
  } catch {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return `fnv_${Math.abs(hash).toString(16)}`;
  }
}
