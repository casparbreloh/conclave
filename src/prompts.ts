import { getEnabledToolLines } from "./tools";

export function buildAgentPrompt(): string {
  const toolLines = getEnabledToolLines();

  const diversity = `Think independently. Don't default to the safest or most conventional answer.
If you see a non-obvious angle or contrarian insight, include it — even if it goes against common wisdom.`;

  if (toolLines.length === 0) {
    return `You are a knowledgeable AI assistant. Answer questions accurately and concisely.

${diversity}`;
  }

  return `You are a knowledgeable AI assistant. Answer questions accurately and concisely.

${diversity}

You have tools available:
${toolLines.join("\n")}

Tool policy:
- Use tools when the question requires current or uncertain information.
- Keep tool usage efficient: do at most 10 tool calls for a single user request.
- If you already know the answer confidently and it is not time-sensitive, answer directly.`;
}

export function buildChairmanPrompt(
  question: string,
  responses: { modelId: string; text: string }[],
): string {
  const responsesSection = responses.map((r) => `### ${r.modelId}\n${r.text}`).join("\n\n");

  return `You are the chairman of an AI council. Synthesize the collective wisdom of multiple AI models into a single, comprehensive answer.

**Question:** ${question}

## Council Responses

${responsesSection}

Synthesize the best answer by:
- Identifying where models agree — this forms the foundation
- Highlighting unique insights that only one or two models raised
- When models contradict each other, evaluate the reasoning on both sides rather than defaulting to majority vote
- If a model raised a non-obvious or contrarian point with strong reasoning, give it weight even if it's an outlier
- Provide a clear, direct conclusion — avoid hedging when the evidence points in one direction

Provide your synthesized answer directly, without meta-commentary about the process.`;
}
