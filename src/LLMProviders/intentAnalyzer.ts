import { indexTool, localSearchTool, webSearchTool } from "@/tools/SearchTools";
import {
  getCurrentTimeTool,
  getTimeInfoByEpochTool,
  getTimeRangeMsTool,
  pomodoroTool,
  TimeInfo,
} from "@/tools/TimeTools";
import { createGetFileTreeTool } from "@/tools/FileTreeTools";
import { ToolManager } from "@/tools/toolManager";
import { extractChatHistory, extractYoutubeUrl } from "@/utils";
import { BrevilabsClient } from "./brevilabsClient";
import MemoryManager from "./memoryManager";
import { Vault } from "obsidian";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { getSettings } from "@/settings/model";
import type { McpToolWrapper } from "@/mcp/tool-adapter";

// TODO: Add @index with explicit pdf files in chat context menu
export const COPILOT_TOOL_NAMES = ["@vault", "@web", "@youtube", "@pomodoro"];

/**
 * Get all available tool names including MCP tools
 */
export const getAllToolNames = async (): Promise<string[]> => {
  const baseTools = [...COPILOT_TOOL_NAMES];

  try {
    const settings = getSettings();
    if (settings.mcpIntegration.enabled && McpToolAdapterManager.isInitialized()) {
      const adapter = McpToolAdapterManager.getInstance();
      const mcpTools = await adapter.getTools();
      const mcpToolNames = mcpTools.map((tool) => `@${tool.name}`);
      baseTools.push(...mcpToolNames);
    }
  } catch (error) {
    console.warn("Failed to get MCP tool names:", error);
  }

  return baseTools;
};

/**
 * Check if a tool name is an MCP tool
 */
export const isMcpToolName = (toolName: string): boolean => {
  return toolName.startsWith("@mcp_") || toolName.startsWith("mcp_");
};

type ToolCall = {
  tool: any;
  args: any;
};

export class IntentAnalyzer {
  private static tools: any[] = [];
  private static mcpTools: McpToolWrapper[] = [];

  static initTools(vault: Vault) {
    if (this.tools.length === 0) {
      this.tools = [
        getCurrentTimeTool,
        getTimeInfoByEpochTool,
        getTimeRangeMsTool,
        localSearchTool,
        indexTool,
        pomodoroTool,
        webSearchTool,
        createGetFileTreeTool(vault.getRoot()),
      ];
    }

    // Initialize MCP tools if available
    this.refreshMcpTools();
  }

  /**
   * Refresh MCP tools from the adapter
   */
  private static async refreshMcpTools(): Promise<void> {
    try {
      const settings = getSettings();
      if (settings.mcpIntegration.enabled && McpToolAdapterManager.isInitialized()) {
        const adapter = McpToolAdapterManager.getInstance();
        this.mcpTools = await adapter.getTools();
      } else {
        this.mcpTools = [];
      }
    } catch (error) {
      console.warn("Failed to refresh MCP tools:", error);
      this.mcpTools = [];
    }
  }

  /**
   * Get all available tools (native + MCP)
   */
  static async getAllTools(): Promise<any[]> {
    await this.refreshMcpTools();
    return [...this.tools, ...this.mcpTools];
  }

  static async analyzeIntent(originalMessage: string): Promise<ToolCall[]> {
    try {
      const processedToolCalls: ToolCall[] = [];
      let timeRange: { startTime: TimeInfo; endTime: TimeInfo } | undefined;
      let salientTerms: string[] = [];

      // Try to use broca service if available, but gracefully fallback if not
      try {
        const brocaResponse = await BrevilabsClient.getInstance().broca(originalMessage);

        // Check if the response is successful and has the expected structure
        if (brocaResponse?.response) {
          const brocaToolCalls = brocaResponse.response.tool_calls;
          salientTerms = brocaResponse.response.salience_terms || [];

          // Get all available tools (native + MCP)
          const allTools = await this.getAllTools();

          // Process tool calls from broca
          for (const brocaToolCall of brocaToolCalls) {
            const tool = allTools.find((t) => t.name === brocaToolCall.tool);
            if (tool) {
              const args = brocaToolCall.args || {};

              if (tool.name === "getTimeRangeMs") {
                timeRange = await ToolManager.callTool(tool, args);
              }

              processedToolCalls.push({ tool, args });
            }
          }
        }
      } catch (brocaError) {
        // Broca service is not available, continue with @ command processing only
        console.warn(
          "Broca service unavailable, falling back to @ command processing:",
          brocaError
        );

        // Extract basic salient terms from the message for @ command processing
        salientTerms = this.extractBasicSalientTerms(originalMessage);
      }

      // Process @ commands from original message
      await this.processAtCommands(originalMessage, processedToolCalls, {
        timeRange,
        salientTerms,
      });

      // Check for MCP tool mentions in the message
      await this.processMcpToolCalls(originalMessage, processedToolCalls);

      return processedToolCalls;
    } catch (error) {
      console.error("Error in intent analysis:", error);
      throw error; // Re-throw the error to be caught by CopilotPlusChainRunner
    }
  }

  /**
   * Extract basic salient terms from message when broca is not available
   */
  private static extractBasicSalientTerms(message: string): string[] {
    // Simple extraction: remove @ commands and common words, split by spaces
    const cleanMessage = message
      .replace(/@\w+/g, "") // Remove @ commands
      .replace(/[^\w\s]/g, " ") // Remove punctuation
      .toLowerCase();

    const commonWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "this",
      "that",
      "these",
      "those",
    ]);

    return cleanMessage
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word))
      .slice(0, 5); // Limit to 5 terms
  }

  private static async processAtCommands(
    originalMessage: string,
    processedToolCalls: ToolCall[],
    context: {
      timeRange?: { startTime: TimeInfo; endTime: TimeInfo };
      salientTerms: string[];
    }
  ): Promise<void> {
    const message = originalMessage.toLowerCase();
    const { timeRange, salientTerms } = context;

    // Handle @vault command
    if (message.includes("@vault") && (salientTerms.length > 0 || timeRange)) {
      // Remove all @commands from the query
      const cleanQuery = await this.removeAtCommands(originalMessage);

      processedToolCalls.push({
        tool: localSearchTool,
        args: {
          timeRange: timeRange || undefined,
          query: cleanQuery,
          salientTerms,
        },
      });
    }

    // Handle @web command
    if (message.includes("@web")) {
      const cleanQuery = await this.removeAtCommands(originalMessage);
      const memory = MemoryManager.getInstance().getMemory();
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = extractChatHistory(memoryVariables);

      processedToolCalls.push({
        tool: webSearchTool,
        args: {
          query: cleanQuery,
          chatHistory,
        },
      });
    }

    // Handle @pomodoro command
    if (message.includes("@pomodoro")) {
      const pomodoroMatch = originalMessage.match(/@pomodoro\s+(\S+)/i);
      const interval = pomodoroMatch ? pomodoroMatch[1] : "25min";
      processedToolCalls.push({
        tool: pomodoroTool,
        args: { interval },
      });
    }

    // Handle @youtube command (currently disabled - YouTube tool removed)
    if (message.includes("@youtube")) {
      const youtubeUrl = extractYoutubeUrl(originalMessage);
      if (youtubeUrl) {
        console.warn("YouTube transcription tool is currently disabled");
        // TODO: Re-implement YouTube transcription with alternative service
        // or provide MCP server integration for YouTube functionality
      }
    }
  }

  /**
   * Process MCP tool calls based on message content
   */
  private static async processMcpToolCalls(
    originalMessage: string,
    processedToolCalls: ToolCall[]
  ): Promise<void> {
    try {
      const settings = getSettings();
      if (!settings.mcpIntegration.enabled || !McpToolAdapterManager.isInitialized()) {
        return;
      }

      const adapter = McpToolAdapterManager.getInstance();
      const mcpTools = await adapter.getTools();

      // Look for explicit MCP tool mentions in the message
      // Format: @mcp_<server>_<tool> or just the tool name if unique
      const mcpToolMentions = originalMessage.match(/@mcp_\w+_\w+/g) || [];

      for (const mention of mcpToolMentions) {
        const toolName = mention.substring(1); // Remove @
        const tool = mcpTools.find((t) => t.name === toolName);

        if (tool) {
          // Extract arguments from the message content
          const args = this.extractMcpToolArguments(originalMessage, mention, tool);

          processedToolCalls.push({
            tool,
            args,
          });
        }
      }

      // TODO: Add more sophisticated MCP tool detection based on:
      // - Natural language understanding
      // - Tool descriptions matching message intent
      // - Context-aware tool suggestions
    } catch (error) {
      console.warn("Failed to process MCP tool calls:", error);
    }
  }

  /**
   * Extract arguments for MCP tools from the message content
   */
  private static extractMcpToolArguments(
    originalMessage: string,
    toolMention: string,
    tool: any
  ): any {
    // Get the content after the tool mention
    const toolIndex = originalMessage.indexOf(toolMention);
    const contentAfterTool = originalMessage.substring(toolIndex + toolMention.length).trim();

    // If there's no content after the tool mention, return empty args
    if (!contentAfterTool) {
      return {};
    }

    // Special handling for sequential thinking tool
    if (tool.name && tool.name.includes("sequential") && tool.name.includes("thinking")) {
      return {
        thought: contentAfterTool,
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      };
    }

    // Check if the tool has input schema to guide argument extraction
    const inputSchema = tool.inputSchema;
    const args: any = {};

    if (inputSchema && inputSchema.properties) {
      const properties = inputSchema.properties;

      // Handle common argument patterns based on schema
      for (const [propName, propSchema] of Object.entries(properties)) {
        const prop = propSchema as any;

        // For 'thought' parameter (sequential thinking tool)
        if (propName === "thought" && prop.type === "string") {
          args[propName] = contentAfterTool;
        }

        // For 'query' or 'prompt' parameters, use the remaining content
        else if (
          (propName === "query" ||
            propName === "prompt" ||
            propName === "question" ||
            propName === "text") &&
          prop.type === "string"
        ) {
          args[propName] = contentAfterTool;
        }

        // For 'count' or 'limit' parameters, try to extract numbers
        else if (
          (propName === "count" ||
            propName === "limit" ||
            propName === "max" ||
            propName === "num") &&
          prop.type === "number"
        ) {
          const numberMatch = contentAfterTool.match(/\b(\d+)\b/);
          if (numberMatch) {
            args[propName] = parseInt(numberMatch[1], 10);
          }
        }

        // Special handling for sequential thinking numerical parameters
        else if (propName === "thoughtNumber" && prop.type === "number") {
          args[propName] = 1; // Default to first thought
        } else if (propName === "totalThoughts" && prop.type === "number") {
          args[propName] = 3; // Default to 3 thoughts
        }

        // For boolean parameters, check for keywords
        else if (prop.type === "boolean") {
          const lowerContent = contentAfterTool.toLowerCase();
          if (propName === "nextThoughtNeeded") {
            args[propName] = true; // Default to true for sequential thinking
          } else if (
            lowerContent.includes("true") ||
            lowerContent.includes("yes") ||
            lowerContent.includes("enable")
          ) {
            args[propName] = true;
          } else if (
            lowerContent.includes("false") ||
            lowerContent.includes("no") ||
            lowerContent.includes("disable")
          ) {
            args[propName] = false;
          }
        }
      }

      // If no specific parameters were found but there's content, try to map to the first string parameter
      if (Object.keys(args).length === 0 && contentAfterTool) {
        const firstStringProp = Object.entries(properties).find(
          ([_, prop]) => (prop as any).type === "string"
        );
        if (firstStringProp) {
          args[firstStringProp[0]] = contentAfterTool;
        }
      }
    } else {
      // Fallback: if no schema available, use common parameter names
      args.query = contentAfterTool;
      args.prompt = contentAfterTool;
      args.text = contentAfterTool;
      args.question = contentAfterTool;
    }

    console.log(`[IntentAnalyzer] Extracted args for ${tool.name}:`, args);
    return args;
  }

  private static async removeAtCommands(message: string): Promise<string> {
    const allToolNames = await getAllToolNames();
    return message
      .split(" ")
      .filter((word) => !allToolNames.includes(word.toLowerCase()))
      .join(" ")
      .trim();
  }
}
