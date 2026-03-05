import type { Tool } from "@openrouter/sdk"

import { deepResearchTool } from "./deep-research"
import { sequentialThinkingTool } from "./sequential-thinking"
import { webSearchTools } from "./web-search"

interface RegisteredTool {
  tool: Tool
  isEnabled: () => boolean
  promptLine: string
}

const TOOL_REGISTRY: RegisteredTool[] = [
  sequentialThinkingTool,
  ...webSearchTools,
  deepResearchTool,
]

function getRegisteredTools(): RegisteredTool[] {
  return TOOL_REGISTRY.filter((registeredTool) => registeredTool.isEnabled())
}

export function getEnabledTools() {
  return getRegisteredTools().map((registeredTool) => registeredTool.tool)
}

export function getEnabledToolLines(): string[] {
  return getRegisteredTools().map((registeredTool) => registeredTool.promptLine)
}
