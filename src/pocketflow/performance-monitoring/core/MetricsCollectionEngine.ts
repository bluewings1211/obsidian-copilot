import { EventEmitter } from "events";
import { PerformanceMetric, MonitoringConfig } from "./PerformanceMonitoringManager";

export interface MetricsSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface ComponentHealth {
  status: "healthy" | "warning" | "critical";
  metrics: Record<string, number>;
  lastCheck: number;
}

export class MetricsCollectionEngine extends EventEmitter {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private config: MonitoringConfig;
  private isRunning = false;
  private collectionInterval?: NodeJS.Timeout;
  private totalMetricsCount = 0;

  // 組件健康狀態追蹤
  private componentHealth: Map<string, ComponentHealth> = new Map();
  private lastSystemCheck = 0;

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期數據收集
    this.collectionInterval = setInterval(() => {
      this.performDataMaintenance();
    }, this.config.collectInterval);

    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }

    this.emit("stopped");
  }

  async recordMetric(metric: PerformanceMetric): Promise<void> {
    const metricName = metric.name;

    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, []);
    }

    const metricArray = this.metrics.get(metricName)!;
    metricArray.push(metric);
    this.totalMetricsCount++;

    // 限制內存中的指標數量
    if (metricArray.length > this.config.maxMetricsInMemory) {
      const removeCount = Math.floor(this.config.maxMetricsInMemory * 0.1); // 移除10%
      metricArray.splice(0, removeCount);
    }

    // 更新組件健康狀態
    this.updateComponentHealth(metric);

    // 發出指標事件
    this.emit("metric", metric);
  }

  async getMetrics(
    metricNames?: string[],
    timeRange?: { start: number; end: number }
  ): Promise<PerformanceMetric[]> {
    const result: PerformanceMetric[] = [];
    const names = metricNames || Array.from(this.metrics.keys());

    for (const name of names) {
      const metricArray = this.metrics.get(name);
      if (!metricArray) continue;

      let filteredMetrics = metricArray;

      if (timeRange) {
        filteredMetrics = metricArray.filter(
          (m) => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
        );
      }

      result.push(...filteredMetrics);
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getMetricSummary(
    metricName: string,
    timeRange?: { start: number; end: number }
  ): Promise<MetricsSummary | null> {
    const metrics = await this.getMetrics([metricName], timeRange);
    if (metrics.length === 0) return null;

    const values = metrics.map((m) => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const min = values[0];
    const max = values[count - 1];
    const avg = sum / count;

    const p50 = this.percentile(values, 50);
    const p90 = this.percentile(values, 90);
    const p95 = this.percentile(values, 95);
    const p99 = this.percentile(values, 99);

    return { count, sum, min, max, avg, p50, p90, p95, p99 };
  }

  async getComponentHealth(): Promise<Record<string, ComponentHealth>> {
    const now = Date.now();

    // 如果距離上次系統檢查超過1分鐘，更新系統健康狀態
    if (now - this.lastSystemCheck > 60000) {
      await this.updateSystemHealth();
      this.lastSystemCheck = now;
    }

    return Object.fromEntries(this.componentHealth.entries());
  }

  async getMetricsCount(): Promise<number> {
    return this.totalMetricsCount;
  }

  async cleanupExpiredMetrics(cutoffTime: number): Promise<void> {
    let removedCount = 0;

    for (const [metricName, metricArray] of this.metrics.entries()) {
      const initialLength = metricArray.length;
      const filteredArray = metricArray.filter((m) => m.timestamp >= cutoffTime);

      this.metrics.set(metricName, filteredArray);
      removedCount += initialLength - filteredArray.length;
    }

    this.totalMetricsCount -= removedCount;
    this.emit("metricsCleanup", { removedCount, cutoffTime });
  }

  async getTopMetrics(
    limit: number = 10,
    sortBy: "count" | "latest" | "highest" = "count"
  ): Promise<
    Array<{
      name: string;
      count: number;
      latestValue: number;
      latestTimestamp: number;
      summary: MetricsSummary;
    }>
  > {
    const result: any[] = [];

    for (const [metricName, metricArray] of this.metrics.entries()) {
      if (metricArray.length === 0) continue;

      const latest = metricArray[metricArray.length - 1];
      const summary = await this.getMetricSummary(metricName);

      if (summary) {
        result.push({
          name: metricName,
          count: metricArray.length,
          latestValue: latest.value,
          latestTimestamp: latest.timestamp,
          summary,
        });
      }
    }

    // 排序
    switch (sortBy) {
      case "count":
        result.sort((a, b) => b.count - a.count);
        break;
      case "latest":
        result.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
        break;
      case "highest":
        result.sort((a, b) => b.latestValue - a.latestValue);
        break;
    }

    return result.slice(0, limit);
  }

  async exportMetrics(
    format: "json" | "csv" | "prometheus",
    options?: {
      metricNames?: string[];
      timeRange?: { start: number; end: number };
    }
  ): Promise<string> {
    const metrics = await this.getMetrics(options?.metricNames, options?.timeRange);

    switch (format) {
      case "json":
        return JSON.stringify(metrics, null, 2);

      case "csv":
        return this.exportToCsv(metrics);

      case "prometheus":
        return this.exportToPrometheus(metrics);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private updateComponentHealth(metric: PerformanceMetric): void {
    const componentName = this.extractComponentName(metric.name);

    if (!this.componentHealth.has(componentName)) {
      this.componentHealth.set(componentName, {
        status: "healthy",
        metrics: {},
        lastCheck: Date.now(),
      });
    }

    const health = this.componentHealth.get(componentName)!;
    health.metrics[metric.name] = metric.value;
    health.lastCheck = Date.now();

    // 評估健康狀態
    health.status = this.evaluateComponentHealth(health.metrics);
  }

  private extractComponentName(metricName: string): string {
    // 從指標名稱提取組件名稱
    // 例如: "system.cpu.usage" -> "system"
    // "tool.execution.time" -> "tool"
    // "mcp.connection.count" -> "mcp"

    const parts = metricName.split(".");
    return parts[0] || "unknown";
  }

  private evaluateComponentHealth(
    metrics: Record<string, number>
  ): "healthy" | "warning" | "critical" {
    let maxSeverity: "healthy" | "warning" | "critical" = "healthy";

    for (const [metricName, value] of Object.entries(metrics)) {
      const threshold = this.config.alertThresholds[metricName];
      if (!threshold) continue;

      if (value >= threshold.critical) {
        return "critical"; // 立即返回最高嚴重程度
      } else if (value >= threshold.warning) {
        maxSeverity = "warning";
      }
    }

    return maxSeverity;
  }

  private async updateSystemHealth(): Promise<void> {
    // 更新系統整體健康狀態
    const systemMetrics: Record<string, number> = {};

    // 獲取最新的系統指標
    const recentMetrics = await this.getMetrics(
      ["system.cpu.usage", "system.memory.usage", "system.memory.heap.used"],
      { start: Date.now() - 60000, end: Date.now() }
    );

    for (const metric of recentMetrics) {
      systemMetrics[metric.name] = metric.value;
    }

    // 更新系統組件健康狀態
    if (Object.keys(systemMetrics).length > 0) {
      this.componentHealth.set("system", {
        status: this.evaluateComponentHealth(systemMetrics),
        metrics: systemMetrics,
        lastCheck: Date.now(),
      });
    }
  }

  private performDataMaintenance(): void {
    // 執行數據維護任務
    this.emit("maintenance", {
      timestamp: Date.now(),
      metricsCount: this.totalMetricsCount,
      componentsCount: this.componentHealth.size,
    });
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;

    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArray[lower];
    }

    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  private exportToCsv(metrics: PerformanceMetric[]): string {
    if (metrics.length === 0) return "";

    const headers = ["timestamp", "name", "value", "type", "unit", "labels"];
    const rows = [headers.join(",")];

    for (const metric of metrics) {
      const labels = metric.labels ? JSON.stringify(metric.labels) : "";
      const row = [
        metric.timestamp,
        `"${metric.name}"`,
        metric.value,
        metric.type,
        metric.unit || "",
        `"${labels}"`,
      ];
      rows.push(row.join(","));
    }

    return rows.join("\n");
  }

  private exportToPrometheus(metrics: PerformanceMetric[]): string {
    const lines: string[] = [];
    const metricsByName = new Map<string, PerformanceMetric[]>();

    // 按名稱分組指標
    for (const metric of metrics) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }

    // 生成 Prometheus 格式
    for (const [metricName, metricList] of metricsByName.entries()) {
      const latest = metricList[metricList.length - 1];

      // 添加 HELP 和 TYPE
      lines.push(`# HELP ${metricName} Performance metric`);
      lines.push(`# TYPE ${metricName} ${latest.type}`);

      // 添加指標值
      const labelsStr = latest.labels
        ? Object.entries(latest.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(",")
        : "";

      const metricLine = labelsStr
        ? `${metricName}{${labelsStr}} ${latest.value} ${latest.timestamp}`
        : `${metricName} ${latest.value} ${latest.timestamp}`;

      lines.push(metricLine);
    }

    return lines.join("\n");
  }

  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  async getMetricHistory(
    metricName: string,
    maxPoints: number = 100
  ): Promise<{ timestamp: number; value: number }[]> {
    const metricArray = this.metrics.get(metricName);
    if (!metricArray) return [];

    // 如果數據點數量小於等於 maxPoints，直接返回
    if (metricArray.length <= maxPoints) {
      return metricArray.map((m) => ({ timestamp: m.timestamp, value: m.value }));
    }

    // 否則進行下採樣
    const step = Math.floor(metricArray.length / maxPoints);
    const result: { timestamp: number; value: number }[] = [];

    for (let i = 0; i < metricArray.length; i += step) {
      const metric = metricArray[i];
      result.push({ timestamp: metric.timestamp, value: metric.value });
    }

    return result;
  }
}
