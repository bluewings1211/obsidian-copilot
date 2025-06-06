/**
 * 測試 Brave Search 修復的腳本
 *
 * 這個腳本用於驗證我們對 MCP Brave search 工具的修復是否有效
 */

import { Notice } from "obsidian";
import { getSettings } from "@/settings/model";
import { McpToolAdapterManager } from "./tool-adapter";

/**
 * 測試修復後的 Brave search 功能
 */
export async function testBraveSearchFix(): Promise<void> {
  console.log("🔧 測試 Brave Search 修復...");

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

    // 獲取 Brave search 工具
    const tools = await adapter.getTools();
    const braveSearchTool = tools.find(
      (tool) => tool.name.includes("brave") && tool.name.includes("search")
    );

    if (!braveSearchTool) {
      throw new Error("未找到 Brave search 工具");
    }

    console.log(`✅ 找到工具: ${braveSearchTool.name}`);
    console.log(`📋 工具描述: ${braveSearchTool.description}`);

    // 測試基本搜尋
    console.log("\n🧪 測試基本搜尋...");
    const testQuery = "TypeScript programming";
    const searchArgs = { query: testQuery };

    console.log(`📤 發送搜尋請求:`, searchArgs);

    const startTime = Date.now();
    const result = await adapter.callTool(braveSearchTool.name, searchArgs);
    const duration = Date.now() - startTime;

    console.log(`✅ 搜尋成功! (${duration}ms)`);
    console.log(`📊 結果類型: ${typeof result}`);

    if (typeof result === "string") {
      console.log(`📊 結果長度: ${result.length} 字符`);
      console.log(`📋 結果預覽:\n${result.substring(0, 300)}${result.length > 300 ? "..." : ""}`);
    } else {
      console.log(`📋 結構化結果:`, result);
    }

    // 測試帶參數的搜尋
    console.log("\n🧪 測試帶參數的搜尋...");
    const advancedArgs = {
      query: "Node.js best practices",
      count: 3,
    };

    console.log(`📤 發送進階搜尋請求:`, advancedArgs);

    const startTime2 = Date.now();
    const result2 = await adapter.callTool(braveSearchTool.name, advancedArgs);
    const duration2 = Date.now() - startTime2;

    console.log(`✅ 進階搜尋成功! (${duration2}ms)`);
    console.log(`📊 結果類型: ${typeof result2}`);

    // 顯示成功通知
    new Notice("✅ Brave Search 修復測試成功!");
    console.log("🎉 所有測試都通過了!");
  } catch (error) {
    console.error("❌ 測試失敗:", error);
    new Notice(`❌ Brave Search 測試失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 測試錯誤情況
 */
export async function testBraveSearchErrorCases(): Promise<void> {
  console.log("🔧 測試 Brave Search 錯誤處理...");

  try {
    const adapter = McpToolAdapterManager.getInstance();
    const tools = await adapter.getTools();
    const braveSearchTool = tools.find(
      (tool) => tool.name.includes("brave") && tool.name.includes("search")
    );

    if (!braveSearchTool) {
      throw new Error("未找到 Brave search 工具");
    }

    // 測試空查詢
    console.log("\n🧪 測試空查詢 (預期失敗)...");
    try {
      await adapter.callTool(braveSearchTool.name, {});
      console.log("⚠️ 空查詢沒有失敗 - 這可能是個問題");
    } catch (error) {
      console.log("✅ 空查詢正確失敗:", error.message);
    }

    // 測試無效參數
    console.log("\n🧪 測試無效參數 (預期失敗)...");
    try {
      await adapter.callTool(braveSearchTool.name, { invalidParam: "test" });
      console.log("⚠️ 無效參數沒有失敗 - 這可能是個問題");
    } catch (error) {
      console.log("✅ 無效參數正確失敗:", error.message);
    }

    console.log("🎉 錯誤處理測試完成!");
  } catch (error) {
    console.error("❌ 錯誤處理測試失敗:", error);
    throw error;
  }
}

/**
 * 綜合測試函數
 */
export async function runComprehensiveBraveTest(): Promise<boolean> {
  try {
    console.log("🚀 開始綜合 Brave Search 測試...");

    await testBraveSearchFix();
    await testBraveSearchErrorCases();

    console.log("🎉 所有測試都通過!");
    new Notice("🎉 Brave Search 綜合測試通過!");
    return true;
  } catch (error) {
    console.error("❌ 綜合測試失敗:", error);
    new Notice(`❌ 綜合測試失敗: ${error.message}`);
    return false;
  }
}

// 將測試函數暴露到全域物件供控制台使用
if (typeof window !== "undefined") {
  (window as any).testBraveSearchFix = testBraveSearchFix;
  (window as any).testBraveSearchErrorCases = testBraveSearchErrorCases;
  (window as any).runComprehensiveBraveTest = runComprehensiveBraveTest;
}
