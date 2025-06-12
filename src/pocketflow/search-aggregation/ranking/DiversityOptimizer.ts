/**
 * PocketFlow.js Search Aggregation System - Diversity Optimizer
 * 多樣性優化器：優化搜索結果的多樣性，避免結果過於相似
 */

import { NormalizedSearchResult, RankingContext } from "../types";

export interface DiversityMetrics {
  sourceTypeDistribution: Record<string, number>;
  topicDistribution: Record<string, number>;
  qualityDistribution: Record<string, number>;
  temporalDistribution: Record<string, number>;
  overallDiversityScore: number;
}

export interface DiversityStrategy {
  id: string;
  name: string;
  description: string;
  optimize: (
    results: NormalizedSearchResult[],
    context: RankingContext
  ) => Promise<NormalizedSearchResult[]>;
}

export interface DiversificationConfig {
  maxSimilarResults: number;
  similarityThreshold: number;
  sourceTypeWeight: number;
  topicWeight: number;
  qualityWeight: number;
  temporalWeight: number;
}

/**
 * 多樣性優化器
 * 負責優化搜索結果的多樣性，確保結果覆蓋不同角度和來源
 */
export class DiversityOptimizer {
  private strategies: Map<string, DiversityStrategy> = new Map();
  private config: DiversificationConfig;

  constructor(
    private diversityThreshold: number = 0.7,
    config?: Partial<DiversificationConfig>
  ) {
    this.config = {
      maxSimilarResults: 3,
      similarityThreshold: 0.8,
      sourceTypeWeight: 0.3,
      topicWeight: 0.3,
      qualityWeight: 0.2,
      temporalWeight: 0.2,
      ...config,
    };

    this.initializeStrategies();
  }

  /**
   * 優化結果多樣性
   */
  async optimize(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<NormalizedSearchResult[]> {
    if (results.length <= 1) {
      return results;
    }

    try {
      // 1. 分析當前多樣性
      const currentMetrics = this.analyzeDiversity(results);

      // 2. 如果多樣性已經足夠，直接返回
      if (currentMetrics.overallDiversityScore >= this.diversityThreshold) {
        return results;
      }

      // 3. 選擇多樣性策略
      const strategy = this.selectOptimizationStrategy(currentMetrics, context);

      // 4. 執行多樣性優化
      const optimizedResults = await strategy.optimize(results, context);

      // 5. 驗證優化效果
      const optimizedMetrics = this.analyzeDiversity(optimizedResults);

      // 如果優化後多樣性更差，返回原結果
      if (optimizedMetrics.overallDiversityScore < currentMetrics.overallDiversityScore) {
        return results;
      }

      return optimizedResults;
    } catch (error) {
      console.warn("多樣性優化失敗:", error);
      return results;
    }
  }

  /**
   * 分析結果多樣性
   */
  analyzeDiversity(results: NormalizedSearchResult[]): DiversityMetrics {
    // 1. 源類型分佈
    const sourceTypeDistribution = this.analyzeSourceTypeDistribution(results);

    // 2. 主題分佈
    const topicDistribution = this.analyzeTopicDistribution(results);

    // 3. 質量分佈
    const qualityDistribution = this.analyzeQualityDistribution(results);

    // 4. 時間分佈
    const temporalDistribution = this.analyzeTemporalDistribution(results);

    // 5. 計算整體多樣性分數
    const overallDiversityScore = this.calculateOverallDiversityScore({
      sourceTypeDistribution,
      topicDistribution,
      qualityDistribution,
      temporalDistribution,
    });

    return {
      sourceTypeDistribution,
      topicDistribution,
      qualityDistribution,
      temporalDistribution,
      overallDiversityScore,
    };
  }

  /**
   * 分析源類型分佈
   */
  private analyzeSourceTypeDistribution(results: NormalizedSearchResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const result of results) {
      for (const source of result.sources) {
        distribution[source.type] = (distribution[source.type] || 0) + 1;
      }
    }

    // 標準化為百分比
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    for (const type in distribution) {
      distribution[type] = distribution[type] / total;
    }

    return distribution;
  }

  /**
   * 分析主題分佈
   */
  private analyzeTopicDistribution(results: NormalizedSearchResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const result of results) {
      const topics = this.extractTopics(result.content);
      for (const topic of topics) {
        distribution[topic] = (distribution[topic] || 0) + 1;
      }
    }

    // 標準化
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    if (total > 0) {
      for (const topic in distribution) {
        distribution[topic] = distribution[topic] / total;
      }
    }

    return distribution;
  }

  /**
   * 分析質量分佈
   */
  private analyzeQualityDistribution(results: NormalizedSearchResult[]): Record<string, number> {
    const distribution = {
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const result of results) {
      if (result.qualityScore >= 0.8) {
        distribution.high++;
      } else if (result.qualityScore >= 0.5) {
        distribution.medium++;
      } else {
        distribution.low++;
      }
    }

    // 標準化
    const total = results.length;
    distribution.high /= total;
    distribution.medium /= total;
    distribution.low /= total;

    return distribution;
  }

  /**
   * 分析時間分佈
   */
  private analyzeTemporalDistribution(results: NormalizedSearchResult[]): Record<string, number> {
    const distribution = {
      recent: 0, // 最近一週
      current: 0, // 最近一個月
      older: 0, // 更早
    };

    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    for (const result of results) {
      const age = now - result.timestamp;
      if (age <= oneWeek) {
        distribution.recent++;
      } else if (age <= oneMonth) {
        distribution.current++;
      } else {
        distribution.older++;
      }
    }

    // 標準化
    const total = results.length;
    distribution.recent /= total;
    distribution.current /= total;
    distribution.older /= total;

    return distribution;
  }

  /**
   * 計算整體多樣性分數
   */
  private calculateOverallDiversityScore(metrics: {
    sourceTypeDistribution: Record<string, number>;
    topicDistribution: Record<string, number>;
    qualityDistribution: Record<string, number>;
    temporalDistribution: Record<string, number>;
  }): number {
    // 計算每個維度的熵（Shannon entropy）
    const sourceEntropy = this.calculateEntropy(Object.values(metrics.sourceTypeDistribution));
    const topicEntropy = this.calculateEntropy(Object.values(metrics.topicDistribution));
    const qualityEntropy = this.calculateEntropy(Object.values(metrics.qualityDistribution));
    const temporalEntropy = this.calculateEntropy(Object.values(metrics.temporalDistribution));

    // 加權平均
    return (
      sourceEntropy * this.config.sourceTypeWeight +
      topicEntropy * this.config.topicWeight +
      qualityEntropy * this.config.qualityWeight +
      temporalEntropy * this.config.temporalWeight
    );
  }

  /**
   * 計算熵值
   */
  private calculateEntropy(probabilities: number[]): number {
    let entropy = 0;
    for (const p of probabilities) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  /**
   * 選擇優化策略
   */
  private selectOptimizationStrategy(
    metrics: DiversityMetrics,
    context: RankingContext
  ): DiversityStrategy {
    // 分析哪個維度的多樣性最需要改進
    const sourceEntropy = this.calculateEntropy(Object.values(metrics.sourceTypeDistribution));
    const topicEntropy = this.calculateEntropy(Object.values(metrics.topicDistribution));

    if (sourceEntropy < 0.5) {
      return this.strategies.get("source-diversification")!;
    } else if (topicEntropy < 0.5) {
      return this.strategies.get("topic-diversification")!;
    } else {
      return this.strategies.get("balanced-diversification")!;
    }
  }

  /**
   * 提取主題（簡化版）
   */
  private extractTopics(content: string): string[] {
    const topicKeywords = {
      technology: [
        "computer",
        "software",
        "programming",
        "technology",
        "digital",
        "AI",
        "machine learning",
      ],
      science: ["research", "study", "analysis", "experiment", "theory", "scientific"],
      business: ["company", "market", "business", "industry", "economic", "finance"],
      health: ["health", "medical", "treatment", "disease", "medicine", "healthcare"],
      education: ["education", "learning", "teaching", "school", "university", "course"],
      entertainment: ["entertainment", "movie", "music", "game", "sport", "art"],
    };

    const topics: string[] = [];
    const contentLower = content.toLowerCase();

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((keyword) => contentLower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics.length > 0 ? topics : ["general"];
  }

  /**
   * 初始化多樣性策略
   */
  private initializeStrategies(): void {
    // 源多樣性策略
    this.strategies.set("source-diversification", {
      id: "source-diversification",
      name: "Source Diversification",
      description: "優化來源類型多樣性",
      optimize: async (results, context) => {
        return this.optimizeSourceDiversity(results);
      },
    });

    // 主題多樣性策略
    this.strategies.set("topic-diversification", {
      id: "topic-diversification",
      name: "Topic Diversification",
      description: "優化主題多樣性",
      optimize: async (results, context) => {
        return this.optimizeTopicDiversity(results);
      },
    });

    // 平衡多樣性策略
    this.strategies.set("balanced-diversification", {
      id: "balanced-diversification",
      name: "Balanced Diversification",
      description: "平衡所有維度的多樣性",
      optimize: async (results, context) => {
        return this.optimizeBalancedDiversity(results);
      },
    });

    // MMR（Maximal Marginal Relevance）策略
    this.strategies.set("mmr-diversification", {
      id: "mmr-diversification",
      name: "MMR Diversification",
      description: "基於最大邊際相關性的多樣性優化",
      optimize: async (results, context) => {
        return this.optimizeMMR(results);
      },
    });
  }

  /**
   * 優化源多樣性
   */
  private optimizeSourceDiversity(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    const optimized: NormalizedSearchResult[] = [];
    const sourceTypeCounts: Record<string, number> = {};

    // 按質量排序
    const sortedResults = [...results].sort((a, b) => b.qualityScore - a.qualityScore);

    for (const result of sortedResults) {
      const sourceTypes = result.sources.map((s) => s.type);
      const canAdd = sourceTypes.some(
        (type) => (sourceTypeCounts[type] || 0) < this.config.maxSimilarResults
      );

      if (canAdd) {
        optimized.push(result);
        sourceTypes.forEach((type) => {
          sourceTypeCounts[type] = (sourceTypeCounts[type] || 0) + 1;
        });
      }
    }

    return optimized;
  }

  /**
   * 優化主題多樣性
   */
  private optimizeTopicDiversity(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    const optimized: NormalizedSearchResult[] = [];
    const topicCounts: Record<string, number> = {};

    // 按相關性排序
    const sortedResults = [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);

    for (const result of sortedResults) {
      const topics = this.extractTopics(result.content);
      const canAdd =
        topics.length === 0 ||
        topics.some((topic) => (topicCounts[topic] || 0) < this.config.maxSimilarResults);

      if (canAdd) {
        optimized.push(result);
        topics.forEach((topic) => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    }

    return optimized;
  }

  /**
   * 優化平衡多樣性
   */
  private optimizeBalancedDiversity(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    // 結合源多樣性和主題多樣性
    const sourceDiversified = this.optimizeSourceDiversity(results);
    return this.optimizeTopicDiversity(sourceDiversified);
  }

  /**
   * MMR 多樣性優化
   */
  private optimizeMMR(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    if (results.length <= 1) return results;

    const optimized: NormalizedSearchResult[] = [];
    const remaining = [...results];

    // 選擇最高相關性的結果作為第一個
    const firstResult = remaining.reduce((best, current) =>
      current.relevanceScore > best.relevanceScore ? current : best
    );
    optimized.push(firstResult);
    remaining.splice(remaining.indexOf(firstResult), 1);

    // 迭代選擇剩餘結果
    while (remaining.length > 0 && optimized.length < results.length) {
      let bestScore = -1;
      let bestIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // 計算與已選結果的最大相似度
        const maxSimilarity = Math.max(
          ...optimized.map((selected) => this.calculateSimilarity(candidate, selected))
        );

        // MMR 分數：相關性 - λ * 最大相似度
        const lambda = 0.5; // 多樣性權重
        const mmrScore = candidate.relevanceScore - lambda * maxSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0) {
        optimized.push(remaining[bestIndex]);
        remaining.splice(bestIndex, 1);
      } else {
        break;
      }
    }

    return optimized;
  }

  /**
   * 計算兩個結果的相似度
   */
  private calculateSimilarity(
    result1: NormalizedSearchResult,
    result2: NormalizedSearchResult
  ): number {
    // 內容相似度
    const contentSimilarity = this.calculateTextSimilarity(result1.content, result2.content);

    // 源類型相似度
    const sourceSimilarity = this.calculateSourceSimilarity(result1.sources, result2.sources);

    // 主題相似度
    const topicSimilarity = this.calculateTopicSimilarity(
      this.extractTopics(result1.content),
      this.extractTopics(result2.content)
    );

    // 加權平均
    return contentSimilarity * 0.5 + sourceSimilarity * 0.3 + topicSimilarity * 0.2;
  }

  /**
   * 計算文本相似度
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * 計算源相似度
   */
  private calculateSourceSimilarity(sources1: any[], sources2: any[]): number {
    const types1 = new Set(sources1.map((s) => s.type));
    const types2 = new Set(sources2.map((s) => s.type));

    const intersection = new Set([...types1].filter((x) => types2.has(x)));
    const union = new Set([...types1, ...types2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * 計算主題相似度
   */
  private calculateTopicSimilarity(topics1: string[], topics2: string[]): number {
    const set1 = new Set(topics1);
    const set2 = new Set(topics2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * 註冊自定義多樣性策略
   */
  registerStrategy(strategy: DiversityStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * 移除多樣性策略
   */
  unregisterStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
  }

  /**
   * 獲取可用策略
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<DiversificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 獲取當前配置
   */
  getConfig(): DiversificationConfig {
    return { ...this.config };
  }

  /**
   * 獲取多樣性統計
   */
  getStats() {
    return {
      diversityThreshold: this.diversityThreshold,
      availableStrategies: this.getAvailableStrategies().length,
      config: this.getConfig(),
    };
  }
}
