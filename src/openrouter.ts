import { OpenRouter } from "@openrouter/sdk";
import type { CallModelInput, StopCondition, Tool } from "@openrouter/sdk";
import { Context, Effect, Layer } from "effect";

import { ModelCallError } from "./errors";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface OpenRouterService {
  readonly callModel: (opts: {
    model: string;
    sessionId?: string;
    instructions?: string;
    input: Message[] | string;
    tools?: Tool[];
    stopWhen?: StopCondition;
  }) => Effect.Effect<string, ModelCallError>;
}

export const OpenRouterService = Context.Service<OpenRouterService>("OpenRouterService");

export const OpenRouterServiceLive = Layer.sync(OpenRouterService)(() => {
  const client = new OpenRouter();
  return {
    callModel: (opts) =>
      Effect.tryPromise({
        try: () => client.callModel(opts as CallModelInput).getText(),
        catch: (e) => new ModelCallError({ modelId: opts.model, cause: e }),
      }),
  };
});
