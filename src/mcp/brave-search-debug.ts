/**
 * Brave Search MCP Tool 調試工具
 *
 * 這個腳本用於診斷和修復 Brave search MCP 工具的參數驗證問題
 */

import { getSettings } from "@/settings/model";
import { McpToolAdapterManager } from "./tool-adapter";

/**
 * 測試 Brave search 工具的不同參數組合
 */
export async function debugBraveSearch(): Promise<void> {
  console.log("🔍 開始 Brave Search 調試...");

  try {
    // 檢查設定
    const settings = getSettings();
    if (!settings.mcpIntegration.enabled) {
      console.error("❌ MCP 整合未啟用");
      return;
    }

    if (!McpToolAdapterManager.isInitialized()) {
      console.error("❌ MCP Tool Adapter Manager 未初始化");
      return;
    }

    const adapter = McpToolAdapterManager.getInstance();

    // 獲取所有可用工具
    const tools = await adapter.getTools();
    console.log(`📋 找到 ${tools.length} 個 MCP 工具:`);
    tools.forEach((tool) => {
      console.log(`  - ${tool.name} (${tool.serverName}): ${tool.description}`);
      if (tool.name.includes("brave") && tool.name.includes("search")) {
        console.log(`    Schema:`, JSON.stringify(tool.inputSchema, null, 2));
      }
    });

    // 尋找 Brave search 工具
    const braveSearchTool = tools.find(
      (tool) => tool.name.includes("brave") && tool.name.includes("search")
    );

    if (!braveSearchTool) {
      console.error("❌ 未找到 Brave search 工具");
      return;
    }

    console.log(`\n🎯 找到 Brave search 工具: ${braveSearchTool.name}`);
    console.log(`📝 工具描述: ${braveSearchTool.description}`);
    console.log(`🏗️ 輸入 Schema:`, JSON.stringify(braveSearchTool.inputSchema, null, 2));

    // 測試不同的參數組合
    const testCases = [
      {
        name: "基本查詢",
        args: { query: "test search" },
      },
      {
        name: "帶計數的查詢",
        args: { query: "test search", count: 5 },
      },
      {
        name: "帶偏移的查詢",
        args: { query: "test search", count: 5, offset: 0 },
      },
      {
        name: "空查詢 (應該失敗)",
        args: {},
      },
      {
        name: "無效參數 (應該失敗)",
        args: { invalidParam: "test" },
      },
    ];

    for (const testCase of testCases) {
      console.log(`\n🧪 測試案例: ${testCase.name}`);
      console.log(`📤 參數:`, JSON.stringify(testCase.args, null, 2));

      try {
        const startTime = Date.now();
        const result = await adapter.callTool(braveSearchTool.name, testCase.args);
        const duration = Date.now() - startTime;

        console.log(`✅ 成功 (${duration}ms)`);
        console.log(`📥 結果類型:`, typeof result);

        if (typeof result === "string") {
          console.log(`📥 結果長度:`, result.length);
          console.log(
            `📥 結果預覽:`,
            result.substring(0, 200) + (result.length > 200 ? "..." : "")
          );
        } else {
          console.log(`📥 結果:`, JSON.stringify(result, null, 2));
        }
      } catch (error) {
        console.error(`❌ 失敗:`, error.message);
        console.error(`📋 錯誤詳情:`, error);
      }
    }
  } catch (error) {
    console.error("❌ 調試過程出錯:", error);
  }
}

/**
 * 驗證工具參數是否符合 schema
 */
export function validateToolArguments(
  schema: any,
  args: any
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema || !schema.properties) {
    return { isValid: true, errors: [] };
  }

  // 檢查必需參數
  if (schema.required && Array.isArray(schema.required)) {
    for (const requiredField of schema.required) {
      if (!(requiredField in args)) {
        errors.push(`缺少必需參數: ${requiredField}`);
      }
    }
  }

  // 檢查參數類型
  for (const [key, value] of Object.entries(args)) {
    const propSchema = schema.properties[key];
    if (!propSchema) {
      errors.push(`未知參數: ${key}`);
      continue;
    }

    const expectedType = propSchema.type;
    const actualType = typeof value;

    if (expectedType === "number" && actualType !== "number") {
      errors.push(`參數 ${key} 應該是數字，但得到 ${actualType}`);
    } else if (expectedType === "string" && actualType !== "string") {
      errors.push(`參數 ${key} 應該是字串，但得到 ${actualType}`);
    } else if (expectedType === "boolean" && actualType !== "boolean") {
      errors.push(`參數 ${key} 應該是布林值，但得到 ${actualType}`);
    }

    // 檢查字串長度限制
    if (expectedType === "string" && propSchema.maxLength && typeof value === "string") {
      if (value.length > propSchema.maxLength) {
        errors.push(`參數 ${key} 長度 (${value.length}) 超過最大限制 (${propSchema.maxLength})`);
      }
    }

    // 檢查數字範圍
    if (expectedType === "number" && typeof value === "number") {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        errors.push(`參數 ${key} 值 (${value}) 小於最小值 (${propSchema.minimum})`);
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        errors.push(`參數 ${key} 值 (${value}) 大於最大值 (${propSchema.maximum})`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 在開發者控制台中運行調試
 */
export function runBraveSearchDebugInConsole(): void {
  console.log("🚀 正在控制台中啟動 Brave Search 調試...");
  debugBraveSearch().catch((error) => {
    console.error("❌ 調試失敗:", error);
  });
}

// 將函數暴露到全域物件供控制台使用
if (typeof window !== "undefined") {
  (window as any).debugBraveSearch = runBraveSearchDebugInConsole;
  (window as any).validateToolArguments = validateToolArguments;
}
