/**
 * PocketFlow.js Search Aggregation System - Search Result Normalizer
 * 搜索結果標準化處理器：統一不同搜索源的結果格式
 */

import {
  RawSearchResult,
  NormalizedSearchResult,
  CoreAggregationConfig,
  RelevanceFactors,
  AggregationInfo,
  QualityIndicators,
} from "../types";

export interface NormalizationStrategy {
  id: string;
  name: string;
  sourceTypes: string[];
  normalize: (result: RawSearchResult) => Promise<NormalizedSearchResult>;
}

/**
 * 搜索結果標準化處理器
 * 負責將來自不同搜索源的原始結果統一格式化
 */
export class SearchResultNormalizer {
  private strategies: Map<string, NormalizationStrategy> = new Map();

  constructor(private config: CoreAggregationConfig) {
    this.initializeDefaultStrategies();
  }

  /**
   * 標準化搜索結果
   */
  async normalize(rawResults: RawSearchResult[]): Promise<NormalizedSearchResult[]> {
    const normalizedResults: NormalizedSearchResult[] = [];

    for (const rawResult of rawResults) {
      try {
        const normalizedResult = await this.normalizeResult(rawResult);
        normalizedResults.push(normalizedResult);
      } catch (error) {
        console.warn(`標準化結果失敗 (ID: ${rawResult.id}):`, error);
        // 使用默認標準化策略
        const fallbackResult = await this.createFallbackResult(rawResult);
        normalizedResults.push(fallbackResult);
      }
    }

    return normalizedResults;
  }

  /**
   * 標準化單個結果
   */
  private async normalizeResult(rawResult: RawSearchResult): Promise<NormalizedSearchResult> {
    const strategy = this.getStrategyForSource(rawResult.source.type);

    if (strategy) {
      return await strategy.normalize(rawResult);
    }

    // 使用默認標準化邏輯
    return await this.defaultNormalize(rawResult);
  }

  /**
   * 默認標準化邏輯
   */
  private async defaultNormalize(rawResult: RawSearchResult): Promise<NormalizedSearchResult> {
    // 分數標準化 (0-1 範圍)
    const normalizedScore = this.normalizeScore(rawResult.score, rawResult.source.type);

    // 計算相關性分數
    const relevanceScore = this.calculateRelevanceScore(rawResult.relevanceFactors);

    // 計算質量分數
    const qualityScore = this.calculateQualityScore(rawResult);

    // 生成質量指標
    const qualityIndicators = this.generateQualityIndicators(rawResult);

    // 生成聚合信息
    const aggregationInfo = this.generateAggregationInfo(rawResult, qualityIndicators);

    return {
      id: rawResult.id,
      content: this.normalizeContent(rawResult.content),
      title: rawResult.title || this.extractTitleFromContent(rawResult.content),
      sources: [rawResult.source],
      normalizedScore,
      originalScores: { [rawResult.source.id]: rawResult.score },
      relevanceScore,
      qualityScore,
      metadata: {
        ...rawResult.metadata,
        normalizedAt: Date.now(),
        originalSource: rawResult.source.id,
      },
      timestamp: rawResult.timestamp,
      aggregationInfo,
    };
  }

  /**
   * 分數標準化
   */
  private normalizeScore(score: number, sourceType: string): number {
    // 不同源類型可能有不同的分數範圍
    switch (sourceType) {
      case "vector":
        // 向量搜索通常返回餘弦相似度 (0-1)
        return Math.max(0, Math.min(1, score));

      case "keyword":
        // 關鍵字搜索可能返回 TF-IDF 分數，需要歸一化
        return Math.max(0, Math.min(1, score / 10)); // 假設最大值為 10

      case "hybrid":
        // 混合搜索已經歸一化
        return Math.max(0, Math.min(1, score));

      case "mapreduce":
        // MapReduce 結果需要特殊處理
        return Math.max(0, Math.min(1, score));

      default:
        // 默認假設已經在 0-1 範圍內
        return Math.max(0, Math.min(1, score));
    }
  }

  /**
   * 計算相關性分數
   */
  private calculateRelevanceScore(factors?: RelevanceFactors): number {
    if (!factors) {
      return 0.5; // 默認中等相關性
    }

    // 加權平均相關性因子
    const weights = {
      textMatch: 0.3,
      semanticSimilarity: 0.25,
      contextRelevance: 0.2,
      freshness: 0.15,
      authority: 0.1,
    };

    return (
      factors.textMatch * weights.textMatch +
      factors.semanticSimilarity * weights.semanticSimilarity +
      factors.contextRelevance * weights.contextRelevance +
      factors.freshness * weights.freshness +
      factors.authority * weights.authority
    );
  }

  /**
   * 計算質量分數
   */
  private calculateQualityScore(rawResult: RawSearchResult): number {
    let qualityScore = 0.5; // 基礎分數

    // 內容長度質量
    const contentLength = rawResult.content.length;
    const lengthScore = this.calculateLengthScore(contentLength);
    qualityScore += lengthScore * 0.2;

    // 標題存在性
    if (rawResult.title && rawResult.title.trim()) {
      qualityScore += 0.1;
    }

    // 元數據豐富度
    const metadataScore = Object.keys(rawResult.metadata || {}).length / 10;
    qualityScore += Math.min(metadataScore, 0.2);

    // 源權重
    qualityScore += rawResult.source.weight * 0.1;

    // 時效性
    const freshnessScore = this.calculateFreshnessScore(rawResult.timestamp);
    qualityScore += freshnessScore * 0.1;

    return Math.max(0, Math.min(1, qualityScore));
  }

  /**
   * 計算長度分數
   */
  private calculateLengthScore(length: number): number {
    // 理想長度範圍：100-1000 字符
    if (length < 50) return 0.2;
    if (length < 100) return 0.5;
    if (length <= 1000) return 1.0;
    if (length <= 2000) return 0.8;
    return 0.6; // 太長的內容可能質量較低
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
    if (ageInDays <= 365) return 0.3;
    return 0.1;
  }

  /**
   * 生成質量指標
   */
  private generateQualityIndicators(rawResult: RawSearchResult): QualityIndicators {
    const content = rawResult.content;
    const contentLength = content.length;

    return {
      contentQuality: this.calculateLengthScore(contentLength),
      sourceReliability: rawResult.source.weight,
      relevanceConsistency: rawResult.relevanceFactors
        ? this.calculateRelevanceScore(rawResult.relevanceFactors)
        : 0.5,
      informationDensity: Math.min(1, contentLength / 500), // 每 500 字符為一個單位
      duplicateRisk: 0.1, // 初始值，後續由去重系統更新
    };
  }

  /**
   * 生成聚合信息
   */
  private generateAggregationInfo(
    rawResult: RawSearchResult,
    qualityIndicators: QualityIndicators
  ): AggregationInfo {
    return {
      totalSources: 1, // 單個結果初始為 1
      processingTime: 0, // 由聚合器設置
      confidenceLevel: (qualityIndicators.contentQuality + qualityIndicators.sourceReliability) / 2,
      qualityIndicators,
    };
  }

  /**
   * 內容標準化
   */
  private normalizeContent(content: string): string {
    return content
      .trim()
      .replace(/\s+/g, " ") // 合併多個空格
      .replace(/\n+/g, "\n") // 合併多個換行
      .substring(0, 5000); // 限制最大長度
  }

  /**
   * 從內容提取標題
   */
  private extractTitleFromContent(content: string): string {
    const lines = content.split("\n");
    const firstLine = lines[0]?.trim();

    if (firstLine && firstLine.length <= 100) {
      return firstLine;
    }

    // 取前 50 個字符作為標題
    return content.substring(0, 50).trim() + (content.length > 50 ? "..." : "");
  }

  /**
   * 創建降級結果
   */
  private async createFallbackResult(rawResult: RawSearchResult): Promise<NormalizedSearchResult> {
    return {
      id: rawResult.id,
      content: rawResult.content || "內容不可用",
      title: rawResult.title || "標題不可用",
      sources: [rawResult.source],
      normalizedScore: 0.1, // 低分數表示質量問題
      originalScores: { [rawResult.source.id]: rawResult.score },
      relevanceScore: 0.1,
      qualityScore: 0.1,
      metadata: {
        ...rawResult.metadata,
        fallback: true,
        normalizedAt: Date.now(),
      },
      timestamp: rawResult.timestamp,
      aggregationInfo: {
        totalSources: 1,
        processingTime: 0,
        confidenceLevel: 0.1,
        qualityIndicators: {
          contentQuality: 0.1,
          sourceReliability: rawResult.source.weight,
          relevanceConsistency: 0.1,
          informationDensity: 0.1,
          duplicateRisk: 0.9,
        },
      },
    };
  }

  /**
   * 獲取源類型對應的策略
   */
  private getStrategyForSource(sourceType: string): NormalizationStrategy | undefined {
    return this.strategies.get(sourceType);
  }

  /**
   * 初始化默認策略
   */
  private initializeDefaultStrategies(): void {
    // 向量搜索標準化策略
    this.strategies.set("vector", {
      id: "vector-normalizer",
      name: "Vector Search Normalizer",
      sourceTypes: ["vector"],
      normalize: async (result: RawSearchResult) => {
        return await this.defaultNormalize(result);
      },
    });

    // 關鍵字搜索標準化策略
    this.strategies.set("keyword", {
      id: "keyword-normalizer",
      name: "Keyword Search Normalizer",
      sourceTypes: ["keyword"],
      normalize: async (result: RawSearchResult) => {
        return await this.defaultNormalize(result);
      },
    });

    // 混合搜索標準化策略
    this.strategies.set("hybrid", {
      id: "hybrid-normalizer",
      name: "Hybrid Search Normalizer",
      sourceTypes: ["hybrid"],
      normalize: async (result: RawSearchResult) => {
        return await this.defaultNormalize(result);
      },
    });

    // MapReduce 搜索標準化策略
    this.strategies.set("mapreduce", {
      id: "mapreduce-normalizer",
      name: "MapReduce Search Normalizer",
      sourceTypes: ["mapreduce"],
      normalize: async (result: RawSearchResult) => {
        return await this.defaultNormalize(result);
      },
    });
  }

  /**
   * 註冊自定義標準化策略
   */
  registerStrategy(strategy: NormalizationStrategy): void {
    strategy.sourceTypes.forEach((sourceType) => {
      this.strategies.set(sourceType, strategy);
    });
  }

  /**
   * 移除標準化策略
   */
  unregisterStrategy(sourceType: string): void {
    this.strategies.delete(sourceType);
  }

  /**
   * 獲取支援的源類型
   */
  getSupportedSourceTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 獲取標準化統計
   */
  getStats() {
    return {
      supportedSourceTypes: this.getSupportedSourceTypes().length,
      registeredStrategies: this.strategies.size,
    };
  }
}
