import { EventEmitter } from "events";
import { PerformanceMetric } from "../core/PerformanceMonitoringManager";

export interface UsagePattern {
  id: string;
  type: "temporal" | "frequency" | "sequence" | "load" | "behavior";
  name: string;
  description: string;
  confidence: number; // 0-1
  frequency: number; // 出現頻率
  metrics: string[];
  timeRange: { start: number; end: number };
  characteristics: {
    peak_hours?: number[];
    busy_days?: string[];
    average_load?: number;
    burst_patterns?: boolean;
    seasonal_variance?: number;
  };
  insights: string[];
  recommendations: string[];
  firstDetected: number;
  lastSeen: number;
}

export interface LoadPattern {
  component: string;
  pattern: "steady" | "bursty" | "cyclical" | "random";
  baseLoad: number;
  peakLoad: number;
  averageLoad: number;
  variance: number;
  peakHours: number[]; // 0-23 小時
  quietHours: number[];
  loadDistribution: Record<string, number>; // 時間段 -> 負載
}

export interface BehaviorPattern {
  user_type: "light" | "moderate" | "heavy" | "burst";
  session_duration: number; // 平均會話持續時間
  tools_per_session: number;
  preferred_tools: string[];
  usage_times: number[]; // 偏好使用時間
  error_tolerance: number; // 錯誤容忍度
  response_sensitivity: number; // 對響應時間的敏感度
}

export interface PatternAnalysisResult {
  timestamp: number;
  patterns: UsagePattern[];
  loadPatterns: LoadPattern[];
  behaviorPatterns: BehaviorPattern[];
  anomalies: Array<{
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
    metrics: string[];
  }>;
  predictions: Array<{
    metric: string;
    predictedLoad: number;
    timeframe: string;
    confidence: number;
  }>;
}

export class UsagePatternAnalyzer extends EventEmitter {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private detectedPatterns: Map<string, UsagePattern> = new Map();
  private loadPatterns: Map<string, LoadPattern> = new Map();
  private behaviorPatterns: Map<string, BehaviorPattern> = new Map();

  private analysisInterval?: NodeJS.Timeout;
  private isRunning = false;

  private readonly analysisIntervalMs = 300000; // 5分鐘
  private readonly patternDetectionWindow = 24 * 60 * 60 * 1000; // 24小時
  private readonly minPatternOccurrences = 3; // 最少出現次數才認為是模式

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期模式分析
    this.analysisInterval = setInterval(() => {
      this.performPatternAnalysis();
    }, this.analysisIntervalMs);

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

  addMetrics(metrics: PerformanceMetric[]): void {
    for (const metric of metrics) {
      if (!this.metrics.has(metric.name)) {
        this.metrics.set(metric.name, []);
      }

      const metricArray = this.metrics.get(metric.name)!;
      metricArray.push(metric);

      // 保持數據在合理範圍內（最近7天）
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const filteredMetrics = metricArray.filter((m) => m.timestamp >= weekAgo);
      this.metrics.set(metric.name, filteredMetrics);
    }
  }

  analyzeUsagePatterns(): PatternAnalysisResult {
    const now = Date.now();

    // 分析不同類型的模式
    this.analyzeTemporalPatterns();
    this.analyzeFrequencyPatterns();
    this.analyzeSequencePatterns();
    this.analyzeLoadPatterns();
    this.analyzeBehaviorPatterns();

    const patterns = Array.from(this.detectedPatterns.values());
    const loadPatterns = Array.from(this.loadPatterns.values());
    const behaviorPatterns = Array.from(this.behaviorPatterns.values());

    const result: PatternAnalysisResult = {
      timestamp: now,
      patterns,
      loadPatterns,
      behaviorPatterns,
      anomalies: this.detectAnomalies(),
      predictions: this.generatePredictions(),
    };

    this.emit("analysisComplete", result);
    return result;
  }

  getPattern(patternId: string): UsagePattern | null {
    return this.detectedPatterns.get(patternId) || null;
  }

  getPatternsByType(type: UsagePattern["type"]): UsagePattern[] {
    return Array.from(this.detectedPatterns.values()).filter((pattern) => pattern.type === type);
  }

  getLoadPatternsForComponent(component: string): LoadPattern | null {
    return this.loadPatterns.get(component) || null;
  }

  private performPatternAnalysis(): void {
    try {
      const result = this.analyzeUsagePatterns();

      // 檢查新發現的模式
      const newPatterns = result.patterns.filter(
        (p) => Date.now() - p.firstDetected < this.analysisIntervalMs * 2
      );

      if (newPatterns.length > 0) {
        this.emit("newPatternsDetected", newPatterns);
      }

      // 檢查異常
      if (result.anomalies.length > 0) {
        this.emit("anomaliesDetected", result.anomalies);
      }

      this.emit("patternAnalysisComplete", {
        patterns: result.patterns.length,
        loadPatterns: result.loadPatterns.length,
        anomalies: result.anomalies.length,
      });
    } catch (error) {
      this.emit("analysisError", error);
    }
  }

  private analyzeTemporalPatterns(): void {
    for (const [metricName, metricData] of this.metrics.entries()) {
      if (metricData.length < 10) continue;

      // 分析小時級模式
      const hourlyPattern = this.analyzeHourlyPattern(metricName, metricData);
      if (hourlyPattern) {
        this.detectedPatterns.set(`temporal_hourly_${metricName}`, hourlyPattern);
      }

      // 分析日級模式
      const dailyPattern = this.analyzeDailyPattern(metricName, metricData);
      if (dailyPattern) {
        this.detectedPatterns.set(`temporal_daily_${metricName}`, dailyPattern);
      }

      // 分析週級模式
      const weeklyPattern = this.analyzeWeeklyPattern(metricName, metricData);
      if (weeklyPattern) {
        this.detectedPatterns.set(`temporal_weekly_${metricName}`, weeklyPattern);
      }
    }
  }

  private analyzeHourlyPattern(metricName: string, data: PerformanceMetric[]): UsagePattern | null {
    // 按小時統計數據
    const hourlyStats: Record<number, number[]> = {};

    for (const metric of data) {
      const hour = new Date(metric.timestamp).getHours();
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = [];
      }
      hourlyStats[hour].push(metric.value);
    }

    // 計算每小時的平均值
    const hourlyAverages: Record<number, number> = {};
    for (const [hour, values] of Object.entries(hourlyStats)) {
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      hourlyAverages[parseInt(hour)] = avg;
    }

    // 檢測峰值和低谷
    const peaks: number[] = [];
    const valleys: number[] = [];
    const hours = Object.keys(hourlyAverages)
      .map(Number)
      .sort((a, b) => a - b);

    for (let i = 1; i < hours.length - 1; i++) {
      const prevHour = hours[i - 1];
      const currentHour = hours[i];
      const nextHour = hours[i + 1];

      const prevValue = hourlyAverages[prevHour];
      const currentValue = hourlyAverages[currentHour];
      const nextValue = hourlyAverages[nextHour];

      if (currentValue > prevValue && currentValue > nextValue) {
        peaks.push(currentHour);
      } else if (currentValue < prevValue && currentValue < nextValue) {
        valleys.push(currentHour);
      }
    }

    // 如果有明顯的峰值模式，創建模式
    if (peaks.length >= 1 || valleys.length >= 1) {
      const variance = this.calculateVariance(Object.values(hourlyAverages));
      const meanValue =
        Object.values(hourlyAverages).reduce((sum, val) => sum + val, 0) /
        Object.values(hourlyAverages).length;
      const confidence = Math.min(1, variance / meanValue); // 變異度作為置信度

      return {
        id: `temporal_hourly_${metricName}_${Date.now()}`,
        type: "temporal",
        name: `${metricName}的小時模式`,
        description: `${metricName}在特定小時表現出規律性變化，峰值時段：${peaks.join(", ")}時`,
        confidence,
        frequency: peaks.length + valleys.length,
        metrics: [metricName],
        timeRange: {
          start: data[0].timestamp,
          end: data[data.length - 1].timestamp,
        },
        characteristics: {
          peak_hours: peaks,
          average_load: meanValue,
          seasonal_variance: variance,
        },
        insights: [
          `在${peaks.join("、")}時達到峰值`,
          `在${valleys.join("、")}時達到低谷`,
          `小時間變異係數：${((variance / meanValue) * 100).toFixed(1)}%`,
        ],
        recommendations: this.generateTemporalRecommendations(peaks, valleys),
        firstDetected: Date.now(),
        lastSeen: Date.now(),
      };
    }

    return null;
  }

  private analyzeDailyPattern(metricName: string, data: PerformanceMetric[]): UsagePattern | null {
    // 按星期幾統計數據
    const dailyStats: Record<number, number[]> = {};

    for (const metric of data) {
      const dayOfWeek = new Date(metric.timestamp).getDay(); // 0=Sunday, 6=Saturday
      if (!dailyStats[dayOfWeek]) {
        dailyStats[dayOfWeek] = [];
      }
      dailyStats[dayOfWeek].push(metric.value);
    }

    // 需要至少3天的數據
    if (Object.keys(dailyStats).length < 3) return null;

    // 計算每天的平均值
    const dailyAverages: Record<number, number> = {};
    for (const [day, values] of Object.entries(dailyStats)) {
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      dailyAverages[parseInt(day)] = avg;
    }

    const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const variance = this.calculateVariance(Object.values(dailyAverages));
    const meanValue =
      Object.values(dailyAverages).reduce((sum, val) => sum + val, 0) /
      Object.values(dailyAverages).length;

    if (variance / meanValue > 0.1) {
      // 變異係數超過10%才認為有模式
      const busyDays = Object.entries(dailyAverages)
        .filter(([_, value]) => value > meanValue * 1.2)
        .map(([day]) => dayNames[parseInt(day)]);

      return {
        id: `temporal_daily_${metricName}_${Date.now()}`,
        type: "temporal",
        name: `${metricName}的週模式`,
        description: `${metricName}在不同星期表現出規律性變化`,
        confidence: Math.min(1, variance / meanValue),
        frequency: Object.keys(dailyStats).length,
        metrics: [metricName],
        timeRange: {
          start: data[0].timestamp,
          end: data[data.length - 1].timestamp,
        },
        characteristics: {
          busy_days: busyDays,
          average_load: meanValue,
          seasonal_variance: variance,
        },
        insights: [
          `繁忙日期：${busyDays.join("、")}`,
          `週間變異係數：${((variance / meanValue) * 100).toFixed(1)}%`,
        ],
        recommendations: ["在繁忙日期增加資源配置", "在低峰期執行維護任務"],
        firstDetected: Date.now(),
        lastSeen: Date.now(),
      };
    }

    return null;
  }

  private analyzeWeeklyPattern(metricName: string, data: PerformanceMetric[]): UsagePattern | null {
    // 需要至少2週的數據
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recentData = data.filter((m) => m.timestamp >= twoWeeksAgo);

    if (recentData.length < 20) return null;

    // 按週統計數據
    const weeklyStats: Record<number, number[]> = {};

    for (const metric of recentData) {
      const weekNumber = Math.floor((metric.timestamp - twoWeeksAgo) / (7 * 24 * 60 * 60 * 1000));
      if (!weeklyStats[weekNumber]) {
        weeklyStats[weekNumber] = [];
      }
      weeklyStats[weekNumber].push(metric.value);
    }

    if (Object.keys(weeklyStats).length < 2) return null;

    // 計算週平均值
    const weeklyAverages = Object.entries(weeklyStats).map(([week, values]) => ({
      week: parseInt(week),
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
    }));

    const variance = this.calculateVariance(weeklyAverages.map((w) => w.average));
    const meanValue = weeklyAverages.reduce((sum, w) => sum + w.average, 0) / weeklyAverages.length;

    if (variance / meanValue > 0.15) {
      // 週間變異係數超過15%
      return {
        id: `temporal_weekly_${metricName}_${Date.now()}`,
        type: "temporal",
        name: `${metricName}的週間模式`,
        description: `${metricName}表現出週間規律性變化`,
        confidence: Math.min(1, variance / meanValue),
        frequency: weeklyAverages.length,
        metrics: [metricName],
        timeRange: {
          start: recentData[0].timestamp,
          end: recentData[recentData.length - 1].timestamp,
        },
        characteristics: {
          average_load: meanValue,
          seasonal_variance: variance,
        },
        insights: [
          `週間變異係數：${((variance / meanValue) * 100).toFixed(1)}%`,
          "存在週間負載變化模式",
        ],
        recommendations: ["基於週間模式調整資源配置", "建立週間監控警報閾值"],
        firstDetected: Date.now(),
        lastSeen: Date.now(),
      };
    }

    return null;
  }

  private analyzeFrequencyPatterns(): void {
    for (const [metricName, metricData] of this.metrics.entries()) {
      if (metricData.length < 50) continue;

      // 分析值的頻率分布
      const valueFrequency: Record<string, number> = {};
      const bucketSize = this.calculateOptimalBucketSize(metricData.map((m) => m.value));

      for (const metric of metricData) {
        const bucket = Math.floor(metric.value / bucketSize) * bucketSize;
        const key = bucket.toString();
        valueFrequency[key] = (valueFrequency[key] || 0) + 1;
      }

      // 檢測頻率模式
      const frequencies = Object.values(valueFrequency);
      const maxFreq = Math.max(...frequencies);
      const dominantValues = Object.entries(valueFrequency)
        .filter(([_, freq]) => freq > maxFreq * 0.3) // 頻率超過最高頻率30%
        .map(([value]) => parseFloat(value));

      if (dominantValues.length > 0 && dominantValues.length < metricData.length * 0.8) {
        const pattern: UsagePattern = {
          id: `frequency_${metricName}_${Date.now()}`,
          type: "frequency",
          name: `${metricName}的頻率模式`,
          description: `${metricName}的值集中在特定範圍：${dominantValues.join(", ")}`,
          confidence: maxFreq / metricData.length,
          frequency: dominantValues.length,
          metrics: [metricName],
          timeRange: {
            start: metricData[0].timestamp,
            end: metricData[metricData.length - 1].timestamp,
          },
          characteristics: {
            average_load: dominantValues.reduce((sum, val) => sum + val, 0) / dominantValues.length,
          },
          insights: [
            `${((maxFreq / metricData.length) * 100).toFixed(1)}%的數據集中在主要範圍`,
            `共識別出${dominantValues.length}個高頻值範圍`,
          ],
          recommendations: ["針對主要使用模式進行優化", "為常見值設置快速路徑"],
          firstDetected: Date.now(),
          lastSeen: Date.now(),
        };

        this.detectedPatterns.set(pattern.id, pattern);
      }
    }
  }

  private analyzeSequencePatterns(): void {
    // 分析工具使用序列模式
    const toolMetrics = Array.from(this.metrics.entries())
      .filter(([name]) => name.includes("tool"))
      .flatMap(([_, metrics]) => metrics)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (toolMetrics.length < 10) return;

    // 構建工具使用序列
    const sequences: string[][] = [];
    let currentSequence: string[] = [];
    let lastTimestamp = 0;

    for (const metric of toolMetrics) {
      // 如果間隔超過5分鐘，開始新序列
      if (metric.timestamp - lastTimestamp > 300000) {
        if (currentSequence.length > 1) {
          sequences.push([...currentSequence]);
        }
        currentSequence = [];
      }

      const toolName = this.extractToolName(metric.name);
      if (toolName) {
        currentSequence.push(toolName);
      }

      lastTimestamp = metric.timestamp;
    }

    // 添加最後一個序列
    if (currentSequence.length > 1) {
      sequences.push(currentSequence);
    }

    // 分析常見序列模式
    const sequencePatterns: Record<string, number> = {};

    for (const sequence of sequences) {
      for (let i = 0; i < sequence.length - 1; i++) {
        const pattern = `${sequence[i]} → ${sequence[i + 1]}`;
        sequencePatterns[pattern] = (sequencePatterns[pattern] || 0) + 1;
      }
    }

    // 識別頻繁序列
    const totalSequences = sequences.length;
    const frequentPatterns = Object.entries(sequencePatterns)
      .filter(([_, count]) => count >= Math.max(3, totalSequences * 0.1))
      .sort(([_, a], [__, b]) => b - a);

    if (frequentPatterns.length > 0) {
      const pattern: UsagePattern = {
        id: `sequence_tools_${Date.now()}`,
        type: "sequence",
        name: "工具使用序列模式",
        description: `檢測到${frequentPatterns.length}個常見工具使用序列`,
        confidence: frequentPatterns[0][1] / totalSequences,
        frequency: frequentPatterns.length,
        metrics: ["tool.usage.sequence"],
        timeRange: {
          start: toolMetrics[0].timestamp,
          end: toolMetrics[toolMetrics.length - 1].timestamp,
        },
        characteristics: {
          average_load: totalSequences,
        },
        insights: [
          `最常見序列：${frequentPatterns[0][0]} (${frequentPatterns[0][1]}次)`,
          `共識別${frequentPatterns.length}個頻繁序列模式`,
        ],
        recommendations: ["為常見序列創建快捷操作", "優化頻繁使用的工具鏈性能"],
        firstDetected: Date.now(),
        lastSeen: Date.now(),
      };

      this.detectedPatterns.set(pattern.id, pattern);
    }
  }

  private analyzeLoadPatterns(): void {
    const components = new Set<string>();

    // 收集所有組件
    for (const metricName of this.metrics.keys()) {
      const component = this.extractComponentName(metricName);
      if (component) {
        components.add(component);
      }
    }

    for (const component of components) {
      const componentMetrics = Array.from(this.metrics.entries())
        .filter(([name]) => this.extractComponentName(name) === component)
        .flatMap(([_, metrics]) => metrics);

      if (componentMetrics.length < 20) continue;

      const values = componentMetrics.map((m) => m.value);
      const baseLoad = Math.min(...values);
      const peakLoad = Math.max(...values);
      const averageLoad = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = this.calculateVariance(values);

      // 分析負載模式類型
      let pattern: LoadPattern["pattern"] = "steady";

      if (variance / averageLoad > 0.5) {
        pattern = "bursty";
      } else if (this.detectCyclicalPattern(componentMetrics)) {
        pattern = "cyclical";
      } else if (variance / averageLoad > 0.2) {
        pattern = "random";
      }

      // 分析峰值時段
      const peakHours = this.identifyPeakHours(componentMetrics);
      const quietHours = this.identifyQuietHours(componentMetrics);

      const loadPattern: LoadPattern = {
        component,
        pattern,
        baseLoad,
        peakLoad,
        averageLoad,
        variance,
        peakHours,
        quietHours,
        loadDistribution: this.calculateLoadDistribution(componentMetrics),
      };

      this.loadPatterns.set(component, loadPattern);
    }
  }

  private analyzeBehaviorPatterns(): void {
    // 分析用戶行為模式
    const toolMetrics = Array.from(this.metrics.entries())
      .filter(([name]) => name.includes("tool"))
      .flatMap(([_, metrics]) => metrics);

    if (toolMetrics.length < 10) return;

    // 分析會話模式
    const sessions = this.identifySessions(toolMetrics);

    if (sessions.length === 0) return;

    const sessionDurations = sessions.map((s) => s.end - s.start);
    const toolsPerSession = sessions.map((s) => s.tools.length);

    const avgSessionDuration =
      sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length;
    const avgToolsPerSession =
      toolsPerSession.reduce((sum, t) => sum + t, 0) / toolsPerSession.length;

    // 計算工具偏好
    const toolFrequency: Record<string, number> = {};
    for (const session of sessions) {
      for (const tool of session.tools) {
        toolFrequency[tool] = (toolFrequency[tool] || 0) + 1;
      }
    }

    const preferredTools = Object.entries(toolFrequency)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([tool]) => tool);

    // 確定用戶類型
    let userType: BehaviorPattern["user_type"] = "light";
    if (avgToolsPerSession > 10) {
      userType = "heavy";
    } else if (avgToolsPerSession > 5) {
      userType = "moderate";
    } else if (this.detectBurstBehavior(sessions)) {
      userType = "burst";
    }

    const behaviorPattern: BehaviorPattern = {
      user_type: userType,
      session_duration: avgSessionDuration,
      tools_per_session: avgToolsPerSession,
      preferred_tools: preferredTools,
      usage_times: this.extractUsageTimes(sessions),
      error_tolerance: this.calculateErrorTolerance(),
      response_sensitivity: this.calculateResponseSensitivity(),
    };

    this.behaviorPatterns.set("default", behaviorPattern);
  }

  private detectAnomalies(): Array<{
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
    metrics: string[];
  }> {
    const anomalies: Array<{
      type: string;
      description: string;
      severity: "low" | "medium" | "high";
      metrics: string[];
    }> = [];

    // 檢測模式偏離
    for (const pattern of this.detectedPatterns.values()) {
      if (pattern.confidence < 0.3) {
        anomalies.push({
          type: "pattern_degradation",
          description: `${pattern.name}的模式置信度下降`,
          severity: "medium",
          metrics: pattern.metrics,
        });
      }
    }

    // 檢測負載異常
    for (const loadPattern of this.loadPatterns.values()) {
      if (loadPattern.pattern === "bursty" && loadPattern.variance > loadPattern.averageLoad) {
        anomalies.push({
          type: "load_volatility",
          description: `${loadPattern.component}組件負載波動過大`,
          severity: "high",
          metrics: [`${loadPattern.component}.load`],
        });
      }
    }

    return anomalies;
  }

  private generatePredictions(): Array<{
    metric: string;
    predictedLoad: number;
    timeframe: string;
    confidence: number;
  }> {
    const predictions: Array<{
      metric: string;
      predictedLoad: number;
      timeframe: string;
      confidence: number;
    }> = [];

    // 基於負載模式生成預測
    for (const [component, loadPattern] of this.loadPatterns.entries()) {
      if (loadPattern.pattern === "cyclical") {
        const nextHour = new Date().getHours() + 1;
        const predictedLoad =
          loadPattern.loadDistribution[nextHour.toString()] || loadPattern.averageLoad;

        predictions.push({
          metric: `${component}.load`,
          predictedLoad,
          timeframe: "next_hour",
          confidence: 0.7,
        });
      }
    }

    return predictions;
  }

  // 輔助方法
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  private calculateOptimalBucketSize(values: number[]): number {
    const range = Math.max(...values) - Math.min(...values);
    const bucketCount = Math.ceil(Math.sqrt(values.length));
    return range / bucketCount;
  }

  private extractToolName(metricName: string): string | null {
    const parts = metricName.split(".");
    if (parts.length > 2 && parts[0] === "tool") {
      return parts[1];
    }
    return null;
  }

  private extractComponentName(metricName: string): string | null {
    return metricName.split(".")[0] || null;
  }

  private generateTemporalRecommendations(peaks: number[], valleys: number[]): string[] {
    const recommendations: string[] = [];

    if (peaks.length > 0) {
      recommendations.push(`在峰值時段(${peaks.join("、")}時)增加資源配置`);
      recommendations.push("為峰值時段設置性能警報");
    }

    if (valleys.length > 0) {
      recommendations.push(`在低峰時段(${valleys.join("、")}時)執行維護任務`);
      recommendations.push("考慮在低峰期進行系統更新");
    }

    return recommendations;
  }

  private detectCyclicalPattern(metrics: PerformanceMetric[]): boolean {
    // 簡化的週期性檢測
    if (metrics.length < 24) return false;

    const hourlyValues: Record<number, number[]> = {};

    for (const metric of metrics) {
      const hour = new Date(metric.timestamp).getHours();
      if (!hourlyValues[hour]) {
        hourlyValues[hour] = [];
      }
      hourlyValues[hour].push(metric.value);
    }

    // 如果超過80%的小時有數據，且方差相對較小，認為是週期性的
    const hoursWithData = Object.keys(hourlyValues).length;
    return hoursWithData >= 19; // 24小時中至少80%有數據
  }

  private identifyPeakHours(metrics: PerformanceMetric[]): number[] {
    const hourlyAverages: Record<number, number> = {};
    const hourlyData: Record<number, number[]> = {};

    for (const metric of metrics) {
      const hour = new Date(metric.timestamp).getHours();
      if (!hourlyData[hour]) {
        hourlyData[hour] = [];
      }
      hourlyData[hour].push(metric.value);
    }

    for (const [hour, values] of Object.entries(hourlyData)) {
      hourlyAverages[parseInt(hour)] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    const overallAverage =
      Object.values(hourlyAverages).reduce((sum, val) => sum + val, 0) /
      Object.values(hourlyAverages).length;

    return Object.entries(hourlyAverages)
      .filter(([_, value]) => value > overallAverage * 1.2)
      .map(([hour]) => parseInt(hour));
  }

  private identifyQuietHours(metrics: PerformanceMetric[]): number[] {
    const hourlyAverages: Record<number, number> = {};
    const hourlyData: Record<number, number[]> = {};

    for (const metric of metrics) {
      const hour = new Date(metric.timestamp).getHours();
      if (!hourlyData[hour]) {
        hourlyData[hour] = [];
      }
      hourlyData[hour].push(metric.value);
    }

    for (const [hour, values] of Object.entries(hourlyData)) {
      hourlyAverages[parseInt(hour)] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    const overallAverage =
      Object.values(hourlyAverages).reduce((sum, val) => sum + val, 0) /
      Object.values(hourlyAverages).length;

    return Object.entries(hourlyAverages)
      .filter(([_, value]) => value < overallAverage * 0.8)
      .map(([hour]) => parseInt(hour));
  }

  private calculateLoadDistribution(metrics: PerformanceMetric[]): Record<string, number> {
    const distribution: Record<string, number[]> = {};

    for (const metric of metrics) {
      const hour = new Date(metric.timestamp).getHours().toString();
      if (!distribution[hour]) {
        distribution[hour] = [];
      }
      distribution[hour].push(metric.value);
    }

    const result: Record<string, number> = {};
    for (const [hour, values] of Object.entries(distribution)) {
      result[hour] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    return result;
  }

  private identifySessions(metrics: PerformanceMetric[]): Array<{
    start: number;
    end: number;
    tools: string[];
  }> {
    const sessions: Array<{ start: number; end: number; tools: string[] }> = [];
    const sessionGap = 600000; // 10分鐘間隔視為新會話

    let currentSession: { start: number; end: number; tools: string[] } | null = null;

    const sortedMetrics = metrics.sort((a, b) => a.timestamp - b.timestamp);

    for (const metric of sortedMetrics) {
      const toolName = this.extractToolName(metric.name);
      if (!toolName) continue;

      if (!currentSession || metric.timestamp - currentSession.end > sessionGap) {
        // 開始新會話
        if (currentSession) {
          sessions.push(currentSession);
        }
        currentSession = {
          start: metric.timestamp,
          end: metric.timestamp,
          tools: [toolName],
        };
      } else {
        // 延續當前會話
        currentSession.end = metric.timestamp;
        if (!currentSession.tools.includes(toolName)) {
          currentSession.tools.push(toolName);
        }
      }
    }

    if (currentSession) {
      sessions.push(currentSession);
    }

    return sessions;
  }

  private detectBurstBehavior(
    sessions: Array<{ start: number; end: number; tools: string[] }>
  ): boolean {
    if (sessions.length === 0) return false;

    const sessionDurations = sessions.map((s) => s.end - s.start);
    const avgDuration = sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length;
    const shortSessions = sessionDurations.filter((d) => d < avgDuration * 0.5).length;

    // 如果超過50%的會話都很短，認為是爆發性行為
    return shortSessions / sessions.length > 0.5;
  }

  private extractUsageTimes(
    sessions: Array<{ start: number; end: number; tools: string[] }>
  ): number[] {
    const usageTimes: Record<number, number> = {};

    for (const session of sessions) {
      const hour = new Date(session.start).getHours();
      usageTimes[hour] = (usageTimes[hour] || 0) + 1;
    }

    return Object.entries(usageTimes)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));
  }

  private calculateErrorTolerance(): number {
    // 基於錯誤相關指標計算錯誤容忍度
    const errorMetrics = Array.from(this.metrics.entries())
      .filter(([name]) => name.includes("error"))
      .flatMap(([_, metrics]) => metrics);

    if (errorMetrics.length === 0) return 0.5; // 默認中等容忍度

    const avgErrorRate = errorMetrics.reduce((sum, m) => sum + m.value, 0) / errorMetrics.length;
    return Math.min(1, avgErrorRate / 10); // 錯誤率越高，容忍度越高
  }

  private calculateResponseSensitivity(): number {
    // 基於響應時間相關指標計算響應敏感度
    const responseMetrics = Array.from(this.metrics.entries())
      .filter(([name]) => name.includes("response") || name.includes("execution.time"))
      .flatMap(([_, metrics]) => metrics);

    if (responseMetrics.length === 0) return 0.5; // 默認中等敏感度

    const avgResponseTime =
      responseMetrics.reduce((sum, m) => sum + m.value, 0) / responseMetrics.length;
    return Math.max(0, Math.min(1, 1 - avgResponseTime / 10000)); // 響應時間越短，敏感度越高
  }
}
