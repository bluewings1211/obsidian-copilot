/**
 * 實時分析引擎
 * 提供搜索事件的實時分析和異常檢測能力
 */

import { EventEmitter } from "events";
import {
  SearchMonitoringEvent,
  SearchEventType,
  SearchComponent,
  PerformanceMetrics,
  BottleneckAnalysis,
  BottleneckSeverity,
} from "../types";

export interface RealTimeAnalyzerOptions {
  windowSize: number; // 分析窗口大小（毫秒）
  anomalyThreshold: number; // 異常檢測閾值
  enablePrediction: boolean; // 是否啟用預測分析
  alertThresholds: AlertThresholds;
}

export interface AlertThresholds {
  latencyWarning: number;
  latencyCritical: number;
  errorRateWarning: number;
  errorRateCritical: number;
  throughputWarning: number;
  throughputCritical: number;
}

export class RealTimeAnalyzer extends EventEmitter {
  private options: RealTimeAnalyzerOptions;
  private eventWindow: SearchMonitoringEvent[] = [];
  private baselineMetrics: Map<SearchComponent, PerformanceMetrics> = new Map();
  private anomalyDetectors: Map<string, AnomalyDetector> = new Map();
  private patternRecognizers: PatternRecognizer[] = [];
  private alertHistory: AlertRecord[] = [];
  private isActive: boolean = false;

  constructor(options: RealTimeAnalyzerOptions) {
    super();
    this.options = options;
    this.initializeDetectors();
    this.initializePatternRecognizers();
  }

  /**
   * 啟動實時分析
   */
  async start(): Promise<void> {
    this.isActive = true;
    await this.establishBaseline();
    this.emit("analyzer:started");
    console.log("🔬 實時分析引擎已啟動");
  }

  /**
   * 停止實時分析
   */
  async stop(): Promise<void> {
    this.isActive = false;
    this.emit("analyzer:stopped");
    console.log("🔬 實時分析引擎已停止");
  }

  /**
   * 分析單個事件
   */
  analyzeEvent(event: SearchMonitoringEvent): AnalysisResult {
    if (!this.isActive) {
      return { type: "skipped", event, timestamp: new Date() };
    }

    // 添加到分析窗口
    this.addToWindow(event);

    // 執行多層次分析
    const results: AnalysisResult[] = [];

    // 1. 實時異常檢測
    const anomalyResult = this.detectAnomalies(event);
    if (anomalyResult) {
      results.push(anomalyResult);
    }

    // 2. 性能閾值檢查
    const thresholdResult = this.checkThresholds(event);
    if (thresholdResult) {
      results.push(thresholdResult);
    }

    // 3. 模式識別
    const patternResult = this.recognizePatterns(event);
    if (patternResult) {
      results.push(patternResult);
    }

    // 4. 瓶頸分析
    const bottleneckResult = this.analyzeBottlenecks(event);
    if (bottleneckResult) {
      results.push(bottleneckResult);
    }

    // 合併結果
    const finalResult = this.mergeResults(results, event);

    // 觸發相應事件
    this.emitAnalysisEvents(finalResult);

    return finalResult;
  }

  /**
   * 批量分析事件
   */
  analyzeEvents(events: SearchMonitoringEvent[]): BatchAnalysisResult {
    const results: AnalysisResult[] = [];

    for (const event of events) {
      const result = this.analyzeEvent(event);
      results.push(result);
    }

    return {
      timestamp: new Date(),
      eventCount: events.length,
      results,
      summary: this.generateBatchSummary(results),
      recommendations: this.generateRecommendations(results),
    };
  }

  /**
   * 獲取當前分析狀態
   */
  getAnalysisStatus(): AnalysisStatus {
    return {
      isActive: this.isActive,
      windowSize: this.eventWindow.length,
      baselineEstablished: this.baselineMetrics.size > 0,
      anomalyDetectors: this.anomalyDetectors.size,
      patternRecognizers: this.patternRecognizers.length,
      alertHistory: this.alertHistory.length,
      lastActivity: this.getLastActivity(),
    };
  }

  /**
   * 更新基準指標
   */
  async updateBaseline(component?: SearchComponent): Promise<void> {
    if (component) {
      const baseline = await this.calculateBaseline(component);
      this.baselineMetrics.set(component, baseline);
    } else {
      for (const comp of Object.values(SearchComponent)) {
        const baseline = await this.calculateBaseline(comp);
        this.baselineMetrics.set(comp, baseline);
      }
    }

    this.emit("baseline:updated", { component, timestamp: new Date() });
  }

  /**
   * 獲取異常統計
   */
  getAnomalyStatistics(): AnomalyStatistics {
    const recentAlerts = this.alertHistory.filter(
      (alert) => Date.now() - alert.timestamp.getTime() < 3600000 // 最近1小時
    );

    const severityCounts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const componentCounts: Record<SearchComponent, number> = {} as any;

    for (const alert of recentAlerts) {
      severityCounts[alert.severity]++;
      componentCounts[alert.component] = (componentCounts[alert.component] || 0) + 1;
    }

    return {
      totalAnomalies: recentAlerts.length,
      severityCounts,
      componentCounts,
      mostProblematic: this.findMostProblematicComponent(),
      trendDirection: this.calculateAnomalyTrend(),
      timestamp: new Date(),
    };
  }

  /**
   * 執行深度分析
   */
  async performDeepAnalysis(): Promise<DeepAnalysisResult> {
    const windowEvents = [...this.eventWindow];

    // 系統健康評估
    const systemHealth = await this.assessSystemHealth(windowEvents);

    // 性能瓶頸識別
    const bottlenecks = await this.identifyBottlenecks(windowEvents);

    // 用戶體驗影響分析
    const userImpact = await this.analyzeUserImpact(windowEvents);

    // 預測性分析
    const predictions = this.options.enablePrediction
      ? await this.generatePredictions(windowEvents)
      : [];

    return {
      timestamp: new Date(),
      systemHealth,
      bottlenecks,
      userImpact,
      predictions,
      recommendations: this.generateDeepRecommendations(systemHealth, bottlenecks, userImpact),
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private initializeDetectors(): void {
    // 初始化各種異常檢測器
    this.anomalyDetectors.set("latency", new LatencyAnomalyDetector());
    this.anomalyDetectors.set("throughput", new ThroughputAnomalyDetector());
    this.anomalyDetectors.set("error_rate", new ErrorRateAnomalyDetector());
    this.anomalyDetectors.set("resource", new ResourceAnomalyDetector());
  }

  private initializePatternRecognizers(): void {
    // 初始化模式識別器
    this.patternRecognizers = [
      new TrafficSpikeRecognizer(),
      new DegradationPatternRecognizer(),
      new CascadeFailureRecognizer(),
      new PerformanceOscillationRecognizer(),
    ];
  }

  private async establishBaseline(): Promise<void> {
    console.log("📊 建立性能基準線...");

    for (const component of Object.values(SearchComponent)) {
      // 使用歷史數據或默認值建立基準
      const baseline = await this.calculateBaseline(component);
      this.baselineMetrics.set(component, baseline);
    }

    this.emit("baseline:established", {
      components: this.baselineMetrics.size,
      timestamp: new Date(),
    });
  }

  private async calculateBaseline(component: SearchComponent): Promise<PerformanceMetrics> {
    // 簡化的基準計算 - 實際應該基於歷史數據
    return {
      latency: {
        p50: 100,
        p90: 200,
        p95: 300,
        p99: 500,
        mean: 150,
        max: 1000,
        min: 50,
      },
      throughput: {
        requestsPerSecond: 10,
        queriesPerMinute: 600,
        resultsPerSecond: 8,
        concurrentUsers: 5,
      },
      quality: {
        relevanceScore: 0.75,
        precisionAtK: [0.8, 0.7, 0.6],
        recallAtK: [0.85, 0.75, 0.65],
        mrrScore: 0.78,
        ndcgScore: 0.76,
        diversityScore: 0.68,
        duplicateRate: 0.03,
      },
      userExperience: {
        clickThroughRate: 0.25,
        dwellTime: 45000,
        bounceRate: 0.22,
        searchSatisfaction: 0.82,
        taskCompletionRate: 0.87,
        searchAbandonmentRate: 0.08,
      },
      resources: {
        cpuUsage: 40,
        memoryUsage: 60,
        diskIo: 20,
        networkIo: 30,
        cacheHitRate: 0.75,
        indexSize: 1024 * 1024 * 100,
      },
      errors: {
        errorRate: 0.02,
        timeoutRate: 0.01,
        failuresByComponent: {} as any,
        recoveryTime: 1000,
      },
    };
  }

  private addToWindow(event: SearchMonitoringEvent): void {
    this.eventWindow.push(event);

    // 維持窗口大小
    const cutoffTime = Date.now() - this.options.windowSize;
    this.eventWindow = this.eventWindow.filter((e) => e.timestamp.getTime() > cutoffTime);
  }

  private detectAnomalies(event: SearchMonitoringEvent): AnalysisResult | null {
    for (const [type, detector] of this.anomalyDetectors) {
      const anomaly = detector.detect(event, this.eventWindow);
      if (anomaly) {
        return {
          type: "anomaly",
          event,
          timestamp: new Date(),
          details: {
            detectorType: type,
            anomaly,
            severity: this.calculateSeverity(anomaly),
          },
        };
      }
    }
    return null;
  }

  private checkThresholds(event: SearchMonitoringEvent): AnalysisResult | null {
    const { alertThresholds } = this.options;

    // 檢查延遲閾值
    if (event.data.latency) {
      if (event.data.latency > alertThresholds.latencyCritical) {
        return this.createThresholdAlert(event, "latency", "critical", event.data.latency);
      } else if (event.data.latency > alertThresholds.latencyWarning) {
        return this.createThresholdAlert(event, "latency", "warning", event.data.latency);
      }
    }

    // 檢查錯誤率（基於窗口內事件）
    const errorRate = this.calculateCurrentErrorRate(event.component);
    if (errorRate > alertThresholds.errorRateCritical) {
      return this.createThresholdAlert(event, "error_rate", "critical", errorRate);
    } else if (errorRate > alertThresholds.errorRateWarning) {
      return this.createThresholdAlert(event, "error_rate", "warning", errorRate);
    }

    return null;
  }

  private recognizePatterns(event: SearchMonitoringEvent): AnalysisResult | null {
    for (const recognizer of this.patternRecognizers) {
      const pattern = recognizer.recognize(event, this.eventWindow);
      if (pattern) {
        return {
          type: "pattern",
          event,
          timestamp: new Date(),
          details: {
            pattern,
            confidence: pattern.confidence,
            impact: this.assessPatternImpact(pattern),
          },
        };
      }
    }
    return null;
  }

  private analyzeBottlenecks(event: SearchMonitoringEvent): AnalysisResult | null {
    // 簡化的瓶頸分析
    const componentEvents = this.eventWindow.filter((e) => e.component === event.component);

    if (componentEvents.length < 10) return null;

    const avgLatency =
      componentEvents.filter((e) => e.data.latency).reduce((sum, e) => sum + e.data.latency, 0) /
      componentEvents.length;

    const baseline = this.baselineMetrics.get(event.component);
    if (!baseline) return null;

    const latencyIncrease = avgLatency / baseline.latency.mean;

    if (latencyIncrease > 2.0) {
      // 延遲增加超過2倍
      const bottleneck: BottleneckAnalysis = {
        component: event.component,
        severity: latencyIncrease > 3.0 ? BottleneckSeverity.CRITICAL : BottleneckSeverity.HIGH,
        impact: latencyIncrease,
        description: `${event.component} 組件延遲異常增加 ${(latencyIncrease * 100 - 100).toFixed(1)}%`,
        recommendations: [],
        metrics: {
          queueLength: componentEvents.length,
          waitTime: avgLatency,
          serviceTime: avgLatency * 0.8,
          utilization: 0.9,
          throughput: componentEvents.length / (this.options.windowSize / 1000),
        },
      };

      return {
        type: "bottleneck",
        event,
        timestamp: new Date(),
        details: { bottleneck },
      };
    }

    return null;
  }

  private mergeResults(results: AnalysisResult[], event: SearchMonitoringEvent): AnalysisResult {
    if (results.length === 0) {
      return { type: "normal", event, timestamp: new Date() };
    }

    if (results.length === 1) {
      return results[0];
    }

    // 多個結果時，選擇最嚴重的
    const criticalResult = results.find(
      (r) =>
        r.details?.severity === "critical" ||
        r.details?.bottleneck?.severity === BottleneckSeverity.CRITICAL
    );

    if (criticalResult) return criticalResult;

    // 返回第一個結果
    return results[0];
  }

  private emitAnalysisEvents(result: AnalysisResult): void {
    switch (result.type) {
      case "anomaly":
        this.emit("anomaly:detected", result);
        this.recordAlert(result);
        break;
      case "pattern":
        this.emit("pattern:recognized", result);
        break;
      case "bottleneck":
        this.emit("bottleneck:detected", result);
        this.recordAlert(result);
        break;
      case "threshold":
        this.emit("threshold:exceeded", result);
        this.recordAlert(result);
        break;
    }
  }

  private recordAlert(result: AnalysisResult): void {
    const alert: AlertRecord = {
      id: this.generateAlertId(),
      timestamp: result.timestamp,
      component: result.event.component,
      type: result.type,
      severity: this.extractSeverity(result),
      message: this.generateAlertMessage(result),
      details: result.details,
    };

    this.alertHistory.push(alert);

    // 保留最近1000個警報
    if (this.alertHistory.length > 1000) {
      this.alertHistory.splice(0, this.alertHistory.length - 1000);
    }
  }

  private createThresholdAlert(
    event: SearchMonitoringEvent,
    metric: string,
    severity: string,
    value: number
  ): AnalysisResult {
    return {
      type: "threshold",
      event,
      timestamp: new Date(),
      details: {
        metric,
        value,
        severity,
        threshold: this.getThreshold(metric, severity),
      },
    };
  }

  private calculateCurrentErrorRate(component: SearchComponent): number {
    const componentEvents = this.eventWindow.filter((e) => e.component === component);
    const errorEvents = componentEvents.filter((e) => e.type === SearchEventType.SEARCH_FAILED);

    return componentEvents.length > 0 ? errorEvents.length / componentEvents.length : 0;
  }

  private calculateSeverity(anomaly: any): string {
    // 簡化的嚴重程度計算
    if (anomaly.zScore > 3) return "critical";
    if (anomaly.zScore > 2) return "high";
    if (anomaly.zScore > 1.5) return "medium";
    return "low";
  }

  private assessPatternImpact(pattern: any): string {
    // 評估模式對系統的影響
    return pattern.type === "traffic_spike" ? "high" : "medium";
  }

  private getThreshold(metric: string, severity: string): number {
    const thresholds = this.options.alertThresholds;

    switch (metric) {
      case "latency":
        return severity === "critical" ? thresholds.latencyCritical : thresholds.latencyWarning;
      case "error_rate":
        return severity === "critical" ? thresholds.errorRateCritical : thresholds.errorRateWarning;
      default:
        return 0;
    }
  }

  private extractSeverity(result: AnalysisResult): string {
    if (result.details?.severity) return result.details.severity;
    if (result.details?.bottleneck?.severity) return result.details.bottleneck.severity;
    return "medium";
  }

  private generateAlertMessage(result: AnalysisResult): string {
    switch (result.type) {
      case "anomaly":
        return `異常檢測: ${result.event.component} 組件出現異常`;
      case "bottleneck":
        return `瓶頸檢測: ${result.event.component} 組件出現性能瓶頸`;
      case "threshold":
        return `閾值警報: ${result.details?.metric} 超過閾值`;
      default:
        return "未知警報類型";
    }
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLastActivity(): Date | null {
    return this.eventWindow.length > 0
      ? this.eventWindow[this.eventWindow.length - 1].timestamp
      : null;
  }

  private generateBatchSummary(results: AnalysisResult[]): any {
    const typeCounts: Record<string, number> = {
      normal: 0,
      anomaly: 0,
      pattern: 0,
      bottleneck: 0,
      threshold: 0,
      skipped: 0,
    };

    for (const result of results) {
      typeCounts[result.type]++;
    }

    return {
      totalEvents: results.length,
      typeCounts,
      criticalIssues: results.filter((r) => this.extractSeverity(r) === "critical").length,
    };
  }

  private generateRecommendations(results: AnalysisResult[]): string[] {
    const recommendations: string[] = [];

    const criticalResults = results.filter((r) => this.extractSeverity(r) === "critical");

    if (criticalResults.length > 0) {
      recommendations.push("立即檢查系統狀態，存在嚴重異常");
    }

    const bottlenecks = results.filter((r) => r.type === "bottleneck");
    if (bottlenecks.length > 0) {
      recommendations.push("優化性能瓶頸組件，考慮擴容或算法優化");
    }

    return recommendations;
  }

  private findMostProblematicComponent(): SearchComponent | null {
    const componentCounts: Record<SearchComponent, number> = {} as any;

    for (const alert of this.alertHistory) {
      componentCounts[alert.component] = (componentCounts[alert.component] || 0) + 1;
    }

    let maxCount = 0;
    let mostProblematic: SearchComponent | null = null;

    for (const [component, count] of Object.entries(componentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostProblematic = component as SearchComponent;
      }
    }

    return mostProblematic;
  }

  private calculateAnomalyTrend(): "increasing" | "decreasing" | "stable" {
    const recentAlerts = this.alertHistory.slice(-20); // 最近20個警報

    if (recentAlerts.length < 10) return "stable";

    const firstHalf = recentAlerts.slice(0, 10);
    const secondHalf = recentAlerts.slice(-10);

    const firstHalfTime = Math.max(...firstHalf.map((a) => a.timestamp.getTime()));
    const secondHalfTime = Math.max(...secondHalf.map((a) => a.timestamp.getTime()));

    if (secondHalfTime - firstHalfTime < 300000) {
      // 5分鐘內
      return "increasing";
    }

    return "stable";
  }

  private async assessSystemHealth(events: SearchMonitoringEvent[]): Promise<any> {
    // 系統健康評估邏輯
    return {
      overall: "healthy",
      score: 0.85,
      components: {},
    };
  }

  private async identifyBottlenecks(
    events: SearchMonitoringEvent[]
  ): Promise<BottleneckAnalysis[]> {
    // 瓶頸識別邏輯
    return [];
  }

  private async analyzeUserImpact(events: SearchMonitoringEvent[]): Promise<any> {
    // 用戶影響分析
    return {
      affectedUsers: 0,
      impactLevel: "low",
    };
  }

  private async generatePredictions(events: SearchMonitoringEvent[]): Promise<any[]> {
    // 預測分析
    return [];
  }

  private generateDeepRecommendations(
    systemHealth: any,
    bottlenecks: BottleneckAnalysis[],
    userImpact: any
  ): string[] {
    // 深度分析建議
    return ["系統運行正常"];
  }
}

// ============================================================================
// 抽象異常檢測器基類
// ============================================================================

abstract class AnomalyDetector {
  abstract detect(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null;
}

class LatencyAnomalyDetector extends AnomalyDetector {
  detect(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    if (!event.data.latency) return null;

    const componentEvents = window.filter((e) => e.component === event.component && e.data.latency);

    if (componentEvents.length < 5) return null;

    const latencies = componentEvents.map((e) => e.data.latency);
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const stdDev = Math.sqrt(
      latencies.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / latencies.length
    );

    const zScore = Math.abs((event.data.latency - mean) / stdDev);

    return zScore > 2 ? { type: "latency", zScore, value: event.data.latency, mean } : null;
  }
}

class ThroughputAnomalyDetector extends AnomalyDetector {
  detect(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 吞吐量異常檢測邏輯
    return null;
  }
}

class ErrorRateAnomalyDetector extends AnomalyDetector {
  detect(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 錯誤率異常檢測邏輯
    return null;
  }
}

class ResourceAnomalyDetector extends AnomalyDetector {
  detect(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 資源使用異常檢測邏輯
    return null;
  }
}

// ============================================================================
// 抽象模式識別器基類
// ============================================================================

abstract class PatternRecognizer {
  abstract recognize(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null;
}

class TrafficSpikeRecognizer extends PatternRecognizer {
  recognize(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 流量激增模式識別
    const recentEvents = window.filter(
      (e) => Date.now() - e.timestamp.getTime() < 60000 // 最近1分鐘
    );

    if (recentEvents.length > 50) {
      // 簡化的判斷邏輯
      return {
        type: "traffic_spike",
        confidence: 0.8,
        eventCount: recentEvents.length,
      };
    }

    return null;
  }
}

class DegradationPatternRecognizer extends PatternRecognizer {
  recognize(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 性能退化模式識別
    return null;
  }
}

class CascadeFailureRecognizer extends PatternRecognizer {
  recognize(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 級聯故障模式識別
    return null;
  }
}

class PerformanceOscillationRecognizer extends PatternRecognizer {
  recognize(event: SearchMonitoringEvent, window: SearchMonitoringEvent[]): any | null {
    // 性能震盪模式識別
    return null;
  }
}

// ============================================================================
// 輔助類型
// ============================================================================

interface AnalysisResult {
  type: "normal" | "anomaly" | "pattern" | "bottleneck" | "threshold" | "skipped";
  event: SearchMonitoringEvent;
  timestamp: Date;
  details?: any;
}

interface BatchAnalysisResult {
  timestamp: Date;
  eventCount: number;
  results: AnalysisResult[];
  summary: any;
  recommendations: string[];
}

interface AnalysisStatus {
  isActive: boolean;
  windowSize: number;
  baselineEstablished: boolean;
  anomalyDetectors: number;
  patternRecognizers: number;
  alertHistory: number;
  lastActivity: Date | null;
}

interface AnomalyStatistics {
  totalAnomalies: number;
  severityCounts: Record<string, number>;
  componentCounts: Record<SearchComponent, number>;
  mostProblematic: SearchComponent | null;
  trendDirection: "increasing" | "decreasing" | "stable";
  timestamp: Date;
}

interface DeepAnalysisResult {
  timestamp: Date;
  systemHealth: any;
  bottlenecks: BottleneckAnalysis[];
  userImpact: any;
  predictions: any[];
  recommendations: string[];
}

interface AlertRecord {
  id: string;
  timestamp: Date;
  component: SearchComponent;
  type: string;
  severity: string;
  message: string;
  details?: any;
}
