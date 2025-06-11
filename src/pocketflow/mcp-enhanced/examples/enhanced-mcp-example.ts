/**
 * 增強 MCP 系統使用示例
 *
 * 展示如何配置和使用企業級 MCP 增強功能
 */

import { EnhancedMcpManager, EnhancedMcpConfig } from "../index";
import type { McpIntegrationSettings } from "@/mcp/types";

/**
 * 基本使用示例
 */
export async function basicEnhancedMcpExample() {
  console.log("=== 基本增強 MCP 系統示例 ===");

  // 配置 MCP 設置
  const mcpSettings: McpIntegrationSettings = {
    enabled: true,
    servers: [
      {
        id: "brave-search",
        name: "Brave Search",
        description: "Brave 搜索引擎",
        enabled: true,
        transport: "stdio",
        connection: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-brave-search"],
          env: {
            BRAVE_API_KEY: process.env.BRAVE_API_KEY || "",
          },
        },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
    ],
    globalTimeout: 30000,
    maxConcurrentConnections: 10,
    debugMode: true,
    logLevel: "info",
  };

  // 配置增強功能
  const config: EnhancedMcpConfig = {
    mcpSettings,

    // 連接池配置
    connectionPool: {
      maxConnectionsPerServer: 3,
      maxTotalConnections: 20,
      idleTimeout: 300000, // 5 分鐘
      healthCheckInterval: 60000, // 1 分鐘
    },

    // 負載均衡配置
    loadBalancer: {
      strategy: "least-connections",
      enableFailover: true,
      maxRetries: 3,
    },

    // 緩存配置
    cache: {
      maxEntries: 1000,
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      defaultTtl: 300000, // 5 分鐘
      enableStats: true,
    },

    // 並行執行配置
    parallelExecution: {
      maxConcurrency: 5,
      defaultTimeout: 30000,
      enableResourceMonitoring: true,
    },

    // 錯誤處理配置
    errorHandling: {
      enableClassification: true,
      enableMachineLearning: false,
    },

    // 監控配置
    monitoring: {
      enableMetrics: true,
      enableAlerting: true,
      collectionInterval: 10000, // 10 秒
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 小時
    },

    debug: true,
  };

  // 創建增強管理器
  const manager = new EnhancedMcpManager(config);

  // 設置事件監聽器
  manager.on("systemStarted", () => {
    console.log("✅ 增強 MCP 系統已啟動");
  });

  manager.on("connectionEstablished", (serverId) => {
    console.log(`🔗 服務器連接建立: ${serverId}`);
  });

  manager.on("criticalError", (error, classification) => {
    console.error(`🚨 關鍵錯誤: ${error.message}`, {
      category: classification.category,
      severity: classification.severity,
    });
  });

  manager.on("performanceAlert", (metric, value, threshold) => {
    console.warn(`⚠️ 性能告警: ${metric} = ${value} (閾值: ${threshold})`);
  });

  try {
    // 啟動系統
    await manager.start();

    // 等待系統穩定
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 執行工具調用
    console.log("\n--- 執行工具調用 ---");
    const result = await manager.callTool(
      {
        name: "brave_web_search",
        arguments: {
          query: "TypeScript best practices",
          count: 5,
        },
      },
      {
        enableCache: true,
        timeout: 15000,
      }
    );

    console.log("工具調用結果:", {
      isError: result.isError,
      contentCount: result.content.length,
    });

    // 獲取系統狀態
    console.log("\n--- 系統狀態 ---");
    const status = manager.getStatus();
    console.log("系統健康狀態:", {
      isHealthy: status.isHealthy,
      uptime: `${Math.round(status.uptime / 1000)}秒`,
      connections: status.components.connectionPool.connections,
      cacheHitRate: `${(status.performance.cacheHitRate * 100).toFixed(1)}%`,
      avgResponseTime: `${status.performance.averageResponseTime.toFixed(0)}ms`,
    });

    // 執行批量調用示例
    console.log("\n--- 批量執行示例 ---");
    const batchResults = await manager.executeBatch(
      [
        {
          params: {
            name: "brave_web_search",
            arguments: { query: "JavaScript frameworks", count: 3 },
          },
          priority: 1,
        },
        {
          params: {
            name: "brave_web_search",
            arguments: { query: "React best practices", count: 3 },
          },
          priority: 2,
        },
      ],
      {
        maxConcurrency: 2,
        failFast: false,
      }
    );

    console.log("批量執行結果:", {
      total: batchResults.length,
      successful: batchResults.filter((r) => r.success).length,
      failed: batchResults.filter((r) => !r.success).length,
    });
  } catch (error) {
    console.error("示例執行失敗:", error);
  } finally {
    // 清理資源
    await manager.stop();
    console.log("🔌 增強 MCP 系統已停止");
  }
}

/**
 * 監控和診斷示例
 */
export async function monitoringExample() {
  console.log("\n=== 監控和診斷示例 ===");

  const config: EnhancedMcpConfig = {
    mcpSettings: {
      enabled: true,
      servers: [],
      globalTimeout: 30000,
      maxConcurrentConnections: 10,
      debugMode: false,
      logLevel: "info",
    },
    monitoring: {
      enableMetrics: true,
      enableAlerting: true,
      collectionInterval: 5000, // 5 秒
    },
    debug: false,
  };

  const manager = new EnhancedMcpManager(config);

  // 監控事件
  manager.on("healthCheckCompleted", (status) => {
    console.log("健康檢查完成:", {
      isHealthy: status.isHealthy,
      activeConnections: status.components.connectionPool.connections,
      errorRate: `${(status.performance.errorRate * 100).toFixed(2)}%`,
    });
  });

  manager.on("metricsSnapshot", (metrics) => {
    console.log("指標快照:", {
      requestsPerSecond: metrics.mcp.requests.requestsPerSecond,
      averageResponseTime: metrics.mcp.requests.avgResponseTime,
      cacheHitRate: metrics.mcp.cache.hitRate,
    });
  });

  try {
    await manager.start();

    // 定期健康檢查
    const healthCheckInterval = setInterval(async () => {
      await manager.performHealthCheck();
    }, 10000);

    // 運行 30 秒後停止
    setTimeout(async () => {
      clearInterval(healthCheckInterval);
      await manager.stop();
      console.log("監控示例完成");
    }, 30000);
  } catch (error) {
    console.error("監控示例失敗:", error);
  }
}

/**
 * 性能基準測試
 */
export async function performanceBenchmark() {
  console.log("\n=== 性能基準測試 ===");

  const config: EnhancedMcpConfig = {
    mcpSettings: {
      enabled: true,
      servers: [
        {
          id: "test-server",
          name: "Test Server",
          description: "測試服務器",
          enabled: true,
          transport: "stdio",
          connection: {
            command: "echo",
            args: ["test"],
          },
        },
      ],
      globalTimeout: 30000,
      maxConcurrentConnections: 20,
      debugMode: false,
      logLevel: "warning",
    },
    connectionPool: {
      maxConnectionsPerServer: 5,
      maxTotalConnections: 20,
    },
    parallelExecution: {
      maxConcurrency: 10,
      enableResourceMonitoring: true,
    },
    cache: {
      maxEntries: 10000,
      enableStats: true,
    },
    monitoring: {
      enableMetrics: true,
      collectionInterval: 1000,
    },
    debug: false,
  };

  const manager = new EnhancedMcpManager(config);

  try {
    await manager.start();
    console.log("基準測試開始...");

    const startTime = Date.now();
    const testCount = 100;
    const promises: Promise<any>[] = [];

    // 創建大量並發請求
    for (let i = 0; i < testCount; i++) {
      promises.push(
        manager
          .callTool({
            name: "test_tool",
            arguments: { test: `request-${i}` },
          })
          .catch((error) => ({ error: error.message }))
      );
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();

    const successful = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;
    const totalTime = endTime - startTime;

    console.log("基準測試結果:", {
      總請求數: testCount,
      成功: successful,
      失敗: failed,
      總時間: `${totalTime}ms`,
      平均響應時間: `${(totalTime / testCount).toFixed(2)}ms`,
      吞吐量: `${(testCount / (totalTime / 1000)).toFixed(2)} req/s`,
    });

    // 獲取詳細指標
    const metrics = manager.getMetrics();
    console.log("系統指標:", {
      連接池利用率: `${metrics.connectionPool.poolUtilization.toFixed(1)}%`,
      緩存命中率: `${(metrics.cache.hitRate * 100).toFixed(1)}%`,
      錯誤率: `${(metrics.mcp.errors.errorRate * 100).toFixed(2)}%`,
    });
  } catch (error) {
    console.error("基準測試失敗:", error);
  } finally {
    await manager.stop();
    console.log("基準測試完成");
  }
}

/**
 * 運行所有示例
 */
export async function runAllExamples() {
  try {
    await basicEnhancedMcpExample();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await monitoringExample();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await performanceBenchmark();
  } catch (error) {
    console.error("示例運行失敗:", error);
  }
}

// 如果直接運行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}
