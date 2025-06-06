/**
 * Sequential Thinking MCP 工具測試
 *
 * 這個腳本用於測試和驗證 sequential thinking 工具的正確使用方式
 */

import { Notice } from "obsidian";
import { getSettings } from "@/settings/model";
import { McpToolAdapterManager } from "./tool-adapter";
import { IntentAnalyzer } from "@/LLMProviders/intentAnalyzer";

/**
 * 測試 Sequential Thinking 工具的基本功能
 */
export async function testSequentialThinking(): Promise<void> {
  console.log("🧠 測試 Sequential Thinking MCP 工具...");

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

    // 獲取 Sequential Thinking 工具
    const tools = await adapter.getTools();
    const sequentialTool = tools.find(
      (tool) => tool.name.includes("sequential") && tool.name.includes("thinking")
    );

    if (!sequentialTool) {
      throw new Error("未找到 Sequential Thinking 工具");
    }

    console.log(`✅ 找到工具: ${sequentialTool.name}`);
    console.log(`📋 工具描述: ${sequentialTool.description}`);
    console.log(`🏗️ 輸入 Schema:`, JSON.stringify(sequentialTool.inputSchema, null, 2));

    // 測試正確的參數格式
    console.log("\n🧪 測試 1: 直接調用工具（正確參數）");
    const correctArgs = {
      thought: "請以電信終端使用者的角度思考如何提升安全性",
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    };

    console.log(`📤 使用參數:`, JSON.stringify(correctArgs, null, 2));

    const result1 = await adapter.callTool(sequentialTool.name, correctArgs);
    console.log(`✅ 直接調用成功!`);
    console.log(`📥 結果:`, JSON.stringify(result1, null, 2));

    // 測試意圖分析器的參數解析
    console.log("\n🧪 測試 2: 通過意圖分析器解析參數");
    const testMessage =
      "@mcp_sequential_thinking_sequentialthinking 請以電信終端使用者的角度思考如何提升安全性";

    console.log(`📤 測試訊息: "${testMessage}"`);

    const toolCalls = await IntentAnalyzer.analyzeIntent(testMessage);
    console.log(`📊 意圖分析結果: 找到 ${toolCalls.length} 個工具調用`);

    const sequentialCall = toolCalls.find(
      (call) => call.tool.name.includes("sequential") && call.tool.name.includes("thinking")
    );

    if (sequentialCall) {
      console.log(`✅ 找到 Sequential Thinking 調用:`);
      console.log(`  工具名稱: ${sequentialCall.tool.name}`);
      console.log(`  解析參數:`, JSON.stringify(sequentialCall.args, null, 2));

      // 執行解析出的工具調用
      console.log(`\n🚀 執行解析出的工具調用...`);
      const result2 = await adapter.callTool(sequentialCall.tool.name, sequentialCall.args);
      console.log(`✅ 執行成功!`);
      console.log(`📥 結果:`, JSON.stringify(result2, null, 2));
    } else {
      console.log(`❌ 未找到 Sequential Thinking 工具調用`);
    }

    // 測試多步思考序列
    console.log("\n🧪 測試 3: 多步思考序列");
    await testMultiStepThinking(adapter, sequentialTool.name);

    console.log("\n🎉 Sequential Thinking 工具測試完成!");
    new Notice("✅ Sequential Thinking 測試成功!");
  } catch (error) {
    console.error("❌ 測試失敗:", error);
    new Notice(`❌ Sequential Thinking 測試失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 測試多步思考序列
 */
async function testMultiStepThinking(adapter: any, toolName: string): Promise<void> {
  const thoughts = [
    "第一步思考：分析電信使用者面臨的主要安全威脅",
    "第二步思考：評估現有的安全措施和防護機制",
    "第三步思考：提出具體的安全提升建議和實施方案",
  ];

  for (let i = 0; i < thoughts.length; i++) {
    console.log(`\n  步驟 ${i + 1}/${thoughts.length}: ${thoughts[i]}`);

    const args = {
      thought: thoughts[i],
      thoughtNumber: i + 1,
      totalThoughts: thoughts.length,
      nextThoughtNeeded: i < thoughts.length - 1,
    };

    try {
      const result = await adapter.callTool(toolName, args);
      console.log(`    ✅ 步驟 ${i + 1} 完成`);
      console.log(`    📊 結果:`, JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`    ❌ 步驟 ${i + 1} 失敗:`, error.message);
    }
  }
}

/**
 * 驗證 Sequential Thinking 參數要求
 */
export async function validateSequentialThinkingSchema(): Promise<void> {
  console.log("🔍 驗證 Sequential Thinking 工具 Schema...");

  try {
    const adapter = McpToolAdapterManager.getInstance();
    const tools = await adapter.getTools();
    const sequentialTool = tools.find(
      (tool) => tool.name.includes("sequential") && tool.name.includes("thinking")
    );

    if (!sequentialTool) {
      throw new Error("未找到 Sequential Thinking 工具");
    }

    const schema = sequentialTool.inputSchema;
    console.log(`📋 完整 Schema:`, JSON.stringify(schema, null, 2));

    if (schema && schema.properties) {
      console.log(`\n📝 參數要求分析:`);

      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as any;
        const isRequired = schema.required?.includes(propName) ? "✅ 必需" : "⭕ 可選";
        console.log(`  ${propName} (${prop.type}): ${isRequired}`);
        if (prop.description) {
          console.log(`    描述: ${prop.description}`);
        }
      }
    }

    console.log(`\n✅ Schema 驗證完成`);
  } catch (error) {
    console.error("❌ Schema 驗證失敗:", error);
    throw error;
  }
}

/**
 * 測試不同的錯誤情況
 */
export async function testSequentialThinkingErrors(): Promise<void> {
  console.log("🚨 測試 Sequential Thinking 錯誤處理...");

  try {
    const adapter = McpToolAdapterManager.getInstance();
    const tools = await adapter.getTools();
    const sequentialTool = tools.find(
      (tool) => tool.name.includes("sequential") && tool.name.includes("thinking")
    );

    if (!sequentialTool) {
      throw new Error("未找到 Sequential Thinking 工具");
    }

    const errorTestCases = [
      {
        name: "缺少 thought 參數",
        args: { thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true },
      },
      {
        name: "無效的 thoughtNumber",
        args: {
          thought: "測試",
          thoughtNumber: "invalid",
          totalThoughts: 3,
          nextThoughtNeeded: true,
        },
      },
      {
        name: "缺少 totalThoughts",
        args: { thought: "測試", thoughtNumber: 1, nextThoughtNeeded: true },
      },
      {
        name: "缺少 nextThoughtNeeded",
        args: { thought: "測試", thoughtNumber: 1, totalThoughts: 3 },
      },
    ];

    for (const testCase of errorTestCases) {
      console.log(`\n🧪 測試: ${testCase.name}`);
      console.log(`📤 參數:`, JSON.stringify(testCase.args, null, 2));

      try {
        await adapter.callTool(sequentialTool.name, testCase.args);
        console.log(`⚠️ 預期失敗但成功了`);
      } catch (error) {
        console.log(`✅ 正確失敗: ${error.message}`);
      }
    }

    console.log(`\n🎉 錯誤處理測試完成`);
  } catch (error) {
    console.error("❌ 錯誤處理測試失敗:", error);
    throw error;
  }
}

// 將測試函數暴露到全域物件供控制台使用
if (typeof window !== "undefined") {
  (window as any).testSequentialThinking = testSequentialThinking;
  (window as any).validateSequentialThinkingSchema = validateSequentialThinkingSchema;
  (window as any).testSequentialThinkingErrors = testSequentialThinkingErrors;
}
