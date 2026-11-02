/**
 * UC-02 intake pipeline — AI classification, duplicate detection and
 * content-safety analysis for newly submitted complaints.
 *
 * Runs inline on POST /complaints (best-effort): the ticket is always created
 * first; analysis enriches it afterwards. Every failure degrades gracefully
 * to deterministic defaults so intake never blocks on the AI gateway.
 */
import { loadEnv } from "@k-aecs/config";
import {
  COMPLAINT_CATEGORIES,
  SEVERITIES,
  type ComplaintAiAnalysis,
  type ComplaintCategory,
  type Severity,
} from "@k-aecs/shared";
import { chatCompletion, generateEmbeddings } from "./index.js";

export interface ClassifyInput {
  category: ComplaintCategory;
  title: string;
  description: string;
  location?: string;
  districtCode?: string;
}

export interface ClassifyResult {
  analysis: ComplaintAiAnalysis;
}

/** Profanity / safety flag lexicon (BM + EN). Kept deliberately small. */
const UNSAFE_TERMS = [
  "bodoh",
  "sial",
  "anjing",
  "bangsat",
  "celaka",
  "hampeh",
  "pukimak",
  "cerm**",
  "fuck",
  "shit",
  "bastard",
  "damn",
];

/** District names indexed for lightweight extraction from free text. */
const DISTRICT_NAMES = [
  "Beaufort", "Beluran", "Kalabakan", "Keningau", "Kinabatangan", "Kota Belud",
  "Kota Kinabalu", "Kota Marudu", "Kuala Penyu", "Kudat", "Kunak", "Lahad Datu",
  "Nabawan", "Papar", "Penampang", "Pitas", "Putatan", "Ranau", "Sandakan",
  "Semporna", "Sipitang", "Tambunan", "Tawau", "Telupid", "Tenom", "Tongod",
  "Tuaran",
];

function containsUnsafe(text: string): boolean {
  const lower = text.toLowerCase();
  return UNSAFE_TERMS.some((term) => lower.includes(term));
}

function extractDistrict(text: string): string | undefined {
  const lower = text.toLowerCase();
  const hit = DISTRICT_NAMES.find((d) => lower.includes(d.toLowerCase()));
  return hit;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function coerceSeverity(value: unknown): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : "medium";
}

function coerceSentiment(value: unknown): "positive" | "neutral" | "negative" {
  if (value === "positive" || value === "negative") return value;
  return "neutral";
}

function coerceCategory(value: unknown): ComplaintCategory | undefined {
  return COMPLAINT_CATEGORIES.includes(value as ComplaintCategory)
    ? (value as ComplaintCategory)
    : undefined;
}

const CLASSIFY_SYSTEM_PROMPT = [
  "You triage citizen complaints for the Sabah Ministry of Education (KPSTI).",
  "Given a complaint title and description, respond with ONLY a single JSON object:",
  '{"severity":"low|medium|high|urgent","sentiment":"positive|neutral|negative",',
  ' "priorityScore":0-100,"sensitive":true|false,',
  ' "suggestedCategory":"one of the allowed categories or null","district":"district name in Sabah or null",',
  ' "summary":"one-sentence BM summary"}',
  "",
  "Severity guide: urgent = safety/life risk or ongoing harm; high = widespread impact or legal",
  "sensitivity; medium = normal complaint; low = suggestion or feedback.",
  "sensitive=true when the content involves minors' safety, abuse, self-harm, medical details or",
  "profanity. Allowed categories: " + COMPLAINT_CATEGORIES.join(", ") + ".",
  "Never invent districts outside Sabah. JSON only, no markdown fences, no commentary.",
].join("\n");

/**
 * Classify a complaint via the chat gateway. Throws on transport failure —
 * callers must catch and fall back to heuristics.
 */
export async function classifyComplaint(input: ClassifyInput): Promise<ComplaintAiAnalysis> {
  const env = loadEnv();
  const userContent = [
    `Category (citizen-selected): ${input.category}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    input.location ? `Location: ${input.location}` : undefined,
    input.districtCode ? `District code: ${input.districtCode}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await chatCompletion({
    baseUrl: env.AI_CHAT_BASE_URL,
    apiKey: env.AI_CHAT_API_KEY,
    model: env.AI_CHAT_MODEL,
    temperature: 0.1,
    maxTokens: 400,
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = res.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("classifier returned no JSON object");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

  const suggested = coerceCategory(parsed.suggestedCategory);
  const district = typeof parsed.district === "string" && parsed.district.trim() ? parsed.district.trim() : undefined;

  return {
    severity: coerceSeverity(parsed.severity),
    sentiment: coerceSentiment(parsed.sentiment),
    priorityScore: clampScore(Number(parsed.priorityScore)),
    sensitive: parsed.sensitive === true || containsUnsafe(`${input.title} ${input.description}`),
    autoCategory: false,
    suggestedCategory: suggested && suggested !== input.category ? suggested : undefined,
    district: district ?? extractDistrict(`${input.title} ${input.description} ${input.location ?? ""}`),
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 300) : input.title,
    model: env.AI_CHAT_MODEL,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Heuristic fallback used when the AI gateway is unreachable or returns
 * malformed output. Keyword-driven severity with conservative defaults.
 */
export function heuristicAnalysis(input: ClassifyInput): ComplaintAiAnalysis {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const urgentHits = ["bahaya", "cedera", "kecemasan", "tergemar", "rogol", "dadah", "senjata", "rempuh", "collapsed", "injured", "emergency"];
  const highHits = ["buli", "bully", " Ancaman", "racun", "vandalism", "kebakaran", "sekolah tutup", "wabak", "penyakit"];
  const lowHits = ["cadangan", "suggestion", "terima kasih", "puij", "puji", "feedback", "harapan"];

  let severity: Severity = "medium";
  if (urgentHits.some((k) => text.includes(k))) severity = "urgent";
  else if (highHits.some((k) => text.includes(k.toLowerCase()))) severity = "high";
  else if (lowHits.some((k) => text.includes(k)) && text.length < 200) severity = "low";

  const priorityBySeverity: Record<Severity, number> = { urgent: 95, high: 75, medium: 50, low: 20 };
  const sentiment: ComplaintAiAnalysis["sentiment"] = /terima kasih|puji|bagus|baik|thanks/.test(text)
    ? "positive"
    : /marah|kecewa|rosak|bocor|bahaya|tak selamat|danger|broken/.test(text)
      ? "negative"
      : "neutral";

  return {
    severity,
    sentiment,
    priorityScore: priorityBySeverity[severity],
    sensitive: containsUnsafe(text),
    autoCategory: false,
    district: extractDistrict(`${input.title} ${input.description} ${input.location ?? ""}`),
    summary: input.title,
    model: "heuristic",
    analyzedAt: new Date().toISOString(),
  };
}

/* ------------------------------ duplicates ------------------------------ */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Jaccard similarity over token sets — cheap, deterministic, explainable. */
export function textSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

/** Optional embedding-based similarity; falls back to lexical only. */
export async function embeddingSimilarity(
  a: string,
  b: string,
): Promise<number | undefined> {
  const env = loadEnv();
  if (!env.AI_EMBED_API_KEY || !env.AI_EMBED_BASE_URL) return undefined;
  try {
    const res = await generateEmbeddings({
      baseUrl: env.AI_EMBED_BASE_URL,
      apiKey: env.AI_EMBED_API_KEY,
      model: env.AI_EMBED_MODEL,
      input: [a, b],
      dimensions: env.AI_EMBED_DIMENSIONS,
    });
    const [ea, eb] = res.embeddings;
    if (!ea?.length || !eb?.length) return undefined;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < ea.length; i += 1) {
      const vi = ea[i] ?? 0;
      const wi = eb[i] ?? 0;
      dot += vi * wi;
      na += vi * vi;
      nb += wi * wi;
    }
    if (!na || !nb) return undefined;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  } catch {
    return undefined;
  }
}
