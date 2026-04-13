import { Context, Effect, Layer } from "effect";
import { AiError } from "effect/unstable/ai";
import Exa from "exa-js";

export const hasExaApiKey = Boolean(process.env.EXA_API_KEY);

export interface ExaService {
  readonly client: Exa;
}

export const ExaService = Context.Service<ExaService>("ExaService");

export function wrapExaCall<T>(
  method: string,
  fn: () => Promise<T>,
): Effect.Effect<T, AiError.AiError> {
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

export const ExaServiceLive: Layer.Layer<ExaService> = hasExaApiKey
  ? Layer.sync(ExaService)(() => ({ client: new Exa() }))
  : Layer.succeed(ExaService)({ client: new Exa("noop") });
