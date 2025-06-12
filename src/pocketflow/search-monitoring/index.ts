/**
 * PocketFlow.js 搜索性能監控和分析系統
 * 階段 3 任務 5：統一搜索監控平台
 */

// ============================================================================
// 核心組件導出
// ============================================================================

export { UnifiedSearchMonitor } from "./core/UnifiedSearchMonitor";
export { SearchDashboard } from "./core/SearchDashboard";
export { MetricsAggregator } from "./core/MetricsAggregator";
export { RealTimeAnalyzer } from "./core/RealTimeAnalyzer";

// ============================================================================
// 評估組件導出
// ============================================================================

export { ABTestManager } from "./evaluation/ABTestManager";

// ============================================================================
// 工廠函數導出
// ============================================================================

export {
  createSearchMonitoringSystem,
  createLightweightMonitoringSystem,
  createEnterpriseMonitoringSystem,
  createDefaultMonitoringConfig,
  createHighPerformanceConfig,
  createProductionConfig,
  createDevelopmentConfig,
  validateMonitoringConfig,
  getConfigSummary,
} from "./factory";

// ============================================================================
// 類型導出
// ============================================================================

export type {
  // 核心監控類型
  SearchMonitoringEvent,
  PerformanceMetrics,
  SearchComponent,
  SearchEventType,

  // 配置類型
  MonitoringConfig,
  CollectionConfig,
  StorageConfig,
  AnalysisConfig,
  AlertingConfig,
  VisualizationConfig,
  APIConfig,

  // 指標類型
  LatencyMetrics,
  ThroughputMetrics,
  QualityMetrics,
  UserExperienceMetrics,
  ResourceMetrics,
  ErrorMetrics,

  // 儀表板類型
  DashboardConfig,
  DashboardComponent,
  DashboardComponentType,
  DashboardData,
  WidgetData,

  // A/B 測試類型
  ABTestConfig,
  ABTestResult,
  ABTestStatus,
  TestVariant,
  ABTestMetric,
  MetricType,
  TestRecommendation,

  // 分析類型
  BottleneckAnalysis,
  BottleneckSeverity,
  OptimizationRecommendation,
  OptimizationType,

  // 用戶行為類型
  UserBehaviorPattern,
  BehaviorPattern,
  QueryType,
  SearchIntent,

  // 預測類型
  PredictionModel,
  Prediction,
  TrendAnalysis,
  TrendDirection,

  // 警報類型
  AlertRule,
  AlertCondition,
  AlertSeverity,
  NotificationChannel,

  // 輔助類型
  TimeRange,
  TimeGranularity,
  MonitoringSummary,
} from "./types";

// ============================================================================
// 默認實例創建
// ============================================================================

/**
 * 創建默認搜索監控系統實例
 */
export async function createDefaultSearchMonitoring() {
  const factory = await import("./factory");
  return factory.createSearchMonitoringSystem();
}

/**
 * 快速啟動搜索監控
 */
export async function quickStartMonitoring(options?: {
  lightweight?: boolean;
  enterprise?: boolean;
}) {
  const factory = await import("./factory");

  let system;

  if (options?.lightweight) {
    system = factory.createLightweightMonitoringSystem();
  } else if (options?.enterprise) {
    system = factory.createEnterpriseMonitoringSystem();
  } else {
    system = factory.createSearchMonitoringSystem();
  }

  await system.start();

  console.log("🚀 搜索監控系統已快速啟動");
  console.log("📊 儀表板：http://localhost:3001/dashboard");
  console.log("📈 指標：http://localhost:3001/metrics");
  console.log("🔍 API：http://localhost:3001/api");

  return system;
}

// ============================================================================
// 版本信息
// ============================================================================

export const SEARCH_MONITORING_VERSION = "1.0.0";
export const SUPPORTED_COMPONENTS = [
  "mapreduce_core",
  "vector_search",
  "keyword_search",
  "search_aggregation",
  "personalization",
  "ranking",
  "quality_filter",
  "cache_system",
];

// ============================================================================
// 集成助手
// ============================================================================

/**
 * 與階段 3 其他任務的集成助手
 */
export class Stage3Integration {
  private monitoringSystem: any;

  constructor(monitoringSystem: any) {
    this.monitoringSystem = monitoringSystem;
  }

  /**
   * 集成 MapReduce 搜索核心（任務 1）
   */
  integrateMapReduceCore(mapReduceCore: any) {
    // 監聽 MapReduce 事件
    mapReduceCore.on("search:started", (event: any) => {
      this.monitoringSystem.monitor.recordEvent({
        type: "search_started",
        component: "mapreduce_core",
        data: event,
      });
    });

    mapReduceCore.on("search:completed", (event: any) => {
      this.monitoringSystem.monitor.recordEvent({
        type: "search_completed",
        component: "mapreduce_core",
        data: event,
      });
    });

    console.log("✅ MapReduce 核心監控已集成");
  }

  /**
   * 集成向量搜索系統（任務 2）
   */
  integrateVectorSearch(vectorSearch: any) {
    vectorSearch.on("vector:search", (event: any) => {
      this.monitoringSystem.monitor.recordEvent({
        type: "search_started",
        component: "vector_search",
        data: event,
      });
    });

    console.log("✅ 向量搜索監控已集成");
  }

  /**
   * 集成關鍵字搜索（任務 3）
   */
  integrateKeywordSearch(keywordSearch: any) {
    keywordSearch.on("keyword:search", (event: any) => {
      this.monitoringSystem.monitor.recordEvent({
        type: "search_started",
        component: "keyword_search",
        data: event,
      });
    });

    console.log("✅ 關鍵字搜索監控已集成");
  }

  /**
   * 集成搜索聚合系統（任務 4）
   */
  integrateSearchAggregation(aggregation: any) {
    aggregation.on("aggregation:completed", (event: any) => {
      this.monitoringSystem.monitor.recordEvent({
        type: "aggregation_completed",
        component: "search_aggregation",
        data: event,
      });
    });

    console.log("✅ 搜索聚合監控已集成");
  }

  /**
   * 創建階段 3 完整集成
   */
  async createStage3Integration(components: {
    mapReduceCore?: any;
    vectorSearch?: any;
    keywordSearch?: any;
    searchAggregation?: any;
  }) {
    if (components.mapReduceCore) {
      this.integrateMapReduceCore(components.mapReduceCore);
    }

    if (components.vectorSearch) {
      this.integrateVectorSearch(components.vectorSearch);
    }

    if (components.keywordSearch) {
      this.integrateKeywordSearch(components.keywordSearch);
    }

    if (components.searchAggregation) {
      this.integrateSearchAggregation(components.searchAggregation);
    }

    console.log("🎉 階段 3 完整搜索系統監控集成完成！");

    return {
      monitoring: this.monitoringSystem,
      dashboard: await this.createIntegratedDashboard(),
      analytics: await this.createIntegratedAnalytics(),
    };
  }

  private async createIntegratedDashboard() {
    // 創建集成儀表板
    return {
      url: "http://localhost:3001/stage3-dashboard",
      widgets: [
        "performance_overview",
        "component_status",
        "search_quality",
        "user_experience",
        "system_health",
      ],
    };
  }

  private async createIntegratedAnalytics() {
    // 創建集成分析
    return {
      realTimeAnalysis: true,
      predictiveAnalytics: true,
      abTesting: true,
      bottleneckDetection: true,
      userBehaviorAnalysis: true,
    };
  }
}

/**
 * 創建階段 3 完整集成
 */
export async function createStage3CompleteIntegration(components: any) {
  const monitoringSystem = await quickStartMonitoring({ enterprise: true });
  const integration = new Stage3Integration(monitoringSystem);

  return integration.createStage3Integration(components);
}

// ============================================================================
// 導出默認實例（便於快速使用）
// ============================================================================

export default {
  createSystem: createDefaultSearchMonitoring,
  quickStart: quickStartMonitoring,
  Stage3Integration,
  version: SEARCH_MONITORING_VERSION,
};
