import { stepCountIs } from "@openrouter/sdk"

import { CHAIRMAN_MODEL, CONCLAVE_MODELS, MAX_AGENT_STEPS } from "./config"
import { openrouter } from "./openrouter"
import { AGENT_PROMPT, buildChairmanPrompt } from "./prompts"
import * as tools from "./tools"

export interface Message {
  role: "user" | "assistant"
  content: string
}

export interface ConclaveCallbacks {
  onModelComplete: (modelId: string) => void
  onChairmanStart: () => void
  onChairmanComplete: () => void
}

export async function single(modelId: string, messages: Message[]): Promise<string> {
  const result = openrouter.callModel({
    model: modelId,
    instructions: AGENT_PROMPT,
    input: messages,
    tools: [tools.webSearch, tools.crawlPages],
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
  })
  return result.getText()
}

export async function conclave(messages: Message[], callbacks: ConclaveCallbacks): Promise<string> {
  const responses = await Promise.all(
    CONCLAVE_MODELS.map(async (modelId) => {
      const text = await single(modelId, messages)
      callbacks.onModelComplete(modelId)
      return { modelId, text }
    }),
  )

  callbacks.onChairmanStart()

  const question = messages.findLast((m) => m.role === "user")?.content ?? ""
  const result = openrouter.callModel({
    model: CHAIRMAN_MODEL,
    input: buildChairmanPrompt(question, responses),
  })

  callbacks.onChairmanComplete()

  return result.getText()
}
