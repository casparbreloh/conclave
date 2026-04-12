import { tool } from "@openrouter/sdk";
import type Exa from "exa-js";
import { z } from "zod";

import type { Config } from "../config";

type ExaClient = InstanceType<typeof Exa>;

export function deepResearchTool(config: Config, exa: ExaClient) {
  const deepResearch = tool({
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
      const result = await exa.search(query, {
        type: mode,
        numResults,
        contents: {
          highlights: true,
          text: true,
        },
      });

      return {
        results: result.results.map((entry) => ({
          title: entry.title,
          url: entry.url,
          highlights: entry.highlights,
          text: entry.text,
        })),
        output: result.output?.content,
      };
    },
  });

  return {
    tool: deepResearch,
    isEnabled: config.deepResearch,
    promptLine:
      "- deepResearch: use Exa Deep for complex multi-part research when standard web lookup is not enough.",
  } as const;
}
