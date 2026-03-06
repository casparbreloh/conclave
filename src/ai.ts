import { stepCountIs } from "@openrouter/sdk"

import { config } from "./config"
import { openrouter } from "./openrouter"
import { AGENT_PROMPT, buildChairmanPrompt } from "./prompts"
import { getEnabledTools } from "./tools"

const MAX_AGENT_STEPS = 25

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
  const enabledTools = getEnabledTools()
  const sessionId = crypto.randomUUID()
  const result = openrouter.callModel({
    model: modelId,
    sessionId,
    instructions: AGENT_PROMPT,
    input: messages,
    tools: enabledTools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
  })
  return result.getText()
}

export async function conclave(messages: Message[], callbacks: ConclaveCallbacks): Promise<string> {
  const responses = await Promise.all(
    config.models.map(async (modelId) => {
      const text = await single(modelId, messages)
      callbacks.onModelComplete(modelId)
      return { modelId, text }
    }),
  )

  callbacks.onChairmanStart()

  const question = messages.findLast((m) => m.role === "user")?.content ?? ""
  const result = openrouter.callModel({
    model: config.chairmanModel,
    input: buildChairmanPrompt(question, responses),
  })

  const text = await result.getText()
  callbacks.onChairmanComplete()

  return text
}
