/**
 * PocketFlow.js Search Aggregation System - Factory Functions
 * 工廠函數：創建和配置搜索聚合系統
 */

import {
  SearchAggregationConfig,
  CoreAggregationConfig,
  RankingConfig,
  PersonalizationConfig,
  QualityConfig,
  MonitoringConfig,
  RankingStrategy,
} from "./types";

import { UnifiedSearchAggregator } from "./core/UnifiedSearchAggregator";

/**
 * 創建搜索聚合系統
 */
export function createSearchAggregationSystem(
  config?: Partial<SearchAggregationConfig>
): UnifiedSearchAggregator {
  const fullConfig = config ? { ...createDefaultConfig(), ...config } : createDefaultConfig();
  return new UnifiedSearchAggregator(fullConfig);
}

/**
 * 創建默認配置
 */
export function createDefaultConfig(): SearchAggregationConfig {
  return {
    core: createDefaultCoreConfig(),
    ranking: createDefaultRankingConfig(),
    personalization: createDefaultPersonalizationConfig(),
    quality: createDefaultQualityConfig(),
    monitoring: createDefaultMonitoringConfig(),
  };
}

/**
 * 創建高性能配置
 */
export function createHighPerformanceConfig(): SearchAggregationConfig {
  return {
    core: {
      ...createDefaultCoreConfig(),
      maxResults: 100,
      aggregationTimeout: 15000,
      parallelProcessing: true,
      caching: {
        enabled: true,
        ttl: 300000, // 5分鐘
        maxSize: 10000,
        strategy: "lru",
      },
    },
    ranking: {
      ...createDefaultRankingConfig(),
      enableAdaptive: true,
      diversityThreshold: 0.6,
      contextWeight: 0.4,
    },
    personalization: {
      ...createDefaultPersonalizationConfig(),
      enabled: true,
      adaptationRate: 0.15,
      historyDepth: 200,
      biasCorrection: true,
    },
    quality: {
      ...createDefaultQualityConfig(),
      enableQualityAssessment: true,
      enableSpamDetection: true,
      enableDeduplication: true,
      qualityThresholds: {
        content: 0.4,
        source: 0.3,
        relevance: 0.3,
        overall: 0.35,
      },
    },
    monitoring: {
      ...createDefaultMonitoringConfig(),
      enableRealTimeMonitoring: true,
      enablePerformanceAnalytics: true,
      enableAlerts: true,
      reportingInterval: 30000, // 30秒
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7天
    },
  };
}

/**
 * 創建質量優先配置
 */
export function createQualityFocusedConfig(): SearchAggregationConfig {
  return {
    core: {
      ...createDefaultCoreConfig(),
      maxResults: 30,
      normalizeScores: true,
      enableDeduplication: true,
      aggregationTimeout: 20000,
      parallelProcessing: true,
    },
    ranking: {
      ...createDefaultRankingConfig(),
      defaultStrategy: "quality-authority",
      enableAdaptive: false,
      diversityThreshold: 0.8,
      qualityThreshold: 0.7,
      contextWeight: 0.2,
    },
    personalization: {
      ...createDefaultPersonalizationConfig(),
      enabled: false, // 質量優先，減少個性化干擾
      biasCorrection: true,
    },
    quality: {
      enableQualityAssessment: true,
      enableSpamDetection: true,
      enableDeduplication: true,
      qualityThresholds: {
        content: 0.7,
        source: 0.6,
        relevance: 0.6,
        overall: 0.65,
      },
      deduplicationThreshold: 0.9,
      spamThreshold: 0.3,
    },
    monitoring: {
      ...createDefaultMonitoringConfig(),
      enableRealTimeMonitoring: true,
      enablePerformanceAnalytics: true,
      enableAlerts: true,
    },
  };
}

/**
 * 創建個性化優先配置
 */
export function createPersonalizationFocusedConfig(): SearchAggregationConfig {
  return {
    core: {
      ...createDefaultCoreConfig(),
      maxResults: 50,
      normalizeScores: true,
      enableDeduplication: true,
      parallelProcessing: true,
    },
    ranking: {
      ...createDefaultRankingConfig(),
      defaultStrategy: "relevance-quality",
      enableAdaptive: true,
      diversityThreshold: 0.7,
      qualityThreshold: 0.5,
      contextWeight: 0.5,
    },
    personalization: {
      enabled: true,
      adaptationRate: 0.2,
      historyDepth: 500,
      privacyLevel: "balanced",
      biasCorrection: true,
    },
    quality: {
      ...createDefaultQualityConfig(),
      qualityThresholds: {
        content: 0.3,
        source: 0.3,
        relevance: 0.4,
        overall: 0.35,
      },
    },
    monitoring: {
      ...createDefaultMonitoringConfig(),
      enableRealTimeMonitoring: true,
      enablePerformanceAnalytics: true,
    },
  };
}

/**
 * 創建內存優化配置
 */
export function createMemoryOptimizedConfig(): SearchAggregationConfig {
  return {
    core: {
      maxResults: 20,
      normalizeScores: true,
      enableDeduplication: true,
      aggregationTimeout: 10000,
      parallelProcessing: false, // 減少並行開銷
      caching: {
        enabled: true,
        ttl: 60000, // 1分鐘
        maxSize: 100,
        strategy: "lru",
      },
    },
    ranking: {
      defaultStrategy: "relevance-quality",
      enableAdaptive: false, // 減少內存使用
      diversityThreshold: 0.6,
      qualityThreshold: 0.5,
      contextWeight: 0.3,
      strategies: [],
    },
    personalization: {
      enabled: false, // 減少內存使用
      adaptationRate: 0.1,
      historyDepth: 50,
      privacyLevel: "strict",
      biasCorrection: false,
    },
    quality: {
      enableQualityAssessment: true,
      enableSpamDetection: false, // 減少處理開銷
      enableDeduplication: true,
      qualityThresholds: {
        content: 0.4,
        source: 0.4,
        relevance: 0.4,
        overall: 0.4,
      },
      deduplicationThreshold: 0.8,
      spamThreshold: 0.5,
    },
    monitoring: {
      enableRealTimeMonitoring: false,
      enablePerformanceAnalytics: false,
      enableAlerts: false,
      reportingInterval: 300000, // 5分鐘
      retentionPeriod: 24 * 60 * 60 * 1000, // 1天
    },
  };
}

/**
 * 創建開發環境配置
 */
export function createDevelopmentConfig(): SearchAggregationConfig {
  return {
    core: {
      maxResults: 10,
      normalizeScores: true,
      enableDeduplication: false,
      aggregationTimeout: 5000,
      parallelProcessing: false,
      caching: {
        enabled: false,
        ttl: 10000,
        maxSize: 10,
        strategy: "lru",
      },
    },
    ranking: {
      defaultStrategy: "relevance-quality",
      enableAdaptive: false,
      diversityThreshold: 0.5,
      qualityThreshold: 0.3,
      contextWeight: 0.2,
      strategies: [],
    },
    personalization: {
      enabled: false,
      adaptationRate: 0.1,
      historyDepth: 10,
      privacyLevel: "permissive",
      biasCorrection: false,
    },
    quality: {
      enableQualityAssessment: false,
      enableSpamDetection: false,
      enableDeduplication: false,
      qualityThresholds: {
        content: 0.1,
        source: 0.1,
        relevance: 0.1,
        overall: 0.1,
      },
      deduplicationThreshold: 0.5,
      spamThreshold: 0.8,
    },
    monitoring: {
      enableRealTimeMonitoring: true,
      enablePerformanceAnalytics: true,
      enableAlerts: true,
      reportingInterval: 10000, // 10秒
      retentionPeriod: 60 * 60 * 1000, // 1小時
    },
  };
}

// ==================== 默認配置創建函數 ====================

/**
 * 創建默認核心配置
 */
function createDefaultCoreConfig(): CoreAggregationConfig {
  return {
    maxResults: 50,
    normalizeScores: true,
    enableDeduplication: true,
    aggregationTimeout: 10000,
    parallelProcessing: true,
    caching: {
      enabled: true,
      ttl: 120000, // 2分鐘
      maxSize: 1000,
      strategy: "lru",
    },
  };
}

/**
 * 創建默認排序配置
 */
function createDefaultRankingConfig(): RankingConfig {
  return {
    defaultStrategy: "relevance-quality",
    enableAdaptive: true,
    diversityThreshold: 0.7,
    qualityThreshold: 0.5,
    contextWeight: 0.3,
    strategies: [], // 將由 IntelligentRanker 初始化
  };
}

/**
 * 創建默認個性化配置
 */
function createDefaultPersonalizationConfig(): PersonalizationConfig {
  return {
    enabled: true,
    adaptationRate: 0.1,
    historyDepth: 100,
    privacyLevel: "balanced",
    biasCorrection: true,
  };
}

/**
 * 創建默認質量配置
 */
function createDefaultQualityConfig(): QualityConfig {
  return {
    enableQualityAssessment: true,
    enableSpamDetection: true,
    enableDeduplication: true,
    qualityThresholds: {
      content: 0.5,
      source: 0.4,
      relevance: 0.4,
      overall: 0.45,
    },
    deduplicationThreshold: 0.8,
    spamThreshold: 0.6,
  };
}

/**
 * 創建默認監控配置
 */
function createDefaultMonitoringConfig(): MonitoringConfig {
  return {
    enableRealTimeMonitoring: true,
    enablePerformanceAnalytics: true,
    enableAlerts: true,
    reportingInterval: 60000, // 1分鐘
    retentionPeriod: 3 * 24 * 60 * 60 * 1000, // 3天
  };
}

// ==================== 配置預設集合 ====================

/**
 * 獲取所有預設配置
 */
export function getPresetConfigs(): Record<string, SearchAggregationConfig> {
  return {
    default: createDefaultConfig(),
    highPerformance: createHighPerformanceConfig(),
    qualityFocused: createQualityFocusedConfig(),
    personalizationFocused: createPersonalizationFocusedConfig(),
    memoryOptimized: createMemoryOptimizedConfig(),
    development: createDevelopmentConfig(),
  };
}

/**
 * 根據名稱獲取預設配置
 */
export function getPresetConfig(name: string): SearchAggregationConfig {
  const presets = getPresetConfigs();
  return presets[name] || presets.default;
}

/**
 * 驗證配置
 */
export function validateConfig(config: SearchAggregationConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 驗證核心配置
  if (config.core.maxResults <= 0) {
    errors.push("maxResults 必須大於 0");
  }

  if (config.core.aggregationTimeout <= 0) {
    errors.push("aggregationTimeout 必須大於 0");
  }

  // 驗證質量閾值
  const thresholds = config.quality.qualityThresholds;
  if (thresholds.content < 0 || thresholds.content > 1) {
    errors.push("content 質量閾值必須在 0-1 之間");
  }

  if (thresholds.source < 0 || thresholds.source > 1) {
    errors.push("source 質量閾值必須在 0-1 之間");
  }

  if (thresholds.relevance < 0 || thresholds.relevance > 1) {
    errors.push("relevance 質量閾值必須在 0-1 之間");
  }

  if (thresholds.overall < 0 || thresholds.overall > 1) {
    errors.push("overall 質量閾值必須在 0-1 之間");
  }

  // 驗證個性化配置
  if (config.personalization.adaptationRate < 0 || config.personalization.adaptationRate > 1) {
    errors.push("adaptationRate 必須在 0-1 之間");
  }

  if (config.personalization.historyDepth <= 0) {
    errors.push("historyDepth 必須大於 0");
  }

  // 驗證監控配置
  if (config.monitoring.reportingInterval <= 0) {
    errors.push("reportingInterval 必須大於 0");
  }

  if (config.monitoring.retentionPeriod <= 0) {
    errors.push("retentionPeriod 必須大於 0");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 合併配置
 */
export function mergeConfigs(
  base: SearchAggregationConfig,
  override: Partial<SearchAggregationConfig>
): SearchAggregationConfig {
  return {
    core: { ...base.core, ...override.core },
    ranking: { ...base.ranking, ...override.ranking },
    personalization: { ...base.personalization, ...override.personalization },
    quality: { ...base.quality, ...override.quality },
    monitoring: { ...base.monitoring, ...override.monitoring },
  };
}

/**
 * 創建自定義排序策略
 */
export function createCustomRankingStrategy(
  id: string,
  name: string,
  description: string,
  factorWeights: any,
  executeFunction: any
): RankingStrategy {
  return {
    id,
    name,
    description,
    factorWeights,
    contextAdaptive: true,
    execute: executeFunction,
  };
}

/**
 * 獲取配置摘要
 */
export function getConfigSummary(config: SearchAggregationConfig): Record<string, any> {
  return {
    maxResults: config.core.maxResults,
    cachingEnabled: config.core.caching.enabled,
    parallelProcessing: config.core.parallelProcessing,
    personalizationEnabled: config.personalization.enabled,
    qualityAssessmentEnabled: config.quality.enableQualityAssessment,
    realTimeMonitoring: config.monitoring.enableRealTimeMonitoring,
    defaultRankingStrategy: config.ranking.defaultStrategy,
    aggregationTimeout: config.core.aggregationTimeout,
    adaptationRate: config.personalization.adaptationRate,
    qualityThreshold: config.quality.qualityThresholds.overall,
  };
}
