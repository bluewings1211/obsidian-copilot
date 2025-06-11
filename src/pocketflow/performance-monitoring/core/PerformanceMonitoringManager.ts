import { EventEmitter } from "events";
import { MetricsCollectionEngine } from "./MetricsCollectionEngine";
import { RealTimeAnalyzer } from "./RealTimeAnalyzer";
import { TrendAnalysisEngine } from "./TrendAnalysisEngine";

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
  unit?: string;
  type: "counter" | "gauge" | "histogram" | "summary";
}

export interface PerformanceAlert {
  id: string;
  type: "threshold" | "anomaly" | "trend";
  severity: "low" | "medium" | "high" | "critical";
  metric: string;
  value: number;
  threshold?: number;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  collectInterval: number; // ms
  retentionPeriod: number; // ms
  alertThresholds: Record<
    string,
    {
      warning: number;
      critical: number;
    }
  >;
  enableRealTimeAnalysis: boolean;
  enableTrendAnalysis: boolean;
  maxMetricsInMemory: number;
  enableAutoOptimization: boolean;
}

export interface SystemHealthStatus {
  overall: "healthy" | "warning" | "critical";
  components: Record<
    string,
    {
      status: "healthy" | "warning" | "critical";
      metrics: Record<string, number>;
      lastCheck: number;
    }
  >;
  alerts: PerformanceAlert[];
  summary: {
    totalMetrics: number;
    activeAlerts: number;
    systemLoad: number;
    uptime: number;
  };
}

export class PerformanceMonitoringManager extends EventEmitter {
  private metricsEngine: MetricsCollectionEngine;
  private realTimeAnalyzer: RealTimeAnalyzer;
  private trendAnalyzer: TrendAnalysisEngine;
  private config: MonitoringConfig;
  private startTime: number;
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning = false;
  private alerts: Map<string, PerformanceAlert> = new Map();

  constructor(config: Partial<MonitoringConfig> = {}) {
    super();
    this.config = {
      enabled: true,
      collectInterval: 5000, // 5 seconds
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      alertThresholds: {
        "system.cpu.usage": { warning: 70, critical: 90 },
        "system.memory.usage": { warning: 80, critical: 95 },
        "tool.execution.time": { warning: 5000, critical: 10000 },
        "tool.error.rate": { warning: 5, critical: 10 },
      },
      enableRealTimeAnalysis: true,
      enableTrendAnalysis: true,
      maxMetricsInMemory: 10000,
      enableAutoOptimization: false,
      ...config,
    };

    this.startTime = Date.now();
    this.metricsEngine = new MetricsCollectionEngine(this.config);
    this.realTimeAnalyzer = new RealTimeAnalyzer(this.config);
    this.trendAnalyzer = new TrendAnalysisEngine(this.config);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.metricsEngine.on("metric", (metric: PerformanceMetric) => {
      this.emit("metric", metric);

      if (this.config.enableRealTimeAnalysis) {
        this.realTimeAnalyzer.analyzeMetric(metric);
      }

      this.checkThresholds(metric);
    });

    this.realTimeAnalyzer.on("anomaly", (anomaly: any) => {
      const alert: PerformanceAlert = {
        id: `anomaly_${Date.now()}`,
        type: "anomaly",
        severity: "medium",
        metric: anomaly.metric,
        value: anomaly.value,
        message: `異常檢測: ${anomaly.metric} 值 ${anomaly.value} 偏離正常範圍`,
        timestamp: Date.now(),
        acknowledged: false,
      };
      this.handleAlert(alert);
    });

    this.trendAnalyzer.on("trend", (trend: any) => {
      if (trend.severity === "warning" || trend.severity === "critical") {
        const alert: PerformanceAlert = {
          id: `trend_${Date.now()}`,
          type: "trend",
          severity: trend.severity,
          metric: trend.metric,
          value: trend.currentValue,
          message: `趨勢告警: ${trend.metric} ${trend.direction === "increasing" ? "持續上升" : "持續下降"}`,
          timestamp: Date.now(),
          acknowledged: false,
        };
        this.handleAlert(alert);
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      console.log("Performance monitoring is disabled");
      return;
    }

    this.isRunning = true;

    // 啟動組件
    await this.metricsEngine.start();

    if (this.config.enableRealTimeAnalysis) {
      await this.realTimeAnalyzer.start();
    }

    if (this.config.enableTrendAnalysis) {
      await this.trendAnalyzer.start();
    }

    // 設置定期監控
    this.monitoringInterval = setInterval(() => {
      this.performSystemCheck();
    }, this.config.collectInterval);

    this.emit("started");
    console.log("Performance monitoring started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    await this.metricsEngine.stop();
    await this.realTimeAnalyzer.stop();
    await this.trendAnalyzer.stop();

    this.emit("stopped");
    console.log("Performance monitoring stopped");
  }

  async recordMetric(metric: Omit<PerformanceMetric, "timestamp">): Promise<void> {
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    await this.metricsEngine.recordMetric(fullMetric);
  }

  async getMetrics(
    metricNames?: string[],
    timeRange?: { start: number; end: number }
  ): Promise<PerformanceMetric[]> {
    return this.metricsEngine.getMetrics(metricNames, timeRange);
  }

  async getSystemHealth(): Promise<SystemHealthStatus> {
    const components = await this.metricsEngine.getComponentHealth();
    const alerts = Array.from(this.alerts.values());
    const activeAlerts = alerts.filter((a) => !a.acknowledged);

    // 計算整體健康狀態
    let overall: "healthy" | "warning" | "critical" = "healthy";
    const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
    const warningAlerts = activeAlerts.filter(
      (a) => a.severity === "high" || a.severity === "medium"
    );

    if (criticalAlerts.length > 0) {
      overall = "critical";
    } else if (warningAlerts.length > 0) {
      overall = "warning";
    }

    const totalMetrics = await this.metricsEngine.getMetricsCount();
    const systemLoad = await this.calculateSystemLoad();
    const uptime = Date.now() - this.startTime;

    return {
      overall,
      components,
      alerts,
      summary: {
        totalMetrics,
        activeAlerts: activeAlerts.length,
        systemLoad,
        uptime,
      },
    };
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit("alertAcknowledged", alert);
    }
  }

  getAlerts(severity?: string): PerformanceAlert[] {
    const alerts = Array.from(this.alerts.values());
    if (severity) {
      return alerts.filter((a) => a.severity === severity);
    }
    return alerts;
  }

  async generateReport(
    options: {
      timeRange?: { start: number; end: number };
      components?: string[];
      includeMetrics?: boolean;
      includeAlerts?: boolean;
      includeTrends?: boolean;
    } = {}
  ): Promise<{
    summary: any;
    metrics?: PerformanceMetric[];
    alerts?: PerformanceAlert[];
    trends?: any[];
    recommendations?: string[];
  }> {
    const {
      timeRange,
      components,
      includeMetrics = true,
      includeAlerts = true,
      includeTrends = true,
    } = options;

    const health = await this.getSystemHealth();
    const report: any = {
      summary: {
        reportTime: Date.now(),
        timeRange,
        systemHealth: health.overall,
        totalComponents: Object.keys(health.components).length,
        totalAlerts: health.alerts.length,
        uptime: health.summary.uptime,
      },
    };

    if (includeMetrics) {
      report.metrics = await this.getMetrics(components, timeRange);
    }

    if (includeAlerts) {
      report.alerts = this.getAlerts();
    }

    if (includeTrends) {
      report.trends = await this.trendAnalyzer.getTrends(timeRange);
    }

    // 生成建議
    report.recommendations = await this.generateOptimizationRecommendations();

    return report;
  }

  private async performSystemCheck(): Promise<void> {
    try {
      // 收集系統指標
      await this.collectSystemMetrics();

      // 清理過期數據
      await this.cleanupExpiredData();

      // 檢查系統健康
      const health = await this.getSystemHealth();
      this.emit("healthCheck", health);
    } catch (error) {
      console.error("System check failed:", error);
      this.emit("error", error);
    }
  }

  private async collectSystemMetrics(): Promise<void> {
    // CPU 使用率
    const cpuUsage = process.cpuUsage();
    await this.recordMetric({
      name: "system.cpu.user",
      value: cpuUsage.user / 1000000, // 轉換為秒
      type: "gauge",
      unit: "seconds",
    });

    await this.recordMetric({
      name: "system.cpu.system",
      value: cpuUsage.system / 1000000,
      type: "gauge",
      unit: "seconds",
    });

    // 內存使用
    const memUsage = process.memoryUsage();
    await this.recordMetric({
      name: "system.memory.rss",
      value: memUsage.rss,
      type: "gauge",
      unit: "bytes",
    });

    await this.recordMetric({
      name: "system.memory.heap.used",
      value: memUsage.heapUsed,
      type: "gauge",
      unit: "bytes",
    });

    await this.recordMetric({
      name: "system.memory.heap.total",
      value: memUsage.heapTotal,
      type: "gauge",
      unit: "bytes",
    });

    // 計算內存使用率百分比
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    await this.recordMetric({
      name: "system.memory.usage",
      value: memUsagePercent,
      type: "gauge",
      unit: "percent",
    });
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.config.alertThresholds[metric.name];
    if (!threshold) return;

    let severity: "low" | "medium" | "high" | "critical" | undefined;
    let thresholdValue: number | undefined;

    if (metric.value >= threshold.critical) {
      severity = "critical";
      thresholdValue = threshold.critical;
    } else if (metric.value >= threshold.warning) {
      severity = "high";
      thresholdValue = threshold.warning;
    }

    if (severity && thresholdValue !== undefined) {
      const alertId = `threshold_${metric.name}_${Date.now()}`;
      const alert: PerformanceAlert = {
        id: alertId,
        type: "threshold",
        severity,
        metric: metric.name,
        value: metric.value,
        threshold: thresholdValue,
        message: `閾值告警: ${metric.name} 值 ${metric.value} 超過 ${severity} 閾值 ${thresholdValue}`,
        timestamp: Date.now(),
        acknowledged: false,
      };

      this.handleAlert(alert);
    }
  }

  private handleAlert(alert: PerformanceAlert): void {
    this.alerts.set(alert.id, alert);
    this.emit("alert", alert);

    // 清理舊的已確認告警（保留最近100個）
    const allAlerts = Array.from(this.alerts.values());
    const acknowledgedAlerts = allAlerts
      .filter((a) => a.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (acknowledgedAlerts.length > 100) {
      const toRemove = acknowledgedAlerts.slice(100);
      toRemove.forEach((alert) => this.alerts.delete(alert.id));
    }
  }

  private async cleanupExpiredData(): Promise<void> {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    await this.metricsEngine.cleanupExpiredMetrics(cutoffTime);

    // 清理過期告警
    const expiredAlerts = Array.from(this.alerts.entries()).filter(
      ([_, alert]) => alert.timestamp < cutoffTime && alert.acknowledged
    );

    expiredAlerts.forEach(([id]) => this.alerts.delete(id));
  }

  private async calculateSystemLoad(): Promise<number> {
    const metrics = await this.getMetrics(["system.cpu.usage", "system.memory.usage"], {
      start: Date.now() - 60000, // 最近1分鐘
      end: Date.now(),
    });

    if (metrics.length === 0) return 0;

    // 計算 CPU 和內存使用率的加權平均
    const cpuMetrics = metrics.filter((m) => m.name === "system.cpu.usage");
    const memMetrics = metrics.filter((m) => m.name === "system.memory.usage");

    const avgCpu = cpuMetrics.reduce((sum, m) => sum + m.value, 0) / Math.max(cpuMetrics.length, 1);
    const avgMem = memMetrics.reduce((sum, m) => sum + m.value, 0) / Math.max(memMetrics.length, 1);

    return avgCpu * 0.4 + avgMem * 0.6; // 內存權重較高
  }

  private async generateOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const health = await this.getSystemHealth();

    // 基於告警生成建議
    const criticalAlerts = health.alerts.filter(
      (a) => a.severity === "critical" && !a.acknowledged
    );

    if (criticalAlerts.length > 0) {
      recommendations.push("檢測到關鍵性能問題，建議立即檢查系統資源使用情況");
    }

    if (health.summary.systemLoad > 80) {
      recommendations.push("系統負載過高，建議優化或擴展資源");
    }

    // 基於趨勢生成建議
    const trends = await this.trendAnalyzer.getTrends();
    const increasingErrorTrends = trends.filter(
      (t: any) => t.metric.includes("error") && t.direction === "increasing"
    );

    if (increasingErrorTrends.length > 0) {
      recommendations.push("錯誤率呈上升趨勢，建議檢查相關組件的穩定性");
    }

    // 基於內存使用生成建議
    const memoryComponents = Object.entries(health.components).filter(
      ([_, component]) => component.metrics["memory.usage"] > 80
    );

    if (memoryComponents.length > 0) {
      recommendations.push(
        `以下組件內存使用率過高: ${memoryComponents.map(([name]) => name).join(", ")}`
      );
    }

    return recommendations;
  }

  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit("configUpdated", this.config);
  }
}
