import { OpenRouterLanguageModel } from "@effect/ai-openrouter";
import { Effect } from "effect";
import { AiError, LanguageModel } from "effect/unstable/ai";

import { config } from "./config";
import { buildAgentPrompt, buildChairmanPrompt } from "./prompts";
import { AllToolsToolkit } from "./tools";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ModelError {
  modelId: string;
  error: AiError.AiError;
}

export interface ConclaveCallbacks {
  onModelComplete: (modelId: string) => void;
  onModelError: (modelId: string, error: AiError.AiError) => void;
  onChairmanStart: () => void;
  onChairmanComplete: () => void;
}

export const single = (modelId: string, messages: Message[], conclave: boolean = false) =>
  Effect.gen(function* () {
    const systemMessage: Message = { role: "system", content: buildAgentPrompt(conclave) };
    const response = yield* LanguageModel.generateText({
      prompt: [systemMessage, ...messages],
      toolkit: AllToolsToolkit,
    });
    return response.text;
  }).pipe(Effect.provide(OpenRouterLanguageModel.model(modelId)));

export const conclave = (messages: Message[], callbacks: ConclaveCallbacks) =>
  Effect.gen(function* () {
    const [failures, successes] = yield* Effect.partition(
      config.models,
      (modelId) =>
        single(modelId, messages, true).pipe(
          Effect.mapError((error): ModelError => ({ modelId, error })),
          Effect.tap(() => Effect.sync(() => callbacks.onModelComplete(modelId))),
          Effect.map((text) => ({ modelId, text })),
        ),
      { concurrency: "unbounded" },
    );

    for (const { modelId, error } of failures) {
      callbacks.onModelError(modelId, error);
    }

    if (successes.length === 0) {
      return yield* Effect.fail(
        failures[0]?.error ??
          AiError.make({
            module: "Conclave",
            method: "conclave",
            reason: new AiError.UnknownError({ description: "All models failed" }),
          }),
      );
    }

    callbacks.onChairmanStart();

    const question = messages.findLast((m) => m.role === "user")?.content ?? "";

    const chairmanResponse = yield* LanguageModel.generateText({
      prompt: buildChairmanPrompt(question, successes),
    }).pipe(Effect.provide(OpenRouterLanguageModel.model(config.chairmanModel)));

    callbacks.onChairmanComplete();

    return chairmanResponse.text;
  });
