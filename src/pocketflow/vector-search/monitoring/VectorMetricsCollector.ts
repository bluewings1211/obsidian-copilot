/**
 * 向量指標收集器
 */

import { EventEmitter } from "events";
import {
  VectorSearchAnalytics,
  QueryPattern,
  ResultQualityMetrics,
  UserBehaviorMetrics,
  VectorPerformanceMetrics,
  OptimizationRecommendation,
  OptimizationType,
  MonitoringConfig,
} from "../types";

export class VectorMetricsCollector extends EventEmitter {
  private config: MonitoringConfig;
  private searchRecords: SearchRecord[] = [];
  private queryPatterns: Map<string, QueryPatternData> = new Map();
  private userBehaviorData: Map<string, UserSessionData> = new Map();
  private qualityMetrics: ResultQualityData = this.createInitialQualityData();
  private isInitialized: boolean = false;

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化指標收集器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 啟動分析任務
      if (this.config.enableAnalytics) {
        this.startAnalyticsTasks();
      }

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 記錄搜索事件
   */
  async recordSearch(data: {
    searchId: string;
    query?: string;
    executionTime: number;
    resultCount: number;
    status: "success" | "error";
    userId?: string;
    sessionId?: string;
    timestamp: number;
  }): Promise<void> {
    const record: SearchRecord = {
      searchId: data.searchId,
      query: data.query || "",
      executionTime: data.executionTime,
      resultCount: data.resultCount,
      status: data.status,
      userId: data.userId,
      sessionId: data.sessionId,
      timestamp: data.timestamp,
      relevanceScores: [],
    };

    this.searchRecords.push(record);

    // 更新查詢模式
    if (data.query) {
      this.updateQueryPatterns(data.query, data.resultCount);
    }

    // 更新用戶行為數據
    if (data.userId) {
      this.updateUserBehavior(data.userId, data.sessionId, record);
    }

    // 保持記錄在合理範圍內
    if (this.searchRecords.length > 10000) {
      this.searchRecords = this.searchRecords.slice(-8000);
    }

    this.emit("search_recorded", { record });
  }

  /**
   * 記錄結果點擊
   */
  recordResultClick(data: {
    searchId: string;
    resultIndex: number;
    documentId: string;
    relevanceScore: number;
    userId?: string;
  }): void {
    // 找到對應的搜索記錄
    const searchRecord = this.searchRecords.find((r) => r.searchId === data.searchId);
    if (searchRecord) {
      searchRecord.relevanceScores.push({
        index: data.resultIndex,
        score: data.relevanceScore,
        clicked: true,
      });

      // 更新質量指標
      this.updateQualityMetrics(data.relevanceScore, data.resultIndex);
    }

    // 更新用戶行為
    if (data.userId) {
      this.updateUserClickBehavior(data.userId, data.resultIndex, data.relevanceScore);
    }

    this.emit("result_clicked", { data });
  }

  /**
   * 記錄用戶滿意度
   */
  recordUserSatisfaction(data: {
    searchId: string;
    satisfactionScore: number; // 1-5
    userId?: string;
  }): void {
    const searchRecord = this.searchRecords.find((r) => r.searchId === data.searchId);
    if (searchRecord) {
      searchRecord.satisfactionScore = data.satisfactionScore;
    }

    // 更新質量指標
    this.qualityMetrics.userSatisfactionScore =
      this.qualityMetrics.userSatisfactionScore * 0.9 + (data.satisfactionScore / 5) * 0.1;

    this.emit("satisfaction_recorded", { data });
  }

  /**
   * 更新查詢模式
   */
  private updateQueryPatterns(query: string, resultCount: number): void {
    const normalizedQuery = this.normalizeQuery(query);
    const pattern = this.queryPatterns.get(normalizedQuery) || {
      pattern: normalizedQuery,
      frequency: 0,
      totalResults: 0,
      totalRelevanceScore: 0,
      commonFilters: {},
    };

    pattern.frequency++;
    pattern.totalResults += resultCount;

    this.queryPatterns.set(normalizedQuery, pattern);
  }

  /**
   * 更新用戶行為數據
   */
  private updateUserBehavior(userId: string, sessionId?: string, record?: SearchRecord): void {
    const userData = this.userBehaviorData.get(userId) || {
      userId,
      totalSearches: 0,
      averageQueryLength: 0,
      totalQueryLength: 0,
      sessionDurations: [],
      queryRefinements: 0,
      resultsExplorationDepth: [],
      preferredResultTypes: {},
      lastActivity: Date.now(),
      currentSession: sessionId,
    };

    if (record) {
      userData.totalSearches++;
      userData.totalQueryLength += record.query.length;
      userData.averageQueryLength = userData.totalQueryLength / userData.totalSearches;

      // 檢測查詢細化
      if (userData.totalSearches > 1 && this.isQueryRefinement(record.query, userId)) {
        userData.queryRefinements++;
      }
    }

    userData.lastActivity = Date.now();
    this.userBehaviorData.set(userId, userData);
  }

  /**
   * 更新用戶點擊行為
   */
  private updateUserClickBehavior(
    userId: string,
    resultIndex: number,
    relevanceScore: number
  ): void {
    const userData = this.userBehaviorData.get(userId);
    if (userData) {
      userData.resultsExplorationDepth.push(resultIndex);

      // 保持數組大小合理
      if (userData.resultsExplorationDepth.length > 100) {
        userData.resultsExplorationDepth = userData.resultsExplorationDepth.slice(-80);
      }
    }
  }

  /**
   * 更新質量指標
   */
  private updateQualityMetrics(relevanceScore: number, resultIndex: number): void {
    // 更新平均相關性分數
    this.qualityMetrics.averageRelevanceScore =
      this.qualityMetrics.averageRelevanceScore * 0.95 + relevanceScore * 0.05;

    // 更新點擊率（基於結果位置）
    const ctrContribution = resultIndex === 0 ? 0.1 : resultIndex < 3 ? 0.05 : 0.02;
    this.qualityMetrics.clickThroughRate =
      this.qualityMetrics.clickThroughRate * 0.95 + ctrContribution;

    // 更新語義一致性（簡化計算）
    const consistencyContribution = relevanceScore > 0.7 ? 0.1 : 0.02;
    this.qualityMetrics.semanticCoherence =
      this.qualityMetrics.semanticCoherence * 0.95 + consistencyContribution;
  }

  /**
   * 啟動分析任務
   */
  private startAnalyticsTasks(): void {
    const interval = this.config.metricsCollectionInterval || 300000; // 5 minutes

    setInterval(() => {
      this.performPeriodicAnalysis();
    }, interval);
  }

  /**
   * 執行周期性分析
   */
  private performPeriodicAnalysis(): void {
    // 分析查詢模式
    this.analyzeQueryPatterns();

    // 分析用戶行為
    this.analyzeUserBehavior();

    // 計算結果一致性
    this.calculateResultConsistency();

    this.emit("periodic_analysis_completed", {
      timestamp: Date.now(),
      patterns: this.queryPatterns.size,
      users: this.userBehaviorData.size,
    });
  }

  /**
   * 分析查詢模式
   */
  private analyzeQueryPatterns(): void {
    // 識別熱門查詢模式
    const sortedPatterns = Array.from(this.queryPatterns.values()).sort(
      (a, b) => b.frequency - a.frequency
    );

    // 識別低效查詢模式
    const inefficientPatterns = sortedPatterns.filter(
      (p) => p.frequency > 5 && p.totalResults / p.frequency < 2
    );

    if (inefficientPatterns.length > 0) {
      this.emit("inefficient_patterns_detected", { patterns: inefficientPatterns });
    }
  }

  /**
   * 分析用戶行為
   */
  private analyzeUserBehavior(): void {
    const userStats = Array.from(this.userBehaviorData.values());

    // 計算查詢細化率
    const totalRefinements = userStats.reduce((sum, u) => sum + u.queryRefinements, 0);
    const totalSearches = userStats.reduce((sum, u) => sum + u.totalSearches, 0);
    const refinementRate = totalSearches > 0 ? totalRefinements / totalSearches : 0;

    // 如果細化率過高，可能表示搜索質量需要改進
    if (refinementRate > 0.3) {
      this.emit("high_refinement_rate_detected", { rate: refinementRate });
    }
  }

  /**
   * 計算結果一致性
   */
  private calculateResultConsistency(): void {
    const recentSearches = this.searchRecords.slice(-100);
    const queryGroups = new Map<string, SearchRecord[]>();

    // 按查詢分組
    for (const search of recentSearches) {
      const normalizedQuery = this.normalizeQuery(search.query);
      const group = queryGroups.get(normalizedQuery) || [];
      group.push(search);
      queryGroups.set(normalizedQuery, group);
    }

    // 計算每組的一致性
    let totalConsistency = 0;
    let groupCount = 0;

    for (const [, searches] of queryGroups.entries()) {
      if (searches.length > 1) {
        const consistency = this.calculateGroupConsistency(searches);
        totalConsistency += consistency;
        groupCount++;
      }
    }

    if (groupCount > 0) {
      this.qualityMetrics.resultConsistency = totalConsistency / groupCount;
    }
  }

  /**
   * 計算組一致性
   */
  private calculateGroupConsistency(searches: SearchRecord[]): number {
    const resultCounts = searches.map((s) => s.resultCount);
    const avgCount = resultCounts.reduce((sum, c) => sum + c, 0) / resultCounts.length;

    // 計算變異係數
    const variance =
      resultCounts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / resultCounts.length;
    const stdDev = Math.sqrt(variance);
    const cv = avgCount > 0 ? stdDev / avgCount : 1;

    // 一致性分數（變異係數越小一致性越高）
    return Math.max(0, 1 - cv);
  }

  /**
   * 獲取分析結果
   */
  async getAnalytics(): Promise<VectorSearchAnalytics> {
    const queryPatterns = this.getTopQueryPatterns();
    const userBehavior = this.aggregateUserBehavior();
    const performanceMetrics = this.calculatePerformanceMetrics();
    const recommendations = this.generateOptimizationRecommendations();

    return {
      queryPatterns,
      resultQuality: this.qualityMetrics,
      userBehavior,
      systemPerformance: performanceMetrics,
      optimizationRecommendations: recommendations,
    };
  }

  /**
   * 獲取熱門查詢模式
   */
  private getTopQueryPatterns(): QueryPattern[] {
    return Array.from(this.queryPatterns.values())
      .map((p) => ({
        pattern: p.pattern,
        frequency: p.frequency,
        averageResultCount: p.frequency > 0 ? p.totalResults / p.frequency : 0,
        averageRelevanceScore: p.frequency > 0 ? p.totalRelevanceScore / p.frequency : 0,
        commonFilters: p.commonFilters,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);
  }

  /**
   * 聚合用戶行為數據
   */
  private aggregateUserBehavior(): UserBehaviorMetrics {
    const users = Array.from(this.userBehaviorData.values());

    const averageQueryLength =
      users.length > 0 ? users.reduce((sum, u) => sum + u.averageQueryLength, 0) / users.length : 0;

    const queryRefinementRate =
      users.length > 0
        ? users.reduce((sum, u) => sum + u.queryRefinements, 0) /
          Math.max(
            1,
            users.reduce((sum, u) => sum + u.totalSearches, 0)
          )
        : 0;

    const avgExplorationDepth =
      users.length > 0
        ? users.reduce((sum, u) => {
            const avgDepth =
              u.resultsExplorationDepth.length > 0
                ? u.resultsExplorationDepth.reduce((s, d) => s + d, 0) /
                  u.resultsExplorationDepth.length
                : 0;
            return sum + avgDepth;
          }, 0) / users.length
        : 0;

    // 聚合偏好結果類型
    const preferredResultTypes: Record<string, number> = {};
    for (const user of users) {
      for (const [type, count] of Object.entries(user.preferredResultTypes)) {
        preferredResultTypes[type] = (preferredResultTypes[type] || 0) + count;
      }
    }

    return {
      averageQueryLength,
      queryRefinementRate,
      sessionDuration: 0, // TODO: 實現會話持續時間計算
      resultsExplorationDepth: avgExplorationDepth,
      preferredResultTypes,
    };
  }

  /**
   * 計算性能指標
   */
  private calculatePerformanceMetrics(): VectorPerformanceMetrics {
    const recentSearches = this.searchRecords.slice(-1000);
    const successfulSearches = recentSearches.filter((s) => s.status === "success");

    const totalSearches = recentSearches.length;
    const averageLatency =
      successfulSearches.length > 0
        ? successfulSearches.reduce((sum, s) => sum + s.executionTime, 0) /
          successfulSearches.length
        : 0;

    const errorRate =
      totalSearches > 0 ? (totalSearches - successfulSearches.length) / totalSearches : 0;

    return {
      totalSearches,
      averageLatency,
      p95Latency: this.calculatePercentile(
        successfulSearches.map((s) => s.executionTime),
        0.95
      ),
      p99Latency: this.calculatePercentile(
        successfulSearches.map((s) => s.executionTime),
        0.99
      ),
      throughput: 0, // TODO: 計算實際吞吐量
      cacheHitRate: 0, // TODO: 從其他組件獲取
      parallelEfficiency: 0, // TODO: 從其他組件獲取
      shardUtilization: {}, // TODO: 從其他組件獲取
      errorRate,
      memoryUsage: 0, // TODO: 從其他組件獲取
    };
  }

  /**
   * 生成優化建議
   */
  private generateOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // 基於查詢模式的建議
    const inefficientPatterns = Array.from(this.queryPatterns.values()).filter(
      (p) => p.frequency > 10 && p.totalResults / p.frequency < 1
    );

    if (inefficientPatterns.length > 0) {
      recommendations.push({
        type: OptimizationType.QUERY_OPTIMIZATION,
        description: `Optimize ${inefficientPatterns.length} inefficient query patterns`,
        expectedImprovement: 0.2,
        implementationCost: 2,
        priority: 7,
      });
    }

    // 基於用戶行為的建議
    const userBehavior = this.aggregateUserBehavior();
    if (userBehavior.queryRefinementRate > 0.25) {
      recommendations.push({
        type: OptimizationType.MODEL_TUNING,
        description: "High query refinement rate suggests search quality issues",
        expectedImprovement: 0.3,
        implementationCost: 3,
        priority: 8,
      });
    }

    // 基於結果質量的建議
    if (this.qualityMetrics.averageRelevanceScore < 0.7) {
      recommendations.push({
        type: OptimizationType.MODEL_TUNING,
        description: "Low average relevance score indicates need for model tuning",
        expectedImprovement: 0.25,
        implementationCost: 3,
        priority: 9,
      });
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 輔助方法
   */
  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, " ");
  }

  private isQueryRefinement(currentQuery: string, userId: string): boolean {
    const userData = this.userBehaviorData.get(userId);
    if (!userData) return false;

    const recentUserSearches = this.searchRecords.filter((r) => r.userId === userId).slice(-3);

    if (recentUserSearches.length < 2) return false;

    const previousQuery = recentUserSearches[recentUserSearches.length - 2].query;
    const similarity = this.calculateQuerySimilarity(currentQuery, previousQuery);

    return similarity > 0.6; // 60% 相似度閾值
  }

  private calculateQuerySimilarity(query1: string, query2: string): number {
    const words1 = new Set(query1.toLowerCase().split(/\s+/));
    const words2 = new Set(query2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(percentile * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  private createInitialQualityData(): ResultQualityMetrics {
    return {
      averageRelevanceScore: 0,
      resultConsistency: 0,
      semanticCoherence: 0,
      userSatisfactionScore: 0,
      clickThroughRate: 0,
    };
  }

  /**
   * 清理舊數據
   */
  cleanupOldData(): void {
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

    // 清理舊搜索記錄
    this.searchRecords = this.searchRecords.filter((r) => r.timestamp > cutoffTime);

    // 清理不活躍用戶數據
    for (const [userId, userData] of this.userBehaviorData.entries()) {
      if (userData.lastActivity < cutoffTime) {
        this.userBehaviorData.delete(userId);
      }
    }

    this.emit("data_cleanup_completed", {
      searchRecords: this.searchRecords.length,
      activeUsers: this.userBehaviorData.size,
    });
  }

  /**
   * 關閉指標收集器
   */
  async shutdown(): Promise<void> {
    this.searchRecords = [];
    this.queryPatterns.clear();
    this.userBehaviorData.clear();
    this.qualityMetrics = this.createInitialQualityData();
    this.isInitialized = false;

    this.emit("shutdown");
  }
}

/**
 * 內部數據結構
 */
interface SearchRecord {
  searchId: string;
  query: string;
  executionTime: number;
  resultCount: number;
  status: "success" | "error";
  userId?: string;
  sessionId?: string;
  timestamp: number;
  relevanceScores: Array<{
    index: number;
    score: number;
    clicked: boolean;
  }>;
  satisfactionScore?: number;
}

interface QueryPatternData {
  pattern: string;
  frequency: number;
  totalResults: number;
  totalRelevanceScore: number;
  commonFilters: Record<string, any>;
}

interface UserSessionData {
  userId: string;
  totalSearches: number;
  averageQueryLength: number;
  totalQueryLength: number;
  sessionDurations: number[];
  queryRefinements: number;
  resultsExplorationDepth: number[];
  preferredResultTypes: Record<string, number>;
  lastActivity: number;
  currentSession?: string;
}

interface ResultQualityData {
  averageRelevanceScore: number;
  resultConsistency: number;
  semanticCoherence: number;
  userSatisfactionScore: number;
  clickThroughRate: number;
}
