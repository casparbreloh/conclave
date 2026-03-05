import { config } from "./config"

const hasExaApiKey = Boolean(process.env.EXA_API_KEY)

function buildToolSection(): string {
  const lines: string[] = []

  if (hasExaApiKey && config.webSearch) {
    lines.push(
      "- webSearch: find current information, news, or facts. Start here for web grounding.",
    )
    lines.push("- crawlPages: read full page content for URLs you already identified as relevant.")
  }

  if (hasExaApiKey && config.deepResearch) {
    lines.push(
      "- deepResearch: use Exa Deep only for complex, multi-part research that needs stronger synthesis.",
    )
  }

  return lines.join("\n")
}

function buildToolPolicySection(): string {
  const lines = ["- Use tools when the question requires current or uncertain information."]

  if (hasExaApiKey && config.webSearch) {
    lines.push("- Prefer webSearch + crawlPages for normal lookups.")
  }

  if (hasExaApiKey && config.deepResearch) {
    lines.push(
      "- Use deepResearch only when standard search/crawl is insufficient for complex synthesis.",
    )
  }

  lines.push("- Keep tool usage efficient: do at most 10 tool calls for a single user request.")

  lines.push(
    "- If you already know the answer confidently and it is not time-sensitive, answer directly.",
  )

  return lines.join("\n")
}

export const AGENT_PROMPT = `You are a knowledgeable AI assistant. Answer questions accurately and concisely.

You have tools available:
${buildToolSection()}

Tool policy:
${buildToolPolicySection()}`

export function buildChairmanPrompt(
  question: string,
  responses: { modelId: string; text: string }[],
): string {
  const responsesSection = responses.map((r) => `### ${r.modelId}\n${r.text}`).join("\n\n")

  return `You are the chairman of an AI council. Synthesize the collective wisdom of multiple AI models into a single, comprehensive answer.

**Question:** ${question}

## Council Responses

${responsesSection}

Synthesize the best answer by:
- Prioritizing points of agreement across models
- Incorporating unique insights from the strongest responses
- Resolving contradictions using the majority view and strongest reasoning
- Producing a clear, comprehensive response that exceeds any individual answer

Provide your synthesized answer directly, without meta-commentary about the process.`
}
