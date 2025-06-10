/**
 * PocketFlow.js 整合模組
 *
 * 提供基於 PocketFlow.js 的聊天處理框架，專為 Obsidian Copilot 設計
 */

// 導出核心 PocketFlow 功能
export { Node, Flow, BatchNode, ParallelBatchNode } from "pocketflow";

// 導出自定義類型
export type { ChatSharedState, ChatNodeParams, ToolExecutionResult, ChatFlowConfig } from "./types";

// 導出基礎類別
export { ChatBaseNode, ChatBatchNode, ChatFlow } from "./nodes";

// 導出自定義節點
export { IntentAnalysisNode } from "./nodes/IntentAnalysisNode";

export type { IntentAnalysisResult, ToolCall, IntentAction } from "./nodes/IntentAnalysisNode";

// 導出配置
export {
  DEFAULT_CHAT_FLOW_CONFIG,
  getChatFlowConfig,
  POCKETFLOW_CONSTANTS,
  isFeatureEnabled,
  getRetryConfig,
} from "./config";

/**
 * PocketFlow 版本資訊
 */
export const POCKETFLOW_VERSION = "1.0.0";

/**
 * 檢查 PocketFlow 是否已正確初始化
 */
export function isPocketFlowReady(): boolean {
  try {
    // 檢查是否可以導入 PocketFlow 模組
    // 這裡我們已經在頂部導入了 Node，所以直接檢查
    return typeof Node === "function";
  } catch (error) {
    console.error("PocketFlow 未正確安裝:", error);
    return false;
  }
}

/**
 * 初始化 PocketFlow 環境
 */
export function initializePocketFlow(): boolean {
  if (!isPocketFlowReady()) {
    console.error("PocketFlow 初始化失敗: 無法載入 pocketflow 模組");
    return false;
  }

  console.log(`PocketFlow ${POCKETFLOW_VERSION} 初始化成功`);
  return true;
}
