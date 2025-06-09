import { EventType } from "@ag-ui/client";
import ChainManager from "@/LLMProviders/chainManager";
import { CopilotSettings } from "@/settings/model";
import { App, MarkdownView } from "obsidian";
import { McpManager, AggregatedTool } from "@/mcp/manager";
import { AGUIEventBridge } from "./event-bridge";
import { InteractiveToolManager } from "./interactive-tools";

/**
 * SimpleAgentWrapper - A simplified AG-UI integration without inheritance
 *
 * This approach avoids RxJS version conflicts by creating a simpler
 * wrapper that can be extended to full AG-UI integration later.
 */
export class SimpleAgentWrapper {
  private chainManager: ChainManager;
  private app: App;
  private settings: CopilotSettings;
  private mcpManager?: McpManager;
  private eventBridge: AGUIEventBridge;
  private interactiveToolManager: InteractiveToolManager;

  public readonly agentId: string;
  public readonly description: string;
  public readonly threadId: string;

  constructor(
    chainManager: ChainManager,
    app: App,
    settings: CopilotSettings,
    mcpManager?: McpManager
  ) {
    this.agentId = "obsidian-copilot-agent";
    this.description = "An intelligent assistant for Obsidian note-taking";
    this.threadId = `thread-${Date.now()}`;

    this.chainManager = chainManager;
    this.app = app;
    this.settings = settings;
    this.mcpManager = mcpManager;

    // Initialize event bridge and interactive tool manager
    this.eventBridge = new AGUIEventBridge(this.chainManager, this.mcpManager);
    this.interactiveToolManager = new InteractiveToolManager();
  }

  /**
   * Process a conversation with AG-UI style events
   */
  async processConversation(
    messages: any[],
    tools: any[],
    context: any[],
    onEvent?: (event: any) => void
  ): Promise<any> {
    const runId = `run-${Date.now()}`;

    try {
      // Emit RUN_STARTED event
      onEvent?.({
        type: EventType.RUN_STARTED,
        threadId: this.threadId,
        runId,
        timestamp: Date.now(),
      });

      // Get current Obsidian context
      const obsidianContext = this.getObsidianContext();

      // Merge AG-UI tools with MCP tools
      const allTools = await this.mergeTools(tools);

      // Process through ChainManager with enhanced context
      const enhancedMessages = [
        ...messages,
        {
          id: `context-${Date.now()}`,
          role: "system" as const,
          content: `Current Obsidian context: ${JSON.stringify(obsidianContext)}`,
        },
      ];

      // Create a simple event emitter
      const eventEmitter = {
        next: (event: any) => onEvent?.(event),
        complete: () => {},
        error: (error: any) => console.error("Agent error:", error),
      };

      // Use event bridge to process
      await this.eventBridge.processChainManagerResponse(enhancedMessages, allTools, eventEmitter);

      // Emit RUN_FINISHED event
      onEvent?.({
        type: EventType.RUN_FINISHED,
        threadId: this.threadId,
        runId,
        timestamp: Date.now(),
      });

      return {
        success: true,
        threadId: this.threadId,
        runId,
      };
    } catch (error) {
      console.error("Error processing conversation:", error);

      // Emit RUN_ERROR event
      onEvent?.({
        type: EventType.RUN_ERROR,
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Get current Obsidian context
   */
  private getObsidianContext() {
    const activeFile = this.app.workspace.getActiveFile();
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    return {
      activeFile: activeFile
        ? {
            name: activeFile.name,
            path: activeFile.path,
            basename: activeFile.basename,
          }
        : null,
      selection: activeView?.editor?.getSelection() || null,
      cursorPosition: activeView?.editor?.getCursor() || null,
      vault: {
        name: this.app.vault.getName(),
        fileCount: this.app.vault.getFiles().length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Merge AG-UI tools with MCP tools
   */
  private async mergeTools(aguiTools: any[]): Promise<any[]> {
    const mergedTools = [...aguiTools];

    // Add interactive tools
    mergedTools.push(...this.interactiveToolManager.getInteractiveTools());

    // Add MCP tools if available
    if (this.mcpManager) {
      try {
        const mcpTools: AggregatedTool[] = await this.mcpManager.getTools();
        mergedTools.push(
          ...mcpTools.map((tool) => ({
            name: `mcp_${tool.name}`,
            description: tool.description,
            parameters: tool.inputSchema,
            _mcpTool: true,
            _originalTool: tool,
          }))
        );
      } catch (error) {
        console.warn("Failed to load MCP tools:", error);
      }
    }

    return mergedTools;
  }

  /**
   * Execute an interactive tool
   */
  async executeInteractiveTool(toolName: string, args: any): Promise<any> {
    return this.interactiveToolManager.executeInteractiveTool(toolName, args);
  }

  /**
   * Update agent configuration
   */
  updateConfiguration(settings: CopilotSettings, mcpManager?: McpManager) {
    this.settings = settings;
    this.mcpManager = mcpManager;
    this.eventBridge.updateMcpManager(mcpManager);
  }

  /**
   * Get current agent state
   */
  getAgentState() {
    return {
      agentId: this.agentId,
      settings: this.settings,
      mcpConnections: this.getConnectedServers(),
      obsidianContext: this.getObsidianContext(),
    };
  }

  /**
   * Get connected MCP servers
   */
  private getConnectedServers(): string[] {
    if (!this.mcpManager) return [];

    try {
      const statuses = this.mcpManager.getServerStatuses();
      return statuses.filter((status) => status.state === "connected").map((status) => status.name);
    } catch (error) {
      console.warn("Failed to get server statuses:", error);
      return [];
    }
  }

  /**
   * Get available tools (AG-UI + MCP + Interactive)
   */
  async getAvailableTools(): Promise<any[]> {
    return this.mergeTools([]);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    // Check if it's an interactive tool
    if (this.interactiveToolManager.getInteractiveTools().some((t) => t.name === toolName)) {
      return this.interactiveToolManager.executeInteractiveTool(toolName, args);
    }

    // Check if it's an MCP tool
    if (toolName.startsWith("mcp_") && this.mcpManager) {
      const originalToolName = toolName.replace("mcp_", "");
      const tools = await this.mcpManager.getTools();
      const tool = tools.find((t) => t.name === originalToolName);

      if (tool) {
        return this.mcpManager.callTool(tool.serverId, {
          name: originalToolName,
          arguments: args,
        });
      }
    }

    throw new Error(`Tool ${toolName} not found`);
  }
}
