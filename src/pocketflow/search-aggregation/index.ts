/**
 * PocketFlow.js Search Aggregation System - Main Export
 * 搜索結果聚合系統主導出文件
 */

// 核心組件
export { UnifiedSearchAggregator } from "./core/UnifiedSearchAggregator";
export type {
  AggregationRequest,
  AggregationOptions,
  AggregationResult,
} from "./core/UnifiedSearchAggregator";
export { SearchResultNormalizer } from "./core/SearchResultNormalizer";
export { MultiSourceResultMerger } from "./core/MultiSourceResultMerger";
export { ResultQualityFilter } from "./core/ResultQualityFilter";

// 智能排序組件
export { IntelligentRanker } from "./ranking/IntelligentRanker";
export { RelevanceScorer } from "./ranking/RelevanceScorer";
export { DiversityOptimizer } from "./ranking/DiversityOptimizer";
export { ContextualReranker } from "./ranking/ContextualReranker";

// 個性化組件
export { PersonalizationEngine } from "./personalization/PersonalizationEngine";
export { UserPreferenceTracker } from "./personalization/UserPreferenceTracker";
export { BehaviorAnalyzer } from "./personalization/BehaviorAnalyzer";
export { AdaptiveRanking } from "./personalization/AdaptiveRanking";

// 監控組件
export { AggregationMonitor } from "./monitoring/AggregationMonitor";

// 類型定義
export * from "./types";

// 工廠函數
export {
  createSearchAggregationSystem,
  createDefaultConfig,
  createHighPerformanceConfig,
  createQualityFocusedConfig,
  createPersonalizationFocusedConfig,
  createMemoryOptimizedConfig,
  createDevelopmentConfig,
  getPresetConfigs,
  getPresetConfig,
  validateConfig,
  mergeConfigs,
  createCustomRankingStrategy,
  getConfigSummary,
} from "./factory";
