/**
 * 搜索監控器 - 性能監控和警報系統
 */

import { EventEmitter } from "events";
import { PerformanceMetrics, SearchEvent, SearchEventType, StrategyMetrics } from "../types";

export class SearchMonitor extends EventEmitter {
  private isEnabled: boolean;
  private events: SearchEvent[] = [];
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private alerts: Map<string, AlertConfig> = new Map();
  private thresholds: PerformanceThresholds;
  private metricsBuffer: SearchEvent[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(enabled: boolean = true) {
    super();
    this.isEnabled = enabled;
    this.thresholds = this.getDefaultThresholds();
    this.setupDefaultAlerts();

    if (this.isEnabled) {
      this.startMetricsCollection();
    }
  }

  /**
   * 初始化監控器
   */
  async initialize(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    // 設置定期指標刷新
    this.bufferFlushInterval = setInterval(() => {
      this.flushMetricsBuffer();
    }, 5000); // 每5秒刷新一次

    this.emit("initialized");
  }

  /**
   * 記錄搜索事件
   */
  recordEvent(event: SearchEvent): void {
    if (!this.isEnabled) {
      return;
    }

    // 添加到事件緩衝區
    this.metricsBuffer.push(event);

    // 添加到歷史記錄（限制數量）
    this.events.push(event);
    if (this.events.length > 1000) {
      this.events.shift(); // 移除最舊的事件
    }

    // 實時檢查警報
    this.checkAlerts(event);

    // 發送監控事件
    this.emit("eventRecorded", event);
  }

  /**
   * 獲取實時性能指標
   */
  getRealTimeMetrics(): {
    activeSearches: number;
    averageLatency: number;
    successRate: number;
    errorRate: number;
    throughput: number;
    recentEvents: SearchEvent[];
  } {
    const recentEvents = this.getRecentEvents(60000); // 最近1分鐘

    if (recentEvents.length === 0) {
      return {
        activeSearches: 0,
        averageLatency: 0,
        successRate: 1,
        errorRate: 0,
        throughput: 0,
        recentEvents: [],
      };
    }

    const completedSearches = recentEvents.filter(
      (e) => e.type === SearchEventType.SEARCH_COMPLETED
    );

    const failedSearches = recentEvents.filter((e) => e.type === SearchEventType.SEARCH_FAILED);

    const activeSearches =
      recentEvents.filter((e) => e.type === SearchEventType.SEARCH_STARTED).length -
      completedSearches.length -
      failedSearches.length;

    const totalSearches = completedSearches.length + failedSearches.length;
    const successRate = totalSearches > 0 ? completedSearches.length / totalSearches : 1;
    const errorRate = 1 - successRate;

    const averageLatency =
      completedSearches.length > 0
        ? completedSearches.reduce((sum, e) => sum + (e.data.executionTime || 0), 0) /
          completedSearches.length
        : 0;

    const throughput = totalSearches / 60; // searches per second (over 1 minute)

    return {
      activeSearches: Math.max(0, activeSearches),
      averageLatency,
      successRate,
      errorRate,
      throughput,
      recentEvents: recentEvents.slice(-10), // 最近10個事件
    };
  }

  /**
   * 獲取策略性能統計
   */
  getStrategyMetrics(): Record<string, StrategyMetrics> {
    const strategyStats: Record<string, StrategyMetrics> = {};
    const recentEvents = this.getRecentEvents(300000); // 最近5分鐘

    // 按策略分組事件
    const strategyEvents: Record<string, SearchEvent[]> = {};

    recentEvents.forEach((event) => {
      const strategy = event.data.strategy;
      if (strategy) {
        if (!strategyEvents[strategy]) {
          strategyEvents[strategy] = [];
        }
        strategyEvents[strategy].push(event);
      }
    });

    // 計算每個策略的指標
    Object.entries(strategyEvents).forEach(([strategy, events]) => {
      const completedTasks = events.filter((e) => e.type === SearchEventType.TASK_COMPLETED);
      const failedTasks = events.filter((e) => e.type === SearchEventType.TASK_FAILED);
      const totalTasks = completedTasks.length + failedTasks.length;

      if (totalTasks === 0) {
        strategyStats[strategy] = {
          executionTime: 0,
          resultCount: 0,
          averageScore: 0,
          successRate: 1,
          errorRate: 0,
          throughput: 0,
        };
        return;
      }

      const totalExecutionTime = completedTasks.reduce(
        (sum, e) => sum + (e.data.executionTime || 0),
        0
      );

      const totalResults = completedTasks.reduce(
        (sum, e) => sum + (e.data.results?.length || 0),
        0
      );

      const totalScore = completedTasks.reduce((sum, e) => {
        const results = e.data.results || [];
        const avgScore =
          results.length > 0
            ? results.reduce((s: number, r: any) => s + (r.score || 0), 0) / results.length
            : 0;
        return sum + avgScore;
      }, 0);

      strategyStats[strategy] = {
        executionTime: totalExecutionTime,
        resultCount: totalResults,
        averageScore: completedTasks.length > 0 ? totalScore / completedTasks.length : 0,
        successRate: completedTasks.length / totalTasks,
        errorRate: failedTasks.length / totalTasks,
        throughput: totalTasks / 300, // tasks per second over 5 minutes
      };
    });

    return strategyStats;
  }

  /**
   * 獲取系統健康狀態
   */
  getSystemHealth(): {
    status: "healthy" | "degraded" | "critical";
    issues: string[];
    recommendations: string[];
    uptime: number;
    totalEvents: number;
  } {
    const metrics = this.getRealTimeMetrics();
    const issues: string[] = [];
    const recommendations: string[] = [];

    let status: "healthy" | "degraded" | "critical" = "healthy";

    // 檢查錯誤率
    if (metrics.errorRate > this.thresholds.maxErrorRate) {
      issues.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      status = "critical";
      recommendations.push("Check search strategy configurations and system resources");
    } else if (metrics.errorRate > this.thresholds.maxErrorRate * 0.5) {
      issues.push(`Elevated error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      status = "degraded";
      recommendations.push("Monitor error patterns and consider reducing load");
    }

    // 檢查延遲
    if (metrics.averageLatency > this.thresholds.maxLatency) {
      issues.push(`High latency: ${metrics.averageLatency.toFixed(0)}ms`);
      status = status === "critical" ? "critical" : "degraded";
      recommendations.push("Consider optimizing search strategies or increasing resources");
    }

    // 檢查吞吐量
    if (metrics.throughput < this.thresholds.minThroughput) {
      issues.push(`Low throughput: ${metrics.throughput.toFixed(2)} searches/sec`);
      status = status === "critical" ? "critical" : "degraded";
      recommendations.push("Check system load and consider scaling");
    }

    // 檢查活躍搜索數量
    if (metrics.activeSearches > this.thresholds.maxActiveSearches) {
      issues.push(`Too many active searches: ${metrics.activeSearches}`);
      status = "critical";
      recommendations.push("Implement rate limiting or increase concurrency limits");
    }

    const uptime = this.events.length > 0 ? Date.now() - this.events[0].timestamp : 0;

    return {
      status,
      issues,
      recommendations,
      uptime,
      totalEvents: this.events.length,
    };
  }

  /**
   * 設置性能閾值
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    Object.assign(this.thresholds, thresholds);
  }

  /**
   * 添加自定義警報
   */
  addAlert(name: string, config: AlertConfig): void {
    this.alerts.set(name, config);
  }

  /**
   * 移除警報
   */
  removeAlert(name: string): void {
    this.alerts.delete(name);
  }

  /**
   * 獲取最近事件
   */
  private getRecentEvents(timeWindow: number): SearchEvent[] {
    const cutoff = Date.now() - timeWindow;
    return this.events.filter((event) => event.timestamp >= cutoff);
  }

  /**
   * 檢查警報條件
   */
  private checkAlerts(event: SearchEvent): void {
    this.alerts.forEach((config, name) => {
      if (this.shouldTriggerAlert(event, config)) {
        this.triggerAlert(name, config, event);
      }
    });
  }

  /**
   * 判斷是否應該觸發警報
   */
  private shouldTriggerAlert(event: SearchEvent, config: AlertConfig): boolean {
    // 檢查事件類型
    if (config.eventTypes && !config.eventTypes.includes(event.type)) {
      return false;
    }

    // 檢查條件
    return config.condition(event);
  }

  /**
   * 觸發警報
   */
  private triggerAlert(name: string, config: AlertConfig, event: SearchEvent): void {
    const alert = {
      name,
      message: config.message,
      severity: config.severity,
      timestamp: Date.now(),
      event,
      data: config.data,
    };

    this.emit("alert", alert);

    if (config.callback) {
      config.callback(alert);
    }
  }

  /**
   * 設置默認警報
   */
  private setupDefaultAlerts(): void {
    // 高錯誤率警報
    this.addAlert("high_error_rate", {
      eventTypes: [SearchEventType.SEARCH_FAILED],
      condition: () => {
        const metrics = this.getRealTimeMetrics();
        return metrics.errorRate > this.thresholds.maxErrorRate;
      },
      message: "Search error rate is too high",
      severity: "critical",
    });

    // 高延遲警報
    this.addAlert("high_latency", {
      eventTypes: [SearchEventType.SEARCH_COMPLETED],
      condition: (event) => {
        return (event.data.executionTime || 0) > this.thresholds.maxLatency;
      },
      message: "Search latency is too high",
      severity: "warning",
    });

    // 任務失敗警報
    this.addAlert("task_failures", {
      eventTypes: [SearchEventType.TASK_FAILED],
      condition: () => true,
      message: "Search task failed",
      severity: "error",
    });
  }

  /**
   * 獲取默認閾值
   */
  private getDefaultThresholds(): PerformanceThresholds {
    return {
      maxLatency: 10000, // 10秒
      maxErrorRate: 0.1, // 10%
      minThroughput: 0.1, // 0.1 searches/sec
      maxActiveSearches: 50, // 最多50個並發搜索
      maxMemoryUsage: 500 * 1024 * 1024, // 500MB
    };
  }

  /**
   * 開始指標收集
   */
  private startMetricsCollection(): void {
    // 設置定期性能檢查
    setInterval(() => {
      this.performHealthCheck();
    }, 30000); // 每30秒檢查一次
  }

  /**
   * 執行健康檢查
   */
  private performHealthCheck(): void {
    const health = this.getSystemHealth();

    if (health.status !== "healthy") {
      this.emit("healthCheck", health);
    }
  }

  /**
   * 刷新指標緩衝區
   */
  private flushMetricsBuffer(): void {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    // 處理緩衝區中的事件
    const batchedMetrics = this.processBatchedEvents(this.metricsBuffer);

    // 發送批處理指標
    this.emit("batchedMetrics", batchedMetrics);

    // 清空緩衝區
    this.metricsBuffer = [];
  }

  /**
   * 處理批處理事件
   */
  private processBatchedEvents(events: SearchEvent[]): any {
    const summary = {
      period: {
        start: events[0]?.timestamp || Date.now(),
        end: Date.now(),
        duration: 5000, // 5秒間隔
      },
      eventCounts: {} as Record<SearchEventType, number>,
      averageLatency: 0,
      errorRate: 0,
      throughput: 0,
    };

    // 統計事件類型
    events.forEach((event) => {
      summary.eventCounts[event.type] = (summary.eventCounts[event.type] || 0) + 1;
    });

    // 計算指標
    const completedEvents = events.filter((e) => e.type === SearchEventType.SEARCH_COMPLETED);
    const failedEvents = events.filter((e) => e.type === SearchEventType.SEARCH_FAILED);

    if (completedEvents.length > 0) {
      summary.averageLatency =
        completedEvents.reduce((sum, e) => sum + (e.data.executionTime || 0), 0) /
        completedEvents.length;
    }

    const totalSearches = completedEvents.length + failedEvents.length;
    if (totalSearches > 0) {
      summary.errorRate = failedEvents.length / totalSearches;
      summary.throughput = totalSearches / (summary.period.duration / 1000);
    }

    return summary;
  }

  /**
   * 獲取詳細統計報告
   */
  getDetailedReport(timeWindow: number = 3600000): DetailedReport {
    const events = this.getRecentEvents(timeWindow);
    const strategyMetrics = this.getStrategyMetrics();
    const systemHealth = this.getSystemHealth();
    const realTimeMetrics = this.getRealTimeMetrics();

    return {
      timeWindow,
      totalEvents: events.length,
      eventBreakdown: this.getEventBreakdown(events),
      strategyMetrics,
      systemHealth,
      realTimeMetrics,
      trends: this.calculateTrends(events),
      recommendations: this.generateRecommendations(strategyMetrics, systemHealth),
    };
  }

  /**
   * 獲取事件分解
   */
  private getEventBreakdown(events: SearchEvent[]): Record<SearchEventType, number> {
    const breakdown = {} as Record<SearchEventType, number>;

    events.forEach((event) => {
      breakdown[event.type] = (breakdown[event.type] || 0) + 1;
    });

    return breakdown;
  }

  /**
   * 計算趨勢
   */
  private calculateTrends(events: SearchEvent[]): {
    latencyTrend: "improving" | "stable" | "degrading";
    errorTrend: "improving" | "stable" | "degrading";
    throughputTrend: "improving" | "stable" | "degrading";
  } {
    // 簡化的趨勢計算
    // 實際實現會更複雜，使用移動平均等技術
    return {
      latencyTrend: "stable",
      errorTrend: "stable",
      throughputTrend: "stable",
    };
  }

  /**
   * 生成建議
   */
  private generateRecommendations(
    strategyMetrics: Record<string, StrategyMetrics>,
    systemHealth: any
  ): string[] {
    const recommendations: string[] = [];

    // 基於策略性能生成建議
    Object.entries(strategyMetrics).forEach(([strategy, metrics]) => {
      if (metrics.errorRate > 0.2) {
        recommendations.push(`Consider reviewing ${strategy} strategy configuration`);
      }

      if (metrics.averageScore < 0.3) {
        recommendations.push(`${strategy} strategy is producing low-quality results`);
      }
    });

    // 基於系統健康生成建議
    recommendations.push(...systemHealth.recommendations);

    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 關閉監控器
   */
  async shutdown(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // 刷新剩餘的指標
    this.flushMetricsBuffer();

    this.removeAllListeners();
  }
}

// 類型定義
interface PerformanceThresholds {
  maxLatency: number;
  maxErrorRate: number;
  minThroughput: number;
  maxActiveSearches: number;
  maxMemoryUsage: number;
}

interface AlertConfig {
  eventTypes?: SearchEventType[];
  condition: (event: SearchEvent) => boolean;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  callback?: (alert: any) => void;
  data?: any;
}

interface DetailedReport {
  timeWindow: number;
  totalEvents: number;
  eventBreakdown: Record<SearchEventType, number>;
  strategyMetrics: Record<string, StrategyMetrics>;
  systemHealth: any;
  realTimeMetrics: any;
  trends: any;
  recommendations: string[];
}
