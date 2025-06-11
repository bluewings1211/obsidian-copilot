/**
 * 關鍵字搜索性能監控器
 */

import {
  MonitoringConfig,
  KeywordSearchMetrics,
  KeywordSearchRequest,
  KeywordSearchResult,
} from "../types";

interface SearchEvent {
  searchId: string;
  request: KeywordSearchRequest;
  startTime: number;
  endTime?: number;
  result?: KeywordSearchResult;
  error?: any;
  stages: Map<string, { startTime: number; endTime?: number; duration?: number }>;
}

interface IndexPerformanceStats {
  indexName: string;
  searchCount: number;
  totalSearchTime: number;
  averageLatency: number;
  errorCount: number;
  lastSearchTime: number;
}

export class KeywordPerformanceMonitor {
  private config: MonitoringConfig;
  private isInitialized = false;
  private activeSearches = new Map<string, SearchEvent>();
  private completedSearches: SearchEvent[] = [];
  private indexPerformance = new Map<string, IndexPerformanceStats>();
  private metrics: KeywordSearchMetrics;
  private alertCallbacks = new Set<(alert: any) => void>();

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * 初始化監控器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // 啟動定期清理和統計更新
    this.startPeriodicTasks();

    this.isInitialized = true;
  }

  /**
   * 記錄搜索開始
   */
  recordSearchStart(searchId: string, request: KeywordSearchRequest): void {
    if (!this.config.enableMetrics) return;

    const searchEvent: SearchEvent = {
      searchId,
      request: this.sanitizeRequest(request),
      startTime: Date.now(),
      stages: new Map(),
    };

    this.activeSearches.set(searchId, searchEvent);
    this.metrics.searchRequests++;
  }

  /**
   * 記錄搜索階段開始
   */
  recordStageStart(searchId: string, stageName: string): void {
    if (!this.config.enableMetrics) return;

    const searchEvent = this.activeSearches.get(searchId);
    if (searchEvent) {
      searchEvent.stages.set(stageName, { startTime: Date.now() });
    }
  }

  /**
   * 記錄搜索階段結束
   */
  recordStageEnd(searchId: string, stageName: string): void {
    if (!this.config.enableMetrics) return;

    const searchEvent = this.activeSearches.get(searchId);
    if (searchEvent) {
      const stage = searchEvent.stages.get(stageName);
      if (stage) {
        stage.endTime = Date.now();
        stage.duration = stage.endTime - stage.startTime;
      }
    }
  }

  /**
   * 記錄查詢解析時間
   */
  recordQueryParseTime(searchId: string, parseTime: number): void {
    if (!this.config.enableMetrics) return;

    // 可以添加到階段記錄或單獨統計
    this.recordStageStart(searchId, "query_parse");
    setTimeout(() => {
      this.recordStageEnd(searchId, "query_parse");
    }, parseTime);
  }

  /**
   * 記錄搜索完成
   */
  recordSearchCompletion(searchId: string, result: KeywordSearchResult, totalTime: number): void {
    if (!this.config.enableMetrics) return;

    const searchEvent = this.activeSearches.get(searchId);
    if (searchEvent) {
      searchEvent.endTime = Date.now();
      searchEvent.result = result;

      // 移動到完成列表
      this.activeSearches.delete(searchId);
      this.completedSearches.push(searchEvent);

      // 更新指標
      this.updateMetricsOnCompletion(searchEvent, totalTime);

      // 檢查警報條件
      this.checkAlerts(searchEvent, totalTime);

      // 限制完成搜索的歷史記錄大小
      if (this.completedSearches.length > 10000) {
        this.completedSearches = this.completedSearches.slice(-5000);
      }
    }
  }

  /**
   * 記錄搜索錯誤
   */
  recordSearchError(searchId: string, error: any, totalTime: number): void {
    if (!this.config.enableMetrics) return;

    const searchEvent = this.activeSearches.get(searchId);
    if (searchEvent) {
      searchEvent.endTime = Date.now();
      searchEvent.error = error;

      // 移動到完成列表
      this.activeSearches.delete(searchId);
      this.completedSearches.push(searchEvent);

      // 更新錯誤指標
      this.metrics.failedSearches++;
      this.updateErrorDistribution(error);

      // 檢查錯誤率警報
      this.checkErrorRateAlert();
    }
  }

  /**
   * 記錄事件
   */
  recordEvent(eventType: string, data: any): void {
    if (!this.config.enableMetrics) return;

    // 記錄特殊事件（如引擎初始化、索引重建等）
    if (this.config.enableQueryLogging) {
      console.log(`[KeywordSearch] ${eventType}:`, data);
    }
  }

  /**
   * 更新完成時的指標
   */
  private updateMetricsOnCompletion(searchEvent: SearchEvent, totalTime: number): void {
    this.metrics.successfulSearches++;

    // 更新延遲統計
    this.updateLatencyMetrics(totalTime);

    // 更新索引利用率
    if (searchEvent.result?.metadata.indexesSearched) {
      searchEvent.result.metadata.indexesSearched.forEach((indexName) => {
        this.updateIndexPerformance(indexName, totalTime, false);
      });
    }

    // 更新緩存命中率
    if (searchEvent.result?.metadata.cacheHit) {
      // 根據實際緩存命中情況更新
    }

    // 更新查詢複雜度分佈
    this.updateQueryComplexityDistribution(searchEvent);

    // 更新熱門查詢
    this.updateTopQueries(searchEvent);
  }

  /**
   * 更新延遲指標
   */
  private updateLatencyMetrics(latency: number): void {
    // 計算平均延遲
    const totalSearches = this.metrics.successfulSearches + this.metrics.failedSearches;
    if (totalSearches > 0) {
      this.metrics.averageLatency =
        (this.metrics.averageLatency * (totalSearches - 1) + latency) / totalSearches;
    }

    // 更新百分位數（簡化實現）
    const recentLatencies = this.getRecentLatencies();
    recentLatencies.push(latency);
    recentLatencies.sort((a, b) => a - b);

    const p95Index = Math.floor(recentLatencies.length * 0.95);
    const p99Index = Math.floor(recentLatencies.length * 0.99);

    this.metrics.p95Latency = recentLatencies[p95Index] || latency;
    this.metrics.p99Latency = recentLatencies[p99Index] || latency;
  }

  /**
   * 獲取最近的延遲數據
   */
  private getRecentLatencies(): number[] {
    const recentCount = Math.min(1000, this.completedSearches.length);
    return this.completedSearches
      .slice(-recentCount)
      .filter((search) => search.result && search.endTime)
      .map((search) => search.endTime! - search.startTime);
  }

  /**
   * 更新索引性能
   */
  private updateIndexPerformance(indexName: string, searchTime: number, isError: boolean): void {
    let stats = this.indexPerformance.get(indexName);

    if (!stats) {
      stats = {
        indexName,
        searchCount: 0,
        totalSearchTime: 0,
        averageLatency: 0,
        errorCount: 0,
        lastSearchTime: Date.now(),
      };
      this.indexPerformance.set(indexName, stats);
    }

    stats.searchCount++;
    stats.lastSearchTime = Date.now();

    if (isError) {
      stats.errorCount++;
    } else {
      stats.totalSearchTime += searchTime;
      stats.averageLatency = stats.totalSearchTime / (stats.searchCount - stats.errorCount);
    }

    // 更新指標中的索引利用率
    this.metrics.indexUtilization.set(indexName, stats.searchCount);
  }

  /**
   * 更新查詢複雜度分佈
   */
  private updateQueryComplexityDistribution(searchEvent: SearchEvent): void {
    // 簡化的複雜度分類
    const queryLength = searchEvent.request.query.length;
    let complexity: string;

    if (queryLength < 20) {
      complexity = "simple";
    } else if (queryLength < 50) {
      complexity = "medium";
    } else {
      complexity = "complex";
    }

    const current = this.metrics.queryComplexityDistribution.get(complexity) || 0;
    this.metrics.queryComplexityDistribution.set(complexity, current + 1);
  }

  /**
   * 更新熱門查詢
   */
  private updateTopQueries(searchEvent: SearchEvent): void {
    const query = searchEvent.request.query;
    const searchTime = searchEvent.endTime! - searchEvent.startTime;

    // 查找現有查詢記錄
    let queryRecord = this.metrics.topQueries.find((q) => q.query === query);

    if (queryRecord) {
      queryRecord.count++;
      queryRecord.avgLatency =
        (queryRecord.avgLatency * (queryRecord.count - 1) + searchTime) / queryRecord.count;
    } else {
      queryRecord = {
        query,
        count: 1,
        avgLatency: searchTime,
      };
      this.metrics.topQueries.push(queryRecord);
    }

    // 保持熱門查詢列表大小
    this.metrics.topQueries.sort((a, b) => b.count - a.count);
    if (this.metrics.topQueries.length > 100) {
      this.metrics.topQueries = this.metrics.topQueries.slice(0, 50);
    }
  }

  /**
   * 更新錯誤分佈
   */
  private updateErrorDistribution(error: any): void {
    const errorType = error?.code || error?.name || "UNKNOWN_ERROR";
    const current = this.metrics.errorDistribution.get(errorType) || 0;
    this.metrics.errorDistribution.set(errorType, current + 1);
  }

  /**
   * 檢查警報條件
   */
  private checkAlerts(searchEvent: SearchEvent, totalTime: number): void {
    if (!this.config.alertThresholds) return;

    const thresholds = this.config.alertThresholds;

    // 延遲警報
    if (totalTime > thresholds.maxLatency) {
      this.triggerAlert({
        type: "high_latency",
        message: `Search latency ${totalTime}ms exceeds threshold ${thresholds.maxLatency}ms`,
        searchId: searchEvent.searchId,
        severity: "warning",
        timestamp: Date.now(),
      });
    }

    // 成功率警報
    const successRate = this.getSuccessRate();
    if (successRate < thresholds.minSuccessRate) {
      this.triggerAlert({
        type: "low_success_rate",
        message: `Success rate ${(successRate * 100).toFixed(2)}% below threshold ${(thresholds.minSuccessRate * 100).toFixed(2)}%`,
        severity: "critical",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 檢查錯誤率警報
   */
  private checkErrorRateAlert(): void {
    if (!this.config.alertThresholds) return;

    const errorRate = this.getErrorRate();
    if (errorRate > this.config.alertThresholds.maxErrorRate) {
      this.triggerAlert({
        type: "high_error_rate",
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.alertThresholds.maxErrorRate * 100).toFixed(2)}%`,
        severity: "critical",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 觸發警報
   */
  private triggerAlert(alert: any): void {
    console.warn(`[KeywordSearch Alert] ${alert.type}: ${alert.message}`);

    // 通知訂閱者
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(alert);
      } catch (error) {
        console.error("Error in alert callback:", error);
      }
    });
  }

  /**
   * 計算成功率
   */
  private getSuccessRate(): number {
    const total = this.metrics.successfulSearches + this.metrics.failedSearches;
    return total > 0 ? this.metrics.successfulSearches / total : 1;
  }

  /**
   * 計算錯誤率
   */
  private getErrorRate(): number {
    const total = this.metrics.successfulSearches + this.metrics.failedSearches;
    return total > 0 ? this.metrics.failedSearches / total : 0;
  }

  /**
   * 清理請求中的敏感信息
   */
  private sanitizeRequest(request: KeywordSearchRequest): KeywordSearchRequest {
    return {
      query: request.query,
      options: request.options,
      context: request.context
        ? {
            ...request.context,
            userId: "[REDACTED]",
            sessionId: "[REDACTED]",
          }
        : undefined,
    };
  }

  /**
   * 初始化指標
   */
  private initializeMetrics(): KeywordSearchMetrics {
    return {
      searchRequests: 0,
      successfulSearches: 0,
      failedSearches: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      cacheHitRate: 0,
      indexUtilization: new Map(),
      queryComplexityDistribution: new Map(),
      topQueries: [],
      errorDistribution: new Map(),
      parallelTaskMetrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskTime: 0,
        maxConcurrentTasks: 0,
        taskQueueLength: 0,
        workerUtilization: 0,
      },
    };
  }

  /**
   * 啟動定期任務
   */
  private startPeriodicTasks(): void {
    // 定期計算緩存命中率
    setInterval(() => {
      this.updateCacheHitRate();
    }, 30000); // 每30秒更新一次

    // 定期清理舊數據
    setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // 每小時清理一次
  }

  /**
   * 更新緩存命中率
   */
  private updateCacheHitRate(): void {
    const recentSearches = this.completedSearches.slice(-1000);
    if (recentSearches.length === 0) return;

    const cacheHits = recentSearches.filter((search) => search.result?.metadata.cacheHit).length;

    this.metrics.cacheHitRate = cacheHits / recentSearches.length;
  }

  /**
   * 清理舊數據
   */
  private cleanupOldData(): void {
    const retentionTime = this.config.metricsRetentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionTime;

    // 清理舊的搜索記錄
    this.completedSearches = this.completedSearches.filter(
      (search) => search.startTime > cutoffTime
    );
  }

  /**
   * 獲取指標
   */
  async getMetrics(): Promise<KeywordSearchMetrics> {
    // 更新並行任務指標（如果有並行任務管理器的話）
    // this.updateParallelTaskMetrics();

    return { ...this.metrics };
  }

  /**
   * 獲取索引性能統計
   */
  getIndexPerformanceStats(indexName: string): IndexPerformanceStats | null {
    return this.indexPerformance.get(indexName) || null;
  }

  /**
   * 獲取所有索引性能統計
   */
  getAllIndexPerformanceStats(): Map<string, IndexPerformanceStats> {
    return new Map(this.indexPerformance);
  }

  /**
   * 訂閱警報
   */
  subscribeToAlerts(callback: (alert: any) => void): () => void {
    this.alertCallbacks.add(callback);

    return () => {
      this.alertCallbacks.delete(callback);
    };
  }

  /**
   * 生成性能報告
   */
  generatePerformanceReport(): any {
    const metrics = this.metrics;
    const successRate = this.getSuccessRate();
    const errorRate = this.getErrorRate();

    return {
      summary: {
        totalSearches: metrics.searchRequests,
        successRate: Math.round(successRate * 10000) / 100,
        errorRate: Math.round(errorRate * 10000) / 100,
        averageLatency: Math.round(metrics.averageLatency),
        p95Latency: Math.round(metrics.p95Latency),
        p99Latency: Math.round(metrics.p99Latency),
        cacheHitRate: Math.round(metrics.cacheHitRate * 10000) / 100,
      },
      indexPerformance: Array.from(this.indexPerformance.values()),
      topQueries: metrics.topQueries.slice(0, 10),
      errorDistribution: Object.fromEntries(metrics.errorDistribution),
      queryComplexityDistribution: Object.fromEntries(metrics.queryComplexityDistribution),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 重置指標
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.completedSearches = [];
    this.indexPerformance.clear();
  }

  /**
   * 關閉監控器
   */
  async shutdown(): Promise<void> {
    // 清理定期任務
    // 在實際實現中，需要保存定時器引用並清理它們

    // 清理資源
    this.activeSearches.clear();
    this.completedSearches = [];
    this.indexPerformance.clear();
    this.alertCallbacks.clear();

    this.isInitialized = false;
  }
}
