/**
 * 負載適應引擎
 *
 * 提供自適應負載管理功能：
 * - 實時負載監控
 * - 動態負載調整
 * - 資源分配優化
 * - 性能自適應調節
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 負載指標
 */
export interface LoadMetrics {
  /** CPU 使用率 (0-1) */
  cpu: number;
  /** 內存使用率 (0-1) */
  memory: number;
  /** 平均響應時間 (毫秒) */
  responseTime: number;
  /** 吞吐量 (每秒請求數) */
  throughput: number;
  /** 活躍連接數 */
  activeConnections: number;
  /** 錯誤率 (0-1) */
  errorRate: number;
  /** 隊列長度 */
  queueLength: number;
  /** 時間戳 */
  timestamp: Date;
}

/**
 * 適應動作類型
 */
export enum AdaptationAction {
  INCREASE_CONCURRENCY = "increase_concurrency", // 增加並發數
  DECREASE_CONCURRENCY = "decrease_concurrency", // 減少並發數
  ENABLE_THROTTLING = "enable_throttling", // 啟用限流
  DISABLE_THROTTLING = "disable_throttling", // 停用限流
  ADJUST_TIMEOUT = "adjust_timeout", // 調整超時時間
  SCALE_UP = "scale_up", // 擴容
  SCALE_DOWN = "scale_down", // 縮容
  ENABLE_CACHE = "enable_cache", // 啟用緩存
  CLEAR_CACHE = "clear_cache", // 清理緩存
  REDUCE_QUALITY = "reduce_quality", // 降低服務質量
  RESTORE_QUALITY = "restore_quality", // 恢復服務質量
}

/**
 * 適應規則
 */
export interface AdaptationRule {
  id: string;
  name: string;
  description: string;
  conditions: Array<{
    metric: keyof LoadMetrics;
    operator: "gt" | "lt" | "eq" | "gte" | "lte";
    threshold: number;
    duration: number; // 持續時間（毫秒）
  }>;
  actions: Array<{
    type: AdaptationAction;
    parameters: Record<string, any>;
    priority: number;
  }>;
  cooldown: number; // 冷卻時間（毫秒）
  enabled: boolean;
}

/**
 * 適應執行記錄
 */
export interface AdaptationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  action: AdaptationAction;
  parameters: Record<string, any>;
  timestamp: Date;
  metrics: LoadMetrics;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * 負載適應配置
 */
export interface LoadAdaptationEngineConfig {
  /** 啟用負載適應 */
  enabled?: boolean;
  /** 監控間隔（毫秒） */
  monitoringInterval?: number;
  /** CPU 閾值 */
  cpuThreshold?: number;
  /** 內存閾值 */
  memoryThreshold?: number;
  /** 響應時間閾值（毫秒） */
  responseTimeThreshold?: number;
  /** 自動適應 */
  autoAdaptation?: boolean;
  /** 適應敏感度 (0-1) */
  adaptationSensitivity?: number;
  /** 自定義規則 */
  customRules?: AdaptationRule[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 負載適應事件
 */
export interface LoadAdaptationEngineEvents {
  metricsUpdated: (metrics: LoadMetrics) => void;
  adaptationTriggered: (action: AdaptationAction, reason: string) => void;
  ruleEvaluated: (ruleId: string, triggered: boolean, metrics: LoadMetrics) => void;
  adaptationExecuted: (execution: AdaptationExecution) => void;
  thresholdExceeded: (metric: string, value: number, threshold: number) => void;
}

/**
 * 條件狀態追蹤
 */
interface ConditionState {
  ruleId: string;
  conditionIndex: number;
  startTime: Date;
  satisfied: boolean;
}

/**
 * 負載適應引擎
 */
export class LoadAdaptationEngine extends EventEmitter {
  private config: Required<LoadAdaptationEngineConfig>;
  private logger = createLogger("LoadAdaptationEngine");

  // 規則管理
  private rules = new Map<string, AdaptationRule>();
  private ruleLastExecution = new Map<string, Date>();
  private conditionStates = new Map<string, ConditionState>();

  // 負載監控
  private currentMetrics: LoadMetrics;
  private metricsHistory: LoadMetrics[] = [];
  private maxHistorySize = 100;

  // 運行時狀態
  private isStarted = false;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private executionCounter = 0;

  // 適應狀態
  private currentConcurrency = 10;
  private maxConcurrency = 100;
  private minConcurrency = 1;
  private throttlingEnabled = false;
  private currentTimeout = 30000;

  constructor(config: LoadAdaptationEngineConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? true,
      monitoringInterval: config.monitoringInterval ?? 5000,
      cpuThreshold: config.cpuThreshold ?? 0.8,
      memoryThreshold: config.memoryThreshold ?? 0.8,
      responseTimeThreshold: config.responseTimeThreshold ?? 5000,
      autoAdaptation: config.autoAdaptation ?? true,
      adaptationSensitivity: config.adaptationSensitivity ?? 0.7,
      customRules: config.customRules || [],
      debug: config.debug ?? false,
    };

    this.currentMetrics = this.createEmptyMetrics();
    this.initializeDefaultRules();
    this.addCustomRules();
  }

  /**
   * 啟動負載適應引擎
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.logger.info("啟動負載適應引擎", { config: this.config });

    if (this.config.enabled) {
      this.startMonitoring();
    }

    this.isStarted = true;
    this.logger.info("負載適應引擎啟動成功");
  }

  /**
   * 停止負載適應引擎
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止負載適應引擎");

    this.stopMonitoring();
    this.isStarted = false;

    this.logger.info("負載適應引擎已停止");
  }

  /**
   * 獲取當前負載指標
   */
  public async getCurrentLoad(): Promise<LoadMetrics> {
    return { ...this.currentMetrics };
  }

  /**
   * 更新負載指標
   */
  public updateMetrics(metrics: Partial<LoadMetrics>): void {
    this.currentMetrics = {
      ...this.currentMetrics,
      ...metrics,
      timestamp: new Date(),
    };

    // 添加到歷史記錄
    this.metricsHistory.unshift(this.currentMetrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(0, this.maxHistorySize);
    }

    this.emit("metricsUpdated", this.currentMetrics);

    // 如果啟用自動適應，評估規則
    if (this.config.autoAdaptation) {
      this.evaluateRules();
    }
  }

  /**
   * 添加適應規則
   */
  public addRule(rule: AdaptationRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info(`添加適應規則: ${rule.name}`, { ruleId: rule.id });
  }

  /**
   * 移除適應規則
   */
  public removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.logger.info(`移除適應規則: ${ruleId}`);
      // 清理相關狀態
      this.ruleLastExecution.delete(ruleId);
      for (const [key, state] of this.conditionStates.entries()) {
        if (state.ruleId === ruleId) {
          this.conditionStates.delete(key);
        }
      }
    }
    return removed;
  }

  /**
   * 手動執行適應動作
   */
  public async executeAdaptation(
    action: AdaptationAction,
    parameters: Record<string, any> = {},
    reason: string = "手動執行"
  ): Promise<boolean> {
    const execution: AdaptationExecution = {
      id: this.generateExecutionId(),
      ruleId: "manual",
      ruleName: "手動執行",
      action,
      parameters,
      timestamp: new Date(),
      metrics: this.currentMetrics,
      success: false,
      duration: 0,
    };

    const startTime = Date.now();

    try {
      this.logger.info(`執行適應動作: ${action}`, {
        executionId: execution.id,
        parameters,
        reason,
      });

      await this.performAdaptation(action, parameters);

      execution.success = true;
      execution.duration = Date.now() - startTime;

      this.emit("adaptationTriggered", action, reason);
      this.emit("adaptationExecuted", execution);

      return true;
    } catch (error) {
      execution.success = false;
      execution.duration = Date.now() - startTime;
      execution.error = error instanceof Error ? error.message : String(error);

      this.logger.error(`適應動作執行失敗: ${action}`, error);
      this.emit("adaptationExecuted", execution);

      return false;
    }
  }

  /**
   * 獲取適應統計
   */
  public getAdaptationStatistics(): {
    currentState: {
      concurrency: number;
      throttlingEnabled: boolean;
      timeout: number;
    };
    rules: Array<{
      id: string;
      name: string;
      enabled: boolean;
      lastExecution?: Date;
    }>;
    recentExecutions: AdaptationExecution[];
    metricsHistory: LoadMetrics[];
  } {
    const rules = Array.from(this.rules.values()).map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      lastExecution: this.ruleLastExecution.get(rule.id),
    }));

    return {
      currentState: {
        concurrency: this.currentConcurrency,
        throttlingEnabled: this.throttlingEnabled,
        timeout: this.currentTimeout,
      },
      rules,
      recentExecutions: [], // 可以擴展為實際的執行歷史
      metricsHistory: this.metricsHistory.slice(0, 20), // 最近20個指標
    };
  }

  /**
   * 重置適應狀態
   */
  public resetAdaptationState(): void {
    this.currentConcurrency = 10;
    this.throttlingEnabled = false;
    this.currentTimeout = 30000;
    this.conditionStates.clear();
    this.ruleLastExecution.clear();

    this.logger.info("重置適應狀態");
  }

  /**
   * 初始化默認規則
   */
  private initializeDefaultRules(): void {
    const defaultRules: AdaptationRule[] = [
      {
        id: "high-cpu-throttle",
        name: "高CPU使用率限流",
        description: "當CPU使用率過高時啟用限流",
        conditions: [
          {
            metric: "cpu",
            operator: "gt",
            threshold: this.config.cpuThreshold,
            duration: 10000, // 持續10秒
          },
        ],
        actions: [
          {
            type: AdaptationAction.ENABLE_THROTTLING,
            parameters: { rate: 0.7 },
            priority: 1,
          },
          {
            type: AdaptationAction.DECREASE_CONCURRENCY,
            parameters: { factor: 0.8 },
            priority: 2,
          },
        ],
        cooldown: 30000, // 30秒冷卻
        enabled: true,
      },
      {
        id: "high-memory-cache-clear",
        name: "高內存使用率清理緩存",
        description: "當內存使用率過高時清理緩存",
        conditions: [
          {
            metric: "memory",
            operator: "gt",
            threshold: this.config.memoryThreshold,
            duration: 5000, // 持續5秒
          },
        ],
        actions: [
          {
            type: AdaptationAction.CLEAR_CACHE,
            parameters: { percentage: 30 },
            priority: 1,
          },
        ],
        cooldown: 60000, // 60秒冷卻
        enabled: true,
      },
      {
        id: "slow-response-time-optimization",
        name: "慢響應時間優化",
        description: "當響應時間過慢時進行優化",
        conditions: [
          {
            metric: "responseTime",
            operator: "gt",
            threshold: this.config.responseTimeThreshold,
            duration: 15000, // 持續15秒
          },
        ],
        actions: [
          {
            type: AdaptationAction.ENABLE_CACHE,
            parameters: { aggressive: true },
            priority: 1,
          },
          {
            type: AdaptationAction.REDUCE_QUALITY,
            parameters: { level: "medium" },
            priority: 2,
          },
        ],
        cooldown: 45000, // 45秒冷卻
        enabled: true,
      },
      {
        id: "low-load-optimization",
        name: "低負載優化",
        description: "當系統負載較低時優化資源使用",
        conditions: [
          {
            metric: "cpu",
            operator: "lt",
            threshold: 0.3,
            duration: 60000, // 持續60秒
          },
          {
            metric: "memory",
            operator: "lt",
            threshold: 0.5,
            duration: 60000, // 持續60秒
          },
        ],
        actions: [
          {
            type: AdaptationAction.INCREASE_CONCURRENCY,
            parameters: { factor: 1.2 },
            priority: 1,
          },
          {
            type: AdaptationAction.DISABLE_THROTTLING,
            parameters: {},
            priority: 2,
          },
          {
            type: AdaptationAction.RESTORE_QUALITY,
            parameters: {},
            priority: 3,
          },
        ],
        cooldown: 120000, // 120秒冷卻
        enabled: true,
      },
      {
        id: "high-error-rate-protection",
        name: "高錯誤率保護",
        description: "當錯誤率過高時啟用保護機制",
        conditions: [
          {
            metric: "errorRate",
            operator: "gt",
            threshold: 0.1, // 10%
            duration: 5000, // 持續5秒
          },
        ],
        actions: [
          {
            type: AdaptationAction.ENABLE_THROTTLING,
            parameters: { rate: 0.5 },
            priority: 1,
          },
          {
            type: AdaptationAction.ADJUST_TIMEOUT,
            parameters: { multiplier: 1.5 },
            priority: 2,
          },
        ],
        cooldown: 30000, // 30秒冷卻
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * 添加自定義規則
   */
  private addCustomRules(): void {
    for (const rule of this.config.customRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * 評估所有規則
   */
  private evaluateRules(): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      // 檢查冷卻時間
      const lastExecution = this.ruleLastExecution.get(rule.id);
      if (lastExecution && Date.now() - lastExecution.getTime() < rule.cooldown) {
        continue;
      }

      const shouldTrigger = this.evaluateRule(rule);
      this.emit("ruleEvaluated", rule.id, shouldTrigger, this.currentMetrics);

      if (shouldTrigger) {
        this.triggerRule(rule);
      }
    }
  }

  /**
   * 評估單個規則
   */
  private evaluateRule(rule: AdaptationRule): boolean {
    // 所有條件都必須滿足
    for (let i = 0; i < rule.conditions.length; i++) {
      const condition = rule.conditions[i];
      const currentValue = this.currentMetrics[condition.metric];

      if (typeof currentValue !== "number") {
        continue;
      }

      const satisfied = this.evaluateCondition(
        currentValue,
        condition.operator,
        condition.threshold
      );
      const stateKey = `${rule.id}-${i}`;
      const existingState = this.conditionStates.get(stateKey);

      if (satisfied) {
        if (!existingState) {
          // 開始新的條件狀態
          this.conditionStates.set(stateKey, {
            ruleId: rule.id,
            conditionIndex: i,
            startTime: new Date(),
            satisfied: true,
          });
        } else {
          // 檢查持續時間
          const duration = Date.now() - existingState.startTime.getTime();
          if (duration < condition.duration) {
            return false; // 持續時間不夠
          }
        }
      } else {
        // 條件不滿足，移除狀態
        if (existingState) {
          this.conditionStates.delete(stateKey);
        }
        return false;
      }
    }

    return true; // 所有條件都滿足且持續時間夠長
  }

  /**
   * 評估單個條件
   */
  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case "gt":
        return value > threshold;
      case "lt":
        return value < threshold;
      case "eq":
        return value === threshold;
      case "gte":
        return value >= threshold;
      case "lte":
        return value <= threshold;
      default:
        return false;
    }
  }

  /**
   * 觸發規則
   */
  private async triggerRule(rule: AdaptationRule): Promise<void> {
    this.logger.info(`觸發適應規則: ${rule.name}`, {
      ruleId: rule.id,
      metrics: this.currentMetrics,
    });

    // 記錄執行時間
    this.ruleLastExecution.set(rule.id, new Date());

    // 按優先級執行動作
    const sortedActions = [...rule.actions].sort((a, b) => a.priority - b.priority);

    for (const action of sortedActions) {
      try {
        await this.executeAdaptation(action.type, action.parameters, `規則觸發: ${rule.name}`);
      } catch (error) {
        this.logger.error(`執行適應動作失敗`, {
          ruleId: rule.id,
          action: action.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 清理相關的條件狀態
    for (const [key, state] of this.conditionStates.entries()) {
      if (state.ruleId === rule.id) {
        this.conditionStates.delete(key);
      }
    }
  }

  /**
   * 執行適應動作
   */
  private async performAdaptation(
    action: AdaptationAction,
    parameters: Record<string, any>
  ): Promise<void> {
    switch (action) {
      case AdaptationAction.INCREASE_CONCURRENCY: {
        const increaseFactor = parameters.factor || 1.2;
        this.currentConcurrency = Math.min(
          Math.round(this.currentConcurrency * increaseFactor),
          this.maxConcurrency
        );
        this.logger.info(`增加並發數到 ${this.currentConcurrency}`);
        break;
      }

      case AdaptationAction.DECREASE_CONCURRENCY: {
        const decreaseFactor = parameters.factor || 0.8;
        this.currentConcurrency = Math.max(
          Math.round(this.currentConcurrency * decreaseFactor),
          this.minConcurrency
        );
        this.logger.info(`減少並發數到 ${this.currentConcurrency}`);
        break;
      }

      case AdaptationAction.ENABLE_THROTTLING: {
        this.throttlingEnabled = true;
        const rate = parameters.rate || 0.8;
        this.logger.info(`啟用限流，速率: ${rate}`);
        break;
      }

      case AdaptationAction.DISABLE_THROTTLING:
        this.throttlingEnabled = false;
        this.logger.info("停用限流");
        break;

      case AdaptationAction.ADJUST_TIMEOUT: {
        const multiplier = parameters.multiplier || 1.5;
        this.currentTimeout = Math.round(this.currentTimeout * multiplier);
        this.logger.info(`調整超時時間到 ${this.currentTimeout}ms`);
        break;
      }

      case AdaptationAction.CLEAR_CACHE: {
        const percentage = parameters.percentage || 50;
        this.logger.info(`清理 ${percentage}% 的緩存`);
        // 實際的緩存清理邏輯需要根據具體實現
        break;
      }

      case AdaptationAction.ENABLE_CACHE: {
        const aggressive = parameters.aggressive || false;
        this.logger.info(`啟用緩存，激進模式: ${aggressive}`);
        // 實際的緩存啟用邏輯需要根據具體實現
        break;
      }

      case AdaptationAction.REDUCE_QUALITY: {
        const level = parameters.level || "medium";
        this.logger.info(`降低服務質量到: ${level}`);
        // 實際的質量調整邏輯需要根據具體實現
        break;
      }

      case AdaptationAction.RESTORE_QUALITY:
        this.logger.info("恢復服務質量");
        // 實際的質量恢復邏輯需要根據具體實現
        break;

      default:
        this.logger.warn(`未知的適應動作: ${action}`);
    }
  }

  /**
   * 啟動監控
   */
  private startMonitoring(): void {
    if (this.monitoringTimer) {
      return;
    }

    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringInterval);
  }

  /**
   * 停止監控
   */
  private stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * 收集指標
   */
  private collectMetrics(): void {
    // 模擬指標收集
    // 在實際應用中，這些會從系統監控API獲取
    const memUsage = process.memoryUsage();

    const metrics: LoadMetrics = {
      cpu: this.simulateCpuUsage(),
      memory: memUsage.heapUsed / memUsage.heapTotal,
      responseTime: this.simulateResponseTime(),
      throughput: this.simulateThroughput(),
      activeConnections: this.simulateActiveConnections(),
      errorRate: this.simulateErrorRate(),
      queueLength: this.simulateQueueLength(),
      timestamp: new Date(),
    };

    this.updateMetrics(metrics);
  }

  /**
   * 模擬CPU使用率
   */
  private simulateCpuUsage(): number {
    // 簡化的CPU使用率模擬
    return Math.min(Math.random() * 0.8 + (this.throttlingEnabled ? 0.1 : 0.2), 1);
  }

  /**
   * 模擬響應時間
   */
  private simulateResponseTime(): number {
    const base = this.throttlingEnabled ? 2000 : 1000;
    const variation = Math.random() * 1000;
    return base + variation;
  }

  /**
   * 模擬吞吐量
   */
  private simulateThroughput(): number {
    const base = this.throttlingEnabled ? 50 : 100;
    return base + Math.random() * 50;
  }

  /**
   * 模擬活躍連接數
   */
  private simulateActiveConnections(): number {
    return Math.round(this.currentConcurrency * (0.7 + Math.random() * 0.3));
  }

  /**
   * 模擬錯誤率
   */
  private simulateErrorRate(): number {
    return Math.random() * 0.05; // 0-5% 錯誤率
  }

  /**
   * 模擬隊列長度
   */
  private simulateQueueLength(): number {
    return Math.round(Math.random() * 20);
  }

  /**
   * 生成執行ID
   */
  private generateExecutionId(): string {
    return `adaptation-${Date.now()}-${++this.executionCounter}`;
  }

  /**
   * 創建空指標對象
   */
  private createEmptyMetrics(): LoadMetrics {
    return {
      cpu: 0,
      memory: 0,
      responseTime: 0,
      throughput: 0,
      activeConnections: 0,
      errorRate: 0,
      queueLength: 0,
      timestamp: new Date(),
    };
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof LoadAdaptationEngineEvents>(
    event: K,
    listener: LoadAdaptationEngineEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof LoadAdaptationEngineEvents>(
    event: K,
    ...args: Parameters<LoadAdaptationEngineEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
