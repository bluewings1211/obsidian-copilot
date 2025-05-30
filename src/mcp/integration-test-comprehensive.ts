/**
 * 全面的 MCP 整合測試
 *
 * 測試與實際 MCP 伺服器的整合，確保與多種 MCP 伺服器成功互動
 */

import { Notice } from "obsidian";
import { McpManager } from "./manager";
import { McpToolAdapterManager } from "./tool-adapter";
import { getSettings } from "@/settings/model";
import type { McpServerConfig } from "./types";

/**
 * 測試結果介面
 */
interface TestResult {
  testName: string;
  success: boolean;
  error?: string;
  details?: any;
  duration: number;
}

/**
 * 伺服器測試結果
 */
interface ServerTestResult {
  serverId: string;
  serverName: string;
  config: McpServerConfig;
  connectionSuccess: boolean;
  toolsCount: number;
  resourcesCount: number;
  promptsCount: number;
  testResults: TestResult[];
  overallSuccess: boolean;
  totalDuration: number;
}

/**
 * 整合測試管理器
 */
export class McpIntegrationTestManager {
  private mcpManager: McpManager;
  private testResults: Map<string, ServerTestResult> = new Map();

  constructor() {
    // 創建新的 McpManager 實例
    const settings = getSettings();
    this.mcpManager = new McpManager(settings.mcpIntegration);
  }

  /**
   * 執行全面的整合測試
   */
  async runComprehensiveTests(): Promise<{
    success: boolean;
    serverResults: ServerTestResult[];
    overallStats: {
      totalServers: number;
      successfulServers: number;
      totalTests: number;
      passedTests: number;
      totalDuration: number;
    };
  }> {
    console.log("🧪 Starting comprehensive MCP integration tests...");
    const startTime = Date.now();

    try {
      // 檢查基礎設定
      const basicTestResult = await this.runBasicTests();
      if (!basicTestResult.success) {
        throw new Error(`Basic test failed: ${basicTestResult.error}`);
      }

      // 啟動 MCP Manager
      await this.mcpManager.start();

      // 獲取所有配置的伺服器
      const settings = getSettings();
      const serverConfigs = settings.mcpIntegration.servers;

      if (serverConfigs.length === 0) {
        console.log("⚠️ No MCP servers configured for testing");
        new Notice("No MCP servers configured for testing");
        return {
          success: false,
          serverResults: [],
          overallStats: {
            totalServers: 0,
            successfulServers: 0,
            totalTests: 0,
            passedTests: 0,
            totalDuration: Date.now() - startTime,
          },
        };
      }

      // 測試每個伺服器
      const serverResults: ServerTestResult[] = [];
      for (const config of serverConfigs) {
        if (config.enabled) {
          const result = await this.testServer(config);
          serverResults.push(result);
          this.testResults.set(config.id, result);
        }
      }

      // 測試伺服器間的互動
      await this.testMultiServerInteraction();

      // 計算統計資訊
      const totalDuration = Date.now() - startTime;
      const successfulServers = serverResults.filter((r) => r.overallSuccess).length;
      const totalTests = serverResults.reduce((sum, r) => sum + r.testResults.length, 0);
      const passedTests = serverResults.reduce(
        (sum, r) => sum + r.testResults.filter((t) => t.success).length,
        0
      );

      const overallSuccess = successfulServers === serverResults.length;

      console.log(`🎉 Integration tests completed in ${totalDuration}ms`);
      console.log(
        `📊 Results: ${passedTests}/${totalTests} tests passed, ${successfulServers}/${serverResults.length} servers successful`
      );

      new Notice(`MCP Integration Tests: ${passedTests}/${totalTests} tests passed`);

      return {
        success: overallSuccess,
        serverResults,
        overallStats: {
          totalServers: serverResults.length,
          successfulServers,
          totalTests,
          passedTests,
          totalDuration,
        },
      };
    } catch (error) {
      console.error("❌ Integration tests failed:", error);
      new Notice(`Integration tests failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 執行基礎測試
   */
  private async runBasicTests(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 檢查設定
      const settings = getSettings();
      if (!settings.mcpIntegration.enabled) {
        throw new Error("MCP integration is disabled in settings");
      }

      // 檢查管理器初始化
      if (!this.mcpManager) {
        throw new Error("McpManager is not available");
      }

      if (!McpToolAdapterManager.isInitialized()) {
        throw new Error("McpToolAdapterManager is not initialized");
      }

      return {
        testName: "Basic Configuration",
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Basic Configuration",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試單個伺服器
   */
  public async testServer(config: McpServerConfig): Promise<ServerTestResult> {
    console.log(`🔧 Testing server: ${config.name} (${config.id})`);
    const startTime = Date.now();
    const testResults: TestResult[] = [];

    const result: ServerTestResult = {
      serverId: config.id,
      serverName: config.name,
      config,
      connectionSuccess: false,
      toolsCount: 0,
      resourcesCount: 0,
      promptsCount: 0,
      testResults,
      overallSuccess: false,
      totalDuration: 0,
    };

    try {
      // 測試連接
      const connectionTest = await this.testConnection(config);
      testResults.push(connectionTest);
      result.connectionSuccess = connectionTest.success;

      if (!connectionTest.success) {
        result.totalDuration = Date.now() - startTime;
        return result;
      }

      // 測試工具列表
      const toolsTest = await this.testTools(config);
      testResults.push(toolsTest);
      result.toolsCount = toolsTest.details?.count || 0;

      // 測試資源列表
      const resourcesTest = await this.testResources(config);
      testResults.push(resourcesTest);
      result.resourcesCount = resourcesTest.details?.count || 0;

      // 測試提示列表
      const promptsTest = await this.testPrompts(config);
      testResults.push(promptsTest);
      result.promptsCount = promptsTest.details?.count || 0;

      // 測試工具調用（如果有工具）
      if (result.toolsCount > 0) {
        const toolCallTest = await this.testToolCall(config);
        testResults.push(toolCallTest);
      }

      // 測試資源存取（如果有資源）
      if (result.resourcesCount > 0) {
        const resourceAccessTest = await this.testResourceAccess(config);
        testResults.push(resourceAccessTest);
      }

      // 計算整體成功
      result.overallSuccess = testResults.every((t) => t.success);
      result.totalDuration = Date.now() - startTime;

      console.log(
        `✅ Server ${config.name} testing completed: ${result.overallSuccess ? "SUCCESS" : "FAILED"}`
      );
      return result;
    } catch (error) {
      console.error(`❌ Server ${config.name} testing failed:`, error);
      testResults.push({
        testName: "Server Testing",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      result.totalDuration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * 測試伺服器連接
   */
  private async testConnection(config: McpServerConfig): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 檢查伺服器狀態
      const status = this.mcpManager.getServerStatus(config.id);
      if (!status) {
        throw new Error("Server not found in manager");
      }

      if (status.state !== "connected") {
        throw new Error(`Server is not connected, state: ${status.state}`);
      }

      return {
        testName: "Connection",
        success: true,
        details: { state: status.state, serverInfo: status.serverInfo },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Connection",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試工具列表
   */
  private async testTools(config: McpServerConfig): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const allTools = await this.mcpManager.getTools();
      const serverTools = allTools.filter((t: any) => t.serverId === config.id);

      return {
        testName: "Tools List",
        success: true,
        details: { count: serverTools.length, tools: serverTools.map((t: any) => t.name) },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Tools List",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試資源列表
   */
  private async testResources(config: McpServerConfig): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const allResources = await this.mcpManager.getResources();
      const serverResources = allResources.filter((r: any) => r.serverId === config.id);

      return {
        testName: "Resources List",
        success: true,
        details: {
          count: serverResources.length,
          resources: serverResources.map((r: any) => r.uri),
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Resources List",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試提示列表
   */
  private async testPrompts(config: McpServerConfig): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const allPrompts = await this.mcpManager.getPrompts();
      const serverPrompts = allPrompts.filter((p: any) => p.serverId === config.id);

      return {
        testName: "Prompts List",
        success: true,
        details: { count: serverPrompts.length, prompts: serverPrompts.map((p: any) => p.name) },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Prompts List",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試工具調用
   */
  private async testToolCall(config: McpServerConfig): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const allTools = await this.mcpManager.getTools();
      const serverTools = allTools.filter((t: any) => t.serverId === config.id);

      if (serverTools.length === 0) {
        throw new Error("No tools available for testing");
      }

      // 選擇第一個工具進行測試
      const tool = serverTools[0];

      // 檢查是否有安全的測試參數
      const testArgs = this.getTestArgsForTool(tool);

      if (testArgs === null) {
        // 如果沒有安全的測試參數，就跳過實際調用
        return {
          testName: "Tool Call (Validation Only)",
          success: true,
          details: {
            toolName: tool.name,
            note: "Tool validation passed, actual call skipped for safety",
          },
          duration: Date.now() - startTime,
        };
      }

      const result = await this.mcpManager.callTool(config.id, {
        name: tool.name,
        arguments: testArgs,
      });

      return {
        testName: "Tool Call",
        success: true,
        details: { toolName: tool.name, args: testArgs, result },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Tool Call",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試資源存取
   */
  private async testResourceAccess(config: McpServerConfig): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const allResources = await this.mcpManager.getResources();
      const serverResources = allResources.filter((r: any) => r.serverId === config.id);

      if (serverResources.length === 0) {
        throw new Error("No resources available for testing");
      }

      // 選擇第一個資源進行測試
      const resource = serverResources[0];
      const content = await this.mcpManager.readResource(config.id, {
        uri: resource.uri,
      });

      return {
        testName: "Resource Access",
        success: true,
        details: {
          uri: resource.uri,
          contentLength: content.contents?.[0]?.text?.length || 0,
          hasContent: content.contents && content.contents.length > 0,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testName: "Resource Access",
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 測試多伺服器互動
   */
  private async testMultiServerInteraction(): Promise<void> {
    const serverCount = this.testResults.size;
    if (serverCount < 2) {
      console.log("⚠️ Need at least 2 servers for multi-server interaction testing");
      return;
    }

    console.log("🔗 Testing multi-server interaction...");

    try {
      // 測試工具適配器的統一接口
      if (McpToolAdapterManager.isInitialized()) {
        const adapter = McpToolAdapterManager.getInstance();
        const allTools = await adapter.getTools();
        const uniqueServers = new Set(allTools.map((t: any) => t.serverId));

        console.log(
          `✅ Multi-server tools aggregation: ${allTools.length} tools from ${uniqueServers.size} servers`
        );

        // 測試工具名稱唯一性
        const toolNames = allTools.map((t: any) => t.name);
        const uniqueToolNames = new Set(toolNames);

        if (toolNames.length !== uniqueToolNames.size) {
          console.log("⚠️ Warning: Tool name conflicts detected");
        } else {
          console.log("✅ All tool names are unique across servers");
        }
      }
    } catch (error) {
      console.error("❌ Multi-server interaction test failed:", error);
    }
  }

  /**
   * 獲取工具的測試參數
   */
  private getTestArgsForTool(tool: any): any | null {
    // 為不同類型的工具返回安全的測試參數
    const toolName = tool.name.toLowerCase();

    // 安全的測試工具
    if (toolName.includes("echo") || toolName.includes("test")) {
      return { message: "test" };
    }

    if (toolName.includes("time") || toolName.includes("date")) {
      return {};
    }

    if (toolName.includes("weather") && toolName.includes("get")) {
      return { location: "New York" };
    }

    // 對於其他工具，為了安全起見不進行實際調用
    return null;
  }

  /**
   * 生成測試報告
   */
  generateReport(): string {
    let report = "# MCP Integration Test Report\n\n";

    for (const [, result] of this.testResults) {
      report += `## Server: ${result.serverName} (${result.serverId})\n\n`;
      report += `- **Status**: ${result.overallSuccess ? "✅ SUCCESS" : "❌ FAILED"}\n`;
      report += `- **Connection**: ${result.connectionSuccess ? "✅" : "❌"}\n`;
      report += `- **Tools**: ${result.toolsCount}\n`;
      report += `- **Resources**: ${result.resourcesCount}\n`;
      report += `- **Prompts**: ${result.promptsCount}\n`;
      report += `- **Duration**: ${result.totalDuration}ms\n\n`;

      report += "### Test Results:\n\n";
      for (const test of result.testResults) {
        report += `- **${test.testName}**: ${test.success ? "✅" : "❌"} (${test.duration}ms)\n`;
        if (!test.success && test.error) {
          report += `  - Error: ${test.error}\n`;
        }
        if (test.details) {
          report += `  - Details: ${JSON.stringify(test.details)}\n`;
        }
      }
      report += "\n";
    }

    return report;
  }

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    await this.mcpManager.start();
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    try {
      await this.mcpManager.stop();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }
}

/**
 * 執行全面的 MCP 整合測試
 */
export async function runComprehensiveMcpIntegrationTest(): Promise<void> {
  const testManager = new McpIntegrationTestManager();

  try {
    const results = await testManager.runComprehensiveTests();

    // 生成並顯示報告
    const report = testManager.generateReport();
    console.log(report);

    if (results.success) {
      console.log("🎉 All integration tests passed!");
      new Notice("All MCP integration tests passed!");
    } else {
      console.log("⚠️ Some integration tests failed");
      new Notice("Some MCP integration tests failed. Check console for details.");
    }
  } catch (error) {
    console.error("❌ Integration test execution failed:", error);
    new Notice(`Integration test failed: ${error.message}`);
  } finally {
    await testManager.cleanup();
  }
}

/**
 * 測試特定 MCP 伺服器
 */
export async function testSpecificMcpServer(serverId: string): Promise<void> {
  const testManager = new McpIntegrationTestManager();
  const settings = getSettings();
  const config = settings.mcpIntegration.servers.find((s) => s.id === serverId);

  if (!config) {
    throw new Error(`Server ${serverId} not found in configuration`);
  }

  try {
    await testManager.initialize();

    console.log(`🧪 Testing specific MCP server: ${config.name}`);
    const result = await testManager.testServer(config);

    console.log("Test Result:", result);

    if (result.overallSuccess) {
      new Notice(`Server ${config.name} test passed!`);
    } else {
      new Notice(`Server ${config.name} test failed!`);
    }
  } finally {
    await testManager.cleanup();
  }
}

// 全域測試函數，可在開發者控制台中使用
declare global {
  interface Window {
    runMcpIntegrationTest: () => Promise<void>;
    testMcpServer: (serverId: string) => Promise<void>;
  }
}

// 註冊全域函數
if (typeof window !== "undefined") {
  window.runMcpIntegrationTest = runComprehensiveMcpIntegrationTest;
  window.testMcpServer = testSpecificMcpServer;
}
