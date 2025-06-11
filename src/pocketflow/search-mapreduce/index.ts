/**
 * PocketFlow.js MapReduce 搜索系統 - 主要匯出文件
 */

// 核心組件
export { SearchMapReduceEngine } from "./core/SearchMapReduceEngine";
export { SearchMapper } from "./core/SearchMapper";
export { SearchReducer } from "./core/SearchReducer";
export { SearchCoordinator } from "./core/SearchCoordinator";
export { TaskDispatcher } from "./core/TaskDispatcher";

// 搜索策略
export { SearchStrategyRegistry } from "./strategies/SearchStrategyRegistry";
export { VectorSearchStrategy } from "./strategies/VectorSearchStrategy";
export { KeywordSearchStrategy } from "./strategies/KeywordSearchStrategy";
export { HybridSearchStrategy } from "./strategies/HybridSearchStrategy";

// 結果聚合
export { ResultAggregator } from "./aggregation/ResultAggregator";

// 監控系統
export { SearchMonitor } from "./monitoring/SearchMonitor";

// 類型定義
export * from "./types";

// 工廠函數和配置預設
export {
  createSearchMapReduceEngine,
  getDefaultConfig,
  getHighPerformanceConfig,
  getProdConfig,
  getDevConfig,
  getTestConfig,
  validateConfig,
  mergeConfigs,
  createStrategyConfig,
} from "./factory";
