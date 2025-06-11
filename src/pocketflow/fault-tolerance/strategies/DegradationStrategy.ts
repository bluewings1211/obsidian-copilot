/**
 * 降級策略
 *
 * 提供多層次降級策略管理：
 * - 工具級降級
 * - 服務級降級
 * - 功能級降級
 * - 系統級降級
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 降級級別
 */
export enum DegradationLevel {
  TOOL = "tool", // 工具級降級
  SERVICE = "service", // 服務級降級
  FUNCTION = "function", // 功能級降級
  SYSTEM = "system", // 系統級降級
}

/**
 * 降級動作
 */
export enum DegradationAction {
  DISABLE = "disable", // 禁用功能
  LIMIT = "limit", // 限制功能
  CACHE_ONLY = "cache_only", // 僅使用緩存
  FALLBACK = "fallback", // 使用回退方案
  REDUCE_QUALITY = "reduce_quality", // 降低服務質量
  DELAY = "delay", // 延遲處理
}

/**
 * 降級策略定義
 */
export interface DegradationStrategyDefinition {
  id: string;
  name: string;
  level: DegradationLevel;
  action: DegradationAction;
  description: string;
  triggers: Array<{
    condition: string;
    threshold: number;
    operator: "gt" | "lt" | "eq" | "gte" | "lte";
  }>;
  effects: Array<{
    target: string;
    action: string;
    parameters: Record<string, any>;
  }>;
  priority: number;
  autoActivate: boolean;
  maxDuration: number; // 最大持續時間（毫秒）
  cooldown: number; // 冷卻時間（毫秒）
}

/**
 * 活躍降級信息
 */
export interface ActiveDegradation {
  strategy: DegradationStrategyDefinition;
  activatedAt: Date;
  reason: string;
  metrics: Record<string, any>;
  effects: Array<{
    target: string;
    action: string;
    applied: boolean;
    error?: string;
  }>;
}

/**
 * 降級配置
 */
export interface DegradationStrategyConfig {
  /** 自動降級 */
  autoDegrade?: boolean;
  /** 最大降級級別 */
  maxLevel?: DegradationLevel;
  /** 降級閾值 */
  threshold?: number;
  /** 檢查間隔（毫秒） */
  checkInterval?: number;
  /** 自定義策略 */
  customStrategies?: DegradationStrategyDefinition[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 降級事件
 */
export interface DegradationStrategyEvents {
  strategyActivated: (strategy: DegradationStrategyDefinition, reason: string) => void;
  strategyDeactivated: (strategy: DegradationStrategyDefinition) => void;
  effectApplied: (target: string, action: string, success: boolean) => void;
  checkCompleted: (
    results: Array<{ strategy: string; shouldActivate: boolean; reason?: string }>
  ) => void;
}

/**
 * 降級策略管理器
 */
export class DegradationStrategy extends EventEmitter {
  private config: Required<DegradationStrategyConfig>;
  private logger = createLogger("DegradationStrategy");

  // 策略管理
  private strategies = new Map<string, DegradationStrategyDefinition>();
  private activeDegradations = new Map<string, ActiveDegradation>();
  private lastActivation = new Map<string, Date>();

  // 運行時狀態
  private isStarted = false;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(config: DegradationStrategyConfig = {}) {
    super();

    this.config = {
      autoDegrade: config.autoDegrade ?? true,
      maxLevel: config.maxLevel ?? DegradationLevel.FUNCTION,
      threshold: config.threshold ?? 0.8,
      checkInterval: config.checkInterval ?? 10000,
      customStrategies: config.customStrategies || [],
      debug: config.debug ?? false,
    };

    this.initializeDefaultStrategies();
    this.addCustomStrategies();
  }

  /**
   * 啟動降級策略管理器
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.logger.info("啟動降級策略管理器", { config: this.config });

    if (this.config.autoDegrade) {
      this.startAutoCheck();
    }

    this.isStarted = true;
    this.logger.info("降級策略管理器啟動成功");
  }

  /**
   * 停止降級策略管理器
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止降級策略管理器");

    this.stopAutoCheck();

    // 停用所有活躍的降級
    for (const [strategyId] of this.activeDegradations) {
      await this.deactivate(strategyId);
    }

    this.isStarted = false;
    this.logger.info("降級策略管理器已停止");
  }

  /**
   * 激活降級策略
   */
  public async activate(
    levelOrStrategyId: DegradationLevel | string,
    reason: string,
    metrics: Record<string, any> = {}
  ): Promise<void> {
    let strategy: DegradationStrategyDefinition | undefined;

    if (Object.values(DegradationLevel).includes(levelOrStrategyId as DegradationLevel)) {
      // 按級別查找最高優先級策略
      strategy = this.findBestStrategyForLevel(levelOrStrategyId as DegradationLevel);
    } else {
      // 按ID查找策略
      strategy = this.strategies.get(levelOrStrategyId);
    }

    if (!strategy) {
      throw new Error(`未找到降級策略: ${levelOrStrategyId}`);
    }

    // 檢查冷卻時間
    const lastActivation = this.lastActivation.get(strategy.id);
    if (lastActivation && Date.now() - lastActivation.getTime() < strategy.cooldown) {
      this.logger.warn(`策略 ${strategy.name} 仍在冷卻期間`, {
        strategyId: strategy.id,
        remainingCooldown: strategy.cooldown - (Date.now() - lastActivation.getTime()),
      });
      return;
    }

    // 檢查是否已經激活
    if (this.activeDegradations.has(strategy.id)) {
      this.logger.warn(`策略 ${strategy.name} 已經激活`, { strategyId: strategy.id });
      return;
    }

    // 檢查級別限制
    if (this.getLevelPriority(strategy.level) > this.getLevelPriority(this.config.maxLevel)) {
      this.logger.warn(`策略級別 ${strategy.level} 超過最大允許級別 ${this.config.maxLevel}`);
      return;
    }

    this.logger.info(`激活降級策略: ${strategy.name}`, {
      strategyId: strategy.id,
      level: strategy.level,
      reason,
      metrics,
    });

    try {
      // 應用降級效果
      const effects = await this.applyDegradationEffects(strategy);

      // 創建活躍降級記錄
      const activeDegradation: ActiveDegradation = {
        strategy,
        activatedAt: new Date(),
        reason,
        metrics,
        effects,
      };

      this.activeDegradations.set(strategy.id, activeDegradation);
      this.lastActivation.set(strategy.id, new Date());

      // 設置自動停用定時器
      if (strategy.maxDuration > 0) {
        setTimeout(() => {
          this.deactivate(strategy.id).catch((error) => {
            this.logger.error(`自動停用降級策略失敗: ${strategy.name}`, error);
          });
        }, strategy.maxDuration);
      }

      this.emit("strategyActivated", strategy, reason);
    } catch (error) {
      this.logger.error(`激活降級策略失敗: ${strategy.name}`, error);
      throw error;
    }
  }

  /**
   * 停用降級策略
   */
  public async deactivate(levelOrStrategyId: DegradationLevel | string): Promise<void> {
    let strategyId: string;

    if (Object.values(DegradationLevel).includes(levelOrStrategyId as DegradationLevel)) {
      // 按級別查找活躍策略
      const activeStrategy = Array.from(this.activeDegradations.values()).find(
        (deg) => deg.strategy.level === levelOrStrategyId
      );

      if (!activeStrategy) {
        this.logger.warn(`沒有找到級別 ${levelOrStrategyId} 的活躍降級策略`);
        return;
      }

      strategyId = activeStrategy.strategy.id;
    } else {
      strategyId = levelOrStrategyId;
    }

    const activeDegradation = this.activeDegradations.get(strategyId);
    if (!activeDegradation) {
      this.logger.warn(`降級策略未激活: ${strategyId}`);
      return;
    }

    this.logger.info(`停用降級策略: ${activeDegradation.strategy.name}`, {
      strategyId,
      activeDuration: Date.now() - activeDegradation.activatedAt.getTime(),
    });

    try {
      // 移除降級效果
      await this.removeDegradationEffects(activeDegradation.strategy);

      // 移除活躍記錄
      this.activeDegradations.delete(strategyId);

      this.emit("strategyDeactivated", activeDegradation.strategy);
    } catch (error) {
      this.logger.error(`停用降級策略失敗: ${activeDegradation.strategy.name}`, error);
      throw error;
    }
  }

  /**
   * 添加自定義策略
   */
  public addStrategy(strategy: DegradationStrategyDefinition): void {
    this.strategies.set(strategy.id, strategy);
    this.logger.info(`添加降級策略: ${strategy.name}`, { strategyId: strategy.id });
  }

  /**
   * 移除策略
   */
  public removeStrategy(strategyId: string): boolean {
    // 如果策略正在使用，先停用
    if (this.activeDegradations.has(strategyId)) {
      this.deactivate(strategyId).catch((error) => {
        this.logger.error(`停用策略時發生錯誤: ${strategyId}`, error);
      });
    }

    const removed = this.strategies.delete(strategyId);
    if (removed) {
      this.logger.info(`移除降級策略: ${strategyId}`);
    }
    return removed;
  }

  /**
   * 獲取所有策略
   */
  public getStrategies(): DegradationStrategyDefinition[] {
    return Array.from(this.strategies.values());
  }

  /**
   * 獲取活躍降級
   */
  public getActiveDegradations(): ActiveDegradation[] {
    return Array.from(this.activeDegradations.values());
  }

  /**
   * 檢查策略觸發條件
   */
  public async checkTriggers(metrics: Record<string, any>): Promise<
    Array<{
      strategy: DegradationStrategyDefinition;
      shouldActivate: boolean;
      reason?: string;
    }>
  > {
    const results: Array<{
      strategy: DegradationStrategyDefinition;
      shouldActivate: boolean;
      reason?: string;
    }> = [];

    for (const strategy of this.strategies.values()) {
      if (!strategy.autoActivate) {
        continue;
      }

      // 檢查是否已經激活
      if (this.activeDegradations.has(strategy.id)) {
        continue;
      }

      // 檢查觸發條件
      const shouldActivate = this.evaluateTriggers(strategy, metrics);
      let reason: string | undefined;

      if (shouldActivate) {
        reason = `觸發條件滿足: ${strategy.triggers.map((t) => `${t.condition} ${t.operator} ${t.threshold}`).join(", ")}`;
      }

      results.push({
        strategy,
        shouldActivate,
        reason,
      });
    }

    return results;
  }

  /**
   * 初始化默認策略
   */
  private initializeDefaultStrategies(): void {
    const defaultStrategies: DegradationStrategyDefinition[] = [
      {
        id: "high-memory-usage",
        name: "高內存使用率降級",
        level: DegradationLevel.SERVICE,
        action: DegradationAction.LIMIT,
        description: "當內存使用率過高時限制服務功能",
        triggers: [{ condition: "memory", threshold: 0.8, operator: "gt" }],
        effects: [
          { target: "cache", action: "clear", parameters: { percentage: 50 } },
          { target: "concurrent_requests", action: "limit", parameters: { max: 10 } },
        ],
        priority: 5,
        autoActivate: true,
        maxDuration: 5 * 60 * 1000, // 5分鐘
        cooldown: 2 * 60 * 1000, // 2分鐘
      },
      {
        id: "high-cpu-usage",
        name: "高CPU使用率降級",
        level: DegradationLevel.SERVICE,
        action: DegradationAction.REDUCE_QUALITY,
        description: "當CPU使用率過高時降低服務質量",
        triggers: [{ condition: "cpu", threshold: 0.8, operator: "gt" }],
        effects: [
          { target: "processing_quality", action: "reduce", parameters: { level: "low" } },
          { target: "batch_size", action: "reduce", parameters: { factor: 0.5 } },
        ],
        priority: 4,
        autoActivate: true,
        maxDuration: 3 * 60 * 1000, // 3分鐘
        cooldown: 1 * 60 * 1000, // 1分鐘
      },
      {
        id: "high-error-rate",
        name: "高錯誤率降級",
        level: DegradationLevel.FUNCTION,
        action: DegradationAction.FALLBACK,
        description: "當錯誤率過高時使用回退方案",
        triggers: [{ condition: "errorRate", threshold: 0.1, operator: "gt" }],
        effects: [
          { target: "primary_service", action: "disable", parameters: {} },
          { target: "fallback_service", action: "enable", parameters: {} },
        ],
        priority: 8,
        autoActivate: true,
        maxDuration: 10 * 60 * 1000, // 10分鐘
        cooldown: 5 * 60 * 1000, // 5分鐘
      },
      {
        id: "slow-response-time",
        name: "慢響應時間降級",
        level: DegradationLevel.TOOL,
        action: DegradationAction.CACHE_ONLY,
        description: "當響應時間過慢時僅使用緩存",
        triggers: [{ condition: "averageResponseTime", threshold: 5000, operator: "gt" }],
        effects: [
          { target: "live_requests", action: "disable", parameters: {} },
          { target: "cache_service", action: "enable_only", parameters: {} },
        ],
        priority: 3,
        autoActivate: true,
        maxDuration: 2 * 60 * 1000, // 2分鐘
        cooldown: 30 * 1000, // 30秒
      },
      {
        id: "system-overload",
        name: "系統過載降級",
        level: DegradationLevel.SYSTEM,
        action: DegradationAction.DISABLE,
        description: "系統過載時禁用非核心功能",
        triggers: [
          { condition: "cpu", threshold: 0.95, operator: "gt" },
          { condition: "memory", threshold: 0.9, operator: "gt" },
        ],
        effects: [
          { target: "non_essential_services", action: "disable", parameters: {} },
          { target: "background_tasks", action: "pause", parameters: {} },
          { target: "logging", action: "reduce", parameters: { level: "error" } },
        ],
        priority: 10,
        autoActivate: true,
        maxDuration: 15 * 60 * 1000, // 15分鐘
        cooldown: 10 * 60 * 1000, // 10分鐘
      },
    ];

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.id, strategy);
    }
  }

  /**
   * 添加自定義策略
   */
  private addCustomStrategies(): void {
    for (const strategy of this.config.customStrategies) {
      this.strategies.set(strategy.id, strategy);
    }
  }

  /**
   * 按級別查找最佳策略
   */
  private findBestStrategyForLevel(
    level: DegradationLevel
  ): DegradationStrategyDefinition | undefined {
    return Array.from(this.strategies.values())
      .filter((s) => s.level === level)
      .sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * 獲取級別優先級
   */
  private getLevelPriority(level: DegradationLevel): number {
    const priorities = {
      [DegradationLevel.TOOL]: 1,
      [DegradationLevel.SERVICE]: 2,
      [DegradationLevel.FUNCTION]: 3,
      [DegradationLevel.SYSTEM]: 4,
    };
    return priorities[level] || 0;
  }

  /**
   * 評估觸發條件
   */
  private evaluateTriggers(
    strategy: DegradationStrategyDefinition,
    metrics: Record<string, any>
  ): boolean {
    for (const trigger of strategy.triggers) {
      const value = metrics[trigger.condition];
      if (value === undefined) {
        continue;
      }

      const satisfied = this.evaluateCondition(value, trigger.operator, trigger.threshold);
      if (!satisfied) {
        return false; // 所有條件都必須滿足
      }
    }

    return strategy.triggers.length > 0; // 至少有一個條件
  }

  /**
   * 評估單個條件
   */
  private evaluateCondition(value: any, operator: string, threshold: number): boolean {
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
   * 應用降級效果
   */
  private async applyDegradationEffects(strategy: DegradationStrategyDefinition): Promise<
    Array<{
      target: string;
      action: string;
      applied: boolean;
      error?: string;
    }>
  > {
    const results: Array<{
      target: string;
      action: string;
      applied: boolean;
      error?: string;
    }> = [];

    for (const effect of strategy.effects) {
      try {
        await this.applyEffect(effect.target, effect.action, effect.parameters);

        results.push({
          target: effect.target,
          action: effect.action,
          applied: true,
        });

        this.emit("effectApplied", effect.target, effect.action, true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push({
          target: effect.target,
          action: effect.action,
          applied: false,
          error: errorMessage,
        });

        this.emit("effectApplied", effect.target, effect.action, false);
        this.logger.error(`應用降級效果失敗`, {
          target: effect.target,
          action: effect.action,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * 移除降級效果
   */
  private async removeDegradationEffects(strategy: DegradationStrategyDefinition): Promise<void> {
    for (const effect of strategy.effects) {
      try {
        await this.removeEffect(effect.target, effect.action, effect.parameters);
      } catch (error) {
        this.logger.error(`移除降級效果失敗`, {
          target: effect.target,
          action: effect.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 應用單個效果
   */
  private async applyEffect(
    target: string,
    action: string,
    parameters: Record<string, any>
  ): Promise<void> {
    // 這裡是效果應用的具體實現
    // 在實際應用中，這些會調用相應的服務或組件

    this.logger.info(`應用降級效果`, { target, action, parameters });

    // 模擬效果應用
    switch (target) {
      case "cache":
        if (action === "clear") {
          // 清理緩存的邏輯
        }
        break;
      case "concurrent_requests":
        if (action === "limit") {
          // 限制並發請求的邏輯
        }
        break;
      case "processing_quality":
        if (action === "reduce") {
          // 降低處理質量的邏輯
        }
        break;
      default:
        this.logger.debug(`未知的降級目標: ${target}`);
    }
  }

  /**
   * 移除單個效果
   */
  private async removeEffect(
    target: string,
    action: string,
    parameters: Record<string, any>
  ): Promise<void> {
    this.logger.info(`移除降級效果`, { target, action, parameters });

    // 模擬效果移除
    switch (target) {
      case "cache":
        if (action === "clear") {
          // 恢復緩存設置
        }
        break;
      case "concurrent_requests":
        if (action === "limit") {
          // 恢復並發請求限制
        }
        break;
      case "processing_quality":
        if (action === "reduce") {
          // 恢復處理質量
        }
        break;
      default:
        this.logger.debug(`未知的降級目標: ${target}`);
    }
  }

  /**
   * 啟動自動檢查
   */
  private startAutoCheck(): void {
    if (this.checkTimer) {
      return;
    }

    this.checkTimer = setInterval(async () => {
      // 自動檢查邏輯可以在這裡實現
      // 目前只是記錄檢查事件
      this.emit("checkCompleted", []);
    }, this.config.checkInterval);
  }

  /**
   * 停止自動檢查
   */
  private stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof DegradationStrategyEvents>(
    event: K,
    listener: DegradationStrategyEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof DegradationStrategyEvents>(
    event: K,
    ...args: Parameters<DegradationStrategyEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
