/**
 * 關鍵字搜索系統類型定義
 */

export interface KeywordSearchRequest {
  query: string;
  options?: KeywordSearchOptions;
  context?: KeywordSearchContext;
}

export interface KeywordSearchOptions {
  maxResults?: number;
  enableParallel?: boolean;
  enableCaching?: boolean;
  enableQueryExpansion?: boolean;
  enableSemanticAnalysis?: boolean;
  timeout?: number;
  minSimilarityScore?: number;
  queryStrategy?: QueryStrategy;
  indexStrategy?: IndexStrategy;
  hybridMode?: HybridSearchMode;
}

export interface KeywordSearchContext {
  userId?: string;
  sessionId?: string;
  domain?: string;
  documentTypes?: string[];
  previousQueries?: string[];
  userPreferences?: UserPreferences;
  timeRange?: TimeRange;
  filters?: Record<string, any>;
}

export interface UserPreferences {
  documentTypes?: Record<string, number>;
  topics?: Record<string, number>;
  languages?: string[];
}

export interface TimeRange {
  startTime: number;
  endTime: number;
}

export interface KeywordSearchResult {
  documents: KeywordDocument[];
  totalFound: number;
  searchTime: number;
  strategy: string;
  metadata: KeywordSearchMetadata;
}

export interface KeywordDocument {
  id: string;
  content: string;
  title: string;
  path: string;
  score: number;
  highlights: TextHighlight[];
  metadata: DocumentMetadata;
}

export interface TextHighlight {
  field: string;
  start: number;
  end: number;
  text: string;
  score: number;
}

export interface DocumentMetadata {
  size: number;
  mtime: number;
  ctime: number;
  extension: string;
  tags: string[];
  language?: string;
  wordCount?: number;
  [key: string]: any;
}

export interface KeywordSearchMetadata {
  totalProcessingTime: number;
  queryParsingTime: number;
  indexSearchTime: number;
  resultAggregationTime: number;
  cacheHit: boolean;
  parallelTasksUsed: number;
  indexesSearched: string[];
  queryExpansion?: QueryExpansionInfo;
  qualityMetrics: SearchQualityMetrics;
}

export interface QueryExpansionInfo {
  originalTerms: string[];
  expandedTerms: string[];
  synonyms: Record<string, string[]>;
  relatedConcepts: string[];
}

export interface SearchQualityMetrics {
  precision: number;
  recall: number;
  relevanceScore: number;
  diversityScore: number;
  coverageScore: number;
}

// 查詢策略枚舉
export enum QueryStrategy {
  EXACT_MATCH = "exact_match",
  FUZZY_MATCH = "fuzzy_match",
  BOOLEAN_LOGIC = "boolean_logic",
  PHRASE_SEARCH = "phrase_search",
  WILDCARD = "wildcard",
  REGEXP = "regexp",
  SEMANTIC_EXPANSION = "semantic_expansion",
}

// 索引策略枚舉
export enum IndexStrategy {
  INVERTED_INDEX = "inverted_index",
  SUFFIX_ARRAY = "suffix_array",
  TRIE_BASED = "trie_based",
  HASH_BASED = "hash_based",
  HYBRID = "hybrid",
}

// 混合搜索模式
export enum HybridSearchMode {
  KEYWORD_FIRST = "keyword_first",
  VECTOR_FIRST = "vector_first",
  PARALLEL = "parallel",
  ADAPTIVE = "adaptive",
}

// 查詢解析結果
export interface ParsedQuery {
  terms: QueryTerm[];
  operators: QueryOperator[];
  phrases: QueryPhrase[];
  filters: QueryFilter[];
  boosters: QueryBooster[];
  structure: QueryStructure;
}

export interface QueryTerm {
  text: string;
  field?: string;
  boost?: number;
  fuzzy?: boolean;
  proximity?: number;
  required?: boolean;
  excluded?: boolean;
}

export interface QueryOperator {
  type: "AND" | "OR" | "NOT" | "NEAR" | "BEFORE" | "AFTER";
  left: string;
  right: string;
  distance?: number;
}

export interface QueryPhrase {
  text: string;
  field?: string;
  slop?: number;
  boost?: number;
}

export interface QueryFilter {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "between" | "exists";
  value: any;
}

export interface QueryBooster {
  field: string;
  boost: number;
  function?: "linear" | "log" | "exp" | "custom";
  params?: Record<string, any>;
}

export interface QueryStructure {
  type: "simple" | "boolean" | "phrase" | "complex";
  depth: number;
  complexity: number;
  hasWildcards: boolean;
  hasRegexp: boolean;
  hasFuzzy: boolean;
}

// 文本索引相關類型
export interface TextIndex {
  id: string;
  name: string;
  type: IndexStrategy;
  fields: IndexField[];
  documents: Map<string, IndexedDocument>;
  statistics: IndexStatistics;
  settings: IndexSettings;
}

export interface IndexField {
  name: string;
  type: "text" | "keyword" | "number" | "date" | "boolean";
  analyzer?: string;
  searchable: boolean;
  stored: boolean;
  boost?: number;
}

export interface IndexedDocument {
  id: string;
  fields: Map<string, IndexedField>;
  metadata: DocumentMetadata;
  lastModified: number;
}

export interface IndexedField {
  name: string;
  value: any;
  tokens?: Token[];
  positions?: number[];
  boost?: number;
}

export interface Token {
  text: string;
  position: number;
  offset: { start: number; end: number };
  boost?: number;
  metadata?: Record<string, any>;
}

export interface IndexStatistics {
  documentCount: number;
  termCount: number;
  averageDocumentLength: number;
  fieldStatistics: Map<string, FieldStatistics>;
  lastUpdated: number;
  buildTime: number;
  memoryUsage: number;
}

export interface FieldStatistics {
  documentCount: number;
  termCount: number;
  averageLength: number;
  maxLength: number;
  minLength: number;
  commonTerms: Array<{ term: string; frequency: number }>;
}

export interface IndexSettings {
  analyzer: string;
  tokenizer: string;
  filters: string[];
  maxTermLength: number;
  minTermLength: number;
  stopWords: string[];
  stemming: boolean;
  caseSensitive: boolean;
  compressTerms: boolean;
  cacheSize: number;
}

// 並行處理相關類型
export interface ParallelSearchTask {
  id: string;
  query: ParsedQuery;
  index: string;
  priority: number;
  timeout: number;
  retries: number;
  startTime: number;
  status: TaskStatus;
}

export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  TIMEOUT = "timeout",
  CANCELLED = "cancelled",
}

export interface ParallelSearchResult {
  taskId: string;
  results: KeywordDocument[];
  metadata: {
    searchTime: number;
    indexName: string;
    documentsScanned: number;
    termsMatched: number;
  };
}

// 監控相關類型
export interface KeywordSearchMetrics {
  searchRequests: number;
  successfulSearches: number;
  failedSearches: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  cacheHitRate: number;
  indexUtilization: Map<string, number>;
  queryComplexityDistribution: Map<string, number>;
  topQueries: Array<{ query: string; count: number; avgLatency: number }>;
  errorDistribution: Map<string, number>;
  parallelTaskMetrics: ParallelTaskMetrics;
}

export interface ParallelTaskMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskTime: number;
  maxConcurrentTasks: number;
  taskQueueLength: number;
  workerUtilization: number;
}

// 配置相關類型
export interface KeywordSearchConfig {
  parallel: ParallelConfig;
  indexing: IndexingConfig;
  query: QueryConfig;
  hybrid: HybridConfig;
  monitoring: MonitoringConfig;
  performance: PerformanceConfig;
}

export interface ParallelConfig {
  maxConcurrentTasks: number;
  taskTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  workerPoolSize: number;
  enableLoadBalancing: boolean;
  taskPriorityStrategy: "fifo" | "priority" | "shortest_first";
}

export interface IndexingConfig {
  defaultStrategy: IndexStrategy;
  buildIncrementally: boolean;
  compressIndex: boolean;
  cacheSize: number;
  rebuildThreshold: number;
  optimizeSchedule: string;
  enableSharding: boolean;
  shardCount: number;
}

export interface QueryConfig {
  defaultStrategy: QueryStrategy;
  enableQueryExpansion: boolean;
  enableSpellCorrection: boolean;
  enableSynonymExpansion: boolean;
  maxQueryTerms: number;
  maxQueryLength: number;
  defaultOperator: "AND" | "OR";
  enableHighlighting: boolean;
  highlightFragmentSize: number;
  highlightMaxFragments: number;
}

export interface HybridConfig {
  defaultMode: HybridSearchMode;
  keywordWeight: number;
  vectorWeight: number;
  adaptiveThreshold: number;
  fusionAlgorithm: "linear" | "rank" | "reciprocal" | "custom";
  enableResultInterleaving: boolean;
  enableContextualReranking: boolean;
}

export interface MonitoringConfig {
  enableMetrics: boolean;
  metricsRetentionDays: number;
  alertThresholds: AlertThresholds;
  enablePerformanceTracing: boolean;
  enableQueryLogging: boolean;
  sampleRate: number;
}

export interface AlertThresholds {
  maxLatency: number;
  minSuccessRate: number;
  maxErrorRate: number;
  maxMemoryUsage: number;
  maxCpuUsage: number;
}

export interface PerformanceConfig {
  enableCaching: boolean;
  cacheSize: number;
  cacheTtl: number;
  enablePrecomputation: boolean;
  precomputeTopQueries: number;
  enableResultPagination: boolean;
  defaultPageSize: number;
  maxPageSize: number;
}

// 錯誤類型
export class KeywordSearchError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "KeywordSearchError";
  }
}

export class QueryParseError extends KeywordSearchError {
  constructor(query: string, reason: string) {
    super(`Failed to parse query: ${query}. Reason: ${reason}`, "QUERY_PARSE_ERROR", {
      query,
      reason,
    });
  }
}

export class IndexError extends KeywordSearchError {
  constructor(indexName: string, operation: string, reason: string) {
    super(
      `Index operation failed on ${indexName}: ${operation}. Reason: ${reason}`,
      "INDEX_ERROR",
      { indexName, operation, reason }
    );
  }
}

export class ParallelTaskError extends KeywordSearchError {
  constructor(taskId: string, reason: string) {
    super(`Parallel task ${taskId} failed: ${reason}`, "PARALLEL_TASK_ERROR", { taskId, reason });
  }
}
