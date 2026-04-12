import { stepCountIs } from "@openrouter/sdk";

import { config } from "./config";
import { openrouter } from "./openrouter";
import { buildAgentPrompt, buildChairmanPrompt } from "./prompts";
import { getEnabledTools } from "./tools";

const MAX_AGENT_STEPS = 25;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ConclaveCallbacks {
  onModelComplete: (modelId: string) => void;
  onModelError: (modelId: string, error: Error) => void;
  onChairmanStart: () => void;
  onChairmanComplete: () => void;
}

export async function single(
  modelId: string,
  messages: Message[],
  conclave: boolean = false,
): Promise<string> {
  const enabledTools = getEnabledTools();
  const sessionId = crypto.randomUUID();

  try {
    const result = openrouter.callModel({
      model: modelId,
      sessionId,
      instructions: buildAgentPrompt(conclave),
      input: messages,
      tools: enabledTools.length > 0 ? enabledTools : undefined,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
    });
    return await result.getText();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (enabledTools.length > 0 && /no endpoints found that support tool use/i.test(msg)) {
      const result = openrouter.callModel({
        model: modelId,
        sessionId: crypto.randomUUID(),
        instructions: buildAgentPrompt(conclave),
        input: messages,
      });
      return await result.getText();
    }
    throw error;
  }
}

export async function conclave(messages: Message[], callbacks: ConclaveCallbacks): Promise<string> {
  const results = await Promise.allSettled(
    config.models.map(async (modelId) => {
      const text = await single(modelId, messages, true);
      callbacks.onModelComplete(modelId);
      return { modelId, text };
    }),
  );

  const responses: { modelId: string; text: string }[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "fulfilled") {
      responses.push(r.value);
    } else {
      const modelId = config.models[i]!;
      const err = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
      callbacks.onModelError(modelId, err);
    }
  }

  if (responses.length === 0) {
    throw new Error("All models failed to respond");
  }

  callbacks.onChairmanStart();

  const question = messages.findLast((m) => m.role === "user")?.content ?? "";
  const result = openrouter.callModel({
    model: config.chairmanModel,
    input: buildChairmanPrompt(question, responses),
  });

  const text = await result.getText();
  callbacks.onChairmanComplete();

  return text;
}
