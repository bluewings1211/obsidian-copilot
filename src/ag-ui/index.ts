import { App } from "obsidian";
import ChainManager from "@/LLMProviders/chainManager";
import { CopilotSettings } from "@/settings/model";
import { McpManager } from "@/mcp/manager";
import { SimpleAgentWrapper } from "./simple-agent-wrapper";
import { InteractiveToolManager } from "./interactive-tools";
import { AGUIEventBridge } from "./event-bridge";

/**
 * AGUIIntegration - Main integration manager for AG-UI functionality
 *
 * This class provides a unified interface for all AG-UI related functionality
 * in Obsidian Copilot, including agent management, tool execution, and
 * human-in-the-loop capabilities.
 */
export class AGUIIntegration {
  private app: App;
  private chainManager: ChainManager;
  private settings: CopilotSettings;
  private mcpManager?: McpManager;
  private agentWrapper: SimpleAgentWrapper;
  private interactiveToolManager: InteractiveToolManager;
  private eventBridge: AGUIEventBridge;
  private isInitialized = false;

  constructor(
    app: App,
    chainManager: ChainManager,
    settings: CopilotSettings,
    mcpManager?: McpManager
  ) {
    this.app = app;
    this.chainManager = chainManager;
    this.settings = settings;
    this.mcpManager = mcpManager;

    // Initialize components
    this.agentWrapper = new SimpleAgentWrapper(
      this.chainManager,
      this.app,
      this.settings,
      this.mcpManager
    );

    this.interactiveToolManager = new InteractiveToolManager();
    this.eventBridge = new AGUIEventBridge(this.chainManager, this.mcpManager);
  }

  /**
   * Initialize the AG-UI integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log("[AGUIIntegration] Initializing AG-UI integration...");

      // Perform any necessary setup
      await this.setupEventHandlers();

      this.isInitialized = true;
      console.log("[AGUIIntegration] AG-UI integration initialized successfully");
    } catch (error) {
      console.error("[AGUIIntegration] Failed to initialize AG-UI integration:", error);
      throw error;
    }
  }

  /**
   * Clean up the AG-UI integration
   */
  async cleanup(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      console.log("[AGUIIntegration] Cleaning up AG-UI integration...");

      // Perform cleanup
      this.isInitialized = false;

      console.log("[AGUIIntegration] AG-UI integration cleaned up successfully");
    } catch (error) {
      console.error("[AGUIIntegration] Failed to cleanup AG-UI integration:", error);
    }
  }

  /**
   * Update settings and configuration
   */
  async updateSettings(settings: CopilotSettings, mcpManager?: McpManager): Promise<void> {
    this.settings = settings;
    this.mcpManager = mcpManager;

    // Update all components
    this.agentWrapper.updateConfiguration(settings, mcpManager);
    this.eventBridge.updateMcpManager(mcpManager);

    console.log("[AGUIIntegration] Settings updated");
  }

  /**
   * Process a conversation with AG-UI capabilities
   */
  async processConversation(
    messages: any[],
    tools: any[] = [],
    context: any[] = [],
    onEvent?: (event: any) => void
  ): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.agentWrapper.processConversation(messages, tools, context, onEvent);
  }

  /**
   * Get available tools (including MCP and interactive tools)
   */
  async getAvailableTools(): Promise<any[]> {
    return this.agentWrapper.getAvailableTools();
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    return this.agentWrapper.executeTool(toolName, args);
  }

  /**
   * Execute an interactive tool (human-in-the-loop)
   */
  async executeInteractiveTool(toolName: string, args: any): Promise<any> {
    return this.interactiveToolManager.executeInteractiveTool(toolName, args);
  }

  /**
   * Get current agent state
   */
  getAgentState(): any {
    return this.agentWrapper.getAgentState();
  }

  /**
   * Get agent information
   */
  getAgentInfo(): { agentId: string; description: string; threadId: string } {
    return {
      agentId: this.agentWrapper.agentId,
      description: this.agentWrapper.description,
      threadId: this.agentWrapper.threadId,
    };
  }

  /**
   * Check if AG-UI integration is available and working
   */
  isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Get integration status
   */
  getStatus(): {
    initialized: boolean;
    agentId: string;
    mcpConnections: string[];
    availableTools: number;
  } {
    const state = this.agentWrapper.getAgentState();

    return {
      initialized: this.isInitialized,
      agentId: this.agentWrapper.agentId,
      mcpConnections: state.mcpConnections || [],
      availableTools: 0, // Will be populated asynchronously
    };
  }

  /**
   * Setup event handlers for MCP and other integrations
   */
  private async setupEventHandlers(): Promise<void> {
    // Setup MCP event handlers if available
    if (this.mcpManager) {
      this.mcpManager.on("serverConnected", (serverId: string, serverInfo: any) => {
        console.log(`[AGUIIntegration] MCP server connected: ${serverId}`, serverInfo);
      });

      this.mcpManager.on("serverDisconnected", (serverId: string) => {
        console.log(`[AGUIIntegration] MCP server disconnected: ${serverId}`);
      });

      this.mcpManager.on("toolsUpdated", (tools: any[]) => {
        console.log(`[AGUIIntegration] MCP tools updated: ${tools.length} tools available`);
      });
    }
  }

  /**
   * Create a new conversation context
   */
  createConversationContext(additionalContext?: any): any[] {
    const obsidianContext = this.agentWrapper.getAgentState().obsidianContext;

    const baseContext = [
      {
        description: "Current Obsidian workspace state",
        value: JSON.stringify(obsidianContext),
      },
    ];

    if (additionalContext) {
      baseContext.push({
        description: "Additional context",
        value: JSON.stringify(additionalContext),
      });
    }

    return baseContext;
  }

  /**
   * Format messages for AG-UI compatibility
   */
  formatMessagesForAGUI(messages: any[]): any[] {
    return messages.map((msg, index) => ({
      id: msg.id || `msg-${index}-${Date.now()}`,
      role: msg.role || (msg.sender === "user" ? "user" : "assistant"),
      content: msg.content || msg.message || "",
      name: msg.name,
      ...(msg.toolCalls && { toolCalls: msg.toolCalls }),
    }));
  }
}

// Export all components for individual use if needed
export { SimpleAgentWrapper } from "./simple-agent-wrapper";
export { InteractiveToolManager } from "./interactive-tools";
export { AGUIEventBridge } from "./event-bridge";
export { showAGUIModal } from "./ui-components";

// Export types that might be useful
export interface AGUIConversationOptions {
  messages: any[];
  tools?: any[];
  context?: any[];
  onEvent?: (event: any) => void;
}

export interface AGUIToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface AGUIStatus {
  initialized: boolean;
  agentId: string;
  mcpConnections: string[];
  availableTools: number;
}
