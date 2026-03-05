import { tool } from "@openrouter/sdk"
import Exa from "exa-js"
import { z } from "zod"

export const webSearch = tool({
  name: "webSearch",
  description:
    "Search the web for any topic and get clean, ready-to-use content. Use for current information, news, facts, or answering questions.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    numResults: z.number().optional().default(5).describe("Number of results to return"),
  }),
  execute: async ({ query, numResults }) => {
    const exa = new Exa()
    const { results } = await exa.search(query, {
      numResults,
      contents: { highlights: true },
    })

    return results.map((r) => ({
      title: r.title,
      url: r.url,
      highlights: r.highlights,
    }))
  },
})

export const crawlPages = tool({
  name: "crawlPages",
  description:
    "Get the full text content of specific web pages. Use when you have exact URLs you want to read in full.",
  inputSchema: z.object({
    urls: z.array(z.string()).describe("URLs to extract content from"),
  }),
  execute: async ({ urls }) => {
    const exa = new Exa()
    const { results } = await exa.getContents(urls, {
      text: true,
      livecrawl: "preferred",
    })

    return results.map((r) => ({
      title: r.title,
      url: r.url,
      text: r.text,
    }))
  },
})

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
      results: result.results.map((r) => ({
        title: r.title,
        url: r.url,
        highlights: r.highlights,
        text: r.text,
      })),
      output: result.output?.content,
    }
  },
})
