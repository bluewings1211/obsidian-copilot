/**
 * PocketFlow.js Search Aggregation System - Contextual Reranker
 * 上下文重排序器：根據用戶上下文和搜索歷史進行重排序
 */

import {
  NormalizedSearchResult,
  RankingContext,
  UserContext,
  SearchHistory,
  SearchIntent,
} from "../types";

export interface ContextualScore {
  baseScore: number;
  userContextScore: number;
  sessionContextScore: number;
  intentAlignmentScore: number;
  historicalPreferenceScore: number;
  finalScore: number;
  explanation: string[];
}

export interface RerankingStrategy {
  id: string;
  name: string;
  description: string;
  weight: number;
  score: (result: NormalizedSearchResult, context: RankingContext) => Promise<number>;
}

export interface ContextualWeights {
  userContext: number;
  sessionContext: number;
  intentAlignment: number;
  historicalPreference: number;
  baseRelevance: number;
}

/**
 * 上下文重排序器
 * 根據用戶個人化信息和搜索上下文對結果進行重新排序
 */
export class ContextualReranker {
  private strategies: Map<string, RerankingStrategy> = new Map();
  private defaultWeights: ContextualWeights = {
    userContext: 0.25,
    sessionContext: 0.2,
    intentAlignment: 0.2,
    historicalPreference: 0.15,
    baseRelevance: 0.2,
  };

  constructor(
    private contextWeight: number = 0.3,
    private weights: Partial<ContextualWeights> = {}
  ) {
    this.weights = { ...this.defaultWeights, ...weights };
    this.initializeStrategies();
  }

  /**
   * 上下文重排序
   */
  async rerank(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<NormalizedSearchResult[]> {
    if (results.length <= 1 || !context.userContext) {
      return results;
    }

    try {
      // 1. 計算每個結果的上下文分數
      const contextualScores = await this.calculateContextualScores(results, context);

      // 2. 重新排序
      const rerankedResults = this.rerankByContextualScores(results, contextualScores);

      // 3. 添加重排序元數據
      return this.addRerankingMetadata(rerankedResults, contextualScores, context);
    } catch (error) {
      console.warn("上下文重排序失敗:", error);
      return results;
    }
  }

  /**
   * 計算上下文分數
   */
  private async calculateContextualScores(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<Map<string, ContextualScore>> {
    const scores = new Map<string, ContextualScore>();

    for (const result of results) {
      try {
        const contextualScore = await this.calculateSingleContextualScore(result, context);
        scores.set(result.id, contextualScore);
      } catch (error) {
        console.warn(`計算上下文分數失敗 (ID: ${result.id}):`, error);
        scores.set(result.id, this.getDefaultContextualScore(result));
      }
    }

    return scores;
  }

  /**
   * 計算單個結果的上下文分數
   */
  private async calculateSingleContextualScore(
    result: NormalizedSearchResult,
    context: RankingContext
  ): Promise<ContextualScore> {
    const explanation: string[] = [];

    // 1. 基礎分數
    const baseScore = (result.relevanceScore + result.qualityScore + result.normalizedScore) / 3;
    explanation.push(`基礎分數: ${baseScore.toFixed(3)}`);

    // 2. 用戶上下文分數
    const userContextScore = context.userContext
      ? await this.calculateUserContextScore(result, context.userContext)
      : 0.5;
    explanation.push(`用戶上下文: ${userContextScore.toFixed(3)}`);

    // 3. 會話上下文分數
    const sessionContextScore = context.sessionHistory
      ? this.calculateSessionContextScore(result, context.sessionHistory)
      : 0.5;
    explanation.push(`會話上下文: ${sessionContextScore.toFixed(3)}`);

    // 4. 意圖對齊分數
    const intentAlignmentScore = this.calculateIntentAlignmentScore(result, context.searchIntent);
    explanation.push(`意圖對齊: ${intentAlignmentScore.toFixed(3)}`);

    // 5. 歷史偏好分數
    const historicalPreferenceScore = context.userContext?.behavior
      ? this.calculateHistoricalPreferenceScore(result, context.userContext.behavior)
      : 0.5;
    explanation.push(`歷史偏好: ${historicalPreferenceScore.toFixed(3)}`);

    // 6. 加權計算最終分數
    const finalScore =
      baseScore * (this.weights.baseRelevance || 0.2) +
      userContextScore * (this.weights.userContext || 0.25) +
      sessionContextScore * (this.weights.sessionContext || 0.2) +
      intentAlignmentScore * (this.weights.intentAlignment || 0.2) +
      historicalPreferenceScore * (this.weights.historicalPreference || 0.15);

    explanation.push(`最終分數: ${finalScore.toFixed(3)}`);

    return {
      baseScore,
      userContextScore,
      sessionContextScore,
      intentAlignmentScore,
      historicalPreferenceScore,
      finalScore,
      explanation,
    };
  }

  /**
   * 計算用戶上下文分數
   */
  private async calculateUserContextScore(
    result: NormalizedSearchResult,
    userContext: UserContext
  ): Promise<number> {
    let score = 0.5; // 基礎分數

    // 1. 偏好匹配
    score += this.calculatePreferenceMatch(result, userContext.preferences) * 0.4;

    // 2. 用戶檔案匹配
    score += this.calculateProfileMatch(result, userContext.profile) * 0.3;

    // 3. 行為模式匹配
    score += this.calculateBehaviorMatch(result, userContext.behavior) * 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * 計算偏好匹配分數
   */
  private calculatePreferenceMatch(result: NormalizedSearchResult, preferences: any): number {
    let score = 0;
    let factors = 0;

    // 內容類型偏好
    if (preferences.contentTypes && preferences.contentTypes.length > 0) {
      const resultContentType = this.inferContentType(result.content);
      if (preferences.contentTypes.includes(resultContentType)) {
        score += 0.3;
      }
      factors++;
    }

    // 主題偏好
    if (preferences.topics && preferences.topics.length > 0) {
      const resultTopics = this.extractTopics(result.content);
      const matchingTopics = preferences.topics.filter((topic: string) =>
        resultTopics.some((rTopic) => rTopic.toLowerCase().includes(topic.toLowerCase()))
      );
      score += (matchingTopics.length / preferences.topics.length) * 0.3;
      factors++;
    }

    // 來源偏好
    if (preferences.sources && preferences.sources.length > 0) {
      const resultSources = result.sources.map((s) => s.id);
      const matchingSources = preferences.sources.filter((source: string) =>
        resultSources.includes(source)
      );
      score += (matchingSources.length / preferences.sources.length) * 0.2;
      factors++;
    }

    // 時效性偏好
    if (preferences.recency) {
      const freshnessScore = this.calculateFreshnessScore(result.timestamp);
      switch (preferences.recency) {
        case "latest":
          score += freshnessScore * 0.2;
          break;
        case "recent":
          score += freshnessScore > 0.7 ? 0.2 : 0.1;
          break;
        default:
          score += 0.1;
      }
      factors++;
    }

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * 計算用戶檔案匹配分數
   */
  private calculateProfileMatch(result: NormalizedSearchResult, profile: any): number {
    let score = 0.5;

    // 專業領域匹配
    if (profile.domains && profile.domains.length > 0) {
      const resultTopics = this.extractTopics(result.content);
      const domainMatch = profile.domains.some((domain: string) =>
        resultTopics.some((topic) => topic.toLowerCase().includes(domain.toLowerCase()))
      );
      if (domainMatch) score += 0.2;
    }

    // 興趣匹配
    if (profile.interests && profile.interests.length > 0) {
      const content = result.content.toLowerCase();
      const interestMatches = profile.interests.filter((interest: string) =>
        content.includes(interest.toLowerCase())
      );
      score += (interestMatches.length / profile.interests.length) * 0.2;
    }

    // 專業程度匹配
    if (profile.expertiseLevel) {
      const complexity = this.assessContentComplexity(result.content);
      switch (profile.expertiseLevel) {
        case "beginner":
          score += complexity < 0.5 ? 0.1 : 0;
          break;
        case "intermediate":
          score += complexity >= 0.3 && complexity <= 0.7 ? 0.1 : 0;
          break;
        case "expert":
          score += complexity > 0.5 ? 0.1 : 0;
          break;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算行為模式匹配分數
   */
  private calculateBehaviorMatch(result: NormalizedSearchResult, behavior: any): number {
    let score = 0.5;

    // 搜索歷史匹配
    if (behavior.searchHistory && behavior.searchHistory.length > 0) {
      const similarQueries = behavior.searchHistory.filter((history: SearchHistory) =>
        this.isQuerySimilar(history.query, result.content)
      );
      score += Math.min(similarQueries.length / 10, 0.2); // 最多貢獻 0.2
    }

    // 點擊模式匹配
    if (behavior.clickPatterns && behavior.clickPatterns.length > 0) {
      const avgDwellTime =
        behavior.clickPatterns.reduce((sum: number, pattern: any) => sum + pattern.dwellTime, 0) /
        behavior.clickPatterns.length;

      if (avgDwellTime > 30000) {
        // 30秒以上停留時間表示深度閱讀偏好
        const complexity = this.assessContentComplexity(result.content);
        score += complexity * 0.15;
      }
    }

    // 反饋歷史匹配
    if (behavior.feedbackHistory && behavior.feedbackHistory.length > 0) {
      const positiveFeeback = behavior.feedbackHistory.filter(
        (feedback: any) => feedback.feedback === "positive"
      );
      if (positiveFeeback.length > 0) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算會話上下文分數
   */
  private calculateSessionContextScore(
    result: NormalizedSearchResult,
    sessionHistory: any[]
  ): number {
    if (sessionHistory.length === 0) return 0.5;

    let score = 0.5;

    // 分析會話中的查詢模式
    const recentQueries = sessionHistory.slice(-3); // 最近3個查詢
    const queryTerms = recentQueries.flatMap((session) =>
      session.queries.flatMap((query: string) => query.toLowerCase().split(/\s+/))
    );

    // 計算與當前結果的相關性
    const resultTerms = result.content.toLowerCase().split(/\s+/);
    const matchingTerms = queryTerms.filter((term) =>
      resultTerms.some((rTerm) => rTerm.includes(term) || term.includes(rTerm))
    );

    score += Math.min(matchingTerms.length / queryTerms.length, 0.3);

    // 考慮會話滿意度
    const avgSatisfaction =
      recentQueries.reduce((sum, session) => sum + (session.satisfaction || 0.5), 0) /
      recentQueries.length;

    score += (avgSatisfaction - 0.5) * 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * 計算意圖對齊分數
   */
  private calculateIntentAlignmentScore(
    result: NormalizedSearchResult,
    intent: SearchIntent
  ): number {
    let score = 0.5;

    // 根據搜索意圖類型調整分數
    switch (intent.type) {
      case "informational":
        if (result.content.length > 300) score += 0.2;
        if (this.hasInformationalIndicators(result.content)) score += 0.2;
        break;

      case "navigational":
        if (result.title && result.title.length > 0) score += 0.3;
        if (this.hasNavigationalIndicators(result.content)) score += 0.1;
        break;

      case "transactional":
        if (this.hasTransactionalIndicators(result.content)) score += 0.4;
        break;

      case "exploratory":
        score += 0.1; // 探索性查詢對所有結果都相對寬容
        break;
    }

    // 考慮意圖信心度
    score = score * intent.confidence + 0.5 * (1 - intent.confidence);

    // 考慮緊急性
    if (intent.urgency === "high") {
      const freshness = this.calculateFreshnessScore(result.timestamp);
      score += freshness * 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算歷史偏好分數
   */
  private calculateHistoricalPreferenceScore(
    result: NormalizedSearchResult,
    behavior: any
  ): number {
    // 這裡重用行為匹配的邏輯，但權重不同
    return this.calculateBehaviorMatch(result, behavior);
  }

  /**
   * 根據上下文分數重排序
   */
  private rerankByContextualScores(
    results: NormalizedSearchResult[],
    contextualScores: Map<string, ContextualScore>
  ): NormalizedSearchResult[] {
    return results
      .map((result) => ({
        result,
        contextualScore: contextualScores.get(result.id)!,
      }))
      .sort((a, b) => b.contextualScore.finalScore - a.contextualScore.finalScore)
      .map((item) => item.result);
  }

  /**
   * 添加重排序元數據
   */
  private addRerankingMetadata(
    results: NormalizedSearchResult[],
    contextualScores: Map<string, ContextualScore>,
    context: RankingContext
  ): NormalizedSearchResult[] {
    return results.map((result, index) => {
      const contextualScore = contextualScores.get(result.id)!;

      return {
        ...result,
        metadata: {
          ...result.metadata,
          contextualReranking: {
            originalPosition: results.findIndex((r) => r.id === result.id),
            newPosition: index,
            contextualScore: contextualScore.finalScore,
            explanation: contextualScore.explanation,
            rerankingTimestamp: Date.now(),
          },
        },
      };
    });
  }

  // ==================== 輔助方法 ====================

  /**
   * 推斷內容類型
   */
  private inferContentType(content: string): string {
    if (content.includes("```") || /function|class|def\s/.test(content)) return "code";
    if (content.includes("?") && content.split("?").length > 3) return "faq";
    if (content.length > 2000) return "article";
    if (content.length < 200) return "snippet";
    return "text";
  }

  /**
   * 提取主題
   */
  private extractTopics(content: string): string[] {
    const topicKeywords = {
      technology: ["computer", "software", "programming", "AI", "machine learning"],
      science: ["research", "study", "analysis", "experiment", "theory"],
      business: ["company", "market", "business", "industry", "finance"],
      health: ["health", "medical", "treatment", "disease", "medicine"],
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
   * 計算時效性分數
   */
  private calculateFreshnessScore(timestamp: number): number {
    const now = Date.now();
    const ageInDays = (now - timestamp) / (1000 * 60 * 60 * 24);

    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 7) return 0.8;
    if (ageInDays <= 30) return 0.6;
    if (ageInDays <= 90) return 0.4;
    return 0.2;
  }

  /**
   * 評估內容複雜度
   */
  private assessContentComplexity(content: string): number {
    let complexity = 0.5;

    // 詞彙複雜度
    const words = content.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    complexity += Math.min((avgWordLength - 4) / 10, 0.2);

    // 句子複雜度
    const sentences = content.split(/[.!?]+/);
    const avgSentenceLength = words.length / sentences.length;
    complexity += Math.min((avgSentenceLength - 10) / 30, 0.2);

    // 專業術語
    const technicalTerms = content.match(/[A-Z]{2,}|[a-z]+(?:[A-Z][a-z]*)+/g) || [];
    complexity += Math.min(technicalTerms.length / words.length, 0.1);

    return Math.min(complexity, 1.0);
  }

  /**
   * 判斷查詢相似性
   */
  private isQuerySimilar(query1: string, query2: string): boolean {
    const terms1 = query1.toLowerCase().split(/\s+/);
    const terms2 = query2.toLowerCase().split(/\s+/);

    const intersection = terms1.filter((term) =>
      terms2.some((t) => t.includes(term) || term.includes(t))
    );

    return intersection.length / Math.max(terms1.length, terms2.length) > 0.3;
  }

  /**
   * 檢查信息性指標
   */
  private hasInformationalIndicators(content: string): boolean {
    const indicators = ["what", "how", "why", "when", "where", "definition", "explain"];
    const contentLower = content.toLowerCase();
    return indicators.some((indicator) => contentLower.includes(indicator));
  }

  /**
   * 檢查導航性指標
   */
  private hasNavigationalIndicators(content: string): boolean {
    const indicators = ["official", "homepage", "website", "login", "download"];
    const contentLower = content.toLowerCase();
    return indicators.some((indicator) => contentLower.includes(indicator));
  }

  /**
   * 檢查交易性指標
   */
  private hasTransactionalIndicators(content: string): boolean {
    const indicators = ["buy", "purchase", "order", "price", "cost", "payment", "shop"];
    const contentLower = content.toLowerCase();
    return indicators.some((indicator) => contentLower.includes(indicator));
  }

  /**
   * 獲取默認上下文分數
   */
  private getDefaultContextualScore(result: NormalizedSearchResult): ContextualScore {
    const baseScore = (result.relevanceScore + result.qualityScore + result.normalizedScore) / 3;

    return {
      baseScore,
      userContextScore: 0.5,
      sessionContextScore: 0.5,
      intentAlignmentScore: 0.5,
      historicalPreferenceScore: 0.5,
      finalScore: baseScore,
      explanation: ["使用默認分數"],
    };
  }

  /**
   * 初始化重排序策略
   */
  private initializeStrategies(): void {
    // 個人化重排序策略
    this.strategies.set("personalization", {
      id: "personalization",
      name: "Personalization Strategy",
      description: "基於用戶偏好的個人化重排序",
      weight: 0.4,
      score: async (result, context) => {
        return context.userContext
          ? await this.calculateUserContextScore(result, context.userContext)
          : 0.5;
      },
    });

    // 會話感知重排序策略
    this.strategies.set("session-aware", {
      id: "session-aware",
      name: "Session-Aware Strategy",
      description: "基於會話上下文的重排序",
      weight: 0.3,
      score: async (result, context) => {
        return context.sessionHistory
          ? this.calculateSessionContextScore(result, context.sessionHistory)
          : 0.5;
      },
    });

    // 意圖對齊重排序策略
    this.strategies.set("intent-alignment", {
      id: "intent-alignment",
      name: "Intent Alignment Strategy",
      description: "基於搜索意圖的重排序",
      weight: 0.3,
      score: async (result, context) => {
        return this.calculateIntentAlignmentScore(result, context.searchIntent);
      },
    });
  }

  /**
   * 註冊自定義重排序策略
   */
  registerStrategy(strategy: RerankingStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * 移除重排序策略
   */
  unregisterStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
  }

  /**
   * 更新權重
   */
  updateWeights(newWeights: Partial<ContextualWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      contextWeight: this.contextWeight,
      weights: this.weights,
      availableStrategies: Array.from(this.strategies.keys()),
    };
  }
}
