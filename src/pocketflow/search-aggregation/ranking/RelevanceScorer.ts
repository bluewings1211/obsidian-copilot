/**
 * PocketFlow.js Search Aggregation System - Relevance Scorer
 * 相關性評分器：計算搜索結果與查詢的相關性分數
 */

import { NormalizedSearchResult, RankingContext } from "../types";

export interface RelevanceAnalysis {
  textMatchScore: number;
  semanticSimilarityScore: number;
  contextRelevanceScore: number;
  entityMatchScore: number;
  topicAlignmentScore: number;
  overallRelevanceScore: number;
  confidence: number;
}

export interface ScoringWeights {
  textMatch: number;
  semanticSimilarity: number;
  contextRelevance: number;
  entityMatch: number;
  topicAlignment: number;
}

/**
 * 相關性評分器
 * 負責計算搜索結果與查詢的多維度相關性分數
 */
export class RelevanceScorer {
  private defaultWeights: ScoringWeights = {
    textMatch: 0.3,
    semanticSimilarity: 0.25,
    contextRelevance: 0.2,
    entityMatch: 0.15,
    topicAlignment: 0.1,
  };

  private stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
  ]);

  constructor(
    private weights: ScoringWeights = {
      textMatch: 0.3,
      semanticSimilarity: 0.25,
      contextRelevance: 0.2,
      entityMatch: 0.15,
      topicAlignment: 0.1,
    }
  ) {
    this.weights = { ...this.defaultWeights, ...weights };
  }

  /**
   * 計算相關性分數
   */
  async score(result: NormalizedSearchResult, context: RankingContext): Promise<RelevanceAnalysis> {
    const query = context.query;
    const content = result.content;
    const title = result.title || "";

    // 1. 文本匹配分數
    const textMatchScore = this.calculateTextMatch(query, content, title);

    // 2. 語義相似性分數
    const semanticSimilarityScore = this.calculateSemanticSimilarity(query, content);

    // 3. 上下文相關性分數
    const contextRelevanceScore = this.calculateContextRelevance(result, context);

    // 4. 實體匹配分數
    const entityMatchScore = this.calculateEntityMatch(query, content, context);

    // 5. 主題對齊分數
    const topicAlignmentScore = this.calculateTopicAlignment(content, context);

    // 6. 計算整體相關性分數
    const overallRelevanceScore = this.calculateOverallScore({
      textMatchScore,
      semanticSimilarityScore,
      contextRelevanceScore,
      entityMatchScore,
      topicAlignmentScore,
    });

    // 7. 計算信心度
    const confidence = this.calculateConfidence({
      textMatchScore,
      semanticSimilarityScore,
      contextRelevanceScore,
      entityMatchScore,
      topicAlignmentScore,
    });

    return {
      textMatchScore,
      semanticSimilarityScore,
      contextRelevanceScore,
      entityMatchScore,
      topicAlignmentScore,
      overallRelevanceScore,
      confidence,
    };
  }

  /**
   * 批量計算相關性分數
   */
  async batchScore(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<Map<string, RelevanceAnalysis>> {
    const scores = new Map<string, RelevanceAnalysis>();

    for (const result of results) {
      try {
        const analysis = await this.score(result, context);
        scores.set(result.id, analysis);
      } catch (error) {
        console.warn(`相關性評分失敗 (ID: ${result.id}):`, error);
        // 使用默認分數
        scores.set(result.id, this.getDefaultAnalysis());
      }
    }

    return scores;
  }

  /**
   * 計算文本匹配分數
   */
  private calculateTextMatch(query: string, content: string, title: string): number {
    const queryTerms = this.extractTerms(query);
    const contentTerms = this.extractTerms(content);
    const titleTerms = this.extractTerms(title);

    // TF-IDF 簡化版本
    let score = 0;
    let maxPossibleScore = 0;

    for (const term of queryTerms) {
      maxPossibleScore += 1;

      // 標題中的匹配權重更高
      const titleCount = titleTerms.filter((t) => t.includes(term) || term.includes(t)).length;
      const contentCount = contentTerms.filter((t) => t.includes(term) || term.includes(t)).length;

      // 計算詞頻分數
      const titleTF = titleCount / Math.max(titleTerms.length, 1);
      const contentTF = contentCount / Math.max(contentTerms.length, 1);

      // 標題匹配權重 3x，內容匹配權重 1x
      const termScore = titleTF * 3 + contentTF;
      score += Math.min(termScore, 1); // 限制單個詞的最大貢獻
    }

    return maxPossibleScore > 0 ? score / maxPossibleScore : 0;
  }

  /**
   * 計算語義相似性分數（簡化版）
   */
  private calculateSemanticSimilarity(query: string, content: string): number {
    // 使用簡化的語義相似性計算
    // 實際應用中可以使用詞嵌入模型

    const queryWords = this.extractTerms(query);
    const contentWords = this.extractTerms(content);

    // 計算詞彙重疊
    const intersection = queryWords.filter((word) =>
      contentWords.some((cWord) => this.areSimilarWords(word, cWord))
    );

    const union = [...new Set([...queryWords, ...contentWords])];
    const jaccardSimilarity = intersection.length / union.length;

    // 考慮同義詞和相關詞
    const synonymScore = this.calculateSynonymScore(queryWords, contentWords);

    // 結合 Jaccard 相似性和同義詞分數
    return Math.min(jaccardSimilarity * 0.7 + synonymScore * 0.3, 1.0);
  }

  /**
   * 計算上下文相關性分數
   */
  private calculateContextRelevance(
    result: NormalizedSearchResult,
    context: RankingContext
  ): number {
    let score = 0.5; // 基礎分數

    // 考慮用戶上下文
    if (context.userContext) {
      score += this.calculateUserContextMatch(result, context.userContext) * 0.3;
    }

    // 考慮搜索意圖
    score += this.calculateIntentAlignment(result, context.searchIntent) * 0.3;

    // 考慮會話歷史
    if (context.sessionHistory && context.sessionHistory.length > 0) {
      score += this.calculateSessionContextMatch(result, context.sessionHistory) * 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算實體匹配分數
   */
  private calculateEntityMatch(query: string, content: string, context: RankingContext): number {
    const queryEntities = this.extractEntities(query);
    const contentEntities = this.extractEntities(content);
    const contextEntities = context.searchIntent.entities || [];

    // 查詢實體匹配
    const queryMatches = queryEntities.filter((entity) =>
      contentEntities.some((cEntity) => this.areEntitiesMatching(entity, cEntity))
    ).length;

    // 上下文實體匹配
    const contextMatches = contextEntities.filter((entity) =>
      contentEntities.some((cEntity) => this.areEntitiesMatching(entity, cEntity))
    ).length;

    const totalEntities = Math.max(queryEntities.length + contextEntities.length, 1);
    return (queryMatches * 0.7 + contextMatches * 0.3) / totalEntities;
  }

  /**
   * 計算主題對齊分數
   */
  private calculateTopicAlignment(content: string, context: RankingContext): number {
    const contextTopics = context.searchIntent.topics || [];
    if (contextTopics.length === 0) return 0.5;

    const contentTopics = this.extractTopics(content);

    const alignedTopics = contextTopics.filter((topic) =>
      contentTopics.some((cTopic) => this.areTopicsRelated(topic, cTopic))
    ).length;

    return alignedTopics / contextTopics.length;
  }

  /**
   * 計算整體相關性分數
   */
  private calculateOverallScore(scores: {
    textMatchScore: number;
    semanticSimilarityScore: number;
    contextRelevanceScore: number;
    entityMatchScore: number;
    topicAlignmentScore: number;
  }): number {
    return (
      scores.textMatchScore * this.weights.textMatch +
      scores.semanticSimilarityScore * this.weights.semanticSimilarity +
      scores.contextRelevanceScore * this.weights.contextRelevance +
      scores.entityMatchScore * this.weights.entityMatch +
      scores.topicAlignmentScore * this.weights.topicAlignment
    );
  }

  /**
   * 計算信心度
   */
  private calculateConfidence(scores: {
    textMatchScore: number;
    semanticSimilarityScore: number;
    contextRelevanceScore: number;
    entityMatchScore: number;
    topicAlignmentScore: number;
  }): number {
    const scoreArray = Object.values(scores);
    const variance = this.calculateVariance(scoreArray);

    // 信心度與分數方差成反比
    return Math.max(0.1, 1 - variance);
  }

  // ==================== 輔助方法 ====================

  /**
   * 提取詞彙
   */
  private extractTerms(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !this.stopWords.has(term));
  }

  /**
   * 判斷詞彙相似性
   */
  private areSimilarWords(word1: string, word2: string): boolean {
    // 精確匹配
    if (word1 === word2) return true;

    // 詞幹匹配（簡化版）
    const stem1 = this.simpleStem(word1);
    const stem2 = this.simpleStem(word2);
    if (stem1 === stem2) return true;

    // 編輯距離匹配
    const editDistance = this.calculateEditDistance(word1, word2);
    const maxLength = Math.max(word1.length, word2.length);
    return editDistance / maxLength < 0.3; // 70% 相似度閾值
  }

  /**
   * 簡單詞幹提取
   */
  private simpleStem(word: string): string {
    // 移除常見後綴
    return word
      .replace(/(ing|ed|er|est|ly|s)$/, "")
      .replace(/(ies)$/, "y")
      .replace(/(ied)$/, "y");
  }

  /**
   * 計算編輯距離
   */
  private calculateEditDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 計算同義詞分數
   */
  private calculateSynonymScore(queryWords: string[], contentWords: string[]): number {
    // 簡化的同義詞檢測
    const synonymPairs = [
      ["big", "large", "huge", "massive"],
      ["small", "tiny", "little", "mini"],
      ["good", "great", "excellent", "amazing"],
      ["bad", "poor", "terrible", "awful"],
      ["fast", "quick", "rapid", "speedy"],
      ["slow", "sluggish", "gradual"],
    ];

    let matches = 0;
    const totalPossible = queryWords.length;

    for (const queryWord of queryWords) {
      for (const contentWord of contentWords) {
        for (const synonymGroup of synonymPairs) {
          if (synonymGroup.includes(queryWord) && synonymGroup.includes(contentWord)) {
            matches += 0.8; // 同義詞匹配權重低於精確匹配
            break;
          }
        }
      }
    }

    return totalPossible > 0 ? Math.min(matches / totalPossible, 1.0) : 0;
  }

  /**
   * 計算用戶上下文匹配度
   */
  private calculateUserContextMatch(result: NormalizedSearchResult, userContext: any): number {
    // 簡化的用戶上下文匹配
    let score = 0;

    // 檢查用戶偏好的內容類型
    if (userContext.preferences?.contentTypes) {
      const resultType = this.inferContentType(result.content);
      if (userContext.preferences.contentTypes.includes(resultType)) {
        score += 0.3;
      }
    }

    // 檢查用戶興趣主題
    if (userContext.profile?.interests) {
      const contentTopics = this.extractTopics(result.content);
      const matchingInterests = userContext.profile.interests.filter((interest: string) =>
        contentTopics.some((topic) => topic.toLowerCase().includes(interest.toLowerCase()))
      );
      score += (matchingInterests.length / userContext.profile.interests.length) * 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算意圖對齊度
   */
  private calculateIntentAlignment(result: NormalizedSearchResult, intent: any): number {
    let score = 0.5;

    // 根據搜索意圖類型調整分數
    switch (intent.type) {
      case "informational":
        if (result.content.length > 200) score += 0.2;
        break;
      case "navigational":
        if (result.title && result.title.length > 0) score += 0.3;
        break;
      case "transactional":
        if (this.hasTransactionalKeywords(result.content)) score += 0.3;
        break;
      case "exploratory":
        score += 0.1; // 探索性查詢對所有結果都相對友好
        break;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算會話上下文匹配度
   */
  private calculateSessionContextMatch(
    result: NormalizedSearchResult,
    sessionHistory: any[]
  ): number {
    // 簡化的會話上下文匹配
    return 0.1;
  }

  /**
   * 提取實體（簡化版）
   */
  private extractEntities(text: string): string[] {
    // 簡化的命名實體識別
    const entities: string[] = [];

    // 提取大寫開頭的詞組（可能是專有名詞）
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    entities.push(...capitalizedWords);

    // 提取數字
    const numbers = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
    entities.push(...numbers);

    return entities;
  }

  /**
   * 檢查實體匹配
   */
  private areEntitiesMatching(entity1: string, entity2: string): boolean {
    return (
      entity1.toLowerCase() === entity2.toLowerCase() ||
      entity1.toLowerCase().includes(entity2.toLowerCase()) ||
      entity2.toLowerCase().includes(entity1.toLowerCase())
    );
  }

  /**
   * 提取主題（簡化版）
   */
  private extractTopics(content: string): string[] {
    // 簡化的主題提取
    const topics: string[] = [];

    // 基於關鍵詞的主題識別
    const topicKeywords = {
      technology: ["computer", "software", "programming", "technology", "digital"],
      science: ["research", "study", "analysis", "experiment", "theory"],
      business: ["company", "market", "business", "industry", "economic"],
      health: ["health", "medical", "treatment", "disease", "medicine"],
    };

    const contentLower = content.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((keyword) => contentLower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * 檢查主題相關性
   */
  private areTopicsRelated(topic1: string, topic2: string): boolean {
    return topic1.toLowerCase() === topic2.toLowerCase();
  }

  /**
   * 推斷內容類型
   */
  private inferContentType(content: string): string {
    if (content.includes("```") || content.includes("function")) return "code";
    if (content.includes("?") && content.includes("!")) return "discussion";
    if (content.length > 1000) return "article";
    if (content.length < 200) return "snippet";
    return "text";
  }

  /**
   * 檢查交易性關鍵詞
   */
  private hasTransactionalKeywords(content: string): boolean {
    const transactionalKeywords = ["buy", "purchase", "order", "price", "cost", "payment"];
    const contentLower = content.toLowerCase();
    return transactionalKeywords.some((keyword) => contentLower.includes(keyword));
  }

  /**
   * 計算方差
   */
  private calculateVariance(scores: number[]): number {
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const squaredDiffs = scores.map((score) => Math.pow(score - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / scores.length;
  }

  /**
   * 獲取默認分析結果
   */
  private getDefaultAnalysis(): RelevanceAnalysis {
    return {
      textMatchScore: 0.5,
      semanticSimilarityScore: 0.5,
      contextRelevanceScore: 0.5,
      entityMatchScore: 0.5,
      topicAlignmentScore: 0.5,
      overallRelevanceScore: 0.5,
      confidence: 0.3,
    };
  }

  /**
   * 更新評分權重
   */
  updateWeights(newWeights: Partial<ScoringWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * 獲取當前權重
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  /**
   * 重置為默認權重
   */
  resetWeights(): void {
    this.weights = { ...this.defaultWeights };
  }
}
