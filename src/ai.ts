import { stepCountIs } from "@openrouter/sdk";
import type { Tool } from "@openrouter/sdk";
import { Effect } from "effect";

import { config } from "./config";
import { AllModelsFailedError, ModelCallError } from "./errors";
import { OpenRouterService } from "./openrouter";
import type { Message } from "./openrouter";
import { buildAgentPrompt, buildChairmanPrompt } from "./prompts";

export type { Message } from "./openrouter";

const MAX_AGENT_STEPS = 25;

export interface ConclaveCallbacks {
  onModelComplete: (modelId: string) => void;
  onModelError: (modelId: string, error: ModelCallError) => void;
  onChairmanStart: () => void;
  onChairmanComplete: () => void;
}

export const single = (
  modelId: string,
  messages: Message[],
  enabledTools: Tool[],
  conclave: boolean = false,
) =>
  Effect.gen(function* () {
    const svc = yield* OpenRouterService;
    const sessionId = crypto.randomUUID();

    const result = yield* svc
      .callModel({
        model: modelId,
        sessionId,
        instructions: buildAgentPrompt(conclave),
        input: messages,
        tools: enabledTools.length > 0 ? enabledTools : undefined,
        stopWhen: stepCountIs(MAX_AGENT_STEPS),
      })
      .pipe(
        Effect.catchTag("ModelCallError", (err) => {
          const msg =
            err.cause instanceof Error
              ? err.cause.message
              : String(err.cause);
          if (
            enabledTools.length > 0 &&
            /no endpoints found that support tool use/i.test(msg)
          ) {
            return svc.callModel({
              model: modelId,
              sessionId: crypto.randomUUID(),
              instructions: buildAgentPrompt(conclave),
              input: messages,
            });
          }
          return Effect.fail(err);
        }),
      );

    return result;
  });

export const conclave = (
  messages: Message[],
  enabledTools: Tool[],
  callbacks: ConclaveCallbacks,
) =>
  Effect.gen(function* () {
    const svc = yield* OpenRouterService;

    const [failures, successes] = yield* Effect.partition(
      config.models,
      (modelId) =>
        single(modelId, messages, enabledTools, true).pipe(
          Effect.tap(() => Effect.sync(() => callbacks.onModelComplete(modelId))),
          Effect.map((text) => ({ modelId, text })),
        ),
      { concurrency: "unbounded" },
    );

    for (const err of failures) {
      const modelId = err.modelId;
      callbacks.onModelError(modelId, err);
    }

    if (successes.length === 0) {
      return yield* Effect.fail(
        new AllModelsFailedError({ errors: failures }),
      );
    }

    callbacks.onChairmanStart();

    const question =
      messages.findLast((m) => m.role === "user")?.content ?? "";

    const text = yield* svc.callModel({
      model: config.chairmanModel,
      input: buildChairmanPrompt(question, successes),
    });

    callbacks.onChairmanComplete();

    return text;
  });
