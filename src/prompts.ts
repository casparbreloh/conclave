import { getEnabledToolLines } from "./tools"

export function buildAgentPrompt(): string {
  const toolLines = getEnabledToolLines()

  if (toolLines.length === 0) {
    return "You are a knowledgeable AI assistant. Answer questions accurately and concisely."
  }

  return `You are a knowledgeable AI assistant. Answer questions accurately and concisely.

You have tools available:
${toolLines.join("\n")}

Tool policy:
- Use tools when the question requires current or uncertain information.
- Keep tool usage efficient: do at most 10 tool calls for a single user request.
- If you already know the answer confidently and it is not time-sensitive, answer directly.`
}

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
