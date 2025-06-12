/**
 * PocketFlow.js Search Aggregation System - Aggregation Monitor
 * 聚合監控器：監控聚合過程的性能和質量指標
 */

import {
  MonitoringConfig,
  AggregationMetrics,
  RankingPerformance,
  PersonalizationEffectiveness,
  SystemHealth,
  ResourceUsage,
  BiasMetrics,
} from "../types";

export interface MonitoringAlert {
  id: string;
  type: "performance" | "quality" | "error" | "bias" | "resource";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  timestamp: number;
  data: Record<string, any>;
  resolved: boolean;
}

export interface PerformanceSnapshot {
  timestamp: number;
  aggregationMetrics: AggregationMetrics;
  rankingPerformance: RankingPerformance;
  personalizationEffectiveness: PersonalizationEffectiveness;
  systemHealth: SystemHealth;
}

export interface QualityReport {
  period: string;
  totalAggregations: number;
  averageQuality: number;
  qualityDistribution: Record<string, number>;
  errorRate: number;
  userSatisfaction: number;
  recommendations: string[];
}

/**
 * 聚合監控器
 * 負責實時監控搜索聚合系統的性能、質量和健康狀況
 */
export class AggregationMonitor {
  private metrics: Map<string, PerformanceSnapshot[]> = new Map();
  private alerts: MonitoringAlert[] = [];
  private aggregationHistory: Map<string, any> = new Map();
  private qualityHistory: number[] = [];
  private performanceHistory: number[] = [];

  private monitoringInterval?: NodeJS.Timeout;
  private alertThresholds: Record<string, number>;

  constructor(private config: MonitoringConfig) {
    this.alertThresholds = {
      processingTime: 5000, // 5秒
      errorRate: 0.05, // 5%
      qualityScore: 0.3, // 30%以下認為低質量
      userSatisfaction: 0.6, // 60%以下需要關注
      memoryUsage: 0.8, // 80%內存使用率
      cpuUsage: 0.85, // 85% CPU使用率
    };

    if (this.config.enableRealTimeMonitoring) {
      this.startRealTimeMonitoring();
    }
  }

  /**
   * 記錄聚合過程
   */
  recordAggregation(aggregationId: string, result: any): void {
    try {
      // 存儲聚合歷史
      this.aggregationHistory.set(aggregationId, {
        ...result,
        recordedAt: Date.now(),
      });

      // 更新質量歷史
      if (result.metrics?.qualityDistribution) {
        const avgQuality = this.calculateAverageQuality(result.metrics.qualityDistribution);
        this.qualityHistory.push(avgQuality);
        this.limitHistorySize(this.qualityHistory);
      }

      // 更新性能歷史
      if (result.metadata?.processingTime) {
        this.performanceHistory.push(result.metadata.processingTime);
        this.limitHistorySize(this.performanceHistory);
      }

      // 檢查警報條件
      this.checkAlerts(result);

      // 生成性能快照
      if (this.config.enablePerformanceAnalytics) {
        this.capturePerformanceSnapshot(aggregationId, result);
      }
    } catch (error) {
      console.error("記錄聚合過程失敗:", error);
    }
  }

  /**
   * 記錄錯誤
   */
  recordError(aggregationId: string, error: Error): void {
    const errorAlert: MonitoringAlert = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "error",
      severity: "high",
      message: `聚合錯誤: ${error.message}`,
      timestamp: Date.now(),
      data: {
        aggregationId,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      },
      resolved: false,
    };

    this.alerts.push(errorAlert);
    this.limitAlertsSize();

    // 觸發警報處理
    this.handleAlert(errorAlert);
  }

  /**
   * 記錄緩存命中
   */
  recordCacheHit(aggregationId: string): void {
    // 更新緩存統計
    const cacheMetrics = this.getCacheMetrics();
    cacheMetrics.hits++;
    this.updateCacheMetrics(cacheMetrics);
  }

  /**
   * 獲取統計信息
   */
  getStats(): Record<string, any> {
    return {
      totalAggregations: this.aggregationHistory.size,
      averageQuality: this.calculateAverageFromHistory(this.qualityHistory),
      averageProcessingTime: this.calculateAverageFromHistory(this.performanceHistory),
      activeAlerts: this.alerts.filter((alert) => !alert.resolved).length,
      totalAlerts: this.alerts.length,
      errorRate: this.calculateErrorRate(),
      cacheMetrics: this.getCacheMetrics(),
      systemHealth: this.getSystemHealth(),
    };
  }

  /**
   * 生成質量報告
   */
  generateQualityReport(period: string = "last_24h"): QualityReport {
    const timeRange = this.getTimeRange(period);
    const relevantAggregations = Array.from(this.aggregationHistory.values()).filter(
      (agg) => agg.recordedAt >= timeRange.start && agg.recordedAt <= timeRange.end
    );

    const totalAggregations = relevantAggregations.length;
    const averageQuality =
      relevantAggregations.length > 0
        ? relevantAggregations.reduce(
            (sum, agg) =>
              sum + this.calculateAverageQuality(agg.metrics?.qualityDistribution || {}),
            0
          ) / relevantAggregations.length
        : 0;

    const qualityDistribution = this.calculateQualityDistribution(relevantAggregations);
    const errorRate = this.calculateErrorRateForPeriod(timeRange);
    const userSatisfaction = this.calculateUserSatisfaction(relevantAggregations);
    const recommendations = this.generateRecommendations(
      averageQuality,
      errorRate,
      userSatisfaction
    );

    return {
      period,
      totalAggregations,
      averageQuality,
      qualityDistribution,
      errorRate,
      userSatisfaction,
      recommendations,
    };
  }

  /**
   * 獲取警報
   */
  getAlerts(severity?: string, resolved?: boolean): MonitoringAlert[] {
    return this.alerts.filter((alert) => {
      if (severity && alert.severity !== severity) return false;
      if (resolved !== undefined && alert.resolved !== resolved) return false;
      return true;
    });
  }

  /**
   * 解決警報
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * 開始實時監控
   */
  private startRealTimeMonitoring(): void {
    const interval = this.config.reportingInterval || 60000; // 默認1分鐘

    this.monitoringInterval = setInterval(() => {
      this.performRealTimeChecks();
    }, interval);
  }

  /**
   * 執行實時檢查
   */
  private performRealTimeChecks(): void {
    try {
      // 檢查系統資源
      const resourceUsage = this.getResourceUsage();
      this.checkResourceAlerts(resourceUsage);

      // 檢查性能趨勢
      const performanceTrend = this.analyzePerformanceTrend();
      this.checkPerformanceAlerts(performanceTrend);

      // 檢查質量趨勢
      const qualityTrend = this.analyzeQualityTrend();
      this.checkQualityAlerts(qualityTrend);

      // 檢查偏差
      if (this.config.enableAlerts) {
        const biasMetrics = this.calculateBiasMetrics();
        this.checkBiasAlerts(biasMetrics);
      }
    } catch (error) {
      console.error("實時監控檢查失敗:", error);
    }
  }

  /**
   * 檢查警報條件
   */
  private checkAlerts(result: any): void {
    // 處理時間警報
    if (result.metadata?.processingTime > this.alertThresholds.processingTime) {
      this.createAlert(
        "performance",
        "medium",
        `聚合處理時間過長: ${result.metadata.processingTime}ms`
      );
    }

    // 質量警報
    if (result.metrics?.qualityDistribution) {
      const avgQuality = this.calculateAverageQuality(result.metrics.qualityDistribution);
      if (avgQuality < this.alertThresholds.qualityScore) {
        this.createAlert("quality", "high", `平均質量分數過低: ${avgQuality.toFixed(3)}`);
      }
    }

    // 用戶滿意度警報
    if (result.metrics?.userSatisfaction < this.alertThresholds.userSatisfaction) {
      this.createAlert(
        "quality",
        "medium",
        `用戶滿意度過低: ${result.metrics.userSatisfaction.toFixed(3)}`
      );
    }
  }

  /**
   * 創建警報
   */
  private createAlert(
    type: string,
    severity: string,
    message: string,
    data: Record<string, any> = {}
  ): void {
    const alert: MonitoringAlert = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      severity: severity as any,
      message,
      timestamp: Date.now(),
      data,
      resolved: false,
    };

    this.alerts.push(alert);
    this.limitAlertsSize();
    this.handleAlert(alert);
  }

  /**
   * 處理警報
   */
  private handleAlert(alert: MonitoringAlert): void {
    if (this.config.enableAlerts) {
      console.warn(`[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`);

      // 這裡可以添加其他警報處理邏輯，如發送通知等
    }
  }

  /**
   * 捕獲性能快照
   */
  private capturePerformanceSnapshot(aggregationId: string, result: any): void {
    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      aggregationMetrics: result.metrics || {},
      rankingPerformance: this.calculateRankingPerformance(result),
      personalizationEffectiveness: this.calculatePersonalizationEffectiveness(result),
      systemHealth: this.getSystemHealth(),
    };

    if (!this.metrics.has(aggregationId)) {
      this.metrics.set(aggregationId, []);
    }

    const snapshots = this.metrics.get(aggregationId)!;
    snapshots.push(snapshot);

    // 限制快照數量
    if (snapshots.length > 100) {
      snapshots.shift();
    }
  }

  /**
   * 計算平均質量
   */
  private calculateAverageQuality(qualityDistribution: Record<string, number>): number {
    const weights = { high: 1.0, medium: 0.6, low: 0.3, spam: 0.0 };
    let totalWeighted = 0;
    let totalCount = 0;

    for (const [quality, count] of Object.entries(qualityDistribution)) {
      const weight = weights[quality as keyof typeof weights] || 0.5;
      totalWeighted += weight * count;
      totalCount += count;
    }

    return totalCount > 0 ? totalWeighted / totalCount : 0;
  }

  /**
   * 計算錯誤率
   */
  private calculateErrorRate(): number {
    const totalOperations = this.aggregationHistory.size;
    const errorAlerts = this.alerts.filter((alert) => alert.type === "error").length;

    return totalOperations > 0 ? errorAlerts / totalOperations : 0;
  }

  /**
   * 獲取緩存指標
   */
  private getCacheMetrics(): { hits: number; misses: number; hitRate: number } {
    // 簡化實現，實際應用中應該有更詳細的緩存統計
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
    };
  }

  /**
   * 更新緩存指標
   */
  private updateCacheMetrics(metrics: any): void {
    // 實現緩存指標更新邏輯
  }

  /**
   * 獲取系統健康狀況
   */
  private getSystemHealth(): SystemHealth {
    const resourceUsage = this.getResourceUsage();
    const errorRate = this.calculateErrorRate();
    const avgResponseTime = this.calculateAverageFromHistory(this.performanceHistory);

    return {
      uptime: process.uptime() * 1000,
      responseTime: avgResponseTime,
      errorRate,
      resourceUsage,
      bottlenecks: this.identifyBottlenecks(),
    };
  }

  /**
   * 獲取資源使用情況
   */
  private getResourceUsage(): ResourceUsage {
    const memUsage = process.memoryUsage();

    return {
      cpu: 0, // 需要額外的 CPU 監控庫
      memory: memUsage.heapUsed / memUsage.heapTotal,
      network: 0, // 需要網絡監控
      storage: 0, // 需要存儲監控
    };
  }

  /**
   * 識別瓶頸
   */
  private identifyBottlenecks(): string[] {
    const bottlenecks: string[] = [];
    const resourceUsage = this.getResourceUsage();

    if (resourceUsage.memory > 0.8) {
      bottlenecks.push("memory");
    }

    if (resourceUsage.cpu > 0.85) {
      bottlenecks.push("cpu");
    }

    const avgProcessingTime = this.calculateAverageFromHistory(this.performanceHistory);
    if (avgProcessingTime > this.alertThresholds.processingTime) {
      bottlenecks.push("processing_speed");
    }

    return bottlenecks;
  }

  /**
   * 檢查資源警報
   */
  private checkResourceAlerts(resourceUsage: ResourceUsage): void {
    if (resourceUsage.memory > this.alertThresholds.memoryUsage) {
      this.createAlert(
        "resource",
        "high",
        `內存使用率過高: ${(resourceUsage.memory * 100).toFixed(1)}%`
      );
    }

    if (resourceUsage.cpu > this.alertThresholds.cpuUsage) {
      this.createAlert(
        "resource",
        "high",
        `CPU使用率過高: ${(resourceUsage.cpu * 100).toFixed(1)}%`
      );
    }
  }

  /**
   * 分析性能趨勢
   */
  private analyzePerformanceTrend(): {
    trend: "improving" | "stable" | "degrading";
    confidence: number;
  } {
    if (this.performanceHistory.length < 10) {
      return { trend: "stable", confidence: 0.3 };
    }

    const recent = this.performanceHistory.slice(-5);
    const older = this.performanceHistory.slice(-10, -5);

    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (change < -0.1) return { trend: "improving", confidence: 0.8 };
    if (change > 0.1) return { trend: "degrading", confidence: 0.8 };
    return { trend: "stable", confidence: 0.6 };
  }

  /**
   * 檢查性能警報
   */
  private checkPerformanceAlerts(trend: { trend: string; confidence: number }): void {
    if (trend.trend === "degrading" && trend.confidence > 0.7) {
      this.createAlert("performance", "medium", "性能趨勢惡化");
    }
  }

  /**
   * 分析質量趨勢
   */
  private analyzeQualityTrend(): {
    trend: "improving" | "stable" | "degrading";
    confidence: number;
  } {
    // 類似性能趨勢分析
    return { trend: "stable", confidence: 0.6 };
  }

  /**
   * 檢查質量警報
   */
  private checkQualityAlerts(trend: { trend: string; confidence: number }): void {
    if (trend.trend === "degrading" && trend.confidence > 0.7) {
      this.createAlert("quality", "medium", "質量趨勢惡化");
    }
  }

  /**
   * 計算偏差指標
   */
  private calculateBiasMetrics(): BiasMetrics {
    // 簡化實現
    return {
      sourceBias: 0.1,
      topicBias: 0.1,
      recencyBias: 0.1,
      popularityBias: 0.1,
    };
  }

  /**
   * 檢查偏差警報
   */
  private checkBiasAlerts(biasMetrics: BiasMetrics): void {
    const biasThreshold = 0.3;

    for (const [biasType, value] of Object.entries(biasMetrics)) {
      if (value > biasThreshold) {
        this.createAlert("bias", "medium", `${biasType}偏差過高: ${value.toFixed(3)}`);
      }
    }
  }

  // ==================== 輔助方法 ====================

  private calculateAverageFromHistory(history: number[]): number {
    return history.length > 0 ? history.reduce((sum, val) => sum + val, 0) / history.length : 0;
  }

  private limitHistorySize(history: number[], maxSize: number = 1000): void {
    while (history.length > maxSize) {
      history.shift();
    }
  }

  private limitAlertsSize(maxSize: number = 1000): void {
    while (this.alerts.length > maxSize) {
      this.alerts.shift();
    }
  }

  private getTimeRange(period: string): { start: number; end: number } {
    const now = Date.now();
    const ranges: Record<string, number> = {
      last_1h: 60 * 60 * 1000,
      last_24h: 24 * 60 * 60 * 1000,
      last_7d: 7 * 24 * 60 * 60 * 1000,
      last_30d: 30 * 24 * 60 * 60 * 1000,
    };

    const duration = ranges[period] || ranges["last_24h"];
    return { start: now - duration, end: now };
  }

  private calculateQualityDistribution(aggregations: any[]): Record<string, number> {
    const distribution = { high: 0, medium: 0, low: 0, spam: 0 };

    for (const agg of aggregations) {
      const quality = this.calculateAverageQuality(agg.metrics?.qualityDistribution || {});
      if (quality >= 0.8) distribution.high++;
      else if (quality >= 0.5) distribution.medium++;
      else if (quality >= 0.2) distribution.low++;
      else distribution.spam++;
    }

    return distribution;
  }

  private calculateErrorRateForPeriod(timeRange: { start: number; end: number }): number {
    const periodAlerts = this.alerts.filter(
      (alert) =>
        alert.type === "error" &&
        alert.timestamp >= timeRange.start &&
        alert.timestamp <= timeRange.end
    );

    const periodAggregations = Array.from(this.aggregationHistory.values()).filter(
      (agg) => agg.recordedAt >= timeRange.start && agg.recordedAt <= timeRange.end
    );

    return periodAggregations.length > 0 ? periodAlerts.length / periodAggregations.length : 0;
  }

  private calculateUserSatisfaction(aggregations: any[]): number {
    if (aggregations.length === 0) return 0;

    const totalSatisfaction = aggregations.reduce(
      (sum, agg) => sum + (agg.metrics?.userSatisfaction || 0.5),
      0
    );

    return totalSatisfaction / aggregations.length;
  }

  private generateRecommendations(
    quality: number,
    errorRate: number,
    satisfaction: number
  ): string[] {
    const recommendations: string[] = [];

    if (quality < 0.6) {
      recommendations.push("考慮調整質量過濾閾值");
      recommendations.push("檢查搜索源的質量配置");
    }

    if (errorRate > 0.05) {
      recommendations.push("調查錯誤模式，改進錯誤處理");
      recommendations.push("考慮增加重試機制");
    }

    if (satisfaction < 0.7) {
      recommendations.push("優化個性化算法");
      recommendations.push("改進排序策略");
    }

    return recommendations;
  }

  private calculateRankingPerformance(result: any): RankingPerformance {
    return {
      algorithmEfficiency: {},
      personalizedAccuracy: 0.7,
      diversityScore: 0.6,
      freshnessBias: 0.1,
      userEngagement: 0.8,
    };
  }

  private calculatePersonalizationEffectiveness(result: any): PersonalizationEffectiveness {
    return {
      hitRate: 0.7,
      satisfactionImprovement: 0.15,
      engagementIncrease: 0.2,
      adaptationSpeed: 0.8,
      bias: {
        sourceBias: 0.1,
        topicBias: 0.1,
        recencyBias: 0.1,
        popularityBias: 0.1,
      },
    };
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // 清理過期數據
    const maxAge = this.config.retentionPeriod || 7 * 24 * 60 * 60 * 1000; // 默認7天
    const cutoff = Date.now() - maxAge;

    // 清理聚合歷史
    for (const [id, agg] of this.aggregationHistory.entries()) {
      if (agg.recordedAt < cutoff) {
        this.aggregationHistory.delete(id);
      }
    }

    // 清理警報
    this.alerts = this.alerts.filter((alert) => alert.timestamp > cutoff);

    // 清理指標
    for (const [id, snapshots] of this.metrics.entries()) {
      const filteredSnapshots = snapshots.filter((snapshot) => snapshot.timestamp > cutoff);
      if (filteredSnapshots.length === 0) {
        this.metrics.delete(id);
      } else {
        this.metrics.set(id, filteredSnapshots);
      }
    }
  }
}
