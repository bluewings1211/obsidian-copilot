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
      const brocaResponse = await BrevilabsClient.getInstance().broca(originalMessage);

      // Check if the response is successful and has the expected structure
      if (!brocaResponse?.response) {
        throw new Error(brocaResponse?.detail || "Broca API call failed");
      }

      const brocaToolCalls = brocaResponse.response.tool_calls;
      const salientTerms = brocaResponse.response.salience_terms;

      const processedToolCalls: ToolCall[] = [];
      let timeRange: { startTime: TimeInfo; endTime: TimeInfo } | undefined;

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

      // Process @ commands from original message only
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
          // For now, call with empty args - this could be enhanced to parse args from message
          processedToolCalls.push({
            tool,
            args: {},
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

  private static async removeAtCommands(message: string): Promise<string> {
    const allToolNames = await getAllToolNames();
    return message
      .split(" ")
      .filter((word) => !allToolNames.includes(word.toLowerCase()))
      .join(" ")
      .trim();
  }
}
