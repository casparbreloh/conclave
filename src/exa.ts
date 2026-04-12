import { Context, Effect, Layer } from "effect";
import Exa from "exa-js";

import { ExaError } from "./errors";

export const hasExaApiKey = Boolean(process.env.EXA_API_KEY);

export interface ExaService {
  readonly search: (query: string, opts: Record<string, any>) => Effect.Effect<any, ExaError>;
  readonly getContents: (urls: string[], opts: Record<string, any>) => Effect.Effect<any, ExaError>;
}

export const ExaService = Context.Service<ExaService>("ExaService");

const noopExaService: ExaService = {
  search: () => Effect.succeed({ results: [], output: undefined }),
  getContents: () => Effect.succeed({ results: [] }),
};

export const ExaServiceLive = hasExaApiKey
  ? Layer.sync(ExaService)(() => {
      const client = new Exa();
      return {
        search: (query, opts) =>
          Effect.tryPromise({
            try: () => client.search(query, opts),
            catch: (e) => new ExaError({ cause: e }),
          }),
        getContents: (urls, opts) =>
          Effect.tryPromise({
            try: () => client.getContents(urls, opts),
            catch: (e) => new ExaError({ cause: e }),
          }),
      };
    })
  : Layer.succeed(ExaService)(noopExaService);
