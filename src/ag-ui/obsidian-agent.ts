import { AbstractAgent, RunAgentInput, EventType, BaseEvent } from "@ag-ui/client";
import { Observable } from "@ag-ui/core";
import ChainManager from "@/LLMProviders/chainManager";
import { CopilotSettings } from "@/settings/model";
import { App, MarkdownView } from "obsidian";
import { McpManager, AggregatedTool } from "@/mcp/manager";
import { AGUIEventBridge } from "./event-bridge";
import { InteractiveToolManager } from "./interactive-tools";

/**
 * ObsidianAgentWrapper - AG-UI Agent implementation for Obsidian Copilot
 *
 * This class wraps the existing ChainManager to provide AG-UI compatible
 * agent interface while maintaining compatibility with existing MCP system.
 */
export class ObsidianAgentWrapper extends AbstractAgent {
  private chainManager: ChainManager;
  private app: App;
  private settings: CopilotSettings;
  private mcpManager?: McpManager;
  private eventBridge: AGUIEventBridge;
  private interactiveToolManager: InteractiveToolManager;

  constructor(
    chainManager: ChainManager,
    app: App,
    settings: CopilotSettings,
    mcpManager?: McpManager
  ) {
    super({
      agentId: "obsidian-copilot-agent",
      description: "An intelligent assistant for Obsidian note-taking",
      threadId: `thread-${Date.now()}`,
    });

    this.chainManager = chainManager;
    this.app = app;
    this.settings = settings;
    this.mcpManager = mcpManager;

    // Initialize event bridge and interactive tool manager
    this.eventBridge = new AGUIEventBridge(this.chainManager, this.mcpManager);
    this.interactiveToolManager = new InteractiveToolManager();
  }

  /**
   * Main agent execution method required by AG-UI AbstractAgent
   */
  protected run(input: RunAgentInput): any {
    return new Observable<BaseEvent>((observer: any) => {
      const { threadId, runId } = input;

      // Emit RUN_STARTED event
      observer.next({
        type: EventType.RUN_STARTED,
        threadId,
        runId,
      } as BaseEvent);

      // Process the conversation with enhanced context
      this.processConversation(input, observer)
        .then(() => {
          // Emit RUN_FINISHED event
          observer.next({
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
          } as BaseEvent);
          observer.complete();
        })
        .catch((error) => {
          // Emit RUN_ERROR event
          observer.next({
            type: EventType.RUN_ERROR,
            message: error.message,
          } as BaseEvent);
          observer.error(error);
        });
    });
  }

  /**
   * Process conversation with Obsidian context integration
   */
  private async processConversation(input: RunAgentInput, observer: any): Promise<void> {
    const { messages, tools } = input;

    try {
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

      // Use event bridge to convert ChainManager responses to AG-UI events
      await this.eventBridge.processChainManagerResponse(enhancedMessages, allTools, observer);
    } catch (error) {
      console.error("Error processing conversation:", error);
      throw error;
    }
  }

  /**
   * Get current Obsidian context (active file, selection, etc.)
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
}
