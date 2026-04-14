import { Effect, Schema } from "effect";
import { AiError, Tool, Toolkit } from "effect/unstable/ai";
import Exa from "exa-js";

import { config } from "./config";

const hasExaApiKey = Boolean(process.env.EXA_API_KEY);

function wrapExaCall<T>(method: string, fn: () => Promise<T>): Effect.Effect<T, AiError.AiError> {
  return Effect.tryPromise({
    try: fn,
    catch: (error) =>
      AiError.make({
        module: "Exa",
        method,
        reason: new AiError.UnknownError({ description: String(error) }),
      }),
  });
}

const NumberLike = Schema.Union([Schema.Number, Schema.NumberFromString]);

export const WebSearch = Tool.make("webSearch", {
  description: "Search the web for current information, news, or facts.",
  parameters: Schema.Struct({
    query: Schema.String,
    numResults: Schema.optionalKey(Schema.NullOr(NumberLike)),
  }),
  success: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      highlights: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
    }),
  ),
}).annotate(Tool.Strict, false);

export const CrawlPages = Tool.make("crawlPages", {
  description: "Get full text content of specific web pages.",
  parameters: Schema.Struct({
    urls: Schema.Array(Schema.String),
  }),
  success: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      url: Schema.String,
      text: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
}).annotate(Tool.Strict, false);

export const SequentialThinking = Tool.make("sequentialThinking", {
  description: "Structured step-by-step reasoning with revisions and branches.",
  parameters: Schema.Struct({
    thought: Schema.String,
    nextThoughtNeeded: Schema.Boolean,
    thoughtNumber: NumberLike,
    totalThoughts: NumberLike,
    isRevision: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
    revisesThought: Schema.optionalKey(Schema.NullOr(NumberLike)),
    branchFromThought: Schema.optionalKey(Schema.NullOr(NumberLike)),
    branchId: Schema.optionalKey(Schema.NullOr(Schema.String)),
    needsMoreThoughts: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
  }),
  success: Schema.Struct({
    thoughtNumber: Schema.Number,
    totalThoughts: Schema.Number,
    nextThoughtNeeded: Schema.Boolean,
    branches: Schema.Array(Schema.String),
    thoughtHistoryLength: Schema.Number,
  }),
}).annotate(Tool.Strict, false);

export const AllToolsToolkit = Toolkit.make(WebSearch, CrawlPages, SequentialThinking);

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean | null;
  revisesThought?: number | null;
  branchFromThought?: number | null;
  branchId?: string | null;
  needsMoreThoughts?: boolean | null;
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
    input.revisesThought == null &&
    input.branchFromThought == null
  );
}

let currentStore: SequentialThinkingStore | undefined;

function getStore(input: ThoughtData): SequentialThinkingStore {
  if (shouldReset(input) || !currentStore) {
    currentStore = new SequentialThinkingStore();
  }
  return currentStore;
}

const exa = hasExaApiKey ? new Exa() : null;

export const ToolHandlersLive = AllToolsToolkit.toLayer({
  webSearch: (params) =>
    exa && config.webSearch
      ? wrapExaCall("search", () =>
          exa.search(params.query, {
            numResults: params.numResults ?? undefined,
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
    exa && config.webSearch
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
});
