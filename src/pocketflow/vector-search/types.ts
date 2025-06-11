/**
 * 並行化向量搜索系統類型定義
 */

import { Document } from "@langchain/core/documents";

// 向量搜索核心類型
export interface VectorSearchRequest {
  query: string | number[];
  filters?: VectorSearchFilters;
  options?: VectorSearchOptions;
  context?: VectorSearchContext;
}

export interface VectorSearchFilters {
  minSimilarityScore?: number;
  maxResults?: number;
  timeRange?: {
    startTime: number;
    endTime: number;
  };
  metadata?: Record<string, any>;
  shardIds?: string[];
  excludeDocuments?: string[];
}

export interface VectorSearchOptions {
  enableParallel?: boolean;
  enableCaching?: boolean;
  enableSemanticEnhancement?: boolean;
  enableDistributed?: boolean;
  preferredShards?: string[];
  timeout?: number;
}

export interface VectorSearchContext {
  userId?: string;
  sessionId?: string;
  domain?: string;
  intent?: string;
  previousQueries?: string[];
  userPreferences?: Record<string, any>;
  queryPatterns?: string[];
  semanticContext?: Record<string, any>;
}

export interface VectorSearchResult {
  document: Document;
  score: number;
  normalizedScore?: number;
  semanticScore?: number;
  shardId?: string;
  metadata: VectorResultMetadata;
}

export interface VectorResultMetadata {
  searchTime: number;
  processingTime: number;
  calculationMethod: "parallel" | "distributed" | "cached" | "direct";
  embeddingModel?: string;
  shardMetadata?: Record<string, any>;
  cacheHit?: boolean;
  semanticEnhancement?: SemanticEnhancementMetadata;
}

export interface SemanticEnhancementMetadata {
  originalScore: number;
  enhancedScore: number;
  contextualFactors: string[];
  semanticSimilarity: number;
}

// 並行處理類型
export interface VectorCalculationTask {
  id: string;
  queryVector: number[];
  documentVectors: VectorDocument[];
  method: VectorSimilarityMethod;
  priority: number;
  shardId?: string;
}

export interface VectorCalculationResult {
  taskId: string;
  similarities: VectorSimilarity[];
  executionTime: number;
  method: VectorSimilarityMethod;
  shardId?: string;
}

export interface VectorSimilarity {
  documentId: string;
  similarity: number;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface VectorDocument {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
  content?: string;
  shardId?: string;
}

export enum VectorSimilarityMethod {
  COSINE = "cosine",
  EUCLIDEAN = "euclidean",
  DOT_PRODUCT = "dot_product",
  MANHATTAN = "manhattan",
}

// 分散式向量搜索類型
export interface VectorShard {
  id: string;
  name: string;
  documentCount: number;
  vectorDimension: number;
  createdAt: number;
  lastUpdated: number;
  metadata: Record<string, any>;
  isActive: boolean;
  loadFactor: number;
}

export interface VectorShardQuery {
  shardId: string;
  queryVector: number[];
  filters: VectorSearchFilters;
  maxResults: number;
}

export interface VectorShardResult {
  shardId: string;
  results: VectorSearchResult[];
  executionTime: number;
  documentsCovered: number;
  loadFactor: number;
}

export interface VectorLoadBalancingConfig {
  strategy: LoadBalancingStrategy;
  maxShardsPerQuery: number;
  loadThreshold: number;
  failoverEnabled: boolean;
  healthCheckInterval: number;
}

export enum LoadBalancingStrategy {
  ROUND_ROBIN = "round_robin",
  LEAST_LOADED = "least_loaded",
  RANDOM = "random",
  WEIGHTED = "weighted",
  ADAPTIVE = "adaptive",
}

// 向量緩存類型
export interface VectorCacheEntry {
  queryHash: string;
  queryVector: number[];
  results: VectorSearchResult[];
  timestamp: number;
  accessCount: number;
  ttl: number;
  metadata: VectorCacheMetadata;
}

export interface VectorCacheMetadata {
  originalQuery: string;
  searchParams: VectorSearchRequest;
  resultCount: number;
  cacheStrategy: VectorCacheStrategy;
  compressionRatio?: number;
}

export interface EmbeddingCacheEntry {
  textHash: string;
  text: string;
  embedding: number[];
  embeddingModel: string;
  timestamp: number;
  accessCount: number;
  ttl: number;
}

export enum VectorCacheStrategy {
  LRU = "lru",
  LFU = "lfu",
  TTL = "ttl",
  ADAPTIVE = "adaptive",
  SEMANTIC_CLUSTERING = "semantic_clustering",
}

// 語義搜索增強類型
export interface SemanticEnhancementConfig {
  enableContextualBoost: boolean;
  enableSemanticExpansion: boolean;
  enableMultiLevelSearch: boolean;
  contextualWeights: Record<string, number>;
  semanticThreshold: number;
  expansionTermCount: number;
}

export interface ContextualBoostParams {
  userDomain?: string;
  recentQueries?: string[];
  userPreferences?: Record<string, any>;
  sessionContext?: Record<string, any>;
  temporalFactors?: Record<string, number>;
}

export interface SemanticExpansionResult {
  originalQuery: string;
  expandedTerms: string[];
  semanticClusters: SemanticCluster[];
  expansionScore: number;
}

export interface SemanticCluster {
  centroid: number[];
  terms: string[];
  weight: number;
  coherenceScore: number;
}

export interface MultiLevelSearchResult {
  primaryResults: VectorSearchResult[];
  secondaryResults: VectorSearchResult[];
  tertiaryResults: VectorSearchResult[];
  levelWeights: number[];
  aggregatedScore: number;
}

// 性能監控類型
export interface VectorPerformanceMetrics {
  totalSearches: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  cacheHitRate: number;
  parallelEfficiency: number;
  shardUtilization: Record<string, number>;
  errorRate: number;
  memoryUsage: number;
}

export interface VectorSearchAnalytics {
  queryPatterns: QueryPattern[];
  resultQuality: ResultQualityMetrics;
  userBehavior: UserBehaviorMetrics;
  systemPerformance: VectorPerformanceMetrics;
  optimizationRecommendations: OptimizationRecommendation[];
}

export interface QueryPattern {
  pattern: string;
  frequency: number;
  averageResultCount: number;
  averageRelevanceScore: number;
  commonFilters: Record<string, any>;
}

export interface ResultQualityMetrics {
  averageRelevanceScore: number;
  resultConsistency: number;
  semanticCoherence: number;
  userSatisfactionScore: number;
  clickThroughRate: number;
}

export interface UserBehaviorMetrics {
  averageQueryLength: number;
  queryRefinementRate: number;
  sessionDuration: number;
  resultsExplorationDepth: number;
  preferredResultTypes: Record<string, number>;
}

export interface OptimizationRecommendation {
  type: OptimizationType;
  description: string;
  expectedImprovement: number;
  implementationCost: number;
  priority: number;
}

export enum OptimizationType {
  CACHE_OPTIMIZATION = "cache_optimization",
  SHARD_REBALANCING = "shard_rebalancing",
  QUERY_OPTIMIZATION = "query_optimization",
  MODEL_TUNING = "model_tuning",
  RESOURCE_SCALING = "resource_scaling",
}

// 錯誤處理類型
export enum VectorErrorCode {
  DIMENSION_MISMATCH = "DIMENSION_MISMATCH",
  SHARD_UNAVAILABLE = "SHARD_UNAVAILABLE",
  EMBEDDING_GENERATION_FAILED = "EMBEDDING_GENERATION_FAILED",
  CACHE_ERROR = "CACHE_ERROR",
  PARALLEL_EXECUTION_FAILED = "PARALLEL_EXECUTION_FAILED",
  SEMANTIC_ENHANCEMENT_FAILED = "SEMANTIC_ENHANCEMENT_FAILED",
  LOAD_BALANCING_FAILED = "LOAD_BALANCING_FAILED",
  SIMILARITY_CALCULATION_FAILED = "SIMILARITY_CALCULATION_FAILED",
}

// 配置類型
export interface VectorSearchEngineConfig {
  parallel: ParallelConfig;
  distributed: DistributedConfig;
  cache: CacheConfig;
  semantic: SemanticConfig;
  monitoring: MonitoringConfig;
}

export interface ParallelConfig {
  maxConcurrentCalculations: number;
  chunkSize: number;
  workerPoolSize: number;
  preferredSimilarityMethod: VectorSimilarityMethod;
  enableAdaptiveChunking: boolean;
}

export interface DistributedConfig {
  maxShardsPerQuery: number;
  shardSelectionStrategy: string;
  loadBalancing: VectorLoadBalancingConfig;
  replicationFactor: number;
  healthCheckInterval: number;
}

export interface CacheConfig {
  enableQueryCache: boolean;
  enableEmbeddingCache: boolean;
  maxCacheSize: number;
  defaultTTL: number;
  cacheStrategy: VectorCacheStrategy;
  compressionEnabled: boolean;
}

export interface SemanticConfig {
  enhancement: SemanticEnhancementConfig;
  expansionModel?: string;
  contextualWeighting: boolean;
  multiLevelSearch: boolean;
}

export interface MonitoringConfig {
  enableRealTimeMetrics: boolean;
  metricsCollectionInterval: number;
  enableAnalytics: boolean;
  alertThresholds: Record<string, number>;
}
