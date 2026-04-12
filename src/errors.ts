import { Data } from "effect";

export class ModelCallError extends Data.TaggedError("ModelCallError")<{
  readonly modelId: string;
  readonly cause: unknown;
}> {}

export class AllModelsFailedError extends Data.TaggedError("AllModelsFailedError")<{
  readonly errors: ReadonlyArray<ModelCallError>;
}> {}

export class ExaError extends Data.TaggedError("ExaError")<{
  readonly cause: unknown;
}> {}
