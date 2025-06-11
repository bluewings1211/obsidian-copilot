/**
 * MCP 增強組件導出索引
 *
 * 提供統一的導出接口給 PocketFlow.js 系統使用
 */

// 主要管理器
export { EnhancedMcpManager } from "./EnhancedMcpManager";
export type { EnhancedMcpConfig, ServiceStatus, EnhancedMcpEvents } from "./EnhancedMcpManager";

// 連接管理組件
export { McpConnectionPool } from "./connection/McpConnectionPool";
export type {
  ConnectionPoolStats,
  ConnectionPoolOptions,
  ConnectionPoolEvents,
} from "./connection/McpConnectionPool";

export { McpHealthChecker } from "./connection/McpHealthChecker";
export type {
  HealthCheckResult,
  HealthStats,
  HealthCheckConfig,
  HealthCheckEvents,
} from "./connection/McpHealthChecker";

export { McpLoadBalancer } from "./connection/McpLoadBalancer";
export type {
  ServerWeight,
  LoadBalancingStrategy,
  LoadBalancerConfig,
  LoadBalancerStats,
  LoadBalancerEvents,
} from "./connection/McpLoadBalancer";

// 性能優化組件
export { McpParallelExecutor } from "./performance/McpParallelExecutor";
export type {
  ParallelTask,
  ParallelResult,
  BatchExecutionOptions,
  ParallelExecutionStats,
  ParallelExecutorConfig,
  ParallelExecutorEvents,
} from "./performance/McpParallelExecutor";

export { McpResultCache } from "./performance/McpResultCache";
export type {
  CacheStats,
  CacheStrategy,
  InvalidationStrategy,
  CacheConfig,
  CacheEvents,
} from "./performance/McpResultCache";

// 可靠性組件
export { McpErrorClassifier } from "./reliability/McpErrorClassifier";
export { ErrorCategory, ErrorSeverity, RecoveryStrategy } from "./reliability/McpErrorClassifier";
export type {
  ErrorClassification,
  ErrorPattern,
  ErrorStats,
  ErrorContext,
  ErrorClassifierConfig,
  ErrorClassifierEvents,
} from "./reliability/McpErrorClassifier";

// 監控診斷組件
export { McpMetricsCollector } from "./monitoring/McpMetricsCollector";
export { MetricType } from "./monitoring/McpMetricsCollector";
export type {
  MetricDataPoint,
  MetricDefinition,
  AggregatedMetric,
  SystemMetrics,
  McpMetrics,
  AlertRule,
  Alert,
  MetricsConfig,
  MetricsEvents,
} from "./monitoring/McpMetricsCollector";

// 工具函數
export * from "../utils/logger";
