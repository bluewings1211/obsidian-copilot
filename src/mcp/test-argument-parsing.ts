/**
 * 測試 MCP 工具參數解析修復
 *
 * 這個腳本用於驗證我們對 MCP 工具參數解析的修復是否有效
 */

import { Notice } from "obsidian";
import { getSettings } from "@/settings/model";
import { McpToolAdapterManager } from "./tool-adapter";
import { IntentAnalyzer } from "@/LLMProviders/intentAnalyzer";

/**
 * 測試參數解析功能
 */
export async function testArgumentParsing(): Promise<void> {
  console.log("🔧 測試 MCP 工具參數解析...");

  try {
    // 檢查前置條件
    const settings = getSettings();
    if (!settings.mcpIntegration.enabled) {
      throw new Error("MCP 整合未啟用");
    }

    if (!McpToolAdapterManager.isInitialized()) {
      throw new Error("MCP Tool Adapter Manager 未初始化");
    }

    const adapter = McpToolAdapterManager.getInstance();

    // 獲取可用的 MCP 工具
    const tools = await adapter.getTools();
    console.log(`📋 找到 ${tools.length} 個 MCP 工具:`);
    tools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // 測試案例
    const testCases = [
      {
        name: "Sequential Thinking 工具",
        message: "@mcp_sequential_thinking_sequentialthinking 請以終端使用者來思考如何提高電信資安",
        expectedArgs: {
          query: "請以終端使用者來思考如何提高電信資安",
        },
      },
      {
        name: "Brave Search 工具",
        message: "@mcp_brave_brave_web_search TypeScript best practices",
        expectedArgs: {
          query: "TypeScript best practices",
        },
      },
      {
        name: "帶數字參數的搜尋",
        message: "@mcp_brave_brave_web_search Node.js tutorials 5 results",
        expectedArgs: {
          query: "Node.js tutorials 5 results",
          count: 5,
        },
      },
    ];

    for (const testCase of testCases) {
      console.log(`\n🧪 測試案例: ${testCase.name}`);
      console.log(`📤 輸入訊息: "${testCase.message}"`);

      try {
        // 使用 IntentAnalyzer 分析意圖和參數
        const toolCalls = await IntentAnalyzer.analyzeIntent(testCase.message);

        console.log(`📥 解析結果: 找到 ${toolCalls.length} 個工具調用`);

        toolCalls.forEach((toolCall, index) => {
          console.log(`  工具 ${index + 1}:`);
          console.log(`    名稱: ${toolCall.tool.name}`);
          console.log(`    參數:`, JSON.stringify(toolCall.args, null, 2));

          // 檢查是否有任何參數被正確解析
          const hasArgs = Object.keys(toolCall.args).length > 0;
          if (hasArgs) {
            console.log(`    ✅ 成功解析參數`);
          } else {
            console.log(`    ❌ 沒有解析到參數`);
          }
        });
      } catch (error) {
        console.error(`❌ 測試案例失敗:`, error.message);
      }
    }

    console.log("\n🎉 參數解析測試完成!");
    new Notice("✅ MCP 工具參數解析測試完成!");
  } catch (error) {
    console.error("❌ 測試失敗:", error);
    new Notice(`❌ 參數解析測試失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 測試特定工具的參數解析
 */
export async function testSpecificToolParsing(toolName: string, message: string): Promise<any> {
  console.log(`🎯 測試特定工具: ${toolName}`);
  console.log(`📤 訊息: "${message}"`);

  try {
    const adapter = McpToolAdapterManager.getInstance();
    const tools = await adapter.getTools();
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`工具 ${toolName} 未找到`);
    }

    console.log(`📋 工具資訊:`);
    console.log(`  名稱: ${tool.name}`);
    console.log(`  描述: ${tool.description}`);
    console.log(`  Schema:`, JSON.stringify(tool.inputSchema, null, 2));

    // 使用 IntentAnalyzer 分析
    const toolCalls = await IntentAnalyzer.analyzeIntent(message);
    const relevantCall = toolCalls.find((call) => call.tool.name === toolName);

    if (relevantCall) {
      console.log(`✅ 找到相關工具調用:`);
      console.log(`  參數:`, JSON.stringify(relevantCall.args, null, 2));
      return relevantCall.args;
    } else {
      console.log(`❌ 未找到相關的工具調用`);
      return null;
    }
  } catch (error) {
    console.error(`❌ 特定工具測試失敗:`, error);
    throw error;
  }
}

/**
 * 測試完整的工具調用流程
 */
export async function testFullToolCallFlow(message: string): Promise<void> {
  console.log(`🚀 測試完整工具調用流程`);
  console.log(`📤 訊息: "${message}"`);

  try {
    // 1. 分析意圖
    const toolCalls = await IntentAnalyzer.analyzeIntent(message);
    console.log(`📊 步驟 1: 意圖分析 - 找到 ${toolCalls.length} 個工具調用`);

    if (toolCalls.length === 0) {
      console.log("❌ 沒有找到任何工具調用");
      return;
    }

    // 2. 執行工具調用
    const adapter = McpToolAdapterManager.getInstance();

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      console.log(`📊 步驟 2.${i + 1}: 執行工具 ${toolCall.tool.name}`);
      console.log(`  參數:`, JSON.stringify(toolCall.args, null, 2));

      try {
        const result = await adapter.callTool(toolCall.tool.name, toolCall.args);
        console.log(`✅ 工具執行成功`);
        console.log(`📥 結果類型: ${typeof result}`);
        if (typeof result === "string") {
          console.log(`📥 結果長度: ${result.length} 字符`);
          console.log(`📥 結果預覽: ${result.substring(0, 100)}...`);
        }
      } catch (error) {
        console.error(`❌ 工具執行失敗:`, error.message);
      }
    }

    console.log("🎉 完整流程測試完成!");
    new Notice("✅ 完整工具調用流程測試完成!");
  } catch (error) {
    console.error("❌ 完整流程測試失敗:", error);
    new Notice(`❌ 完整流程測試失敗: ${error.message}`);
    throw error;
  }
}

// 將測試函數暴露到全域物件供控制台使用
if (typeof window !== "undefined") {
  (window as any).testArgumentParsing = testArgumentParsing;
  (window as any).testSpecificToolParsing = testSpecificToolParsing;
  (window as any).testFullToolCallFlow = testFullToolCallFlow;
}
