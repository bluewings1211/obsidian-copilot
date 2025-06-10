/**
 * PocketFlow ChatFlow - 完整的聊天流程實現
 *
 * 整合所有已實現的 Node 到完整的聊天流程中，
 * 支援動態路由和多種聊天模式。
 */

import { Flow } from "../index";
import { ChatSharedState, ChatFlowConfig } from "../types";
import {
  IntentAnalysisNode,
  ToolExecutionBatchNode,
  ContextPrepNode,
  LLMGenerationNode,
  MultimodalContentNode,
} from "../nodes/index";

/**
 * 聊天流程類別
 * 組合所有節點實現完整的聊天功能
 */
export class ChatFlow extends Flow<ChatSharedState> {
  private config: ChatFlowConfig;

  // 節點實例
  private intentNode: IntentAnalysisNode;
  private multimodalNode: MultimodalContentNode;
  private toolExecutionNode: ToolExecutionBatchNode;
  private contextPrepNode: ContextPrepNode;
  private llmGenerationNode: LLMGenerationNode;

  constructor(vault: any, config: ChatFlowConfig = {}) {
    // 創建節點實例，需要先創建 intentNode 再傳給 super
    const intentNode = new IntentAnalysisNode(vault);

    // 使用第一個節點作為起始節點
    super(intentNode);

    this.config = {
      enableDebug: false,
      enableLocalSearch: true,
      enableWebSearch: true,
      enableMcpTools: true,
      maxRetries: 3,
      timeout: 30000,
      ...config,
    };

    // 初始化所有節點
    this.intentNode = intentNode;
    this.multimodalNode = new MultimodalContentNode();
    this.toolExecutionNode = new ToolExecutionBatchNode(
      this.config.maxRetries,
      1000 // wait time
    );
    this.contextPrepNode = new ContextPrepNode();
    this.llmGenerationNode = new LLMGenerationNode();

    // 建立流程連接
    this.setupFlow();
  }

  /**
   * 設置聊天流程的節點連接
   * 實現動態路由邏輯
   */
  private setupFlow(): void {
    // 意圖分析的動態路由
    this.intentNode.on("local_search", this.toolExecutionNode);
    this.intentNode.on("web_search", this.toolExecutionNode);
    this.intentNode.on("mcp_tools", this.toolExecutionNode);
    this.intentNode.on("tool_execution", this.toolExecutionNode);
    this.intentNode.on("direct_llm", this.multimodalNode);

    // 多模態內容處理 -> 上下文準備
    this.multimodalNode.on("context_prep", this.contextPrepNode);

    // 工具執行 -> 上下文準備
    this.toolExecutionNode.on("default", this.contextPrepNode);

    // 上下文準備 -> LLM 生成
    this.contextPrepNode.on("llm_generation", this.llmGenerationNode);

    // LLM 生成沒有後續節點，流程結束
  }

  /**
   * 執行聊天流程
   */
  async execute(shared: ChatSharedState): Promise<string> {
    try {
      // 設置調試模式
      shared.debug = this.config.enableDebug;

      // 設置處理狀態
      shared.isProcessing = true;
      shared.currentStep = "starting";

      // 更新載入狀態
      shared.updateLoading?.(true);
      shared.updateLoadingMessage?.("正在分析意圖...");

      // 執行流程
      await this.run(shared);

      // 流程完成
      shared.isProcessing = false;
      shared.currentStep = "completed";
      shared.updateLoading?.(false);

      return shared.aiResponse || "";
    } catch (error) {
      shared.isProcessing = false;
      shared.error = error instanceof Error ? error.message : String(error);
      shared.updateLoading?.(false);

      console.error("ChatFlow execution error:", error);
      throw error;
    }
  }

  /**
   * 獲取流程配置
   */
  getConfig(): ChatFlowConfig {
    return { ...this.config };
  }

  /**
   * 更新流程配置
   */
  updateConfig(newConfig: Partial<ChatFlowConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // 更新節點配置
    this.updateNodeConfigs();
  }

  /**
   * 更新節點配置
   */
  private updateNodeConfigs(): void {
    // 更新工具執行節點配置
    this.toolExecutionNode.setParams({
      enableLocalSearch: this.config.enableLocalSearch,
      enableWebSearch: this.config.enableWebSearch,
      enableMcpTools: this.config.enableMcpTools,
    });

    // 更新重試配置
    if (this.config.maxRetries !== undefined) {
      [
        this.intentNode,
        this.multimodalNode,
        this.toolExecutionNode,
        this.contextPrepNode,
        this.llmGenerationNode,
      ].forEach((node) => {
        node.setParams({ maxRetries: this.config.maxRetries });
      });
    }
  }

  /**
   * 獲取流程統計信息
   */
  getStats(): {
    totalNodes: number;
    enabledFeatures: string[];
    lastExecutionTime?: number;
  } {
    const enabledFeatures: string[] = [];

    if (this.config.enableLocalSearch) enabledFeatures.push("localSearch");
    if (this.config.enableWebSearch) enabledFeatures.push("webSearch");
    if (this.config.enableMcpTools) enabledFeatures.push("mcpTools");
    if (this.config.enableDebug) enabledFeatures.push("debug");

    return {
      totalNodes: 5,
      enabledFeatures,
    };
  }

  /**
   * 創建流程的 Mermaid 圖表
   */
  generateMermaidDiagram(): string {
    return `
graph TD
    A[IntentAnalysisNode<br/>意圖分析] --> B[MultimodalContentNode<br/>多模態內容處理]
    
    B -->|tools_needed| C[ToolExecutionBatchNode<br/>工具執行]
    B -->|direct_llm| D[ContextPrepNode<br/>上下文準備]
    
    C --> D
    D --> E[LLMGenerationNode<br/>LLM 生成]
    
    E --> F[完成]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fff3e0
    style D fill:#e8f5e8
    style E fill:#fce4ec
    style F fill:#f1f8e9
    
    classDef nodeClass fill:#ffffff,stroke:#333,stroke-width:2px
    class A,B,C,D,E,F nodeClass
`;
  }

  /**
   * 驗證流程完整性
   */
  validateFlow(): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 檢查節點實例
    if (!this.intentNode) issues.push("IntentAnalysisNode not initialized");
    if (!this.multimodalNode) issues.push("MultimodalContentNode not initialized");
    if (!this.toolExecutionNode) issues.push("ToolExecutionBatchNode not initialized");
    if (!this.contextPrepNode) issues.push("ContextPrepNode not initialized");
    if (!this.llmGenerationNode) issues.push("LLMGenerationNode not initialized");

    // 檢查配置
    if (this.config.maxRetries !== undefined && this.config.maxRetries < 1) {
      issues.push("maxRetries must be at least 1");
    }

    if (this.config.timeout !== undefined && this.config.timeout < 1000) {
      issues.push("timeout must be at least 1000ms");
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * 重置流程狀態
   */
  reset(): void {
    // 重置所有節點狀態
    [
      this.intentNode,
      this.multimodalNode,
      this.toolExecutionNode,
      this.contextPrepNode,
      this.llmGenerationNode,
    ].forEach((node) => {
      // 如果節點有 reset 方法則調用
      if ("reset" in node && typeof node.reset === "function") {
        (node as any).reset();
      }
    });
  }

  /**
   * 獲取節點執行狀態
   */
  getNodeStatuses(): Record<string, any> {
    return {
      intentAnalysis: this.getNodeStatus(this.intentNode),
      multimodalContent: this.getNodeStatus(this.multimodalNode),
      toolExecution: this.getNodeStatus(this.toolExecutionNode),
      contextPrep: this.getNodeStatus(this.contextPrepNode),
      llmGeneration: this.getNodeStatus(this.llmGenerationNode),
    };
  }

  /**
   * 獲取單個節點狀態
   */
  private getNodeStatus(node: any): any {
    return {
      name: node.constructor.name,
      id: node.nodeId,
      retryCount: node.currentRetry || 0,
      maxRetries: node.maxRetries || 1,
    };
  }
}

/**
 * 創建預設的聊天流程
 */
export function createDefaultChatFlow(vault: any, config?: Partial<ChatFlowConfig>): ChatFlow {
  return new ChatFlow(vault, {
    enableDebug: false,
    enableLocalSearch: true,
    enableWebSearch: true,
    enableMcpTools: true,
    maxRetries: 3,
    timeout: 30000,
    ...config,
  });
}

/**
 * 創建簡化的聊天流程（僅 LLM）
 */
export function createSimpleChatFlow(vault: any, config?: Partial<ChatFlowConfig>): ChatFlow {
  return new ChatFlow(vault, {
    enableDebug: false,
    enableLocalSearch: false,
    enableWebSearch: false,
    enableMcpTools: false,
    maxRetries: 1,
    timeout: 15000,
    ...config,
  });
}

/**
 * 創建完整功能的聊天流程
 */
export function createFullFeatureChatFlow(vault: any, config?: Partial<ChatFlowConfig>): ChatFlow {
  return new ChatFlow(vault, {
    enableDebug: true,
    enableLocalSearch: true,
    enableWebSearch: true,
    enableMcpTools: true,
    maxRetries: 5,
    timeout: 60000,
    ...config,
  });
}
