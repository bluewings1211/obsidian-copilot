/**
 * 增強型 MCP 管理器
 *
 * 整合所有 MCP 增強組件，提供企業級的 MCP 服務：
 * - 連接池管理
 * - 負載均衡
 * - 結果緩存
 * - 並行執行
 * - 錯誤處理
 * - 監控診斷
 */

import { EventEmitter } from "events";
import type {
  McpServerConfig,
  McpIntegrationSettings,
  CallToolParams,
  CallToolResult,
} from "@/mcp/types";
import { McpConnectionPool } from "./connection/McpConnectionPool";
import { McpHealthChecker } from "./connection/McpHealthChecker";
import { McpLoadBalancer } from "./connection/McpLoadBalancer";
import { McpParallelExecutor } from "./performance/McpParallelExecutor";
import { McpResultCache } from "./performance/McpResultCache";
import { McpErrorClassifier, ErrorClassification } from "./reliability/McpErrorClassifier";
import { McpMetricsCollector } from "./monitoring/McpMetricsCollector";
import { createLogger, createPerformanceLogger } from "@/pocketflow/utils/logger";

/**
 * 增強管理器配置
 */
export interface EnhancedMcpConfig {
  /** 基本 MCP 設置 */
  mcpSettings: McpIntegrationSettings;

  /** 連接池配置 */
  connectionPool?: {
    maxConnectionsPerServer?: number;
    maxTotalConnections?: number;
    idleTimeout?: number;
    healthCheckInterval?: number;
  };

  /** 負載均衡配置 */
  loadBalancer?: {
    strategy?: "round-robin" | "least-connections" | "response-time" | "weighted-random";
    enableFailover?: boolean;
    maxRetries?: number;
  };

  /** 緩存配置 */
  cache?: {
    maxEntries?: number;
    maxMemoryUsage?: number;
    defaultTtl?: number;
    enableStats?: boolean;
  };

  /** 並行執行配置 */
  parallelExecution?: {
    maxConcurrency?: number;
    defaultTimeout?: number;
    enableResourceMonitoring?: boolean;
  };

  /** 錯誤處理配置 */
  errorHandling?: {
    enableClassification?: boolean;
    enableMachineLearning?: boolean;
    retryStrategies?: Record<string, { maxAttempts: number; delay: number }>;
  };

  /** 監控配置 */
  monitoring?: {
    enableMetrics?: boolean;
    enableAlerting?: boolean;
    collectionInterval?: number;
    retentionPeriod?: number;
  };

  /** 調試模式 */
  debug?: boolean;
}

/**
 * 服務狀態
 */
export interface ServiceStatus {
  isHealthy: boolean;
  uptime: number;
  components: {
    connectionPool: { status: string; connections: number };
    loadBalancer: { status: string; strategy: string };
    cache: { status: string; hitRate: number; size: number };
    errorClassifier: { status: string; totalErrors: number };
    metricsCollector: { status: string; metricsCount: number };
  };
  performance: {
    averageResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    cacheHitRate: number;
  };
}

/**
 * 增強管理器事件
 */
export interface EnhancedMcpEvents {
  // 系統級事件
  systemStarted: () => void;
  systemStopped: () => void;
  systemError: (error: Error) => void;

  // 連接事件
  connectionEstablished: (serverId: string) => void;
  connectionLost: (serverId: string) => void;
  connectionRecovered: (serverId: string) => void;

  // 性能事件
  performanceAlert: (metric: string, value: number, threshold: number) => void;
  cacheEviction: (reason: string, entriesEvicted: number) => void;

  // 錯誤事件
  criticalError: (error: Error, classification: ErrorClassification) => void;
  errorPatternDetected: (pattern: string, frequency: number) => void;

  // 監控事件
  healthCheckCompleted: (status: ServiceStatus) => void;
  metricsSnapshot: (metrics: any) => void;
}

/**
 * 增強型 MCP 管理器
 */
export class EnhancedMcpManager extends EventEmitter {
  private config: EnhancedMcpConfig;
  private isStarted = false;
  private startTime: Date | null = null;

  // 核心組件
  private connectionPool: McpConnectionPool;
  private healthChecker: McpHealthChecker;
  private loadBalancer: McpLoadBalancer;
  private parallelExecutor: McpParallelExecutor;
  private resultCache: McpResultCache;
  private errorClassifier: McpErrorClassifier;
  private metricsCollector: McpMetricsCollector;

  private logger = createLogger("EnhancedMcpManager");

  constructor(config: EnhancedMcpConfig) {
    super();
    this.config = config;

    // 初始化組件
    this.initializeComponents();
    this.setupEventHandlers();
  }

  /**
   * 啟動增強管理器
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.info("增強 MCP 管理器已啟動");
      return;
    }

    const performanceLogger = createPerformanceLogger("EnhancedMcpManager.start");
    this.logger.info("啟動增強 MCP 管理器", { config: this.config });

    try {
      // 啟動核心組件
      performanceLogger.checkpoint("啟動連接池");
      await this.connectionPool.start();

      performanceLogger.checkpoint("啟動健康檢查器");
      this.healthChecker.start();

      performanceLogger.checkpoint("啟動負載均衡器");
      this.loadBalancer.start();

      performanceLogger.checkpoint("啟動並行執行器");
      this.parallelExecutor.start();

      performanceLogger.checkpoint("啟動結果緩存");
      this.resultCache.start();

      performanceLogger.checkpoint("啟動錯誤分類器");
      this.errorClassifier.start();

      performanceLogger.checkpoint("啟動指標收集器");
      this.metricsCollector.start();

      // 添加服務器到各組件
      performanceLogger.checkpoint("配置服務器");
      await this.configureServers();

      this.isStarted = true;
      this.startTime = new Date();

      performanceLogger.end("增強 MCP 管理器啟動完成");
      this.emit("systemStarted");
    } catch (error) {
      this.logger.error("啟動增強 MCP 管理器失敗", error);
      this.emit("systemError", error as Error);
      throw error;
    }
  }

  /**
   * 停止增強管理器
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止增強 MCP 管理器");

    try {
      // 停止組件（按相反順序）
      this.metricsCollector.stop();
      this.errorClassifier.stop();
      this.resultCache.stop();
      this.parallelExecutor.stop();
      this.loadBalancer.stop();
      this.healthChecker.stop();
      await this.connectionPool.stop();

      this.isStarted = false;
      this.startTime = null;

      this.emit("systemStopped");
      this.logger.info("增強 MCP 管理器已停止");
    } catch (error) {
      this.logger.error("停止增強 MCP 管理器失敗", error);
      this.emit("systemError", error as Error);
      throw error;
    }
  }

  /**
   * 執行工具調用（主要入口點）
   */
  public async callTool(
    params: CallToolParams,
    options: {
      serverId?: string;
      enableCache?: boolean;
      timeout?: number;
      priority?: number;
    } = {}
  ): Promise<CallToolResult> {
    if (!this.isStarted) {
      throw new Error("增強 MCP 管理器未啟動");
    }

    const performanceLogger = createPerformanceLogger(`Tool.${params.name}`);
    const startTime = Date.now();

    try {
      // 記錄請求指標
      this.metricsCollector.recordMetric("mcp_requests_total", 1);

      // 檢查緩存
      if (options.enableCache !== false) {
        const serverId = options.serverId || "auto";
        const cachedResult = this.resultCache.get(serverId, params);

        if (cachedResult) {
          performanceLogger.end("從緩存返回結果");
          this.metricsCollector.recordMetric("mcp_cache_hits", 1);
          return cachedResult;
        }

        this.metricsCollector.recordMetric("mcp_cache_misses", 1);
      }

      let result: CallToolResult;

      if (options.serverId) {
        // 指定服務器調用
        performanceLogger.checkpoint("使用指定服務器");
        const serverConfig = this.getServerConfig(options.serverId);
        if (!serverConfig) {
          throw new Error(`服務器 ${options.serverId} 不存在`);
        }
        result = await this.connectionPool.callTool(serverConfig, params);
      } else {
        // 使用負載均衡
        performanceLogger.checkpoint("使用負載均衡");
        result = await this.loadBalancer.callTool(params);
      }

      // 緩存結果
      if (options.enableCache !== false && options.serverId) {
        this.resultCache.set(options.serverId, params, result);
      }

      // 記錄成功指標
      const responseTime = Date.now() - startTime;
      this.metricsCollector.recordMetric("mcp_requests_successful", 1);
      this.metricsCollector.recordMetric("mcp_request_duration", responseTime);

      performanceLogger.end("工具調用成功");
      return result;
    } catch (error) {
      // 錯誤分類和處理
      const classification = this.errorClassifier.classify(error as Error, {
        serverId: options.serverId || "unknown",
        serverName: "unknown",
        toolName: params.name,
        timestamp: new Date(),
      });

      // 記錄錯誤指標
      this.metricsCollector.recordMetric("mcp_requests_failed", 1);
      this.metricsCollector.recordMetric("mcp_errors_total", 1);

      // 關鍵錯誤告警
      if (classification.severity === "critical") {
        this.emit("criticalError", error as Error, classification);
      }

      this.logger.error("工具調用失敗", error, {
        toolName: params.name,
        classification: classification.category,
        severity: classification.severity,
      });

      throw error;
    }
  }

  /**
   * 批量執行工具調用
   */
  public async executeBatch(
    tasks: Array<{
      params: CallToolParams;
      serverId?: string;
      priority?: number;
    }>,
    options: {
      maxConcurrency?: number;
      failFast?: boolean;
      timeout?: number;
    } = {}
  ): Promise<
    Array<{
      success: boolean;
      result?: CallToolResult;
      error?: Error;
    }>
  > {
    if (!this.isStarted) {
      throw new Error("增強 MCP 管理器未啟動");
    }

    const performanceLogger = createPerformanceLogger(`Batch.${tasks.length}tasks`);

    try {
      // 準備並行任務
      const parallelTasks = tasks.map((task, index) => ({
        id: `batch-${Date.now()}-${index}`,
        serverId: task.serverId || "auto",
        params: task.params,
        priority: task.priority || 0,
        timeout: options.timeout || 30000,
        retries: 2,
      }));

      performanceLogger.checkpoint("開始並行執行");
      const results = await this.parallelExecutor.executeBatch(parallelTasks, {
        maxConcurrency: options.maxConcurrency,
        failFast: options.failFast,
      });

      // 轉換結果格式
      const batchResults = results.map((result) => ({
        success: result.success,
        result: result.result,
        error: result.error,
      }));

      performanceLogger.end(`批量執行完成，${results.length} 個任務`);
      return batchResults;
    } catch (error) {
      this.logger.error("批量執行失敗", error);
      throw error;
    }
  }

  /**
   * 獲取服務狀態
   */
  public getStatus(): ServiceStatus {
    const connectionStats = this.connectionPool.getStats();
    const loadBalancerStats = this.loadBalancer.getStats();
    const cacheStats = this.resultCache.getStats();
    const errorStats = this.errorClassifier.getStats();
    const mcpMetrics = this.metricsCollector.getMcpMetrics();

    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    return {
      isHealthy: this.isStarted && connectionStats.activeConnections > 0,
      uptime,
      components: {
        connectionPool: {
          status: connectionStats.activeConnections > 0 ? "healthy" : "degraded",
          connections: connectionStats.activeConnections,
        },
        loadBalancer: {
          status: loadBalancerStats.healthyServers > 0 ? "healthy" : "unhealthy",
          strategy: loadBalancerStats.currentStrategy,
        },
        cache: {
          status: "healthy",
          hitRate: cacheStats.hitRate,
          size: cacheStats.totalEntries,
        },
        errorClassifier: {
          status: "healthy",
          totalErrors: errorStats.totalErrors,
        },
        metricsCollector: {
          status: "healthy",
          metricsCount: this.metricsCollector.getAllMetrics().length,
        },
      },
      performance: {
        averageResponseTime: mcpMetrics.requests.avgResponseTime,
        requestsPerSecond: mcpMetrics.requests.requestsPerSecond,
        errorRate: mcpMetrics.errors.errorRate,
        cacheHitRate: mcpMetrics.cache.hitRate,
      },
    };
  }

  /**
   * 獲取詳細指標
   */
  public getMetrics() {
    return {
      system: this.metricsCollector.getSystemMetrics(),
      mcp: this.metricsCollector.getMcpMetrics(),
      connectionPool: this.connectionPool.getStats(),
      loadBalancer: this.loadBalancer.getStats(),
      cache: this.resultCache.getStats(),
      errors: this.errorClassifier.getStats(),
      health: this.healthChecker.getAllServerHealth(),
    };
  }

  /**
   * 手動觸發健康檢查
   */
  public async performHealthCheck(): Promise<void> {
    const status = this.getStatus();
    this.emit("healthCheckCompleted", status);

    this.logger.info("健康檢查完成", {
      isHealthy: status.isHealthy,
      uptime: status.uptime,
      activeConnections: status.components.connectionPool.connections,
    });
  }

  /**
   * 清理緩存
   */
  public clearCache(): void {
    this.resultCache.clear();
    this.logger.info("緩存已清理");
  }

  /**
   * 刷新服務器連接
   */
  public async refreshConnections(): Promise<void> {
    await this.connectionPool.cleanup();
    this.logger.info("連接已刷新");
  }

  /**
   * 初始化組件
   */
  private initializeComponents(): void {
    // 連接池
    this.connectionPool = new McpConnectionPool({
      maxConnectionsPerServer: this.config.connectionPool?.maxConnectionsPerServer,
      maxTotalConnections: this.config.connectionPool?.maxTotalConnections,
      idleTimeout: this.config.connectionPool?.idleTimeout,
      debug: this.config.debug,
    });

    // 健康檢查器
    this.healthChecker = new McpHealthChecker({
      checkInterval: this.config.connectionPool?.healthCheckInterval,
      enableAutoReconnect: true,
      debug: this.config.debug,
    });

    // 負載均衡器
    this.loadBalancer = new McpLoadBalancer(this.connectionPool, {
      strategy: this.config.loadBalancer?.strategy,
      enableFailover: this.config.loadBalancer?.enableFailover,
      maxRetries: this.config.loadBalancer?.maxRetries,
      debug: this.config.debug,
    });

    // 並行執行器
    this.parallelExecutor = new McpParallelExecutor(this.connectionPool, {
      defaultMaxConcurrency: this.config.parallelExecution?.maxConcurrency,
      defaultTaskTimeout: this.config.parallelExecution?.defaultTimeout,
      enableResourceMonitoring: this.config.parallelExecution?.enableResourceMonitoring,
      debug: this.config.debug,
    });

    // 結果緩存
    this.resultCache = new McpResultCache({
      maxEntries: this.config.cache?.maxEntries,
      maxMemoryUsage: this.config.cache?.maxMemoryUsage,
      defaultTtl: this.config.cache?.defaultTtl,
      enableStats: this.config.cache?.enableStats,
      debug: this.config.debug,
    });

    // 錯誤分類器
    this.errorClassifier = new McpErrorClassifier({
      enableMachineLearning: this.config.errorHandling?.enableMachineLearning,
      debug: this.config.debug,
    });

    // 指標收集器
    this.metricsCollector = new McpMetricsCollector({
      enableSystemMetrics: this.config.monitoring?.enableMetrics,
      enableAlerting: this.config.monitoring?.enableAlerting,
      collectionInterval: this.config.monitoring?.collectionInterval,
      retentionPeriod: this.config.monitoring?.retentionPeriod,
      debug: this.config.debug,
    });
  }

  /**
   * 設置事件處理器
   */
  private setupEventHandlers(): void {
    // 連接池事件
    this.connectionPool.on("connectionCreated", (connectionId, serverId) => {
      this.emit("connectionEstablished", serverId);
    });

    this.connectionPool.on("connectionDestroyed", (connectionId, serverId) => {
      this.emit("connectionLost", serverId);
    });

    // 健康檢查事件
    this.healthChecker.on("reconnectSucceeded", (serverId) => {
      this.emit("connectionRecovered", serverId);
    });

    // 緩存事件
    this.resultCache.on("memoryLimitExceeded", (current, limit) => {
      this.emit("cacheEviction", "內存限制", 0);
    });

    // 錯誤分類事件
    this.errorClassifier.on("errorClassified", (error, classification) => {
      if (classification.severity === "critical") {
        this.emit("criticalError", error, classification);
      }
    });

    // 指標收集事件
    this.metricsCollector.on("alertFiring", (alert) => {
      this.emit("performanceAlert", alert.ruleName, alert.value, alert.threshold);
    });
  }

  /**
   * 配置服務器
   */
  private async configureServers(): Promise<void> {
    for (const serverConfig of this.config.mcpSettings.servers) {
      if (!serverConfig.enabled) continue;

      // 添加到負載均衡器
      this.loadBalancer.addServer(serverConfig);

      // 添加到並行執行器
      this.parallelExecutor.addServer(serverConfig);

      this.logger.info(`配置服務器: ${serverConfig.name}`, { serverId: serverConfig.id });
    }
  }

  /**
   * 獲取服務器配置
   */
  private getServerConfig(serverId: string): McpServerConfig | null {
    return this.config.mcpSettings.servers.find((s) => s.id === serverId) || null;
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof EnhancedMcpEvents>(event: K, listener: EnhancedMcpEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof EnhancedMcpEvents>(
    event: K,
    ...args: Parameters<EnhancedMcpEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
