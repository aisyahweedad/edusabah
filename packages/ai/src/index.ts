/**
 * Model gateway — OpenAI-compatible API calls (chat completion + embeddings).
 *
 * The Pi harness own provider registration for tool-capable models; this module
 * is the thin layer the rest of EduSabah uses for one-shot completions,
 * intent classification, and embeddings (RAG). Everything is interface-driven so
 * providers can be swapped per environment without touching callers.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "high" | "medium";
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  reasoning?: string;
  usage?: { input: number; output: number; reasoning?: number; total: number };
  stopReason?: string;
}

export interface EmbeddingRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  input: string | string[];
  dimensions?: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage?: { tokens: number };
}

export interface SpeechToTextRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType?: string;
}

export interface SpeechToTextResponse {
  text: string;
}

export async function chatCompletion(req: ChatRequest): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 1024,
  };
  if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;

  const res = await fetch(`${req.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: req.apiKey ? `Bearer ${req.apiKey}` : "",
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`chat completion failed: HTTP ${res.status} ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as any;
  const choice = data.choices?.[0];
  const message = choice?.message ?? {};
  return {
    text: message.content ?? "",
    reasoning: message.reasoning ?? message.reasoning_content,
    usage: data.usage
      ? {
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
          reasoning: data.usage.completion_tokens_details?.reasoning_tokens,
          total: data.usage.total_tokens ?? 0,
        }
      : undefined,
    stopReason: choice?.finish_reason,
  };
}

export async function generateEmbeddings(req: EmbeddingRequest): Promise<EmbeddingResponse> {
  const input = Array.isArray(req.input) ? req.input : [req.input];
  const res = await fetch(`${req.baseUrl.replace(/\/+$/, "")}/v1/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: req.apiKey ? `Bearer ${req.apiKey}` : "",
    },
    body: JSON.stringify({
      model: req.model,
      input,
      ...(req.dimensions ? { dimensions: req.dimensions } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`embedding failed: HTTP ${res.status} ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as any;
  return {
    embeddings: (data.data ?? []).map((item: any) => item.embedding as number[]),
    usage: data.usage ? { tokens: data.usage.total_tokens ?? 0 } : undefined,
  };
}

export async function speechToText(req: SpeechToTextRequest): Promise<SpeechToTextResponse> {
  const form = new FormData();
  form.append("model", req.model);
  form.append("file", new Blob([Buffer.from(req.audioBase64, "base64")], { type: req.mimeType ?? "audio/ogg" }), "voice.ogg");

  const res = await fetch(`${req.baseUrl.replace(/\/+$/, "")}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      authorization: req.apiKey ? `Bearer ${req.apiKey}` : "",
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`transcription failed: HTTP ${res.status} ${detail.slice(0, 500)}`);
  }
  const data = (await res.json()) as any;
  return { text: data.text ?? "" };
}

/** Object storage of audio requires the S3 layer; this helper leaves room for it. */
export type { SpeechToTextRequest as SttRequest };
