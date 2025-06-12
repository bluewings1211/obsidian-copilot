/**
 * PocketFlow.js Search Aggregation System - Intelligent Ranker
 * 智能排序引擎：根據多種因素智能排序搜索結果
 */

import {
  NormalizedSearchResult,
  RankingConfig,
  RankingContext,
  RankingStrategy,
  RankingFactors,
} from "../types";

import { RelevanceScorer } from "./RelevanceScorer";
import { DiversityOptimizer } from "./DiversityOptimizer";
import { ContextualReranker } from "./ContextualReranker";

export interface RankingResult {
  results: NormalizedSearchResult[];
  strategy: string;
  factors: RankingFactors;
  metadata: {
    originalOrder: number[];
    reorderCount: number;
    strategyConfidence: number;
    processingTime: number;
  };
}

/**
 * 智能排序引擎
 * 負責根據查詢上下文和用戶偏好智能選擇排序策略並執行排序
 */
export class IntelligentRanker {
  private relevanceScorer: RelevanceScorer;
  private diversityOptimizer: DiversityOptimizer;
  private contextualReranker: ContextualReranker;

  private rankingStrategies: Map<string, RankingStrategy> = new Map();
  private adaptiveWeights: Map<string, number> = new Map();

  constructor(private config: RankingConfig) {
    this.relevanceScorer = new RelevanceScorer();
    this.diversityOptimizer = new DiversityOptimizer(config.diversityThreshold);
    this.contextualReranker = new ContextualReranker(config.contextWeight);

    this.initializeDefaultStrategies();
  }

  /**
   * 智能排序搜索結果
   */
  async rank(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<NormalizedSearchResult[]> {
    if (results.length <= 1) {
      return results;
    }

    const startTime = Date.now();

    try {
      // 1. 選擇最佳排序策略
      const strategy = await this.selectOptimalStrategy(results, context);

      // 2. 計算排序因子
      const factors = await this.calculateRankingFactors(results, context);

      // 3. 執行基礎排序
      const rankedResults = await strategy.execute(results, context);

      // 4. 多樣性優化
      const diversifiedResults = await this.diversityOptimizer.optimize(rankedResults, context);

      // 5. 上下文重排序
      const finalResults = await this.contextualReranker.rerank(diversifiedResults, context);

      // 6. 自適應學習
      if (this.config.enableAdaptive) {
        this.updateAdaptiveWeights(strategy.id, context, finalResults);
      }

      const processingTime = Date.now() - startTime;

      // 添加排序元數據
      return this.addRankingMetadata(finalResults, {
        strategy: strategy.id,
        factors,
        originalOrder: results.map((_, index) => index),
        processingTime,
      });
    } catch (error) {
      console.warn("智能排序失敗，使用默認排序:", error);
      return this.fallbackRanking(results);
    }
  }

  /**
   * 選擇最佳排序策略
   */
  private async selectOptimalStrategy(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<RankingStrategy> {
    // 分析查詢意圖
    const intent = context.searchIntent;

    // 根據意圖選擇策略
    let strategyId = this.config.defaultStrategy;

    switch (intent.type) {
      case "informational":
        strategyId = "relevance-quality";
        break;
      case "navigational":
        strategyId = "authority-freshness";
        break;
      case "transactional":
        strategyId = "quality-authority";
        break;
      case "exploratory":
        strategyId = "diversity-relevance";
        break;
    }

    // 考慮用戶偏好
    if (context.preferences) {
      strategyId = this.adjustStrategyForPreferences(strategyId, context.preferences);
    }

    // 自適應調整
    if (this.config.enableAdaptive) {
      strategyId = this.adjustStrategyAdaptively(strategyId, context);
    }

    return (
      this.rankingStrategies.get(strategyId) ||
      this.rankingStrategies.get(this.config.defaultStrategy)!
    );
  }

  /**
   * 計算排序因子
   */
  private async calculateRankingFactors(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<RankingFactors> {
    const strategy = await this.selectOptimalStrategy(results, context);
    const baseFactors = strategy.factorWeights;

    // 基於上下文調整權重
    const adjustedFactors = { ...baseFactors };

    // 根據查詢緊急性調整時效性權重
    if (context.searchIntent.urgency === "high") {
      adjustedFactors.freshness = (adjustedFactors.freshness || 0.1) * 1.5;
    }

    // 根據用戶偏好調整
    if (context.preferences?.recency === "latest") {
      adjustedFactors.freshness = (adjustedFactors.freshness || 0.1) * 1.3;
    }

    // 確保權重總和為 1
    return this.normalizeFactorWeights(adjustedFactors);
  }

  /**
   * 標準化因子權重
   */
  private normalizeFactorWeights(factors: Partial<RankingFactors>): RankingFactors {
    const defaultFactors: RankingFactors = {
      relevance: 0.3,
      quality: 0.25,
      freshness: 0.15,
      diversity: 0.1,
      personalization: 0.1,
      authority: 0.05,
      coherence: 0.03,
      completeness: 0.02,
    };

    const mergedFactors = { ...defaultFactors, ...factors };
    const totalWeight = Object.values(mergedFactors).reduce((sum, weight) => sum + weight, 0);

    if (totalWeight === 0) return defaultFactors;

    // 標準化權重
    const normalizedFactors: RankingFactors = {} as RankingFactors;
    for (const [key, weight] of Object.entries(mergedFactors)) {
      normalizedFactors[key as keyof RankingFactors] = weight / totalWeight;
    }

    return normalizedFactors;
  }

  /**
   * 根據偏好調整策略
   */
  private adjustStrategyForPreferences(strategyId: string, preferences: any): string {
    if (preferences.depth === "comprehensive") {
      return "comprehensive-analysis";
    }
    if (preferences.format === "structured") {
      return "structure-priority";
    }
    return strategyId;
  }

  /**
   * 自適應策略調整
   */
  private adjustStrategyAdaptively(strategyId: string, context: RankingContext): string {
    const adaptiveWeight = this.adaptiveWeights.get(strategyId) || 1.0;

    // 如果當前策略表現不佳，嘗試其他策略
    if (adaptiveWeight < 0.5) {
      const alternatives = ["relevance-quality", "quality-authority", "diversity-relevance"];
      return (
        alternatives.find((alt) => (this.adaptiveWeights.get(alt) || 1.0) > adaptiveWeight) ||
        strategyId
      );
    }

    return strategyId;
  }

  /**
   * 更新自適應權重
   */
  private updateAdaptiveWeights(
    strategyId: string,
    context: RankingContext,
    results: NormalizedSearchResult[]
  ): void {
    // 簡化的自適應學習機制
    // 實際應用中會根據用戶反饋和點擊率等指標調整

    const currentWeight = this.adaptiveWeights.get(strategyId) || 1.0;
    const performance = this.evaluateStrategyPerformance(context, results);

    // 簡單的學習率調整
    const learningRate = 0.1;
    const newWeight = currentWeight + learningRate * (performance - 0.5);

    this.adaptiveWeights.set(strategyId, Math.max(0.1, Math.min(2.0, newWeight)));
  }

  /**
   * 評估策略性能
   */
  private evaluateStrategyPerformance(
    context: RankingContext,
    results: NormalizedSearchResult[]
  ): number {
    // 簡化的性能評估
    // 實際應用中會使用更複雜的指標

    let score = 0.5; // 基準分數

    // 基於結果質量評估
    const avgQuality = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
    score += (avgQuality - 0.5) * 0.3;

    // 基於相關性評估
    const avgRelevance = results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length;
    score += (avgRelevance - 0.5) * 0.3;

    // 基於多樣性評估
    const diversity = this.calculateResultDiversity(results);
    score += (diversity - 0.5) * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 計算結果多樣性
   */
  private calculateResultDiversity(results: NormalizedSearchResult[]): number {
    if (results.length <= 1) return 0;

    // 簡化的多樣性計算
    const sources = new Set(results.flatMap((r) => r.sources.map((s) => s.type)));
    return sources.size / 4; // 假設最多有 4 種類型的源
  }

  /**
   * 降級排序
   */
  private fallbackRanking(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    return results.sort((a, b) => {
      // 簡單的分數排序
      const scoreA = (a.normalizedScore + a.qualityScore + a.relevanceScore) / 3;
      const scoreB = (b.normalizedScore + b.qualityScore + b.relevanceScore) / 3;
      return scoreB - scoreA;
    });
  }

  /**
   * 添加排序元數據
   */
  private addRankingMetadata(
    results: NormalizedSearchResult[],
    metadata: any
  ): NormalizedSearchResult[] {
    return results.map((result, index) => ({
      ...result,
      metadata: {
        ...result.metadata,
        rankingPosition: index + 1,
        rankingStrategy: metadata.strategy,
        rankingTimestamp: Date.now(),
      },
    }));
  }

  /**
   * 初始化默認排序策略
   */
  private initializeDefaultStrategies(): void {
    // 相關性-質量策略
    this.rankingStrategies.set("relevance-quality", {
      id: "relevance-quality",
      name: "Relevance-Quality Strategy",
      description: "優先考慮相關性和質量",
      factorWeights: {
        relevance: 0.4,
        quality: 0.3,
        freshness: 0.1,
        diversity: 0.1,
        personalization: 0.05,
        authority: 0.03,
        coherence: 0.01,
        completeness: 0.01,
      },
      contextAdaptive: true,
      execute: async (results, context) => {
        return results.sort((a, b) => {
          const scoreA = a.relevanceScore * 0.4 + a.qualityScore * 0.3;
          const scoreB = b.relevanceScore * 0.4 + b.qualityScore * 0.3;
          return scoreB - scoreA;
        });
      },
    });

    // 權威性-時效性策略
    this.rankingStrategies.set("authority-freshness", {
      id: "authority-freshness",
      name: "Authority-Freshness Strategy",
      description: "優先考慮權威性和時效性",
      factorWeights: {
        authority: 0.35,
        freshness: 0.3,
        relevance: 0.2,
        quality: 0.1,
        diversity: 0.03,
        personalization: 0.01,
        coherence: 0.005,
        completeness: 0.005,
      },
      contextAdaptive: true,
      execute: async (results, context) => {
        return results.sort((a, b) => {
          const freshnessA = this.calculateFreshnessScore(a.timestamp);
          const freshnessB = this.calculateFreshnessScore(b.timestamp);
          const authorityA = this.calculateAuthorityScore(a.sources);
          const authorityB = this.calculateAuthorityScore(b.sources);

          const scoreA = authorityA * 0.35 + freshnessA * 0.3 + a.relevanceScore * 0.2;
          const scoreB = authorityB * 0.35 + freshnessB * 0.3 + b.relevanceScore * 0.2;

          return scoreB - scoreA;
        });
      },
    });

    // 質量-權威性策略
    this.rankingStrategies.set("quality-authority", {
      id: "quality-authority",
      name: "Quality-Authority Strategy",
      description: "優先考慮質量和權威性",
      factorWeights: {
        quality: 0.4,
        authority: 0.3,
        relevance: 0.2,
        freshness: 0.05,
        diversity: 0.03,
        personalization: 0.01,
        coherence: 0.005,
        completeness: 0.005,
      },
      contextAdaptive: true,
      execute: async (results, context) => {
        return results.sort((a, b) => {
          const authorityA = this.calculateAuthorityScore(a.sources);
          const authorityB = this.calculateAuthorityScore(b.sources);

          const scoreA = a.qualityScore * 0.4 + authorityA * 0.3 + a.relevanceScore * 0.2;
          const scoreB = b.qualityScore * 0.4 + authorityB * 0.3 + b.relevanceScore * 0.2;

          return scoreB - scoreA;
        });
      },
    });

    // 多樣性-相關性策略
    this.rankingStrategies.set("diversity-relevance", {
      id: "diversity-relevance",
      name: "Diversity-Relevance Strategy",
      description: "平衡多樣性和相關性",
      factorWeights: {
        diversity: 0.35,
        relevance: 0.3,
        quality: 0.2,
        freshness: 0.1,
        personalization: 0.03,
        authority: 0.01,
        coherence: 0.005,
        completeness: 0.005,
      },
      contextAdaptive: true,
      execute: async (results, context) => {
        // 這個策略會由 DiversityOptimizer 處理
        return results.sort((a, b) => {
          const scoreA = a.relevanceScore * 0.3 + a.qualityScore * 0.2;
          const scoreB = b.relevanceScore * 0.3 + b.qualityScore * 0.2;
          return scoreB - scoreA;
        });
      },
    });

    // 添加配置的自定義策略
    this.config.strategies?.forEach((strategy) => {
      this.rankingStrategies.set(strategy.id, strategy);
    });
  }

  /**
   * 計算時效性分數
   */
  private calculateFreshnessScore(timestamp: number): number {
    const now = Date.now();
    const ageInDays = (now - timestamp) / (1000 * 60 * 60 * 24);

    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 7) return 0.9;
    if (ageInDays <= 30) return 0.7;
    if (ageInDays <= 90) return 0.5;
    return 0.3;
  }

  /**
   * 計算權威性分數
   */
  private calculateAuthorityScore(sources: any[]): number {
    if (sources.length === 0) return 0.5;
    return sources.reduce((sum, source) => sum + source.weight, 0) / sources.length;
  }

  /**
   * 註冊自定義排序策略
   */
  registerStrategy(strategy: RankingStrategy): void {
    this.rankingStrategies.set(strategy.id, strategy);
  }

  /**
   * 移除排序策略
   */
  unregisterStrategy(strategyId: string): void {
    this.rankingStrategies.delete(strategyId);
  }

  /**
   * 獲取可用策略
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.rankingStrategies.keys());
  }

  /**
   * 獲取自適應權重
   */
  getAdaptiveWeights(): Record<string, number> {
    return Object.fromEntries(this.adaptiveWeights);
  }

  /**
   * 重置自適應權重
   */
  resetAdaptiveWeights(): void {
    this.adaptiveWeights.clear();
  }

  /**
   * 獲取排序統計
   */
  getStats() {
    return {
      availableStrategies: this.getAvailableStrategies().length,
      adaptiveWeights: this.getAdaptiveWeights(),
      defaultStrategy: this.config.defaultStrategy,
      adaptiveEnabled: this.config.enableAdaptive,
    };
  }
}
