import { z } from "zod"

import rawConfig from "../config.json"

const configSchema = z
  .object({
    models: z.array(z.string()).min(1),
    chairmanModel: z.string(),
    webSearch: z.boolean(),
    deepResearch: z.boolean(),
  })
  .strict()

export const config = configSchema.parse(rawConfig)
