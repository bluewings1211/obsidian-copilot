/**
 * MapReduce 搜索系統類型定義
 */

import { Document } from "@langchain/core/documents";

// 基礎搜索類型
export interface SearchContext {
  query: string;
  filters?: Record<string, any>;
  salientTerms?: string[];
  timeRange?: {
    startTime: number;
    endTime: number;
  };
  userContext?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface SearchResult {
  document: Document;
  score: number;
  relevanceScore?: number;
  strategy: string;
  metadata: {
    searchTime: number;
    processingTime: number;
    strategyMetadata?: Record<string, any>;
    [key: string]: any;
  };
}

export interface AggregatedSearchResult {
  documents: Document[];
  totalResults: number;
  aggregationMetadata: {
    totalSearchTime: number;
    strategies: string[];
    normalizedScores: boolean;
    deduplicated: boolean;
    reranked: boolean;
    [key: string]: any;
  };
  performanceMetrics: PerformanceMetrics;
}

// 搜索任務類型
export interface SearchTask {
  id: string;
  strategy: string;
  context: SearchContext;
  priority: number;
  timeout?: number;
  retryCount?: number;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface SearchTaskResult {
  taskId: string;
  strategy: string;
  results: SearchResult[];
  executionTime: number;
  success: boolean;
  error?: Error;
  metadata?: Record<string, any>;
}

// 性能監控類型
export interface PerformanceMetrics {
  totalExecutionTime: number;
  mapPhaseTime: number;
  reducePhaseTime: number;
  parallelTasksCount: number;
  successfulTasks: number;
  failedTasks: number;
  averageTaskTime: number;
  throughput: number;
  memoryUsage?: number;
  strategyPerformance: Record<string, StrategyMetrics>;
}

export interface StrategyMetrics {
  executionTime: number;
  resultCount: number;
  averageScore: number;
  successRate: number;
  errorRate: number;
  throughput: number;
}

// 搜索策略接口
export interface SearchStrategy {
  readonly name: string;
  readonly priority: number;
  readonly timeout: number;

  search(context: SearchContext): Promise<SearchResult[]>;
  validateContext(context: SearchContext): boolean;
  estimateExecutionTime(context: SearchContext): number;
  getCapabilities(): StrategyCapabilities;
}

export interface StrategyCapabilities {
  supportsVectorSearch: boolean;
  supportsKeywordSearch: boolean;
  supportsTimeFiltering: boolean;
  supportsMetadataFiltering: boolean;
  supportsHybridMode: boolean;
  maxResultsLimit: number;
  estimatedLatency: number;
}

// 結果聚合類型
export interface AggregationConfig {
  scoringWeights: Record<string, number>;
  maxResults: number;
  deduplicationThreshold: number;
  normalizeScores: boolean;
  enableReranking: boolean;
  rerankingThreshold?: number;
}

export interface DeduplicationResult {
  uniqueResults: SearchResult[];
  duplicatesRemoved: number;
  deduplicationTime: number;
}

export interface ScoreNormalizationResult {
  normalizedResults: SearchResult[];
  normalizationMethod: string;
  originalScoreRange: { min: number; max: number };
  normalizedScoreRange: { min: number; max: number };
}

// 搜索配置類型
export interface SearchMapReduceConfig {
  maxConcurrentTasks: number;
  taskTimeout: number;
  enableLoadBalancing: boolean;
  enableCaching: boolean;
  cacheTimeout: number;
  retryPolicy: RetryPolicy;
  aggregationConfig: AggregationConfig;
  monitoringEnabled: boolean;
  strategies: StrategyConfig[];
}

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  weight: number;
  timeout: number;
  retries: number;
  configuration: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  maxBackoffTime: number;
  retryableErrors: string[];
}

// 負載均衡類型
export interface LoadBalancingStrategy {
  name: string;
  selectStrategy(context: SearchContext, availableStrategies: SearchStrategy[]): SearchStrategy[];
  updateMetrics(strategyName: string, metrics: StrategyMetrics): void;
}

export interface TaskDispatcherConfig {
  maxConcurrentTasks: number;
  taskPriorityWeights: Record<string, number>;
  loadBalancingStrategy: string;
  enableDynamicPriority: boolean;
}

// 事件類型
export interface SearchEvent {
  type: SearchEventType;
  timestamp: number;
  data: Record<string, any>;
}

export enum SearchEventType {
  SEARCH_STARTED = "search_started",
  SEARCH_COMPLETED = "search_completed",
  SEARCH_FAILED = "search_failed",
  TASK_DISPATCHED = "task_dispatched",
  TASK_COMPLETED = "task_completed",
  TASK_FAILED = "task_failed",
  RESULTS_AGGREGATED = "results_aggregated",
  PERFORMANCE_UPDATE = "performance_update",
}

// 缓存類型
export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  cacheSize: number;
  evictionCount: number;
}

// 错误處理類型
export interface SearchError extends Error {
  code: string;
  strategy?: string;
  taskId?: string;
  retryable: boolean;
  timestamp: number;
  context?: SearchContext;
}

export enum SearchErrorCode {
  TIMEOUT = "TIMEOUT",
  INVALID_CONTEXT = "INVALID_CONTEXT",
  STRATEGY_UNAVAILABLE = "STRATEGY_UNAVAILABLE",
  AGGREGATION_FAILED = "AGGREGATION_FAILED",
  CACHE_ERROR = "CACHE_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
}
