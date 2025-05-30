import { Notice } from "obsidian";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { getSettings } from "@/settings/model";

export const getToolDescription = async (tool: string): Promise<string> => {
  // Check built-in tools first
  switch (tool) {
    case "@vault":
      return "Search through your vault for relevant information";
    case "@web":
      return "Search the web for information";
    case "@youtube":
      return "Get the transcript of a YouTube video. Example: @youtube <video_url>";
    case "@pomodoro":
      return "Start a pomodoro timer. Example: @pomodoro 25m";
  }

  // Check MCP tools
  try {
    const settings = getSettings();
    if (settings.mcpIntegration.enabled && McpToolAdapterManager.isInitialized()) {
      const adapter = McpToolAdapterManager.getInstance();
      const description = await adapter.getToolDescription(tool);
      if (description) {
        return description;
      }
    }
  } catch (error) {
    console.warn(`Failed to get MCP tool description for ${tool}:`, error);
  }

  return "";
};

// Synchronous version for backwards compatibility
export const getToolDescriptionSync = (tool: string): string => {
  switch (tool) {
    case "@vault":
      return "Search through your vault for relevant information";
    case "@web":
      return "Search the web for information";
    case "@youtube":
      return "Get the transcript of a YouTube video. Example: @youtube <video_url>";
    case "@pomodoro":
      return "Start a pomodoro timer. Example: @pomodoro 25m";
    default:
      return "";
  }
};

export class ToolManager {
  static async callTool(tool: any, args: any): Promise<any> {
    try {
      if (!tool) {
        throw new Error("Tool is undefined");
      }

      // Check if this is an MCP tool
      if (tool.serverId && tool.mcpToolName) {
        return await this.callMcpTool(tool, args);
      }

      // Regular tool call
      const result = await tool.call(args);

      if (result === undefined || result === null) {
        console.warn(`Tool ${tool.name} returned null/undefined result`);
        return null;
      }

      return result;
    } catch (error) {
      console.error(`Error calling tool:`, error);
      if (error instanceof Error) {
        new Notice(error.message);
      } else {
        new Notice("An error occurred while executing the tool. Check console for details.");
      }
      return null;
    }
  }

  /**
   * Call an MCP tool through the adapter
   */
  private static async callMcpTool(tool: any, args: any): Promise<any> {
    const settings = getSettings();
    if (!settings.mcpIntegration.enabled || !McpToolAdapterManager.isInitialized()) {
      throw new Error("MCP integration is not available");
    }

    const adapter = McpToolAdapterManager.getInstance();
    return await adapter.callTool(tool.name, args);
  }

  /**
   * Check if a tool is an MCP tool
   */
  static isMcpTool(tool: any): boolean {
    return tool && tool.serverId && tool.mcpToolName;
  }

  /**
   * Get all available tools (native + MCP)
   */
  static async getAllAvailableTools(): Promise<any[]> {
    const tools: any[] = [];

    try {
      const settings = getSettings();
      if (settings.mcpIntegration.enabled && McpToolAdapterManager.isInitialized()) {
        const adapter = McpToolAdapterManager.getInstance();
        const mcpTools = await adapter.getTools();
        tools.push(...mcpTools);
      }
    } catch (error) {
      console.warn("Failed to get MCP tools:", error);
    }

    return tools;
  }
}
