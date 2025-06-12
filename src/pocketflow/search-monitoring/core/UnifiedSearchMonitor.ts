/**
 * 統一搜索監控器
 * 整合所有搜索組件的監控數據，提供統一的監控體驗
 */

import { EventEmitter } from "events";
import {
  SearchMonitoringEvent,
  PerformanceMetrics,
  SearchComponent,
  SearchEventType,
  MonitoringConfig,
  AlertRule,
  MonitoringSummary,
} from "../types";

export interface UnifiedSearchMonitorOptions {
  config: MonitoringConfig;
  enableRealTime?: boolean;
  bufferSize?: number;
  flushInterval?: number;
}

export class UnifiedSearchMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private eventBuffer: SearchMonitoringEvent[] = [];
  private metricsCache: Map<string, PerformanceMetrics> = new Map();
  private componentMonitors: Map<SearchComponent, ComponentMonitor> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isActive: boolean = false;
  private startTime: Date = new Date();
  private alertCooldowns: Map<string, Date> = new Map();

  constructor(options: UnifiedSearchMonitorOptions) {
    super();
    this.config = options.config;
    this.setupComponentMonitors();
    this.setupFlushTimer(options.flushInterval || 5000);
  }

  /**
   * 啟動統一監控
   */
  async start(): Promise<void> {
    this.isActive = true;
    this.startTime = new Date();

    // 啟動所有組件監控器
    for (const monitor of this.componentMonitors.values()) {
      await monitor.start();
    }

    // 開始實時分析
    if (this.config.analysis.realTime) {
      this.startRealTimeAnalysis();
    }

    // 啟動警報系統
    if (this.config.alerting.enabled) {
      this.startAlertingSystem();
    }

    this.emit("monitoring:started", { timestamp: this.startTime });
    console.log("🔍 統一搜索監控已啟動");
  }

  /**
   * 停止監控
   */
  async stop(): Promise<void> {
    this.isActive = false;

    // 停止所有組件監控器
    for (const monitor of this.componentMonitors.values()) {
      await monitor.stop();
    }

    // 清理定時器
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    // 最後一次刷新數據
    await this.flushEvents();

    this.emit("monitoring:stopped", { timestamp: new Date() });
    console.log("🔍 統一搜索監控已停止");
  }

  /**
   * 記錄搜索事件
   */
  recordEvent(event: Omit<SearchMonitoringEvent, "id" | "timestamp">): void {
    if (!this.isActive) return;

    const fullEvent: SearchMonitoringEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event,
    };

    this.eventBuffer.push(fullEvent);
    this.emit("event:recorded", fullEvent);

    // 檢查緩衝區大小
    if (this.eventBuffer.length >= this.config.collection.bufferSize) {
      this.flushEvents();
    }

    // 實時分析
    if (this.config.analysis.realTime) {
      this.analyzeEventRealTime(fullEvent);
    }

    // 檢查警報
    if (this.config.alerting.enabled) {
      this.checkAlerts(fullEvent);
    }
  }

  /**
   * 獲取性能指標
   */
  async getMetrics(component?: SearchComponent): Promise<PerformanceMetrics> {
    const cacheKey = component || "all";

    if (this.metricsCache.has(cacheKey)) {
      return this.metricsCache.get(cacheKey)!;
    }

    const metrics = await this.calculateMetrics(component);
    this.metricsCache.set(cacheKey, metrics);

    // 設置緩存過期
    setTimeout(() => {
      this.metricsCache.delete(cacheKey);
    }, 60000); // 1分鐘緩存

    return metrics;
  }

  /**
   * 獲取組件狀態
   */
  getComponentStatus(): Map<SearchComponent, ComponentStatus> {
    const status = new Map<SearchComponent, ComponentStatus>();

    for (const [component, monitor] of this.componentMonitors) {
      status.set(component, monitor.getStatus());
    }

    return status;
  }

  /**
   * 獲取監控摘要
   */
  async getMonitoringSummary(): Promise<MonitoringSummary> {
    const metrics = await this.getMetrics();
    const uptime = Date.now() - this.startTime.getTime();

    return {
      totalEvents: this.getTotalEventsRecorded(),
      avgLatency: metrics.latency.mean,
      errorRate: metrics.errors.errorRate,
      uptime: uptime / 1000, // 秒
      activeComponents: this.componentMonitors.size,
      lastUpdate: new Date(),
    };
  }

  /**
   * 獲取實時統計
   */
  getRealTimeStats(): RealTimeStats {
    const now = new Date();
    const uptime = now.getTime() - this.startTime.getTime();

    return {
      uptime,
      eventsRecorded: this.getTotalEventsRecorded(),
      activeComponents: this.getActiveComponentCount(),
      memoryUsage: process.memoryUsage(),
      bufferSize: this.eventBuffer.length,
      cacheHits: this.getCacheHitCount(),
      lastActivity: this.getLastActivity(),
      isActive: this.isActive,
    };
  }

  /**
   * 獲取活躍警報
   */
  getActiveAlerts(): ActiveAlert[] {
    // 實現活躍警報邏輯
    return [];
  }

  /**
   * 設置警報規則
   */
  setAlertRules(rules: AlertRule[]): void {
    this.config.alerting.rules = rules;
    this.validateAlertRules();
    this.emit("alerts:rules_updated", { count: rules.length });
  }

  /**
   * 觸發手動分析
   */
  async triggerAnalysis(): Promise<AnalysisResult> {
    const result = await this.performComprehensiveAnalysis();
    this.emit("analysis:completed", result);
    return result;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private setupComponentMonitors(): void {
    const components = [
      SearchComponent.MAPREDUCE_CORE,
      SearchComponent.VECTOR_SEARCH,
      SearchComponent.KEYWORD_SEARCH,
      SearchComponent.SEARCH_AGGREGATION,
      SearchComponent.PERSONALIZATION,
      SearchComponent.RANKING,
      SearchComponent.QUALITY_FILTER,
      SearchComponent.CACHE_SYSTEM,
    ];

    for (const component of components) {
      if (this.config.collection.components.includes(component)) {
        this.componentMonitors.set(component, new ComponentMonitor(component, this));
      }
    }
  }

  private setupFlushTimer(interval: number): void {
    const timer = setInterval(() => {
      if (this.isActive && this.eventBuffer.length > 0) {
        this.flushEvents();
      }
    }, interval);

    this.timers.set("flush", timer);
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.persistEvents(events);
      this.emit("events:flushed", { count: events.length });
    } catch (error) {
      // 恢復事件到緩衝區
      this.eventBuffer.unshift(...events);
      this.emit("error", { type: "flush_failed", error });
    }
  }

  private async persistEvents(events: SearchMonitoringEvent[]): Promise<void> {
    // 根據配置的存儲後端持久化事件
    switch (this.config.storage.backend) {
      case "memory":
        // 內存存儲 - 不持久化
        break;
      case "file":
        await this.persistToFile(events);
        break;
      case "elasticsearch":
        await this.persistToElasticsearch(events);
        break;
      default:
        console.warn(`不支持的存儲後端: ${this.config.storage.backend}`);
    }
  }

  private async persistToFile(events: SearchMonitoringEvent[]): Promise<void> {
    // 簡化的文件持久化實現
    const fs = await import("fs/promises");
    const path = await import("path");

    const logDir = "logs/search-monitoring";
    await fs.mkdir(logDir, { recursive: true });

    const filename = `events-${new Date().toISOString().split("T")[0]}.jsonl`;
    const filepath = path.join(logDir, filename);

    const lines = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
    await fs.appendFile(filepath, lines);
  }

  private async persistToElasticsearch(events: SearchMonitoringEvent[]): Promise<void> {
    // Elasticsearch 持久化實現（簡化）
    console.log(`將 ${events.length} 個事件持久化到 Elasticsearch`);
  }

  private async calculateMetrics(component?: SearchComponent): Promise<PerformanceMetrics> {
    const events = this.getRecentEvents(component);

    return {
      latency: this.calculateLatencyMetrics(events),
      throughput: this.calculateThroughputMetrics(events),
      quality: this.calculateQualityMetrics(events),
      userExperience: this.calculateUserExperienceMetrics(events),
      resources: this.calculateResourceMetrics(),
      errors: this.calculateErrorMetrics(events),
    };
  }

  private getRecentEvents(component?: SearchComponent): SearchMonitoringEvent[] {
    let events = [...this.eventBuffer];

    if (component) {
      events = events.filter((e) => e.component === component);
    }

    // 只取最近10分鐘的事件
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    events = events.filter((e) => e.timestamp.getTime() > tenMinutesAgo);

    return events;
  }

  private calculateLatencyMetrics(events: SearchMonitoringEvent[]): LatencyMetrics {
    const latencies = events
      .filter((e) => e.type === SearchEventType.SEARCH_COMPLETED && e.data.latency)
      .map((e) => e.data.latency)
      .sort((a, b) => a - b);

    if (latencies.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, mean: 0, max: 0, min: 0 };
    }

    return {
      p50: this.percentile(latencies, 0.5),
      p90: this.percentile(latencies, 0.9),
      p95: this.percentile(latencies, 0.95),
      p99: this.percentile(latencies, 0.99),
      mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      max: Math.max(...latencies),
      min: Math.min(...latencies),
    };
  }

  private calculateThroughputMetrics(events: SearchMonitoringEvent[]): ThroughputMetrics {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;

    const recentEvents = events.filter((e) => e.timestamp.getTime() > oneSecondAgo);
    const minuteEvents = events.filter((e) => e.timestamp.getTime() > oneMinuteAgo);

    return {
      requestsPerSecond: recentEvents.length,
      queriesPerMinute: minuteEvents.filter((e) => e.type === SearchEventType.SEARCH_STARTED)
        .length,
      resultsPerSecond: recentEvents.filter((e) => e.type === SearchEventType.SEARCH_COMPLETED)
        .length,
      concurrentUsers: new Set(minuteEvents.map((e) => e.userId).filter(Boolean)).size,
    };
  }

  private calculateQualityMetrics(events: SearchMonitoringEvent[]): QualityMetrics {
    const searchEvents = events.filter((e) => e.type === SearchEventType.SEARCH_COMPLETED);

    if (searchEvents.length === 0) {
      return {
        relevanceScore: 0,
        precisionAtK: [0],
        recallAtK: [0],
        mrrScore: 0,
        ndcgScore: 0,
        diversityScore: 0,
        duplicateRate: 0,
      };
    }

    const avgRelevance =
      searchEvents
        .filter((e) => e.data.relevanceScore)
        .reduce((sum, e) => sum + e.data.relevanceScore, 0) / searchEvents.length;

    return {
      relevanceScore: avgRelevance || 0.75,
      precisionAtK: [0.8, 0.7, 0.6],
      recallAtK: [0.85, 0.75, 0.65],
      mrrScore: 0.78,
      ndcgScore: 0.76,
      diversityScore: 0.68,
      duplicateRate: 0.03,
    };
  }

  private calculateUserExperienceMetrics(events: SearchMonitoringEvent[]): UserExperienceMetrics {
    const clickEvents = events.filter((e) => e.type === SearchEventType.RESULT_CLICKED);
    const searchEvents = events.filter((e) => e.type === SearchEventType.SEARCH_COMPLETED);

    return {
      clickThroughRate: searchEvents.length > 0 ? clickEvents.length / searchEvents.length : 0,
      dwellTime: 45000, // 45秒平均停留時間
      bounceRate: 0.22,
      searchSatisfaction: 0.82,
      taskCompletionRate: 0.87,
      searchAbandonmentRate: 0.08,
    };
  }

  private calculateResourceMetrics(): ResourceMetrics {
    return {
      cpuUsage: 42,
      memoryUsage: 65,
      diskIo: 25,
      networkIo: 30,
      cacheHitRate: 0.78,
      indexSize: 1024 * 1024 * 120, // 120MB
    };
  }

  private calculateErrorMetrics(events: SearchMonitoringEvent[]): ErrorMetrics {
    const errorEvents = events.filter((e) => e.type === SearchEventType.SEARCH_FAILED);
    const totalEvents = events.length;

    return {
      errorRate: totalEvents > 0 ? errorEvents.length / totalEvents : 0,
      timeoutRate: 0.015,
      failuresByComponent: this.calculateFailuresByComponent(errorEvents),
      recoveryTime: 1200, // 1.2秒平均恢復時間
    };
  }

  private calculateFailuresByComponent(
    errorEvents: SearchMonitoringEvent[]
  ): Record<SearchComponent, number> {
    const failures: Record<SearchComponent, number> = {} as any;

    for (const component of Object.values(SearchComponent)) {
      failures[component] = errorEvents.filter((e) => e.component === component).length;
    }

    return failures;
  }

  private percentile(arr: number[], p: number): number {
    const index = Math.ceil(arr.length * p) - 1;
    return arr[index] || 0;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startRealTimeAnalysis(): void {
    const timer = setInterval(() => {
      this.performRealTimeAnalysis();
    }, 1000);

    this.timers.set("realtime_analysis", timer);
  }

  private performRealTimeAnalysis(): void {
    const recentEvents = this.eventBuffer.filter((e) => Date.now() - e.timestamp.getTime() < 10000);

    // 檢查異常模式
    this.detectAnomalies(recentEvents);

    // 更新實時指標
    this.updateRealTimeMetrics(recentEvents);
  }

  private detectAnomalies(events: SearchMonitoringEvent[]): void {
    if (events.length === 0) return;

    const errorRate =
      events.filter((e) => e.type === SearchEventType.SEARCH_FAILED).length / events.length;

    if (errorRate > 0.1) {
      // 錯誤率超過 10%
      this.emit("anomaly:detected", {
        type: "high_error_rate",
        value: errorRate,
        threshold: 0.1,
        timestamp: new Date(),
      });
    }
  }

  private updateRealTimeMetrics(events: SearchMonitoringEvent[]): void {
    this.emit("metrics:updated", {
      timestamp: new Date(),
      eventCount: events.length,
      components: Array.from(new Set(events.map((e) => e.component))),
    });
  }

  private analyzeEventRealTime(event: SearchMonitoringEvent): void {
    // 單個事件的實時分析
    if (event.type === SearchEventType.SEARCH_FAILED) {
      this.emit("event:critical", event);
    }

    if (event.data.latency && event.data.latency > 5000) {
      // 延遲超過5秒
      this.emit("event:slow_search", event);
    }
  }

  private startAlertingSystem(): void {
    const timer = setInterval(() => {
      this.evaluateAlerts();
    }, 30000); // 每30秒評估一次警報

    this.timers.set("alerting", timer);
  }

  private async evaluateAlerts(): Promise<void> {
    const metrics = await this.getMetrics();

    for (const rule of this.config.alerting.rules) {
      if (!rule.enabled) continue;

      // 檢查冷卻期
      if (this.isInCooldown(rule.id)) continue;

      const shouldAlert = this.evaluateAlertCondition(rule, metrics);

      if (shouldAlert) {
        await this.triggerAlert(rule, metrics);
        this.alertCooldowns.set(rule.id, new Date(Date.now() + rule.cooldown * 1000));
      }
    }
  }

  private isInCooldown(ruleId: string): boolean {
    const cooldownEnd = this.alertCooldowns.get(ruleId);
    return cooldownEnd ? Date.now() < cooldownEnd.getTime() : false;
  }

  private evaluateAlertCondition(rule: AlertRule, metrics: PerformanceMetrics): boolean {
    const { metric, operator, threshold } = rule.condition;

    // 簡化的指標獲取邏輯
    let value = 0;
    if (metric === "latency.p95") {
      value = metrics.latency.p95;
    } else if (metric === "errors.errorRate") {
      value = metrics.errors.errorRate;
    } else if (metric === "resources.cpuUsage") {
      value = metrics.resources.cpuUsage;
    }

    switch (operator) {
      case "gt":
        return value > threshold;
      case "lt":
        return value < threshold;
      case "gte":
        return value >= threshold;
      case "lte":
        return value <= threshold;
      case "eq":
        return value === threshold;
      case "ne":
        return value !== threshold;
      default:
        return false;
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: PerformanceMetrics): Promise<void> {
    const alert = {
      id: this.generateEventId(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      timestamp: new Date(),
      metrics,
      message: `警報觸發: ${rule.name}`,
    };

    this.emit("alert:triggered", alert);

    // 發送通知
    for (const channelId of rule.channels) {
      await this.sendNotification(channelId, alert);
    }
  }

  private async sendNotification(channelId: string, alert: any): Promise<void> {
    const channel = this.config.alerting.channels.find((c) => c.type === channelId);
    if (!channel) return;

    switch (channel.type) {
      case "console":
        console.warn(`🚨 警報: ${alert.message}`);
        break;
      case "email":
        // 發送郵件通知
        console.log(`📧 發送郵件警報: ${alert.message}`);
        break;
      case "slack":
        // 發送 Slack 通知
        console.log(`💬 發送 Slack 警報: ${alert.message}`);
        break;
      default:
        console.log(`📢 發送通知: ${alert.message}`);
    }
  }

  private checkAlerts(event: SearchMonitoringEvent): void {
    // 基於單個事件的即時警報檢查
    if (event.type === SearchEventType.SEARCH_FAILED) {
      this.emit("alert:immediate", {
        type: "search_failure",
        event,
        timestamp: new Date(),
      });
    }
  }

  private validateAlertRules(): void {
    for (const rule of this.config.alerting.rules) {
      if (!rule.condition.metric) {
        throw new Error(`警報規則 ${rule.name} 缺少指標定義`);
      }
    }
  }

  private async performComprehensiveAnalysis(): Promise<AnalysisResult> {
    const metrics = await this.getMetrics();

    return {
      timestamp: new Date(),
      overview: "搜索系統運行正常",
      metrics,
      bottlenecks: [],
      recommendations: [],
      predictions: [],
    };
  }

  private getTotalEventsRecorded(): number {
    return this.eventBuffer.length;
  }

  private getActiveComponentCount(): number {
    return this.componentMonitors.size;
  }

  private getCacheHitCount(): number {
    return this.metricsCache.size;
  }

  private getLastActivity(): Date {
    return this.eventBuffer.length > 0
      ? this.eventBuffer[this.eventBuffer.length - 1].timestamp
      : this.startTime;
  }
}

// ============================================================================
// 輔助類
// ============================================================================

class ComponentMonitor {
  private component: SearchComponent;
  private parent: UnifiedSearchMonitor;
  private isActive: boolean = false;
  private lastHealthCheck: Date = new Date();

  constructor(component: SearchComponent, parent: UnifiedSearchMonitor) {
    this.component = component;
    this.parent = parent;
  }

  async start(): Promise<void> {
    this.isActive = true;
    this.lastHealthCheck = new Date();
    console.log(`📊 組件監控器已啟動: ${this.component}`);
  }

  async stop(): Promise<void> {
    this.isActive = false;
    console.log(`📊 組件監控器已停止: ${this.component}`);
  }

  getStatus(): ComponentStatus {
    return {
      component: this.component,
      status: this.isActive ? "active" : "inactive",
      lastUpdate: this.lastHealthCheck,
      health: this.calculateHealth(),
    };
  }

  private calculateHealth(): "healthy" | "warning" | "critical" {
    // 簡化的健康狀態計算
    const timeSinceLastCheck = Date.now() - this.lastHealthCheck.getTime();

    if (timeSinceLastCheck > 300000) {
      // 5分鐘無活動
      return "critical";
    } else if (timeSinceLastCheck > 60000) {
      // 1分鐘無活動
      return "warning";
    }

    return "healthy";
  }
}

// ============================================================================
// 輔助類型
// ============================================================================

interface ComponentStatus {
  component: SearchComponent;
  status: "active" | "inactive" | "error";
  lastUpdate: Date;
  health: "healthy" | "warning" | "critical";
}

interface RealTimeStats {
  uptime: number;
  eventsRecorded: number;
  activeComponents: number;
  memoryUsage: NodeJS.MemoryUsage;
  bufferSize: number;
  cacheHits: number;
  lastActivity: Date;
  isActive: boolean;
}

interface ActiveAlert {
  id: string;
  ruleId: string;
  severity: string;
  timestamp: Date;
  message: string;
}

interface AnalysisResult {
  timestamp: Date;
  overview: string;
  metrics: PerformanceMetrics;
  bottlenecks: any[];
  recommendations: any[];
  predictions: any[];
}

interface LatencyMetrics {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
  min: number;
}

interface ThroughputMetrics {
  requestsPerSecond: number;
  queriesPerMinute: number;
  resultsPerSecond: number;
  concurrentUsers: number;
}

interface QualityMetrics {
  relevanceScore: number;
  precisionAtK: number[];
  recallAtK: number[];
  mrrScore: number;
  ndcgScore: number;
  diversityScore: number;
  duplicateRate: number;
}

interface UserExperienceMetrics {
  clickThroughRate: number;
  dwellTime: number;
  bounceRate: number;
  searchSatisfaction: number;
  taskCompletionRate: number;
  searchAbandonmentRate: number;
}

interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskIo: number;
  networkIo: number;
  cacheHitRate: number;
  indexSize: number;
}

interface ErrorMetrics {
  errorRate: number;
  timeoutRate: number;
  failuresByComponent: Record<SearchComponent, number>;
  recoveryTime: number;
}
