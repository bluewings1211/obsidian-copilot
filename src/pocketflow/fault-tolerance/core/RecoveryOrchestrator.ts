/**
 * 自動恢復編排器
 *
 * 提供智能恢復協調功能：
 * - 多層恢復策略
 * - 智能重試機制
 * - 漸進式恢復
 * - 自適應恢復參數
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 恢復策略類型
 */
export enum RecoveryStrategyType {
  IMMEDIATE_RETRY = "immediate_retry", // 立即重試
  EXPONENTIAL_BACKOFF = "exponential_backoff", // 指數退避
  LINEAR_BACKOFF = "linear_backoff", // 線性退避
  CIRCUIT_BREAKER = "circuit_breaker", // 熔斷器
  PROGRESSIVE = "progressive", // 漸進式恢復
  ADAPTIVE = "adaptive", // 自適應恢復
}

/**
 * 恢復策略定義
 */
export interface RecoveryStrategy {
  type: RecoveryStrategyType;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  timeoutMultiplier: number;
  successThreshold: number;
  failureThreshold: number;
}

/**
 * 恢復上下文
 */
export interface RecoveryContext {
  operationId: string;
  operationName: string;
  startTime: Date;
  lastAttemptTime?: Date;
  attempts: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastError?: Error;
  metadata: Record<string, any>;
}

/**
 * 恢復結果
 */
export interface RecoveryResult {
  success: boolean;
  result?: any;
  finalAttempt: number;
  totalDuration: number;
  strategy: RecoveryStrategyType;
  errors: Error[];
  metadata: Record<string, any>;
}

/**
 * 熔斷器狀態
 */
export enum CircuitBreakerState {
  CLOSED = "closed", // 正常狀態
  OPEN = "open", // 熔斷狀態
  HALF_OPEN = "half_open", // 半開狀態
}

/**
 * 熔斷器信息
 */
export interface CircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  timeout: number;
}

/**
 * 恢復編排器配置
 */
export interface RecoveryOrchestratorConfig {
  /** 啟用恢復功能 */
  enabled?: boolean;
  /** 最大重試次數 */
  maxRetries?: number;
  /** 基礎延遲（毫秒） */
  baseDelay?: number;
  /** 最大延遲（毫秒） */
  maxDelay?: number;
  /** 默認恢復策略 */
  defaultStrategy?: RecoveryStrategyType;
  /** 熔斷器配置 */
  circuitBreaker?: {
    failureThreshold: number;
    timeout: number;
    successThreshold: number;
  };
  /** 自定義策略 */
  customStrategies?: Record<string, RecoveryStrategy>;
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 恢復事件
 */
export interface RecoveryOrchestratorEvents {
  recoveryStarted: (context: RecoveryContext) => void;
  attemptStarted: (context: RecoveryContext, attempt: number) => void;
  attemptCompleted: (context: RecoveryContext, attempt: number, success: boolean) => void;
  recoveryCompleted: (context: RecoveryContext, result: RecoveryResult) => void;
  recoveryFailed: (context: RecoveryContext, finalError: Error) => void;
  circuitBreakerStateChanged: (
    operationName: string,
    oldState: CircuitBreakerState,
    newState: CircuitBreakerState
  ) => void;
  strategyAdapted: (
    operationName: string,
    oldStrategy: RecoveryStrategy,
    newStrategy: RecoveryStrategy
  ) => void;
}

/**
 * 自動恢復編排器
 */
export class RecoveryOrchestrator extends EventEmitter {
  private config: Required<RecoveryOrchestratorConfig>;
  private logger = createLogger("RecoveryOrchestrator");

  // 恢復策略管理
  private strategies = new Map<string, RecoveryStrategy>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private recoveryContexts = new Map<string, RecoveryContext>();

  // 運行時狀態
  private isStarted = false;
  private operationCounter = 0;

  constructor(config: RecoveryOrchestratorConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? true,
      maxRetries: config.maxRetries ?? 3,
      baseDelay: config.baseDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      defaultStrategy: config.defaultStrategy ?? RecoveryStrategyType.EXPONENTIAL_BACKOFF,
      circuitBreaker: {
        failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
        timeout: config.circuitBreaker?.timeout ?? 60000,
        successThreshold: config.circuitBreaker?.successThreshold ?? 3,
      },
      customStrategies: config.customStrategies || {},
      debug: config.debug ?? false,
    };

    this.initializeDefaultStrategies();
    this.addCustomStrategies();
  }

  /**
   * 啟動恢復編排器
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.logger.info("啟動恢復編排器", { config: this.config });
    this.isStarted = true;
    this.logger.info("恢復編排器啟動成功");
  }

  /**
   * 停止恢復編排器
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止恢復編排器");
    this.isStarted = false;
    this.logger.info("恢復編排器已停止");
  }

  /**
   * 編排恢復過程
   */
  public async orchestrateRecovery<T>(
    operation: () => Promise<T>,
    fault: any,
    onAttemptStarted?: (attempt: number) => void,
    operationName?: string,
    customStrategy?: RecoveryStrategyType
  ): Promise<T> {
    if (!this.config.enabled) {
      return await operation();
    }

    const opName = operationName || "unknown-operation";
    const strategyType = customStrategy || this.config.defaultStrategy;
    const strategy = this.getStrategy(strategyType);

    // 檢查熔斷器狀態
    if (await this.isCircuitBreakerOpen(opName)) {
      throw new Error(`熔斷器開啟，操作 ${opName} 暫時不可用`);
    }

    const context: RecoveryContext = {
      operationId: this.generateOperationId(),
      operationName: opName,
      startTime: new Date(),
      attempts: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      lastError: fault,
      metadata: { strategy: strategyType, originalFault: fault },
    };

    this.recoveryContexts.set(context.operationId, context);
    this.emit("recoveryStarted", context);

    this.logger.info(`開始恢復編排: ${opName}`, {
      operationId: context.operationId,
      strategy: strategyType,
      maxRetries: strategy.maxRetries,
    });

    try {
      const result = await this.executeRecoveryLoop(operation, strategy, context, onAttemptStarted);

      // 更新熔斷器狀態
      await this.recordSuccess(opName);

      const recoveryResult: RecoveryResult = {
        success: true,
        result,
        finalAttempt: context.attempts,
        totalDuration: Date.now() - context.startTime.getTime(),
        strategy: strategyType,
        errors: [],
        metadata: context.metadata,
      };

      this.emit("recoveryCompleted", context, recoveryResult);
      return result;
    } catch (error) {
      // 更新熔斷器狀態
      await this.recordFailure(opName, error as Error);

      this.emit("recoveryFailed", context, error as Error);
      throw error;
    } finally {
      // 清理上下文
      this.recoveryContexts.delete(context.operationId);
    }
  }

  /**
   * 添加自定義恢復策略
   */
  public addStrategy(name: string, strategy: RecoveryStrategy): void {
    this.strategies.set(name, strategy);
    this.logger.info(`添加恢復策略: ${name}`, { strategy });
  }

  /**
   * 獲取熔斷器狀態
   */
  public getCircuitBreakerState(operationName: string): CircuitBreakerState {
    const breaker = this.circuitBreakers.get(operationName);
    return breaker?.state || CircuitBreakerState.CLOSED;
  }

  /**
   * 手動重置熔斷器
   */
  public resetCircuitBreaker(operationName: string): void {
    const breaker = this.circuitBreakers.get(operationName);
    if (breaker) {
      const oldState = breaker.state;
      breaker.state = CircuitBreakerState.CLOSED;
      breaker.failureCount = 0;
      breaker.successCount = 0;
      breaker.lastFailureTime = undefined;
      breaker.nextAttemptTime = undefined;

      this.emit("circuitBreakerStateChanged", operationName, oldState, CircuitBreakerState.CLOSED);
      this.logger.info(`手動重置熔斷器: ${operationName}`);
    }
  }

  /**
   * 獲取恢復統計
   */
  public getRecoveryStatistics(): {
    activeRecoveries: number;
    circuitBreakers: Record<string, CircuitBreakerState>;
    strategies: string[];
    recentRecoveries: Array<{
      operationName: string;
      success: boolean;
      attempts: number;
      duration: number;
    }>;
  } {
    const circuitBreakers: Record<string, CircuitBreakerState> = {};
    for (const [name, breaker] of this.circuitBreakers.entries()) {
      circuitBreakers[name] = breaker.state;
    }

    return {
      activeRecoveries: this.recoveryContexts.size,
      circuitBreakers,
      strategies: Array.from(this.strategies.keys()),
      recentRecoveries: [], // 可以擴展為實際的恢復歷史
    };
  }

  /**
   * 初始化默認策略
   */
  private initializeDefaultStrategies(): void {
    // 立即重試策略
    this.strategies.set(RecoveryStrategyType.IMMEDIATE_RETRY, {
      type: RecoveryStrategyType.IMMEDIATE_RETRY,
      maxRetries: this.config.maxRetries,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1,
      jitter: false,
      timeoutMultiplier: 1,
      successThreshold: 1,
      failureThreshold: this.config.circuitBreaker.failureThreshold,
    });

    // 指數退避策略
    this.strategies.set(RecoveryStrategyType.EXPONENTIAL_BACKOFF, {
      type: RecoveryStrategyType.EXPONENTIAL_BACKOFF,
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.baseDelay,
      maxDelay: this.config.maxDelay,
      backoffMultiplier: 2,
      jitter: true,
      timeoutMultiplier: 1.5,
      successThreshold: 1,
      failureThreshold: this.config.circuitBreaker.failureThreshold,
    });

    // 線性退避策略
    this.strategies.set(RecoveryStrategyType.LINEAR_BACKOFF, {
      type: RecoveryStrategyType.LINEAR_BACKOFF,
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.baseDelay,
      maxDelay: this.config.maxDelay,
      backoffMultiplier: 1,
      jitter: true,
      timeoutMultiplier: 1.2,
      successThreshold: 1,
      failureThreshold: this.config.circuitBreaker.failureThreshold,
    });

    // 漸進式恢復策略
    this.strategies.set(RecoveryStrategyType.PROGRESSIVE, {
      type: RecoveryStrategyType.PROGRESSIVE,
      maxRetries: this.config.maxRetries * 2,
      baseDelay: this.config.baseDelay,
      maxDelay: this.config.maxDelay,
      backoffMultiplier: 1.5,
      jitter: true,
      timeoutMultiplier: 1.3,
      successThreshold: 2,
      failureThreshold: this.config.circuitBreaker.failureThreshold,
    });

    // 自適應恢復策略
    this.strategies.set(RecoveryStrategyType.ADAPTIVE, {
      type: RecoveryStrategyType.ADAPTIVE,
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.baseDelay,
      maxDelay: this.config.maxDelay,
      backoffMultiplier: 1.8,
      jitter: true,
      timeoutMultiplier: 1.4,
      successThreshold: 1,
      failureThreshold: this.config.circuitBreaker.failureThreshold,
    });
  }

  /**
   * 添加自定義策略
   */
  private addCustomStrategies(): void {
    for (const [name, strategy] of Object.entries(this.config.customStrategies)) {
      this.strategies.set(name, strategy);
    }
  }

  /**
   * 獲取策略
   */
  private getStrategy(strategyType: RecoveryStrategyType): RecoveryStrategy {
    const strategy = this.strategies.get(strategyType);
    if (!strategy) {
      throw new Error(`未找到恢復策略: ${strategyType}`);
    }
    return strategy;
  }

  /**
   * 執行恢復循環
   */
  private async executeRecoveryLoop<T>(
    operation: () => Promise<T>,
    strategy: RecoveryStrategy,
    context: RecoveryContext,
    onAttemptStarted?: (attempt: number) => void
  ): Promise<T> {
    const errors: Error[] = [];

    for (let attempt = 1; attempt <= strategy.maxRetries; attempt++) {
      context.attempts = attempt;
      context.lastAttemptTime = new Date();

      this.emit("attemptStarted", context, attempt);
      onAttemptStarted?.(attempt);

      try {
        const result = await operation();

        // 重試成功
        context.consecutiveFailures = 0;
        this.emit("attemptCompleted", context, attempt, true);

        this.logger.info(`恢復成功: ${context.operationName}`, {
          operationId: context.operationId,
          attempt,
          duration: Date.now() - context.startTime.getTime(),
        });

        return result;
      } catch (error) {
        const currentError = error as Error;
        errors.push(currentError);
        context.lastError = currentError;
        context.totalFailures++;
        context.consecutiveFailures++;

        this.emit("attemptCompleted", context, attempt, false);

        this.logger.warn(`恢復嘗試失敗: ${context.operationName}`, {
          operationId: context.operationId,
          attempt,
          error: currentError.message,
          remainingAttempts: strategy.maxRetries - attempt,
        });

        // 如果還有重試機會，計算延遲時間
        if (attempt < strategy.maxRetries) {
          const delay = this.calculateDelay(strategy, attempt);

          if (delay > 0) {
            this.logger.debug(`等待 ${delay}ms 後重試`, {
              operationId: context.operationId,
              attempt,
              delay,
            });

            await this.sleep(delay);
          }
        }
      }
    }

    // 所有重試都失敗了
    const finalError = new Error(
      `恢復失敗，已重試 ${strategy.maxRetries} 次: ${context.operationName}. 最後錯誤: ${context.lastError?.message}`
    );

    // 附加所有錯誤信息
    (finalError as any).attempts = errors;
    throw finalError;
  }

  /**
   * 計算延遲時間
   */
  private calculateDelay(strategy: RecoveryStrategy, attempt: number): number {
    let delay: number;

    switch (strategy.type) {
      case RecoveryStrategyType.IMMEDIATE_RETRY:
        delay = 0;
        break;

      case RecoveryStrategyType.LINEAR_BACKOFF:
        delay = strategy.baseDelay * attempt;
        break;

      case RecoveryStrategyType.EXPONENTIAL_BACKOFF:
        delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1);
        break;

      case RecoveryStrategyType.PROGRESSIVE:
        // 漸進式：前幾次快速重試，後面延遲增加
        if (attempt <= 2) {
          delay = strategy.baseDelay * 0.5;
        } else {
          delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 2);
        }
        break;

      case RecoveryStrategyType.ADAPTIVE:
        // 自適應：根據歷史成功率調整延遲
        delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1);
        // 可以根據歷史數據進一步調整
        break;

      default:
        delay = strategy.baseDelay;
    }

    // 應用最大延遲限制
    delay = Math.min(delay, strategy.maxDelay);

    // 添加抖動以避免雷群效應
    if (strategy.jitter && delay > 0) {
      const jitterAmount = delay * 0.1; // 10% 抖動
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }

    return Math.max(0, Math.round(delay));
  }

  /**
   * 檢查熔斷器是否開啟
   */
  private async isCircuitBreakerOpen(operationName: string): Promise<boolean> {
    const breaker = this.getOrCreateCircuitBreaker(operationName);

    switch (breaker.state) {
      case CircuitBreakerState.CLOSED:
        return false;

      case CircuitBreakerState.OPEN:
        // 檢查是否可以嘗試半開狀態
        if (breaker.nextAttemptTime && Date.now() >= breaker.nextAttemptTime.getTime()) {
          this.transitionCircuitBreakerState(operationName, CircuitBreakerState.HALF_OPEN);
          return false;
        }
        return true;

      case CircuitBreakerState.HALF_OPEN:
        return false;

      default:
        return false;
    }
  }

  /**
   * 記錄成功
   */
  private async recordSuccess(operationName: string): Promise<void> {
    const breaker = this.getOrCreateCircuitBreaker(operationName);
    breaker.successCount++;

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      if (breaker.successCount >= this.config.circuitBreaker.successThreshold) {
        this.transitionCircuitBreakerState(operationName, CircuitBreakerState.CLOSED);
        breaker.failureCount = 0;
        breaker.successCount = 0;
      }
    }
  }

  /**
   * 記錄失敗
   */
  private async recordFailure(operationName: string, error: Error): Promise<void> {
    const breaker = this.getOrCreateCircuitBreaker(operationName);
    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    if (breaker.state === CircuitBreakerState.CLOSED) {
      if (breaker.failureCount >= this.config.circuitBreaker.failureThreshold) {
        this.transitionCircuitBreakerState(operationName, CircuitBreakerState.OPEN);
        breaker.nextAttemptTime = new Date(Date.now() + this.config.circuitBreaker.timeout);
      }
    } else if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionCircuitBreakerState(operationName, CircuitBreakerState.OPEN);
      breaker.nextAttemptTime = new Date(Date.now() + this.config.circuitBreaker.timeout);
    }
  }

  /**
   * 獲取或創建熔斷器
   */
  private getOrCreateCircuitBreaker(operationName: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(operationName);
    if (!breaker) {
      breaker = {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        successCount: 0,
        timeout: this.config.circuitBreaker.timeout,
      };
      this.circuitBreakers.set(operationName, breaker);
    }
    return breaker;
  }

  /**
   * 轉換熔斷器狀態
   */
  private transitionCircuitBreakerState(
    operationName: string,
    newState: CircuitBreakerState
  ): void {
    const breaker = this.circuitBreakers.get(operationName);
    if (breaker && breaker.state !== newState) {
      const oldState = breaker.state;
      breaker.state = newState;

      this.emit("circuitBreakerStateChanged", operationName, oldState, newState);

      this.logger.info(`熔斷器狀態變更: ${operationName}`, {
        oldState,
        newState,
        failureCount: breaker.failureCount,
        successCount: breaker.successCount,
      });
    }
  }

  /**
   * 生成操作ID
   */
  private generateOperationId(): string {
    return `recovery-${Date.now()}-${++this.operationCounter}`;
  }

  /**
   * 睡眠函數
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof RecoveryOrchestratorEvents>(
    event: K,
    listener: RecoveryOrchestratorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof RecoveryOrchestratorEvents>(
    event: K,
    ...args: Parameters<RecoveryOrchestratorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
