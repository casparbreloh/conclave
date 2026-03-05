import { tool } from "@openrouter/sdk"
import Exa from "exa-js"
import { z } from "zod"

import { config } from "../config"

const hasExaApiKey = () => Boolean(process.env.EXA_API_KEY)

export const deepResearch = tool({
  name: "deepResearch",
  description:
    "Run Exa Deep search for complex multi-part queries requiring stronger synthesis and reasoning.",
  inputSchema: z.object({
    query: z.string().describe("Complex research query"),
    mode: z
      .enum(["deep", "deep-reasoning"])
      .optional()
      .default("deep")
      .describe("Exa Deep mode. Use deep-reasoning for harder research questions."),
    numResults: z.number().int().positive().max(25).optional().default(5),
  }),
  execute: async ({ query, mode, numResults }) => {
    if (!hasExaApiKey()) throw new Error("EXA_API_KEY is required to use deepResearch")
    const exa = new Exa()

    const result = await exa.search(query, {
      type: mode,
      numResults,
      contents: {
        highlights: true,
        text: true,
      },
    })

    return {
      results: result.results.map((entry) => ({
        title: entry.title,
        url: entry.url,
        highlights: entry.highlights,
        text: entry.text,
      })),
      output: result.output?.content,
    }
  },
})

export const deepResearchTool = {
  tool: deepResearch,
  isEnabled: () => hasExaApiKey() && config.deepResearch,
  promptLine:
    "- deepResearch: use Exa Deep for complex multi-part research when standard web lookup is not enough.",
}
