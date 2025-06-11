/**
 * MCP 指標收集器
 *
 * 提供全面的 MCP 系統性能指標收集功能：
 * - 實時性能監控
 * - 資源使用追蹤
 * - 趨勢分析
 * - 告警觸發
 */

import { EventEmitter } from "events";
import { loadavg, totalmem } from "os";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 指標類型
 */
export enum MetricType {
  COUNTER = "counter", // 計數器（只能增加）
  GAUGE = "gauge", // 計量器（可增可減）
  HISTOGRAM = "histogram", // 直方圖（分佈統計）
  SUMMARY = "summary", // 摘要（分位數統計）
  TIMER = "timer", // 計時器
}

/**
 * 指標數據點
 */
export interface MetricDataPoint {
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

/**
 * 指標定義
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels?: string[];
  buckets?: number[]; // 用於 histogram
  quantiles?: number[]; // 用於 summary
}

/**
 * 聚合指標
 */
export interface AggregatedMetric {
  name: string;
  type: MetricType;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
  rate?: number; // 每秒變化率
  labels: Record<string, string>;
  lastUpdated: Date;
}

/**
 * 系統指標
 */
export interface SystemMetrics {
  cpu: {
    usage: number; // 0-100%
    loadAverage: number[];
  };
  memory: {
    used: number; // bytes
    total: number; // bytes
    heapUsed: number; // bytes
    heapTotal: number; // bytes
    external: number; // bytes
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connectionsActive: number;
    connectionsTotal: number;
  };
  disk: {
    reads: number;
    writes: number;
    readBytes: number;
    writeBytes: number;
  };
}

/**
 * MCP 特定指標
 */
export interface McpMetrics {
  connections: {
    active: number;
    total: number;
    failed: number;
    avgDuration: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
  };
  tools: {
    callsTotal: number;
    callsSuccessful: number;
    callsFailed: number;
    avgExecutionTime: number;
    toolsAvailable: number;
    topTools: Array<{
      name: string;
      calls: number;
      avgTime: number;
    }>;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    size: number;
    memoryUsage: number;
  };
  errors: {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    errorRate: number;
  };
}

/**
 * 告警規則
 */
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: "gt" | "lt" | "eq" | "ne" | "gte" | "lte";
  threshold: number;
  duration: number; // 持續時間（毫秒）
  severity: "critical" | "warning" | "info";
  enabled: boolean;
  labels?: Record<string, string>;
}

/**
 * 告警實例
 */
export interface Alert {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  startTime: Date;
  endTime?: Date;
  labels: Record<string, string>;
  status: "firing" | "resolved";
}

/**
 * 指標收集器配置
 */
export interface MetricsConfig {
  /** 收集間隔（毫秒） */
  collectionInterval?: number;
  /** 數據保留時間（毫秒） */
  retentionPeriod?: number;
  /** 最大數據點數量 */
  maxDataPoints?: number;
  /** 啟用系統指標收集 */
  enableSystemMetrics?: boolean;
  /** 啟用告警 */
  enableAlerting?: boolean;
  /** 告警檢查間隔（毫秒） */
  alertCheckInterval?: number;
  /** 自定義指標 */
  customMetrics?: MetricDefinition[];
  /** 告警規則 */
  alertRules?: AlertRule[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 指標收集器事件
 */
export interface MetricsEvents {
  metricUpdated: (metric: AggregatedMetric) => void;
  alertFiring: (alert: Alert) => void;
  alertResolved: (alert: Alert) => void;
  systemMetricsUpdated: (metrics: SystemMetrics) => void;
  mcpMetricsUpdated: (metrics: McpMetrics) => void;
  dataRetention: (removedCount: number, retainedCount: number) => void;
}

/**
 * 內部指標存儲
 */
interface MetricStore {
  definition: MetricDefinition;
  dataPoints: MetricDataPoint[];
  aggregated: AggregatedMetric;
}

/**
 * 告警狀態
 */
interface AlertState {
  rule: AlertRule;
  firstTriggered?: Date;
  lastChecked: Date;
  currentAlert?: Alert;
  consecutiveViolations: number;
}

/**
 * MCP 指標收集器
 */
export class McpMetricsCollector extends EventEmitter {
  private config: Required<MetricsConfig>;
  private metrics = new Map<string, MetricStore>();
  private alerts = new Map<string, AlertState>();
  private collectionTimer: NodeJS.Timeout | null = null;
  private alertTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private logger = createLogger("McpMetricsCollector");

  constructor(config: MetricsConfig = {}) {
    super();

    this.config = {
      collectionInterval: config.collectionInterval || 10000, // 10 seconds
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
      maxDataPoints: config.maxDataPoints || 8640, // 24h with 10s interval
      enableSystemMetrics: config.enableSystemMetrics ?? true,
      enableAlerting: config.enableAlerting ?? true,
      alertCheckInterval: config.alertCheckInterval || 30000, // 30 seconds
      customMetrics: config.customMetrics || [],
      alertRules: config.alertRules || [],
      debug: config.debug ?? false,
    };

    this.initializeBuiltinMetrics();
    this.initializeCustomMetrics();
    this.initializeAlertRules();
  }

  /**
   * 啟動指標收集器
   */
  public start(): void {
    this.logger.info("啟動 MCP 指標收集器", { config: this.config });

    // 啟動指標收集
    this.startCollection();

    // 啟動告警檢查
    if (this.config.enableAlerting) {
      this.startAlerting();
    }

    // 啟動數據保留清理
    this.startRetention();
  }

  /**
   * 停止指標收集器
   */
  public stop(): void {
    this.logger.info("停止 MCP 指標收集器");

    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    if (this.alertTimer) {
      clearInterval(this.alertTimer);
      this.alertTimer = null;
    }

    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
  }

  /**
   * 記錄指標值
   */
  public recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      this.logger.debug(`未知指標: ${name}`);
      return;
    }

    const dataPoint: MetricDataPoint = {
      value,
      timestamp: new Date(),
      labels,
    };

    metric.dataPoints.push(dataPoint);

    // 限制數據點數量
    if (metric.dataPoints.length > this.config.maxDataPoints) {
      metric.dataPoints = metric.dataPoints.slice(-this.config.maxDataPoints);
    }

    // 更新聚合指標
    this.updateAggregatedMetric(metric);
    this.emit("metricUpdated", metric.aggregated);
  }

  /**
   * 記錄計時器開始
   */
  public startTimer(name: string, labels: Record<string, string> = {}): () => void {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric(name, duration, labels);
    };
  }

  /**
   * 增加計數器
   */
  public incrementCounter(
    name: string,
    delta: number = 1,
    labels: Record<string, string> = {}
  ): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.definition.type !== MetricType.COUNTER) {
      this.logger.debug(`無效的計數器指標: ${name}`);
      return;
    }

    const currentValue = metric.aggregated.sum || 0;
    this.recordMetric(name, currentValue + delta, labels);
  }

  /**
   * 設置計量器值
   */
  public setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.definition.type !== MetricType.GAUGE) {
      this.logger.debug(`無效的計量器指標: ${name}`);
      return;
    }

    this.recordMetric(name, value, labels);
  }

  /**
   * 獲取指標
   */
  public getMetric(name: string): AggregatedMetric | null {
    const metric = this.metrics.get(name);
    return metric ? { ...metric.aggregated } : null;
  }

  /**
   * 獲取所有指標
   */
  public getAllMetrics(): AggregatedMetric[] {
    return Array.from(this.metrics.values()).map((m) => ({ ...m.aggregated }));
  }

  /**
   * 獲取系統指標
   */
  public getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        usage: this.getCpuUsage(),
        loadAverage: process.platform !== "win32" ? loadavg() : [0, 0, 0],
      },
      memory: {
        used: memUsage.rss,
        total: totalmem(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      network: {
        bytesIn: 0, // 需要實現網絡統計
        bytesOut: 0,
        connectionsActive: 0,
        connectionsTotal: 0,
      },
      disk: {
        reads: 0, // 需要實現磁盤統計
        writes: 0,
        readBytes: 0,
        writeBytes: 0,
      },
    };
  }

  /**
   * 獲取 MCP 特定指標
   */
  public getMcpMetrics(): McpMetrics {
    const connectionsActive = this.getMetric("mcp_connections_active")?.avg || 0;
    const connectionsTotal = this.getMetric("mcp_connections_total")?.sum || 0;
    const connectionsFailed = this.getMetric("mcp_connections_failed")?.sum || 0;
    const requestsTotal = this.getMetric("mcp_requests_total")?.sum || 0;
    const requestsSuccessful = this.getMetric("mcp_requests_successful")?.sum || 0;
    const requestsFailed = this.getMetric("mcp_requests_failed")?.sum || 0;

    return {
      connections: {
        active: connectionsActive,
        total: connectionsTotal,
        failed: connectionsFailed,
        avgDuration: this.getMetric("mcp_connection_duration")?.avg || 0,
      },
      requests: {
        total: requestsTotal,
        successful: requestsSuccessful,
        failed: requestsFailed,
        avgResponseTime: this.getMetric("mcp_request_duration")?.avg || 0,
        p95ResponseTime: this.getMetric("mcp_request_duration")?.p95 || 0,
        p99ResponseTime: this.getMetric("mcp_request_duration")?.p99 || 0,
        requestsPerSecond: this.getMetric("mcp_requests_total")?.rate || 0,
      },
      tools: {
        callsTotal: this.getMetric("mcp_tool_calls_total")?.sum || 0,
        callsSuccessful: this.getMetric("mcp_tool_calls_successful")?.sum || 0,
        callsFailed: this.getMetric("mcp_tool_calls_failed")?.sum || 0,
        avgExecutionTime: this.getMetric("mcp_tool_execution_duration")?.avg || 0,
        toolsAvailable: this.getMetric("mcp_tools_available")?.avg || 0,
        topTools: [], // 需要實現工具排名統計
      },
      cache: {
        hits: this.getMetric("mcp_cache_hits")?.sum || 0,
        misses: this.getMetric("mcp_cache_misses")?.sum || 0,
        hitRate: this.calculateCacheHitRate(),
        evictions: this.getMetric("mcp_cache_evictions")?.sum || 0,
        size: this.getMetric("mcp_cache_size")?.avg || 0,
        memoryUsage: this.getMetric("mcp_cache_memory_usage")?.avg || 0,
      },
      errors: {
        total: this.getMetric("mcp_errors_total")?.sum || 0,
        byCategory: {},
        bySeverity: {},
        errorRate: this.calculateErrorRate(),
      },
    };
  }

  /**
   * 添加告警規則
   */
  public addAlertRule(rule: AlertRule): void {
    this.alerts.set(rule.id, {
      rule,
      lastChecked: new Date(),
      consecutiveViolations: 0,
    });

    this.logger.info(`添加告警規則: ${rule.name}`, { ruleId: rule.id });
  }

  /**
   * 移除告警規則
   */
  public removeAlertRule(ruleId: string): boolean {
    const alertState = this.alerts.get(ruleId);
    if (alertState) {
      // 如果有活動告警，先解決它
      if (alertState.currentAlert && alertState.currentAlert.status === "firing") {
        this.resolveAlert(alertState);
      }

      this.alerts.delete(ruleId);
      this.logger.info(`移除告警規則: ${alertState.rule.name}`, { ruleId });
      return true;
    }
    return false;
  }

  /**
   * 獲取活動告警
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter((state) => state.currentAlert && state.currentAlert.status === "firing")
      .map((state) => ({ ...state.currentAlert! }));
  }

  /**
   * 初始化內建指標
   */
  private initializeBuiltinMetrics(): void {
    const builtinMetrics: MetricDefinition[] = [
      // 連接指標
      { name: "mcp_connections_active", type: MetricType.GAUGE, description: "活動連接數" },
      { name: "mcp_connections_total", type: MetricType.COUNTER, description: "總連接數" },
      { name: "mcp_connections_failed", type: MetricType.COUNTER, description: "失敗連接數" },
      { name: "mcp_connection_duration", type: MetricType.HISTOGRAM, description: "連接持續時間" },

      // 請求指標
      { name: "mcp_requests_total", type: MetricType.COUNTER, description: "總請求數" },
      { name: "mcp_requests_successful", type: MetricType.COUNTER, description: "成功請求數" },
      { name: "mcp_requests_failed", type: MetricType.COUNTER, description: "失敗請求數" },
      { name: "mcp_request_duration", type: MetricType.HISTOGRAM, description: "請求響應時間" },

      // 工具指標
      { name: "mcp_tool_calls_total", type: MetricType.COUNTER, description: "工具調用總數" },
      {
        name: "mcp_tool_calls_successful",
        type: MetricType.COUNTER,
        description: "成功工具調用數",
      },
      { name: "mcp_tool_calls_failed", type: MetricType.COUNTER, description: "失敗工具調用數" },
      {
        name: "mcp_tool_execution_duration",
        type: MetricType.HISTOGRAM,
        description: "工具執行時間",
      },
      { name: "mcp_tools_available", type: MetricType.GAUGE, description: "可用工具數" },

      // 緩存指標
      { name: "mcp_cache_hits", type: MetricType.COUNTER, description: "緩存命中數" },
      { name: "mcp_cache_misses", type: MetricType.COUNTER, description: "緩存未命中數" },
      { name: "mcp_cache_evictions", type: MetricType.COUNTER, description: "緩存驅逐數" },
      { name: "mcp_cache_size", type: MetricType.GAUGE, description: "緩存大小" },
      { name: "mcp_cache_memory_usage", type: MetricType.GAUGE, description: "緩存內存使用量" },

      // 錯誤指標
      { name: "mcp_errors_total", type: MetricType.COUNTER, description: "錯誤總數" },

      // 系統指標
      { name: "system_cpu_usage", type: MetricType.GAUGE, description: "CPU 使用率" },
      { name: "system_memory_usage", type: MetricType.GAUGE, description: "內存使用量" },
      { name: "system_memory_total", type: MetricType.GAUGE, description: "總內存" },
    ];

    for (const metric of builtinMetrics) {
      this.registerMetric(metric);
    }
  }

  /**
   * 初始化自定義指標
   */
  private initializeCustomMetrics(): void {
    for (const metric of this.config.customMetrics) {
      this.registerMetric(metric);
    }
  }

  /**
   * 初始化告警規則
   */
  private initializeAlertRules(): void {
    for (const rule of this.config.alertRules) {
      this.addAlertRule(rule);
    }

    // 添加默認告警規則
    this.addDefaultAlertRules();
  }

  /**
   * 添加默認告警規則
   */
  private addDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: "high_error_rate",
        name: "高錯誤率",
        description: "錯誤率超過 5%",
        metric: "mcp_errors_total",
        condition: "gt",
        threshold: 0.05,
        duration: 60000, // 1 minute
        severity: "warning",
        enabled: true,
      },
      {
        id: "high_response_time",
        name: "高響應時間",
        description: "平均響應時間超過 5 秒",
        metric: "mcp_request_duration",
        condition: "gt",
        threshold: 5000, // 5 seconds
        duration: 120000, // 2 minutes
        severity: "warning",
        enabled: true,
      },
      {
        id: "low_cache_hit_rate",
        name: "低緩存命中率",
        description: "緩存命中率低於 50%",
        metric: "mcp_cache_hits",
        condition: "lt",
        threshold: 0.5,
        duration: 300000, // 5 minutes
        severity: "info",
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      if (!this.alerts.has(rule.id)) {
        this.addAlertRule(rule);
      }
    }
  }

  /**
   * 註冊指標
   */
  private registerMetric(definition: MetricDefinition): void {
    const aggregated: AggregatedMetric = {
      name: definition.name,
      type: definition.type,
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      avg: 0,
      labels: {},
      lastUpdated: new Date(),
    };

    this.metrics.set(definition.name, {
      definition,
      dataPoints: [],
      aggregated,
    });
  }

  /**
   * 更新聚合指標
   */
  private updateAggregatedMetric(metric: MetricStore): void {
    const { dataPoints } = metric;
    if (dataPoints.length === 0) return;

    const values = dataPoints.map((dp) => dp.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;

    metric.aggregated = {
      ...metric.aggregated,
      count,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / count,
      lastUpdated: new Date(),
    };

    // 計算分位數（用於 histogram 和 summary）
    if (
      metric.definition.type === MetricType.HISTOGRAM ||
      metric.definition.type === MetricType.SUMMARY
    ) {
      const sortedValues = [...values].sort((a, b) => a - b);
      metric.aggregated.p50 = this.percentile(sortedValues, 0.5);
      metric.aggregated.p95 = this.percentile(sortedValues, 0.95);
      metric.aggregated.p99 = this.percentile(sortedValues, 0.99);
    }

    // 計算變化率
    if (dataPoints.length >= 2) {
      const recent = dataPoints.slice(-10); // 最近10個數據點
      if (recent.length >= 2) {
        const timeSpan =
          recent[recent.length - 1].timestamp.getTime() - recent[0].timestamp.getTime();
        const valueChange = recent[recent.length - 1].value - recent[0].value;
        metric.aggregated.rate = timeSpan > 0 ? (valueChange / timeSpan) * 1000 : 0; // 每秒變化率
      }
    }
  }

  /**
   * 計算百分位數
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;

    const index = p * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower];
    }

    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * 啟動指標收集
   */
  private startCollection(): void {
    this.collectionTimer = setInterval(() => {
      if (this.config.enableSystemMetrics) {
        this.collectSystemMetrics();
      }
    }, this.config.collectionInterval);
  }

  /**
   * 啟動告警檢查
   */
  private startAlerting(): void {
    this.alertTimer = setInterval(() => {
      this.checkAlerts();
    }, this.config.alertCheckInterval);
  }

  /**
   * 啟動數據保留清理
   */
  private startRetention(): void {
    this.retentionTimer = setInterval(() => {
      this.performDataRetention();
    }, this.config.retentionPeriod / 24); // 每小時檢查一次
  }

  /**
   * 收集系統指標
   */
  private collectSystemMetrics(): void {
    const systemMetrics = this.getSystemMetrics();

    this.recordMetric("system_cpu_usage", systemMetrics.cpu.usage);
    this.recordMetric("system_memory_usage", systemMetrics.memory.used);
    this.recordMetric("system_memory_total", systemMetrics.memory.total);

    this.emit("systemMetricsUpdated", systemMetrics);
  }

  /**
   * 檢查告警
   */
  private checkAlerts(): void {
    for (const [, alertState] of this.alerts.entries()) {
      if (!alertState.rule.enabled) continue;

      const metric = this.getMetric(alertState.rule.metric);
      if (!metric) continue;

      const value = metric.avg; // 使用平均值進行告警檢查
      const isViolating = this.evaluateCondition(
        value,
        alertState.rule.condition,
        alertState.rule.threshold
      );

      alertState.lastChecked = new Date();

      if (isViolating) {
        alertState.consecutiveViolations++;

        if (!alertState.firstTriggered) {
          alertState.firstTriggered = new Date();
        }

        // 檢查是否達到持續時間要求
        const violationDuration = Date.now() - alertState.firstTriggered.getTime();
        if (violationDuration >= alertState.rule.duration && !alertState.currentAlert) {
          this.fireAlert(alertState, value);
        }
      } else {
        // 重置違規狀態
        if (alertState.consecutiveViolations > 0) {
          alertState.consecutiveViolations = 0;
          alertState.firstTriggered = undefined;

          // 解決活動告警
          if (alertState.currentAlert && alertState.currentAlert.status === "firing") {
            this.resolveAlert(alertState);
          }
        }
      }
    }
  }

  /**
   * 觸發告警
   */
  private fireAlert(alertState: AlertState, value: number): void {
    const alert: Alert = {
      ruleId: alertState.rule.id,
      ruleName: alertState.rule.name,
      severity: alertState.rule.severity,
      message: `${alertState.rule.description} (當前值: ${value}, 閾值: ${alertState.rule.threshold})`,
      value,
      threshold: alertState.rule.threshold,
      startTime: new Date(),
      labels: alertState.rule.labels || {},
      status: "firing",
    };

    alertState.currentAlert = alert;
    this.emit("alertFiring", alert);

    this.logger.info(`告警觸發: ${alert.ruleName}`, {
      ruleId: alert.ruleId,
      severity: alert.severity,
      value,
      threshold: alert.threshold,
    });
  }

  /**
   * 解決告警
   */
  private resolveAlert(alertState: AlertState): void {
    if (alertState.currentAlert) {
      alertState.currentAlert.status = "resolved";
      alertState.currentAlert.endTime = new Date();

      this.emit("alertResolved", alertState.currentAlert);

      this.logger.info(`告警解決: ${alertState.currentAlert.ruleName}`, {
        ruleId: alertState.currentAlert.ruleId,
      });

      alertState.currentAlert = undefined;
    }
  }

  /**
   * 評估告警條件
   */
  private evaluateCondition(
    value: number,
    condition: AlertRule["condition"],
    threshold: number
  ): boolean {
    switch (condition) {
      case "gt":
        return value > threshold;
      case "lt":
        return value < threshold;
      case "eq":
        return value === threshold;
      case "ne":
        return value !== threshold;
      case "gte":
        return value >= threshold;
      case "lte":
        return value <= threshold;
      default:
        return false;
    }
  }

  /**
   * 執行數據保留清理
   */
  private performDataRetention(): void {
    const cutoffTime = new Date(Date.now() - this.config.retentionPeriod);
    let totalRemoved = 0;
    let totalRetained = 0;

    for (const metric of this.metrics.values()) {
      const originalCount = metric.dataPoints.length;
      metric.dataPoints = metric.dataPoints.filter((dp) => dp.timestamp >= cutoffTime);
      const removedCount = originalCount - metric.dataPoints.length;

      totalRemoved += removedCount;
      totalRetained += metric.dataPoints.length;

      // 重新計算聚合指標
      if (removedCount > 0) {
        this.updateAggregatedMetric(metric);
      }
    }

    if (totalRemoved > 0) {
      this.emit("dataRetention", totalRemoved, totalRetained);
      this.logger.debug(
        `數據保留清理完成: 移除 ${totalRemoved} 個數據點，保留 ${totalRetained} 個`
      );
    }
  }

  /**
   * 獲取 CPU 使用率
   */
  private getCpuUsage(): number {
    // 簡化的 CPU 使用率計算
    const startUsage = process.cpuUsage();
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const totalUsage = endUsage.user + endUsage.system;
      return totalUsage / 1000 / 100; // 轉換為百分比
    }, 100);

    return 0; // 返回默認值，實際應用中需要更精確的計算
  }

  /**
   * 計算緩存命中率
   */
  private calculateCacheHitRate(): number {
    const hits = this.getMetric("mcp_cache_hits")?.sum || 0;
    const misses = this.getMetric("mcp_cache_misses")?.sum || 0;
    const total = hits + misses;

    return total > 0 ? hits / total : 0;
  }

  /**
   * 計算錯誤率
   */
  private calculateErrorRate(): number {
    const errors = this.getMetric("mcp_errors_total")?.sum || 0;
    const total = this.getMetric("mcp_requests_total")?.sum || 0;

    return total > 0 ? errors / total : 0;
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof MetricsEvents>(event: K, listener: MetricsEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof MetricsEvents>(
    event: K,
    ...args: Parameters<MetricsEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
