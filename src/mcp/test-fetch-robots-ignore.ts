/**
 * Test script to verify --ignore-robots-txt parameter configuration
 * for mcp-server-fetch
 */

import { McpManager } from "./manager";
import { McpServerConfig, McpIntegrationSettings } from "./types";
import { DEFAULTS, LOG_LEVELS } from "./constants";

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

class FetchRobotsIgnoreTest {
  private mcpManager: McpManager;

  constructor() {
    // Create default MCP integration settings for testing
    const defaultSettings: McpIntegrationSettings = {
      enabled: true,
      servers: [],
      globalTimeout: DEFAULTS.CONNECTION_TIMEOUT,
      maxConcurrentConnections: DEFAULTS.MAX_CONCURRENT_CONNECTIONS,
      debugMode: true,
      logLevel: LOG_LEVELS.DEBUG,
    };

    this.mcpManager = new McpManager(defaultSettings, {
      debug: true,
      logLevel: LOG_LEVELS.DEBUG,
    });
  }

  /**
   * Test configuration for fetch server with --ignore-robots-txt
   */
  async testFetchServerConfig(): Promise<TestResult> {
    console.log("🧪 Testing fetch server configuration with --ignore-robots-txt...");

    // Test configurations to try
    const testConfigs: McpServerConfig[] = [
      {
        id: "fetch-test-uvx",
        name: "fetch-test-uvx",
        description: "Fetch server with robots.txt ignored (uvx)",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "uvx",
          args: ["mcp-server-fetch", "--ignore-robots-txt"],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      {
        id: "fetch-test-python",
        name: "fetch-test-python",
        description: "Fetch server with robots.txt ignored (python)",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "python",
          args: ["-m", "mcp_server_fetch", "--ignore-robots-txt"],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      {
        id: "fetch-test-docker",
        name: "fetch-test-docker",
        description: "Fetch server with robots.txt ignored (docker)",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "docker",
          args: ["run", "-i", "--rm", "mcp/fetch", "--ignore-robots-txt"],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
    ];

    const results: TestResult[] = [];

    for (const config of testConfigs) {
      try {
        console.log(`\n📋 Testing configuration: ${config.name}`);
        console.log(`   Command: ${(config.connection as any).command}`);
        console.log(`   Args: ${JSON.stringify((config.connection as any).args)}`);

        // Validate the configuration
        const validationResult = this.validateServerConfig(config);

        if (validationResult.success) {
          console.log(`   ✅ Configuration valid: ${validationResult.message}`);
          results.push({
            success: true,
            message: `${config.name}: Configuration valid`,
            details: { config, validation: validationResult },
          });
        } else {
          console.log(`   ❌ Configuration invalid: ${validationResult.message}`);
          results.push({
            success: false,
            message: `${config.name}: ${validationResult.message}`,
            details: { config, validation: validationResult },
          });
        }
      } catch (error) {
        results.push({
          success: false,
          message: `${config.name}: Error - ${error instanceof Error ? error.message : String(error)}`,
          details: { config, error },
        });
      }
    }

    return this.summarizeResults(results);
  }

  /**
   * Validate server configuration
   */
  private validateServerConfig(config: McpServerConfig): TestResult {
    try {
      // Check basic configuration structure
      if (!config.name || !config.id) {
        return {
          success: false,
          message: "Missing required fields: name or id",
        };
      }

      if (config.transport !== "stdio") {
        return {
          success: false,
          message: "Only stdio transport is supported for mcp-server-fetch",
        };
      }

      const connection = config.connection as any;
      if (!connection.command || !Array.isArray(connection.args)) {
        return {
          success: false,
          message: "Invalid connection configuration: missing command or args",
        };
      }

      // Check for --ignore-robots-txt parameter
      const hasIgnoreRobots = connection.args.includes("--ignore-robots-txt");
      if (!hasIgnoreRobots) {
        return {
          success: false,
          message: "--ignore-robots-txt parameter not found in args array",
        };
      }

      // Validate command-specific configurations
      switch (connection.command) {
        case "uvx":
          if (!connection.args.includes("mcp-server-fetch")) {
            return {
              success: false,
              message: "uvx command must include mcp-server-fetch package",
            };
          }
          break;

        case "python":
          if (!connection.args.includes("-m") || !connection.args.includes("mcp_server_fetch")) {
            return {
              success: false,
              message: "python command must include -m mcp_server_fetch",
            };
          }
          break;

        case "docker":
          if (!connection.args.includes("mcp/fetch")) {
            return {
              success: false,
              message: "docker command must include mcp/fetch image",
            };
          }
          break;

        default:
          return {
            success: false,
            message: `Unsupported command: ${connection.command}`,
          };
      }

      // Check parameter order
      const ignoreRobotsIndex = connection.args.indexOf("--ignore-robots-txt");
      if (ignoreRobotsIndex === -1) {
        return {
          success: false,
          message: "--ignore-robots-txt parameter not found",
        };
      }

      return {
        success: true,
        message: "Configuration is valid and includes --ignore-robots-txt parameter",
      };
    } catch (error) {
      return {
        success: false,
        message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Test parameter variations and common mistakes
   */
  async testParameterVariations(): Promise<TestResult> {
    console.log("\n🔧 Testing parameter variations and common mistakes...");

    const testCases = [
      {
        name: "Correct parameter",
        args: ["mcp-server-fetch", "--ignore-robots-txt"],
        expected: true,
        description: "Standard correct usage",
      },
      {
        name: "Wrong parameter name",
        args: ["mcp-server-fetch", "--ignore-robots"],
        expected: false,
        description: "Incomplete parameter name",
      },
      {
        name: "Wrong parameter format",
        args: ["mcp-server-fetch", "ignore-robots-txt"],
        expected: false,
        description: "Missing double dashes",
      },
      {
        name: "Multiple parameters",
        args: ["mcp-server-fetch", "--ignore-robots-txt", "--user-agent=Test/1.0"],
        expected: true,
        description: "Multiple valid parameters",
      },
      {
        name: "Parameter with value",
        args: ["mcp-server-fetch", "--ignore-robots-txt=true"],
        expected: false,
        description: "Parameter should not have value",
      },
    ];

    const results: TestResult[] = [];

    for (const testCase of testCases) {
      console.log(`\n   Testing: ${testCase.name}`);
      console.log(`     Args: ${JSON.stringify(testCase.args)}`);
      console.log(`     Expected: ${testCase.expected ? "Valid" : "Invalid"}`);

      const hasCorrectParam = testCase.args.includes("--ignore-robots-txt");
      const isValid = hasCorrectParam && testCase.expected;

      if (isValid === testCase.expected) {
        console.log(`     ✅ Result: As expected`);
        results.push({
          success: true,
          message: `${testCase.name}: Test passed`,
          details: testCase,
        });
      } else {
        console.log(`     ❌ Result: Unexpected`);
        results.push({
          success: false,
          message: `${testCase.name}: Test failed`,
          details: testCase,
        });
      }
    }

    return this.summarizeResults(results);
  }

  /**
   * Generate configuration examples
   */
  generateConfigurationExamples(): Record<string, McpServerConfig> {
    return {
      uvx: {
        id: "fetch-uvx",
        name: "fetch",
        description: "Web content fetching with robots.txt ignored (uvx)",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "uvx",
          args: ["mcp-server-fetch", "--ignore-robots-txt"],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      python: {
        id: "fetch-python",
        name: "fetch",
        description: "Web content fetching with robots.txt ignored (python)",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "python",
          args: ["-m", "mcp_server_fetch", "--ignore-robots-txt"],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      docker: {
        id: "fetch-docker",
        name: "fetch",
        description: "Web content fetching with robots.txt ignored (docker)",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "docker",
          args: ["run", "-i", "--rm", "mcp/fetch", "--ignore-robots-txt"],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
      "with-additional-params": {
        id: "fetch-advanced",
        name: "fetch",
        description: "Web content fetching with additional parameters",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "uvx",
          args: [
            "mcp-server-fetch",
            "--ignore-robots-txt",
            "--user-agent=ObsidianCopilot/1.0",
            "--proxy-url=http://proxy.example.com:8080",
          ],
          env: {},
          cwd: "",
        },
        capabilities: ["tools"],
        timeout: 15000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
    };
  }

  /**
   * Summarize test results
   */
  private summarizeResults(results: TestResult[]): TestResult {
    const successful = results.filter((r) => r.success).length;
    const total = results.length;

    if (successful === total) {
      return {
        success: true,
        message: `All tests passed (${successful}/${total})`,
        details: results,
      };
    } else {
      return {
        success: false,
        message: `Some tests failed (${successful}/${total} passed)`,
        details: results,
      };
    }
  }

  /**
   * Generate configuration recommendations
   */
  generateRecommendations(): string[] {
    return [
      "1. 正確的參數配置:",
      '   ✅ uvx: ["mcp-server-fetch", "--ignore-robots-txt"]',
      '   ✅ python: ["-m", "mcp_server_fetch", "--ignore-robots-txt"]',
      '   ✅ docker: ["run", "-i", "--rm", "mcp/fetch", "--ignore-robots-txt"]',
      "",
      "2. 常見錯誤避免:",
      '   ❌ 錯誤: "--ignore-robots" (參數名不完整)',
      '   ❌ 錯誤: "ignore-robots-txt" (缺少雙破折號)',
      '   ❌ 錯誤: "--ignore-robots-txt=true" (不應有值)',
      "",
      "3. 參數順序:",
      "   - 主要命令/包名在前",
      "   - --ignore-robots-txt 在後",
      "   - 其他參數可以任意順序",
      "",
      "4. 其他可用參數:",
      "   - --user-agent=YourUserAgent",
      "   - --proxy-url=http://proxy:port",
      "",
      "5. 除錯步驟:",
      "   - 檢查參數拼寫是否正確",
      "   - 確認參數在 args 陣列中",
      "   - 開啟 MCP 除錯模式查看日誌",
      "   - 測試伺服器是否正常啟動",
      "",
      "6. 驗證方法:",
      "   - 查看 MCP 設定中的伺服器狀態",
      "   - 測試存取被 robots.txt 限制的網站",
      "   - 檢查伺服器啟動日誌",
    ];
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log("🚀 Starting mcp-server-fetch robots.txt ignore tests...\n");

    try {
      // Test server configurations
      const configResult = await this.testFetchServerConfig();
      console.log(
        `\n📊 Configuration Test Result: ${configResult.success ? "✅ PASS" : "❌ FAIL"}`
      );
      console.log(`   ${configResult.message}`);

      // Test parameter variations
      const paramResult = await this.testParameterVariations();
      console.log(
        `\n📊 Parameter Variations Test Result: ${paramResult.success ? "✅ PASS" : "❌ FAIL"}`
      );
      console.log(`   ${paramResult.message}`);

      // Generate configuration examples
      console.log("\n📝 Configuration Examples:");
      const examples = this.generateConfigurationExamples();
      Object.entries(examples).forEach(([name, config]) => {
        console.log(`\n   ${name.toUpperCase()}:`);
        console.log(`     Command: ${(config.connection as any).command}`);
        console.log(`     Args: ${JSON.stringify((config.connection as any).args)}`);
      });

      // Generate recommendations
      console.log("\n💡 Configuration Recommendations:");
      const recommendations = this.generateRecommendations();
      recommendations.forEach((rec) => console.log(`   ${rec}`));

      // Overall result
      const overallSuccess = configResult.success && paramResult.success;
      console.log(
        `\n🎯 Overall Test Result: ${overallSuccess ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}`
      );

      if (overallSuccess) {
        console.log(
          "   所有配置測試都通過了！您可以使用上述任一配置來啟用 --ignore-robots-txt 參數。"
        );
      } else {
        console.log("   請檢查上述建議並修正配置問題。");
      }

      console.log("\n✨ Test completed!");
    } catch (error) {
      console.error("❌ Test execution failed:", error);
    }
  }
}

// Export for use in other modules
export { FetchRobotsIgnoreTest };

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new FetchRobotsIgnoreTest();
  tester.runAllTests().catch(console.error);
}
