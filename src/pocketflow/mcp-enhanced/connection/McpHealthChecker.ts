/**
 * MCP 健康檢查器
 *
 * 提供企業級的 MCP 連接健康監控功能：
 * - 定期健康檢查
 * - 自動重連機制
 * - 健康狀態評估
 * - 故障檢測和恢復
 */

import { EventEmitter } from "events";
import { McpClient } from "@/mcp/client";
import type { McpServerConfig } from "@/mcp/types";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 健康檢查結果
 */
export interface HealthCheckResult {
  serverId: string;
  serverName: string;
  isHealthy: boolean;
  responseTime: number;
  error?: Error;
  timestamp: Date;
  checkType: "ping" | "tool_call" | "resource_list" | "connection";
}

/**
 * 健康狀態統計
 */
export interface HealthStats {
  serverId: string;
  serverName: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  uptime: number; // 毫秒
  lastSuccessfulCheck: Date | null;
  lastFailedCheck: Date | null;
  successfulChecks: number;
  failedChecks: number;
  averageResponseTime: number;
  availability: number; // 0-100%
  consecutiveFailures: number;
  lastReconnectAttempt: Date | null;
  reconnectAttempts: number;
}

/**
 * 健康檢查配置
 */
export interface HealthCheckConfig {
  /** 檢查間隔（毫秒） */
  checkInterval?: number;
  /** 檢查超時時間（毫秒） */
  checkTimeout?: number;
  /** 重連間隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重連次數 */
  maxReconnectAttempts?: number;
  /** 失敗閾值（連續失敗多少次標記為不健康） */
  failureThreshold?: number;
  /** 恢復閾值（連續成功多少次標記為健康） */
  recoveryThreshold?: number;
  /** 啟用深度檢查 */
  enableDeepCheck?: boolean;
  /** 深度檢查間隔（毫秒） */
  deepCheckInterval?: number;
  /** 啟用自動重連 */
  enableAutoReconnect?: boolean;
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 健康檢查事件
 */
export interface HealthCheckEvents {
  healthChanged: (serverId: string, isHealthy: boolean, stats: HealthStats) => void;
  checkCompleted: (result: HealthCheckResult) => void;
  checkFailed: (serverId: string, error: Error) => void;
  reconnectStarted: (serverId: string, attempt: number) => void;
  reconnectSucceeded: (serverId: string) => void;
  reconnectFailed: (serverId: string, error: Error) => void;
  maxReconnectAttemptsReached: (serverId: string) => void;
  statsUpdated: (serverId: string, stats: HealthStats) => void;
}

/**
 * 健康檢查任務
 */
interface HealthCheckTask {
  serverId: string;
  client: McpClient;
  config: McpServerConfig;
  stats: HealthStats;
  timer: NodeJS.Timeout | null;
  deepCheckTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  isChecking: boolean;
  isReconnecting: boolean;
}

/**
 * MCP 健康檢查器
 */
export class McpHealthChecker extends EventEmitter {
  private config: Required<HealthCheckConfig>;
  private tasks = new Map<string, HealthCheckTask>();
  private isStarted = false;
  private logger = createLogger("McpHealthChecker");

  constructor(config: HealthCheckConfig = {}) {
    super();

    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 seconds
      checkTimeout: config.checkTimeout || 5000, // 5 seconds
      reconnectInterval: config.reconnectInterval || 60000, // 1 minute
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
      failureThreshold: config.failureThreshold || 3,
      recoveryThreshold: config.recoveryThreshold || 2,
      enableDeepCheck: config.enableDeepCheck ?? true,
      deepCheckInterval: config.deepCheckInterval || 300000, // 5 minutes
      enableAutoReconnect: config.enableAutoReconnect ?? true,
      debug: config.debug ?? false,
    };
  }

  /**
   * 啟動健康檢查器
   */
  public start(): void {
    if (this.isStarted) {
      return;
    }

    this.logger.info("啟動 MCP 健康檢查器", { config: this.config });
    this.isStarted = true;
  }

  /**
   * 停止健康檢查器
   */
  public stop(): void {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止 MCP 健康檢查器");
    this.isStarted = false;

    // 清理所有任務
    for (const task of this.tasks.values()) {
      this.cleanupTask(task);
    }
    this.tasks.clear();
  }

  /**
   * 添加服務器監控
   */
  public addServer(client: McpClient, config: McpServerConfig): void {
    if (this.tasks.has(config.id)) {
      this.logger.debug(`服務器 ${config.id} 已在監控中`);
      return;
    }

    const stats: HealthStats = {
      serverId: config.id,
      serverName: config.name,
      status: "unknown",
      uptime: 0,
      lastSuccessfulCheck: null,
      lastFailedCheck: null,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      availability: 0,
      consecutiveFailures: 0,
      lastReconnectAttempt: null,
      reconnectAttempts: 0,
    };

    const task: HealthCheckTask = {
      serverId: config.id,
      client,
      config,
      stats,
      timer: null,
      deepCheckTimer: null,
      reconnectTimer: null,
      isChecking: false,
      isReconnecting: false,
    };

    this.tasks.set(config.id, task);

    if (this.isStarted) {
      this.startTaskMonitoring(task);
    }

    this.logger.info(`添加服務器監控: ${config.name}`, { serverId: config.id });
  }

  /**
   * 移除服務器監控
   */
  public removeServer(serverId: string): void {
    const task = this.tasks.get(serverId);
    if (!task) {
      return;
    }

    this.cleanupTask(task);
    this.tasks.delete(serverId);

    this.logger.info(`移除服務器監控: ${task.config.name}`, { serverId });
  }

  /**
   * 獲取服務器健康狀態
   */
  public getServerHealth(serverId: string): HealthStats | null {
    const task = this.tasks.get(serverId);
    return task ? { ...task.stats } : null;
  }

  /**
   * 獲取所有服務器健康狀態
   */
  public getAllServerHealth(): HealthStats[] {
    return Array.from(this.tasks.values()).map((task) => ({ ...task.stats }));
  }

  /**
   * 手動執行健康檢查
   */
  public async checkServerHealth(serverId: string): Promise<HealthCheckResult> {
    const task = this.tasks.get(serverId);
    if (!task) {
      throw new Error(`服務器 ${serverId} 不在監控中`);
    }

    return await this.performHealthCheck(task, "ping");
  }

  /**
   * 手動重連服務器
   */
  public async reconnectServer(serverId: string): Promise<void> {
    const task = this.tasks.get(serverId);
    if (!task) {
      throw new Error(`服務器 ${serverId} 不在監控中`);
    }

    await this.attemptReconnect(task);
  }

  /**
   * 啟動任務監控
   */
  private startTaskMonitoring(task: HealthCheckTask): void {
    // 啟動常規健康檢查
    task.timer = setInterval(async () => {
      if (!task.isChecking) {
        await this.performHealthCheck(task, "ping");
      }
    }, this.config.checkInterval);

    // 啟動深度健康檢查
    if (this.config.enableDeepCheck) {
      task.deepCheckTimer = setInterval(async () => {
        if (!task.isChecking) {
          await this.performDeepHealthCheck(task);
        }
      }, this.config.deepCheckInterval);
    }

    // 執行初始檢查
    setImmediate(async () => {
      await this.performHealthCheck(task, "connection");
    });
  }

  /**
   * 執行健康檢查
   */
  private async performHealthCheck(
    task: HealthCheckTask,
    checkType: HealthCheckResult["checkType"]
  ): Promise<HealthCheckResult> {
    if (task.isChecking) {
      throw new Error(`服務器 ${task.serverId} 正在檢查中`);
    }

    task.isChecking = true;
    const startTime = Date.now();

    try {
      let isHealthy = false;

      switch (checkType) {
        case "connection":
          isHealthy = task.client.isConnected();
          break;

        case "ping":
          await Promise.race([
            task.client.ping(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("檢查超時")), this.config.checkTimeout)
            ),
          ]);
          isHealthy = true;
          break;

        case "tool_call":
          // 嘗試列出工具
          await Promise.race([
            task.client.listTools(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("檢查超時")), this.config.checkTimeout)
            ),
          ]);
          isHealthy = true;
          break;

        case "resource_list":
          // 嘗試列出資源
          await Promise.race([
            task.client.listResources(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("檢查超時")), this.config.checkTimeout)
            ),
          ]);
          isHealthy = true;
          break;
      }

      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        serverId: task.serverId,
        serverName: task.config.name,
        isHealthy,
        responseTime,
        timestamp: new Date(),
        checkType,
      };

      this.updateStats(task, result);
      this.emit("checkCompleted", result);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result: HealthCheckResult = {
        serverId: task.serverId,
        serverName: task.config.name,
        isHealthy: false,
        responseTime,
        error: error as Error,
        timestamp: new Date(),
        checkType,
      };

      this.updateStats(task, result);
      this.emit("checkFailed", task.serverId, error as Error);
      this.emit("checkCompleted", result);

      // 觸發重連
      if (this.config.enableAutoReconnect && !task.isReconnecting) {
        this.scheduleReconnect(task);
      }

      return result;
    } finally {
      task.isChecking = false;
    }
  }

  /**
   * 執行深度健康檢查
   */
  private async performDeepHealthCheck(task: HealthCheckTask): Promise<void> {
    try {
      await this.performHealthCheck(task, "tool_call");
      await this.performHealthCheck(task, "resource_list");
    } catch (error) {
      this.logger.debug(`深度健康檢查失敗: ${task.config.name}`, error);
    }
  }

  /**
   * 更新統計信息
   */
  private updateStats(task: HealthCheckTask, result: HealthCheckResult): void {
    const stats = task.stats;
    const wasHealthy = stats.status === "healthy";

    if (result.isHealthy) {
      stats.successfulChecks++;
      stats.lastSuccessfulCheck = result.timestamp;
      stats.consecutiveFailures = 0;

      // 更新平均響應時間
      if (stats.successfulChecks === 1) {
        stats.averageResponseTime = result.responseTime;
      } else {
        stats.averageResponseTime =
          (stats.averageResponseTime * (stats.successfulChecks - 1) + result.responseTime) /
          stats.successfulChecks;
      }
    } else {
      stats.failedChecks++;
      stats.lastFailedCheck = result.timestamp;
      stats.consecutiveFailures++;
    }

    // 計算可用性
    const totalChecks = stats.successfulChecks + stats.failedChecks;
    stats.availability = totalChecks > 0 ? (stats.successfulChecks / totalChecks) * 100 : 0;

    // 計算運行時間
    if (stats.lastSuccessfulCheck) {
      stats.uptime = Date.now() - stats.lastSuccessfulCheck.getTime();
    }

    // 確定健康狀態
    const previousStatus = stats.status;
    if (stats.consecutiveFailures >= this.config.failureThreshold) {
      stats.status = "unhealthy";
    } else if (stats.consecutiveFailures > 0) {
      stats.status = "degraded";
    } else if (stats.successfulChecks >= this.config.recoveryThreshold) {
      stats.status = "healthy";
    }

    // 發出狀態變化事件
    if (previousStatus !== stats.status) {
      const isHealthy = stats.status === "healthy";
      this.emit("healthChanged", task.serverId, isHealthy, { ...stats });

      if (!wasHealthy && isHealthy) {
        this.logger.info(`服務器恢復健康: ${task.config.name}`, { serverId: task.serverId });
      } else if (wasHealthy && !isHealthy) {
        this.logger.info(`服務器變為不健康: ${task.config.name}`, {
          serverId: task.serverId,
          status: stats.status,
        });
      }
    }

    this.emit("statsUpdated", task.serverId, { ...stats });
  }

  /**
   * 安排重連
   */
  private scheduleReconnect(task: HealthCheckTask): void {
    if (task.isReconnecting || task.reconnectTimer) {
      return;
    }

    if (task.stats.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error(`服務器 ${task.config.name} 達到最大重連次數`, {
        serverId: task.serverId,
        attempts: task.stats.reconnectAttempts,
      });
      this.emit("maxReconnectAttemptsReached", task.serverId);
      return;
    }

    task.reconnectTimer = setTimeout(async () => {
      task.reconnectTimer = null;
      await this.attemptReconnect(task);
    }, this.config.reconnectInterval);
  }

  /**
   * 嘗試重連
   */
  private async attemptReconnect(task: HealthCheckTask): Promise<void> {
    if (task.isReconnecting) {
      return;
    }

    task.isReconnecting = true;
    task.stats.reconnectAttempts++;
    task.stats.lastReconnectAttempt = new Date();

    this.logger.info(`嘗試重連服務器: ${task.config.name}`, {
      serverId: task.serverId,
      attempt: task.stats.reconnectAttempts,
    });

    this.emit("reconnectStarted", task.serverId, task.stats.reconnectAttempts);

    try {
      // 先斷開連接
      if (task.client.isConnected()) {
        await task.client.disconnect();
      }

      // 重新連接
      await task.client.connect();

      // 重置統計
      task.stats.consecutiveFailures = 0;
      task.stats.reconnectAttempts = 0;
      task.stats.status = "healthy";

      this.logger.info(`服務器重連成功: ${task.config.name}`, { serverId: task.serverId });
      this.emit("reconnectSucceeded", task.serverId);
    } catch (error) {
      this.logger.error(`服務器重連失敗: ${task.config.name}`, error, {
        serverId: task.serverId,
        attempt: task.stats.reconnectAttempts,
      });

      this.emit("reconnectFailed", task.serverId, error as Error);

      // 安排下一次重連
      this.scheduleReconnect(task);
    } finally {
      task.isReconnecting = false;
    }
  }

  /**
   * 清理任務
   */
  private cleanupTask(task: HealthCheckTask): void {
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }

    if (task.deepCheckTimer) {
      clearInterval(task.deepCheckTimer);
      task.deepCheckTimer = null;
    }

    if (task.reconnectTimer) {
      clearTimeout(task.reconnectTimer);
      task.reconnectTimer = null;
    }
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof HealthCheckEvents>(event: K, listener: HealthCheckEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof HealthCheckEvents>(
    event: K,
    ...args: Parameters<HealthCheckEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
