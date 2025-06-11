/**
 * 搜索映射器 - 負責將搜索請求分解為並行任務
 */

import { v4 as uuidv4 } from "uuid";
import { SearchContext, SearchMapReduceConfig, SearchTask, StrategyConfig } from "../types";

export class SearchMapper {
  private strategies: StrategyConfig[];

  constructor(private config: SearchMapReduceConfig) {
    this.strategies = config.strategies.filter((strategy) => strategy.enabled);
  }

  /**
   * 創建搜索任務
   */
  async createSearchTasks(context: SearchContext): Promise<SearchTask[]> {
    const tasks: SearchTask[] = [];

    // 根據上下文選擇適合的策略
    const selectedStrategies = this.selectStrategies(context);

    for (const strategy of selectedStrategies) {
      const task: SearchTask = {
        id: uuidv4(),
        strategy: strategy.name,
        context: this.adaptContextForStrategy(context, strategy),
        priority: this.calculatePriority(strategy, context),
        timeout: strategy.timeout,
        retryCount: strategy.retries,
        dependencies: this.calculateDependencies(strategy, selectedStrategies),
        metadata: {
          strategyConfig: strategy.configuration,
          createdAt: Date.now(),
        },
      };

      tasks.push(task);
    }

    // 根據依賴關係排序任務
    return this.sortTasksByDependencies(tasks);
  }

  /**
   * 選擇適合的搜索策略
   */
  private selectStrategies(context: SearchContext): StrategyConfig[] {
    return this.strategies.filter((strategy) => {
      return this.isStrategyApplicable(strategy, context);
    });
  }

  /**
   * 檢查策略是否適用於給定上下文
   */
  private isStrategyApplicable(strategy: StrategyConfig, context: SearchContext): boolean {
    const config = strategy.configuration;

    // 檢查向量搜索策略的適用性
    if (strategy.name === "vector" && context.query.length < 10) {
      return false; // 短查詢可能不適合向量搜索
    }

    // 檢查關鍵字搜索策略的適用性
    if (strategy.name === "keyword" && !context.salientTerms?.length) {
      return false; // 沒有關鍵詞時跳過關鍵字搜索
    }

    // 檢查混合搜索策略的適用性
    if (strategy.name === "hybrid" && (!context.query || !context.salientTerms?.length)) {
      return false; // 混合搜索需要查詢和關鍵詞
    }

    // 檢查時間範圍過濾
    if (config.requiresTimeRange && !context.timeRange) {
      return false;
    }

    return true;
  }

  /**
   * 為特定策略調整上下文
   */
  private adaptContextForStrategy(context: SearchContext, strategy: StrategyConfig): SearchContext {
    const adaptedContext = { ...context };
    const config = strategy.configuration;

    // 根據策略調整參數
    switch (strategy.name) {
      case "vector":
        // 向量搜索可能需要更長的查詢文本
        if (config.enhanceQuery) {
          adaptedContext.query = this.enhanceQueryForVector(context.query);
        }
        break;

      case "keyword":
        // 關鍵字搜索專注於重要術語
        if (context.salientTerms?.length) {
          adaptedContext.salientTerms = this.filterRelevantTerms(context.salientTerms);
        }
        break;

      case "hybrid":
        // 混合搜索平衡查詢和關鍵詞
        adaptedContext.metadata = {
          ...adaptedContext.metadata,
          textWeight: config.textWeight || 0.5,
          vectorWeight: config.vectorWeight || 0.5,
        };
        break;
    }

    return adaptedContext;
  }

  /**
   * 計算任務優先級
   */
  private calculatePriority(strategy: StrategyConfig, context: SearchContext): number {
    let priority = strategy.weight;

    // 根據上下文調整優先級
    if (context.query.length > 100) {
      // 長查詢提高向量搜索優先級
      if (strategy.name === "vector") {
        priority += 10;
      }
    }

    if (context.salientTerms && context.salientTerms.length > 3) {
      // 多關鍵詞提高關鍵字搜索優先級
      if (strategy.name === "keyword") {
        priority += 10;
      }
    }

    if (context.timeRange) {
      // 有時間範圍時提高混合搜索優先級
      if (strategy.name === "hybrid") {
        priority += 5;
      }
    }

    return Math.max(0, Math.min(100, priority)); // 限制在 0-100 範圍內
  }

  /**
   * 計算任務依賴關係
   */
  private calculateDependencies(
    strategy: StrategyConfig,
    allStrategies: StrategyConfig[]
  ): string[] {
    const dependencies: string[] = [];

    // 某些策略可能依賴其他策略的結果
    if (strategy.name === "rerank") {
      // 重排序策略依賴其他搜索策略
      const baseStrategies = allStrategies.filter(
        (s) => s.name !== "rerank" && s.name !== strategy.name
      );
      dependencies.push(...baseStrategies.map((s) => s.name));
    }

    return dependencies;
  }

  /**
   * 根據依賴關係排序任務
   */
  private sortTasksByDependencies(tasks: SearchTask[]): SearchTask[] {
    const sorted: SearchTask[] = [];
    const remaining = [...tasks];

    while (remaining.length > 0) {
      const independentTasks = remaining.filter(
        (task) =>
          !task.dependencies?.length ||
          task.dependencies.every((dep) => sorted.some((sortedTask) => sortedTask.strategy === dep))
      );

      if (independentTasks.length === 0) {
        // 如果沒有獨立任務，說明有循環依賴，打破循環
        const taskWithLeastDeps = remaining.reduce((min, task) =>
          (task.dependencies?.length || 0) < (min.dependencies?.length || 0) ? task : min
        );
        independentTasks.push(taskWithLeastDeps);
      }

      // 按優先級排序獨立任務
      independentTasks.sort((a, b) => b.priority - a.priority);

      sorted.push(...independentTasks);

      // 從剩餘任務中移除已排序的任務
      independentTasks.forEach((task) => {
        const index = remaining.findIndex((t) => t.id === task.id);
        if (index !== -1) {
          remaining.splice(index, 1);
        }
      });
    }

    return sorted;
  }

  /**
   * 為向量搜索增強查詢
   */
  private enhanceQueryForVector(query: string): string {
    // 可以添加同義詞、擴展術語等
    if (query.length < 20) {
      return `Please provide information about: ${query}`;
    }
    return query;
  }

  /**
   * 過濾相關術語
   */
  private filterRelevantTerms(terms: string[]): string[] {
    // 移除停用詞、短詞等
    return terms.filter((term) => term.length > 2 && !this.isStopWord(term));
  }

  /**
   * 檢查是否為停用詞
   */
  private isStopWord(term: string): boolean {
    const stopWords = ["the", "is", "at", "which", "on", "and", "or", "but"];
    return stopWords.includes(term.toLowerCase());
  }

  /**
   * 獲取可用策略
   */
  getAvailableStrategies(): StrategyConfig[] {
    return [...this.strategies];
  }

  /**
   * 添加新策略
   */
  addStrategy(strategy: StrategyConfig): void {
    if (!this.strategies.find((s) => s.name === strategy.name)) {
      this.strategies.push(strategy);
    }
  }

  /**
   * 移除策略
   */
  removeStrategy(strategyName: string): void {
    const index = this.strategies.findIndex((s) => s.name === strategyName);
    if (index !== -1) {
      this.strategies.splice(index, 1);
    }
  }

  /**
   * 更新策略配置
   */
  updateStrategy(strategyName: string, updates: Partial<StrategyConfig>): void {
    const strategy = this.strategies.find((s) => s.name === strategyName);
    if (strategy) {
      Object.assign(strategy, updates);
    }
  }
}
