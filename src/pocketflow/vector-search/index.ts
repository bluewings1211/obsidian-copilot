/**
 * 並行化向量搜索系統主匯出
 */

// 核心引擎
export { VectorSearchEngine } from "./VectorSearchEngine";

// 並行處理組件
export { ParallelVectorCalculator } from "./parallel/ParallelVectorCalculator";

// 分散式檢索組件
export { VectorShardManager } from "./distributed/VectorShardManager";
export { DistributedVectorRetriever } from "./distributed/DistributedVectorRetriever";
export { VectorLoadBalancer } from "./distributed/VectorLoadBalancer";

// 緩存組件
export { VectorCacheManager } from "./cache/VectorCacheManager";
export { EmbeddingCacheStore } from "./cache/EmbeddingCacheStore";

// 語義搜索組件
export { SemanticSimilarityEnhancer } from "./semantic/SemanticSimilarityEnhancer";
export { ContextualVectorSearch } from "./semantic/ContextualVectorSearch";

// 監控組件
export { VectorPerformanceMonitor } from "./monitoring/VectorPerformanceMonitor";
export { VectorMetricsCollector } from "./monitoring/VectorMetricsCollector";

// 錯誤類型
export { VectorSearchError } from "./errors";

// 類型定義
export * from "./types";

// 工廠函數和配置
export {
  createVectorSearchEngine,
  getDefaultVectorSearchConfig,
  getHighPerformanceConfig,
  getMemoryOptimizedConfig,
  getDevelopmentConfig,
  validateVectorSearchConfig,
  getConfigOptimizationSuggestions,
} from "./factory";
