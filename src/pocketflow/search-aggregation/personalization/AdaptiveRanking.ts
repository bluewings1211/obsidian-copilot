/**
 * PocketFlow.js Search Aggregation System - Adaptive Ranking
 * 自適應排序算法：基於用戶反饋動態調整排序策略
 */

import { NormalizedSearchResult, RankingContext, PersonalizationConfig } from "../types";

export interface AdaptiveScore {
  baseScore: number;
  learningAdjustment: number;
  feedbackAdjustment: number;
  behaviorAdjustment: number;
  finalScore: number;
  confidence: number;
}

export interface RankingFeedback {
  resultId: string;
  position: number;
  clicked: boolean;
  dwellTime: number;
  feedback: "positive" | "negative" | "neutral";
  timestamp: number;
}

export interface LearningModel {
  userId: string;
  featureWeights: Map<string, number>;
  performanceHistory: number[];
  lastUpdated: number;
  confidence: number;
}

/**
 * 自適應排序算法
 * 根據用戶反饋和行為持續學習和調整排序策略
 */
export class AdaptiveRanking {
  private learningModels: Map<string, LearningModel> = new Map();
  private feedbackHistory: Map<string, RankingFeedback[]> = new Map();
  private globalModel: LearningModel;

  constructor(private config: PersonalizationConfig) {
    this.globalModel = this.initializeGlobalModel();
  }

  /**
   * 自適應調整排序結果
   */
  async adjust(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<NormalizedSearchResult[]> {
    if (!this.config.enabled || results.length <= 1) {
      return results;
    }

    const userId = context.userContext?.userId || context.userContext?.sessionId;
    if (!userId) {
      return results;
    }

    try {
      // 1. 獲取或創建用戶學習模型
      let userModel = this.learningModels.get(userId);
      if (!userModel) {
        userModel = this.initializeUserModel(userId);
        this.learningModels.set(userId, userModel);
      }

      // 2. 計算自適應分數
      const adaptiveScores = await this.calculateAdaptiveScores(results, context, userModel);

      // 3. 重新排序
      const adjustedResults = this.rerankByAdaptiveScores(results, adaptiveScores);

      // 4. 更新學習模型
      await this.updateLearningModel(userModel, context);

      return adjustedResults;
    } catch (error) {
      console.warn("自適應排序調整失敗:", error);
      return results;
    }
  }

  /**
   * 計算自適應分數
   */
  async calculateAdaptiveScore(
    result: NormalizedSearchResult,
    context: RankingContext
  ): Promise<number> {
    const userId = context.userContext?.userId || context.userContext?.sessionId;
    if (!userId) {
      return result.normalizedScore;
    }

    const userModel = this.learningModels.get(userId) || this.globalModel;
    const adaptiveScore = await this.calculateSingleAdaptiveScore(result, context, userModel);

    return adaptiveScore.finalScore;
  }

  /**
   * 計算多個結果的自適應分數
   */
  private async calculateAdaptiveScores(
    results: NormalizedSearchResult[],
    context: RankingContext,
    userModel: LearningModel
  ): Promise<Map<string, AdaptiveScore>> {
    const scores = new Map<string, AdaptiveScore>();

    for (const result of results) {
      const adaptiveScore = await this.calculateSingleAdaptiveScore(result, context, userModel);
      scores.set(result.id, adaptiveScore);
    }

    return scores;
  }

  /**
   * 計算單個結果的自適應分數
   */
  private async calculateSingleAdaptiveScore(
    result: NormalizedSearchResult,
    context: RankingContext,
    userModel: LearningModel
  ): Promise<AdaptiveScore> {
    // 1. 基礎分數
    const baseScore = (result.relevanceScore + result.qualityScore + result.normalizedScore) / 3;

    // 2. 學習調整
    const learningAdjustment = this.calculateLearningAdjustment(result, userModel);

    // 3. 反饋調整
    const feedbackAdjustment = this.calculateFeedbackAdjustment(result, userModel.userId);

    // 4. 行為調整
    const behaviorAdjustment = this.calculateBehaviorAdjustment(result, context);

    // 5. 計算最終分數
    const finalScore = Math.max(
      0,
      Math.min(
        1,
        baseScore + learningAdjustment * 0.3 + feedbackAdjustment * 0.4 + behaviorAdjustment * 0.3
      )
    );

    // 6. 計算信心度
    const confidence = this.calculateAdaptiveConfidence(userModel, result);

    return {
      baseScore,
      learningAdjustment,
      feedbackAdjustment,
      behaviorAdjustment,
      finalScore,
      confidence,
    };
  }

  /**
   * 計算學習調整分數
   */
  private calculateLearningAdjustment(
    result: NormalizedSearchResult,
    userModel: LearningModel
  ): number {
    let adjustment = 0;

    // 提取結果特徵
    const features = this.extractResultFeatures(result);

    // 基於學習到的特徵權重計算調整
    for (const [feature, value] of features) {
      const weight = userModel.featureWeights.get(feature) || 0;
      adjustment += value * weight;
    }

    // 標準化調整值
    return Math.max(-0.3, Math.min(0.3, adjustment));
  }

  /**
   * 計算反饋調整分數
   */
  private calculateFeedbackAdjustment(result: NormalizedSearchResult, userId: string): number {
    const feedbacks = this.feedbackHistory.get(userId) || [];

    // 尋找相似結果的反饋
    const relevantFeedbacks = feedbacks.filter((feedback) =>
      this.areResultsSimilar(result, feedback)
    );

    if (relevantFeedbacks.length === 0) {
      return 0;
    }

    // 計算加權反饋分數
    let feedbackScore = 0;
    let totalWeight = 0;

    for (const feedback of relevantFeedbacks) {
      // 時間衰減權重
      const ageInDays = (Date.now() - feedback.timestamp) / (1000 * 60 * 60 * 24);
      const timeWeight = Math.exp(-ageInDays / 30); // 30天半衰期

      // 反饋分數
      let score = 0;
      switch (feedback.feedback) {
        case "positive":
          score = 0.3;
          break;
        case "negative":
          score = -0.3;
          break;
        default:
          score = 0;
          break;
      }

      // 點擊和停留時間獎勵
      if (feedback.clicked) score += 0.1;
      if (feedback.dwellTime > 30000) score += 0.1; // 30秒以上

      feedbackScore += score * timeWeight;
      totalWeight += timeWeight;
    }

    return totalWeight > 0 ? feedbackScore / totalWeight : 0;
  }

  /**
   * 計算行為調整分數
   */
  private calculateBehaviorAdjustment(
    result: NormalizedSearchResult,
    context: RankingContext
  ): number {
    if (!context.userContext?.behavior) {
      return 0;
    }

    let adjustment = 0;
    const behavior = context.userContext.behavior;

    // 基於搜索歷史調整
    if (behavior.searchHistory.length > 0) {
      const queryAlignment = this.calculateQueryAlignment(result, behavior.searchHistory);
      adjustment += queryAlignment * 0.1;
    }

    // 基於點擊模式調整
    if (behavior.clickPatterns.length > 0) {
      const clickAlignment = this.calculateClickAlignment(result, behavior.clickPatterns);
      adjustment += clickAlignment * 0.1;
    }

    // 基於停留時間調整
    if (behavior.dwellTime.length > 0) {
      const dwellAlignment = this.calculateDwellAlignment(result, behavior.dwellTime);
      adjustment += dwellAlignment * 0.1;
    }

    return Math.max(-0.2, Math.min(0.2, adjustment));
  }

  /**
   * 根據自適應分數重新排序
   */
  private rerankByAdaptiveScores(
    results: NormalizedSearchResult[],
    adaptiveScores: Map<string, AdaptiveScore>
  ): NormalizedSearchResult[] {
    return results
      .map((result) => ({
        result,
        adaptiveScore: adaptiveScores.get(result.id)!,
      }))
      .sort((a, b) => b.adaptiveScore.finalScore - a.adaptiveScore.finalScore)
      .map((item) => ({
        ...item.result,
        metadata: {
          ...item.result.metadata,
          adaptiveRanking: {
            originalScore: item.adaptiveScore.baseScore,
            adjustedScore: item.adaptiveScore.finalScore,
            learningAdjustment: item.adaptiveScore.learningAdjustment,
            feedbackAdjustment: item.adaptiveScore.feedbackAdjustment,
            behaviorAdjustment: item.adaptiveScore.behaviorAdjustment,
            confidence: item.adaptiveScore.confidence,
            timestamp: Date.now(),
          },
        },
      }));
  }

  /**
   * 更新學習模型
   */
  private async updateLearningModel(
    userModel: LearningModel,
    context: RankingContext
  ): Promise<void> {
    // 簡化的模型更新邏輯
    // 實際應用中會使用更複雜的機器學習算法

    const learningRate = this.config.adaptationRate || 0.1;

    // 基於會話反饋更新權重
    if (context.sessionHistory && context.sessionHistory.length > 0) {
      const recentSession = context.sessionHistory[context.sessionHistory.length - 1];
      const sessionSatisfaction = recentSession.satisfaction || 0.5;

      // 更新性能歷史
      userModel.performanceHistory.push(sessionSatisfaction);
      if (userModel.performanceHistory.length > 100) {
        userModel.performanceHistory.shift();
      }

      // 基於性能調整特徵權重
      const performanceTrend = this.calculatePerformanceTrend(userModel.performanceHistory);
      this.adjustFeatureWeights(userModel, performanceTrend, learningRate);
    }

    userModel.lastUpdated = Date.now();
    userModel.confidence = this.calculateModelConfidence(userModel);
  }

  /**
   * 記錄排序反饋
   */
  recordFeedback(userId: string, feedback: RankingFeedback): void {
    if (!this.feedbackHistory.has(userId)) {
      this.feedbackHistory.set(userId, []);
    }

    const userFeedbacks = this.feedbackHistory.get(userId)!;
    userFeedbacks.push(feedback);

    // 限制反饋歷史長度
    const maxFeedbacks = this.config.historyDepth || 1000;
    if (userFeedbacks.length > maxFeedbacks) {
      userFeedbacks.shift();
    }
  }

  // ==================== 輔助方法 ====================

  /**
   * 初始化全局模型
   */
  private initializeGlobalModel(): LearningModel {
    return {
      userId: "global",
      featureWeights: new Map([
        ["content_length", 0.1],
        ["source_authority", 0.2],
        ["freshness", 0.15],
        ["topic_match", 0.25],
        ["format_preference", 0.1],
        ["complexity", 0.1],
        ["engagement_potential", 0.1],
      ]),
      performanceHistory: [0.7], // 初始性能基線
      lastUpdated: Date.now(),
      confidence: 0.5,
    };
  }

  /**
   * 初始化用戶模型
   */
  private initializeUserModel(userId: string): LearningModel {
    return {
      userId,
      featureWeights: new Map(this.globalModel.featureWeights),
      performanceHistory: [0.6], // 新用戶較低基線
      lastUpdated: Date.now(),
      confidence: 0.3,
    };
  }

  /**
   * 提取結果特徵
   */
  private extractResultFeatures(result: NormalizedSearchResult): Map<string, number> {
    const features = new Map<string, number>();

    // 內容長度特徵
    features.set("content_length", Math.min(result.content.length / 1000, 1.0));

    // 來源權威性特徵
    const avgAuthority =
      result.sources.reduce((sum, source) => sum + source.weight, 0) / result.sources.length;
    features.set("source_authority", avgAuthority);

    // 時效性特徵
    const ageInDays = (Date.now() - result.timestamp) / (1000 * 60 * 60 * 24);
    features.set("freshness", Math.max(0, 1 - ageInDays / 365)); // 一年內的時效性

    // 主題匹配特徵
    features.set("topic_match", result.relevanceScore);

    // 格式偏好特徵
    const hasCode = result.content.includes("```") ? 1 : 0;
    features.set("format_preference", hasCode);

    // 複雜度特徵
    const complexity = this.calculateContentComplexity(result.content);
    features.set("complexity", complexity);

    // 參與潛力特徵
    const engagementPotential = (result.qualityScore + result.relevanceScore) / 2;
    features.set("engagement_potential", engagementPotential);

    return features;
  }

  /**
   * 判斷結果相似性
   */
  private areResultsSimilar(result: NormalizedSearchResult, feedback: RankingFeedback): boolean {
    // 簡化的相似性檢查
    return result.id === feedback.resultId;
  }

  /**
   * 計算查詢對齊度
   */
  private calculateQueryAlignment(result: NormalizedSearchResult, searchHistory: any[]): number {
    // 簡化實現
    return 0.1;
  }

  /**
   * 計算點擊對齊度
   */
  private calculateClickAlignment(result: NormalizedSearchResult, clickPatterns: any[]): number {
    // 簡化實現
    return 0.1;
  }

  /**
   * 計算停留時間對齊度
   */
  private calculateDwellAlignment(result: NormalizedSearchResult, dwellTime: any[]): number {
    // 簡化實現
    return 0.1;
  }

  /**
   * 計算內容複雜度
   */
  private calculateContentComplexity(content: string): number {
    const words = content.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    return Math.min(avgWordLength / 10, 1.0);
  }

  /**
   * 計算自適應信心度
   */
  private calculateAdaptiveConfidence(
    userModel: LearningModel,
    result: NormalizedSearchResult
  ): number {
    // 基於模型信心度和結果特徵的綜合信心度
    const modelConfidence = userModel.confidence;
    const resultConfidence = (result.qualityScore + result.relevanceScore) / 2;

    return (modelConfidence + resultConfidence) / 2;
  }

  /**
   * 計算性能趨勢
   */
  private calculatePerformanceTrend(performanceHistory: number[]): number {
    if (performanceHistory.length < 2) return 0;

    const recent = performanceHistory.slice(-5); // 最近5次
    const older = performanceHistory.slice(-10, -5); // 之前5次

    const recentAvg = recent.reduce((sum, perf) => sum + perf, 0) / recent.length;
    const olderAvg =
      older.length > 0 ? older.reduce((sum, perf) => sum + perf, 0) / older.length : recentAvg;

    return recentAvg - olderAvg; // 正值表示改善，負值表示惡化
  }

  /**
   * 調整特徵權重
   */
  private adjustFeatureWeights(
    userModel: LearningModel,
    performanceTrend: number,
    learningRate: number
  ): void {
    // 基於性能趨勢調整權重
    const adjustment = performanceTrend * learningRate;

    for (const [feature, weight] of userModel.featureWeights) {
      const newWeight = Math.max(0, Math.min(1, weight + adjustment * 0.1));
      userModel.featureWeights.set(feature, newWeight);
    }
  }

  /**
   * 計算模型信心度
   */
  private calculateModelConfidence(userModel: LearningModel): number {
    const dataPoints = userModel.performanceHistory.length;
    const stability = this.calculateStability(userModel.performanceHistory);

    // 基於數據量和穩定性計算信心度
    const dataConfidence = Math.min(dataPoints / 50, 1.0); // 50個數據點達到滿信心
    const stabilityConfidence = stability;

    return (dataConfidence + stabilityConfidence) / 2;
  }

  /**
   * 計算穩定性
   */
  private calculateStability(performanceHistory: number[]): number {
    if (performanceHistory.length < 2) return 0.5;

    const mean =
      performanceHistory.reduce((sum, perf) => sum + perf, 0) / performanceHistory.length;
    const variance =
      performanceHistory.reduce((sum, perf) => sum + Math.pow(perf - mean, 2), 0) /
      performanceHistory.length;

    // 方差越小，穩定性越高
    return Math.max(0, 1 - variance);
  }

  /**
   * 獲取用戶學習模型
   */
  getUserModel(userId: string): LearningModel | null {
    return this.learningModels.get(userId) || null;
  }

  /**
   * 獲取用戶反饋歷史
   */
  getUserFeedbackHistory(userId: string): RankingFeedback[] {
    return this.feedbackHistory.get(userId) || [];
  }

  /**
   * 清理過期數據
   */
  cleanup(): void {
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90天
    const cutoff = Date.now() - maxAge;

    // 清理過期的學習模型
    for (const [userId, model] of this.learningModels.entries()) {
      if (model.lastUpdated < cutoff) {
        this.learningModels.delete(userId);
        this.feedbackHistory.delete(userId);
      }
    }
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      learnedUsers: this.learningModels.size,
      totalFeedbacks: Array.from(this.feedbackHistory.values()).reduce(
        (sum, feedbacks) => sum + feedbacks.length,
        0
      ),
      avgModelConfidence:
        Array.from(this.learningModels.values()).reduce((sum, model) => sum + model.confidence, 0) /
        this.learningModels.size,
      globalModelConfidence: this.globalModel.confidence,
    };
  }
}
