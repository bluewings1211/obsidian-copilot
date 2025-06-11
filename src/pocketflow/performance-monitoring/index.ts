// Performance Monitoring Core
export { PerformanceMonitoringManager } from "./core/PerformanceMonitoringManager";
export type {
  PerformanceMetric,
  PerformanceAlert,
  MonitoringConfig,
  SystemHealthStatus,
} from "./core/PerformanceMonitoringManager";

export { MetricsCollectionEngine } from "./core/MetricsCollectionEngine";
export type { MetricsSummary, ComponentHealth } from "./core/MetricsCollectionEngine";

export { RealTimeAnalyzer } from "./core/RealTimeAnalyzer";
export type { AnomalyDetection, RealTimeStats } from "./core/RealTimeAnalyzer";

export { TrendAnalysisEngine } from "./core/TrendAnalysisEngine";
export type { TrendData, SeasonalPattern } from "./core/TrendAnalysisEngine";

// Analytics Engines
export { PerformanceAnalyzer } from "./analytics/PerformanceAnalyzer";
export type {
  PerformanceBottleneck,
  PerformanceInsight,
  ComponentPerformanceProfile,
  SystemPerformanceReport,
} from "./analytics/PerformanceAnalyzer";

export { UsagePatternAnalyzer } from "./analytics/UsagePatternAnalyzer";
export type {
  UsagePattern,
  LoadPattern,
  BehaviorPattern,
  PatternAnalysisResult,
} from "./analytics/UsagePatternAnalyzer";

export { PredictiveAnalytics } from "./analytics/PredictiveAnalytics";
export type {
  PredictionModel,
  Prediction,
  AlertPrediction,
  CapacityForecast,
} from "./analytics/PredictiveAnalytics";

export { OptimizationEngine } from "./analytics/OptimizationEngine";
export type {
  OptimizationRecommendation,
  OptimizationStrategy,
  AutoOptimizationRule,
  OptimizationReport,
} from "./analytics/OptimizationEngine";

// Import types for use in factory function
import {
  PerformanceMonitoringManager,
  PerformanceMetric,
  MonitoringConfig,
} from "./core/PerformanceMonitoringManager";
import {
  PerformanceAnalyzer,
  PerformanceBottleneck,
  PerformanceInsight,
} from "./analytics/PerformanceAnalyzer";
import { UsagePatternAnalyzer } from "./analytics/UsagePatternAnalyzer";
import { PredictiveAnalytics } from "./analytics/PredictiveAnalytics";
import { OptimizationEngine } from "./analytics/OptimizationEngine";
import { TrendData } from "./core/TrendAnalysisEngine";

// Convenience factory function
export function createPerformanceMonitoring(config: Partial<MonitoringConfig> = {}) {
  const manager = new PerformanceMonitoringManager(config);
  const analyzer = new PerformanceAnalyzer();
  const patternAnalyzer = new UsagePatternAnalyzer();
  const predictive = new PredictiveAnalytics();
  const optimizer = new OptimizationEngine();

  // Connect components
  manager.on("metric", (metric: PerformanceMetric) => {
    analyzer.addMetrics([metric]);
    patternAnalyzer.addMetrics([metric]);
    predictive.addMetrics([metric]);
    optimizer.addMetrics([metric]);
  });

  manager.on("trend", (trend: TrendData) => {
    predictive.addTrends([trend]);
    optimizer.addTrends([trend]);
  });

  analyzer.on("bottlenecksDetected", (bottlenecks: PerformanceBottleneck[]) => {
    optimizer.addBottlenecks(bottlenecks);
  });

  analyzer.on("insightsGenerated", (insights: PerformanceInsight[]) => {
    optimizer.addInsights(insights);
  });

  return {
    manager,
    analyzer,
    patternAnalyzer,
    predictive,
    optimizer,
    async start() {
      await manager.start();
      await analyzer.start();
      await patternAnalyzer.start();
      await predictive.start();
      await optimizer.start();
    },
    async stop() {
      await manager.stop();
      await analyzer.stop();
      await patternAnalyzer.stop();
      await predictive.stop();
      await optimizer.stop();
    },
  };
}
