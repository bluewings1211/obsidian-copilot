import { EventEmitter } from "events";
import { PerformanceMetric, MonitoringConfig } from "./PerformanceMonitoringManager";

export interface AnomalyDetection {
  metric: string;
  value: number;
  expectedRange: { min: number; max: number };
  severity: "low" | "medium" | "high";
  confidence: number;
  timestamp: number;
  description: string;
}

export interface RealTimeStats {
  metric: string;
  currentValue: number;
  avgValue: number;
  minValue: number;
  maxValue: number;
  trend: "stable" | "increasing" | "decreasing";
  volatility: number;
  lastUpdated: number;
}

interface MetricWindow {
  values: number[];
  timestamps: number[];
  maxSize: number;
}

export class RealTimeAnalyzer extends EventEmitter {
  private config: MonitoringConfig;
  private metricWindows: Map<string, MetricWindow> = new Map();
  private baselineStats: Map<
    string,
    {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
      sampleCount: number;
    }
  > = new Map();

  private isRunning = false;
  private analysisInterval?: NodeJS.Timeout;
  private readonly windowSize = 100; // 保留最近100個數據點
  private readonly anomalyThreshold = 2.5; // 標準差倍數
  private readonly baselineUpdateInterval = 60000; // 1分鐘更新基線

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期分析
    this.analysisInterval = setInterval(() => {
      this.performPeriodicAnalysis();
    }, 10000); // 每10秒分析一次

    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = undefined;
    }

    this.emit("stopped");
  }

  analyzeMetric(metric: PerformanceMetric): void {
    if (!this.isRunning) return;

    // 更新滑動窗口
    this.updateMetricWindow(metric);

    // 檢測異常
    const anomaly = this.detectAnomaly(metric);
    if (anomaly) {
      this.emit("anomaly", anomaly);
    }

    // 更新基線統計
    this.updateBaselineStats(metric);

    // 發出實時統計
    const stats = this.calculateRealTimeStats(metric.name);
    if (stats) {
      this.emit("realtimeStats", stats);
    }
  }

  getRealTimeStats(metricName?: string): RealTimeStats[] {
    const results: RealTimeStats[] = [];

    const metricsToAnalyze = metricName ? [metricName] : Array.from(this.metricWindows.keys());

    for (const name of metricsToAnalyze) {
      const stats = this.calculateRealTimeStats(name);
      if (stats) {
        results.push(stats);
      }
    }

    return results;
  }

  getAnomalyHistory(metricName?: string, limit: number = 50): AnomalyDetection[] {
    // 這裡應該從歷史記錄中獲取異常，目前返回空數組
    // 在實際實現中，可以將異常保存到數據庫或內存緩存中
    return [];
  }

  getMetricBaseline(metricName: string): {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    sampleCount: number;
  } | null {
    return this.baselineStats.get(metricName) || null;
  }

  resetBaseline(metricName?: string): void {
    if (metricName) {
      this.baselineStats.delete(metricName);
      this.metricWindows.delete(metricName);
    } else {
      this.baselineStats.clear();
      this.metricWindows.clear();
    }

    this.emit("baselineReset", { metricName });
  }

  setAnomalyThreshold(threshold: number): void {
    if (threshold > 0) {
      (this as any).anomalyThreshold = threshold;
      this.emit("thresholdUpdated", { anomalyThreshold: threshold });
    }
  }

  private updateMetricWindow(metric: PerformanceMetric): void {
    if (!this.metricWindows.has(metric.name)) {
      this.metricWindows.set(metric.name, {
        values: [],
        timestamps: [],
        maxSize: this.windowSize,
      });
    }

    const window = this.metricWindows.get(metric.name)!;
    window.values.push(metric.value);
    window.timestamps.push(metric.timestamp);

    // 保持窗口大小
    if (window.values.length > window.maxSize) {
      window.values.shift();
      window.timestamps.shift();
    }
  }

  private detectAnomaly(metric: PerformanceMetric): AnomalyDetection | null {
    const baseline = this.baselineStats.get(metric.name);
    if (!baseline || baseline.sampleCount < 10) {
      // 數據不足，無法檢測異常
      return null;
    }

    const { mean, stdDev } = baseline;
    const zScore = Math.abs((metric.value - mean) / stdDev);

    // 使用 Z-score 檢測異常
    if (zScore > this.anomalyThreshold) {
      const severity = this.calculateAnomalySeverity(zScore);
      const confidence = Math.min(zScore / this.anomalyThreshold, 1.0);

      return {
        metric: metric.name,
        value: metric.value,
        expectedRange: {
          min: mean - this.anomalyThreshold * stdDev,
          max: mean + this.anomalyThreshold * stdDev,
        },
        severity,
        confidence,
        timestamp: metric.timestamp,
        description: `指標 ${metric.name} 值 ${metric.value.toFixed(2)} 偏離正常範圍 (期望: ${mean.toFixed(2)} ± ${(this.anomalyThreshold * stdDev).toFixed(2)})`,
      };
    }

    return null;
  }

  private calculateAnomalySeverity(zScore: number): "low" | "medium" | "high" {
    if (zScore > 4) return "high";
    if (zScore > 3) return "medium";
    return "low";
  }

  private updateBaselineStats(metric: PerformanceMetric): void {
    const window = this.metricWindows.get(metric.name);
    if (!window || window.values.length < 5) return;

    const values = window.values;
    const n = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / n;

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const min = Math.min(...values);
    const max = Math.max(...values);

    this.baselineStats.set(metric.name, {
      mean,
      stdDev,
      min,
      max,
      sampleCount: n,
    });
  }

  private calculateRealTimeStats(metricName: string): RealTimeStats | null {
    const window = this.metricWindows.get(metricName);
    if (!window || window.values.length === 0) return null;

    const values = window.values;
    const timestamps = window.timestamps;
    const currentValue = values[values.length - 1];
    const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    // 計算趨勢
    const trend = this.calculateTrend(values);

    // 計算波動性（標準差除以平均值）
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - avgValue, 2), 0) / values.length;
    const volatility = avgValue !== 0 ? Math.sqrt(variance) / Math.abs(avgValue) : 0;

    return {
      metric: metricName,
      currentValue,
      avgValue,
      minValue,
      maxValue,
      trend,
      volatility,
      lastUpdated: timestamps[timestamps.length - 1],
    };
  }

  private calculateTrend(values: number[]): "stable" | "increasing" | "decreasing" {
    if (values.length < 3) return "stable";

    // 使用簡單的線性回歸計算趨勢
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = values.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (values[i] - meanY);
      denominator += Math.pow(x[i] - meanX, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const threshold = 0.01; // 趨勢閾值

    if (Math.abs(slope) < threshold) return "stable";
    return slope > 0 ? "increasing" : "decreasing";
  }

  private performPeriodicAnalysis(): void {
    // 定期分析所有指標
    for (const metricName of this.metricWindows.keys()) {
      const stats = this.calculateRealTimeStats(metricName);
      if (stats) {
        // 檢查是否需要發出趨勢警告
        this.checkTrendAlert(stats);
      }
    }

    this.emit("periodicAnalysis", {
      timestamp: Date.now(),
      analyzedMetrics: this.metricWindows.size,
    });
  }

  private checkTrendAlert(stats: RealTimeStats): void {
    // 檢查趨勢是否需要告警
    const { metric, trend, volatility, currentValue } = stats;

    // 高波動性警告
    if (volatility > 1.0) {
      // 標準差超過平均值100%
      this.emit("trendAlert", {
        type: "high_volatility",
        metric,
        value: volatility,
        message: `指標 ${metric} 波動性過高: ${(volatility * 100).toFixed(1)}%`,
      });
    }

    // 持續上升趨勢警告
    if (trend === "increasing") {
      const baseline = this.baselineStats.get(metric);
      if (baseline && currentValue > baseline.mean + 2 * baseline.stdDev) {
        this.emit("trendAlert", {
          type: "sustained_increase",
          metric,
          value: currentValue,
          message: `指標 ${metric} 持續上升趨勢，當前值: ${currentValue.toFixed(2)}`,
        });
      }
    }

    // 持續下降趨勢警告（對於某些指標可能是好事）
    if (trend === "decreasing") {
      const baseline = this.baselineStats.get(metric);
      if (baseline && currentValue < baseline.mean - 2 * baseline.stdDev) {
        this.emit("trendAlert", {
          type: "sustained_decrease",
          metric,
          value: currentValue,
          message: `指標 ${metric} 持續下降趨勢，當前值: ${currentValue.toFixed(2)}`,
        });
      }
    }
  }

  // 獲取指標窗口統計
  getWindowStats(): Record<
    string,
    {
      metricName: string;
      windowSize: number;
      dataPoints: number;
      oldestTimestamp?: number;
      newestTimestamp?: number;
    }
  > {
    const stats: Record<string, any> = {};

    for (const [metricName, window] of this.metricWindows.entries()) {
      stats[metricName] = {
        metricName,
        windowSize: window.maxSize,
        dataPoints: window.values.length,
        oldestTimestamp: window.timestamps.length > 0 ? window.timestamps[0] : undefined,
        newestTimestamp:
          window.timestamps.length > 0
            ? window.timestamps[window.timestamps.length - 1]
            : undefined,
      };
    }

    return stats;
  }

  // 清除特定指標的數據
  clearMetricData(metricName: string): void {
    this.metricWindows.delete(metricName);
    this.baselineStats.delete(metricName);
    this.emit("metricDataCleared", { metricName });
  }

  // 調整窗口大小
  setWindowSize(size: number): void {
    if (size > 0 && size <= 1000) {
      (this as any).windowSize = size;

      // 調整現有窗口大小
      for (const window of this.metricWindows.values()) {
        window.maxSize = size;
        if (window.values.length > size) {
          const excess = window.values.length - size;
          window.values.splice(0, excess);
          window.timestamps.splice(0, excess);
        }
      }

      this.emit("windowSizeChanged", { newSize: size });
    }
  }
}
