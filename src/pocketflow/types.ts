import { ChatMessage, McpToolCall } from "@/sharedState";
import { TFile } from "obsidian";

/**
 * PocketFlow 聊天共享狀態介面
 * 包含聊天流程中需要的所有共享數據
 */
export interface ChatSharedState {
  // 基本聊天數據
  userMessage?: ChatMessage;
  aiResponse?: string;
  chatHistory?: ChatMessage[];

  // 處理狀態
  isProcessing?: boolean;
  currentStep?: string;
  debug?: boolean;

  // 工具和搜索相關
  toolCalls?: any[];
  toolOutputs?: any[];
  mcpToolCalls?: McpToolCall[];

  // 搜索和檢索相關
  searchQuery?: string;
  standaloneQuestion?: string;
  retrievedDocuments?: any[];
  localSearchResults?: any[];
  webSearchResult?: string;
  sources?: { title: string; score: number }[];

  // 上下文數據
  context?: {
    notes?: TFile[];
    urls?: string[];
    embeddings?: number[][];
    timeExpression?: string;
  };

  // 圖像處理
  imageContent?: any[];
  processedImages?: any[];

  // 錯誤處理
  error?: string;
  errorMessage?: string;

  // 控制流程
  abortController?: AbortController;
  shouldAbort?: boolean;

  // 回調函數
  updateCurrentAiMessage?: (message: string) => void;
  addMessage?: (message: ChatMessage) => void;
  updateLoading?: (loading: boolean) => void;
  updateLoadingMessage?: (message: string) => void;

  // 意圖分析相關
  intentAnalysisResult?: {
    toolCalls: any[];
    detectedTools: string[];
    salientTerms: string[];
    timeRange?: any;
    suggestedAction: string;
  };
}

/**
 * PocketFlow Node 參數介面
 */
export interface ChatNodeParams {
  nodeId?: string;
  stepName?: string;
  maxRetries?: number;
  timeout?: number;
  [key: string]: any;
}

/**
 * 工具執行結果介面
 */
export interface ToolExecutionResult {
  tool: string;
  output: any;
  success: boolean;
  error?: string;
  duration?: number;
}

/**
 * 聊天流程配置
 */
export interface ChatFlowConfig {
  enableDebug?: boolean;
  enableLocalSearch?: boolean;
  enableWebSearch?: boolean;
  enableMcpTools?: boolean;
  maxRetries?: number;
  timeout?: number;
}
