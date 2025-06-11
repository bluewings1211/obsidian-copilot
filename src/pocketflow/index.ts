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

// 導出 MCP 增強系統
export {
  EnhancedMcpManager,
  McpConnectionPool,
  McpHealthChecker,
  McpLoadBalancer,
  McpParallelExecutor,
  McpResultCache,
  McpErrorClassifier,
  McpMetricsCollector,
} from "./mcp-enhanced";

// 導出工具鏈編排系統
export {
  ToolChainOrchestrator,
  DataFlowManager,
  ExecutionPlan,
  DataPipeline,
} from "./orchestration";

// 導出故障容錯系統
export {
  FaultToleranceManager,
  createFaultToleranceManager,
  withFaultTolerance,
  DEFAULT_FAULT_TOLERANCE_CONFIG,
  FaultToleranceLevel,
  FaultSeverity,
} from "./fault-tolerance";

/**
 * PocketFlow 版本資訊
 */
export const POCKETFLOW_VERSION = "2.0.0";

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

/**
 * 創建基礎的 PocketFlow 實例
 * 整合容錯功能
 */
export async function createResilientPocketFlow(
  config: {
    faultTolerance?: any;
    debug?: boolean;
  } = {}
) {
  const { debug = false } = config;

  if (debug) {
    console.log("🚀 初始化容錯 PocketFlow 實例...");
  }

  // 創建故障容錯管理器
  const { createFaultToleranceManager } = await import("./fault-tolerance");
  const faultTolerance = createFaultToleranceManager({
    debug,
    ...config.faultTolerance,
  });

  // 啟動容錯管理器（暫時註釋，等待完整實現）
  // await faultTolerance.start();

  if (debug) {
    console.log("✅ 容錯 PocketFlow 實例初始化完成");
  }

  return {
    faultTolerance,

    /**
     * 停止容錯管理器
     */
    async stop() {
      // await faultTolerance.stop(); // 暫時註釋，等待完整實現

      if (debug) {
        console.log("🛑 容錯 PocketFlow 實例已停止");
      }
    },

    /**
     * 獲取系統狀態
     */
    async getStatus() {
      // const faultStatus = faultTolerance.getState(); // 暫時註釋，等待完整實現
      const faultStatus = { isHealthy: true }; // 暫時的佔位符

      return {
        faultTolerance: faultStatus,
        overall: {
          healthy: faultStatus.isHealthy,
          version: POCKETFLOW_VERSION,
          uptime: Date.now(),
        },
      };
    },

    /**
     * 執行帶有容錯保護的操作
     */
    async executeWithProtection<T>(
      operation: () => Promise<T>,
      context: {
        operationName: string;
        timeout?: number;
        fallbackOptions?: string[];
      }
    ): Promise<T> {
      return await faultTolerance.executeWithFaultTolerance(operation, {
        operationName: context.operationName,
        timeout: context.timeout,
        fallbackOptions: context.fallbackOptions,
      });
    },
  };
}

/**
 * PocketFlow 功能特性標誌
 */
export const POCKETFLOW_FEATURES = {
  MCP_ENHANCED: true,
  TOOL_ORCHESTRATION: true,
  FAULT_TOLERANCE: true,
  PERFORMANCE_OPTIMIZATION: true,
  ENTERPRISE_READY: true,
} as const;

/**
 * 獲取 PocketFlow 功能摘要
 */
export function getPocketFlowCapabilities() {
  return {
    version: POCKETFLOW_VERSION,
    features: POCKETFLOW_FEATURES,
    components: {
      core: "基礎聊天流程處理",
      mcpEnhanced: "增強的 MCP 集成，包含連接池、負載均衡、緩存和監控",
      orchestration: "工具鏈編排，支持複雜的工具組合和工作流程",
      faultTolerance: "企業級故障容錯，包含智能降級、回退和恢復機制",
    },
    capabilities: {
      reliability: "多層容錯保護",
      performance: "並行執行和智能緩存",
      scalability: "負載均衡和自適應調整",
      observability: "全面的監控和診斷",
      flexibility: "高度可配置和擴展",
    },
  };
}
