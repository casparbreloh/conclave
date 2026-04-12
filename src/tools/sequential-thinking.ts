import { tool, type TurnContext } from "@openrouter/sdk";
import { z } from "zod";

import type { Config } from "../config";

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
    const normalizedInput =
      input.thoughtNumber > input.totalThoughts
        ? { ...input, totalThoughts: input.thoughtNumber }
        : input;

    this.thoughtHistory.push(normalizedInput);

    if (normalizedInput.branchFromThought && normalizedInput.branchId) {
      if (!this.branches[normalizedInput.branchId]) {
        this.branches[normalizedInput.branchId] = [];
      }

      this.branches[normalizedInput.branchId]!.push(normalizedInput);
    }

    return {
      thoughtNumber: normalizedInput.thoughtNumber,
      totalThoughts: normalizedInput.totalThoughts,
      nextThoughtNeeded: normalizedInput.nextThoughtNeeded,
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
    "Structured step-by-step reasoning with support for revisions and branching when solving complex problems.",
  inputSchema: z.object({
    thought: z.string().describe("Your current thinking step"),
    nextThoughtNeeded: z.boolean().describe("Whether another thought step is needed"),
    thoughtNumber: z
      .number()
      .int()
      .min(1)
      .describe("Current thought number (numeric value, e.g., 1, 2, 3)"),
    totalThoughts: z
      .number()
      .int()
      .min(1)
      .describe("Estimated total thoughts needed (numeric value, e.g., 5, 10)"),
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

export function sequentialThinkingTool(config: Config) {
  return {
    tool: sequentialThinking,
    isEnabled: config.sequentialThinking,
    promptLine:
      "- sequentialThinking: structured step-by-step reasoning with revisions and branches; use when a problem needs iterative analysis.",
  } as const;
}
