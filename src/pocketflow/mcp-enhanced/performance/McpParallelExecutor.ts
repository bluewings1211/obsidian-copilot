/**
 * MCP 並行執行器
 *
 * 提供高效的並行 MCP 工具調用功能：
 * - 並行工具執行
 * - 批量請求處理
 * - 資源限制管理
 * - 智能調度優化
 */

import { EventEmitter } from "events";
import type { CallToolParams, CallToolResult, McpServerConfig } from "@/mcp/types";
import { McpConnectionPool } from "../connection/McpConnectionPool";
import { createLogger, createPerformanceLogger } from "@/pocketflow/utils/logger";

/**
 * 並行執行任務
 */
export interface ParallelTask {
  id: string;
  serverId: string;
  params: CallToolParams;
  priority: number;
  timeout: number;
  retries: number;
  metadata?: Record<string, any>;
}

/**
 * 並行執行結果
 */
export interface ParallelResult {
  taskId: string;
  serverId: string;
  success: boolean;
  result?: CallToolResult;
  error?: Error;
  executionTime: number;
  startTime: Date;
  endTime: Date;
  retryCount: number;
}

/**
 * 批量執行選項
 */
export interface BatchExecutionOptions {
  /** 最大並行度 */
  maxConcurrency?: number;
  /** 整體超時時間（毫秒） */
  overallTimeout?: number;
  /** 是否快速失敗 */
  failFast?: boolean;
  /** 進度回調 */
  onProgress?: (completed: number, total: number, results: ParallelResult[]) => void;
  /** 是否按優先級排序 */
  sortByPriority?: boolean;
  /** 資源限制 */
  resourceLimits?: {
    maxMemoryUsage?: number; // MB
    maxCpuUsage?: number; // 百分比
  };
}

/**
 * 並行執行統計
 */
export interface ParallelExecutionStats {
  totalTasks: number;
  completedTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  totalExecutionTime: number;
  concurrentPeak: number;
  throughput: number; // 任務/秒
  errorRate: number; // 0-1
  resourceUsage: {
    averageConcurrency: number;
    peakConcurrency: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

/**
 * 並行執行器配置
 */
export interface ParallelExecutorConfig {
  /** 默認最大並行度 */
  defaultMaxConcurrency?: number;
  /** 默認任務超時時間（毫秒） */
  defaultTaskTimeout?: number;
  /** 默認重試次數 */
  defaultRetries?: number;
  /** 任務隊列大小限制 */
  maxQueueSize?: number;
  /** 啟用資源監控 */
  enableResourceMonitoring?: boolean;
  /** 資源監控間隔（毫秒） */
  resourceMonitoringInterval?: number;
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 並行執行器事件
 */
export interface ParallelExecutorEvents {
  taskStarted: (taskId: string, serverId: string, toolName: string) => void;
  taskCompleted: (result: ParallelResult) => void;
  taskFailed: (taskId: string, error: Error) => void;
  batchStarted: (batchId: string, taskCount: number) => void;
  batchCompleted: (batchId: string, stats: ParallelExecutionStats) => void;
  batchProgress: (batchId: string, completed: number, total: number) => void;
  resourceLimitExceeded: (resourceType: string, currentUsage: number, limit: number) => void;
  concurrencyLimitReached: (currentConcurrency: number, maxConcurrency: number) => void;
}

/**
 * 執行中的任務信息
 */
interface ExecutingTask {
  task: ParallelTask;
  promise: Promise<ParallelResult>;
  startTime: Date;
  retryCount: number;
  controller: AbortController;
}

/**
 * 批量執行上下文
 */
interface BatchContext {
  id: string;
  tasks: ParallelTask[];
  options: BatchExecutionOptions;
  startTime: Date;
  stats: ParallelExecutionStats;
  results: ParallelResult[];
  executing: Map<string, ExecutingTask>;
  completed: number;
}

/**
 * MCP 並行執行器
 */
export class McpParallelExecutor extends EventEmitter {
  private config: Required<ParallelExecutorConfig>;
  private connectionPool: McpConnectionPool;
  private servers = new Map<string, McpServerConfig>();
  private activeBatches = new Map<string, BatchContext>();
  private taskQueue: ParallelTask[] = [];
  private currentConcurrency = 0;
  private resourceMonitorTimer: NodeJS.Timeout | null = null;
  private logger = createLogger("McpParallelExecutor");

  constructor(connectionPool: McpConnectionPool, config: ParallelExecutorConfig = {}) {
    super();

    this.connectionPool = connectionPool;
    this.config = {
      defaultMaxConcurrency: config.defaultMaxConcurrency || 10,
      defaultTaskTimeout: config.defaultTaskTimeout || 30000, // 30 seconds
      defaultRetries: config.defaultRetries || 2,
      maxQueueSize: config.maxQueueSize || 1000,
      enableResourceMonitoring: config.enableResourceMonitoring ?? true,
      resourceMonitoringInterval: config.resourceMonitoringInterval || 5000, // 5 seconds
      debug: config.debug ?? false,
    };
  }

  /**
   * 啟動並行執行器
   */
  public start(): void {
    this.logger.info("啟動 MCP 並行執行器", { config: this.config });

    if (this.config.enableResourceMonitoring) {
      this.startResourceMonitoring();
    }
  }

  /**
   * 停止並行執行器
   */
  public async stop(): Promise<void> {
    this.logger.info("停止 MCP 並行執行器");

    // 停止資源監控
    if (this.resourceMonitorTimer) {
      clearInterval(this.resourceMonitorTimer);
      this.resourceMonitorTimer = null;
    }

    // 等待所有批量任務完成
    const activeBatchPromises = Array.from(this.activeBatches.values()).map((batch) =>
      Promise.allSettled(Array.from(batch.executing.values()).map((exec) => exec.promise))
    );

    await Promise.allSettled(activeBatchPromises);
    this.activeBatches.clear();
    this.taskQueue = [];
  }

  /**
   * 添加服務器
   */
  public addServer(config: McpServerConfig): void {
    this.servers.set(config.id, config);
    this.logger.info(`添加服務器到並行執行器: ${config.name}`, { serverId: config.id });
  }

  /**
   * 移除服務器
   */
  public removeServer(serverId: string): void {
    const config = this.servers.get(serverId);
    if (config) {
      this.servers.delete(serverId);
      this.logger.info(`從並行執行器移除服務器: ${config.name}`, { serverId });
    }
  }

  /**
   * 執行單個任務
   */
  public async executeTask(
    serverId: string,
    params: CallToolParams,
    options: Partial<ParallelTask> = {}
  ): Promise<ParallelResult> {
    const task: ParallelTask = {
      id: options.id || this.generateTaskId(),
      serverId,
      params,
      priority: options.priority || 0,
      timeout: options.timeout || this.config.defaultTaskTimeout,
      retries: options.retries || this.config.defaultRetries,
      metadata: options.metadata,
    };

    return await this.executeSingleTask(task);
  }

  /**
   * 批量執行任務
   */
  public async executeBatch(
    tasks: (Omit<ParallelTask, "id"> & { id?: string })[],
    options: BatchExecutionOptions = {}
  ): Promise<ParallelResult[]> {
    const batchId = this.generateBatchId();
    const performanceLogger = createPerformanceLogger(`Batch-${batchId}`);

    // 準備任務
    const preparedTasks: ParallelTask[] = tasks.map((task, index) => ({
      ...task,
      id: task.id || `${batchId}-task-${index}`,
    }));

    // 按優先級排序
    if (options.sortByPriority) {
      preparedTasks.sort((a, b) => b.priority - a.priority);
    }

    // 創建批量上下文
    const batch: BatchContext = {
      id: batchId,
      tasks: preparedTasks,
      options,
      startTime: new Date(),
      stats: this.createEmptyStats(),
      results: [],
      executing: new Map(),
      completed: 0,
    };

    this.activeBatches.set(batchId, batch);
    this.emit("batchStarted", batchId, preparedTasks.length);

    try {
      const maxConcurrency = options.maxConcurrency || this.config.defaultMaxConcurrency;
      const results = await this.executeBatchTasks(batch, maxConcurrency);

      performanceLogger.end(`批量任務完成，共 ${results.length} 個任務`);

      // 更新統計
      batch.stats.totalExecutionTime = Date.now() - batch.startTime.getTime();
      batch.stats.throughput = batch.stats.completedTasks / (batch.stats.totalExecutionTime / 1000);
      batch.stats.errorRate = batch.stats.failedTasks / batch.stats.totalTasks;

      this.emit("batchCompleted", batchId, batch.stats);
      return results;
    } finally {
      this.activeBatches.delete(batchId);
    }
  }

  /**
   * 執行批量任務的內部邏輯
   */
  private async executeBatchTasks(
    batch: BatchContext,
    maxConcurrency: number
  ): Promise<ParallelResult[]> {
    const { tasks, options } = batch;
    batch.stats.totalTasks = tasks.length;

    let taskIndex = 0;
    const executing = new Set<Promise<ParallelResult>>();

    const executeNext = async (): Promise<void> => {
      while (taskIndex < tasks.length && executing.size < maxConcurrency) {
        const task = tasks[taskIndex++];

        // 檢查資源限制
        if (options.resourceLimits && !this.checkResourceLimits(options.resourceLimits)) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 短暫等待
          continue;
        }

        const promise = this.executeSingleTask(task)
          .then((result) => {
            batch.results.push(result);
            batch.completed++;
            batch.stats.completedTasks++;

            if (result.success) {
              batch.stats.successfulTasks++;
            } else {
              batch.stats.failedTasks++;
            }

            // 更新統計
            this.updateBatchStats(batch, result);

            // 進度回調
            if (options.onProgress) {
              options.onProgress(batch.completed, tasks.length, batch.results);
            }

            this.emit("batchProgress", batch.id, batch.completed, tasks.length);
            return result;
          })
          .catch((error) => {
            batch.stats.failedTasks++;
            const result: ParallelResult = {
              taskId: task.id,
              serverId: task.serverId,
              success: false,
              error,
              executionTime: 0,
              startTime: new Date(),
              endTime: new Date(),
              retryCount: 0,
            };
            batch.results.push(result);
            batch.completed++;
            return result;
          })
          .finally(() => {
            executing.delete(promise);
          });

        executing.add(promise);

        // 快速失敗檢查
        if (options.failFast) {
          promise.catch(() => {
            // 取消所有正在執行的任務
            for (const executingTask of batch.executing.values()) {
              executingTask.controller.abort();
            }
          });
        }
      }
    };

    // 開始執行
    await executeNext();

    // 等待所有任務完成
    while (executing.size > 0 || taskIndex < tasks.length) {
      if (executing.size > 0) {
        await Promise.race(executing);
      }
      await executeNext();
    }

    return batch.results;
  }

  /**
   * 執行單個任務
   */
  private async executeSingleTask(task: ParallelTask): Promise<ParallelResult> {
    const startTime = new Date();
    let retryCount = 0;
    let lastError: Error | null = null;

    this.emit("taskStarted", task.id, task.serverId, task.params.name);

    while (retryCount <= task.retries) {
      try {
        this.currentConcurrency++;

        const serverConfig = this.servers.get(task.serverId);
        if (!serverConfig) {
          throw new Error(`服務器 ${task.serverId} 不存在`);
        }

        // 創建超時控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), task.timeout);

        try {
          const result = await this.connectionPool.callTool(serverConfig, task.params);
          clearTimeout(timeoutId);

          const endTime = new Date();
          const executionTime = endTime.getTime() - startTime.getTime();

          const parallelResult: ParallelResult = {
            taskId: task.id,
            serverId: task.serverId,
            success: true,
            result,
            executionTime,
            startTime,
            endTime,
            retryCount,
          };

          this.emit("taskCompleted", parallelResult);
          return parallelResult;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        if (retryCount <= task.retries) {
          this.logger.debug(`任務 ${task.id} 重試 ${retryCount}/${task.retries}`, {
            error: lastError.message,
          });

          // 指數退避延遲
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } finally {
        this.currentConcurrency--;
      }
    }

    // 所有重試都失敗
    const endTime = new Date();
    const executionTime = endTime.getTime() - startTime.getTime();

    const failedResult: ParallelResult = {
      taskId: task.id,
      serverId: task.serverId,
      success: false,
      error: lastError || new Error("任務執行失敗"),
      executionTime,
      startTime,
      endTime,
      retryCount,
    };

    this.emit("taskFailed", task.id, failedResult.error!);
    this.emit("taskCompleted", failedResult);
    return failedResult;
  }

  /**
   * 更新批量統計
   */
  private updateBatchStats(batch: BatchContext, result: ParallelResult): void {
    const { stats } = batch;

    // 更新平均執行時間
    if (stats.averageExecutionTime === 0) {
      stats.averageExecutionTime = result.executionTime;
    } else {
      stats.averageExecutionTime =
        (stats.averageExecutionTime * (stats.completedTasks - 1) + result.executionTime) /
        stats.completedTasks;
    }

    // 更新並發統計
    stats.resourceUsage.peakConcurrency = Math.max(
      stats.resourceUsage.peakConcurrency,
      this.currentConcurrency
    );

    const averageConcurrency = batch.executing.size;
    if (stats.resourceUsage.averageConcurrency === 0) {
      stats.resourceUsage.averageConcurrency = averageConcurrency;
    } else {
      stats.resourceUsage.averageConcurrency =
        (stats.resourceUsage.averageConcurrency + averageConcurrency) / 2;
    }
  }

  /**
   * 檢查資源限制
   */
  private checkResourceLimits(
    limits: NonNullable<BatchExecutionOptions["resourceLimits"]>
  ): boolean {
    if (limits.maxMemoryUsage) {
      const memoryUsage = this.getMemoryUsage();
      if (memoryUsage > limits.maxMemoryUsage) {
        this.emit("resourceLimitExceeded", "memory", memoryUsage, limits.maxMemoryUsage);
        return false;
      }
    }

    if (limits.maxCpuUsage) {
      const cpuUsage = this.getCpuUsage();
      if (cpuUsage > limits.maxCpuUsage) {
        this.emit("resourceLimitExceeded", "cpu", cpuUsage, limits.maxCpuUsage);
        return false;
      }
    }

    return true;
  }

  /**
   * 獲取內存使用量（MB）
   */
  private getMemoryUsage(): number {
    if (typeof process !== "undefined" && process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024;
    }
    return 0;
  }

  /**
   * 獲取 CPU 使用率（百分比）
   */
  private getCpuUsage(): number {
    // 簡化的 CPU 使用率計算，實際應用中可能需要更精確的方法
    return this.currentConcurrency * 10; // 粗略估算
  }

  /**
   * 啟動資源監控
   */
  private startResourceMonitoring(): void {
    this.resourceMonitorTimer = setInterval(() => {
      for (const batch of this.activeBatches.values()) {
        batch.stats.resourceUsage.memoryUsage = this.getMemoryUsage();
        batch.stats.resourceUsage.cpuUsage = this.getCpuUsage();
      }
    }, this.config.resourceMonitoringInterval);
  }

  /**
   * 創建空統計對象
   */
  private createEmptyStats(): ParallelExecutionStats {
    return {
      totalTasks: 0,
      completedTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      concurrentPeak: 0,
      throughput: 0,
      errorRate: 0,
      resourceUsage: {
        averageConcurrency: 0,
        peakConcurrency: 0,
        memoryUsage: 0,
        cpuUsage: 0,
      },
    };
  }

  /**
   * 生成任務 ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成批量 ID
   */
  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 獲取當前狀態
   */
  public getStatus() {
    return {
      currentConcurrency: this.currentConcurrency,
      activeBatches: this.activeBatches.size,
      queueSize: this.taskQueue.length,
      serversCount: this.servers.size,
    };
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof ParallelExecutorEvents>(
    event: K,
    listener: ParallelExecutorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof ParallelExecutorEvents>(
    event: K,
    ...args: Parameters<ParallelExecutorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
