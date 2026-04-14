import { config } from "./config";

const DIVERSITY = `Think independently. Don't default to the safest or most conventional answer.
If you see a non-obvious angle or contrarian insight, include it — even if it goes against common wisdom.`;

const TOOL_POLICY = `\n\nTool policy:
- Keep tool usage efficient: do at most 10 tool calls for a single user request.
- If you already know the answer confidently and it is not time-sensitive, answer directly.`;

export function buildAgentPrompt(conclave: boolean = false): string {
  if (!conclave) {
    return `You are a knowledgeable AI assistant. Answer questions accurately and concisely.

${DIVERSITY}${TOOL_POLICY}`;
  }

  const verbalizedSampling = `## Analytical Approach

Before forming your answer:
1. Consider 3 different analytical angles on the question.
2. Estimate how typical each angle is (high = most people would give this answer, low = non-obvious).
3. Lead with the least typical angle — surface suppressed, non-obvious insights.
4. State your recommendation clearly (not "it depends").
5. Provide the single strongest piece of evidence.
6. Flag what your perspective is NOT considering.
7. Prioritize the non-obvious angle over the expected one.`;

  const lensLines = config.lenses.map((l) => `**${l.name}:** ${l.prompt}`).join("\n");
  const lenses = `## Analysis Lenses

Apply each of these lenses to your analysis:

${lensLines}`;

  return `You are a knowledgeable AI assistant. Answer questions accurately and concisely.

${DIVERSITY}

${verbalizedSampling}

${lenses}${TOOL_POLICY}`;
}

export function buildChairmanPrompt(
  question: string,
  responses: { modelId: string; text: string }[],
): string {
  const responsesSection = responses.map((r) => `### ${r.modelId}\n${r.text}`).join("\n\n");

  return `You are the chairman of an AI council. Read the council responses below, then produce a Decision Brief.

**Question:** ${question}

## Council Responses

${responsesSection}

## Instructions

Produce a Decision Brief in exactly this format:

THE QUESTION: [restate — reframe if wrong question]
WHERE PERSPECTIVES AGREE: [2-3 convergence points]
WHERE PERSPECTIVES DISAGREE: [tensions with both sides' reasoning — highlight any tail-distribution insights that challenge the consensus]
RISK: [failure mode, one sentence]
BLIND SPOT: [unquestioned assumption, one sentence]
OPPORTUNITY: [unseen upside, one sentence]
VERDICT: [clear recommendation, 2-3 sentences — not "it depends"]
TEST IT THIS WEEK: [specific action + metric + threshold]

Rules:
- Under 500 words
- No process explanation or meta-commentary
- Verdict must be a clear recommendation, never "it depends"
- Prioritize surprising, non-obvious findings over expected analysis
- When models contradict, evaluate reasoning quality rather than defaulting to majority
- If a model raised a non-obvious point with strong reasoning, give it weight even as an outlier`;
}
