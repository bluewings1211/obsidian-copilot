/**
 * 真實 MCP 伺服器測試案例
 *
 * 測試與常見的 MCP 伺服器的實際整合
 */

import { Notice } from "obsidian";
import { McpIntegrationTestManager } from "./integration-test-comprehensive";
import type { McpServerConfig } from "./types";

/**
 * 常見的 MCP 伺服器配置範例
 */
interface ServerTemplate {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description: string;
  timeout?: number;
}

export const COMMON_MCP_SERVERS: ServerTemplate[] = [
  {
    name: "Memory Bank Server",
    command: "node",
    args: ["/path/to/memory-bank-server/dist/index.js"],
    env: {},
    description: "Memory bank MCP server for persistent context storage",
    timeout: 30000,
  },
  {
    name: "File System Server",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    env: {},
    description: "File system MCP server for file operations",
    timeout: 30000,
  },
  {
    name: "SQLite Server",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/tmp/test.db"],
    env: {},
    description: "SQLite MCP server for database operations",
    timeout: 30000,
  },
  {
    name: "GitHub Server",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "your_token_here",
    },
    description: "GitHub MCP server for repository operations",
    timeout: 30000,
  },
  {
    name: "Weather Server",
    command: "python",
    args: ["-m", "weather_server"],
    env: {
      WEATHER_API_KEY: "your_api_key_here",
    },
    description: "Weather MCP server for weather data",
    timeout: 30000,
  },
];

/**
 * 測試結果摘要
 */
interface TestSummary {
  totalServers: number;
  availableServers: number;
  testedServers: number;
  successfulServers: number;
  serverResults: Array<{
    name: string;
    available: boolean;
    tested: boolean;
    success: boolean;
    toolCount: number;
    resourceCount: number;
    error?: string;
  }>;
}

/**
 * 真實伺服器測試管理器
 */
export class RealServerTestManager {
  private testManager: McpIntegrationTestManager;

  constructor() {
    this.testManager = new McpIntegrationTestManager();
  }

  /**
   * 檢測可用的 MCP 伺服器
   */
  async detectAvailableServers(): Promise<McpServerConfig[]> {
    console.log("🔍 Detecting available MCP servers...");

    const availableServers: McpServerConfig[] = [];

    for (const serverTemplate of COMMON_MCP_SERVERS) {
      try {
        const isAvailable = await this.checkServerAvailability(serverTemplate);
        if (isAvailable) {
          const config: McpServerConfig = {
            id: this.generateServerId(serverTemplate.name),
            name: serverTemplate.name,
            enabled: true,
            transport: "stdio",
            connection: {
              command: serverTemplate.command,
              args: serverTemplate.args || [],
              env: serverTemplate.env || {},
            },
            description: serverTemplate.description,
            timeout: serverTemplate.timeout || 30000,
          };
          availableServers.push(config);
          console.log(`✅ Found: ${config.name}`);
        } else {
          console.log(`❌ Not available: ${serverTemplate.name}`);
        }
      } catch (error: any) {
        console.log(`❌ Error checking ${serverTemplate.name}:`, error.message);
      }
    }

    console.log(`📊 Found ${availableServers.length} available servers`);
    return availableServers;
  }

  /**
   * 執行真實伺服器測試
   */
  async runRealServerTests(): Promise<TestSummary> {
    console.log("🧪 Starting real MCP server tests...");

    try {
      // 檢測可用伺服器
      const availableServers = await this.detectAvailableServers();

      if (availableServers.length === 0) {
        new Notice("No MCP servers available for testing");
        return {
          totalServers: COMMON_MCP_SERVERS.length,
          availableServers: 0,
          testedServers: 0,
          successfulServers: 0,
          serverResults: COMMON_MCP_SERVERS.map((s) => ({
            name: s.name!,
            available: false,
            tested: false,
            success: false,
            toolCount: 0,
            resourceCount: 0,
            error: "Server not available",
          })),
        };
      }

      // 更新測試管理器的設定
      this.testManager = new McpIntegrationTestManager();
      await this.testManager.initialize();

      const results = await this.testManager.runComprehensiveTests();

      // 生成摘要
      const summary: TestSummary = {
        totalServers: COMMON_MCP_SERVERS.length,
        availableServers: availableServers.length,
        testedServers: results.serverResults.length,
        successfulServers: results.overallStats.successfulServers,
        serverResults: this.generateServerResultsSummary(results.serverResults),
      };

      this.displayResults(summary);
      return summary;
    } catch (error) {
      console.error("❌ Real server tests failed:", error);
      throw error;
    } finally {
      await this.testManager.cleanup();
    }
  }

  /**
   * 測試特定類型的 MCP 伺服器
   */
  async testServerType(serverType: string): Promise<void> {
    const serverTemplate = COMMON_MCP_SERVERS.find((s) =>
      s.name!.toLowerCase().includes(serverType.toLowerCase())
    );

    if (!serverTemplate) {
      throw new Error(`Server type '${serverType}' not found`);
    }

    console.log(`🧪 Testing ${serverTemplate.name}...`);

    const isAvailable = await this.checkServerAvailability(serverTemplate);
    if (!isAvailable) {
      throw new Error(`${serverTemplate.name} is not available`);
    }

    const config: McpServerConfig = {
      id: this.generateServerId(serverTemplate.name),
      name: serverTemplate.name,
      enabled: true,
      transport: "stdio",
      connection: {
        command: serverTemplate.command,
        args: serverTemplate.args || [],
        env: serverTemplate.env || {},
      },
      description: serverTemplate.description,
      timeout: serverTemplate.timeout || 30000,
    };

    await this.testManager.initialize();
    const result = await this.testManager.testServer(config);

    console.log(`Test Result for ${config.name}:`, result);

    if (result.overallSuccess) {
      new Notice(`${config.name} test passed!`);
    } else {
      new Notice(`${config.name} test failed!`);
    }
  }

  /**
   * 檢查伺服器可用性
   */
  private async checkServerAvailability(serverTemplate: ServerTemplate): Promise<boolean> {
    try {
      // 檢查命令是否存在
      const { execSync } = await import("child_process");

      if (serverTemplate.command === "npx") {
        // 檢查 npm 包是否可用
        try {
          execSync(`npm list -g ${serverTemplate.args![1]}`, { stdio: "ignore" });
          return true;
        } catch {
          // 嘗試檢查本地安裝
          try {
            execSync(`npm list ${serverTemplate.args![1]}`, { stdio: "ignore" });
            return true;
          } catch {
            return false;
          }
        }
      } else if (serverTemplate.command === "node") {
        // 檢查 Node.js 檔案是否存在
        const fs = await import("fs");
        return fs.existsSync(serverTemplate.args![0]);
      } else if (serverTemplate.command === "python") {
        // 檢查 Python 模組
        try {
          execSync(`python -c "import ${serverTemplate.args![1].replace("-", "_")}"`, {
            stdio: "ignore",
          });
          return true;
        } catch {
          return false;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 生成伺服器 ID
   */
  private generateServerId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  }

  /**
   * 生成伺服器結果摘要
   */
  private generateServerResultsSummary(serverResults: any[]): TestSummary["serverResults"] {
    return COMMON_MCP_SERVERS.map((template) => {
      const result = serverResults.find((r) =>
        r.serverName.toLowerCase().includes(template.name!.toLowerCase())
      );

      if (result) {
        return {
          name: template.name!,
          available: true,
          tested: true,
          success: result.overallSuccess,
          toolCount: result.toolsCount,
          resourceCount: result.resourcesCount,
          error: result.overallSuccess ? undefined : "Test failed",
        };
      } else {
        return {
          name: template.name!,
          available: false,
          tested: false,
          success: false,
          toolCount: 0,
          resourceCount: 0,
          error: "Server not available",
        };
      }
    });
  }

  /**
   * 顯示測試結果
   */
  private displayResults(summary: TestSummary): void {
    console.log("\n🎉 Real Server Test Summary:");
    console.log(`📊 Total Servers: ${summary.totalServers}`);
    console.log(`✅ Available: ${summary.availableServers}`);
    console.log(`🧪 Tested: ${summary.testedServers}`);
    console.log(`🎯 Successful: ${summary.successfulServers}`);

    console.log("\n📋 Server Details:");
    for (const result of summary.serverResults) {
      const status = result.success ? "✅" : result.tested ? "❌" : "⚠️";
      console.log(
        `${status} ${result.name}: ${result.toolCount} tools, ${result.resourceCount} resources`
      );
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    // 顯示通知
    if (summary.successfulServers === summary.testedServers && summary.testedServers > 0) {
      new Notice(`All ${summary.testedServers} available MCP servers passed tests!`);
    } else if (summary.successfulServers > 0) {
      new Notice(`${summary.successfulServers}/${summary.testedServers} MCP servers passed tests`);
    } else {
      new Notice("No MCP servers passed tests");
    }
  }
}

/**
 * 執行真實 MCP 伺服器測試
 */
export async function runRealMcpServerTests(): Promise<void> {
  const testManager = new RealServerTestManager();
  await testManager.runRealServerTests();
}

/**
 * 測試特定類型的伺服器
 */
export async function testMcpServerType(serverType: string): Promise<void> {
  const testManager = new RealServerTestManager();
  await testManager.testServerType(serverType);
}

// 全域函數，可在開發者控制台中使用
declare global {
  interface Window {
    runRealMcpServerTests: () => Promise<void>;
    testMcpServerType: (serverType: string) => Promise<void>;
    listCommonMcpServers: () => void;
  }
}

// 註冊全域函數
if (typeof window !== "undefined") {
  window.runRealMcpServerTests = runRealMcpServerTests;
  window.testMcpServerType = testMcpServerType;
  window.listCommonMcpServers = () => {
    console.log("Common MCP Servers:");
    COMMON_MCP_SERVERS.forEach((server, index) => {
      console.log(`${index + 1}. ${server.name}: ${server.description}`);
    });
  };
}
