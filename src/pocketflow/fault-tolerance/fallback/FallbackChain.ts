/**
 * 智能回退鏈
 *
 * 提供智能回退機制：
 * - 多層回退策略
 * - 動態回退選擇
 * - 上下文保護
 * - 優雅降級處理
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 回退提供者
 */
export interface FallbackProvider {
  id: string;
  name: string;
  description: string;
  priority: number;
  canHandle: (context: Record<string, any>) => Promise<boolean>;
  execute: (context: Record<string, any>) => Promise<any>;
  timeout: number;
  retryable: boolean;
}

/**
 * 回退結果
 */
export interface FallbackResult {
  success: boolean;
  result?: any;
  providerId: string;
  providerName: string;
  executionTime: number;
  attempts: number;
  error?: Error;
  metadata: Record<string, any>;
}

/**
 * 回退執行記錄
 */
export interface FallbackExecution {
  id: string;
  startTime: Date;
  endTime?: Date;
  context: Record<string, any>;
  attempts: Array<{
    providerId: string;
    providerName: string;
    startTime: Date;
    endTime: Date;
    success: boolean;
    error?: Error;
    result?: any;
  }>;
  finalResult?: FallbackResult;
}

/**
 * 回退鏈配置
 */
export interface FallbackChainConfig {
  /** 啟用回退鏈 */
  enabled?: boolean;
  /** 最大鏈長度 */
  maxChainLength?: number;
  /** 總超時時間（毫秒） */
  timeout?: number;
  /** 並行執行回退 */
  parallelExecution?: boolean;
  /** 啟用上下文保護 */
  enableContextPreservation?: boolean;
  /** 自定義回退提供者 */
  customProviders?: FallbackProvider[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 回退鏈事件
 */
export interface FallbackChainEvents {
  executionStarted: (executionId: string, context: Record<string, any>) => void;
  providerAttempted: (executionId: string, providerId: string, success: boolean) => void;
  executionCompleted: (executionId: string, result: FallbackResult) => void;
  executionFailed: (executionId: string, error: Error) => void;
  providerRegistered: (provider: FallbackProvider) => void;
  providerUnregistered: (providerId: string) => void;
}

/**
 * 智能回退鏈
 */
export class FallbackChain extends EventEmitter {
  private config: Required<FallbackChainConfig>;
  private logger = createLogger("FallbackChain");

  // 回退提供者管理
  private providers = new Map<string, FallbackProvider>();
  private executions = new Map<string, FallbackExecution>();
  private usedFallbacks: string[] = [];

  // 運行時狀態
  private executionCounter = 0;

  constructor(config: FallbackChainConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? true,
      maxChainLength: config.maxChainLength ?? 5,
      timeout: config.timeout ?? 30000,
      parallelExecution: config.parallelExecution ?? false,
      enableContextPreservation: config.enableContextPreservation ?? true,
      customProviders: config.customProviders || [],
      debug: config.debug ?? false,
    };

    this.initializeDefaultProviders();
    this.registerCustomProviders();
  }

  /**
   * 執行回退鏈
   */
  public async execute<T>(
    primaryOperation: () => Promise<T>,
    context: Record<string, any> = {}
  ): Promise<T> {
    if (!this.config.enabled) {
      return await primaryOperation();
    }

    const executionId = this.generateExecutionId();
    const execution: FallbackExecution = {
      id: executionId,
      startTime: new Date(),
      context: { ...context },
      attempts: [],
    };

    this.executions.set(executionId, execution);
    this.usedFallbacks = [];

    this.logger.info(`開始回退鏈執行: ${executionId}`, { context });
    this.emit("executionStarted", executionId, context);

    try {
      // 首先嘗試主要操作
      try {
        const result = await this.executeWithTimeout(primaryOperation, this.config.timeout);

        execution.endTime = new Date();
        execution.finalResult = {
          success: true,
          result,
          providerId: "primary",
          providerName: "主要操作",
          executionTime: execution.endTime.getTime() - execution.startTime.getTime(),
          attempts: 1,
          metadata: { isPrimary: true },
        };

        this.emit("executionCompleted", executionId, execution.finalResult);
        return result;
      } catch (primaryError) {
        this.logger.warn(`主要操作失敗，開始回退鏈`, {
          executionId,
          error: primaryError instanceof Error ? primaryError.message : String(primaryError),
        });

        // 執行回退鏈
        const fallbackResult = await this.executeFallbackChain(
          executionId,
          execution,
          primaryError
        );

        execution.endTime = new Date();
        execution.finalResult = fallbackResult;

        if (fallbackResult.success) {
          this.emit("executionCompleted", executionId, fallbackResult);
          return fallbackResult.result;
        } else {
          throw fallbackResult.error || new Error("所有回退選項都失敗了");
        }
      }
    } catch (error) {
      execution.endTime = new Date();
      this.emit("executionFailed", executionId, error as Error);
      throw error;
    } finally {
      // 清理舊的執行記錄
      this.cleanupExecutions();
    }
  }

  /**
   * 註冊回退提供者
   */
  public registerProvider(provider: FallbackProvider): void {
    this.providers.set(provider.id, provider);
    this.logger.info(`註冊回退提供者: ${provider.name}`, { providerId: provider.id });
    this.emit("providerRegistered", provider);
  }

  /**
   * 取消註冊回退提供者
   */
  public unregisterProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (removed) {
      this.logger.info(`取消註冊回退提供者: ${providerId}`);
      this.emit("providerUnregistered", providerId);
    }
    return removed;
  }

  /**
   * 獲取所有提供者
   */
  public getProviders(): FallbackProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 獲取執行記錄
   */
  public getExecution(executionId: string): FallbackExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 獲取最近使用的回退
   */
  public getUsedFallbacks(): string[] {
    return [...this.usedFallbacks];
  }

  /**
   * 獲取回退統計
   */
  public getStatistics(): {
    totalExecutions: number;
    successfulExecutions: number;
    averageExecutionTime: number;
    providerUsage: Record<string, number>;
    commonFailureReasons: string[];
  } {
    const executions = Array.from(this.executions.values());
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter((e) => e.finalResult?.success).length;

    const executionTimes = executions
      .filter((e) => e.endTime)
      .map((e) => e.endTime!.getTime() - e.startTime.getTime());

    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
        : 0;

    const providerUsage: Record<string, number> = {};
    const failureReasons: string[] = [];

    for (const execution of executions) {
      for (const attempt of execution.attempts) {
        providerUsage[attempt.providerId] = (providerUsage[attempt.providerId] || 0) + 1;

        if (!attempt.success && attempt.error) {
          failureReasons.push(attempt.error.message);
        }
      }
    }

    // 統計常見失敗原因
    const reasonCounts = failureReasons.reduce(
      (counts, reason) => {
        counts[reason] = (counts[reason] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    const commonFailureReasons = Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([reason]) => reason);

    return {
      totalExecutions,
      successfulExecutions,
      averageExecutionTime,
      providerUsage,
      commonFailureReasons,
    };
  }

  /**
   * 初始化默認回退提供者
   */
  private initializeDefaultProviders(): void {
    // 緩存回退提供者
    this.registerProvider({
      id: "cache-fallback",
      name: "緩存回退",
      description: "從緩存中獲取結果",
      priority: 1,
      canHandle: async (context) => {
        return Boolean(context.cacheKey || context.operationName);
      },
      execute: async (context) => {
        // 模擬從緩存獲取數據
        this.logger.debug("執行緩存回退", { context });

        if (context.cachedResult) {
          return context.cachedResult;
        }

        // 模擬緩存未命中
        throw new Error("緩存中沒有找到結果");
      },
      timeout: 5000,
      retryable: false,
    });

    // 默認值回退提供者
    this.registerProvider({
      id: "default-value-fallback",
      name: "默認值回退",
      description: "返回預設的默認值",
      priority: 2,
      canHandle: async (context) => {
        return Boolean(context.defaultValue !== undefined);
      },
      execute: async (context) => {
        this.logger.debug("執行默認值回退", { context });
        return context.defaultValue;
      },
      timeout: 1000,
      retryable: false,
    });

    // 簡化結果回退提供者
    this.registerProvider({
      id: "simplified-result-fallback",
      name: "簡化結果回退",
      description: "返回簡化的結果",
      priority: 3,
      canHandle: async (context) => {
        return Boolean(context.operationName);
      },
      execute: async (context) => {
        this.logger.debug("執行簡化結果回退", { context });

        // 根據操作類型返回簡化結果
        switch (context.operationName) {
          case "search":
            return { results: [], message: "搜索服務暫時不可用，請稍後再試" };
          case "analysis":
            return { analysis: "分析服務暫時不可用", confidence: 0 };
          case "generation":
            return { content: "內容生成服務暫時不可用，請稍後再試", generated: false };
          default:
            return { message: "服務暫時不可用，請稍後再試", available: false };
        }
      },
      timeout: 1000,
      retryable: false,
    });

    // 離線模式回退提供者
    this.registerProvider({
      id: "offline-mode-fallback",
      name: "離線模式回退",
      description: "提供離線模式功能",
      priority: 4,
      canHandle: async (context) => {
        return Boolean(context.supportsOfflineMode);
      },
      execute: async (context) => {
        this.logger.debug("執行離線模式回退", { context });

        return {
          mode: "offline",
          message: "已切換到離線模式",
          limitations: "功能受限，僅提供基本服務",
          data: context.offlineData || null,
        };
      },
      timeout: 2000,
      retryable: false,
    });

    // 錯誤響應回退提供者（最後的選擇）
    this.registerProvider({
      id: "error-response-fallback",
      name: "錯誤響應回退",
      description: "返回友好的錯誤響應",
      priority: 10,
      canHandle: async () => true, // 總是可以處理
      execute: async (context) => {
        this.logger.debug("執行錯誤響應回退", { context });

        return {
          error: true,
          message: "服務暫時不可用，請稍後再試",
          errorCode: "SERVICE_UNAVAILABLE",
          retryAfter: 60, // 建議60秒後重試
          context: this.config.enableContextPreservation ? context : undefined,
        };
      },
      timeout: 500,
      retryable: false,
    });
  }

  /**
   * 註冊自定義提供者
   */
  private registerCustomProviders(): void {
    for (const provider of this.config.customProviders) {
      this.registerProvider(provider);
    }
  }

  /**
   * 執行回退鏈
   */
  private async executeFallbackChain(
    executionId: string,
    execution: FallbackExecution,
    originalError: any
  ): Promise<FallbackResult> {
    // 獲取可用的回退提供者
    const availableProviders = await this.getAvailableProviders(execution.context);

    if (availableProviders.length === 0) {
      throw new Error("沒有可用的回退提供者");
    }

    // 限制鏈長度
    const providers = availableProviders.slice(0, this.config.maxChainLength);

    this.logger.info(`開始執行回退鏈`, {
      executionId,
      providerCount: providers.length,
      providers: providers.map((p) => p.name),
    });

    if (this.config.parallelExecution) {
      return await this.executeParallelFallback(executionId, execution, providers);
    } else {
      return await this.executeSequentialFallback(executionId, execution, providers);
    }
  }

  /**
   * 順序執行回退
   */
  private async executeSequentialFallback(
    executionId: string,
    execution: FallbackExecution,
    providers: FallbackProvider[]
  ): Promise<FallbackResult> {
    for (const provider of providers) {
      const attemptStartTime = new Date();

      try {
        this.logger.debug(`嘗試回退提供者: ${provider.name}`, {
          executionId,
          providerId: provider.id,
        });

        const result = await this.executeWithTimeout(
          () => provider.execute(execution.context),
          provider.timeout
        );

        const attemptEndTime = new Date();
        const executionTime = attemptEndTime.getTime() - attemptStartTime.getTime();

        // 記錄成功的嘗試
        execution.attempts.push({
          providerId: provider.id,
          providerName: provider.name,
          startTime: attemptStartTime,
          endTime: attemptEndTime,
          success: true,
          result,
        });

        this.usedFallbacks.push(provider.id);
        this.emit("providerAttempted", executionId, provider.id, true);

        return {
          success: true,
          result,
          providerId: provider.id,
          providerName: provider.name,
          executionTime,
          attempts: execution.attempts.length,
          metadata: { isFallback: true, priority: provider.priority },
        };
      } catch (error) {
        const attemptEndTime = new Date();

        // 記錄失敗的嘗試
        execution.attempts.push({
          providerId: provider.id,
          providerName: provider.name,
          startTime: attemptStartTime,
          endTime: attemptEndTime,
          success: false,
          error: error as Error,
        });

        this.emit("providerAttempted", executionId, provider.id, false);

        this.logger.warn(`回退提供者失敗: ${provider.name}`, {
          executionId,
          providerId: provider.id,
          error: error instanceof Error ? error.message : String(error),
        });

        // 如果提供者不可重試，繼續下一個
        if (!provider.retryable) {
          continue;
        }
      }
    }

    // 所有回退都失敗了
    const totalExecutionTime = execution.attempts.reduce(
      (sum, attempt) => sum + (attempt.endTime.getTime() - attempt.startTime.getTime()),
      0
    );

    return {
      success: false,
      providerId: "none",
      providerName: "無可用回退",
      executionTime: totalExecutionTime,
      attempts: execution.attempts.length,
      error: new Error("所有回退提供者都失敗了"),
      metadata: { allProvidersFailed: true },
    };
  }

  /**
   * 並行執行回退
   */
  private async executeParallelFallback(
    executionId: string,
    execution: FallbackExecution,
    providers: FallbackProvider[]
  ): Promise<FallbackResult> {
    const attemptStartTime = new Date();

    // 創建並行執行的 Promise
    const attempts = providers.map(async (provider) => {
      try {
        const result = await this.executeWithTimeout(
          () => provider.execute(execution.context),
          provider.timeout
        );

        return {
          success: true,
          provider,
          result,
          error: undefined,
        };
      } catch (error) {
        return {
          success: false,
          provider,
          result: undefined,
          error: error as Error,
        };
      }
    });

    try {
      // 等待第一個成功的結果
      const firstSuccess = await Promise.any(
        attempts.map(async (attempt, index) => {
          const result = await attempt;
          if (result.success) {
            return { ...result, index };
          }
          throw result.error;
        })
      );

      const attemptEndTime = new Date();
      const executionTime = attemptEndTime.getTime() - attemptStartTime.getTime();

      // 記錄所有嘗試的結果
      const allResults = await Promise.allSettled(attempts);
      for (let i = 0; i < allResults.length; i++) {
        const result = allResults[i];
        const provider = providers[i];

        execution.attempts.push({
          providerId: provider.id,
          providerName: provider.name,
          startTime: attemptStartTime,
          endTime: attemptEndTime,
          success: result.status === "fulfilled" && result.value.success,
          error: result.status === "fulfilled" ? result.value.error : new Error("Promise rejected"),
          result: result.status === "fulfilled" ? result.value.result : undefined,
        });

        this.emit(
          "providerAttempted",
          executionId,
          provider.id,
          result.status === "fulfilled" && result.value.success
        );
      }

      this.usedFallbacks.push(firstSuccess.provider.id);

      return {
        success: true,
        result: firstSuccess.result,
        providerId: firstSuccess.provider.id,
        providerName: firstSuccess.provider.name,
        executionTime,
        attempts: providers.length,
        metadata: {
          isFallback: true,
          isParallel: true,
          priority: firstSuccess.provider.priority,
        },
      };
    } catch {
      // 所有並行嘗試都失敗了
      const attemptEndTime = new Date();
      const executionTime = attemptEndTime.getTime() - attemptStartTime.getTime();

      return {
        success: false,
        providerId: "none",
        providerName: "無可用回退",
        executionTime,
        attempts: providers.length,
        error: new Error("所有並行回退提供者都失敗了"),
        metadata: { allProvidersFailed: true, isParallel: true },
      };
    }
  }

  /**
   * 獲取可用的回退提供者
   */
  private async getAvailableProviders(context: Record<string, any>): Promise<FallbackProvider[]> {
    const availableProviders: FallbackProvider[] = [];

    for (const provider of this.providers.values()) {
      try {
        const canHandle = await provider.canHandle(context);
        if (canHandle) {
          availableProviders.push(provider);
        }
      } catch (error) {
        this.logger.warn(`檢查回退提供者可用性失敗: ${provider.name}`, {
          providerId: provider.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 按優先級排序
    return availableProviders.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 執行帶超時的操作
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`操作超時: ${timeout}ms`));
      }, timeout);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 生成執行ID
   */
  private generateExecutionId(): string {
    return `fallback-${Date.now()}-${++this.executionCounter}`;
  }

  /**
   * 清理舊的執行記錄
   */
  private cleanupExecutions(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小時前

    for (const [id, execution] of this.executions.entries()) {
      if (execution.startTime < cutoffTime) {
        this.executions.delete(id);
      }
    }
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof FallbackChainEvents>(event: K, listener: FallbackChainEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof FallbackChainEvents>(
    event: K,
    ...args: Parameters<FallbackChainEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
