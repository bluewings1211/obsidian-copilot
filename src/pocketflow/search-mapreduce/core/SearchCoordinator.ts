/**
 * 搜索協調器 - 負載均衡和資源管理
 */

import { EventEmitter } from "events";
import {
  LoadBalancingStrategy,
  SearchContext,
  SearchMapReduceConfig,
  SearchStrategy,
  StrategyMetrics,
} from "../types";

export class SearchCoordinator extends EventEmitter {
  private loadBalancer: LoadBalancingStrategy;
  private strategyMetrics: Map<string, StrategyMetrics> = new Map();
  private resourceLimits: Map<string, number> = new Map();
  private activeConnections: Map<string, number> = new Map();

  constructor(private config: SearchMapReduceConfig) {
    super();
    this.loadBalancer = this.createLoadBalancer();
    this.initializeResourceLimits();
  }

  /**
   * 初始化協調器
   */
  async initialize(): Promise<void> {
    // 初始化負載均衡器
    this.setupMetricsTracking();
    this.emit("initialized");
  }

  /**
   * 選擇最佳搜索策略
   */
  selectOptimalStrategies(
    context: SearchContext,
    availableStrategies: SearchStrategy[]
  ): SearchStrategy[] {
    // 過濾可用策略
    const applicableStrategies = this.filterApplicableStrategies(context, availableStrategies);

    // 檢查資源限制
    const resourceFilteredStrategies = this.filterByResourceLimits(applicableStrategies);

    // 使用負載均衡器選擇策略
    const selectedStrategies = this.loadBalancer.selectStrategy(
      context,
      resourceFilteredStrategies
    );

    // 更新連接計數
    this.updateActiveConnections(selectedStrategies);

    return selectedStrategies;
  }

  /**
   * 過濾適用的策略
   */
  private filterApplicableStrategies(
    context: SearchContext,
    strategies: SearchStrategy[]
  ): SearchStrategy[] {
    return strategies.filter((strategy) => {
      // 檢查策略是否驗證上下文
      if (!strategy.validateContext(context)) {
        return false;
      }

      // 檢查策略性能指標
      const metrics = this.strategyMetrics.get(strategy.name);
      if (metrics && metrics.errorRate > 0.5) {
        // 錯誤率過高的策略暫時不使用
        return false;
      }

      // 檢查策略能力
      const capabilities = strategy.getCapabilities();

      // 根據查詢特徵選擇合適的策略
      if (context.query.length < 10 && !capabilities.supportsKeywordSearch) {
        return false;
      }

      if (context.timeRange && !capabilities.supportsTimeFiltering) {
        return false;
      }

      if (context.filters && !capabilities.supportsMetadataFiltering) {
        return false;
      }

      return true;
    });
  }

  /**
   * 根據資源限制過濾策略
   */
  private filterByResourceLimits(strategies: SearchStrategy[]): SearchStrategy[] {
    return strategies.filter((strategy) => {
      const limit = this.resourceLimits.get(strategy.name) || Infinity;
      const active = this.activeConnections.get(strategy.name) || 0;

      return active < limit;
    });
  }

  /**
   * 更新活躍連接數
   */
  private updateActiveConnections(strategies: SearchStrategy[]): void {
    strategies.forEach((strategy) => {
      const current = this.activeConnections.get(strategy.name) || 0;
      this.activeConnections.set(strategy.name, current + 1);
    });
  }

  /**
   * 釋放策略連接
   */
  releaseStrategyConnection(strategyName: string): void {
    const current = this.activeConnections.get(strategyName) || 0;
    if (current > 0) {
      this.activeConnections.set(strategyName, current - 1);
    }
  }

  /**
   * 更新策略指標
   */
  updateStrategyMetrics(strategyName: string, metrics: StrategyMetrics): void {
    this.strategyMetrics.set(strategyName, metrics);
    this.loadBalancer.updateMetrics(strategyName, metrics);

    // 發送指標更新事件
    this.emit("metricsUpdated", { strategyName, metrics });

    // 檢查是否需要調整資源限制
    this.adjustResourceLimits(strategyName, metrics);
  }

  /**
   * 調整資源限制
   */
  private adjustResourceLimits(strategyName: string, metrics: StrategyMetrics): void {
    const currentLimit = this.resourceLimits.get(strategyName) || 10;

    // 根據性能指標動態調整限制
    if (metrics.errorRate > 0.3) {
      // 錯誤率高時減少資源分配
      const newLimit = Math.max(1, Math.floor(currentLimit * 0.8));
      this.resourceLimits.set(strategyName, newLimit);
    } else if (metrics.errorRate < 0.1 && metrics.throughput > 10) {
      // 性能良好時增加資源分配
      const newLimit = Math.min(50, Math.floor(currentLimit * 1.2));
      this.resourceLimits.set(strategyName, newLimit);
    }
  }

  /**
   * 獲取策略健康狀態
   */
  getStrategyHealth(): Record<
    string,
    {
      status: "healthy" | "degraded" | "unhealthy";
      metrics: StrategyMetrics;
      resourceUsage: number;
      resourceLimit: number;
    }
  > {
    const health: Record<string, any> = {};

    this.strategyMetrics.forEach((metrics, strategyName) => {
      const resourceUsage = this.activeConnections.get(strategyName) || 0;
      const resourceLimit = this.resourceLimits.get(strategyName) || 10;

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";

      if (metrics.errorRate > 0.5) {
        status = "unhealthy";
      } else if (metrics.errorRate > 0.2 || resourceUsage / resourceLimit > 0.9) {
        status = "degraded";
      }

      health[strategyName] = {
        status,
        metrics,
        resourceUsage,
        resourceLimit,
      };
    });

    return health;
  }

  /**
   * 創建負載均衡器
   */
  private createLoadBalancer(): LoadBalancingStrategy {
    return new RoundRobinLoadBalancer();
  }

  /**
   * 初始化資源限制
   */
  private initializeResourceLimits(): void {
    const defaultLimits = {
      vector: 20,
      keyword: 30,
      hybrid: 15,
      rerank: 5,
    };

    Object.entries(defaultLimits).forEach(([strategy, limit]) => {
      this.resourceLimits.set(strategy, limit);
      this.activeConnections.set(strategy, 0);
    });
  }

  /**
   * 設置指標追蹤
   */
  private setupMetricsTracking(): void {
    // 定期清理過期指標
    setInterval(() => {
      this.cleanupMetrics();
    }, 300000); // 5分鐘清理一次
  }

  /**
   * 清理過期指標
   */
  private cleanupMetrics(): void {
    // 重置錯誤率過高的策略指標
    this.strategyMetrics.forEach((metrics, strategyName) => {
      if (metrics.errorRate > 0.8) {
        // 重置指標，給策略一個恢復的機會
        const resetMetrics: StrategyMetrics = {
          ...metrics,
          errorRate: 0.1,
          successRate: 0.9,
        };
        this.strategyMetrics.set(strategyName, resetMetrics);
      }
    });
  }

  /**
   * 獲取負載分佈
   */
  getLoadDistribution(): Record<
    string,
    {
      activeConnections: number;
      resourceLimit: number;
      utilizationRate: number;
    }
  > {
    const distribution: Record<string, any> = {};

    this.resourceLimits.forEach((limit, strategyName) => {
      const active = this.activeConnections.get(strategyName) || 0;
      distribution[strategyName] = {
        activeConnections: active,
        resourceLimit: limit,
        utilizationRate: active / limit,
      };
    });

    return distribution;
  }

  /**
   * 強制重新平衡負載
   */
  rebalanceLoad(): void {
    // 重置所有連接計數
    this.activeConnections.forEach((_, strategyName) => {
      this.activeConnections.set(strategyName, 0);
    });

    this.emit("loadRebalanced");
  }

  /**
   * 關閉協調器
   */
  async shutdown(): Promise<void> {
    this.removeAllListeners();
  }
}

/**
 * 輪詢負載均衡器實現
 */
class RoundRobinLoadBalancer implements LoadBalancingStrategy {
  name = "round-robin";
  private currentIndex: number = 0;
  private strategyMetrics: Map<string, StrategyMetrics> = new Map();

  selectStrategy(context: SearchContext, availableStrategies: SearchStrategy[]): SearchStrategy[] {
    if (availableStrategies.length === 0) {
      return [];
    }

    // 根據上下文決定返回多少個策略
    const maxStrategies = this.determineMaxStrategies(context);
    const selectedCount = Math.min(maxStrategies, availableStrategies.length);

    // 根據優先級和性能指標排序
    const sortedStrategies = [...availableStrategies].sort((a, b) => {
      const aMetrics = this.strategyMetrics.get(a.name);
      const bMetrics = this.strategyMetrics.get(b.name);

      // 優先考慮成功率高的策略
      if (aMetrics && bMetrics) {
        return bMetrics.successRate - aMetrics.successRate;
      }

      // 其次考慮策略優先級
      return b.priority - a.priority;
    });

    // 選擇策略
    const selected: SearchStrategy[] = [];
    for (let i = 0; i < selectedCount; i++) {
      const index = (this.currentIndex + i) % sortedStrategies.length;
      selected.push(sortedStrategies[index]);
    }

    this.currentIndex = (this.currentIndex + selectedCount) % sortedStrategies.length;

    return selected;
  }

  updateMetrics(strategyName: string, metrics: StrategyMetrics): void {
    this.strategyMetrics.set(strategyName, metrics);
  }

  private determineMaxStrategies(context: SearchContext): number {
    // 根據查詢複雜度決定使用多少個策略
    let maxStrategies = 2; // 默認使用2個策略

    if (context.query.length > 100) {
      maxStrategies = 3; // 複雜查詢使用更多策略
    }

    if (context.timeRange || context.filters) {
      maxStrategies = Math.min(4, maxStrategies + 1); // 有過濾條件時增加策略
    }

    return maxStrategies;
  }
}
