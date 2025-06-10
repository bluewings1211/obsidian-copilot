/**
 * IntentAnalysisNode 使用示例
 *
 * 展示如何在 PocketFlow 中使用意圖分析節點
 */

import { IntentAnalysisNode, ChatFlow, ChatSharedState } from "../index";
import { Vault } from "obsidian";

/**
 * 示例：創建包含意圖分析的聊天流程
 */
export function createIntentAnalysisFlow(vault: Vault): ChatFlow {
  // 創建意圖分析節點
  const intentNode = new IntentAnalysisNode(vault);

  // 根據意圖分析結果，可以連接到不同的處理節點
  // intentNode.on("local_search", localSearchNode);
  // intentNode.on("web_search", webSearchNode);
  // intentNode.on("mcp_tools", mcpToolsNode);
  // intentNode.on("direct_llm", directLlmNode);

  // 創建並返回流程
  return new ChatFlow(intentNode, "意圖分析聊天流程");
}

/**
 * 示例：獨立使用意圖分析節點
 */
export async function analyzeUserIntent(userMessage: string, vault: Vault): Promise<void> {
  const intentNode = new IntentAnalysisNode(vault);

  // 創建測試用的共享狀態
  const shared: ChatSharedState = {
    userMessage: {
      message: userMessage,
      sender: "user",
      isVisible: true,
      timestamp: new Date().toISOString(),
    } as any,
    isProcessing: true,
    debug: true,
    toolCalls: [],
    sources: [],
  };

  try {
    // 執行意圖分析
    const result = await intentNode.run(shared);

    console.log("意圖分析結果:", {
      action: result,
      toolCalls: shared.toolCalls?.length || 0,
      intentResult: shared.intentAnalysisResult,
    });

    // 根據結果執行相應動作
    switch (result) {
      case "local_search":
        console.log("建議執行本地搜索");
        break;
      case "web_search":
        console.log("建議執行網頁搜索");
        break;
      case "mcp_tools":
        console.log("建議使用 MCP 工具");
        break;
      case "tool_execution":
        console.log("建議執行工具調用");
        break;
      case "direct_llm":
        console.log("建議直接使用 LLM");
        break;
      default:
        console.log("未知的意圖分析結果");
    }
  } catch (error) {
    console.error("意圖分析失敗:", error);
  }
}

/**
 * 示例用法
 */
export const examples = {
  // 本地搜索示例
  localSearch: "@vault 搜尋關於機器學習的筆記",

  // 網頁搜索示例
  webSearch: "@web 最新的 AI 發展趨勢",

  // MCP 工具示例
  mcpTool: "@mcp_brave_search 搜尋 TypeScript 最佳實踐",

  // 番茄鐘示例
  pomodoro: "@pomodoro 25min",

  // 直接 LLM 示例
  directLlm: "請解釋什麼是量子計算",

  // 複合命令示例
  complex: "@vault 搜尋筆記 @web 查詢最新資訊",
};

/**
 * 運行示例
 */
export async function runExamples(vault: Vault): Promise<void> {
  console.log("🚀 開始運行 IntentAnalysisNode 示例...");

  for (const [name, message] of Object.entries(examples)) {
    console.log(`\n📝 示例: ${name}`);
    console.log(`💬 訊息: ${message}`);
    await analyzeUserIntent(message, vault);
  }

  console.log("\n✅ 所有示例運行完成");
}
