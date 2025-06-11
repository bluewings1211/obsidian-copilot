/**
 * 向量搜索系統工廠函數和配置
 */

import { VectorSearchEngine } from "./VectorSearchEngine";
import {
  VectorSearchEngineConfig,
  ParallelConfig,
  DistributedConfig,
  CacheConfig,
  SemanticConfig,
  MonitoringConfig,
  VectorCacheStrategy,
  LoadBalancingStrategy,
  VectorSimilarityMethod,
} from "./types";

/**
 * 創建並行化向量搜索引擎
 */
export function createVectorSearchEngine(
  config?: Partial<VectorSearchEngineConfig>
): VectorSearchEngine {
  const fullConfig = mergeWithDefaults(config);
  return new VectorSearchEngine(fullConfig);
}

/**
 * 獲取默認配置
 */
export function getDefaultVectorSearchConfig(): VectorSearchEngineConfig {
  return {
    parallel: getDefaultParallelConfig(),
    distributed: getDefaultDistributedConfig(),
    cache: getDefaultCacheConfig(),
    semantic: getDefaultSemanticConfig(),
    monitoring: getDefaultMonitoringConfig(),
  };
}

/**
 * 獲取高性能配置
 */
export function getHighPerformanceConfig(): VectorSearchEngineConfig {
  return {
    parallel: {
      maxConcurrentCalculations: 20,
      chunkSize: 500,
      workerPoolSize: 8,
      preferredSimilarityMethod: VectorSimilarityMethod.COSINE,
      enableAdaptiveChunking: true,
    },
    distributed: {
      maxShardsPerQuery: 8,
      shardSelectionStrategy: "adaptive",
      loadBalancing: {
        strategy: LoadBalancingStrategy.ADAPTIVE,
        maxShardsPerQuery: 8,
        loadThreshold: 0.8,
        failoverEnabled: true,
        healthCheckInterval: 30000,
      },
      replicationFactor: 2,
      healthCheckInterval: 30000,
    },
    cache: {
      enableQueryCache: true,
      enableEmbeddingCache: true,
      maxCacheSize: 10000,
      defaultTTL: 3600000, // 1 hour
      cacheStrategy: VectorCacheStrategy.ADAPTIVE,
      compressionEnabled: true,
    },
    semantic: {
      enhancement: {
        enableContextualBoost: true,
        enableSemanticExpansion: true,
        enableMultiLevelSearch: true,
        contextualWeights: {
          domain: 0.3,
          history: 0.25,
          preference: 0.25,
          temporal: 0.2,
        },
        semanticThreshold: 0.75,
        expansionTermCount: 5,
      },
      contextualWeighting: true,
      multiLevelSearch: true,
    },
    monitoring: {
      enableRealTimeMetrics: true,
      metricsCollectionInterval: 30000,
      enableAnalytics: true,
      alertThresholds: {
        averageLatency: 2000,
        errorRate: 0.05,
        throughput: 5,
        memoryUsage: 2000,
      },
    },
  };
}

/**
 * 獲取內存優化配置
 */
export function getMemoryOptimizedConfig(): VectorSearchEngineConfig {
  return {
    parallel: {
      maxConcurrentCalculations: 4,
      chunkSize: 100,
      workerPoolSize: 2,
      preferredSimilarityMethod: VectorSimilarityMethod.COSINE,
      enableAdaptiveChunking: false,
    },
    distributed: {
      maxShardsPerQuery: 2,
      shardSelectionStrategy: "least_loaded",
      loadBalancing: {
        strategy: LoadBalancingStrategy.LEAST_LOADED,
        maxShardsPerQuery: 2,
        loadThreshold: 0.7,
        failoverEnabled: false,
        healthCheckInterval: 60000,
      },
      replicationFactor: 1,
      healthCheckInterval: 60000,
    },
    cache: {
      enableQueryCache: true,
      enableEmbeddingCache: true,
      maxCacheSize: 1000,
      defaultTTL: 1800000, // 30 minutes
      cacheStrategy: VectorCacheStrategy.LRU,
      compressionEnabled: true,
    },
    semantic: {
      enhancement: {
        enableContextualBoost: false,
        enableSemanticExpansion: false,
        enableMultiLevelSearch: false,
        contextualWeights: {
          domain: 0.5,
          history: 0.3,
          preference: 0.2,
          temporal: 0,
        },
        semanticThreshold: 0.6,
        expansionTermCount: 2,
      },
      contextualWeighting: false,
      multiLevelSearch: false,
    },
    monitoring: {
      enableRealTimeMetrics: false,
      metricsCollectionInterval: 300000, // 5 minutes
      enableAnalytics: false,
      alertThresholds: {
        averageLatency: 5000,
        errorRate: 0.1,
        throughput: 1,
        memoryUsage: 500,
      },
    },
  };
}

/**
 * 獲取開發環境配置
 */
export function getDevelopmentConfig(): VectorSearchEngineConfig {
  return {
    parallel: {
      maxConcurrentCalculations: 2,
      chunkSize: 50,
      workerPoolSize: 1,
      preferredSimilarityMethod: VectorSimilarityMethod.COSINE,
      enableAdaptiveChunking: false,
    },
    distributed: {
      maxShardsPerQuery: 1,
      shardSelectionStrategy: "round_robin",
      loadBalancing: {
        strategy: LoadBalancingStrategy.ROUND_ROBIN,
        maxShardsPerQuery: 1,
        loadThreshold: 0.9,
        failoverEnabled: false,
        healthCheckInterval: 120000,
      },
      replicationFactor: 1,
      healthCheckInterval: 120000,
    },
    cache: {
      enableQueryCache: false,
      enableEmbeddingCache: true,
      maxCacheSize: 100,
      defaultTTL: 600000, // 10 minutes
      cacheStrategy: VectorCacheStrategy.LRU,
      compressionEnabled: false,
    },
    semantic: {
      enhancement: {
        enableContextualBoost: true,
        enableSemanticExpansion: false,
        enableMultiLevelSearch: false,
        contextualWeights: {
          domain: 0.4,
          history: 0.3,
          preference: 0.3,
          temporal: 0,
        },
        semanticThreshold: 0.5,
        expansionTermCount: 3,
      },
      contextualWeighting: true,
      multiLevelSearch: false,
    },
    monitoring: {
      enableRealTimeMetrics: true,
      metricsCollectionInterval: 60000,
      enableAnalytics: true,
      alertThresholds: {
        averageLatency: 10000,
        errorRate: 0.2,
        throughput: 0.5,
        memoryUsage: 1000,
      },
    },
  };
}

/**
 * 默認配置獲取函數
 */
function getDefaultParallelConfig(): ParallelConfig {
  return {
    maxConcurrentCalculations: 10,
    chunkSize: 200,
    workerPoolSize: 4,
    preferredSimilarityMethod: VectorSimilarityMethod.COSINE,
    enableAdaptiveChunking: true,
  };
}

function getDefaultDistributedConfig(): DistributedConfig {
  return {
    maxShardsPerQuery: 4,
    shardSelectionStrategy: "least_loaded",
    loadBalancing: {
      strategy: LoadBalancingStrategy.LEAST_LOADED,
      maxShardsPerQuery: 4,
      loadThreshold: 0.8,
      failoverEnabled: true,
      healthCheckInterval: 60000,
    },
    replicationFactor: 1,
    healthCheckInterval: 60000,
  };
}

function getDefaultCacheConfig(): CacheConfig {
  return {
    enableQueryCache: true,
    enableEmbeddingCache: true,
    maxCacheSize: 5000,
    defaultTTL: 3600000, // 1 hour
    cacheStrategy: VectorCacheStrategy.LRU,
    compressionEnabled: false,
  };
}

function getDefaultSemanticConfig(): SemanticConfig {
  return {
    enhancement: {
      enableContextualBoost: true,
      enableSemanticExpansion: true,
      enableMultiLevelSearch: false,
      contextualWeights: {
        domain: 0.3,
        history: 0.3,
        preference: 0.2,
        temporal: 0.2,
      },
      semanticThreshold: 0.7,
      expansionTermCount: 3,
    },
    contextualWeighting: true,
    multiLevelSearch: false,
  };
}

function getDefaultMonitoringConfig(): MonitoringConfig {
  return {
    enableRealTimeMetrics: true,
    metricsCollectionInterval: 60000, // 1 minute
    enableAnalytics: true,
    alertThresholds: {
      averageLatency: 3000,
      errorRate: 0.1,
      throughput: 1,
      memoryUsage: 1000,
    },
  };
}

/**
 * 合併用戶配置和默認配置
 */
function mergeWithDefaults(
  userConfig?: Partial<VectorSearchEngineConfig>
): VectorSearchEngineConfig {
  const defaultConfig = getDefaultVectorSearchConfig();

  if (!userConfig) {
    return defaultConfig;
  }

  return {
    parallel: { ...defaultConfig.parallel, ...userConfig.parallel },
    distributed: {
      ...defaultConfig.distributed,
      ...userConfig.distributed,
      loadBalancing: {
        ...defaultConfig.distributed.loadBalancing,
        ...userConfig.distributed?.loadBalancing,
      },
    },
    cache: { ...defaultConfig.cache, ...userConfig.cache },
    semantic: {
      ...defaultConfig.semantic,
      ...userConfig.semantic,
      enhancement: {
        ...defaultConfig.semantic.enhancement,
        ...userConfig.semantic?.enhancement,
        contextualWeights: {
          ...defaultConfig.semantic.enhancement.contextualWeights,
          ...userConfig.semantic?.enhancement?.contextualWeights,
        },
      },
    },
    monitoring: {
      ...defaultConfig.monitoring,
      ...userConfig.monitoring,
      alertThresholds: {
        ...defaultConfig.monitoring.alertThresholds,
        ...userConfig.monitoring?.alertThresholds,
      },
    },
  };
}

/**
 * 配置驗證函數
 */
export function validateVectorSearchConfig(config: VectorSearchEngineConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 驗證並行配置
  if (config.parallel.maxConcurrentCalculations <= 0) {
    errors.push("maxConcurrentCalculations must be greater than 0");
  }
  if (config.parallel.chunkSize <= 0) {
    errors.push("chunkSize must be greater than 0");
  }
  if (config.parallel.workerPoolSize <= 0) {
    errors.push("workerPoolSize must be greater than 0");
  }

  // 驗證分散式配置
  if (config.distributed.maxShardsPerQuery <= 0) {
    errors.push("maxShardsPerQuery must be greater than 0");
  }
  if (config.distributed.replicationFactor < 1) {
    errors.push("replicationFactor must be at least 1");
  }

  // 驗證緩存配置
  if (config.cache.maxCacheSize <= 0) {
    errors.push("maxCacheSize must be greater than 0");
  }
  if (config.cache.defaultTTL <= 0) {
    errors.push("defaultTTL must be greater than 0");
  }

  // 性能警告
  if (config.parallel.maxConcurrentCalculations > 50) {
    warnings.push("Very high maxConcurrentCalculations may impact performance");
  }
  if (config.cache.maxCacheSize > 50000) {
    warnings.push("Large cache size may consume significant memory");
  }
  if (config.monitoring.metricsCollectionInterval < 10000) {
    warnings.push("Very frequent metrics collection may impact performance");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 配置優化建議函數
 */
export function getConfigOptimizationSuggestions(
  config: VectorSearchEngineConfig,
  context: {
    expectedLoad: "low" | "medium" | "high";
    memoryConstraints: "tight" | "moderate" | "abundant";
    latencyRequirements: "relaxed" | "moderate" | "strict";
  }
): string[] {
  const suggestions: string[] = [];

  // 基於預期負載的建議
  if (context.expectedLoad === "high" && config.parallel.maxConcurrentCalculations < 20) {
    suggestions.push("Consider increasing maxConcurrentCalculations for high load scenarios");
  }
  if (context.expectedLoad === "low" && config.parallel.maxConcurrentCalculations > 5) {
    suggestions.push(
      "Consider reducing maxConcurrentCalculations to save resources in low load scenarios"
    );
  }

  // 基於內存約束的建議
  if (context.memoryConstraints === "tight") {
    if (config.cache.maxCacheSize > 1000) {
      suggestions.push("Consider reducing cache size due to memory constraints");
    }
    if (config.semantic.enhancement.enableMultiLevelSearch) {
      suggestions.push("Consider disabling multi-level search to reduce memory usage");
    }
  }

  // 基於延遲要求的建議
  if (context.latencyRequirements === "strict") {
    if (!config.cache.enableQueryCache) {
      suggestions.push("Enable query caching for better latency");
    }
    if (config.parallel.maxConcurrentCalculations < 10) {
      suggestions.push("Increase parallel calculations for better latency");
    }
  }

  return suggestions;
}
