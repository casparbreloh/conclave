import type { Tool } from "@openrouter/sdk";
import type Exa from "exa-js";

import type { Config } from "../config";
import { hasExaApiKey } from "../exa";
import { deepResearchTool } from "./deep-research";
import { sequentialThinkingTool } from "./sequential-thinking";
import { webSearchTools } from "./web-search";

type ExaClient = InstanceType<typeof Exa>;

interface RegisteredTool {
  tool: Tool;
  isEnabled: boolean;
  promptLine: string;
}

function buildRegistry(config: Config, exa: ExaClient | null): RegisteredTool[] {
  const registry: RegisteredTool[] = [sequentialThinkingTool(config)];

  if (exa && hasExaApiKey) {
    registry.push(...webSearchTools(config, exa));
    registry.push(deepResearchTool(config, exa));
  }

  return registry;
}

export function getEnabledTools(config: Config, exa: ExaClient | null): Tool[] {
  return buildRegistry(config, exa)
    .filter((r) => r.isEnabled)
    .map((r) => r.tool);
}

export function getEnabledToolLines(config: Config): string[] {
  // Tool lines only need config to determine which tools are advertised in prompts.
  // Exa tools are enabled when both the API key exists and config flags are true.
  const lines: string[] = [];

  if (config.sequentialThinking) {
    lines.push(
      "- sequentialThinking: structured step-by-step reasoning with revisions and branches; use when a problem needs iterative analysis.",
    );
  }

  if (hasExaApiKey && config.webSearch) {
    lines.push(
      "- webSearch: find current information, news, or facts; start here when you need web grounding.",
      "- crawlPages: read full content from specific URLs after identifying relevant pages.",
    );
  }

  if (hasExaApiKey && config.deepResearch) {
    lines.push(
      "- deepResearch: use Exa Deep for complex multi-part research when standard web lookup is not enough.",
    );
  }

  return lines;
}
