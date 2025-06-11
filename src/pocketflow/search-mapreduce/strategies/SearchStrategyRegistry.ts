/**
 * 搜索策略註冊表 - 管理和註冊搜索策略
 */

import { SearchStrategy, StrategyCapabilities } from "../types";

export class SearchStrategyRegistry {
  private strategies: Map<string, SearchStrategy> = new Map();
  private initialized: boolean = false;

  /**
   * 初始化註冊表
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 動態導入和註冊默認策略
    await this.registerDefaultStrategies();
    this.initialized = true;
  }

  /**
   * 註冊默認策略
   */
  private async registerDefaultStrategies(): Promise<void> {
    try {
      // 動態導入策略類
      const { VectorSearchStrategy } = await import("./VectorSearchStrategy");
      const { KeywordSearchStrategy } = await import("./KeywordSearchStrategy");
      const { HybridSearchStrategy } = await import("./HybridSearchStrategy");

      // 註冊策略
      this.registerStrategy(new VectorSearchStrategy());
      this.registerStrategy(new KeywordSearchStrategy());
      this.registerStrategy(new HybridSearchStrategy());
    } catch (error) {
      console.warn("Failed to load some search strategies:", error);
      // 繼續運行，即使某些策略載入失敗
    }
  }

  /**
   * 註冊搜索策略
   */
  registerStrategy(strategy: SearchStrategy): void {
    if (this.strategies.has(strategy.name)) {
      console.warn(`Strategy ${strategy.name} is already registered. Overwriting.`);
    }

    this.strategies.set(strategy.name, strategy);
  }

  /**
   * 註銷搜索策略
   */
  unregisterStrategy(strategyName: string): boolean {
    return this.strategies.delete(strategyName);
  }

  /**
   * 獲取搜索策略
   */
  async getStrategy(strategyName: string): Promise<SearchStrategy | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.strategies.get(strategyName) || null;
  }

  /**
   * 獲取所有註冊的策略
   */
  async getAllStrategies(): Promise<SearchStrategy[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.strategies.values());
  }

  /**
   * 獲取策略列表
   */
  async getStrategyList(): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.strategies.keys());
  }

  /**
   * 檢查策略是否存在
   */
  hasStrategy(strategyName: string): boolean {
    return this.strategies.has(strategyName);
  }

  /**
   * 根據能力過濾策略
   */
  async getStrategiesByCapabilities(
    requiredCapabilities: Partial<StrategyCapabilities>
  ): Promise<SearchStrategy[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const strategies: SearchStrategy[] = [];

    for (const strategy of this.strategies.values()) {
      const capabilities = strategy.getCapabilities();

      // 檢查是否滿足所有要求的能力
      const meetsRequirements = Object.entries(requiredCapabilities).every(([key, value]) => {
        const capabilityKey = key as keyof StrategyCapabilities;
        return capabilities[capabilityKey] === value;
      });

      if (meetsRequirements) {
        strategies.push(strategy);
      }
    }

    return strategies;
  }

  /**
   * 獲取最佳策略（基於優先級）
   */
  async getBestStrategies(limit: number = 3): Promise<SearchStrategy[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const strategies = Array.from(this.strategies.values());

    // 按優先級排序
    strategies.sort((a, b) => b.priority - a.priority);

    return strategies.slice(0, limit);
  }

  /**
   * 根據超時要求獲取策略
   */
  async getStrategiesByTimeout(maxTimeout: number): Promise<SearchStrategy[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.strategies.values()).filter(
      (strategy) => strategy.timeout <= maxTimeout
    );
  }

  /**
   * 獲取策略統計信息
   */
  getRegistryStats(): {
    totalStrategies: number;
    strategiesByCapability: Record<string, number>;
    averageTimeout: number;
    priorityDistribution: Record<string, number>;
  } {
    const strategies = Array.from(this.strategies.values());
    const totalStrategies = strategies.length;

    // 統計能力分佈
    const strategiesByCapability: Record<string, number> = {
      vectorSearch: 0,
      keywordSearch: 0,
      hybridMode: 0,
      timeFiltering: 0,
      metadataFiltering: 0,
    };

    // 優先級分佈
    const priorityDistribution: Record<string, number> = {
      low: 0, // 0-33
      medium: 0, // 34-66
      high: 0, // 67-100
    };

    let totalTimeout = 0;

    strategies.forEach((strategy) => {
      const capabilities = strategy.getCapabilities();

      // 統計能力
      if (capabilities.supportsVectorSearch) strategiesByCapability.vectorSearch++;
      if (capabilities.supportsKeywordSearch) strategiesByCapability.keywordSearch++;
      if (capabilities.supportsHybridMode) strategiesByCapability.hybridMode++;
      if (capabilities.supportsTimeFiltering) strategiesByCapability.timeFiltering++;
      if (capabilities.supportsMetadataFiltering) strategiesByCapability.metadataFiltering++;

      // 統計優先級
      if (strategy.priority <= 33) {
        priorityDistribution.low++;
      } else if (strategy.priority <= 66) {
        priorityDistribution.medium++;
      } else {
        priorityDistribution.high++;
      }

      totalTimeout += strategy.timeout;
    });

    const averageTimeout = totalStrategies > 0 ? totalTimeout / totalStrategies : 0;

    return {
      totalStrategies,
      strategiesByCapability,
      averageTimeout,
      priorityDistribution,
    };
  }

  /**
   * 驗證所有註冊的策略
   */
  async validateStrategies(): Promise<{
    valid: string[];
    invalid: { name: string; error: string }[];
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const valid: string[] = [];
    const invalid: { name: string; error: string }[] = [];

    for (const [name, strategy] of this.strategies) {
      try {
        // 基本驗證
        if (!strategy.name || strategy.name !== name) {
          throw new Error("Strategy name mismatch");
        }

        if (
          typeof strategy.priority !== "number" ||
          strategy.priority < 0 ||
          strategy.priority > 100
        ) {
          throw new Error("Invalid priority value");
        }

        if (typeof strategy.timeout !== "number" || strategy.timeout <= 0) {
          throw new Error("Invalid timeout value");
        }

        // 檢查必需的方法
        if (typeof strategy.search !== "function") {
          throw new Error("Missing search method");
        }

        if (typeof strategy.validateContext !== "function") {
          throw new Error("Missing validateContext method");
        }

        if (typeof strategy.estimateExecutionTime !== "function") {
          throw new Error("Missing estimateExecutionTime method");
        }

        if (typeof strategy.getCapabilities !== "function") {
          throw new Error("Missing getCapabilities method");
        }

        // 驗證能力配置
        const capabilities = strategy.getCapabilities();
        if (!capabilities || typeof capabilities !== "object") {
          throw new Error("Invalid capabilities configuration");
        }

        valid.push(name);
      } catch (error) {
        invalid.push({
          name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { valid, invalid };
  }

  /**
   * 清理註冊表
   */
  clear(): void {
    this.strategies.clear();
    this.initialized = false;
  }

  /**
   * 重新載入策略
   */
  async reload(): Promise<void> {
    this.clear();
    await this.initialize();
  }

  /**
   * 獲取策略詳細信息
   */
  getStrategyDetails(strategyName: string): {
    name: string;
    priority: number;
    timeout: number;
    capabilities: StrategyCapabilities;
  } | null {
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      return null;
    }

    return {
      name: strategy.name,
      priority: strategy.priority,
      timeout: strategy.timeout,
      capabilities: strategy.getCapabilities(),
    };
  }

  /**
   * 批量註冊策略
   */
  registerStrategies(strategies: SearchStrategy[]): void {
    strategies.forEach((strategy) => {
      this.registerStrategy(strategy);
    });
  }

  /**
   * 按優先級獲取策略組
   */
  async getStrategyGroups(): Promise<{
    high: SearchStrategy[];
    medium: SearchStrategy[];
    low: SearchStrategy[];
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const strategies = Array.from(this.strategies.values());

    const groups = {
      high: strategies.filter((s) => s.priority > 66),
      medium: strategies.filter((s) => s.priority > 33 && s.priority <= 66),
      low: strategies.filter((s) => s.priority <= 33),
    };

    // 在每個組內按優先級排序
    Object.values(groups).forEach((group) => {
      group.sort((a, b) => b.priority - a.priority);
    });

    return groups;
  }
}
