/**
 * PocketFlow ChainRunner 橋接實現
 *
 * 提供與現有 ChainRunner 介面的兼容性，
 * 使用 PocketFlow 作為底層實現引擎。
 */

import { ChainRunner } from "@/LLMProviders/chainRunner";
import { ChatMessage } from "@/sharedState";
import { ChatFlow, createDefaultChatFlow, createSimpleChatFlow } from "../flows/ChatFlow";
import { ChatSharedState } from "../types";
import { Vault } from "obsidian";
import ChainManager from "@/LLMProviders/chainManager";

/**
 * PocketFlow ChainRunner 實現
 * 橋接現有的 ChainRunner 介面到 PocketFlow 流程
 */
export class PocketFlowChainRunner implements ChainRunner {
  private chatFlow: ChatFlow;
  private chainManager: ChainManager;

  constructor(chainManager: ChainManager, vault: Vault) {
    this.chainManager = chainManager;
    this.chatFlow = createDefaultChatFlow(vault);
  }

  /**
   * 執行聊天流程
   */
  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      updateLoadingMessage?: (message: string) => void;
    }
  ): Promise<string> {
    const { debug = false, updateLoading, updateLoadingMessage } = options;

    try {
      // 創建共享狀態
      const shared: ChatSharedState = {
        userMessage,
        chatHistory: await this.getChatHistory(),
        isProcessing: true,
        debug,
        abortController,
        updateCurrentAiMessage,
        addMessage,
        updateLoading,
        updateLoadingMessage,
      };

      // 執行 PocketFlow 聊天流程
      const result = await this.chatFlow.execute(shared);

      return result;
    } catch (error) {
      // 處理錯誤
      await this.handleError(error, debug, addMessage, updateCurrentAiMessage);
      return "";
    }
  }

  /**
   * 獲取聊天歷史
   */
  private async getChatHistory(): Promise<ChatMessage[]> {
    try {
      const memory = this.chainManager.memoryManager.getMemory();
      const memoryVariables = await memory.loadMemoryVariables({});

      // 轉換記憶體格式到 ChatMessage 格式
      const chatHistory = memoryVariables.history || [];

      // 這裡可能需要根據實際的記憶體格式進行調整
      return chatHistory;
    } catch (error) {
      console.warn("無法獲取聊天歷史:", error);
      return [];
    }
  }

  /**
   * 錯誤處理
   */
  private async handleError(
    error: any,
    debug: boolean,
    addMessage?: (message: ChatMessage) => void,
    updateCurrentAiMessage?: (message: string) => void
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (debug) {
      console.error("PocketFlow 執行錯誤:", error);
    }

    if (addMessage && updateCurrentAiMessage) {
      updateCurrentAiMessage("");

      let userFriendlyMessage = "處理您的請求時發生錯誤。";

      // 根據錯誤類型提供更具體的錯誤訊息
      if (errorMessage.includes("API key")) {
        userFriendlyMessage = "API 金鑰無效或缺失。請檢查您的設定。";
      } else if (errorMessage.includes("network") || errorMessage.includes("timeout")) {
        userFriendlyMessage = "網路連接問題。請稍後再試。";
      } else if (errorMessage.includes("quota") || errorMessage.includes("limit")) {
        userFriendlyMessage = "已達到使用限制。請稍後再試或檢查您的配額。";
      }

      addMessage({
        message: `${userFriendlyMessage}\n\n詳細錯誤: ${errorMessage}`,
        isErrorMessage: true,
        sender: "AI",
        isVisible: true,
        timestamp: new Date().toISOString() as any,
      });
    }
  }

  /**
   * 更新流程配置
   */
  updateConfig(config: {
    enableDebug?: boolean;
    enableLocalSearch?: boolean;
    enableWebSearch?: boolean;
    enableMcpTools?: boolean;
  }): void {
    this.chatFlow.updateConfig(config);
  }

  /**
   * 獲取流程統計
   */
  getStats(): any {
    return this.chatFlow.getStats();
  }

  /**
   * 重置流程狀態
   */
  reset(): void {
    this.chatFlow.reset();
  }

  /**
   * 驗證流程
   */
  validate(): { isValid: boolean; issues: string[] } {
    return this.chatFlow.validateFlow();
  }
}

/**
 * 簡化版 PocketFlow ChainRunner
 * 僅使用基本的 LLM 功能，不包含工具調用
 */
export class SimplePocketFlowChainRunner implements ChainRunner {
  private chatFlow: ChatFlow;
  private chainManager: ChainManager;

  constructor(chainManager: ChainManager, vault: Vault) {
    this.chainManager = chainManager;
    this.chatFlow = createSimpleChatFlow(vault, {
      enableLocalSearch: false,
      enableWebSearch: false,
      enableMcpTools: false,
    });
  }

  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
      updateLoadingMessage?: (message: string) => void;
    }
  ): Promise<string> {
    // 簡化實現，直接調用 LLM
    const { debug = false, updateLoading } = options;

    try {
      const shared: ChatSharedState = {
        userMessage,
        chatHistory: [],
        isProcessing: true,
        debug,
        abortController,
        updateCurrentAiMessage,
        addMessage,
        updateLoading,
      };

      return await this.chatFlow.execute(shared);
    } catch (error) {
      console.error("簡化 PocketFlow 執行錯誤:", error);
      return "";
    }
  }
}

/**
 * PocketFlow ChainRunner 工廠
 * 根據配置創建不同類型的 ChainRunner
 */
export class PocketFlowChainRunnerFactory {
  /**
   * 創建完整功能的 ChainRunner
   */
  static createFull(chainManager: ChainManager, vault: Vault): PocketFlowChainRunner {
    return new PocketFlowChainRunner(chainManager, vault);
  }

  /**
   * 創建簡化版 ChainRunner
   */
  static createSimple(chainManager: ChainManager, vault: Vault): SimplePocketFlowChainRunner {
    return new SimplePocketFlowChainRunner(chainManager, vault);
  }

  /**
   * 根據設定自動選擇合適的 ChainRunner
   */
  static createAuto(
    chainManager: ChainManager,
    vault: Vault,
    config?: {
      preferSimple?: boolean;
      enableAdvancedFeatures?: boolean;
    }
  ): ChainRunner {
    const { preferSimple = false, enableAdvancedFeatures = true } = config || {};

    if (preferSimple || !enableAdvancedFeatures) {
      return this.createSimple(chainManager, vault);
    }

    return this.createFull(chainManager, vault);
  }
}

/**
 * 遷移輔助類
 * 協助從舊的 ChainRunner 遷移到 PocketFlow
 */
export class PocketFlowMigrationHelper {
  /**
   * 檢查是否可以遷移到 PocketFlow
   */
  static canMigrate(chainManager: ChainManager): {
    canMigrate: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 檢查必要的依賴
    if (!chainManager) {
      issues.push("ChainManager 實例不存在");
    }

    if (!chainManager?.memoryManager) {
      issues.push("MemoryManager 不可用");
    }

    if (!chainManager?.chatModelManager) {
      issues.push("ChatModelManager 不可用");
    }

    // 提供建議
    if (issues.length === 0) {
      recommendations.push("可以開始遷移到 PocketFlow");
      recommendations.push("建議先在測試環境中驗證");
      recommendations.push("可以逐步遷移功能模組");
    } else {
      recommendations.push("請先解決上述問題再進行遷移");
    }

    return {
      canMigrate: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * 創建遷移計劃
   */
  static createMigrationPlan(): {
    phases: Array<{
      name: string;
      description: string;
      tasks: string[];
      estimatedTime: string;
    }>;
  } {
    return {
      phases: [
        {
          name: "階段1: 基礎設施準備",
          description: "準備 PocketFlow 基礎設施",
          tasks: ["驗證 PocketFlow 節點正常工作", "設置測試環境", "創建基本配置"],
          estimatedTime: "1-2 天",
        },
        {
          name: "階段2: 並行運行",
          description: "在現有系統旁邊運行 PocketFlow",
          tasks: ["配置 PocketFlowChainRunner", "進行 A/B 測試", "收集性能數據"],
          estimatedTime: "1 週",
        },
        {
          name: "階段3: 逐步替換",
          description: "逐步替換現有功能",
          tasks: ["替換基本聊天功能", "遷移工具調用功能", "遷移多模態功能"],
          estimatedTime: "2-3 週",
        },
        {
          name: "階段4: 完全遷移",
          description: "完全切換到 PocketFlow",
          tasks: ["移除舊的 ChainRunner", "優化性能", "完整測試"],
          estimatedTime: "1 週",
        },
      ],
    };
  }
}
