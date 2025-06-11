/**
 * 向量搜索性能監控器
 */

import { EventEmitter } from "events";
import {
  VectorPerformanceMetrics,
  MonitoringConfig,
  OptimizationRecommendation,
  OptimizationType,
} from "../types";

export class VectorPerformanceMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private metrics: VectorPerformanceMetrics;
  private metricHistory: VectorPerformanceMetrics[] = [];
  private alertThresholds: Map<string, number> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private startTime: number = Date.now();

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
    this.metrics = this.createInitialMetrics();
    this.initializeAlertThresholds();
  }

  /**
   * 初始化性能監控器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 啟動實時監控
      if (this.config.enableRealTimeMetrics) {
        this.startRealTimeMonitoring();
      }

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 記錄搜索性能
   */
  recordSearchPerformance(data: {
    searchId: string;
    executionTime: number;
    resultCount: number;
    cacheHit: boolean;
    method: "parallel" | "distributed" | "direct";
    success: boolean;
  }): void {
    this.metrics.totalSearches++;

    // 更新延遲統計
    this.updateLatencyMetrics(data.executionTime);

    // 更新吞吐量
    this.updateThroughputMetrics();

    // 更新緩存命中率
    if (data.cacheHit) {
      this.updateCacheHitRate();
    }

    // 更新並行效率
    if (data.method === "parallel") {
      this.updateParallelEfficiency(data.executionTime, data.resultCount);
    }

    // 更新錯誤率
    if (!data.success) {
      this.updateErrorRate();
    }

    // 檢查警報條件
    this.checkAlertConditions();

    this.emit("search_recorded", {
      searchId: data.searchId,
      metrics: { ...this.metrics },
    });
  }

  /**
   * 記錄分片利用率
   */
  recordShardUtilization(shardId: string, utilization: number): void {
    this.metrics.shardUtilization[shardId] = utilization;

    this.emit("shard_utilization_updated", { shardId, utilization });
  }

  /**
   * 記錄內存使用
   */
  recordMemoryUsage(memoryUsage: number): void {
    this.metrics.memoryUsage = memoryUsage;

    // 檢查內存警報
    const memoryThreshold = this.alertThresholds.get("memory_usage") || 1000; // MB
    if (memoryUsage > memoryThreshold) {
      this.emit("memory_alert", { usage: memoryUsage, threshold: memoryThreshold });
    }
  }

  /**
   * 更新延遲指標
   */
  private updateLatencyMetrics(executionTime: number): void {
    // 更新平均延遲
    const totalTime =
      this.metrics.averageLatency * (this.metrics.totalSearches - 1) + executionTime;
    this.metrics.averageLatency = totalTime / this.metrics.totalSearches;

    // 更新 P95 和 P99（簡化實現）
    if (executionTime > this.metrics.p95Latency) {
      this.metrics.p95Latency = executionTime;
    }
    if (executionTime > this.metrics.p99Latency) {
      this.metrics.p99Latency = executionTime;
    }
  }

  /**
   * 更新吞吐量指標
   */
  private updateThroughputMetrics(): void {
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - this.startTime) / 1000;

    if (elapsedSeconds > 0) {
      this.metrics.throughput = this.metrics.totalSearches / elapsedSeconds;
    }
  }

  /**
   * 更新緩存命中率
   */
  private updateCacheHitRate(): void {
    // 簡化實現，實際應該維護更詳細的緩存統計
    this.metrics.cacheHitRate = Math.min(this.metrics.cacheHitRate + 0.01, 1.0);
  }

  /**
   * 更新並行效率
   */
  private updateParallelEfficiency(executionTime: number, resultCount: number): void {
    // 簡化的並行效率計算
    const baselineTime = resultCount * 10; // 假設基準時間
    const efficiency = Math.min(baselineTime / executionTime, 1.0);

    // 平滑更新效率
    this.metrics.parallelEfficiency = this.metrics.parallelEfficiency * 0.9 + efficiency * 0.1;
  }

  /**
   * 更新錯誤率
   */
  private updateErrorRate(): void {
    const errorCount = this.metrics.totalSearches * this.metrics.errorRate + 1;
    this.metrics.errorRate = errorCount / this.metrics.totalSearches;
  }

  /**
   * 檢查警報條件
   */
  private checkAlertConditions(): void {
    const thresholds = this.config.alertThresholds || {};

    // 檢查平均延遲
    if (thresholds.averageLatency && this.metrics.averageLatency > thresholds.averageLatency) {
      this.emit("latency_alert", {
        current: this.metrics.averageLatency,
        threshold: thresholds.averageLatency,
      });
    }

    // 檢查錯誤率
    if (thresholds.errorRate && this.metrics.errorRate > thresholds.errorRate) {
      this.emit("error_rate_alert", {
        current: this.metrics.errorRate,
        threshold: thresholds.errorRate,
      });
    }

    // 檢查吞吐量
    if (thresholds.throughput && this.metrics.throughput < thresholds.throughput) {
      this.emit("throughput_alert", {
        current: this.metrics.throughput,
        threshold: thresholds.throughput,
      });
    }
  }

  /**
   * 啟動實時監控
   */
  private startRealTimeMonitoring(): void {
    const interval = this.config.metricsCollectionInterval || 60000; // 1 minute

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.saveMetricsSnapshot();
      this.analyzePerformanceTrends();
    }, interval);
  }

  /**
   * 收集系統指標
   */
  private collectSystemMetrics(): void {
    // 收集內存使用情況
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.recordMemoryUsage(memUsage.heapUsed / 1024 / 1024); // MB
    }

    // 收集其他系統指標
    this.emit("system_metrics_collected", {
      timestamp: Date.now(),
      metrics: { ...this.metrics },
    });
  }

  /**
   * 保存指標快照
   */
  private saveMetricsSnapshot(): void {
    const snapshot = {
      ...this.metrics,
      timestamp: Date.now(),
    };

    this.metricHistory.push(snapshot);

    // 保持歷史記錄在合理範圍內
    if (this.metricHistory.length > 100) {
      this.metricHistory = this.metricHistory.slice(-80);
    }
  }

  /**
   * 分析性能趨勢
   */
  private analyzePerformanceTrends(): void {
    if (this.metricHistory.length < 5) {
      return;
    }

    const recent = this.metricHistory.slice(-5);
    const trends = this.calculateTrends(recent);

    this.emit("performance_trends_updated", { trends });

    // 檢測性能降級
    this.detectPerformanceDegradation(trends);
  }

  /**
   * 計算趨勢
   */
  private calculateTrends(
    snapshots: VectorPerformanceMetrics[]
  ): Record<string, "improving" | "degrading" | "stable"> {
    const trends: Record<string, "improving" | "degrading" | "stable"> = {};

    // 計算延遲趨勢
    const latencies = snapshots.map((s) => s.averageLatency);
    trends.latency = this.calculateTrend(latencies);

    // 計算吞吐量趨勢
    const throughputs = snapshots.map((s) => s.throughput);
    trends.throughput = this.calculateTrend(throughputs, true); // 反向，吞吐量增加是好事

    // 計算錯誤率趨勢
    const errorRates = snapshots.map((s) => s.errorRate);
    trends.errorRate = this.calculateTrend(errorRates);

    return trends;
  }

  /**
   * 計算單一指標趨勢
   */
  private calculateTrend(
    values: number[],
    reverse: boolean = false
  ): "improving" | "degrading" | "stable" {
    if (values.length < 3) return "stable";

    const first = values[0];
    const last = values[values.length - 1];
    const change = (last - first) / first;

    const threshold = 0.1; // 10% 變化閾值

    if (Math.abs(change) < threshold) {
      return "stable";
    }

    const isImproving = reverse ? change > 0 : change < 0;
    return isImproving ? "improving" : "degrading";
  }

  /**
   * 檢測性能降級
   */
  private detectPerformanceDegradation(
    trends: Record<string, "improving" | "degrading" | "stable">
  ): void {
    const degradingMetrics = Object.entries(trends)
      .filter(([_, trend]) => trend === "degrading")
      .map(([metric]) => metric);

    if (degradingMetrics.length > 0) {
      this.emit("performance_degradation_detected", {
        degradingMetrics,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 執行健康檢查
   */
  async performHealthCheck(): Promise<{
    status: "healthy" | "warning" | "critical";
    issues: string[];
    recommendations: OptimizationRecommendation[];
  }> {
    const issues: string[] = [];
    const recommendations: OptimizationRecommendation[] = [];

    // 檢查關鍵指標
    if (this.metrics.averageLatency > 5000) {
      // 5 seconds
      issues.push("High average latency detected");
      recommendations.push({
        type: OptimizationType.QUERY_OPTIMIZATION,
        description: "Consider optimizing query processing or adding more parallel workers",
        expectedImprovement: 0.3,
        implementationCost: 2,
        priority: 8,
      });
    }

    if (this.metrics.errorRate > 0.05) {
      // 5%
      issues.push("High error rate detected");
      recommendations.push({
        type: OptimizationType.RESOURCE_SCALING,
        description: "Scale up resources or improve error handling",
        expectedImprovement: 0.4,
        implementationCost: 3,
        priority: 9,
      });
    }

    if (this.metrics.cacheHitRate < 0.7) {
      // 70%
      issues.push("Low cache hit rate");
      recommendations.push({
        type: OptimizationType.CACHE_OPTIMIZATION,
        description: "Optimize cache size and eviction policies",
        expectedImprovement: 0.25,
        implementationCost: 1,
        priority: 6,
      });
    }

    if (this.metrics.parallelEfficiency < 0.6) {
      // 60%
      issues.push("Low parallel processing efficiency");
      recommendations.push({
        type: OptimizationType.MODEL_TUNING,
        description: "Tune parallel processing parameters and load balancing",
        expectedImprovement: 0.2,
        implementationCost: 2,
        priority: 7,
      });
    }

    // 確定整體健康狀態
    let status: "healthy" | "warning" | "critical";
    if (issues.length === 0) {
      status = "healthy";
    } else if (issues.length <= 2) {
      status = "warning";
    } else {
      status = "critical";
    }

    this.emit("health_check_completed", { status, issues, recommendations });

    return { status, issues, recommendations };
  }

  /**
   * 獲取當前指標
   */
  getMetrics(): VectorPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 獲取指標歷史
   */
  getMetricsHistory(hours?: number): VectorPerformanceMetrics[] {
    if (!hours) {
      return [...this.metricHistory];
    }

    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    return this.metricHistory.filter(
      (m) => (m as any).timestamp && (m as any).timestamp > cutoffTime
    );
  }

  /**
   * 生成性能報告
   */
  generatePerformanceReport(): {
    summary: Record<string, any>;
    trends: Record<string, any>;
    recommendations: OptimizationRecommendation[];
    alertHistory: Array<{ type: string; timestamp: number; data: any }>;
  } {
    const summary = {
      totalSearches: this.metrics.totalSearches,
      averageLatency: this.metrics.averageLatency,
      throughput: this.metrics.throughput,
      errorRate: this.metrics.errorRate,
      cacheHitRate: this.metrics.cacheHitRate,
      parallelEfficiency: this.metrics.parallelEfficiency,
      memoryUsage: this.metrics.memoryUsage,
    };

    const trends =
      this.metricHistory.length > 5 ? this.calculateTrends(this.metricHistory.slice(-10)) : {};

    const recommendations: OptimizationRecommendation[] = [];

    // 基於當前指標生成建議
    if (this.metrics.cacheHitRate < 0.8) {
      recommendations.push({
        type: OptimizationType.CACHE_OPTIMIZATION,
        description: "Increase cache size or improve cache strategy",
        expectedImprovement: 0.2,
        implementationCost: 1,
        priority: 7,
      });
    }

    if (Object.keys(this.metrics.shardUtilization).length > 1) {
      const utilizationValues = Object.values(this.metrics.shardUtilization);
      const maxUtil = Math.max(...utilizationValues);
      const minUtil = Math.min(...utilizationValues);

      if (maxUtil - minUtil > 0.3) {
        recommendations.push({
          type: OptimizationType.SHARD_REBALANCING,
          description: "Rebalance shard distribution to improve load distribution",
          expectedImprovement: 0.15,
          implementationCost: 2,
          priority: 6,
        });
      }
    }

    return {
      summary,
      trends,
      recommendations: recommendations.sort((a, b) => b.priority - a.priority),
      alertHistory: [], // TODO: 實現警報歷史記錄
    };
  }

  /**
   * 重置指標
   */
  resetMetrics(): void {
    this.metrics = this.createInitialMetrics();
    this.metricHistory = [];
    this.startTime = Date.now();

    this.emit("metrics_reset");
  }

  /**
   * 創建初始指標
   */
  private createInitialMetrics(): VectorPerformanceMetrics {
    return {
      totalSearches: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      throughput: 0,
      cacheHitRate: 0,
      parallelEfficiency: 0,
      shardUtilization: {},
      errorRate: 0,
      memoryUsage: 0,
    };
  }

  /**
   * 初始化警報閾值
   */
  private initializeAlertThresholds(): void {
    const thresholds = this.config.alertThresholds || {};

    this.alertThresholds.set("average_latency", thresholds.averageLatency || 3000);
    this.alertThresholds.set("error_rate", thresholds.errorRate || 0.1);
    this.alertThresholds.set("throughput", thresholds.throughput || 1);
    this.alertThresholds.set("memory_usage", thresholds.memoryUsage || 1000);
  }

  /**
   * 關閉性能監控器
   */
  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.metricHistory = [];
    this.alertThresholds.clear();
    this.isInitialized = false;

    this.emit("shutdown");
  }
}
