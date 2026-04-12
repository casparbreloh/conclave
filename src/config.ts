import { z } from "zod";

import rawConfig from "../config.json";

export const configSchema = z
  .object({
    models: z.array(z.string()).min(1),
    chairmanModel: z.string(),
    sequentialThinking: z.boolean(),
    webSearch: z.boolean(),
    deepResearch: z.boolean(),
    lenses: z.array(z.object({ name: z.string(), prompt: z.string() })).min(1),
  })
  .strict();

export const config = configSchema.parse(rawConfig);
