/**
 * 關鍵字搜索系統工廠函數和配置
 */

import { KeywordSearchEngine } from "./KeywordSearchEngine";
import {
  KeywordSearchConfig,
  QueryStrategy,
  IndexStrategy,
  HybridSearchMode,
  ParallelConfig,
  IndexingConfig,
  QueryConfig,
  HybridConfig,
  MonitoringConfig,
  PerformanceConfig,
} from "./types";

/**
 * 創建關鍵字搜索引擎
 */
export function createKeywordSearchEngine(
  config?: Partial<KeywordSearchConfig>
): KeywordSearchEngine {
  const fullConfig = mergeWithDefaultConfig(config || {});
  return new KeywordSearchEngine(fullConfig);
}

/**
 * 獲取默認配置
 */
export function getDefaultConfig(): KeywordSearchConfig {
  return {
    parallel: getDefaultParallelConfig(),
    indexing: getDefaultIndexingConfig(),
    query: getDefaultQueryConfig(),
    hybrid: getDefaultHybridConfig(),
    monitoring: getDefaultMonitoringConfig(),
    performance: getDefaultPerformanceConfig(),
  };
}

/**
 * 獲取高性能配置
 */
export function getHighPerformanceConfig(): KeywordSearchConfig {
  const defaultConfig = getDefaultConfig();

  return {
    ...defaultConfig,
    parallel: {
      ...defaultConfig.parallel,
      maxConcurrentTasks: 20,
      workerPoolSize: 8,
      enableLoadBalancing: true,
      taskPriorityStrategy: "priority",
    },
    indexing: {
      ...defaultConfig.indexing,
      defaultStrategy: IndexStrategy.HYBRID,
      enableSharding: true,
      shardCount: 8,
      compressIndex: true,
      cacheSize: 10000,
    },
    query: {
      ...defaultConfig.query,
      enableQueryExpansion: true,
      enableSpellCorrection: true,
      enableSynonymExpansion: true,
      defaultOperator: "AND",
    },
    performance: {
      ...defaultConfig.performance,
      enableCaching: true,
      cacheSize: 50000,
      enablePrecomputation: true,
      precomputeTopQueries: 1000,
    },
  };
}

/**
 * 獲取內存優化配置
 */
export function getMemoryOptimizedConfig(): KeywordSearchConfig {
  const defaultConfig = getDefaultConfig();

  return {
    ...defaultConfig,
    parallel: {
      ...defaultConfig.parallel,
      maxConcurrentTasks: 4,
      workerPoolSize: 2,
      enableLoadBalancing: false,
    },
    indexing: {
      ...defaultConfig.indexing,
      defaultStrategy: IndexStrategy.INVERTED_INDEX,
      enableSharding: false,
      compressIndex: true,
      cacheSize: 1000,
    },
    performance: {
      ...defaultConfig.performance,
      enableCaching: true,
      cacheSize: 5000,
      enablePrecomputation: false,
      defaultPageSize: 20,
      maxPageSize: 50,
    },
  };
}

/**
 * 獲取開發配置
 */
export function getDevelopmentConfig(): KeywordSearchConfig {
  const defaultConfig = getDefaultConfig();

  return {
    ...defaultConfig,
    parallel: {
      ...defaultConfig.parallel,
      maxConcurrentTasks: 2,
      workerPoolSize: 1,
      taskTimeout: 10000,
    },
    monitoring: {
      ...defaultConfig.monitoring,
      enableMetrics: true,
      enablePerformanceTracing: true,
      enableQueryLogging: true,
      sampleRate: 1.0,
    },
    performance: {
      ...defaultConfig.performance,
      enableCaching: false,
      enableResultPagination: false,
    },
  };
}

/**
 * 獲取默認並行配置
 */
function getDefaultParallelConfig(): ParallelConfig {
  return {
    maxConcurrentTasks: 10,
    taskTimeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    workerPoolSize: 4,
    enableLoadBalancing: true,
    taskPriorityStrategy: "fifo",
  };
}

/**
 * 獲取默認索引配置
 */
function getDefaultIndexingConfig(): IndexingConfig {
  return {
    defaultStrategy: IndexStrategy.INVERTED_INDEX,
    buildIncrementally: true,
    compressIndex: false,
    cacheSize: 5000,
    rebuildThreshold: 10000,
    optimizeSchedule: "0 2 * * *", // 每天凌晨2點
    enableSharding: false,
    shardCount: 4,
  };
}

/**
 * 獲取默認查詢配置
 */
function getDefaultQueryConfig(): QueryConfig {
  return {
    defaultStrategy: QueryStrategy.FUZZY_MATCH,
    enableQueryExpansion: false,
    enableSpellCorrection: false,
    enableSynonymExpansion: false,
    maxQueryTerms: 50,
    maxQueryLength: 1000,
    defaultOperator: "OR",
    enableHighlighting: true,
    highlightFragmentSize: 150,
    highlightMaxFragments: 3,
  };
}

/**
 * 獲取默認混合配置
 */
function getDefaultHybridConfig(): HybridConfig {
  return {
    defaultMode: HybridSearchMode.PARALLEL,
    keywordWeight: 0.6,
    vectorWeight: 0.4,
    adaptiveThreshold: 0.7,
    fusionAlgorithm: "linear",
    enableResultInterleaving: true,
    enableContextualReranking: false,
  };
}

/**
 * 獲取默認監控配置
 */
function getDefaultMonitoringConfig(): MonitoringConfig {
  return {
    enableMetrics: true,
    metricsRetentionDays: 30,
    alertThresholds: {
      maxLatency: 10000,
      minSuccessRate: 0.95,
      maxErrorRate: 0.05,
      maxMemoryUsage: 1000000000, // 1GB
      maxCpuUsage: 0.8,
    },
    enablePerformanceTracing: false,
    enableQueryLogging: false,
    sampleRate: 0.1,
  };
}

/**
 * 獲取默認性能配置
 */
function getDefaultPerformanceConfig(): PerformanceConfig {
  return {
    enableCaching: true,
    cacheSize: 10000,
    cacheTtl: 3600000, // 1小時
    enablePrecomputation: false,
    precomputeTopQueries: 100,
    enableResultPagination: true,
    defaultPageSize: 50,
    maxPageSize: 200,
  };
}

/**
 * 合併配置
 */
function mergeWithDefaultConfig(userConfig: Partial<KeywordSearchConfig>): KeywordSearchConfig {
  const defaultConfig = getDefaultConfig();

  return {
    parallel: { ...defaultConfig.parallel, ...userConfig.parallel },
    indexing: { ...defaultConfig.indexing, ...userConfig.indexing },
    query: { ...defaultConfig.query, ...userConfig.query },
    hybrid: { ...defaultConfig.hybrid, ...userConfig.hybrid },
    monitoring: { ...defaultConfig.monitoring, ...userConfig.monitoring },
    performance: { ...defaultConfig.performance, ...userConfig.performance },
  };
}

/**
 * 驗證配置
 */
export function validateConfig(config: KeywordSearchConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 驗證並行配置
  if (config.parallel.maxConcurrentTasks <= 0) {
    errors.push("maxConcurrentTasks must be greater than 0");
  }

  if (config.parallel.workerPoolSize <= 0) {
    errors.push("workerPoolSize must be greater than 0");
  }

  if (config.parallel.taskTimeout <= 0) {
    errors.push("taskTimeout must be greater than 0");
  }

  // 驗證索引配置
  if (config.indexing.cacheSize < 0) {
    errors.push("indexing cacheSize must be non-negative");
  }

  if (config.indexing.enableSharding && config.indexing.shardCount <= 0) {
    errors.push("shardCount must be greater than 0 when sharding is enabled");
  }

  // 驗證查詢配置
  if (config.query.maxQueryTerms <= 0) {
    errors.push("maxQueryTerms must be greater than 0");
  }

  if (config.query.maxQueryLength <= 0) {
    errors.push("maxQueryLength must be greater than 0");
  }

  // 驗證混合配置
  const totalWeight = config.hybrid.keywordWeight + config.hybrid.vectorWeight;
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    errors.push("keywordWeight + vectorWeight should equal 1.0");
  }

  if (config.hybrid.adaptiveThreshold < 0 || config.hybrid.adaptiveThreshold > 1) {
    errors.push("adaptiveThreshold must be between 0 and 1");
  }

  // 驗證監控配置
  if (config.monitoring.metricsRetentionDays <= 0) {
    errors.push("metricsRetentionDays must be greater than 0");
  }

  if (config.monitoring.sampleRate < 0 || config.monitoring.sampleRate > 1) {
    errors.push("sampleRate must be between 0 and 1");
  }

  // 驗證性能配置
  if (config.performance.cacheSize < 0) {
    errors.push("performance cacheSize must be non-negative");
  }

  if (config.performance.cacheTtl <= 0) {
    errors.push("cacheTtl must be greater than 0");
  }

  if (config.performance.defaultPageSize <= 0) {
    errors.push("defaultPageSize must be greater than 0");
  }

  if (config.performance.maxPageSize < config.performance.defaultPageSize) {
    errors.push("maxPageSize must be greater than or equal to defaultPageSize");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 優化配置建議
 */
export function getConfigOptimizationSuggestions(
  config: KeywordSearchConfig,
  context?: {
    expectedDocumentCount?: number;
    expectedQueryVolume?: number;
    memoryConstraints?: number;
    latencyRequirements?: number;
  }
): string[] {
  const suggestions: string[] = [];

  if (!context) {
    return suggestions;
  }

  // 基於文檔數量的建議
  if (context.expectedDocumentCount) {
    if (context.expectedDocumentCount > 100000 && !config.indexing.enableSharding) {
      suggestions.push(
        "Consider enabling sharding for better performance with large document sets"
      );
    }

    if (
      context.expectedDocumentCount > 50000 &&
      config.indexing.defaultStrategy === IndexStrategy.INVERTED_INDEX
    ) {
      suggestions.push("Consider using HYBRID indexing strategy for better performance");
    }
  }

  // 基於查詢量的建議
  if (context.expectedQueryVolume) {
    if (context.expectedQueryVolume > 1000 && config.parallel.maxConcurrentTasks < 10) {
      suggestions.push("Consider increasing maxConcurrentTasks for high query volume");
    }

    if (context.expectedQueryVolume > 5000 && !config.performance.enableCaching) {
      suggestions.push("Consider enabling caching for high query volume");
    }
  }

  // 基於內存限制的建議
  if (context.memoryConstraints) {
    const estimatedMemoryUsage = estimateMemoryUsage(config);
    if (estimatedMemoryUsage > context.memoryConstraints) {
      suggestions.push("Consider reducing cache sizes to meet memory constraints");
      suggestions.push("Consider enabling index compression");
    }
  }

  // 基於延遲需求的建議
  if (context.latencyRequirements) {
    if (context.latencyRequirements < 1000 && !config.performance.enablePrecomputation) {
      suggestions.push("Consider enabling precomputation for low latency requirements");
    }

    if (context.latencyRequirements < 500 && config.parallel.workerPoolSize < 8) {
      suggestions.push("Consider increasing worker pool size for ultra-low latency");
    }
  }

  return suggestions;
}

/**
 * 估算內存使用量
 */
function estimateMemoryUsage(config: KeywordSearchConfig): number {
  let estimatedUsage = 0;

  // 基礎內存
  estimatedUsage += 100 * 1024 * 1024; // 100MB

  // 索引緩存
  estimatedUsage += config.indexing.cacheSize * 1024; // 假設每個緩存項1KB

  // 性能緩存
  estimatedUsage += config.performance.cacheSize * 2048; // 假設每個緩存項2KB

  // 工作池
  estimatedUsage += config.parallel.workerPoolSize * 10 * 1024 * 1024; // 每個工作者10MB

  return estimatedUsage;
}

/**
 * 創建配置預設
 */
export const ConfigPresets = {
  default: getDefaultConfig,
  highPerformance: getHighPerformanceConfig,
  memoryOptimized: getMemoryOptimizedConfig,
  development: getDevelopmentConfig,
} as const;

/**
 * 配置工具
 */
export const ConfigUtils = {
  validate: validateConfig,
  merge: mergeWithDefaultConfig,
  optimize: getConfigOptimizationSuggestions,
  estimateMemory: estimateMemoryUsage,
} as const;
