/**
 * MapReduce 搜索引擎 - 核心協調器
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { FaultToleranceManager } from "../../fault-tolerance/core/FaultToleranceManager";
import {
  AggregatedSearchResult,
  PerformanceMetrics,
  SearchContext,
  SearchEvent,
  SearchEventType,
  SearchMapReduceConfig,
  SearchTaskResult,
  StrategyMetrics,
} from "../types";
import { ResultAggregator } from "../aggregation/ResultAggregator";
import { SearchMonitor } from "../monitoring/SearchMonitor";
import { SearchCoordinator } from "./SearchCoordinator";
import { SearchMapper } from "./SearchMapper";
import { SearchReducer } from "./SearchReducer";
import { TaskDispatcher } from "./TaskDispatcher";

export class SearchMapReduceEngine extends EventEmitter {
  private readonly mapper: SearchMapper;
  private readonly reducer: SearchReducer;
  private readonly coordinator: SearchCoordinator;
  private readonly dispatcher: TaskDispatcher;
  private readonly aggregator: ResultAggregator;
  private readonly monitor: SearchMonitor;
  private readonly faultTolerance: FaultToleranceManager;

  private isInitialized: boolean = false;
  private activeSearches: Map<string, Promise<AggregatedSearchResult>> = new Map();
  private performanceMetrics: PerformanceMetrics;

  constructor(private config: SearchMapReduceConfig) {
    super();

    this.mapper = new SearchMapper(config);
    this.reducer = new SearchReducer(config.aggregationConfig);
    this.coordinator = new SearchCoordinator(config);
    this.dispatcher = new TaskDispatcher(config);
    this.aggregator = new ResultAggregator(config.aggregationConfig);
    this.monitor = new SearchMonitor(config.monitoringEnabled);
    this.faultTolerance = new FaultToleranceManager();

    this.performanceMetrics = this.initializeMetrics();
    this.setupEventHandlers();
  }

  /**
   * 初始化搜索引擎
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await Promise.all([
        this.coordinator.initialize(),
        this.dispatcher.initialize(),
        this.monitor.initialize(),
        this.faultTolerance.start(),
      ]);

      this.isInitialized = true;
      this.emitEvent(SearchEventType.SEARCH_STARTED, {
        message: "MapReduce Search Engine initialized successfully",
      });
    } catch (error) {
      this.emitEvent(SearchEventType.SEARCH_FAILED, {
        error: error.message,
        phase: "initialization",
      });
      throw error;
    }
  }

  /**
   * 執行 MapReduce 搜索
   */
  async search(context: SearchContext): Promise<AggregatedSearchResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const searchId = uuidv4();
    const startTime = Date.now();

    try {
      // 檢查是否有相同的搜索正在進行
      const existingSearch = this.findSimilarActiveSearch(context);
      if (existingSearch) {
        return await existingSearch;
      }

      // 創建搜索 Promise 並加入活躍搜索列表
      const searchPromise = this.executeMapReduceSearch(searchId, context, startTime);
      this.activeSearches.set(searchId, searchPromise);

      // 執行搜索
      const result = await searchPromise;

      // 清理活躍搜索
      this.activeSearches.delete(searchId);

      return result;
    } catch (error) {
      this.activeSearches.delete(searchId);

      this.emitEvent(SearchEventType.SEARCH_FAILED, {
        searchId,
        error: error.message,
        context,
        executionTime: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * 執行核心 MapReduce 搜索邏輯
   */
  private async executeMapReduceSearch(
    searchId: string,
    context: SearchContext,
    startTime: number
  ): Promise<AggregatedSearchResult> {
    this.emitEvent(SearchEventType.SEARCH_STARTED, {
      searchId,
      context,
      timestamp: startTime,
    });

    // Map 階段：任務分發和並行執行
    const mapStartTime = Date.now();
    const tasks = await this.mapper.createSearchTasks(context);
    const taskResults = await this.dispatcher.dispatchTasks(tasks);
    const mapPhaseTime = Date.now() - mapStartTime;

    // Reduce 階段：結果聚合和排序
    const reduceStartTime = Date.now();
    const aggregatedResults = await this.reducer.aggregateResults(taskResults);
    const reducePhaseTime = Date.now() - reduceStartTime;

    // 最終處理：去重、標準化和重排序
    const finalResults = await this.aggregator.processResults(aggregatedResults, context);

    // 計算性能指標
    const totalExecutionTime = Date.now() - startTime;
    const performanceMetrics = this.calculatePerformanceMetrics(
      taskResults,
      totalExecutionTime,
      mapPhaseTime,
      reducePhaseTime
    );

    // 更新全局性能指標
    this.updateGlobalMetrics(performanceMetrics);

    const result: AggregatedSearchResult = {
      documents: finalResults.documents,
      totalResults: finalResults.totalResults,
      aggregationMetadata: {
        totalSearchTime: totalExecutionTime,
        strategies: tasks.map((task) => task.strategy),
        normalizedScores: finalResults.normalizedScores,
        deduplicated: finalResults.deduplicated,
        reranked: finalResults.reranked,
        searchId,
        mapPhaseTime,
        reducePhaseTime,
      },
      performanceMetrics,
    };

    this.emitEvent(SearchEventType.SEARCH_COMPLETED, {
      searchId,
      result,
      executionTime: totalExecutionTime,
    });

    return result;
  }

  /**
   * 尋找相似的活躍搜索
   */
  private findSimilarActiveSearch(context: SearchContext): Promise<AggregatedSearchResult> | null {
    // 簡單的相似性檢查 - 可以擴展為更複雜的邏輯
    for (const [,] of this.activeSearches) {
      // 這裡可以實現更複雜的上下文相似性比較
      // 暫時返回 null，表示不復用現有搜索
    }
    return null;
  }

  /**
   * 計算性能指標
   */
  private calculatePerformanceMetrics(
    taskResults: SearchTaskResult[],
    totalExecutionTime: number,
    mapPhaseTime: number,
    reducePhaseTime: number
  ): PerformanceMetrics {
    const successfulTasks = taskResults.filter((result) => result.success).length;
    const failedTasks = taskResults.length - successfulTasks;
    const averageTaskTime =
      taskResults.reduce((sum, result) => sum + result.executionTime, 0) / taskResults.length;
    const throughput = taskResults.length / (totalExecutionTime / 1000); // tasks per second

    const strategyPerformance: Record<string, StrategyMetrics> = {};

    // 按策略分組計算指標
    taskResults.forEach((result) => {
      if (!strategyPerformance[result.strategy]) {
        strategyPerformance[result.strategy] = {
          executionTime: 0,
          resultCount: 0,
          averageScore: 0,
          successRate: 0,
          errorRate: 0,
          throughput: 0,
        };
      }

      const metrics = strategyPerformance[result.strategy];
      metrics.executionTime += result.executionTime;
      metrics.resultCount += result.results.length;

      if (result.success) {
        const avgScore =
          result.results.reduce((sum, r) => sum + r.score, 0) / result.results.length;
        metrics.averageScore = (metrics.averageScore + avgScore) / 2;
      }
    });

    // 計算成功率和錯誤率
    Object.keys(strategyPerformance).forEach((strategy) => {
      const strategyResults = taskResults.filter((r) => r.strategy === strategy);
      const successCount = strategyResults.filter((r) => r.success).length;

      strategyPerformance[strategy].successRate = successCount / strategyResults.length;
      strategyPerformance[strategy].errorRate = 1 - strategyPerformance[strategy].successRate;
      strategyPerformance[strategy].throughput =
        strategyResults.length / (totalExecutionTime / 1000);
    });

    return {
      totalExecutionTime,
      mapPhaseTime,
      reducePhaseTime,
      parallelTasksCount: taskResults.length,
      successfulTasks,
      failedTasks,
      averageTaskTime,
      throughput,
      strategyPerformance,
    };
  }

  /**
   * 更新全局性能指標
   */
  private updateGlobalMetrics(metrics: PerformanceMetrics): void {
    // 更新累積指標
    this.performanceMetrics.totalExecutionTime += metrics.totalExecutionTime;
    this.performanceMetrics.mapPhaseTime += metrics.mapPhaseTime;
    this.performanceMetrics.reducePhaseTime += metrics.reducePhaseTime;
    this.performanceMetrics.parallelTasksCount += metrics.parallelTasksCount;
    this.performanceMetrics.successfulTasks += metrics.successfulTasks;
    this.performanceMetrics.failedTasks += metrics.failedTasks;

    // 重新計算平均值
    const totalSearches =
      this.performanceMetrics.successfulTasks + this.performanceMetrics.failedTasks;
    if (totalSearches > 0) {
      this.performanceMetrics.averageTaskTime =
        (this.performanceMetrics.averageTaskTime + metrics.averageTaskTime) / 2;
      this.performanceMetrics.throughput =
        this.performanceMetrics.parallelTasksCount /
        (this.performanceMetrics.totalExecutionTime / 1000);
    }

    // 更新策略性能指標
    Object.keys(metrics.strategyPerformance).forEach((strategy) => {
      if (!this.performanceMetrics.strategyPerformance[strategy]) {
        this.performanceMetrics.strategyPerformance[strategy] =
          metrics.strategyPerformance[strategy];
      } else {
        const globalMetrics = this.performanceMetrics.strategyPerformance[strategy];
        const newMetrics = metrics.strategyPerformance[strategy];

        globalMetrics.executionTime += newMetrics.executionTime;
        globalMetrics.resultCount += newMetrics.resultCount;
        globalMetrics.averageScore = (globalMetrics.averageScore + newMetrics.averageScore) / 2;
        globalMetrics.successRate = (globalMetrics.successRate + newMetrics.successRate) / 2;
        globalMetrics.errorRate = (globalMetrics.errorRate + newMetrics.errorRate) / 2;
        globalMetrics.throughput = (globalMetrics.throughput + newMetrics.throughput) / 2;
      }
    });

    this.emitEvent(SearchEventType.PERFORMANCE_UPDATE, {
      metrics: this.performanceMetrics,
    });
  }

  /**
   * 設置事件處理器
   */
  private setupEventHandlers(): void {
    this.dispatcher.on("taskCompleted", (result: SearchTaskResult) => {
      this.emitEvent(SearchEventType.TASK_COMPLETED, result);
    });

    this.dispatcher.on("taskFailed", (result: SearchTaskResult) => {
      this.emitEvent(SearchEventType.TASK_FAILED, result);
    });

    this.monitor.on("performanceAlert", (data: any) => {
      this.emit("performanceAlert", data);
    });
  }

  /**
   * 發送事件
   */
  private emitEvent(type: SearchEventType, data: Record<string, any>): void {
    const event: SearchEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    this.emit("searchEvent", event);

    if (this.config.monitoringEnabled) {
      this.monitor.recordEvent(event);
    }
  }

  /**
   * 初始化性能指標
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      totalExecutionTime: 0,
      mapPhaseTime: 0,
      reducePhaseTime: 0,
      parallelTasksCount: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0,
      throughput: 0,
      strategyPerformance: {},
    };
  }

  /**
   * 獲取當前性能指標
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * 重置性能指標
   */
  resetMetrics(): void {
    this.performanceMetrics = this.initializeMetrics();
  }

  /**
   * 獲取活躍搜索數量
   */
  getActiveSearchCount(): number {
    return this.activeSearches.size;
  }

  /**
   * 關閉搜索引擎
   */
  async shutdown(): Promise<void> {
    // 等待所有活躍搜索完成
    await Promise.allSettled(Array.from(this.activeSearches.values()));

    // 關閉各個組件
    await Promise.all([
      this.coordinator.shutdown(),
      this.dispatcher.shutdown(),
      this.monitor.shutdown(),
    ]);

    this.isInitialized = false;
    this.removeAllListeners();
  }
}
