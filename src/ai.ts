import { generateText } from "ai"

import { CHAIRMAN_MODEL, CONCLAVE_MODELS } from "./config"
import { openrouter } from "./openrouter"
import { buildChairmanPrompt } from "./prompts"

export interface ConclaveCallbacks {
  onModelComplete: (modelId: string) => void
  onChairmanStart: () => void
  onChairmanComplete: () => void
}

export async function single(modelId: string, question: string): Promise<string> {
  const { text } = await generateText({
    model: openrouter(modelId),
    prompt: question,
  })
  return text
}

export async function conclave(question: string, callbacks: ConclaveCallbacks): Promise<string> {
  const responses = await Promise.all(
    CONCLAVE_MODELS.map(async (modelId) => {
      const text = await single(modelId, question)
      callbacks.onModelComplete(modelId)
      return { modelId, text }
    }),
  )

  callbacks.onChairmanStart()

  const { text } = await generateText({
    model: openrouter(CHAIRMAN_MODEL),
    prompt: buildChairmanPrompt(question, responses),
  })

  callbacks.onChairmanComplete()

  return text
}
