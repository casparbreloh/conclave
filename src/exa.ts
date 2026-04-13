import { Context, Effect, Layer } from "effect";
import { AiError } from "effect/unstable/ai";
import * as Headers from "effect/unstable/http/Headers";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";

export const hasExaApiKey = Boolean(process.env.EXA_API_KEY);

export interface ExaSearchResult {
  results: Array<{
    title: string;
    url: string;
    highlights?: string[];
    text?: string;
  }>;
  output?: { content: string };
}

export interface ExaContentsResult {
  results: Array<{ title: string; url: string; text?: string }>;
}

export interface ExaService {
  readonly search: (
    query: string,
    opts: {
      numResults?: number;
      contents?: { highlights?: boolean; text?: boolean };
      type?: "deep" | "deep-reasoning";
    },
  ) => Effect.Effect<ExaSearchResult, AiError.AiError>;

  readonly getContents: (
    urls: readonly string[],
    opts: {
      text?: boolean;
      livecrawl?: string;
    },
  ) => Effect.Effect<ExaContentsResult, AiError.AiError>;
}

export const ExaService = Context.Service<ExaService>("ExaService");

const BASE_URL = "https://api.exa.ai";

const makeAiError = (method: string, error: unknown): AiError.AiError =>
  AiError.make({
    module: "Exa",
    method,
    reason: new AiError.UnknownError({ description: String(error) }),
  });

const noopExaService: ExaService = {
  search: () => Effect.succeed({ results: [] }),
  getContents: () => Effect.succeed({ results: [] }),
};

export const ExaServiceLive: Layer.Layer<ExaService, never, HttpClient.HttpClient> = hasExaApiKey
  ? Layer.effect(ExaService)(
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const apiKey = process.env.EXA_API_KEY!;

        const postJson = (
          method: string,
          url: string,
          body: unknown,
        ): Effect.Effect<unknown, AiError.AiError> =>
          client
            .post(url, {
              body: HttpBody.jsonUnsafe(body),
              headers: Headers.fromInput({
                "content-type": "application/json",
                "x-api-key": apiKey,
              }),
            })
            .pipe(
              Effect.flatMap((res) => res.json),
              Effect.mapError((error) => makeAiError(method, error)),
            );

        return {
          search: (query, opts) =>
            postJson("search", `${BASE_URL}/search`, { query, ...opts }).pipe(
              Effect.map((json) => json as ExaSearchResult),
            ),

          getContents: (urls, opts) =>
            postJson("getContents", `${BASE_URL}/contents`, { urls, ...opts }).pipe(
              Effect.map((json) => json as ExaContentsResult),
            ),
        };
      }),
    )
  : Layer.succeed(ExaService)(noopExaService);
