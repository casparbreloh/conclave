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
