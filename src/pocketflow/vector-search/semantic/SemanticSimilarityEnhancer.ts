/**
 * 語義相似度增強器
 */

import { EventEmitter } from "events";
import {
  VectorSearchResult,
  VectorSearchRequest,
  VectorSearchContext,
  SemanticEnhancementConfig,
  SemanticEnhancementMetadata,
  ContextualBoostParams,
} from "../types";

export class SemanticSimilarityEnhancer extends EventEmitter {
  private config: SemanticEnhancementConfig;
  private contextualWeights: Map<string, number> = new Map();
  private isInitialized: boolean = false;

  constructor(config: SemanticEnhancementConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化語義增強器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化上下文權重
      this.initializeContextualWeights();

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 增強搜索結果
   */
  async enhanceResults(
    results: VectorSearchResult[],
    request: VectorSearchRequest,
    context?: VectorSearchContext
  ): Promise<VectorSearchResult[]> {
    if (!this.isInitialized || results.length === 0) {
      return results;
    }

    const enhancementStartTime = Date.now();

    try {
      this.emit("enhancement_started", {
        resultCount: results.length,
        hasContext: !!context,
      });

      let enhancedResults = [...results];

      // 1. 上下文增強
      if (this.config.enableContextualBoost && context) {
        enhancedResults = await this.applyContextualBoost(enhancedResults, request, context);
      }

      // 2. 語義擴展增強
      if (this.config.enableSemanticExpansion) {
        enhancedResults = await this.applySemanticExpansion(enhancedResults, request);
      }

      // 3. 多層次語義搜索增強
      if (this.config.enableMultiLevelSearch) {
        enhancedResults = await this.applyMultiLevelEnhancement(enhancedResults, request, context);
      }

      // 4. 標準化增強分數
      enhancedResults = this.normalizeEnhancedScores(enhancedResults);

      // 5. 重新排序
      enhancedResults = this.reorderByEnhancedScore(enhancedResults);

      this.emit("enhancement_completed", {
        originalCount: results.length,
        enhancedCount: enhancedResults.length,
        processingTime: Date.now() - enhancementStartTime,
      });

      return enhancedResults;
    } catch (error) {
      this.emit("enhancement_failed", { error });
      console.warn("Semantic enhancement failed:", error);
      return results; // 返回原始結果
    }
  }

  /**
   * 應用上下文增強
   */
  private async applyContextualBoost(
    results: VectorSearchResult[],
    request: VectorSearchRequest,
    context: VectorSearchContext
  ): Promise<VectorSearchResult[]> {
    const boostParams = this.extractBoostParams(context);

    return results.map((result) => {
      const contextualScore = this.calculateContextualScore(result, boostParams);
      const boostFactor = this.calculateBoostFactor(contextualScore);

      const enhancedResult = {
        ...result,
        semanticScore: result.score * boostFactor,
        metadata: {
          ...result.metadata,
          semanticEnhancement: {
            originalScore: result.score,
            enhancedScore: result.score * boostFactor,
            contextualFactors: this.getContextualFactors(result, boostParams),
            semanticSimilarity: contextualScore,
          } as SemanticEnhancementMetadata,
        },
      };

      return enhancedResult;
    });
  }

  /**
   * 提取增強參數
   */
  private extractBoostParams(context: VectorSearchContext): ContextualBoostParams {
    return {
      userDomain: context.domain,
      recentQueries: context.previousQueries,
      userPreferences: context.userPreferences,
      sessionContext: {
        userId: context.userId,
        sessionId: context.sessionId,
      },
    };
  }

  /**
   * 計算上下文分數
   */
  private calculateContextualScore(
    result: VectorSearchResult,
    params: ContextualBoostParams
  ): number {
    let contextualScore = 0;
    let factorCount = 0;

    // 領域匹配
    if (params.userDomain) {
      const domainMatch = this.calculateDomainMatch(result, params.userDomain);
      contextualScore += domainMatch * this.config.contextualWeights.domain;
      factorCount++;
    }

    // 查詢歷史匹配
    if (params.recentQueries && params.recentQueries.length > 0) {
      const historyMatch = this.calculateHistoryMatch(result, params.recentQueries);
      contextualScore += historyMatch * this.config.contextualWeights.history;
      factorCount++;
    }

    // 用戶偏好匹配
    if (params.userPreferences) {
      const preferenceMatch = this.calculatePreferenceMatch(result, params.userPreferences);
      contextualScore += preferenceMatch * this.config.contextualWeights.preference;
      factorCount++;
    }

    // 時間因素
    const temporalScore = this.calculateTemporalScore(result);
    contextualScore += temporalScore * this.config.contextualWeights.temporal;
    factorCount++;

    return factorCount > 0 ? contextualScore / factorCount : 0;
  }

  /**
   * 計算領域匹配度
   */
  private calculateDomainMatch(result: VectorSearchResult, userDomain: string): number {
    const documentContent = result.document.pageContent.toLowerCase();
    const domainKeywords = this.getDomainKeywords(userDomain);

    let matchCount = 0;
    for (const keyword of domainKeywords) {
      if (documentContent.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    return domainKeywords.length > 0 ? matchCount / domainKeywords.length : 0;
  }

  /**
   * 計算歷史查詢匹配度
   */
  private calculateHistoryMatch(result: VectorSearchResult, recentQueries: string[]): number {
    const documentContent = result.document.pageContent.toLowerCase();
    let totalMatch = 0;

    for (const query of recentQueries.slice(0, 5)) {
      // 只考慮最近5個查詢
      const queryTerms = query.toLowerCase().split(/\s+/);
      let queryMatch = 0;

      for (const term of queryTerms) {
        if (term.length > 2 && documentContent.includes(term)) {
          queryMatch++;
        }
      }

      totalMatch += queryTerms.length > 0 ? queryMatch / queryTerms.length : 0;
    }

    return recentQueries.length > 0 ? totalMatch / Math.min(recentQueries.length, 5) : 0;
  }

  /**
   * 計算用戶偏好匹配度
   */
  private calculatePreferenceMatch(
    result: VectorSearchResult,
    preferences: Record<string, any>
  ): number {
    let preferenceScore = 0;
    let factorCount = 0;

    // 文檔類型偏好
    if (preferences.documentTypes) {
      const docType = this.extractDocumentType(result);
      const typePreference = preferences.documentTypes[docType] || 0;
      preferenceScore += typePreference;
      factorCount++;
    }

    // 內容長度偏好
    if (preferences.contentLength) {
      const lengthScore = this.calculateLengthPreference(
        result.document.pageContent.length,
        preferences.contentLength
      );
      preferenceScore += lengthScore;
      factorCount++;
    }

    // 主題偏好
    if (preferences.topics) {
      const topicScore = this.calculateTopicPreference(result, preferences.topics);
      preferenceScore += topicScore;
      factorCount++;
    }

    return factorCount > 0 ? preferenceScore / factorCount : 0;
  }

  /**
   * 計算時間分數
   */
  private calculateTemporalScore(result: VectorSearchResult): number {
    const now = Date.now();
    const docTime = result.document.metadata.mtime || result.document.metadata.ctime || now;

    // 更新時間越近分數越高
    const daysDiff = (now - docTime) / (24 * 60 * 60 * 1000);

    if (daysDiff <= 1) return 1.0;
    if (daysDiff <= 7) return 0.8;
    if (daysDiff <= 30) return 0.6;
    if (daysDiff <= 90) return 0.4;

    return 0.2;
  }

  /**
   * 計算增強因子
   */
  private calculateBoostFactor(contextualScore: number): number {
    // 將上下文分數轉換為增強因子 (0.8 - 1.5)
    const minBoost = 0.8;
    const maxBoost = 1.5;
    return minBoost + (maxBoost - minBoost) * contextualScore;
  }

  /**
   * 獲取上下文因素
   */
  private getContextualFactors(
    result: VectorSearchResult,
    params: ContextualBoostParams
  ): string[] {
    const factors: string[] = [];

    if (params.userDomain) {
      factors.push(`domain:${params.userDomain}`);
    }

    if (params.recentQueries && params.recentQueries.length > 0) {
      factors.push("recent_queries");
    }

    if (params.userPreferences) {
      factors.push("user_preferences");
    }

    factors.push("temporal_relevance");

    return factors;
  }

  /**
   * 應用語義擴展
   */
  private async applySemanticExpansion(
    results: VectorSearchResult[],
    request: VectorSearchRequest
  ): Promise<VectorSearchResult[]> {
    // 語義擴展邏輯：基於同義詞、相關概念等
    return results.map((result) => {
      const expansionScore = this.calculateSemanticExpansionScore(result, request);

      if (result.semanticScore) {
        result.semanticScore *= 1 + expansionScore * 0.1;
      } else {
        result.semanticScore = result.score * (1 + expansionScore * 0.1);
      }

      return result;
    });
  }

  /**
   * 計算語義擴展分數
   */
  private calculateSemanticExpansionScore(
    result: VectorSearchResult,
    request: VectorSearchRequest
  ): number {
    if (typeof request.query !== "string") {
      return 0;
    }

    const queryTerms = request.query.toLowerCase().split(/\s+/);
    const documentContent = result.document.pageContent.toLowerCase();

    let expansionScore = 0;

    for (const term of queryTerms) {
      if (term.length <= 2) continue;

      // 簡單的同義詞檢查
      const synonyms = this.getSynonyms(term);
      for (const synonym of synonyms) {
        if (documentContent.includes(synonym)) {
          expansionScore += 0.1;
        }
      }
    }

    return Math.min(expansionScore, 1.0);
  }

  /**
   * 應用多層次增強
   */
  private async applyMultiLevelEnhancement(
    results: VectorSearchResult[],
    request: VectorSearchRequest,
    context?: VectorSearchContext
  ): Promise<VectorSearchResult[]> {
    // 多層次語義搜索：主要、次要、三級語義匹配
    return results.map((result) => {
      const multiLevelScore = this.calculateMultiLevelScore(result, request, context);

      if (result.semanticScore) {
        result.semanticScore *= 1 + multiLevelScore * 0.05;
      } else {
        result.semanticScore = result.score * (1 + multiLevelScore * 0.05);
      }

      return result;
    });
  }

  /**
   * 計算多層次分數
   */
  private calculateMultiLevelScore(
    result: VectorSearchResult,
    request: VectorSearchRequest,
    context?: VectorSearchContext
  ): number {
    // 簡化的多層次評分
    let levelScore = 0;

    // 主要層次：直接匹配
    levelScore += this.calculateDirectMatch(result, request) * 0.6;

    // 次要層次：概念匹配
    levelScore += this.calculateConceptualMatch(result, request) * 0.3;

    // 三級層次：上下文匹配
    if (context) {
      levelScore += this.calculateContextualRelevance(result, context) * 0.1;
    }

    return Math.min(levelScore, 1.0);
  }

  /**
   * 標準化增強分數
   */
  private normalizeEnhancedScores(results: VectorSearchResult[]): VectorSearchResult[] {
    if (results.length === 0) return results;

    const semanticScores = results
      .map((r) => r.semanticScore || r.score)
      .filter((score) => score > 0);

    if (semanticScores.length === 0) return results;

    const maxScore = Math.max(...semanticScores);
    const minScore = Math.min(...semanticScores);
    const scoreRange = maxScore - minScore;

    if (scoreRange === 0) return results;

    return results.map((result) => ({
      ...result,
      normalizedScore:
        scoreRange > 0 ? ((result.semanticScore || result.score) - minScore) / scoreRange : 0.5,
    }));
  }

  /**
   * 按增強分數重新排序
   */
  private reorderByEnhancedScore(results: VectorSearchResult[]): VectorSearchResult[] {
    return results.sort((a, b) => {
      const scoreA = a.normalizedScore || a.semanticScore || a.score;
      const scoreB = b.normalizedScore || b.semanticScore || b.score;
      return scoreB - scoreA;
    });
  }

  /**
   * 初始化上下文權重
   */
  private initializeContextualWeights(): void {
    const weights = this.config.contextualWeights || {
      domain: 0.3,
      history: 0.2,
      preference: 0.2,
      temporal: 0.3,
    };

    for (const [key, weight] of Object.entries(weights)) {
      this.contextualWeights.set(key, weight);
    }
  }

  /**
   * 輔助方法
   */
  private getDomainKeywords(domain: string): string[] {
    const domainKeywords: Record<string, string[]> = {
      technology: ["tech", "software", "programming", "development", "coding"],
      science: ["research", "study", "experiment", "theory", "analysis"],
      business: ["company", "market", "strategy", "finance", "management"],
      education: ["learning", "teaching", "course", "study", "knowledge"],
    };

    return domainKeywords[domain.toLowerCase()] || [];
  }

  private getSynonyms(term: string): string[] {
    const synonyms: Record<string, string[]> = {
      good: ["excellent", "great", "fine", "nice"],
      bad: ["poor", "terrible", "awful", "horrible"],
      big: ["large", "huge", "enormous", "massive"],
      small: ["tiny", "little", "mini", "compact"],
    };

    return synonyms[term.toLowerCase()] || [];
  }

  private extractDocumentType(result: VectorSearchResult): string {
    const path = result.document.metadata.path || "";
    const extension = path.split(".").pop()?.toLowerCase() || "unknown";
    return extension;
  }

  private calculateLengthPreference(contentLength: number, preference: any): number {
    const preferredLength = preference.preferred || 1000;
    const tolerance = preference.tolerance || 0.5;

    const ratio = contentLength / preferredLength;
    if (ratio >= 1 - tolerance && ratio <= 1 + tolerance) {
      return 1.0;
    }

    return Math.max(0, 1 - Math.abs(ratio - 1));
  }

  private calculateTopicPreference(result: VectorSearchResult, topics: any): number {
    // 簡化的主題匹配
    return 0.5;
  }

  private calculateDirectMatch(result: VectorSearchResult, request: VectorSearchRequest): number {
    // 簡化的直接匹配計算
    return 0.7;
  }

  private calculateConceptualMatch(
    result: VectorSearchResult,
    request: VectorSearchRequest
  ): number {
    // 簡化的概念匹配計算
    return 0.5;
  }

  private calculateContextualRelevance(
    result: VectorSearchResult,
    context: VectorSearchContext
  ): number {
    // 簡化的上下文相關性計算
    return 0.3;
  }

  /**
   * 關閉語義增強器
   */
  async shutdown(): Promise<void> {
    this.contextualWeights.clear();
    this.isInitialized = false;
    this.emit("shutdown");
  }
}
