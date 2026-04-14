import { tool, type Tool, type TurnContext } from "@openrouter/sdk";
import Exa from "exa-js";
import { z } from "zod";

import { config } from "./config";

const hasExaApiKey = Boolean(process.env.EXA_API_KEY);
const exa = hasExaApiKey ? new Exa() : null;

const webSearch = tool({
  name: "webSearch",
  description:
    "Search the web for current information, news, or facts. Use for anything time-sensitive, recent, or where your training data is likely outdated.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    numResults: z.number().optional().default(5).describe("Number of results to return"),
  }),
  execute: async ({ query, numResults }) => {
    const { results } = await exa!.search(query, {
      numResults,
      contents: { highlights: true },
    });
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      highlights: r.highlights,
    }));
  },
});

const crawlPages = tool({
  name: "crawlPages",
  description:
    "Get full text content of specific web pages. Use after webSearch to dive deeper into relevant pages.",
  inputSchema: z.object({
    urls: z.array(z.string()).describe("URLs to extract content from"),
  }),
  execute: async ({ urls }) => {
    const { results } = await exa!.getContents(urls, {
      text: true,
      livecrawl: "always",
    });
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      text: r.text,
    }));
  },
});

// Sequential Thinking

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

class SequentialThinkingStore {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};

  processThought(input: ThoughtData) {
    const normalized =
      input.thoughtNumber > input.totalThoughts
        ? { ...input, totalThoughts: input.thoughtNumber }
        : input;

    this.thoughtHistory.push(normalized);

    if (normalized.branchFromThought && normalized.branchId) {
      if (!this.branches[normalized.branchId]) {
        this.branches[normalized.branchId] = [];
      }
      this.branches[normalized.branchId]!.push(normalized);
    }

    return {
      thoughtNumber: normalized.thoughtNumber,
      totalThoughts: normalized.totalThoughts,
      nextThoughtNeeded: normalized.nextThoughtNeeded,
      branches: Object.keys(this.branches),
      thoughtHistoryLength: this.thoughtHistory.length,
    };
  }
}

const stores = new Map<string, SequentialThinkingStore>();

function resolveStoreKey(context?: TurnContext): string {
  const sessionId = context?.turnRequest?.sessionId;
  if (typeof sessionId === "string" && sessionId.length > 0) return `session:${sessionId}`;
  const callId = context?.toolCall?.callId;
  if (typeof callId === "string" && callId.length > 0) return `call:${callId}`;
  return "default";
}

function shouldReset(input: ThoughtData): boolean {
  return (
    input.thoughtNumber === 1 &&
    input.isRevision !== true &&
    input.revisesThought === undefined &&
    input.branchFromThought === undefined
  );
}

function getStore(input: ThoughtData, context?: TurnContext): SequentialThinkingStore {
  const key = resolveStoreKey(context);
  if (shouldReset(input) || !stores.has(key)) {
    const store = new SequentialThinkingStore();
    stores.set(key, store);
    return store;
  }
  return stores.get(key)!;
}

const sequentialThinking = tool({
  name: "sequentialThinking",
  description:
    "Structured step-by-step reasoning with revisions and branches. Use liberally to break down complex questions and revisit assumptions.",
  inputSchema: z.object({
    thought: z.string().describe("Your current thinking step"),
    nextThoughtNeeded: z.boolean().describe("Whether another thought step is needed"),
    thoughtNumber: z.number().int().min(1).describe("Current thought number"),
    totalThoughts: z.number().int().min(1).describe("Estimated total thoughts needed"),
    isRevision: z.boolean().optional().describe("Whether this revises previous thinking"),
    revisesThought: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Which thought is being reconsidered"),
    branchFromThought: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Branching point thought number"),
    branchId: z.string().optional().describe("Branch identifier"),
    needsMoreThoughts: z.boolean().optional().describe("If more thoughts are needed"),
  }),
  outputSchema: z.object({
    thoughtNumber: z.number(),
    totalThoughts: z.number(),
    nextThoughtNeeded: z.boolean(),
    branches: z.array(z.string()),
    thoughtHistoryLength: z.number(),
  }),
  execute: async (input, context) => getStore(input, context).processThought(input),
});

const TOOLS: { tool: Tool; isEnabled: () => boolean }[] = [
  { tool: webSearch, isEnabled: () => Boolean(exa) && config.webSearch },
  { tool: crawlPages, isEnabled: () => Boolean(exa) && config.webSearch },
  { tool: sequentialThinking, isEnabled: () => config.sequentialThinking },
];

export function getEnabledTools() {
  return TOOLS.filter((t) => t.isEnabled()).map((t) => t.tool);
}
