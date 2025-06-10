import { ChatFlowConfig } from "./types";
import { getSettings } from "@/settings/model";

/**
 * 默認的聊天流程配置
 */
export const DEFAULT_CHAT_FLOW_CONFIG: ChatFlowConfig = {
  enableDebug: false,
  enableLocalSearch: true,
  enableWebSearch: true,
  enableMcpTools: true,
  maxRetries: 3,
  timeout: 30000, // 30 seconds
};

/**
 * 根據設置獲取聊天流程配置
 */
export function getChatFlowConfig(): ChatFlowConfig {
  const settings = getSettings();

  return {
    ...DEFAULT_CHAT_FLOW_CONFIG,
    enableDebug: settings.debug || false,
    enableLocalSearch: true, // 總是啟用本地搜索
    enableWebSearch: true, // 總是啟用網頁搜索
    enableMcpTools: true, // 總是啟用 MCP 工具
  };
}

/**
 * PocketFlow 相關常數
 */
export const POCKETFLOW_CONSTANTS = {
  // Node 步驟名稱
  STEPS: {
    INTENT_ANALYSIS: "意圖分析",
    TOOL_EXECUTION: "工具執行",
    LOCAL_SEARCH: "本地搜索",
    DOCUMENT_RETRIEVAL: "文檔檢索",
    CONTEXT_PREPARATION: "上下文準備",
    LLM_RESPONSE: "LLM 響應",
    RESPONSE_PROCESSING: "響應處理",
    IMAGE_PROCESSING: "圖像處理",
    ERROR_HANDLING: "錯誤處理",
  },

  // Action 名稱
  ACTIONS: {
    CONTINUE: "continue",
    SEARCH_LOCAL: "search_local",
    SEARCH_WEB: "search_web",
    PROCESS_IMAGES: "process_images",
    GENERATE_RESPONSE: "generate_response",
    HANDLE_ERROR: "handle_error",
    COMPLETE: "complete",
  },

  // 錯誤類型
  ERRORS: {
    ABORTED: "ABORTED",
    TIMEOUT: "TIMEOUT",
    TOOL_EXECUTION_FAILED: "TOOL_EXECUTION_FAILED",
    LLM_API_ERROR: "LLM_API_ERROR",
    INVALID_INPUT: "INVALID_INPUT",
  },
} as const;

/**
 * 檢查是否啟用了特定功能
 */
export function isFeatureEnabled(
  feature: keyof Pick<
    ChatFlowConfig,
    "enableDebug" | "enableLocalSearch" | "enableWebSearch" | "enableMcpTools"
  >
): boolean {
  const config = getChatFlowConfig();
  return Boolean(config[feature]);
}

/**
 * 獲取重試配置
 */
export function getRetryConfig() {
  const config = getChatFlowConfig();
  return {
    maxRetries: config.maxRetries || 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
  };
}
