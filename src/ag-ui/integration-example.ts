import { App, Plugin, addIcon, Notice, MarkdownView } from "obsidian";
import ChainManager from "@/LLMProviders/chainManager";
import { CopilotSettings } from "@/settings/model";
import { McpManager } from "@/mcp/manager";
import { AGUIIntegration, showAGUIModal } from "./index";

/**
 * Example integration of AG-UI into the main Obsidian Copilot plugin
 *
 * This file demonstrates how to integrate the AG-UI functionality
 * into your existing plugin structure.
 */

// Add AG-UI icon
addIcon(
  "agui",
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="8" fill="none"/>
  <circle cx="35" cy="40" r="5" fill="currentColor"/>
  <circle cx="65" cy="40" r="5" fill="currentColor"/>
  <path d="M35 65 Q50 75 65 65" stroke="currentColor" stroke-width="3" fill="none"/>
</svg>`
);

export class AGUIPluginIntegration {
  private plugin: Plugin;
  private app: App;
  private chainManager: ChainManager;
  private settings: CopilotSettings;
  private mcpManager?: McpManager;
  private agui?: AGUIIntegration;

  constructor(
    plugin: Plugin,
    app: App,
    chainManager: ChainManager,
    settings: CopilotSettings,
    mcpManager?: McpManager
  ) {
    this.plugin = plugin;
    this.app = app;
    this.chainManager = chainManager;
    this.settings = settings;
    this.mcpManager = mcpManager;
  }

  /**
   * Initialize AG-UI integration
   */
  async initialize(): Promise<void> {
    try {
      console.log("[AGUIPluginIntegration] Initializing AG-UI integration...");

      // Create AG-UI integration instance
      this.agui = new AGUIIntegration(this.app, this.chainManager, this.settings, this.mcpManager);

      // Initialize the integration
      await this.agui.initialize();

      // Add commands
      this.addCommands();

      // Add ribbon icon
      this.addRibbonIcon();

      // Add settings
      this.addSettings();

      console.log("[AGUIPluginIntegration] AG-UI integration initialized successfully");
    } catch (error) {
      console.error("[AGUIPluginIntegration] Failed to initialize AG-UI:", error);
      new Notice("Failed to initialize AG-UI integration");
    }
  }

  /**
   * Clean up AG-UI integration
   */
  async cleanup(): Promise<void> {
    if (this.agui) {
      await this.agui.cleanup();
      this.agui = undefined;
    }
  }

  /**
   * Update settings
   */
  async updateSettings(settings: CopilotSettings, mcpManager?: McpManager): Promise<void> {
    this.settings = settings;
    this.mcpManager = mcpManager;

    if (this.agui) {
      await this.agui.updateSettings(settings, mcpManager);
    }
  }

  /**
   * Add AG-UI commands to Obsidian
   */
  private addCommands(): void {
    // Main AG-UI interface command
    this.plugin.addCommand({
      id: "open-agui-interface",
      name: "Open AG-UI Interface",
      callback: () => this.openAGUIInterface(),
    });

    // Quick conversation command
    this.plugin.addCommand({
      id: "agui-quick-conversation",
      name: "Start AG-UI Conversation",
      callback: () => this.startQuickConversation(),
    });

    // Test interactive tools command
    this.plugin.addCommand({
      id: "agui-test-tools",
      name: "Test AG-UI Interactive Tools",
      callback: () => this.testInteractiveTools(),
    });

    // Show AG-UI status command
    this.plugin.addCommand({
      id: "agui-show-status",
      name: "Show AG-UI Status",
      callback: () => this.showStatus(),
    });
  }

  /**
   * Add ribbon icon
   */
  private addRibbonIcon(): void {
    this.plugin.addRibbonIcon("agui", "Open AG-UI Interface", () => {
      this.openAGUIInterface();
    });
  }

  /**
   * Add AG-UI settings to the settings tab
   */
  private addSettings(): void {
    // This would typically be integrated into your existing settings tab
    // For demonstration, we'll show how to check AG-UI status in settings
    // You would add this to your existing settings display logic:
    /*
    if (this.agui && this.agui.isAvailable()) {
      const status = this.agui.getStatus();
      containerEl.createEl("h3", { text: "AG-UI Status" });
      
      new Setting(containerEl)
        .setName("AG-UI Integration")
        .setDesc(status.initialized ? "✅ Active" : "❌ Inactive");
      
      new Setting(containerEl)
        .setName("MCP Connections")
        .setDesc(status.mcpConnections.length > 0 
          ? `✅ ${status.mcpConnections.join(", ")}` 
          : "❌ No connections");
    }
    */
  }

  /**
   * Open the main AG-UI interface
   */
  private openAGUIInterface(): void {
    if (!this.agui) {
      new Notice("AG-UI integration not available");
      return;
    }

    try {
      showAGUIModal(this.app, this.agui);
    } catch (error) {
      console.error("Failed to open AG-UI interface:", error);
      new Notice("Failed to open AG-UI interface");
    }
  }

  /**
   * Start a quick conversation
   */
  private async startQuickConversation(): Promise<void> {
    if (!this.agui) {
      new Notice("AG-UI integration not available");
      return;
    }

    try {
      // Get current selection or active file content for context
      const activeFile = this.app.workspace.getActiveFile();
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const selection = view?.editor?.getSelection();

      let contextMessage = "Hello! How can I help you today?";

      if (selection) {
        contextMessage = `I see you have selected: "${selection}". How can I help with this?`;
      } else if (activeFile) {
        contextMessage = `I see you're working on "${activeFile.name}". How can I assist you?`;
      }

      const messages = [
        {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: contextMessage,
        },
      ];

      // Show progress
      new Notice("Starting AG-UI conversation...");

      const result = await this.agui.processConversation(
        messages,
        await this.agui.getAvailableTools(),
        this.agui.createConversationContext({ selection, activeFile: activeFile?.name }),
        (event) => {
          console.log("AG-UI Event:", event);
          // You could show events in a status bar or notification
        }
      );

      new Notice("AG-UI conversation completed");
      console.log("Conversation result:", result);
    } catch (error) {
      console.error("Failed to start conversation:", error);
      new Notice("Failed to start AG-UI conversation");
    }
  }

  /**
   * Test interactive tools
   */
  private async testInteractiveTools(): Promise<void> {
    if (!this.agui) {
      new Notice("AG-UI integration not available");
      return;
    }

    try {
      // Test confirmation tool
      const confirmResult = await this.agui.executeInteractiveTool("confirmAction", {
        action: "Test the AG-UI integration",
        importance: "low",
        details: "This is a test of the interactive confirmation tool",
      });

      console.log("Confirmation result:", confirmResult);

      // Test choice tool
      const choiceResult = await this.agui.executeInteractiveTool("getUserChoice", {
        question: "Which feature would you like to test next?",
        options: ["Progress Update", "Input Request", "Tool Execution", "Exit Test"],
      });

      console.log("Choice result:", choiceResult);

      new Notice("Interactive tools test completed");
    } catch (error) {
      console.error("Failed to test interactive tools:", error);
      new Notice("Failed to test interactive tools");
    }
  }

  /**
   * Show AG-UI status
   */
  private showStatus(): void {
    if (!this.agui) {
      new Notice("AG-UI integration not available");
      return;
    }

    const status = this.agui.getStatus();
    const agentInfo = this.agui.getAgentInfo();

    const statusMessage = `
AG-UI Status:
- Initialized: ${status.initialized ? "Yes" : "No"}
- Agent ID: ${agentInfo.agentId}
- Thread ID: ${agentInfo.threadId}
- MCP Connections: ${status.mcpConnections.length > 0 ? status.mcpConnections.join(", ") : "None"}
    `.trim();

    new Notice(statusMessage, 5000);
    console.log("AG-UI Status:", status);
  }

  /**
   * Get AG-UI integration instance (for advanced usage)
   */
  getAGUIIntegration(): AGUIIntegration | undefined {
    return this.agui;
  }

  /**
   * Check if AG-UI is available
   */
  isAGUIAvailable(): boolean {
    return this.agui?.isAvailable() || false;
  }
}

/**
 * Example usage in main plugin class:
 *
 * export default class CopilotPlugin extends Plugin {
 *   private aguiIntegration?: AGUIPluginIntegration;
 *
 *   async onload() {
 *     // ... existing plugin initialization ...
 *
 *     // Initialize AG-UI integration
 *     this.aguiIntegration = new AGUIPluginIntegration(
 *       this,
 *       this.app,
 *       this.chainManager,
 *       this.settings,
 *       this.mcpManager
 *     );
 *
 *     await this.aguiIntegration.initialize();
 *   }
 *
 *   async onunload() {
 *     if (this.aguiIntegration) {
 *       await this.aguiIntegration.cleanup();
 *     }
 *   }
 *
 *   async updateSettings() {
 *     // ... existing settings update ...
 *
 *     if (this.aguiIntegration) {
 *       await this.aguiIntegration.updateSettings(this.settings, this.mcpManager);
 *     }
 *   }
 * }
 */
