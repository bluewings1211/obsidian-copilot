import { EventEmitter } from "events";
import { PerformanceMetric } from "../core/PerformanceMonitoringManager";
import { PerformanceBottleneck, PerformanceInsight } from "./PerformanceAnalyzer";
import { TrendData } from "../core/TrendAnalysisEngine";

export interface OptimizationRecommendation {
  id: string;
  category: "performance" | "resource" | "cost" | "reliability" | "scalability";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  impact: {
    performance: number; // 0-100
    cost: number; // 0-100
    complexity: number; // 0-100
    risk: number; // 0-100
  };
  implementation: {
    effort: "low" | "medium" | "high";
    timeline: string;
    prerequisites: string[];
    steps: string[];
  };
  metrics: string[];
  expectedOutcome: string;
  confidence: number; // 0-1
  basedOn: Array<{
    type: "bottleneck" | "trend" | "pattern" | "threshold";
    source: string;
    weight: number;
  }>;
  tags: string[];
  created: number;
}

export interface OptimizationStrategy {
  id: string;
  name: string;
  description: string;
  recommendations: OptimizationRecommendation[];
  estimatedImpact: {
    performanceGain: number; // %
    costReduction: number; // %
    implementationCost: number; // relative scale 1-10
  };
  timeline: string;
  priority: number; // 1-10
}

export interface AutoOptimizationRule {
  id: string;
  name: string;
  condition: {
    metric: string;
    operator: ">" | "<" | "=" | ">=" | "<=";
    value: number;
    duration?: number; // ms
  };
  action: {
    type: "scale" | "cache" | "throttle" | "alert" | "restart";
    parameters: Record<string, any>;
  };
  enabled: boolean;
  safetyLimits: {
    maxExecutions: number;
    cooldown: number; // ms
  };
  lastExecuted?: number;
  executionCount: number;
}

export interface OptimizationReport {
  timestamp: number;
  summary: {
    totalRecommendations: number;
    highPriorityItems: number;
    estimatedPerformanceGain: number;
    estimatedCostImpact: number;
  };
  strategies: OptimizationStrategy[];
  quickWins: OptimizationRecommendation[];
  longTermPlan: OptimizationRecommendation[];
  autoOptimizations: {
    executed: number;
    pending: number;
    rules: AutoOptimizationRule[];
  };
}

export class OptimizationEngine extends EventEmitter {
  private recommendations: Map<string, OptimizationRecommendation> = new Map();
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private autoRules: Map<string, AutoOptimizationRule> = new Map();
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private bottlenecks: Map<string, PerformanceBottleneck> = new Map();
  private insights: Map<string, PerformanceInsight> = new Map();
  private trends: Map<string, TrendData> = new Map();

  private optimizationInterval?: NodeJS.Timeout;
  private autoOptimizationInterval?: NodeJS.Timeout;
  private isRunning = false;

  private readonly analysisIntervalMs = 300000; // 5分鐘
  private readonly autoOptimizationIntervalMs = 60000; // 1分鐘

  constructor() {
    super();
    this.initializeDefaultRules();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期優化分析
    this.optimizationInterval = setInterval(() => {
      this.performOptimizationAnalysis();
    }, this.analysisIntervalMs);

    // 啟動自動優化檢查
    this.autoOptimizationInterval = setInterval(() => {
      this.performAutoOptimizations();
    }, this.autoOptimizationIntervalMs);

    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = undefined;
    }

    if (this.autoOptimizationInterval) {
      clearInterval(this.autoOptimizationInterval);
      this.autoOptimizationInterval = undefined;
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

      // 保持最近24小時的數據
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const filteredMetrics = metricArray.filter((m) => m.timestamp >= dayAgo);
      this.metrics.set(metric.name, filteredMetrics);
    }
  }

  addBottlenecks(bottlenecks: PerformanceBottleneck[]): void {
    for (const bottleneck of bottlenecks) {
      this.bottlenecks.set(bottleneck.id, bottleneck);
    }
  }

  addInsights(insights: PerformanceInsight[]): void {
    for (const insight of insights) {
      this.insights.set(insight.id, insight);
    }
  }

  addTrends(trends: TrendData[]): void {
    for (const trend of trends) {
      this.trends.set(trend.metric, trend);
    }
  }

  generateRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // 基於瓶頸生成建議
    recommendations.push(...this.generateBottleneckRecommendations());

    // 基於趨勢生成建議
    recommendations.push(...this.generateTrendRecommendations());

    // 基於洞察生成建議
    recommendations.push(...this.generateInsightRecommendations());

    // 基於指標分析生成建議
    recommendations.push(...this.generateMetricRecommendations());

    // 儲存建議
    for (const recommendation of recommendations) {
      this.recommendations.set(recommendation.id, recommendation);
    }

    this.emit("recommendationsGenerated", recommendations);
    return recommendations;
  }

  generateOptimizationStrategies(): OptimizationStrategy[] {
    const strategies: OptimizationStrategy[] = [];

    // 性能優化策略
    strategies.push(this.generatePerformanceStrategy());

    // 資源優化策略
    strategies.push(this.generateResourceStrategy());

    // 成本優化策略
    strategies.push(this.generateCostStrategy());

    // 可靠性策略
    strategies.push(this.generateReliabilityStrategy());

    // 可擴展性策略
    strategies.push(this.generateScalabilityStrategy());

    // 儲存策略
    for (const strategy of strategies) {
      this.strategies.set(strategy.id, strategy);
    }

    this.emit("strategiesGenerated", strategies);
    return strategies;
  }

  generateOptimizationReport(): OptimizationReport {
    const recommendations = this.generateRecommendations();
    const strategies = this.generateOptimizationStrategies();

    const highPriorityItems = recommendations.filter(
      (r) => r.priority === "high" || r.priority === "critical"
    ).length;

    const quickWins = recommendations.filter(
      (r) => r.implementation.effort === "low" && (r.priority === "high" || r.priority === "medium")
    );

    const longTermPlan = recommendations.filter(
      (r) => r.implementation.effort === "high" || r.category === "scalability"
    );

    const estimatedPerformanceGain =
      strategies.reduce((sum, s) => sum + s.estimatedImpact.performanceGain, 0) / strategies.length;

    const estimatedCostImpact =
      strategies.reduce((sum, s) => sum + s.estimatedImpact.costReduction, 0) / strategies.length;

    const report: OptimizationReport = {
      timestamp: Date.now(),
      summary: {
        totalRecommendations: recommendations.length,
        highPriorityItems,
        estimatedPerformanceGain,
        estimatedCostImpact,
      },
      strategies,
      quickWins,
      longTermPlan,
      autoOptimizations: {
        executed: Array.from(this.autoRules.values()).reduce((sum, r) => sum + r.executionCount, 0),
        pending: Array.from(this.autoRules.values()).filter((r) => r.enabled).length,
        rules: Array.from(this.autoRules.values()),
      },
    };

    this.emit("reportGenerated", report);
    return report;
  }

  addAutoOptimizationRule(rule: Omit<AutoOptimizationRule, "executionCount">): void {
    const fullRule: AutoOptimizationRule = {
      ...rule,
      executionCount: 0,
    };

    this.autoRules.set(rule.id, fullRule);
    this.emit("ruleAdded", fullRule);
  }

  removeAutoOptimizationRule(ruleId: string): void {
    if (this.autoRules.delete(ruleId)) {
      this.emit("ruleRemoved", ruleId);
    }
  }

  enableAutoOptimizationRule(ruleId: string, enabled: boolean): void {
    const rule = this.autoRules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.emit("ruleToggled", { ruleId, enabled });
    }
  }

  private async performOptimizationAnalysis(): Promise<void> {
    try {
      const recommendations = this.generateRecommendations();
      const strategies = this.generateOptimizationStrategies();

      // 檢查是否有新的高優先級建議
      const newHighPriority = recommendations.filter(
        (r) =>
          (r.priority === "high" || r.priority === "critical") &&
          Date.now() - r.created < this.analysisIntervalMs * 2
      );

      if (newHighPriority.length > 0) {
        this.emit("criticalRecommendations", newHighPriority);
      }

      this.emit("analysisComplete", {
        recommendations: recommendations.length,
        strategies: strategies.length,
        highPriority: newHighPriority.length,
      });
    } catch (error) {
      this.emit("analysisError", error);
    }
  }

  private async performAutoOptimizations(): Promise<void> {
    try {
      const now = Date.now();
      let executedCount = 0;

      for (const rule of this.autoRules.values()) {
        if (!rule.enabled) continue;

        // 檢查冷卻時間
        if (rule.lastExecuted && now - rule.lastExecuted < rule.safetyLimits.cooldown) {
          continue;
        }

        // 檢查執行次數限制
        if (rule.executionCount >= rule.safetyLimits.maxExecutions) {
          continue;
        }

        // 檢查條件
        if (await this.evaluateRuleCondition(rule)) {
          await this.executeOptimizationAction(rule);
          rule.lastExecuted = now;
          rule.executionCount++;
          executedCount++;

          this.emit("autoOptimizationExecuted", rule);
        }
      }

      if (executedCount > 0) {
        this.emit("autoOptimizationsComplete", { executed: executedCount });
      }
    } catch (error) {
      this.emit("autoOptimizationError", error);
    }
  }

  private async evaluateRuleCondition(rule: AutoOptimizationRule): Promise<boolean> {
    const metricData = this.metrics.get(rule.condition.metric);
    if (!metricData || metricData.length === 0) return false;

    const recentData =
      rule.condition.duration !== undefined
        ? metricData.filter((m) => Date.now() - m.timestamp < rule.condition.duration!)
        : [metricData[metricData.length - 1]];

    if (recentData.length === 0) return false;

    const currentValue = recentData[recentData.length - 1].value;

    switch (rule.condition.operator) {
      case ">":
        return currentValue > rule.condition.value;
      case "<":
        return currentValue < rule.condition.value;
      case ">=":
        return currentValue >= rule.condition.value;
      case "<=":
        return currentValue <= rule.condition.value;
      case "=":
        return Math.abs(currentValue - rule.condition.value) < 0.001;
      default:
        return false;
    }
  }

  private async executeOptimizationAction(rule: AutoOptimizationRule): Promise<void> {
    const { action } = rule;

    switch (action.type) {
      case "scale":
        await this.executeScaleAction(action.parameters);
        break;
      case "cache":
        await this.executeCacheAction(action.parameters);
        break;
      case "throttle":
        await this.executeThrottleAction(action.parameters);
        break;
      case "alert":
        await this.executeAlertAction(action.parameters);
        break;
      case "restart":
        await this.executeRestartAction(action.parameters);
        break;
    }
  }

  private async executeScaleAction(parameters: Record<string, any>): Promise<void> {
    // 模擬擴容操作
    this.emit("optimizationAction", {
      type: "scale",
      description: `擴容 ${parameters.component || "system"}`,
      parameters,
    });
  }

  private async executeCacheAction(parameters: Record<string, any>): Promise<void> {
    // 模擬緩存優化操作
    this.emit("optimizationAction", {
      type: "cache",
      description: `優化緩存策略`,
      parameters,
    });
  }

  private async executeThrottleAction(parameters: Record<string, any>): Promise<void> {
    // 模擬限流操作
    this.emit("optimizationAction", {
      type: "throttle",
      description: `啟用限流機制`,
      parameters,
    });
  }

  private async executeAlertAction(parameters: Record<string, any>): Promise<void> {
    // 發送警報
    this.emit("optimizationAlert", {
      message: parameters.message || "自動優化觸發",
      level: parameters.level || "warning",
      parameters,
    });
  }

  private async executeRestartAction(parameters: Record<string, any>): Promise<void> {
    // 模擬重啟操作
    this.emit("optimizationAction", {
      type: "restart",
      description: `重啟 ${parameters.component || "service"}`,
      parameters,
    });
  }

  private generateBottleneckRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    for (const bottleneck of this.bottlenecks.values()) {
      const recommendation = this.createBottleneckRecommendation(bottleneck);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  private createBottleneckRecommendation(
    bottleneck: PerformanceBottleneck
  ): OptimizationRecommendation | null {
    const baseRecommendation = {
      id: `bottleneck_opt_${bottleneck.id}`,
      metrics: [bottleneck.metric],
      confidence: Math.min(1, bottleneck.impact * 2),
      basedOn: [
        {
          type: "bottleneck" as const,
          source: bottleneck.id,
          weight: 1.0,
        },
      ],
      tags: [bottleneck.type, bottleneck.component],
      created: Date.now(),
    };

    switch (bottleneck.type) {
      case "cpu":
        return {
          ...baseRecommendation,
          category: "performance",
          priority: bottleneck.severity === "critical" ? "critical" : "high",
          title: "CPU性能優化",
          description: `${bottleneck.component}組件CPU使用率過高(${bottleneck.currentValue}%)，建議進行優化`,
          impact: {
            performance: 30,
            cost: 20,
            complexity: 40,
            risk: 20,
          },
          implementation: {
            effort: "medium",
            timeline: "1-2週",
            prerequisites: ["性能分析", "代碼審查"],
            steps: ["分析CPU熱點", "優化算法和數據結構", "實施並行化", "考慮硬件升級"],
          },
          expectedOutcome: "降低CPU使用率20-40%",
        };

      case "memory":
        return {
          ...baseRecommendation,
          category: "resource",
          priority: bottleneck.severity === "critical" ? "critical" : "high",
          title: "內存優化",
          description: `${bottleneck.component}組件內存使用率過高(${bottleneck.currentValue}%)`,
          impact: {
            performance: 25,
            cost: 15,
            complexity: 35,
            risk: 25,
          },
          implementation: {
            effort: "medium",
            timeline: "1-3週",
            prerequisites: ["內存分析", "泄漏檢測"],
            steps: ["檢測內存泄漏", "優化數據緩存", "實施內存池", "調整垃圾回收參數"],
          },
          expectedOutcome: "減少內存使用20-30%",
        };

      case "tool":
        return {
          ...baseRecommendation,
          category: "performance",
          priority: bottleneck.severity === "critical" ? "high" : "medium",
          title: "工具執行優化",
          description: `工具執行時間過長(${(bottleneck.currentValue / 1000).toFixed(1)}秒)`,
          impact: {
            performance: 40,
            cost: 10,
            complexity: 30,
            risk: 20,
          },
          implementation: {
            effort: "low",
            timeline: "1週",
            prerequisites: ["工具性能分析"],
            steps: ["分析工具瓶頸", "實施結果緩存", "優化工具邏輯", "增加超時設置"],
          },
          expectedOutcome: "提升工具執行速度30-50%",
        };

      default:
        return null;
    }
  }

  private generateTrendRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    for (const trend of this.trends.values()) {
      if (trend.severity === "high" || trend.severity === "critical") {
        const recommendation: OptimizationRecommendation = {
          id: `trend_opt_${trend.metric}_${Date.now()}`,
          category: "performance",
          priority: trend.severity === "critical" ? "high" : "medium",
          title: `${trend.metric}趨勢優化`,
          description: `${trend.metric}呈現${trend.direction === "increasing" ? "上升" : "下降"}趨勢，需要干預`,
          impact: {
            performance: 30,
            cost: 15,
            complexity: 25,
            risk: 30,
          },
          implementation: {
            effort: "medium",
            timeline: "2-4週",
            prerequisites: ["趨勢根因分析"],
            steps: ["識別趨勢驅動因素", "實施預防措施", "調整監控閾值", "建立自動化響應"],
          },
          metrics: [trend.metric],
          expectedOutcome: `穩定${trend.metric}指標`,
          confidence: trend.confidence,
          basedOn: [
            {
              type: "trend",
              source: trend.metric,
              weight: 1.0,
            },
          ],
          tags: ["trend", "prevention"],
          created: Date.now(),
        };

        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  private generateInsightRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    for (const insight of this.insights.values()) {
      if (insight.actionRequired && insight.recommendations.length > 0) {
        const recommendation: OptimizationRecommendation = {
          id: `insight_opt_${insight.id}`,
          category: insight.category === "critical" ? "reliability" : "performance",
          priority: insight.impact === "high" ? "high" : "medium",
          title: insight.title,
          description: insight.description,
          impact: {
            performance: insight.impact === "high" ? 40 : 20,
            cost: 10,
            complexity: 30,
            risk: 20,
          },
          implementation: {
            effort: insight.recommendations[0]?.effort || "medium",
            timeline: "1-2週",
            prerequisites: [],
            steps: insight.recommendations.map((r) => r.action),
          },
          metrics: insight.metrics,
          expectedOutcome: insight.recommendations[0]?.expectedImpact || "改善系統性能",
          confidence: 0.8,
          basedOn: [
            {
              type: "pattern",
              source: insight.id,
              weight: 1.0,
            },
          ],
          tags: ["insight", insight.category],
          created: Date.now(),
        };

        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  private generateMetricRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // 分析指標異常並生成建議
    for (const [metricName, metricData] of this.metrics.entries()) {
      if (metricData.length < 10) continue;

      const recentData = metricData.slice(-10);
      const avgValue = recentData.reduce((sum, m) => sum + m.value, 0) / recentData.length;

      // 基於指標類型生成特定建議
      if (metricName.includes("response.time") && avgValue > 2000) {
        recommendations.push({
          id: `metric_opt_response_time_${Date.now()}`,
          category: "performance",
          priority: "medium",
          title: "響應時間優化",
          description: `平均響應時間過長(${avgValue.toFixed(0)}ms)`,
          impact: {
            performance: 35,
            cost: 15,
            complexity: 30,
            risk: 20,
          },
          implementation: {
            effort: "medium",
            timeline: "2-3週",
            prerequisites: ["性能分析"],
            steps: ["識別慢查詢", "優化數據庫索引", "實施緩存策略", "優化網絡請求"],
          },
          metrics: [metricName],
          expectedOutcome: "響應時間減少30-50%",
          confidence: 0.7,
          basedOn: [
            {
              type: "threshold",
              source: metricName,
              weight: 1.0,
            },
          ],
          tags: ["response-time", "performance"],
          created: Date.now(),
        });
      }
    }

    return recommendations;
  }

  private generatePerformanceStrategy(): OptimizationStrategy {
    const performanceRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.category === "performance"
    );

    return {
      id: "performance_strategy",
      name: "性能優化策略",
      description: "全面提升系統性能的綜合策略",
      recommendations: performanceRecommendations,
      estimatedImpact: {
        performanceGain: 25,
        costReduction: 5,
        implementationCost: 6,
      },
      timeline: "2-3個月",
      priority: 8,
    };
  }

  private generateResourceStrategy(): OptimizationStrategy {
    const resourceRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.category === "resource"
    );

    return {
      id: "resource_strategy",
      name: "資源優化策略",
      description: "優化資源使用效率，降低運營成本",
      recommendations: resourceRecommendations,
      estimatedImpact: {
        performanceGain: 15,
        costReduction: 20,
        implementationCost: 5,
      },
      timeline: "1-2個月",
      priority: 7,
    };
  }

  private generateCostStrategy(): OptimizationStrategy {
    const costRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.category === "cost"
    );

    return {
      id: "cost_strategy",
      name: "成本優化策略",
      description: "降低運營成本，提高資源利用率",
      recommendations: costRecommendations,
      estimatedImpact: {
        performanceGain: 5,
        costReduction: 30,
        implementationCost: 4,
      },
      timeline: "1個月",
      priority: 6,
    };
  }

  private generateReliabilityStrategy(): OptimizationStrategy {
    const reliabilityRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.category === "reliability"
    );

    return {
      id: "reliability_strategy",
      name: "可靠性提升策略",
      description: "提高系統穩定性和可用性",
      recommendations: reliabilityRecommendations,
      estimatedImpact: {
        performanceGain: 10,
        costReduction: 0,
        implementationCost: 7,
      },
      timeline: "3-4個月",
      priority: 9,
    };
  }

  private generateScalabilityStrategy(): OptimizationStrategy {
    const scalabilityRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.category === "scalability"
    );

    return {
      id: "scalability_strategy",
      name: "可擴展性策略",
      description: "為未來增長做好架構準備",
      recommendations: scalabilityRecommendations,
      estimatedImpact: {
        performanceGain: 20,
        costReduction: 10,
        implementationCost: 8,
      },
      timeline: "6個月",
      priority: 5,
    };
  }

  private initializeDefaultRules(): void {
    // CPU使用率過高自動限流
    this.addAutoOptimizationRule({
      id: "cpu_throttle",
      name: "CPU過載自動限流",
      condition: {
        metric: "system.cpu.usage",
        operator: ">",
        value: 90,
        duration: 300000, // 5分鐘
      },
      action: {
        type: "throttle",
        parameters: {
          component: "api",
          rate: 0.7,
        },
      },
      enabled: true,
      safetyLimits: {
        maxExecutions: 3,
        cooldown: 600000, // 10分鐘
      },
    });

    // 內存使用率過高自動清理緩存
    this.addAutoOptimizationRule({
      id: "memory_cache_clear",
      name: "高內存使用時清理緩存",
      condition: {
        metric: "system.memory.usage",
        operator: ">",
        value: 85,
      },
      action: {
        type: "cache",
        parameters: {
          action: "clear_old_entries",
          percentage: 30,
        },
      },
      enabled: true,
      safetyLimits: {
        maxExecutions: 5,
        cooldown: 300000, // 5分鐘
      },
    });

    // 工具執行時間過長自動重啟
    this.addAutoOptimizationRule({
      id: "tool_timeout_restart",
      name: "工具超時自動重啟",
      condition: {
        metric: "tool.execution.time",
        operator: ">",
        value: 30000, // 30秒
      },
      action: {
        type: "restart",
        parameters: {
          component: "tool_executor",
        },
      },
      enabled: false, // 默認禁用，風險較高
      safetyLimits: {
        maxExecutions: 2,
        cooldown: 1800000, // 30分鐘
      },
    });
  }
}
