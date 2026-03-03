import type { ModelMessage } from "@ai-sdk/provider-utils"
import { generateText } from "ai"

import { CHAIRMAN_MODEL, CONCLAVE_MODELS } from "./config"
import { openrouter } from "./openrouter"
import { buildChairmanPrompt } from "./prompts"

export type Message = Extract<ModelMessage, { role: "user" | "assistant" }>

export interface ConclaveCallbacks {
  onModelComplete: (modelId: string) => void
  onChairmanStart: () => void
  onChairmanComplete: () => void
}

export async function single(modelId: string, messages: Message[]): Promise<string> {
  const { text } = await generateText({
    model: openrouter(modelId),
    messages,
  })
  return text
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

  const question = messages.findLast((m) => m.role === "user")?.content as string
  const { text } = await generateText({
    model: openrouter(CHAIRMAN_MODEL),
    prompt: buildChairmanPrompt(question, responses),
  })

  callbacks.onChairmanComplete()

  return text
}
