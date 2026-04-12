import { Schema } from "effect";

import rawConfig from "../config.json";

export const configSchema = Schema.Struct({
  models: Schema.NonEmptyArray(Schema.String),
  chairmanModel: Schema.String,
  sequentialThinking: Schema.Boolean,
  webSearch: Schema.Boolean,
  deepResearch: Schema.Boolean,
  lenses: Schema.NonEmptyArray(
    Schema.Struct({
      name: Schema.String,
      prompt: Schema.String,
    }),
  ),
});

export type Config = typeof configSchema.Type;

export const config = Schema.decodeUnknownSync(configSchema)(rawConfig, {
  onExcessProperty: "error",
});
