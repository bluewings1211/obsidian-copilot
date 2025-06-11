/**
 * 關鍵字搜索系統主入口文件
 */

// 核心組件
export { KeywordSearchEngine } from "./KeywordSearchEngine";

// 並行處理組件
export { ParallelTextMatcher } from "./parallel/ParallelTextMatcher";
export { KeywordResultAggregator } from "./parallel/KeywordResultAggregator";

// 查詢解析組件
export { QueryParser } from "./query/QueryParser";

// 索引組件
export { TextIndexManager } from "./indexing/TextIndexManager";

// 混合搜索組件
export { HybridSearchCoordinator } from "./hybrid/HybridSearchCoordinator";

// 監控組件
export { KeywordPerformanceMonitor } from "./monitoring/KeywordPerformanceMonitor";

// 類型定義
export * from "./types";

// 工廠函數和配置
export {
  createKeywordSearchEngine,
  getDefaultConfig,
  getHighPerformanceConfig,
  getMemoryOptimizedConfig,
  getDevelopmentConfig,
  validateConfig,
  getConfigOptimizationSuggestions,
  ConfigPresets,
  ConfigUtils,
} from "./factory";
