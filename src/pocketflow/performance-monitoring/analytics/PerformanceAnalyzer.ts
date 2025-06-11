import { EventEmitter } from "events";
import { PerformanceMetric } from "../core/PerformanceMonitoringManager";
import { TrendData } from "../core/TrendAnalysisEngine";

export interface PerformanceBottleneck {
  id: string;
  type: "cpu" | "memory" | "io" | "network" | "tool" | "custom";
  severity: "low" | "medium" | "high" | "critical";
  component: string;
  metric: string;
  currentValue: number;
  threshold: number;
  impact: number; // 0-1, 對系統的影響程度
  description: string;
  recommendations: string[];
  firstDetected: number;
  lastSeen: number;
  frequency: number; // 出現頻率
}

export interface PerformanceInsight {
  id: string;
  category: "optimization" | "warning" | "information" | "critical";
  title: string;
  description: string;
  metrics: string[];
  impact: "low" | "medium" | "high";
  actionRequired: boolean;
  recommendations: Array<{
    action: string;
    priority: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
    expectedImpact: string;
  }>;
  timestamp: number;
}

export interface ComponentPerformanceProfile {
  componentName: string;
  health: "excellent" | "good" | "fair" | "poor" | "critical";
  score: number; // 0-100
  metrics: {
    availability: number;
    responseTime: number;
    throughput: number;
    errorRate: number;
    resourceUsage: number;
  };
  trends: {
    improving: string[];
    degrading: string[];
    stable: string[];
  };
  bottlenecks: PerformanceBottleneck[];
  lastAnalysis: number;
}

export interface SystemPerformanceReport {
  timestamp: number;
  overallScore: number; // 0-100
  status: "excellent" | "good" | "fair" | "poor" | "critical";
  components: ComponentPerformanceProfile[];
  insights: PerformanceInsight[];
  bottlenecks: PerformanceBottleneck[];
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  trends: {
    performance: "improving" | "stable" | "degrading";
    reliability: "improving" | "stable" | "degrading";
    efficiency: "improving" | "stable" | "degrading";
  };
}

export class PerformanceAnalyzer extends EventEmitter {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private bottlenecks: Map<string, PerformanceBottleneck> = new Map();
  private insights: Map<string, PerformanceInsight> = new Map();
  private componentProfiles: Map<string, ComponentPerformanceProfile> = new Map();

  private analysisInterval?: NodeJS.Timeout;
  private isRunning = false;

  private readonly analysisIntervalMs = 60000; // 1分鐘
  private readonly retentionPeriod = 24 * 60 * 60 * 1000; // 24小時

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期分析
    this.analysisInterval = setInterval(() => {
      this.performAnalysis();
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

      // 保持數據量在合理範圍內
      if (metricArray.length > 1000) {
        metricArray.splice(0, 100); // 移除最舊的100個數據點
      }
    }
  }

  addTrendData(trends: TrendData[]): void {
    for (const trend of trends) {
      this.analyzeTrendImpact(trend);
    }
  }

  analyzeBottlenecks(): PerformanceBottleneck[] {
    const now = Date.now();
    const recentMetrics = this.getRecentMetrics(300000); // 最近5分鐘

    // 分析不同類型的瓶頸
    this.analyzeCpuBottlenecks(recentMetrics);
    this.analyzeMemoryBottlenecks(recentMetrics);
    this.analyzeToolBottlenecks(recentMetrics);
    this.analyzeNetworkBottlenecks(recentMetrics);

    // 更新瓶頸狀態
    this.updateBottleneckStatus(now);

    return Array.from(this.bottlenecks.values());
  }

  generateInsights(): PerformanceInsight[] {
    const now = Date.now();

    // 清除過期洞察
    this.cleanupExpiredInsights(now);

    // 生成新洞察
    this.generateResourceInsights();
    this.generateTrendInsights();
    this.generatePerformanceInsights();
    this.generateOptimizationInsights();

    return Array.from(this.insights.values());
  }

  analyzeComponent(componentName: string): ComponentPerformanceProfile {
    const componentMetrics = this.getComponentMetrics(componentName);
    const bottlenecks = this.getComponentBottlenecks(componentName);

    const profile: ComponentPerformanceProfile = {
      componentName,
      health: "good",
      score: 100,
      metrics: {
        availability: this.calculateAvailability(componentMetrics),
        responseTime: this.calculateAverageResponseTime(componentMetrics),
        throughput: this.calculateThroughput(componentMetrics),
        errorRate: this.calculateErrorRate(componentMetrics),
        resourceUsage: this.calculateResourceUsage(componentMetrics),
      },
      trends: {
        improving: [],
        degrading: [],
        stable: [],
      },
      bottlenecks,
      lastAnalysis: Date.now(),
    };

    // 計算健康分數
    profile.score = this.calculateComponentScore(profile.metrics);
    profile.health = this.determineHealthStatus(profile.score);

    // 更新組件檔案
    this.componentProfiles.set(componentName, profile);

    return profile;
  }

  generateSystemReport(): SystemPerformanceReport {
    const components = this.analyzeAllComponents();
    const bottlenecks = this.analyzeBottlenecks();
    const insights = this.generateInsights();

    const overallScore = this.calculateOverallScore(components);
    const status = this.determineSystemStatus(overallScore);

    const report: SystemPerformanceReport = {
      timestamp: Date.now(),
      overallScore,
      status,
      components,
      insights,
      bottlenecks,
      recommendations: this.generateRecommendations(components, bottlenecks, insights),
      trends: this.analyzeSystemTrends(),
    };

    this.emit("reportGenerated", report);
    return report;
  }

  private performAnalysis(): void {
    try {
      // 分析瓶頸
      const bottlenecks = this.analyzeBottlenecks();
      if (bottlenecks.length > 0) {
        this.emit("bottlenecksDetected", bottlenecks);
      }

      // 生成洞察
      const insights = this.generateInsights();
      if (insights.length > 0) {
        this.emit("insightsGenerated", insights);
      }

      // 分析組件
      this.analyzeAllComponents();

      this.emit("analysisComplete", {
        timestamp: Date.now(),
        bottlenecks: bottlenecks.length,
        insights: insights.length,
        components: this.componentProfiles.size,
      });
    } catch (error) {
      this.emit("analysisError", error);
    }
  }

  private getRecentMetrics(timeWindow: number): PerformanceMetric[] {
    const now = Date.now();
    const cutoff = now - timeWindow;
    const recent: PerformanceMetric[] = [];

    for (const metricArray of this.metrics.values()) {
      recent.push(...metricArray.filter((m) => m.timestamp >= cutoff));
    }

    return recent;
  }

  private analyzeCpuBottlenecks(metrics: PerformanceMetric[]): void {
    const cpuMetrics = metrics.filter((m) => m.name.includes("cpu"));

    for (const metric of cpuMetrics) {
      if (metric.value > 90) {
        // CPU使用率超過90%
        const bottleneckId = `cpu_${metric.name}`;
        const existing = this.bottlenecks.get(bottleneckId);

        if (existing) {
          existing.lastSeen = Date.now();
          existing.frequency++;
          existing.currentValue = metric.value;
        } else {
          this.bottlenecks.set(bottleneckId, {
            id: bottleneckId,
            type: "cpu",
            severity: metric.value > 95 ? "critical" : "high",
            component: this.extractComponentName(metric.name),
            metric: metric.name,
            currentValue: metric.value,
            threshold: 90,
            impact: (metric.value - 90) / 10,
            description: `CPU使用率過高: ${metric.value.toFixed(1)}%`,
            recommendations: [
              "檢查是否有高CPU使用的進程",
              "考慮優化算法或增加計算資源",
              "檢查是否有無限循環或死鎖",
            ],
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            frequency: 1,
          });
        }
      }
    }
  }

  private analyzeMemoryBottlenecks(metrics: PerformanceMetric[]): void {
    const memoryMetrics = metrics.filter((m) => m.name.includes("memory"));

    for (const metric of memoryMetrics) {
      if (metric.value > 85) {
        // 內存使用率超過85%
        const bottleneckId = `memory_${metric.name}`;
        const existing = this.bottlenecks.get(bottleneckId);

        if (existing) {
          existing.lastSeen = Date.now();
          existing.frequency++;
          existing.currentValue = metric.value;
        } else {
          this.bottlenecks.set(bottleneckId, {
            id: bottleneckId,
            type: "memory",
            severity: metric.value > 95 ? "critical" : "high",
            component: this.extractComponentName(metric.name),
            metric: metric.name,
            currentValue: metric.value,
            threshold: 85,
            impact: (metric.value - 85) / 15,
            description: `內存使用率過高: ${metric.value.toFixed(1)}%`,
            recommendations: [
              "檢查內存泄漏",
              "優化數據結構和算法",
              "增加系統內存或啟用交換空間",
              "實施垃圾回收優化",
            ],
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            frequency: 1,
          });
        }
      }
    }
  }

  private analyzeToolBottlenecks(metrics: PerformanceMetric[]): void {
    const toolMetrics = metrics.filter((m) => m.name.includes("tool.execution.time"));

    for (const metric of toolMetrics) {
      if (metric.value > 5000) {
        // 工具執行時間超過5秒
        const bottleneckId = `tool_${metric.name}`;
        const existing = this.bottlenecks.get(bottleneckId);

        if (existing) {
          existing.lastSeen = Date.now();
          existing.frequency++;
          existing.currentValue = metric.value;
        } else {
          this.bottlenecks.set(bottleneckId, {
            id: bottleneckId,
            type: "tool",
            severity: metric.value > 10000 ? "critical" : "medium",
            component: this.extractComponentName(metric.name),
            metric: metric.name,
            currentValue: metric.value,
            threshold: 5000,
            impact: Math.min(1, (metric.value - 5000) / 10000),
            description: `工具執行時間過長: ${(metric.value / 1000).toFixed(1)}秒`,
            recommendations: ["優化工具實現", "檢查網絡連接", "考慮增加超時設置", "實施結果緩存"],
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            frequency: 1,
          });
        }
      }
    }
  }

  private analyzeNetworkBottlenecks(metrics: PerformanceMetric[]): void {
    const networkMetrics = metrics.filter(
      (m) => m.name.includes("network") || m.name.includes("connection")
    );

    for (const metric of networkMetrics) {
      if (metric.name.includes("latency") && metric.value > 1000) {
        const bottleneckId = `network_${metric.name}`;
        this.bottlenecks.set(bottleneckId, {
          id: bottleneckId,
          type: "network",
          severity: metric.value > 2000 ? "high" : "medium",
          component: this.extractComponentName(metric.name),
          metric: metric.name,
          currentValue: metric.value,
          threshold: 1000,
          impact: Math.min(1, (metric.value - 1000) / 2000),
          description: `網絡延遲過高: ${metric.value.toFixed(0)}ms`,
          recommendations: [
            "檢查網絡連接品質",
            "優化請求大小",
            "實施請求重試機制",
            "考慮使用CDN或緩存",
          ],
          firstDetected: Date.now(),
          lastSeen: Date.now(),
          frequency: 1,
        });
      }
    }
  }

  private updateBottleneckStatus(now: number): void {
    const staleThreshold = 300000; // 5分鐘

    for (const [id, bottleneck] of this.bottlenecks.entries()) {
      if (now - bottleneck.lastSeen > staleThreshold) {
        this.bottlenecks.delete(id);
        this.emit("bottleneckResolved", bottleneck);
      }
    }
  }

  private analyzeTrendImpact(trend: TrendData): void {
    if (trend.severity === "high" || trend.severity === "critical") {
      const insightId = `trend_${trend.metric}_${Date.now()}`;

      this.insights.set(insightId, {
        id: insightId,
        category: trend.severity === "critical" ? "critical" : "warning",
        title: `${trend.metric}的趨勢告警`,
        description: `指標${trend.metric}呈現${trend.direction === "increasing" ? "上升" : "下降"}趨勢，變化率為${trend.changeRate.toFixed(1)}%`,
        metrics: [trend.metric],
        impact: trend.severity === "critical" ? "high" : "medium",
        actionRequired: true,
        recommendations: this.generateTrendRecommendations(trend),
        timestamp: Date.now(),
      });
    }
  }

  private generateTrendRecommendations(trend: TrendData): Array<{
    action: string;
    priority: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
    expectedImpact: string;
  }> {
    const recommendations: Array<{
      action: string;
      priority: "low" | "medium" | "high";
      effort: "low" | "medium" | "high";
      expectedImpact: string;
    }> = [];

    if (trend.metric.includes("error")) {
      recommendations.push({
        action: "檢查錯誤日誌並修復根本原因",
        priority: "high",
        effort: "medium",
        expectedImpact: "顯著降低錯誤率",
      });
    }

    if (trend.metric.includes("memory")) {
      recommendations.push({
        action: "執行內存分析並優化內存使用",
        priority: "high",
        effort: "high",
        expectedImpact: "改善內存使用效率",
      });
    }

    if (trend.metric.includes("response.time")) {
      recommendations.push({
        action: "優化性能關鍵路徑",
        priority: "medium",
        effort: "high",
        expectedImpact: "提升響應速度",
      });
    }

    return recommendations;
  }

  private generateResourceInsights(): void {
    const now = Date.now();
    const recentMetrics = this.getRecentMetrics(600000); // 最近10分鐘

    // 分析資源使用趨勢
    const resourceMetrics = recentMetrics.filter(
      (m) => m.name.includes("cpu") || m.name.includes("memory")
    );

    if (resourceMetrics.length > 0) {
      const avgCpu = this.calculateAverageValue(
        resourceMetrics.filter((m) => m.name.includes("cpu"))
      );
      const avgMemory = this.calculateAverageValue(
        resourceMetrics.filter((m) => m.name.includes("memory"))
      );

      if (avgCpu > 70 || avgMemory > 80) {
        this.insights.set(`resource_pressure_${now}`, {
          id: `resource_pressure_${now}`,
          category: "warning",
          title: "系統資源壓力",
          description: `系統資源使用率較高，CPU: ${avgCpu.toFixed(1)}%, 內存: ${avgMemory.toFixed(1)}%`,
          metrics: ["system.cpu.usage", "system.memory.usage"],
          impact: "medium",
          actionRequired: true,
          recommendations: [
            {
              action: "監控資源使用並考慮擴展",
              priority: "medium",
              effort: "low",
              expectedImpact: "預防性能下降",
            },
          ],
          timestamp: now,
        });
      }
    }
  }

  private generateTrendInsights(): void {
    // 這裡可以基於趨勢數據生成洞察
    // 目前為簡化實現，主要通過 analyzeTrendImpact 處理
  }

  private generatePerformanceInsights(): void {
    const recentMetrics = this.getRecentMetrics(300000); // 最近5分鐘
    const toolMetrics = recentMetrics.filter((m) => m.name.includes("tool.execution.time"));

    if (toolMetrics.length > 0) {
      const avgExecutionTime = this.calculateAverageValue(toolMetrics);

      if (avgExecutionTime > 3000) {
        this.insights.set(`slow_tools_${Date.now()}`, {
          id: `slow_tools_${Date.now()}`,
          category: "optimization",
          title: "工具執行性能",
          description: `工具平均執行時間較慢: ${(avgExecutionTime / 1000).toFixed(1)}秒`,
          metrics: ["tool.execution.time"],
          impact: "medium",
          actionRequired: false,
          recommendations: [
            {
              action: "分析並優化慢速工具",
              priority: "low",
              effort: "medium",
              expectedImpact: "提升用戶體驗",
            },
          ],
          timestamp: Date.now(),
        });
      }
    }
  }

  private generateOptimizationInsights(): void {
    const components = Array.from(this.componentProfiles.values());

    for (const component of components) {
      if (component.score < 80) {
        this.insights.set(`optimization_${component.componentName}_${Date.now()}`, {
          id: `optimization_${component.componentName}_${Date.now()}`,
          category: "optimization",
          title: `${component.componentName}組件優化建議`,
          description: `組件性能分數較低: ${component.score}/100`,
          metrics: Object.keys(component.metrics),
          impact: component.score < 60 ? "high" : "medium",
          actionRequired: component.score < 60,
          recommendations: [
            {
              action: `優化${component.componentName}組件性能`,
              priority: component.score < 60 ? "high" : "medium",
              effort: "medium",
              expectedImpact: "提升組件性能分數",
            },
          ],
          timestamp: Date.now(),
        });
      }
    }
  }

  private cleanupExpiredInsights(now: number): void {
    const maxAge = 3600000; // 1小時

    for (const [id, insight] of this.insights.entries()) {
      if (now - insight.timestamp > maxAge) {
        this.insights.delete(id);
      }
    }
  }

  private getComponentMetrics(componentName: string): PerformanceMetric[] {
    const componentMetrics: PerformanceMetric[] = [];

    for (const [metricName, metricArray] of this.metrics.entries()) {
      if (this.extractComponentName(metricName) === componentName) {
        componentMetrics.push(...metricArray);
      }
    }

    return componentMetrics;
  }

  private getComponentBottlenecks(componentName: string): PerformanceBottleneck[] {
    return Array.from(this.bottlenecks.values()).filter((b) => b.component === componentName);
  }

  private extractComponentName(metricName: string): string {
    const parts = metricName.split(".");
    return parts[0] || "unknown";
  }

  private calculateAvailability(metrics: PerformanceMetric[]): number {
    // 簡化的可用性計算
    const errorMetrics = metrics.filter((m) => m.name.includes("error"));
    if (errorMetrics.length === 0) return 100;

    const totalErrors = errorMetrics.reduce((sum, m) => sum + m.value, 0);
    const totalRequests = metrics.filter((m) => m.name.includes("request")).length || 1;

    return Math.max(0, (1 - totalErrors / totalRequests) * 100);
  }

  private calculateAverageResponseTime(metrics: PerformanceMetric[]): number {
    const responseTimeMetrics = metrics.filter(
      (m) => m.name.includes("response.time") || m.name.includes("execution.time")
    );

    return this.calculateAverageValue(responseTimeMetrics);
  }

  private calculateThroughput(metrics: PerformanceMetric[]): number {
    const throughputMetrics = metrics.filter(
      (m) => m.name.includes("throughput") || m.name.includes("requests.per.second")
    );

    return this.calculateAverageValue(throughputMetrics);
  }

  private calculateErrorRate(metrics: PerformanceMetric[]): number {
    const errorMetrics = metrics.filter((m) => m.name.includes("error.rate"));
    return this.calculateAverageValue(errorMetrics);
  }

  private calculateResourceUsage(metrics: PerformanceMetric[]): number {
    const resourceMetrics = metrics.filter(
      (m) => m.name.includes("cpu") || m.name.includes("memory")
    );

    return this.calculateAverageValue(resourceMetrics);
  }

  private calculateAverageValue(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  private calculateComponentScore(metrics: any): number {
    // 加權計算組件分數
    const weights = {
      availability: 0.3,
      responseTime: 0.2,
      throughput: 0.2,
      errorRate: 0.2,
      resourceUsage: 0.1,
    };

    let score = 100;

    // 可用性
    if (metrics.availability < 99) {
      score -= (99 - metrics.availability) * weights.availability * 10;
    }

    // 響應時間
    if (metrics.responseTime > 1000) {
      score -= Math.min(50, (metrics.responseTime - 1000) / 100) * weights.responseTime;
    }

    // 錯誤率
    if (metrics.errorRate > 1) {
      score -= Math.min(50, metrics.errorRate * 10) * weights.errorRate;
    }

    // 資源使用
    if (metrics.resourceUsage > 80) {
      score -= (metrics.resourceUsage - 80) * weights.resourceUsage * 2;
    }

    return Math.max(0, Math.min(100, score));
  }

  private determineHealthStatus(
    score: number
  ): "excellent" | "good" | "fair" | "poor" | "critical" {
    if (score >= 90) return "excellent";
    if (score >= 80) return "good";
    if (score >= 70) return "fair";
    if (score >= 50) return "poor";
    return "critical";
  }

  private analyzeAllComponents(): ComponentPerformanceProfile[] {
    const componentNames = new Set<string>();

    // 收集所有組件名稱
    for (const metricName of this.metrics.keys()) {
      componentNames.add(this.extractComponentName(metricName));
    }

    const profiles: ComponentPerformanceProfile[] = [];

    for (const componentName of componentNames) {
      const profile = this.analyzeComponent(componentName);
      profiles.push(profile);
    }

    return profiles;
  }

  private calculateOverallScore(components: ComponentPerformanceProfile[]): number {
    if (components.length === 0) return 100;

    return components.reduce((sum, c) => sum + c.score, 0) / components.length;
  }

  private determineSystemStatus(
    score: number
  ): "excellent" | "good" | "fair" | "poor" | "critical" {
    return this.determineHealthStatus(score);
  }

  private generateRecommendations(
    components: ComponentPerformanceProfile[],
    bottlenecks: PerformanceBottleneck[],
    insights: PerformanceInsight[]
  ): {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  } {
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const longTerm: string[] = [];

    // 基於瓶頸生成建議
    for (const bottleneck of bottlenecks) {
      if (bottleneck.severity === "critical") {
        immediate.push(...bottleneck.recommendations);
      } else if (bottleneck.severity === "high") {
        shortTerm.push(...bottleneck.recommendations);
      } else {
        longTerm.push(...bottleneck.recommendations);
      }
    }

    // 基於洞察生成建議
    for (const insight of insights) {
      if (insight.actionRequired) {
        const recommendations = insight.recommendations
          .filter((r) => r.priority === "high")
          .map((r) => r.action);
        immediate.push(...recommendations);
      }
    }

    // 基於組件狀態生成建議
    for (const component of components) {
      if (component.health === "critical" || component.health === "poor") {
        immediate.push(`立即檢查${component.componentName}組件的性能問題`);
      }
    }

    return {
      immediate: [...new Set(immediate)],
      shortTerm: [...new Set(shortTerm)],
      longTerm: [...new Set(longTerm)],
    };
  }

  private analyzeSystemTrends(): {
    performance: "improving" | "stable" | "degrading";
    reliability: "improving" | "stable" | "degrading";
    efficiency: "improving" | "stable" | "degrading";
  } {
    // 簡化的趨勢分析
    // 實際實現中可以基於歷史數據進行更複雜的分析

    return {
      performance: "stable",
      reliability: "stable",
      efficiency: "stable",
    };
  }
}
