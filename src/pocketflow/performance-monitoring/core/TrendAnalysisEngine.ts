import { EventEmitter } from "events";
import { PerformanceMetric, MonitoringConfig } from "./PerformanceMonitoringManager";

export interface TrendData {
  metric: string;
  direction: "increasing" | "decreasing" | "stable";
  strength: number; // 0-1, 趨勢強度
  duration: number; // 趨勢持續時間 (ms)
  currentValue: number;
  startValue: number;
  change: number; // 變化量
  changeRate: number; // 變化率 (%)
  confidence: number; // 置信度 0-1
  severity: "low" | "medium" | "high" | "critical";
  projection?: {
    nextValue: number;
    timeframe: number; // 預測時間框架 (ms)
  };
}

export interface SeasonalPattern {
  metric: string;
  pattern: "daily" | "weekly" | "monthly" | "custom";
  peaks: number[]; // 峰值時間點
  valleys: number[]; // 谷值時間點
  amplitude: number; // 振幅
  confidence: number;
}

interface TrendWindow {
  timestamps: number[];
  values: number[];
  maxSize: number;
}

export class TrendAnalysisEngine extends EventEmitter {
  private config: MonitoringConfig;
  private trendWindows: Map<string, TrendWindow> = new Map();
  private activeTrends: Map<string, TrendData> = new Map();
  private seasonalPatterns: Map<string, SeasonalPattern> = new Map();
  private isRunning = false;
  private analysisInterval?: NodeJS.Timeout;

  private readonly trendWindowSize = 50; // 趨勢分析窗口大小
  private readonly minTrendDuration = 300000; // 最小趨勢持續時間 (5分鐘)
  private readonly trendConfidenceThreshold = 0.7; // 趨勢置信度閾值

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期趨勢分析
    this.analysisInterval = setInterval(() => {
      this.performTrendAnalysis();
    }, 60000); // 每分鐘分析一次

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

  addMetricData(metric: PerformanceMetric): void {
    if (!this.isRunning) return;

    if (!this.trendWindows.has(metric.name)) {
      this.trendWindows.set(metric.name, {
        timestamps: [],
        values: [],
        maxSize: this.trendWindowSize,
      });
    }

    const window = this.trendWindows.get(metric.name)!;
    window.timestamps.push(metric.timestamp);
    window.values.push(metric.value);

    // 保持窗口大小
    if (window.timestamps.length > window.maxSize) {
      window.timestamps.shift();
      window.values.shift();
    }

    // 實時趨勢檢測
    this.detectRealTimeTrend(metric.name);
  }

  getTrends(timeRange?: { start: number; end: number }): TrendData[] {
    const trends = Array.from(this.activeTrends.values());

    if (!timeRange) return trends;

    return trends.filter((trend) => {
      const trendStartTime = Date.now() - trend.duration;
      return trendStartTime >= timeRange.start && trendStartTime <= timeRange.end;
    });
  }

  getTrendForMetric(metricName: string): TrendData | null {
    return this.activeTrends.get(metricName) || null;
  }

  getSeasonalPatterns(metricName?: string): SeasonalPattern[] {
    if (metricName) {
      const pattern = this.seasonalPatterns.get(metricName);
      return pattern ? [pattern] : [];
    }
    return Array.from(this.seasonalPatterns.values());
  }

  async forecast(
    metricName: string,
    timeframe: number, // 預測時間框架 (ms)
    method: "linear" | "exponential" | "seasonal" = "linear"
  ): Promise<{
    predictions: Array<{ timestamp: number; value: number; confidence: number }>;
    accuracy: number;
  } | null> {
    const window = this.trendWindows.get(metricName);
    if (!window || window.values.length < 10) return null;

    const now = Date.now();
    const predictionSteps = Math.min(10, Math.floor(timeframe / 60000)); // 每分鐘一個預測點

    switch (method) {
      case "linear":
        return this.linearForecast(window, now, predictionSteps, timeframe);
      case "exponential":
        return this.exponentialForecast(window, now, predictionSteps, timeframe);
      case "seasonal":
        return this.seasonalForecast(metricName, window, now, predictionSteps, timeframe);
      default:
        return null;
    }
  }

  private performTrendAnalysis(): void {
    for (const [metricName, window] of this.trendWindows.entries()) {
      if (window.values.length < 10) continue;

      // 分析長期趨勢
      const trend = this.analyzeLongTermTrend(metricName, window);
      if (trend) {
        this.updateActiveTrend(metricName, trend);
      }

      // 分析季節性模式
      this.analyzeSeasonalPattern(metricName, window);
    }

    this.emit("analysisComplete", {
      timestamp: Date.now(),
      activeTrends: this.activeTrends.size,
      seasonalPatterns: this.seasonalPatterns.size,
    });
  }

  private detectRealTimeTrend(metricName: string): void {
    const window = this.trendWindows.get(metricName);
    if (!window || window.values.length < 5) return;

    // 使用最近的數據點進行實時趨勢檢測
    const recentWindow = {
      timestamps: window.timestamps.slice(-10),
      values: window.values.slice(-10),
    };

    const trend = this.calculateTrend(recentWindow.timestamps, recentWindow.values);

    if (trend && trend.confidence > 0.6) {
      // 較低的實時趨勢閾值
      const existingTrend = this.activeTrends.get(metricName);

      // 如果是新趨勢或趨勢方向改變
      if (!existingTrend || existingTrend.direction !== trend.direction) {
        this.emit("trendDetected", trend);
      }
    }
  }

  private analyzeLongTermTrend(metricName: string, window: TrendWindow): TrendData | null {
    if (window.values.length < 20) return null;

    const trend = this.calculateTrend(window.timestamps, window.values);

    if (!trend || trend.confidence < this.trendConfidenceThreshold) {
      return null;
    }

    // 計算趨勢持續時間
    const duration = window.timestamps[window.timestamps.length - 1] - window.timestamps[0];

    if (duration < this.minTrendDuration) {
      return null;
    }

    // 增強趨勢數據
    const enhancedTrend: TrendData = {
      ...trend,
      duration,
      severity: this.calculateTrendSeverity(trend),
      projection: this.calculateProjection(trend, window),
    };

    return enhancedTrend;
  }

  private calculateTrend(timestamps: number[], values: number[]): TrendData | null {
    if (timestamps.length < 3 || values.length < 3) return null;

    const n = values.length;
    const x = timestamps.map((t, i) => i); // 使用索引而不是時間戳
    const y = values;

    // 計算線性回歸
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (y[i] - meanY);
      denominator += Math.pow(x[i] - meanX, 2);
    }

    if (denominator === 0) return null;

    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;

    // 計算R²（決定係數）
    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < n; i++) {
      const predicted = slope * x[i] + intercept;
      ssRes += Math.pow(y[i] - predicted, 2);
      ssTot += Math.pow(y[i] - meanY, 2);
    }

    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    const confidence = Math.max(0, Math.min(1, rSquared));

    // 確定趨勢方向
    const threshold = 0.001;
    let direction: "increasing" | "decreasing" | "stable";
    if (Math.abs(slope) < threshold) {
      direction = "stable";
    } else {
      direction = slope > 0 ? "increasing" : "decreasing";
    }

    const startValue = values[0];
    const currentValue = values[values.length - 1];
    const change = currentValue - startValue;
    const changeRate = startValue !== 0 ? (change / Math.abs(startValue)) * 100 : 0;

    return {
      metric: "", // 將在調用處設置
      direction,
      strength: Math.abs(slope),
      duration: 0, // 將在調用處設置
      currentValue,
      startValue,
      change,
      changeRate,
      confidence,
      severity: "low", // 將在調用處計算
    };
  }

  private calculateTrendSeverity(trend: TrendData): "low" | "medium" | "high" | "critical" {
    // 基於變化率和置信度計算嚴重程度
    const absChangeRate = Math.abs(trend.changeRate);
    const confidenceWeight = trend.confidence;

    const weightedSeverity = absChangeRate * confidenceWeight;

    if (weightedSeverity > 50) return "critical";
    if (weightedSeverity > 25) return "high";
    if (weightedSeverity > 10) return "medium";
    return "low";
  }

  private calculateProjection(
    trend: TrendData,
    window: TrendWindow
  ): {
    nextValue: number;
    timeframe: number;
  } {
    const timeframe = 300000; // 5分鐘預測
    const dataPointInterval =
      window.timestamps.length > 1
        ? (window.timestamps[window.timestamps.length - 1] - window.timestamps[0]) /
          (window.timestamps.length - 1)
        : 60000; // 默認1分鐘間隔

    const stepsAhead = Math.floor(timeframe / dataPointInterval);
    const nextValue =
      trend.currentValue +
      trend.strength * stepsAhead * (trend.direction === "increasing" ? 1 : -1);

    return { nextValue, timeframe };
  }

  private updateActiveTrend(metricName: string, trend: TrendData): void {
    trend.metric = metricName;

    const existingTrend = this.activeTrends.get(metricName);

    // 如果趨勢方向改變或是新趨勢
    if (!existingTrend || existingTrend.direction !== trend.direction) {
      this.activeTrends.set(metricName, trend);
      this.emit("trend", trend);
    } else {
      // 更新現有趨勢
      this.activeTrends.set(metricName, { ...existingTrend, ...trend });
    }
  }

  private analyzeSeasonalPattern(metricName: string, window: TrendWindow): void {
    if (window.values.length < 24) return; // 需要足夠的數據點

    // 簡單的峰值和谷值檢測
    const peaks: number[] = [];
    const valleys: number[] = [];

    for (let i = 1; i < window.values.length - 1; i++) {
      const prev = window.values[i - 1];
      const curr = window.values[i];
      const next = window.values[i + 1];

      if (curr > prev && curr > next) {
        peaks.push(window.timestamps[i]);
      } else if (curr < prev && curr < next) {
        valleys.push(window.timestamps[i]);
      }
    }

    if (peaks.length >= 2 || valleys.length >= 2) {
      const amplitude = Math.max(...window.values) - Math.min(...window.values);

      const pattern: SeasonalPattern = {
        metric: metricName,
        pattern: this.detectPatternType(peaks, valleys),
        peaks,
        valleys,
        amplitude,
        confidence: this.calculatePatternConfidence(peaks, valleys, window.values.length),
      };

      this.seasonalPatterns.set(metricName, pattern);
      this.emit("seasonalPattern", pattern);
    }
  }

  private detectPatternType(
    peaks: number[],
    valleys: number[]
  ): "daily" | "weekly" | "monthly" | "custom" {
    // 簡化的模式檢測，實際實現可以更複雜
    const allPoints = [...peaks, ...valleys].sort((a, b) => a - b);

    if (allPoints.length < 2) return "custom";

    const avgInterval = (allPoints[allPoints.length - 1] - allPoints[0]) / (allPoints.length - 1);

    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    if (Math.abs(avgInterval - dayMs) < dayMs * 0.3) return "daily";
    if (Math.abs(avgInterval - weekMs) < weekMs * 0.3) return "weekly";
    if (Math.abs(avgInterval - monthMs) < monthMs * 0.3) return "monthly";

    return "custom";
  }

  private calculatePatternConfidence(
    peaks: number[],
    valleys: number[],
    totalPoints: number
  ): number {
    const patternPoints = peaks.length + valleys.length;
    const coverage = patternPoints / totalPoints;

    // 基於覆蓋率和規律性計算置信度
    const regularity = this.calculateRegularity([...peaks, ...valleys]);

    return Math.min(1, coverage * 2 * regularity);
  }

  private calculateRegularity(points: number[]): number {
    if (points.length < 3) return 0;

    const sortedPoints = points.sort((a, b) => a - b);
    const intervals: number[] = [];

    for (let i = 1; i < sortedPoints.length; i++) {
      intervals.push(sortedPoints[i] - sortedPoints[i - 1]);
    }

    const meanInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, val) => sum + Math.pow(val - meanInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // 變異係數的倒數作為規律性指標
    return meanInterval !== 0 ? Math.max(0, 1 - stdDev / meanInterval) : 0;
  }

  private linearForecast(
    window: TrendWindow,
    now: number,
    steps: number,
    timeframe: number
  ): {
    predictions: Array<{ timestamp: number; value: number; confidence: number }>;
    accuracy: number;
  } {
    const trend = this.calculateTrend(window.timestamps, window.values);
    if (!trend) {
      return { predictions: [], accuracy: 0 };
    }

    const predictions: Array<{ timestamp: number; value: number; confidence: number }> = [];
    const stepSize = timeframe / steps;

    for (let i = 1; i <= steps; i++) {
      const timestamp = now + i * stepSize;
      const value =
        trend.currentValue + trend.strength * i * (trend.direction === "increasing" ? 1 : -1);
      const confidence = Math.max(0.1, trend.confidence * (1 - i * 0.1)); // 置信度隨時間衰減

      predictions.push({ timestamp, value, confidence });
    }

    return { predictions, accuracy: trend.confidence };
  }

  private exponentialForecast(
    window: TrendWindow,
    now: number,
    steps: number,
    timeframe: number
  ): {
    predictions: Array<{ timestamp: number; value: number; confidence: number }>;
    accuracy: number;
  } {
    // 指數平滑預測
    const alpha = 0.3; // 平滑參數
    let smoothedValue = window.values[0];

    for (let i = 1; i < window.values.length; i++) {
      smoothedValue = alpha * window.values[i] + (1 - alpha) * smoothedValue;
    }

    const predictions: Array<{ timestamp: number; value: number; confidence: number }> = [];
    const stepSize = timeframe / steps;

    for (let i = 1; i <= steps; i++) {
      const timestamp = now + i * stepSize;
      const confidence = Math.max(0.1, 0.8 * (1 - i * 0.1));
      predictions.push({ timestamp, value: smoothedValue, confidence });
    }

    return { predictions, accuracy: 0.7 };
  }

  private seasonalForecast(
    metricName: string,
    window: TrendWindow,
    now: number,
    steps: number,
    timeframe: number
  ): {
    predictions: Array<{ timestamp: number; value: number; confidence: number }>;
    accuracy: number;
  } {
    const pattern = this.seasonalPatterns.get(metricName);
    if (!pattern) {
      return this.linearForecast(window, now, steps, timeframe);
    }

    // 基於季節性模式的簡單預測
    const predictions: Array<{ timestamp: number; value: number; confidence: number }> = [];
    const stepSize = timeframe / steps;
    const baseValue = window.values[window.values.length - 1];

    for (let i = 1; i <= steps; i++) {
      const timestamp = now + i * stepSize;
      // 簡化的季節性調整
      const seasonalAdjustment =
        Math.sin((timestamp / 86400000) * 2 * Math.PI) * (pattern.amplitude * 0.5);
      const value = baseValue + seasonalAdjustment;
      const confidence = pattern.confidence * (1 - i * 0.05);

      predictions.push({ timestamp, value, confidence });
    }

    return { predictions, accuracy: pattern.confidence };
  }

  // 清除過期的趨勢數據
  cleanupExpiredTrends(cutoffTime: number): void {
    for (const [metricName, trend] of this.activeTrends.entries()) {
      const trendAge = Date.now() - (Date.now() - trend.duration);
      if (trendAge < cutoffTime) {
        this.activeTrends.delete(metricName);
      }
    }

    this.emit("trendsCleanup", { cutoffTime });
  }

  // 獲取趨勢統計
  getTrendStatistics(): {
    totalTrends: number;
    trendsByDirection: Record<"increasing" | "decreasing" | "stable", number>;
    trendsBySeverity: Record<"low" | "medium" | "high" | "critical", number>;
    avgConfidence: number;
  } {
    const trends = Array.from(this.activeTrends.values());

    const stats = {
      totalTrends: trends.length,
      trendsByDirection: { increasing: 0, decreasing: 0, stable: 0 },
      trendsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      avgConfidence: 0,
    };

    if (trends.length === 0) return stats;

    let totalConfidence = 0;

    for (const trend of trends) {
      stats.trendsByDirection[trend.direction]++;
      stats.trendsBySeverity[trend.severity]++;
      totalConfidence += trend.confidence;
    }

    stats.avgConfidence = totalConfidence / trends.length;

    return stats;
  }
}
