import { tool } from "@openrouter/sdk";
import type Exa from "exa-js";
import { z } from "zod";

import type { Config } from "../config";

type ExaClient = InstanceType<typeof Exa>;

export function webSearchTools(config: Config, exa: ExaClient) {
  const webSearch = tool({
    name: "webSearch",
    description:
      "Search the web for any topic and get clean, ready-to-use content. Use for current information, news, facts, or answering questions.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      numResults: z.number().optional().default(5).describe("Number of results to return"),
    }),
    execute: async ({ query, numResults }) => {
      const { results } = await exa.search(query, {
        numResults,
        contents: { highlights: true },
      });

      return results.map((result) => ({
        title: result.title,
        url: result.url,
        highlights: result.highlights,
      }));
    },
  });

  const crawlPages = tool({
    name: "crawlPages",
    description:
      "Get the full text content of specific web pages. Use when you have exact URLs you want to read in full.",
    inputSchema: z.object({
      urls: z.array(z.string()).describe("URLs to extract content from"),
    }),
    execute: async ({ urls }) => {
      const { results } = await exa.getContents(urls, {
        text: true,
        livecrawl: "preferred",
      });

      return results.map((result) => ({
        title: result.title,
        url: result.url,
        text: result.text,
      }));
    },
  });

  return [
    {
      tool: webSearch,
      isEnabled: config.webSearch,
      promptLine:
        "- webSearch: find current information, news, or facts; start here when you need web grounding.",
    },
    {
      tool: crawlPages,
      isEnabled: config.webSearch,
      promptLine:
        "- crawlPages: read full content from specific URLs after identifying relevant pages.",
    },
  ] as const;
}
