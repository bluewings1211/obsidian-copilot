/**
 * 搜索監控系統工廠函數
 * 提供便捷的創建和配置方法
 */

import { UnifiedSearchMonitor } from "./core/UnifiedSearchMonitor";
import { SearchDashboard } from "./core/SearchDashboard";
import { MetricsAggregator } from "./core/MetricsAggregator";
import { RealTimeAnalyzer } from "./core/RealTimeAnalyzer";
import { ABTestManager } from "./evaluation/ABTestManager";
import {
  MonitoringConfig,
  SearchComponent,
  StorageBackend,
  TimeGranularity,
  AlertSeverity,
  ComparisonOperator,
  ChannelType,
} from "./types";

// ============================================================================
// 預設配置創建函數
// ============================================================================

/**
 * 創建默認監控配置
 */
export function createDefaultMonitoringConfig(): MonitoringConfig {
  return {
    collection: {
      enabled: true,
      sampleRate: 1.0,
      bufferSize: 1000,
      flushInterval: 5000,
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7天
      components: [
        SearchComponent.MAPREDUCE_CORE,
        SearchComponent.VECTOR_SEARCH,
        SearchComponent.KEYWORD_SEARCH,
        SearchComponent.SEARCH_AGGREGATION,
        SearchComponent.PERSONALIZATION,
        SearchComponent.RANKING,
        SearchComponent.QUALITY_FILTER,
        SearchComponent.CACHE_SYSTEM,
      ],
    },
    storage: {
      backend: StorageBackend.MEMORY,
      compression: false,
      encryption: false,
      replication: 1,
    },
    analysis: {
      realTime: true,
      batchSize: 100,
      algorithms: [
        { name: "anomaly_detection", enabled: true, config: {} },
        { name: "pattern_recognition", enabled: true, config: {} },
        { name: "bottleneck_analysis", enabled: true, config: {} },
      ],
    },
    alerting: {
      enabled: true,
      rules: [
        {
          id: "high_latency",
          name: "高延遲警報",
          condition: {
            metric: "latency.p95",
            operator: ComparisonOperator.GREATER_THAN,
            threshold: 5000,
            timeWindow: 60000,
            evaluationFrequency: 30000,
          },
          severity: AlertSeverity.HIGH,
          channels: ["console"],
          enabled: true,
          cooldown: 300000,
        },
        {
          id: "high_error_rate",
          name: "高錯誤率警報",
          condition: {
            metric: "errors.errorRate",
            operator: ComparisonOperator.GREATER_THAN,
            threshold: 0.1,
            timeWindow: 60000,
            evaluationFrequency: 30000,
          },
          severity: AlertSeverity.CRITICAL,
          channels: ["console"],
          enabled: true,
          cooldown: 300000,
        },
      ],
      channels: [
        {
          type: ChannelType.CONSOLE,
          config: {},
        },
      ],
    },
    visualization: {
      dashboard: {
        refreshInterval: 5000,
        timeRange: {
          start: new Date(Date.now() - 24 * 60 * 60 * 1000),
          end: new Date(),
          granularity: TimeGranularity.MINUTE,
        },
        components: [],
        alertRules: [],
        exportFormats: [],
      },
      charts: [],
      themes: {
        name: "default",
        colors: {
          primary: "#2196F3",
          secondary: "#FFC107",
          accent: "#4CAF50",
          background: "#FFFFFF",
          text: "#212121",
          error: "#F44336",
          warning: "#FF9800",
          success: "#4CAF50",
        },
        dark: false,
      },
      responsive: true,
    },
    api: {
      enabled: true,
      port: 3001,
      auth: {
        type: "none" as any,
        config: {},
      },
      rateLimit: {
        enabled: true,
        requests: 100,
        window: 60000,
        skipSuccessfulRequests: true,
      },
      cors: {
        enabled: true,
        origins: ["*"],
        methods: ["GET", "POST"],
        headers: ["Content-Type", "Authorization"],
      },
    },
  };
}

/**
 * 創建高性能配置
 */
export function createHighPerformanceConfig(): MonitoringConfig {
  const config = createDefaultMonitoringConfig();

  // 優化性能配置
  config.collection.bufferSize = 2000;
  config.collection.flushInterval = 3000;
  config.analysis.realTime = true;
  config.analysis.batchSize = 200;

  return config;
}

/**
 * 創建生產環境配置
 */
export function createProductionConfig(): MonitoringConfig {
  const config = createDefaultMonitoringConfig();

  // 生產環境配置
  config.storage.backend = StorageBackend.FILE;
  config.storage.compression = true;
  config.storage.encryption = true;
  config.storage.replication = 2;

  config.collection.retentionPeriod = 30 * 24 * 60 * 60 * 1000; // 30天

  // 更嚴格的警報規則
  config.alerting.rules[0].condition.threshold = 3000; // 3秒延遲警報
  config.alerting.rules[1].condition.threshold = 0.05; // 5% 錯誤率警報

  return config;
}

/**
 * 創建開發環境配置
 */
export function createDevelopmentConfig(): MonitoringConfig {
  const config = createDefaultMonitoringConfig();

  // 開發環境配置
  config.collection.sampleRate = 0.1; // 10% 採樣
  config.collection.bufferSize = 100;
  config.collection.retentionPeriod = 24 * 60 * 60 * 1000; // 1天

  config.analysis.realTime = false;
  config.alerting.enabled = false;

  return config;
}

// ============================================================================
// 系統創建函數
// ============================================================================

/**
 * 創建統一搜索監控系統
 */
export function createSearchMonitoringSystem(config?: Partial<MonitoringConfig>) {
  const finalConfig = config
    ? mergeConfigs(createDefaultMonitoringConfig(), config)
    : createDefaultMonitoringConfig();

  const monitor = new UnifiedSearchMonitor({
    config: finalConfig,
    enableRealTime: finalConfig.analysis.realTime,
    bufferSize: finalConfig.collection.bufferSize,
    flushInterval: finalConfig.collection.flushInterval,
  });

  const dashboard = new SearchDashboard({
    monitor,
    config: finalConfig.visualization,
    refreshInterval: finalConfig.visualization.dashboard.refreshInterval,
  });

  const aggregator = new MetricsAggregator({
    windowSize: 300000, // 5分鐘窗口
    granularity: TimeGranularity.MINUTE,
    enableRealTime: finalConfig.analysis.realTime,
    maxRetentionTime: finalConfig.collection.retentionPeriod,
  });

  const analyzer = new RealTimeAnalyzer({
    windowSize: 60000, // 1分鐘窗口
    anomalyThreshold: 2.0,
    enablePrediction: true,
    alertThresholds: {
      latencyWarning: 3000,
      latencyCritical: 5000,
      errorRateWarning: 0.05,
      errorRateCritical: 0.1,
      throughputWarning: 5,
      throughputCritical: 2,
    },
  });

  const abTestManager = new ABTestManager({
    enableAutoAnalysis: true,
    minSampleSize: 1000,
    significanceLevel: 0.05,
    maxTestDuration: 14 * 24 * 60 * 60 * 1000, // 14天
  });

  return {
    monitor,
    dashboard,
    aggregator,
    analyzer,
    abTestManager,

    // 便捷方法
    async start() {
      await monitor.start();
      await dashboard.start();
      await analyzer.start();
      console.log("🔍 搜索監控系統已啟動");
    },

    async stop() {
      await monitor.stop();
      await dashboard.stop();
      await analyzer.stop();
      aggregator.stop();
      console.log("🔍 搜索監控系統已停止");
    },

    // 獲取系統狀態
    getSystemStatus() {
      return {
        monitor: monitor.getRealTimeStats(),
        dashboard: dashboard.getRealTimeStatus(),
        analyzer: analyzer.getAnalysisStatus(),
        aggregator: aggregator.getMetricsSummary(),
        abTests: abTestManager.getActiveTests(),
      };
    },
  };
}

/**
 * 創建輕量級監控系統（僅核心功能）
 */
export function createLightweightMonitoringSystem() {
  const config = createDevelopmentConfig();
  config.analysis.realTime = false;
  config.alerting.enabled = false;

  return createSearchMonitoringSystem(config);
}

/**
 * 創建企業級監控系統
 */
export function createEnterpriseMonitoringSystem() {
  const config = createProductionConfig();

  // 企業級特性
  config.storage.backend = StorageBackend.ELASTICSEARCH;
  config.api.auth.type = "bearer_token" as any;

  // 更多警報通道
  config.alerting.channels.push(
    { type: ChannelType.EMAIL, config: { smtp: "smtp.company.com" } },
    { type: ChannelType.SLACK, config: { webhook: "https://hooks.slack.com/..." } }
  );

  return createSearchMonitoringSystem(config);
}

// ============================================================================
// 輔助函數
// ============================================================================

/**
 * 合併配置
 */
function mergeConfigs(
  defaultConfig: MonitoringConfig,
  userConfig: Partial<MonitoringConfig>
): MonitoringConfig {
  return {
    collection: { ...defaultConfig.collection, ...userConfig.collection },
    storage: { ...defaultConfig.storage, ...userConfig.storage },
    analysis: { ...defaultConfig.analysis, ...userConfig.analysis },
    alerting: { ...defaultConfig.alerting, ...userConfig.alerting },
    visualization: { ...defaultConfig.visualization, ...userConfig.visualization },
    api: { ...defaultConfig.api, ...userConfig.api },
  };
}

/**
 * 驗證配置
 */
export function validateMonitoringConfig(config: MonitoringConfig): string[] {
  const errors: string[] = [];

  if (config.collection.bufferSize <= 0) {
    errors.push("緩衝區大小必須大於 0");
  }

  if (config.collection.flushInterval <= 0) {
    errors.push("刷新間隔必須大於 0");
  }

  if (config.collection.sampleRate < 0 || config.collection.sampleRate > 1) {
    errors.push("採樣率必須在 0-1 之間");
  }

  return errors;
}

/**
 * 獲取配置摘要
 */
export function getConfigSummary(config: MonitoringConfig): any {
  return {
    storage: config.storage.backend,
    components: config.collection.components.length,
    realTimeAnalysis: config.analysis.realTime,
    alertRules: config.alerting.rules.length,
    bufferSize: config.collection.bufferSize,
    retentionDays: config.collection.retentionPeriod / (24 * 60 * 60 * 1000),
  };
}
