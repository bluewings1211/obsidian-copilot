/**
 * 工具執行 BatchNode 使用示例
 * 展示如何使用新的工具執行節點進行平行處理
 */

import { ChatFlow } from "../nodes";
import {
  ToolExecutionBatchNode,
  LocalSearchNode,
  WebSearchNode,
  McpToolsNode,
  GenericToolNode,
} from "../nodes/index";
import { ChatMessage } from "@/sharedState";
import { formatDateTime } from "@/utils";

/**
 * 示例 1: 使用 ToolExecutionBatchNode 進行批量工具執行
 */
export async function batchToolExecutionExample() {
  // 創建工具執行節點
  const toolExecutionNode = new ToolExecutionBatchNode(3, 1000); // 最大重試3次，等待1秒

  // 創建流程
  const flow = new ChatFlow(toolExecutionNode, "BatchToolExecution");

  // 準備測試數據
  const userMessage: ChatMessage = {
    message: "@vault 搜尋機器學習 @web 最新AI發展",
    sender: "user",
    timestamp: formatDateTime(new Date()),
    isVisible: true,
  };

  // 注意：工具調用通常由 IntentAnalysisNode 生成並設置到 shared.toolCalls 中

  try {
    const result = await flow.runChat(
      userMessage,
      (message) => console.log("AI Response:", message),
      (message) => console.log("Added Message:", message),
      {
        debug: true,
        updateLoadingMessage: (msg) => console.log("Loading:", msg),
      }
    );

    console.log("批量工具執行完成:", result);
  } catch (error) {
    console.error("批量工具執行失敗:", error);
  }
}

/**
 * 示例 2: 使用專門的搜索節點
 */
export async function specializedSearchExample() {
  // 創建專門的搜索節點
  const localSearchNode = new LocalSearchNode(2, 500);
  const webSearchNode = new WebSearchNode(2, 1000);

  // 根據不同條件連接節點
  localSearchNode.on("local_search_success", webSearchNode);
  localSearchNode.on("local_search_empty", webSearchNode);

  // 創建流程
  const flow = new ChatFlow(localSearchNode, "SpecializedSearch");

  const userMessage: ChatMessage = {
    message: "搜尋關於深度學習的資料",
    sender: "user",
    timestamp: formatDateTime(new Date()),
    isVisible: true,
  };

  try {
    const result = await flow.runChat(
      userMessage,
      (message) => console.log("AI Response:", message),
      (message) => console.log("Added Message:", message),
      { debug: true }
    );

    console.log("專門搜索完成:", result);
  } catch (error) {
    console.error("專門搜索失敗:", error);
  }
}

/**
 * 示例 3: 使用 MCP 工具節點
 */
export async function mcpToolsExample() {
  // 創建 MCP 工具節點
  const mcpToolsNode = new McpToolsNode(2, 500);

  // 創建流程
  const flow = new ChatFlow(mcpToolsNode, "McpTools");

  const userMessage: ChatMessage = {
    message: "使用 MCP 工具進行搜索",
    sender: "user",
    timestamp: formatDateTime(new Date()),
    isVisible: true,
  };

  // 注意：MCP 工具調用通常由意圖分析生成並設置到 shared.toolCalls 中

  try {
    const result = await flow.runChat(
      userMessage,
      (message) => console.log("AI Response:", message),
      (message) => console.log("Added Message:", message),
      { debug: true }
    );

    console.log("MCP 工具執行完成:", result);
  } catch (error) {
    console.error("MCP 工具執行失敗:", error);
  }
}

/**
 * 示例 4: 使用通用工具節點
 */
export async function genericToolExample() {
  // 創建通用工具節點
  const getCurrentTimeNode = new GenericToolNode(
    { name: "getCurrentTime", call: () => new Date().toISOString() },
    {},
    "獲取當前時間"
  );

  const getFileTreeNode = new GenericToolNode(
    { name: "getFileTree", call: (args: any) => JSON.stringify({ files: [] }) },
    { maxDepth: 2 },
    "獲取檔案樹"
  );

  // 連接節點
  getCurrentTimeNode.next(getFileTreeNode);

  // 創建流程
  const flow = new ChatFlow(getCurrentTimeNode, "GenericTools");

  const userMessage: ChatMessage = {
    message: "獲取系統信息",
    sender: "user",
    timestamp: formatDateTime(new Date()),
    isVisible: true,
  };

  try {
    const result = await flow.runChat(
      userMessage,
      (message) => console.log("AI Response:", message),
      (message) => console.log("Added Message:", message),
      { debug: true }
    );

    console.log("通用工具執行完成:", result);
  } catch (error) {
    console.error("通用工具執行失敗:", error);
  }
}

/**
 * 示例 5: 複雜的工具執行流程
 */
export async function complexToolFlowExample() {
  // 創建多個節點
  const toolExecutionNode = new ToolExecutionBatchNode();
  const localSearchNode = new LocalSearchNode();
  const webSearchNode = new WebSearchNode();
  const mcpToolsNode = new McpToolsNode();

  // 設定複雜的流程路由
  toolExecutionNode.on("default", localSearchNode);

  localSearchNode.on("local_search_success", webSearchNode);
  localSearchNode.on("local_search_empty", webSearchNode);

  webSearchNode.on("web_search_success", mcpToolsNode);
  webSearchNode.on("web_search_empty", mcpToolsNode);

  // 創建流程
  const flow = new ChatFlow(toolExecutionNode, "ComplexToolFlow");

  const userMessage: ChatMessage = {
    message: "進行綜合搜索和分析",
    sender: "user",
    timestamp: formatDateTime(new Date()),
    isVisible: true,
  };

  try {
    const result = await flow.runChat(
      userMessage,
      (message) => console.log("AI Response:", message),
      (message) => console.log("Added Message:", message),
      {
        debug: true,
        updateLoadingMessage: (msg) => console.log("Loading:", msg),
      }
    );

    console.log("複雜工具流程完成:", result);
  } catch (error) {
    console.error("複雜工具流程失敗:", error);
  }
}

/**
 * 性能測試：比較串行 vs 平行執行
 */
export async function performanceComparisonExample() {
  console.log("開始性能測試...");

  const userMessage: ChatMessage = {
    message: "性能測試",
    sender: "user",
    timestamp: formatDateTime(new Date()),
    isVisible: true,
  };

  // 注意：工具調用需要通過意圖分析或手動設置到 shared.toolCalls 中

  // 測試批量（平行）執行
  const batchStart = performance.now();
  const batchNode = new ToolExecutionBatchNode();
  const batchFlow = new ChatFlow(batchNode, "BatchTest");

  try {
    await batchFlow.runChat(
      userMessage,
      () => {},
      () => {},
      { debug: false }
    );
    const batchTime = performance.now() - batchStart;
    console.log(`批量執行時間: ${batchTime.toFixed(2)}ms`);
  } catch (error) {
    console.error("批量執行失敗:", error);
  }

  // 測試串行執行（模擬原始方法）
  const serialStart = performance.now();
  // 這裡可以實現串行執行的邏輯進行比較
  const serialTime = performance.now() - serialStart;
  console.log(`串行執行時間: ${serialTime.toFixed(2)}ms`);
}

// 導出所有示例函數
export const toolExecutionExamples = {
  batchToolExecutionExample,
  specializedSearchExample,
  mcpToolsExample,
  genericToolExample,
  complexToolFlowExample,
  performanceComparisonExample,
};
