import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { hasPermission } from "@k-aecs/shared";
import type { Permission, Role } from "@k-aecs/shared";
import { webSearch } from "./web-search.js";
import { fetchUrl } from "./web-fetch.js";
import { queryComplaints, queryComplaintsSchema } from "./query-database.js";

export interface ToolContext {
  actorKind: "citizen" | "officer";
  actorId: string;
  role: Role | null;
  /** Telegram chat id the run originated from (citizen intake). */
  telegramChatId?: string;
  /** Optional sink so callers can capture structured tool output. */
  capture?: (toolName: string, data: unknown) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** If set, only officers holding this permission may invoke the tool. */
  permission?: Permission;
  /** If set, the tool is restricted to these roles (ANY role passes). */
  roles?: Role[];
  parameters: z.ZodTypeAny;
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  /** Max wall-clock milliseconds for the call; enforced by the harness. */
  timeoutMs?: number;
}

/** Cleaner OpenAPI schema for Pi's typebox converter. */
function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema as never, { target: "openApi3" });
  return ((json as any).definitions?.["schema"] ?? json) as Record<string, unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): this {
    this.tools.set(def.name, def);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  authorizedFor(ctx: { actorKind: "citizen" | "officer"; role: Role | null }): ToolDefinition[] {
    return [...this.tools.values()].filter((t) => this.allow(t, ctx));
  }

  private allow(
    t: ToolDefinition,
    ctx: { actorKind: "citizen" | "officer"; role: Role | null },
  ): boolean {
    if (t.roles) return Boolean(ctx.role && t.roles.includes(ctx.role));
    if (t.permission) return Boolean(ctx.role && hasPermission(ctx.role, t.permission));
    return true;
  }

  toPiTool(def: ToolDefinition) {
    return {
      name: def.name,
      description: def.description,
      parameters: toJsonSchema(def.parameters),
      label: def.name,
    };
  }
}

export function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "web_search",
    description:
      "Search the web and return result titles, snippets, and URLs. Use this for " +
      "current or external information, then read a promising result with fetch_url.",
    parameters: z.object({ query: z.string() }),
    timeoutMs: 20_000,
    execute: async (params) => {
      const query = String(params.query ?? "");
      if (!query.trim()) return "error: web_search needs a query";
      return webSearch(query);
    },
  });

  registry.register({
    name: "fetch_url",
    description:
      "Read a specific HTTP(S) page and return its title and useful text. " +
      "HTML, scripts, styles, and page chrome are removed automatically. Use this directly " +
      "after web_search. Set max_chars higher only when the default 12,000 characters are not enough.",
    parameters: z.object({
      url: z.string(),
      max_chars: z.number().min(1000).max(20_000).optional().default(12_000),
    }),
    timeoutMs: 25_000,
    execute: async (params) => {
      return fetchUrl(String(params.url ?? ""), Number(params.max_chars ?? 12_000));
    },
  });

  registry.register({
    name: "create_complaint",
    description:
      "File a citizen's complaint as an official ticket in K-AECS. ONLY call this after the " +
      "citizen has explicitly confirmed they want the complaint submitted (e.g. 'ya, hantar', " +
      "'submit it'). Requires: category (one of: facility, teacher, bullying, transport, canteen, " +
      "admission, funding, welfare, curriculum, other), title (min 5 chars), description (min 20 " +
      "chars, self-contained: what happened, where, when, desired outcome). The caller must be a " +
      "citizen on Telegram. Returns the official reference number — always relay it to the citizen.",
    parameters: z.object({
      category: z.string().min(3).max(20),
      title: z.string().min(5).max(200),
      description: z.string().min(20).max(4000),
      location: z.string().max(200).optional(),
    }),
    timeoutMs: 60_000,
    execute: async (params, ctx) => {
      const { createComplaintTicket } = await import("./create-complaint.js");
      return createComplaintTicket(params, ctx);
    },
  });

  registry.register({
    name: "query_complaints",
    description:
      "Run a read-only aggregate query over the complaint database. Use this for every " +
      "data question (counts, trends, rankings, averages). Choose ONE metric and ONE group_by, " +
      "then add optional filters. The tool returns rows, a chart suggestion and the applied " +
      "filters. Do not write SQL. Metrics: count (number of complaints), avg_resolution_hours " +
      "(average hours to resolve/close), avg_priority (average priority score 0-100). " +
      "group_by: district, category, status, severity, month, day, officer, none. " +
      "Filters: from/to (ISO date YYYY-MM-DD), status[], category[], severity[], " +
      "district_code[] (numeric district id), search (text), limit (1-50, default 10). " +
      "Examples: facility complaints this quarter by district => " +
      "{metric:'count',group_by:'district',category:['facility'],from:'2026-07-01'}; " +
      "monthly trend => {metric:'count',group_by:'month',from:'2026-01-01'}.",
    permission: "analytics:view",
    parameters: queryComplaintsSchema,
    timeoutMs: 20_000,
    execute: async (params, ctx) => queryComplaints(params, ctx),
  });

  return registry;
}
