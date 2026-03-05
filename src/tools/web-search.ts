import { tool } from "@openrouter/sdk"
import Exa from "exa-js"
import { z } from "zod"

import { config } from "../config"

const hasExaApiKey = () => Boolean(process.env.EXA_API_KEY)

export const webSearch = tool({
  name: "webSearch",
  description:
    "Search the web for any topic and get clean, ready-to-use content. Use for current information, news, facts, or answering questions.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    numResults: z.number().optional().default(5).describe("Number of results to return"),
  }),
  execute: async ({ query, numResults }) => {
    if (!hasExaApiKey()) throw new Error("EXA_API_KEY is required to use webSearch")
    const exa = new Exa()

    const { results } = await exa.search(query, {
      numResults,
      contents: { highlights: true },
    })

    return results.map((result) => ({
      title: result.title,
      url: result.url,
      highlights: result.highlights,
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
    if (!hasExaApiKey()) throw new Error("EXA_API_KEY is required to use crawlPages")
    const exa = new Exa()

    const { results } = await exa.getContents(urls, {
      text: true,
      livecrawl: "preferred",
    })

    return results.map((result) => ({
      title: result.title,
      url: result.url,
      text: result.text,
    }))
  },
})

export const webSearchTools = [
  {
    tool: webSearch,
    isEnabled: () => hasExaApiKey() && config.webSearch,
    promptLine:
      "- webSearch: find current information, news, or facts; start here when you need web grounding.",
  },
  {
    tool: crawlPages,
    isEnabled: () => hasExaApiKey() && config.webSearch,
    promptLine:
      "- crawlPages: read full content from specific URLs after identifying relevant pages.",
  },
]
