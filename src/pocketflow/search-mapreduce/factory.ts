/**
 * MapReduce 搜索引擎工廠函數和配置
 */

import { SearchMapReduceEngine } from "./core/SearchMapReduceEngine";
import { AggregationConfig, RetryPolicy, SearchMapReduceConfig, StrategyConfig } from "./types";

/**
 * 創建 MapReduce 搜索引擎實例
 */
export function createSearchMapReduceEngine(
  config?: Partial<SearchMapReduceConfig>
): SearchMapReduceEngine {
  const finalConfig = {
    ...getDefaultConfig(),
    ...config,
  };

  return new SearchMapReduceEngine(finalConfig);
}

/**
 * 獲取默認配置
 */
export function getDefaultConfig(): SearchMapReduceConfig {
  return {
    maxConcurrentTasks: 10,
    taskTimeout: 30000, // 30 seconds
    enableLoadBalancing: true,
    enableCaching: true,
    cacheTimeout: 300000, // 5 minutes
    retryPolicy: getDefaultRetryPolicy(),
    aggregationConfig: getDefaultAggregationConfig(),
    monitoringEnabled: true,
    strategies: getDefaultStrategies(),
  };
}

/**
 * 獲取默認重試策略
 */
export function getDefaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 3,
    backoffMultiplier: 2,
    maxBackoffTime: 60000, // 1 minute
    retryableErrors: ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMIT_EXCEEDED"],
  };
}

/**
 * 獲取默認聚合配置
 */
export function getDefaultAggregationConfig(): AggregationConfig {
  return {
    scoringWeights: {
      hybrid: 1.0,
      vector: 0.8,
      keyword: 0.6,
      rerank: 0.4,
    },
    maxResults: 50,
    deduplicationThreshold: 0.85,
    normalizeScores: true,
    enableReranking: true,
    rerankingThreshold: 0.5,
  };
}

/**
 * 獲取默認搜索策略配置
 */
export function getDefaultStrategies(): StrategyConfig[] {
  return [
    {
      name: "hybrid",
      enabled: true,
      weight: 90,
      timeout: 15000,
      retries: 2,
      configuration: {
        textWeight: 0.5,
        vectorWeight: 0.5,
        enhanceQuery: false,
      },
    },
    {
      name: "vector",
      enabled: true,
      weight: 80,
      timeout: 10000,
      retries: 3,
      configuration: {
        enhanceQuery: true,
        minSimilarityScore: 0.1,
      },
    },
    {
      name: "keyword",
      enabled: true,
      weight: 70,
      timeout: 5000,
      retries: 2,
      configuration: {
        useStopWords: true,
        maxKeywords: 10,
      },
    },
  ];
}

/**
 * 創建開發環境配置
 */
export function getDevConfig(): SearchMapReduceConfig {
  return {
    ...getDefaultConfig(),
    maxConcurrentTasks: 5,
    taskTimeout: 10000,
    monitoringEnabled: true,
    enableCaching: false, // 開發時禁用緩存
    aggregationConfig: {
      ...getDefaultAggregationConfig(),
      maxResults: 20,
      enableReranking: false, // 開發時禁用重排序以加快速度
    },
  };
}

/**
 * 創建生產環境配置
 */
export function getProdConfig(): SearchMapReduceConfig {
  return {
    ...getDefaultConfig(),
    maxConcurrentTasks: 20,
    taskTimeout: 60000,
    enableLoadBalancing: true,
    enableCaching: true,
    cacheTimeout: 600000, // 10 minutes
    monitoringEnabled: true,
    retryPolicy: {
      ...getDefaultRetryPolicy(),
      maxRetries: 5,
      maxBackoffTime: 120000, // 2 minutes
    },
    aggregationConfig: {
      ...getDefaultAggregationConfig(),
      maxResults: 100,
      enableReranking: true,
    },
  };
}

/**
 * 創建高性能配置
 */
export function getHighPerformanceConfig(): SearchMapReduceConfig {
  return {
    ...getDefaultConfig(),
    maxConcurrentTasks: 50,
    taskTimeout: 45000,
    enableLoadBalancing: true,
    enableCaching: true,
    cacheTimeout: 900000, // 15 minutes
    aggregationConfig: {
      ...getDefaultAggregationConfig(),
      maxResults: 200,
      normalizeScores: false, // 禁用標準化以提高速度
      enableReranking: false, // 禁用重排序以提高速度
    },
    strategies: [
      // 只啟用最快的策略
      {
        name: "keyword",
        enabled: true,
        weight: 100,
        timeout: 3000,
        retries: 1,
        configuration: {
          useStopWords: false,
          maxKeywords: 5,
        },
      },
      {
        name: "vector",
        enabled: true,
        weight: 80,
        timeout: 8000,
        retries: 1,
        configuration: {
          enhanceQuery: false,
          minSimilarityScore: 0.2,
        },
      },
    ],
  };
}

/**
 * 創建測試配置
 */
export function getTestConfig(): SearchMapReduceConfig {
  return {
    ...getDefaultConfig(),
    maxConcurrentTasks: 2,
    taskTimeout: 5000,
    enableLoadBalancing: false,
    enableCaching: false,
    monitoringEnabled: false,
    retryPolicy: {
      ...getDefaultRetryPolicy(),
      maxRetries: 1,
      backoffMultiplier: 1,
      maxBackoffTime: 1000,
    },
    aggregationConfig: {
      ...getDefaultAggregationConfig(),
      maxResults: 10,
      normalizeScores: false,
      enableReranking: false,
    },
    strategies: [
      {
        name: "keyword",
        enabled: true,
        weight: 100,
        timeout: 2000,
        retries: 0,
        configuration: {},
      },
    ],
  };
}

/**
 * 配置驗證器
 */
export function validateConfig(config: SearchMapReduceConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 驗證基本參數
  if (config.maxConcurrentTasks <= 0) {
    errors.push("maxConcurrentTasks must be greater than 0");
  }

  if (config.taskTimeout <= 0) {
    errors.push("taskTimeout must be greater than 0");
  }

  if (config.cacheTimeout <= 0) {
    errors.push("cacheTimeout must be greater than 0");
  }

  // 驗證重試策略
  if (config.retryPolicy.maxRetries < 0) {
    errors.push("maxRetries must be >= 0");
  }

  if (config.retryPolicy.backoffMultiplier <= 0) {
    errors.push("backoffMultiplier must be > 0");
  }

  if (config.retryPolicy.maxBackoffTime <= 0) {
    errors.push("maxBackoffTime must be > 0");
  }

  // 驗證聚合配置
  if (config.aggregationConfig.maxResults <= 0) {
    errors.push("maxResults must be greater than 0");
  }

  if (
    config.aggregationConfig.deduplicationThreshold < 0 ||
    config.aggregationConfig.deduplicationThreshold > 1
  ) {
    errors.push("deduplicationThreshold must be between 0 and 1");
  }

  // 驗證策略配置
  if (config.strategies.length === 0) {
    errors.push("At least one strategy must be configured");
  }

  const enabledStrategies = config.strategies.filter((s) => s.enabled);
  if (enabledStrategies.length === 0) {
    errors.push("At least one strategy must be enabled");
  }

  config.strategies.forEach((strategy, index) => {
    if (!strategy.name) {
      errors.push(`Strategy at index ${index} must have a name`);
    }

    if (strategy.weight < 0 || strategy.weight > 100) {
      errors.push(`Strategy "${strategy.name}" weight must be between 0 and 100`);
    }

    if (strategy.timeout <= 0) {
      errors.push(`Strategy "${strategy.name}" timeout must be greater than 0`);
    }

    if (strategy.retries < 0) {
      errors.push(`Strategy "${strategy.name}" retries must be >= 0`);
    }
  });

  // 性能警告
  if (config.maxConcurrentTasks > 100) {
    warnings.push("Very high concurrency may impact performance");
  }

  if (config.taskTimeout > 120000) {
    warnings.push("Very high timeout may impact user experience");
  }

  if (config.aggregationConfig.maxResults > 500) {
    warnings.push("Very high maxResults may impact performance");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 合併配置
 */
export function mergeConfigs(
  baseConfig: SearchMapReduceConfig,
  overrideConfig: Partial<SearchMapReduceConfig>
): SearchMapReduceConfig {
  return {
    ...baseConfig,
    ...overrideConfig,
    retryPolicy: {
      ...baseConfig.retryPolicy,
      ...overrideConfig.retryPolicy,
    },
    aggregationConfig: {
      ...baseConfig.aggregationConfig,
      ...overrideConfig.aggregationConfig,
      scoringWeights: {
        ...baseConfig.aggregationConfig.scoringWeights,
        ...overrideConfig.aggregationConfig?.scoringWeights,
      },
    },
    strategies: overrideConfig.strategies || baseConfig.strategies,
  };
}

/**
 * 創建自定義策略配置
 */
export function createStrategyConfig(
  name: string,
  options: Partial<StrategyConfig>
): StrategyConfig {
  return {
    name,
    enabled: true,
    weight: 50,
    timeout: 10000,
    retries: 2,
    configuration: {},
    ...options,
  };
}
