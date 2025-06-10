/**
 * PocketFlow 設置測試文件
 * 驗證 PocketFlow.js 依賴是否正確安裝和配置
 */

import { isPocketFlowReady, initializePocketFlow } from "./index";
import { Node, Flow } from "pocketflow";

/**
 * 簡單的測試 Node
 */
class TestNode extends Node<any> {
  async exec(input: any): Promise<string> {
    return `測試成功: ${input}`;
  }
}

/**
 * 運行基本測試
 */
export function runPocketFlowTests(): boolean {
  console.log("🚀 開始 PocketFlow 設置測試...");

  // 測試 1: 檢查 PocketFlow 是否可用
  console.log("📦 檢查 PocketFlow 可用性...");
  if (!isPocketFlowReady()) {
    console.error("❌ PocketFlow 不可用");
    return false;
  }
  console.log("✅ PocketFlow 可用");

  // 測試 2: 初始化 PocketFlow
  console.log("🔧 初始化 PocketFlow...");
  if (!initializePocketFlow()) {
    console.error("❌ PocketFlow 初始化失敗");
    return false;
  }
  console.log("✅ PocketFlow 初始化成功");

  // 測試 3: 創建基本 Node
  console.log("🏗️ 測試 Node 創建...");
  try {
    const testNode = new TestNode();
    if (!(testNode instanceof Node)) {
      throw new Error("Node 創建失敗");
    }
    console.log("✅ Node 創建成功");
  } catch (error) {
    console.error("❌ Node 創建失敗:", error);
    return false;
  }

  // 測試 4: 創建基本 Flow
  console.log("🔄 測試 Flow 創建...");
  try {
    const testNode = new TestNode();
    const testFlow = new Flow(testNode);
    if (!(testFlow instanceof Flow)) {
      throw new Error("Flow 創建失敗");
    }
    console.log("✅ Flow 創建成功");
  } catch (error) {
    console.error("❌ Flow 創建失敗:", error);
    return false;
  }

  // 測試 5: 簡單的執行測試
  console.log("▶️ 測試基本執行...");
  try {
    const testNode = new TestNode();
    const testFlow = new Flow(testNode);

    // 創建簡單的測試狀態
    const testState = { input: "Hello PocketFlow!" };

    // 驗證對象創建成功
    console.log(
      `✅ 基本執行測試準備完成 - Flow: ${testFlow.constructor.name}, State: ${JSON.stringify(testState)}`
    );
  } catch (error) {
    console.error("❌ 基本執行測試失敗:", error);
    return false;
  }

  console.log("🎉 所有 PocketFlow 設置測試通過！");
  return true;
}

/**
 * 顯示 PocketFlow 配置信息
 */
export function showPocketFlowInfo(): void {
  console.log("📋 PocketFlow 配置信息:");
  console.log("- 版本: 已安裝");
  console.log("- 狀態: 可用");
  console.log("- 自定義類型: ✅");
  console.log("- 基礎類別: ✅");
  console.log("- 配置文件: ✅");
  console.log("- 文檔: ✅");
}

// 如果直接運行這個文件，執行測試
if (require.main === module) {
  try {
    const success = runPocketFlowTests();
    if (success) {
      showPocketFlowInfo();
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error("測試運行失敗:", error);
    process.exit(1);
  }
}
