/**
 * 系統健康監控器
 *
 * 提供全面的系統健康監控功能：
 * - 實時性能指標監控
 * - 資源使用率監控
 * - 服務可用性檢查
 * - 健康閾值管理
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";
import { performance } from "perf_hooks";

/**
 * 健康指標
 */
export interface HealthMetrics {
  /** 整體健康狀態 */
  isHealthy: boolean;
  /** 檢查時間 */
  timestamp: Date;
  /** CPU 使用率 (0-1) */
  cpu: number;
  /** 內存使用率 (0-1) */
  memory: number;
  /** 平均響應時間 (毫秒) */
  averageResponseTime: number;
  /** 錯誤率 (0-1) */
  errorRate: number;
  /** 活躍連接數 */
  activeConnections: number;
  /** 請求吞吐量 (每秒) */
  throughput: number;
  /** 正常運行時間 (毫秒) */
  uptime: number;
  /** 詳細指標 */
  details: {
    heap: {
      used: number;
      total: number;
      limit: number;
    };
    eventLoop: {
      delay: number;
      utilization: number;
    };
    gc: {
      collections: number;
      duration: number;
    };
    handles: {
      active: number;
      refs: number;
    };
  };
}

/**
 * 健康檢查項目
 */
export interface HealthCheck {
  id: string;
  name: string;
  description: string;
  check: () => Promise<{
    isHealthy: boolean;
    message?: string;
    metrics?: Record<string, any>;
  }>;
  timeout: number;
  interval: number;
  critical: boolean;
}

/**
 * 健康監控配置
 */
export interface SystemHealthMonitorConfig {
  /** 檢查間隔（毫秒） */
  checkInterval?: number;
  /** 健康閾值 */
  healthThreshold?: number;
  /** CPU 使用率閾值 */
  cpuThreshold?: number;
  /** 內存使用率閾值 */
  memoryThreshold?: number;
  /** 響應時間閾值（毫秒） */
  responseTimeThreshold?: number;
  /** 錯誤率閾值 */
  errorRateThreshold?: number;
  /** 啟用詳細監控 */
  enableDetailedMonitoring?: boolean;
  /** 自定義健康檢查 */
  customChecks?: HealthCheck[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 健康監控事件
 */
export interface SystemHealthMonitorEvents {
  healthChanged: (isHealthy: boolean, metrics: HealthMetrics) => void;
  thresholdExceeded: (metric: string, value: number, threshold: number) => void;
  checkFailed: (checkId: string, error: Error) => void;
  metricsUpdated: (metrics: HealthMetrics) => void;
}

/**
 * 響應時間追蹤器
 */
class ResponseTimeTracker {
  private responseTimes: number[] = [];
  private maxSamples = 100;

  public recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes.shift();
    }
  }

  public getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    return this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  public getPercentile(percentile: number): number {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }
}

/**
 * 錯誤率追蹤器
 */
class ErrorRateTracker {
  private requests = 0;
  private errors = 0;
  private windowStart = Date.now();
  private windowSize = 60000; // 1分鐘窗口

  public recordRequest(isError: boolean = false): void {
    // 檢查是否需要重置窗口
    const now = Date.now();
    if (now - this.windowStart > this.windowSize) {
      this.requests = 0;
      this.errors = 0;
      this.windowStart = now;
    }

    this.requests++;
    if (isError) {
      this.errors++;
    }
  }

  public getErrorRate(): number {
    return this.requests > 0 ? this.errors / this.requests : 0;
  }

  public getRequestCount(): number {
    return this.requests;
  }
}

/**
 * 系統健康監控器
 */
export class SystemHealthMonitor extends EventEmitter {
  private config: Required<SystemHealthMonitorConfig>;
  private logger = createLogger("SystemHealthMonitor");

  // 追蹤器
  private responseTimeTracker = new ResponseTimeTracker();
  private errorRateTracker = new ErrorRateTracker();

  // 運行時狀態
  private isStarted = false;
  private currentMetrics: HealthMetrics;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private checkTimer: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  // 性能監控
  private gcStats = { collections: 0, duration: 0 };
  private lastGcCheck = Date.now();

  constructor(config: SystemHealthMonitorConfig = {}) {
    super();

    this.config = {
      checkInterval: config.checkInterval ?? 5000,
      healthThreshold: config.healthThreshold ?? 0.8,
      cpuThreshold: config.cpuThreshold ?? 0.8,
      memoryThreshold: config.memoryThreshold ?? 0.8,
      responseTimeThreshold: config.responseTimeThreshold ?? 5000,
      errorRateThreshold: config.errorRateThreshold ?? 0.1,
      enableDetailedMonitoring: config.enableDetailedMonitoring ?? true,
      customChecks: config.customChecks || [],
      debug: config.debug ?? false,
    };

    this.currentMetrics = this.createEmptyMetrics();
    this.initializeDefaultChecks();
    this.setupGCMonitoring();
  }

  /**
   * 啟動健康監控
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.logger.info("啟動系統健康監控器", { config: this.config });

    // 註冊自定義檢查
    for (const check of this.config.customChecks) {
      this.healthChecks.set(check.id, check);
    }

    // 執行初始健康檢查
    await this.performHealthCheck();

    // 啟動定期檢查
    this.startPeriodicChecks();

    this.isStarted = true;
    this.logger.info("系統健康監控器啟動成功");
  }

  /**
   * 停止健康監控
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止系統健康監控器");

    this.stopPeriodicChecks();
    this.isStarted = false;

    this.logger.info("系統健康監控器已停止");
  }

  /**
   * 獲取當前健康指標
   */
  public async getMetrics(): Promise<HealthMetrics> {
    if (this.isStarted) {
      await this.performHealthCheck();
    }
    return { ...this.currentMetrics };
  }

  /**
   * 記錄請求響應時間
   */
  public recordResponseTime(time: number): void {
    this.responseTimeTracker.recordResponseTime(time);
  }

  /**
   * 記錄請求結果
   */
  public recordRequest(isError: boolean = false): void {
    this.errorRateTracker.recordRequest(isError);
  }

  /**
   * 添加自定義健康檢查
   */
  public addHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.id, check);
    this.logger.info(`添加健康檢查: ${check.name}`, { checkId: check.id });
  }

  /**
   * 移除健康檢查
   */
  public removeHealthCheck(checkId: string): boolean {
    if (this.healthChecks.delete(checkId)) {
      this.logger.info(`移除健康檢查: ${checkId}`);
      return true;
    }
    return false;
  }

  /**
   * 執行單個健康檢查
   */
  public async runHealthCheck(checkId: string): Promise<{
    isHealthy: boolean;
    message?: string;
    metrics?: Record<string, any>;
  } | null> {
    const check = this.healthChecks.get(checkId);
    if (!check) {
      return null;
    }

    try {
      const result = await Promise.race([
        check.check(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), check.timeout)
        ),
      ]);

      return result;
    } catch (error) {
      this.emit("checkFailed", checkId, error as Error);
      return {
        isHealthy: false,
        message: `健康檢查失敗: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 獲取詳細的健康報告
   */
  public async getDetailedHealthReport(): Promise<{
    overall: HealthMetrics;
    checks: Record<string, any>;
    trends: {
      responseTime: number[];
      errorRate: number[];
      memoryUsage: number[];
    };
    recommendations: string[];
  }> {
    const overall = await this.getMetrics();
    const checks: Record<string, any> = {};

    // 執行所有健康檢查
    for (const [id] of this.healthChecks) {
      checks[id] = await this.runHealthCheck(id);
    }

    // 生成建議
    const recommendations: string[] = [];

    if (overall.cpu > this.config.cpuThreshold) {
      recommendations.push(`CPU 使用率過高 (${(overall.cpu * 100).toFixed(1)}%)，建議檢查性能瓶頸`);
    }

    if (overall.memory > this.config.memoryThreshold) {
      recommendations.push(
        `內存使用率過高 (${(overall.memory * 100).toFixed(1)}%)，建議檢查內存洩漏`
      );
    }

    if (overall.averageResponseTime > this.config.responseTimeThreshold) {
      recommendations.push(
        `響應時間過長 (${overall.averageResponseTime.toFixed(0)}ms)，建議優化性能`
      );
    }

    if (overall.errorRate > this.config.errorRateThreshold) {
      recommendations.push(
        `錯誤率過高 (${(overall.errorRate * 100).toFixed(1)}%)，建議檢查錯誤日誌`
      );
    }

    return {
      overall,
      checks,
      trends: {
        responseTime: [], // 可以擴展為實際趨勢數據
        errorRate: [],
        memoryUsage: [],
      },
      recommendations,
    };
  }

  /**
   * 初始化默認健康檢查
   */
  private initializeDefaultChecks(): void {
    // 內存檢查
    this.healthChecks.set("memory-usage", {
      id: "memory-usage",
      name: "內存使用率檢查",
      description: "檢查系統內存使用情況",
      check: async () => {
        const memUsage = process.memoryUsage();
        const usage = memUsage.heapUsed / memUsage.heapTotal;

        return {
          isHealthy: usage < this.config.memoryThreshold,
          message: `內存使用率: ${(usage * 100).toFixed(1)}%`,
          metrics: {
            memoryUsage: usage,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
          },
        };
      },
      timeout: 1000,
      interval: this.config.checkInterval,
      critical: true,
    });

    // 事件循環延遲檢查
    this.healthChecks.set("event-loop-delay", {
      id: "event-loop-delay",
      name: "事件循環延遲檢查",
      description: "檢查 Node.js 事件循環延遲",
      check: async () => {
        const start = performance.now();
        await new Promise((resolve) => setImmediate(resolve));
        const delay = performance.now() - start;

        return {
          isHealthy: delay < 10, // 10ms 閾值
          message: `事件循環延遲: ${delay.toFixed(2)}ms`,
          metrics: { eventLoopDelay: delay },
        };
      },
      timeout: 1000,
      interval: this.config.checkInterval,
      critical: false,
    });

    // 垃圾回收檢查
    if (this.config.enableDetailedMonitoring) {
      this.healthChecks.set("gc-performance", {
        id: "gc-performance",
        name: "垃圾回收性能檢查",
        description: "檢查垃圾回收性能影響",
        check: async () => {
          const gcDuration = this.gcStats.duration;
          const isHealthy = gcDuration < 100; // 100ms 閾值

          return {
            isHealthy,
            message: `GC 總耗時: ${gcDuration.toFixed(2)}ms`,
            metrics: {
              gcCollections: this.gcStats.collections,
              gcDuration: this.gcStats.duration,
            },
          };
        },
        timeout: 1000,
        interval: this.config.checkInterval,
        critical: false,
      });
    }
  }

  /**
   * 設置垃圾回收監控
   */
  private setupGCMonitoring(): void {
    if (!this.config.enableDetailedMonitoring) {
      return;
    }

    try {
      // 監控垃圾回收事件
      if (typeof process.on === "function") {
        process.on("beforeGC" as any, () => {
          this.lastGcCheck = Date.now();
        });

        process.on("afterGC" as any, () => {
          const duration = Date.now() - this.lastGcCheck;
          this.gcStats.collections++;
          this.gcStats.duration += duration;
        });
      }
    } catch (error) {
      this.logger.debug("無法設置 GC 監控", error);
    }
  }

  /**
   * 執行健康檢查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // 收集基本指標
      const memUsage = process.memoryUsage();
      const cpuUsage = this.getCpuUsage();
      const averageResponseTime = this.responseTimeTracker.getAverageResponseTime();
      const errorRate = this.errorRateTracker.getErrorRate();
      const uptime = Date.now() - this.startTime;

      // 收集詳細指標
      const details = {
        heap: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
          limit: memUsage.rss,
        },
        eventLoop: {
          delay: 0, // 將在事件循環檢查中更新
          utilization: 0,
        },
        gc: {
          collections: this.gcStats.collections,
          duration: this.gcStats.duration,
        },
        handles: {
          active: (process as any)._getActiveHandles?.()?.length || 0,
          refs: (process as any)._getActiveRequests?.()?.length || 0,
        },
      };

      // 創建健康指標
      this.currentMetrics = {
        isHealthy: this.calculateOverallHealth(
          cpuUsage,
          memUsage.heapUsed / memUsage.heapTotal,
          averageResponseTime,
          errorRate
        ),
        timestamp: new Date(),
        cpu: cpuUsage,
        memory: memUsage.heapUsed / memUsage.heapTotal,
        averageResponseTime,
        errorRate,
        activeConnections: 0, // 可以從外部設置
        throughput: this.errorRateTracker.getRequestCount(),
        uptime,
        details,
      };

      // 檢查閾值
      this.checkThresholds();

      this.emit("metricsUpdated", this.currentMetrics);
    } catch (error) {
      this.logger.error("健康檢查執行失敗", error);
    }
  }

  /**
   * 計算整體健康狀態
   */
  private calculateOverallHealth(
    cpu: number,
    memory: number,
    responseTime: number,
    errorRate: number
  ): boolean {
    const checks = [
      cpu < this.config.cpuThreshold,
      memory < this.config.memoryThreshold,
      responseTime < this.config.responseTimeThreshold,
      errorRate < this.config.errorRateThreshold,
    ];

    const healthyChecks = checks.filter(Boolean).length;
    const healthRatio = healthyChecks / checks.length;

    return healthRatio >= this.config.healthThreshold;
  }

  /**
   * 檢查閾值
   */
  private checkThresholds(): void {
    const metrics = this.currentMetrics;

    if (metrics.cpu > this.config.cpuThreshold) {
      this.emit("thresholdExceeded", "cpu", metrics.cpu, this.config.cpuThreshold);
    }

    if (metrics.memory > this.config.memoryThreshold) {
      this.emit("thresholdExceeded", "memory", metrics.memory, this.config.memoryThreshold);
    }

    if (metrics.averageResponseTime > this.config.responseTimeThreshold) {
      this.emit(
        "thresholdExceeded",
        "responseTime",
        metrics.averageResponseTime,
        this.config.responseTimeThreshold
      );
    }

    if (metrics.errorRate > this.config.errorRateThreshold) {
      this.emit(
        "thresholdExceeded",
        "errorRate",
        metrics.errorRate,
        this.config.errorRateThreshold
      );
    }
  }

  /**
   * 獲取 CPU 使用率（簡化實現）
   */
  private getCpuUsage(): number {
    // 簡化的 CPU 使用率計算
    // 在實際實現中，可能需要使用更精確的方法
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;

    // 返回一個簡化的 CPU 使用率估算
    return Math.min(total / 1000000 / 1000, 1); // 轉換為比例
  }

  /**
   * 啟動定期檢查
   */
  private startPeriodicChecks(): void {
    if (this.checkTimer) {
      return;
    }

    this.checkTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.checkInterval);
  }

  /**
   * 停止定期檢查
   */
  private stopPeriodicChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * 創建空指標對象
   */
  private createEmptyMetrics(): HealthMetrics {
    return {
      isHealthy: true,
      timestamp: new Date(),
      cpu: 0,
      memory: 0,
      averageResponseTime: 0,
      errorRate: 0,
      activeConnections: 0,
      throughput: 0,
      uptime: 0,
      details: {
        heap: { used: 0, total: 0, limit: 0 },
        eventLoop: { delay: 0, utilization: 0 },
        gc: { collections: 0, duration: 0 },
        handles: { active: 0, refs: 0 },
      },
    };
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof SystemHealthMonitorEvents>(
    event: K,
    listener: SystemHealthMonitorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof SystemHealthMonitorEvents>(
    event: K,
    ...args: Parameters<SystemHealthMonitorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
