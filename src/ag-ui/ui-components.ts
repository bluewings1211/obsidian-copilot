import { Modal, App, Setting, Notice } from "obsidian";
import { AGUIIntegration, AGUIConversationOptions } from "./index";

/**
 * AGUIModal - A modal for interacting with AG-UI functionality
 */
export class AGUIModal extends Modal {
  private agui: AGUIIntegration;
  private conversationContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private toolsContainer: HTMLElement;
  private statusContainer: HTMLElement;

  constructor(app: App, agui: AGUIIntegration) {
    super(app);
    this.agui = agui;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Create main container
    contentEl.addClass("agui-modal");
    contentEl.createEl("h2", { text: "AG-UI Assistant" });

    // Create status section
    this.createStatusSection(contentEl);

    // Create tools section
    this.createToolsSection(contentEl);

    // Create conversation section
    this.createConversationSection(contentEl);

    // Create input section
    this.createInputSection(contentEl);

    // Initialize data
    this.updateStatus();
    this.loadAvailableTools();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private createStatusSection(container: HTMLElement) {
    const statusSection = container.createDiv("agui-status-section");
    statusSection.createEl("h3", { text: "Status" });

    this.statusContainer = statusSection.createDiv("agui-status-container");
  }

  private createToolsSection(container: HTMLElement) {
    const toolsSection = container.createDiv("agui-tools-section");
    toolsSection.createEl("h3", { text: "Available Tools" });

    this.toolsContainer = toolsSection.createDiv("agui-tools-container");
  }

  private createConversationSection(container: HTMLElement) {
    const conversationSection = container.createDiv("agui-conversation-section");
    conversationSection.createEl("h3", { text: "Conversation" });

    this.conversationContainer = conversationSection.createDiv("agui-conversation-container");
    this.conversationContainer.style.maxHeight = "300px";
    this.conversationContainer.style.overflowY = "auto";
    this.conversationContainer.style.border = "1px solid var(--background-modifier-border)";
    this.conversationContainer.style.padding = "10px";
    this.conversationContainer.style.marginBottom = "10px";
  }

  private createInputSection(container: HTMLElement) {
    const inputSection = container.createDiv("agui-input-section");

    const inputContainer = inputSection.createDiv();
    inputContainer.style.display = "flex";
    inputContainer.style.gap = "10px";

    const textInput = inputContainer.createEl("input", {
      type: "text",
      placeholder: "Enter your message...",
    });
    textInput.style.flex = "1";

    const sendButton = inputContainer.createEl("button", { text: "Send" });
    sendButton.onclick = () => this.sendMessage(textInput.value);

    // Handle Enter key
    textInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.sendMessage(textInput.value);
      }
    });

    this.inputContainer = inputSection;
  }

  private async updateStatus() {
    const status = this.agui.getStatus();
    const agentInfo = this.agui.getAgentInfo();

    this.statusContainer.empty();

    new Setting(this.statusContainer)
      .setName("Initialization Status")
      .setDesc(status.initialized ? "✅ Initialized" : "❌ Not Initialized");

    new Setting(this.statusContainer).setName("Agent ID").setDesc(agentInfo.agentId);

    new Setting(this.statusContainer).setName("Thread ID").setDesc(agentInfo.threadId);

    new Setting(this.statusContainer)
      .setName("MCP Connections")
      .setDesc(
        status.mcpConnections.length > 0
          ? `✅ ${status.mcpConnections.join(", ")}`
          : "❌ No MCP connections"
      );
  }

  private async loadAvailableTools() {
    try {
      const tools = await this.agui.getAvailableTools();

      this.toolsContainer.empty();

      if (tools.length === 0) {
        this.toolsContainer.createEl("p", {
          text: "No tools available",
          cls: "agui-no-tools",
        });
        return;
      }

      tools.forEach((tool) => {
        const toolEl = this.toolsContainer.createDiv("agui-tool-item");
        toolEl.style.padding = "5px";
        toolEl.style.margin = "5px 0";
        toolEl.style.border = "1px solid var(--background-modifier-border)";
        toolEl.style.borderRadius = "3px";

        toolEl.createEl("strong", { text: tool.name });
        toolEl.createEl("br");
        toolEl.createEl("span", {
          text: tool.description || "No description",
          cls: "agui-tool-description",
        });

        // Add test button for interactive tools
        if (
          tool.name.startsWith("confirm") ||
          tool.name.startsWith("get") ||
          tool.name.startsWith("update") ||
          tool.name.startsWith("request")
        ) {
          const testBtn = toolEl.createEl("button", {
            text: "Test",
            cls: "agui-test-tool-btn",
          });
          testBtn.style.marginTop = "5px";
          testBtn.onclick = () => this.testTool(tool);
        }
      });
    } catch (error) {
      console.error("Failed to load tools:", error);
      this.toolsContainer.createEl("p", {
        text: "Failed to load tools",
        cls: "agui-error",
      });
    }
  }

  private async testTool(tool: any) {
    try {
      let testArgs = {};

      // Create test arguments based on tool type
      switch (tool.name) {
        case "confirmAction":
          testArgs = {
            action: "Test action",
            importance: "low",
            details: "This is a test confirmation",
          };
          break;
        case "getUserChoice":
          testArgs = {
            question: "What is your favorite color?",
            options: ["Red", "Blue", "Green", "Yellow"],
          };
          break;
        case "updateProgress":
          testArgs = {
            message: "Testing progress update",
            percentage: 50,
            stage: "Testing",
          };
          break;
        case "requestInput":
          testArgs = {
            prompt: "Please enter a test value:",
            inputType: "text",
            placeholder: "Test input",
          };
          break;
        default:
          testArgs = { test: true };
      }

      const result = await this.agui.executeTool(tool.name, testArgs);

      new Notice(`Tool ${tool.name} executed successfully`);
      this.addMessage("system", `Tool ${tool.name} result: ${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      console.error(`Failed to test tool ${tool.name}:`, error);
      new Notice(`Failed to test tool ${tool.name}: ${error.message}`);
    }
  }

  private async sendMessage(message: string) {
    if (!message.trim()) return;

    // Clear input
    const input = this.inputContainer.querySelector("input") as HTMLInputElement;
    if (input) input.value = "";

    // Add user message to conversation
    this.addMessage("user", message);

    try {
      const options: AGUIConversationOptions = {
        messages: [
          {
            id: `msg-${Date.now()}`,
            role: "user",
            content: message,
          },
        ],
        tools: await this.agui.getAvailableTools(),
        context: this.agui.createConversationContext(),
        onEvent: (event) => this.handleEvent(event),
      };

      const result = await this.agui.processConversation(
        options.messages,
        options.tools,
        options.context,
        options.onEvent
      );

      console.log("Conversation result:", result);
    } catch (error) {
      console.error("Failed to process message:", error);
      this.addMessage("error", `Error: ${error.message}`);
    }
  }

  private handleEvent(event: any) {
    console.log("AG-UI Event:", event);

    switch (event.type) {
      case "TEXT_MESSAGE_START":
        this.addMessage("assistant", "", event.messageId);
        break;
      case "TEXT_MESSAGE_CONTENT":
        this.updateMessage(event.messageId, event.delta, true);
        break;
      case "TEXT_MESSAGE_END":
        // Message completed
        break;
      case "TOOL_CALL_START":
        this.addMessage("system", `🔧 Calling tool: ${event.toolCallName}`);
        break;
      case "TOOL_CALL_END":
        if (event.result) {
          this.addMessage("system", `✅ Tool result: ${JSON.stringify(event.result, null, 2)}`);
        } else if (event.error) {
          this.addMessage("system", `❌ Tool error: ${event.error}`);
        }
        break;
      case "RUN_STARTED":
        this.addMessage("system", "🚀 Processing started...");
        break;
      case "RUN_FINISHED":
        this.addMessage("system", "✅ Processing completed");
        break;
      case "RUN_ERROR":
        this.addMessage("system", `❌ Error: ${event.message}`);
        break;
    }
  }

  private addMessage(role: string, content: string, messageId?: string) {
    const messageEl = this.conversationContainer.createDiv("agui-message");
    messageEl.setAttribute("data-role", role);
    if (messageId) messageEl.setAttribute("data-message-id", messageId);

    messageEl.style.padding = "8px";
    messageEl.style.margin = "5px 0";
    messageEl.style.borderRadius = "5px";

    switch (role) {
      case "user":
        messageEl.style.backgroundColor = "var(--interactive-accent)";
        messageEl.style.color = "white";
        messageEl.style.marginLeft = "20%";
        break;
      case "assistant":
        messageEl.style.backgroundColor = "var(--background-secondary)";
        messageEl.style.marginRight = "20%";
        break;
      case "system":
        messageEl.style.backgroundColor = "var(--background-modifier-border)";
        messageEl.style.fontStyle = "italic";
        messageEl.style.fontSize = "0.9em";
        break;
      case "error":
        messageEl.style.backgroundColor = "var(--background-modifier-error)";
        messageEl.style.color = "var(--text-error)";
        break;
    }

    messageEl.createEl("strong", { text: `${role}: ` });
    messageEl.createEl("span", { text: content });

    // Scroll to bottom
    this.conversationContainer.scrollTop = this.conversationContainer.scrollHeight;
  }

  private updateMessage(messageId: string, delta: string, append: boolean = true) {
    const messageEl = this.conversationContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const contentEl = messageEl.querySelector("span");
    if (!contentEl) return;

    if (append) {
      contentEl.textContent += delta;
    } else {
      contentEl.textContent = delta;
    }

    // Scroll to bottom
    this.conversationContainer.scrollTop = this.conversationContainer.scrollHeight;
  }
}

/**
 * Create and show the AG-UI modal
 */
export function showAGUIModal(app: App, agui: AGUIIntegration) {
  const modal = new AGUIModal(app, agui);
  modal.open();
}
