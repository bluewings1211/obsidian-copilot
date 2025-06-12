/**
 * 搜索性能儀表板
 * 提供可視化的搜索性能監控界面
 */

import { EventEmitter } from "events";
import {
  DashboardConfig,
  DashboardComponent,
  DashboardComponentType,
  PerformanceMetrics,
  ComponentConfig,
  VisualizationConfig,
  DashboardData,
  WidgetData,
} from "../types";
import { UnifiedSearchMonitor } from "./UnifiedSearchMonitor";

export interface SearchDashboardOptions {
  monitor: UnifiedSearchMonitor;
  config: VisualizationConfig;
  refreshInterval?: number;
  theme?: string;
}

export class SearchDashboard extends EventEmitter {
  private monitor: UnifiedSearchMonitor;
  private config: VisualizationConfig;
  private widgets: Map<string, DashboardWidget> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

  constructor(options: SearchDashboardOptions) {
    super();
    this.monitor = options.monitor;
    this.config = options.config;
    this.setupDashboard();
    this.setupRefreshTimer(options.refreshInterval || 5000);
  }

  /**
   * 啟動儀表板
   */
  async start(): Promise<void> {
    this.isActive = true;

    // 初始化所有小部件
    for (const widget of this.widgets.values()) {
      await widget.initialize();
    }

    // 開始定時刷新
    this.startRefresh();

    this.emit("dashboard:started");
    console.log("📊 搜索性能儀表板已啟動");
  }

  /**
   * 停止儀表板
   */
  async stop(): Promise<void> {
    this.isActive = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.emit("dashboard:stopped");
    console.log("📊 搜索性能儀表板已停止");
  }

  /**
   * 獲取儀表板數據
   */
  async getDashboardData(): Promise<DashboardData> {
    const widgetData: WidgetData[] = [];

    for (const [id, widget] of this.widgets) {
      try {
        const data = await widget.getData();
        widgetData.push({
          id,
          type: widget.getType(),
          data,
          lastUpdate: new Date(),
        });
      } catch (error) {
        console.warn(`獲取小部件數據失敗: ${id}`, error);
        widgetData.push({
          id,
          type: widget.getType(),
          data: null,
          error: (error as Error).message,
          lastUpdate: new Date(),
        });
      }
    }

    return {
      timestamp: new Date(),
      widgets: widgetData,
      layout: this.config.dashboard.components,
      theme: this.config.themes.name,
      status: this.isActive ? "active" : "inactive",
    };
  }

  /**
   * 添加小部件
   */
  addWidget(id: string, config: DashboardComponent): void {
    const widget = this.createWidget(config);
    this.widgets.set(id, widget);
    this.emit("widget:added", { id, type: config.type });
  }

  /**
   * 移除小部件
   */
  removeWidget(id: string): void {
    if (this.widgets.has(id)) {
      this.widgets.delete(id);
      this.emit("widget:removed", { id });
    }
  }

  /**
   * 更新小部件配置
   */
  updateWidget(id: string, config: Partial<DashboardComponent>): void {
    const widget = this.widgets.get(id);
    if (widget) {
      widget.updateConfig(config);
      this.emit("widget:updated", { id, config });
    }
  }

  /**
   * 獲取實時狀態
   */
  getRealTimeStatus(): DashboardStatus {
    return {
      active: this.isActive,
      widgetCount: this.widgets.size,
      lastRefresh: new Date(),
      performance: this.getPerformanceStats(),
      alerts: this.getActiveAlerts(),
    };
  }

  /**
   * 導出儀表板配置
   */
  exportConfig(): DashboardConfig {
    return {
      refreshInterval: 5000,
      timeRange: {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
        granularity: "minute" as any,
      },
      components: Array.from(this.widgets.entries()).map(([id, widget]) => ({
        id,
        type: widget.getType(),
        title: widget.getTitle(),
        config: widget.getConfig(),
        position: widget.getPosition(),
      })),
      alertRules: [],
      exportFormats: ["json", "csv"] as any[],
    };
  }

  /**
   * 導入儀表板配置
   */
  importConfig(config: DashboardConfig): void {
    // 清除現有小部件
    this.widgets.clear();

    // 創建新小部件
    for (const componentConfig of config.components) {
      this.addWidget(componentConfig.id, componentConfig);
    }

    this.emit("config:imported", { componentCount: config.components.length });
  }

  /**
   * 創建快照
   */
  async createSnapshot(): Promise<DashboardSnapshot> {
    const data = await this.getDashboardData();

    return {
      id: this.generateSnapshotId(),
      timestamp: new Date(),
      name: `快照_${new Date().toISOString()}`,
      data,
      config: this.exportConfig(),
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private setupDashboard(): void {
    // 設置預設小部件
    this.createDefaultWidgets();

    // 監聽監控事件
    this.monitor.on("metrics:updated", (data) => {
      this.handleMetricsUpdate(data);
    });

    this.monitor.on("anomaly:detected", (anomaly) => {
      this.handleAnomalyDetected(anomaly);
    });
  }

  private createDefaultWidgets(): void {
    // 性能概覽
    this.addWidget("performance_overview", {
      id: "performance_overview",
      type: DashboardComponentType.METRIC_CARD,
      title: "性能概覽",
      config: {
        metrics: ["latency.p95", "throughput.requestsPerSecond", "errors.errorRate"],
        dimensions: [],
        filters: {},
        aggregation: "average" as any,
        displayOptions: {
          format: "number",
          precision: 2,
        },
      },
      position: { x: 0, y: 0, width: 4, height: 2 },
    });

    // 延遲趨勢圖
    this.addWidget("latency_trend", {
      id: "latency_trend",
      type: DashboardComponentType.LINE_CHART,
      title: "搜索延遲趨勢",
      config: {
        metrics: ["latency.p50", "latency.p95", "latency.p99"],
        dimensions: ["timestamp"],
        filters: {},
        aggregation: "average" as any,
        displayOptions: {
          xAxis: "timestamp",
          yAxis: "latency",
          unit: "ms",
        },
      },
      position: { x: 4, y: 0, width: 8, height: 4 },
    });

    // 組件狀態
    this.addWidget("component_status", {
      id: "component_status",
      type: DashboardComponentType.PIE_CHART,
      title: "組件狀態分佈",
      config: {
        metrics: ["component.status"],
        dimensions: ["component"],
        filters: {},
        aggregation: "count" as any,
        displayOptions: {
          colors: ["#4CAF50", "#FF9800", "#F44336"],
        },
      },
      position: { x: 0, y: 2, width: 4, height: 4 },
    });

    // 搜索質量指標
    this.addWidget("quality_metrics", {
      id: "quality_metrics",
      type: DashboardComponentType.BAR_CHART,
      title: "搜索質量指標",
      config: {
        metrics: ["quality.relevanceScore", "quality.ndcgScore", "quality.diversityScore"],
        dimensions: ["metric"],
        filters: {},
        aggregation: "average" as any,
        displayOptions: {
          orientation: "horizontal",
        },
      },
      position: { x: 0, y: 6, width: 6, height: 3 },
    });

    // 用戶體驗指標
    this.addWidget("user_experience", {
      id: "user_experience",
      type: DashboardComponentType.GAUGE,
      title: "用戶體驗分數",
      config: {
        metrics: ["userExperience.searchSatisfaction"],
        dimensions: [],
        filters: {},
        aggregation: "average" as any,
        displayOptions: {
          min: 0,
          max: 1,
          thresholds: [0.7, 0.85],
        },
      },
      position: { x: 6, y: 6, width: 3, height: 3 },
    });

    // 實時活動
    this.addWidget("real_time_activity", {
      id: "real_time_activity",
      type: DashboardComponentType.TABLE,
      title: "實時搜索活動",
      config: {
        metrics: ["event.type", "event.component", "event.timestamp"],
        dimensions: ["event"],
        filters: { realTime: true },
        aggregation: "count" as any,
        displayOptions: {
          pageSize: 10,
          sortBy: "timestamp",
          sortOrder: "desc",
        },
      },
      position: { x: 9, y: 6, width: 3, height: 3 },
    });
  }

  private createWidget(config: DashboardComponent): DashboardWidget {
    switch (config.type) {
      case DashboardComponentType.METRIC_CARD:
        return new MetricCardWidget(config, this.monitor);
      case DashboardComponentType.LINE_CHART:
        return new LineChartWidget(config, this.monitor);
      case DashboardComponentType.BAR_CHART:
        return new BarChartWidget(config, this.monitor);
      case DashboardComponentType.PIE_CHART:
        return new PieChartWidget(config, this.monitor);
      case DashboardComponentType.GAUGE:
        return new GaugeWidget(config, this.monitor);
      case DashboardComponentType.TABLE:
        return new TableWidget(config, this.monitor);
      case DashboardComponentType.HEATMAP:
        return new HeatmapWidget(config, this.monitor);
      case DashboardComponentType.HISTOGRAM:
        return new HistogramWidget(config, this.monitor);
      default:
        throw new Error(`不支持的小部件類型: ${config.type}`);
    }
  }

  private setupRefreshTimer(interval: number): void {
    this.refreshTimer = setInterval(() => {
      if (this.isActive) {
        this.refreshAllWidgets();
      }
    }, interval);
  }

  private startRefresh(): void {
    this.refreshAllWidgets();
  }

  private async refreshAllWidgets(): Promise<void> {
    const promises = Array.from(this.widgets.values()).map((widget) =>
      widget.refresh().catch((error) => {
        console.warn(`小部件刷新失敗: ${widget.getId()}`, error);
      })
    );

    await Promise.all(promises);
    this.emit("dashboard:refreshed");
  }

  private handleMetricsUpdate(data: any): void {
    // 處理指標更新
    this.emit("metrics:updated", data);
  }

  private handleAnomalyDetected(anomaly: any): void {
    // 處理異常檢測
    this.emit("anomaly:detected", anomaly);
  }

  private getPerformanceStats(): PerformanceStats {
    return {
      renderTime: 150, // ms
      dataFreshness: 5000, // ms
      widgetErrors: 0,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
    };
  }

  private getActiveAlerts(): Alert[] {
    // 獲取活躍警報
    return [];
  }

  private generateSnapshotId(): string {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// 抽象小部件基類
// ============================================================================

abstract class DashboardWidget {
  protected config: DashboardComponent;
  protected monitor: UnifiedSearchMonitor;
  protected lastData: any = null;
  protected lastUpdate: Date = new Date();

  constructor(config: DashboardComponent, monitor: UnifiedSearchMonitor) {
    this.config = config;
    this.monitor = monitor;
  }

  abstract initialize(): Promise<void>;
  abstract getData(): Promise<any>;
  abstract getType(): DashboardComponentType;

  getId(): string {
    return this.config.id;
  }

  getTitle(): string {
    return this.config.title;
  }

  getConfig(): ComponentConfig {
    return this.config.config;
  }

  getPosition(): any {
    return this.config.position;
  }

  updateConfig(newConfig: Partial<DashboardComponent>): void {
    this.config = { ...this.config, ...newConfig };
  }

  async refresh(): Promise<void> {
    try {
      this.lastData = await this.getData();
      this.lastUpdate = new Date();
    } catch (error) {
      console.error(`小部件刷新失敗: ${this.getId()}`, error);
      throw error;
    }
  }
}

// ============================================================================
// 具體小部件實現
// ============================================================================

class MetricCardWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化指標卡片小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    const metrics = await this.monitor.getMetrics();
    const metricValues: Record<string, number> = {};

    for (const metricPath of this.config.config.metrics) {
      metricValues[metricPath] = this.getMetricValue(metrics, metricPath);
    }

    return {
      type: "metric_card",
      metrics: metricValues,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.METRIC_CARD;
  }

  private getMetricValue(metrics: PerformanceMetrics, path: string): number {
    const parts = path.split(".");
    let value: any = metrics;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) return 0;
    }

    return typeof value === "number" ? value : 0;
  }
}

class LineChartWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化線圖小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    const metrics = await this.monitor.getMetrics();

    // 模擬時間序列數據
    const timePoints = Array.from({ length: 20 }, (_, i) => {
      const time = new Date(Date.now() - (19 - i) * 30000); // 每30秒一個點
      return {
        timestamp: time,
        values: this.config.config.metrics.reduce(
          (acc, metric) => {
            acc[metric] = this.getMetricValue(metrics, metric) + Math.random() * 10 - 5;
            return acc;
          },
          {} as Record<string, number>
        ),
      };
    });

    return {
      type: "line_chart",
      data: timePoints,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.LINE_CHART;
  }

  private getMetricValue(metrics: PerformanceMetrics, path: string): number {
    const parts = path.split(".");
    let value: any = metrics;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) return 0;
    }

    return typeof value === "number" ? value : 0;
  }
}

class BarChartWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化柱狀圖小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    const metrics = await this.monitor.getMetrics();

    const data = this.config.config.metrics.map((metric) => ({
      name: metric,
      value: this.getMetricValue(metrics, metric),
    }));

    return {
      type: "bar_chart",
      data,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.BAR_CHART;
  }

  private getMetricValue(metrics: PerformanceMetrics, path: string): number {
    const parts = path.split(".");
    let value: any = metrics;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) return Math.random();
    }

    return typeof value === "number" ? value : Math.random();
  }
}

class PieChartWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化餅圖小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    const componentStatus = this.monitor.getComponentStatus();

    const statusCounts = { healthy: 0, warning: 0, critical: 0 };

    for (const status of componentStatus.values()) {
      statusCounts[status.health]++;
    }

    const data = Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count,
    }));

    return {
      type: "pie_chart",
      data,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.PIE_CHART;
  }
}

class GaugeWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化儀表盤小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    const metrics = await this.monitor.getMetrics();
    const metricPath = this.config.config.metrics[0];
    const value = this.getMetricValue(metrics, metricPath);

    return {
      type: "gauge",
      value,
      min: this.config.config.displayOptions.min || 0,
      max: this.config.config.displayOptions.max || 1,
      thresholds: this.config.config.displayOptions.thresholds || [0.7, 0.85],
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.GAUGE;
  }

  private getMetricValue(metrics: PerformanceMetrics, path: string): number {
    const parts = path.split(".");
    let value: any = metrics;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) return 0;
    }

    return typeof value === "number" ? value : 0;
  }
}

class TableWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化表格小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    // const stats = this.monitor.getRealTimeStats();
    const componentStatus = this.monitor.getComponentStatus();

    const rows = Array.from(componentStatus.entries()).map(([component, status]) => ({
      component,
      status: status.status,
      health: status.health,
      lastUpdate: status.lastUpdate.toISOString(),
    }));

    return {
      type: "table",
      headers: ["Component", "Status", "Health", "Last Update"],
      rows,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.TABLE;
  }
}

class HeatmapWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化熱力圖小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    // 模擬熱力圖數據
    const data = Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, hour) => ({
        day,
        hour,
        value: Math.random() * 100,
      }))
    ).flat();

    return {
      type: "heatmap",
      data,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.HEATMAP;
  }
}

class HistogramWidget extends DashboardWidget {
  async initialize(): Promise<void> {
    console.log(`初始化直方圖小部件: ${this.getId()}`);
  }

  async getData(): Promise<any> {
    // const metrics = await this.monitor.getMetrics();

    // 模擬直方圖數據（延遲分佈）
    const bins = Array.from({ length: 10 }, (_, i) => {
      const start = i * 100;
      const end = (i + 1) * 100;
      return {
        range: `${start}-${end}ms`,
        count: Math.floor(Math.random() * 50),
      };
    });

    return {
      type: "histogram",
      data: bins,
      timestamp: new Date(),
    };
  }

  getType(): DashboardComponentType {
    return DashboardComponentType.HISTOGRAM;
  }
}

// ============================================================================
// 輔助類型
// ============================================================================

interface DashboardStatus {
  active: boolean;
  widgetCount: number;
  lastRefresh: Date;
  performance: PerformanceStats;
  alerts: Alert[];
}

interface PerformanceStats {
  renderTime: number;
  dataFreshness: number;
  widgetErrors: number;
  memoryUsage: number;
}

interface Alert {
  id: string;
  severity: string;
  message: string;
  timestamp: Date;
}

interface DashboardSnapshot {
  id: string;
  timestamp: Date;
  name: string;
  data: DashboardData;
  config: DashboardConfig;
}
