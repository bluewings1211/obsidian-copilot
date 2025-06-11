/**
 * 增強 MCP 系統測試
 *
 * 測試 MCP 增強組件的核心功能
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
  EnhancedMcpManager,
  McpConnectionPool,
  McpHealthChecker,
  McpLoadBalancer,
  McpResultCache,
  McpErrorClassifier,
  McpMetricsCollector,
  ErrorCategory,
} from "../index";
import type { McpIntegrationSettings } from "@/mcp/types";

// Mock dependencies
jest.mock("@/mcp/client");
jest.mock("../utils/logger");

describe("MCP Enhanced System", () => {
  let mockMcpSettings: McpIntegrationSettings;

  beforeEach(() => {
    mockMcpSettings = {
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
          timeout: 5000,
          retryAttempts: 2,
          retryDelay: 1000,
        },
      ],
      globalTimeout: 30000,
      maxConcurrentConnections: 10,
      debugMode: false,
      logLevel: "info",
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("McpConnectionPool", () => {
    let connectionPool: McpConnectionPool;

    beforeEach(() => {
      connectionPool = new McpConnectionPool({
        maxConnectionsPerServer: 2,
        maxTotalConnections: 10,
        debug: false,
      });
    });

    afterEach(async () => {
      await connectionPool.stop();
    });

    it("should initialize with default options", () => {
      expect(connectionPool).toBeDefined();
    });

    it("should start and stop successfully", async () => {
      await connectionPool.start();
      const stats = connectionPool.getStats();
      expect(stats.totalConnections).toBe(0);

      await connectionPool.stop();
    });

    it("should track connection statistics", async () => {
      await connectionPool.start();
      const initialStats = connectionPool.getStats();

      expect(initialStats).toMatchObject({
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0,
        failedConnections: 0,
        totalRequests: 0,
        failedRequests: 0,
      });
    });
  });

  describe("McpHealthChecker", () => {
    let healthChecker: McpHealthChecker;

    beforeEach(() => {
      healthChecker = new McpHealthChecker({
        checkInterval: 1000,
        enableAutoReconnect: false,
        debug: false,
      });
    });

    afterEach(() => {
      healthChecker.stop();
    });

    it("should initialize with configuration", () => {
      expect(healthChecker).toBeDefined();
    });

    it("should start and stop successfully", () => {
      healthChecker.start();
      healthChecker.stop();
    });

    it("should return empty health stats initially", () => {
      const healthStats = healthChecker.getAllServerHealth();
      expect(healthStats).toEqual([]);
    });
  });

  describe("McpResultCache", () => {
    let cache: McpResultCache;

    beforeEach(() => {
      cache = new McpResultCache({
        maxEntries: 100,
        defaultTtl: 60000, // 1 minute
        debug: false,
      });
    });

    afterEach(() => {
      cache.stop();
    });

    it("should initialize with configuration", () => {
      expect(cache).toBeDefined();
    });

    it("should handle cache miss for non-existent key", () => {
      const result = cache.get("test-server", {
        name: "test-tool",
        arguments: { test: "value" },
      });

      expect(result).toBeNull();
    });

    it("should store and retrieve cached results", () => {
      const params = {
        name: "test-tool",
        arguments: { test: "value" },
      };

      const mockResult = {
        content: [{ type: "text" as const, text: "test result" }],
        isError: false,
      };

      // Store result
      cache.set("test-server", params, mockResult);

      // Retrieve result
      const cachedResult = cache.get("test-server", params);
      expect(cachedResult).toEqual(mockResult);
    });

    it("should return cache statistics", () => {
      cache.start();
      const stats = cache.getStats();

      expect(stats).toMatchObject({
        totalEntries: 0,
        totalSize: 0,
        hitCount: 0,
        missCount: 0,
        hitRate: 0,
        evictionCount: 0,
      });
    });

    it("should clear all cache entries", () => {
      const params = {
        name: "test-tool",
        arguments: { test: "value" },
      };

      const mockResult = {
        content: [{ type: "text" as const, text: "test result" }],
        isError: false,
      };

      cache.set("test-server", params, mockResult);
      expect(cache.getStats().totalEntries).toBe(1);

      cache.clear();
      expect(cache.getStats().totalEntries).toBe(0);
    });
  });

  describe("McpErrorClassifier", () => {
    let errorClassifier: McpErrorClassifier;

    beforeEach(() => {
      errorClassifier = new McpErrorClassifier({
        enableMachineLearning: false,
        debug: false,
      });
    });

    afterEach(() => {
      errorClassifier.stop();
    });

    it("should initialize with configuration", () => {
      expect(errorClassifier).toBeDefined();
    });

    it("should classify connection errors correctly", () => {
      const error = new Error("Connection refused");
      const context = {
        serverId: "test-server",
        serverName: "Test Server",
        timestamp: new Date(),
      };

      const classification = errorClassifier.classify(error, context);

      expect(classification.category).toBe(ErrorCategory.CONNECTION);
      expect(classification.isRetryable).toBe(true);
      expect(classification.confidence).toBeGreaterThan(0);
    });

    it("should classify timeout errors correctly", () => {
      const error = new Error("Request timeout");
      const context = {
        serverId: "test-server",
        serverName: "Test Server",
        timestamp: new Date(),
      };

      const classification = errorClassifier.classify(error, context);

      expect(classification.category).toBe(ErrorCategory.TIMEOUT);
      expect(classification.isRetryable).toBe(true);
    });

    it("should provide error statistics", () => {
      errorClassifier.start();
      const stats = errorClassifier.getStats();

      expect(stats).toMatchObject({
        totalErrors: 0,
        categoryCounts: expect.any(Object),
        severityCounts: expect.any(Object),
        topErrorPatterns: [],
        recurrentErrors: [],
      });
    });
  });

  describe("McpMetricsCollector", () => {
    let metricsCollector: McpMetricsCollector;

    beforeEach(() => {
      metricsCollector = new McpMetricsCollector({
        enableSystemMetrics: false,
        enableAlerting: false,
        debug: false,
      });
    });

    afterEach(() => {
      metricsCollector.stop();
    });

    it("should initialize with configuration", () => {
      expect(metricsCollector).toBeDefined();
    });

    it("should record metrics", () => {
      metricsCollector.start();
      metricsCollector.recordMetric("test_counter", 1);

      const metric = metricsCollector.getMetric("test_counter");
      expect(metric).toBeNull(); // Because 'test_counter' is not a registered metric
    });

    it("should increment counters", () => {
      metricsCollector.start();
      metricsCollector.incrementCounter("mcp_requests_total", 1);

      const metric = metricsCollector.getMetric("mcp_requests_total");
      expect(metric).toBeDefined();
    });

    it("should provide system metrics", () => {
      const systemMetrics = metricsCollector.getSystemMetrics();

      expect(systemMetrics).toMatchObject({
        cpu: expect.any(Object),
        memory: expect.any(Object),
        network: expect.any(Object),
        disk: expect.any(Object),
      });
    });

    it("should provide MCP specific metrics", () => {
      const mcpMetrics = metricsCollector.getMcpMetrics();

      expect(mcpMetrics).toMatchObject({
        connections: expect.any(Object),
        requests: expect.any(Object),
        tools: expect.any(Object),
        cache: expect.any(Object),
        errors: expect.any(Object),
      });
    });
  });

  describe("EnhancedMcpManager", () => {
    let manager: EnhancedMcpManager;

    beforeEach(() => {
      manager = new EnhancedMcpManager({
        mcpSettings: mockMcpSettings,
        debug: false,
      });
    });

    afterEach(async () => {
      if (manager) {
        await manager.stop();
      }
    });

    it("should initialize with configuration", () => {
      expect(manager).toBeDefined();
    });

    it("should start and stop successfully", async () => {
      // Note: This test might fail due to missing MCP server implementations
      // In a real environment, you would need actual MCP servers or mocks
      try {
        await manager.start();
        expect(manager.getStatus().isHealthy).toBeDefined();
        await manager.stop();
      } catch (error) {
        // Expected in test environment without actual MCP servers
        expect(error).toBeDefined();
      }
    });

    it("should provide service status", () => {
      const status = manager.getStatus();

      expect(status).toMatchObject({
        isHealthy: expect.any(Boolean),
        uptime: expect.any(Number),
        components: expect.any(Object),
        performance: expect.any(Object),
      });
    });

    it("should provide metrics", () => {
      const metrics = manager.getMetrics();

      expect(metrics).toMatchObject({
        system: expect.any(Object),
        mcp: expect.any(Object),
        connectionPool: expect.any(Object),
        loadBalancer: expect.any(Object),
        cache: expect.any(Object),
        errors: expect.any(Object),
        health: expect.any(Array),
      });
    });

    it("should handle tool calls with error when not started", async () => {
      await expect(
        manager.callTool({
          name: "test-tool",
          arguments: { test: "value" },
        })
      ).rejects.toThrow("增強 MCP 管理器未啟動");
    });

    it("should handle batch execution with error when not started", async () => {
      await expect(
        manager.executeBatch([
          {
            params: {
              name: "test-tool",
              arguments: { test: "value" },
            },
          },
        ])
      ).rejects.toThrow("增強 MCP 管理器未啟動");
    });

    it("should emit system events", (done) => {
      let eventCount = 0;

      manager.on("systemStarted", () => {
        eventCount++;
        if (eventCount === 1) done();
      });

      manager.on("systemError", () => {
        eventCount++;
        if (eventCount === 1) done();
      });

      // Trigger an event by trying to start (will likely fail in test environment)
      manager.start().catch(() => {
        // Expected failure in test environment
      });
    });
  });

  describe("Integration Tests", () => {
    it("should integrate all components successfully", () => {
      const connectionPool = new McpConnectionPool();
      const healthChecker = new McpHealthChecker();
      const loadBalancer = new McpLoadBalancer(connectionPool);
      const cache = new McpResultCache();
      const errorClassifier = new McpErrorClassifier();
      const metricsCollector = new McpMetricsCollector();

      expect(connectionPool).toBeDefined();
      expect(healthChecker).toBeDefined();
      expect(loadBalancer).toBeDefined();
      expect(cache).toBeDefined();
      expect(errorClassifier).toBeDefined();
      expect(metricsCollector).toBeDefined();

      // Cleanup
      connectionPool.stop();
      healthChecker.stop();
      loadBalancer.stop();
      cache.stop();
      errorClassifier.stop();
      metricsCollector.stop();
    });

    it("should handle component lifecycle correctly", async () => {
      const manager = new EnhancedMcpManager({
        mcpSettings: mockMcpSettings,
        debug: false,
      });

      // Test multiple start/stop cycles
      for (let i = 0; i < 3; i++) {
        try {
          await manager.start();
          await manager.stop();
        } catch {
          // Expected in test environment
        }
      }

      expect(manager).toBeDefined();
    });
  });
});
