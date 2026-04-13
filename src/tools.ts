import { Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

import { config } from "./config";
import { ExaService, hasExaApiKey, wrapExaCall } from "./exa";

export const WebSearch = Tool.make("webSearch", {
  description: "Search the web for current information, news, or facts.",
  parameters: Schema.Struct({
    query: Schema.String,
    numResults: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      highlights: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
});

export const CrawlPages = Tool.make("crawlPages", {
  description: "Get full text content of specific web pages.",
  parameters: Schema.Struct({
    urls: Schema.Array(Schema.String),
  }),
  success: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      text: Schema.optional(Schema.String),
    }),
  ),
});

export const DeepResearch = Tool.make("deepResearch", {
  description: "Run deep search for complex multi-part research queries.",
  parameters: Schema.Struct({
    query: Schema.String,
    mode: Schema.optional(Schema.Literals(["deep", "deep-reasoning"])),
    numResults: Schema.optional(Schema.Number),
  }),
  success: Schema.Struct({
    results: Schema.Array(
      Schema.Struct({
        title: Schema.String,
        url: Schema.String,
        highlights: Schema.optional(Schema.Array(Schema.String)),
        text: Schema.optional(Schema.String),
      }),
    ),
    output: Schema.optional(Schema.Struct({ content: Schema.String })),
  }),
});

export const SequentialThinking = Tool.make("sequentialThinking", {
  description: "Structured step-by-step reasoning with revisions and branches.",
  parameters: Schema.Struct({
    thought: Schema.String,
    nextThoughtNeeded: Schema.Boolean,
    thoughtNumber: Schema.Number,
    totalThoughts: Schema.Number,
    isRevision: Schema.optional(Schema.Boolean),
    revisesThought: Schema.optional(Schema.Number),
    branchFromThought: Schema.optional(Schema.Number),
    branchId: Schema.optional(Schema.String),
    needsMoreThoughts: Schema.optional(Schema.Boolean),
  }),
  success: Schema.Struct({
    thoughtNumber: Schema.Number,
    totalThoughts: Schema.Number,
    nextThoughtNeeded: Schema.Boolean,
    branches: Schema.Array(Schema.String),
    thoughtHistoryLength: Schema.Number,
  }),
});

export const AllToolsToolkit = Toolkit.make(
  WebSearch,
  CrawlPages,
  DeepResearch,
  SequentialThinking,
);

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

function shouldReset(input: ThoughtData): boolean {
  return (
    input.thoughtNumber === 1 &&
    input.isRevision !== true &&
    input.revisesThought === undefined &&
    input.branchFromThought === undefined
  );
}

let currentStore: SequentialThinkingStore | undefined;

function getStore(input: ThoughtData): SequentialThinkingStore {
  if (shouldReset(input) || !currentStore) {
    currentStore = new SequentialThinkingStore();
  }
  return currentStore;
}

export const ToolHandlersLive = AllToolsToolkit.toLayer(
  Effect.gen(function* () {
    const { client: exa } = yield* ExaService;

    return {
      webSearch: (params) =>
        config.webSearch && hasExaApiKey
          ? wrapExaCall("search", () =>
              exa.search(params.query, {
                numResults: params.numResults,
                contents: { highlights: true },
              }),
            ).pipe(
              Effect.map((r) =>
                r.results.map((entry) => ({
                  title: entry.title ?? "",
                  url: entry.url,
                  highlights: entry.highlights,
                })),
              ),
            )
          : Effect.succeed([]),

      crawlPages: (params) =>
        config.webSearch && hasExaApiKey
          ? wrapExaCall("getContents", () =>
              exa.getContents([...params.urls], { text: true, livecrawl: "always" }),
            ).pipe(
              Effect.map((r) =>
                r.results.map((entry) => ({
                  title: entry.title ?? "",
                  url: entry.url,
                  text: entry.text ?? undefined,
                })),
              ),
            )
          : Effect.succeed([]),

      deepResearch: (params) =>
        config.deepResearch && hasExaApiKey
          ? wrapExaCall("search", () =>
              exa.search(params.query, {
                numResults: params.numResults,
                type: params.mode,
              }),
            ).pipe(
              Effect.map((r) => ({
                results: r.results.map((entry) => ({
                  title: entry.title ?? "",
                  url: entry.url,
                  highlights:
                    "highlights" in entry ? (entry.highlights as readonly string[]) : undefined,
                  text: entry.text ?? undefined,
                })),
                output:
                  typeof r.output?.content === "string" ? { content: r.output.content } : undefined,
              })),
            )
          : Effect.succeed({ results: [] }),

      sequentialThinking: (params) =>
        config.sequentialThinking
          ? Effect.succeed(getStore(params).processThought(params))
          : Effect.succeed({
              thoughtNumber: params.thoughtNumber,
              totalThoughts: params.totalThoughts,
              nextThoughtNeeded: false,
              branches: [],
              thoughtHistoryLength: 0,
            }),
    };
  }),
);
