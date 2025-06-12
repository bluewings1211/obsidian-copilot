/**
 * PocketFlow.js Search Aggregation System - Personalization Engine
 * 個性化引擎：基於用戶行為和偏好提供個性化搜索體驗
 */

import {
  NormalizedSearchResult,
  RankingContext,
  PersonalizationConfig,
  UserContext,
  UserBehavior,
  UserPreferences,
  UserProfile,
} from "../types";

import { UserPreferenceTracker } from "./UserPreferenceTracker";
import { BehaviorAnalyzer } from "./BehaviorAnalyzer";
import { AdaptiveRanking } from "./AdaptiveRanking";

export interface PersonalizationScore {
  baseScore: number;
  preferenceScore: number;
  behaviorScore: number;
  profileScore: number;
  adaptiveScore: number;
  finalScore: number;
  confidence: number;
  factors: PersonalizationFactors;
}

export interface PersonalizationFactors {
  contentTypeAlignment: number;
  topicInterest: number;
  sourcePreference: number;
  qualityExpectation: number;
  recencyPreference: number;
  complexityAlignment: number;
  languagePreference: number;
  formatPreference: number;
}

export interface PersonalizationStrategy {
  id: string;
  name: string;
  description: string;
  weight: number;
  personalize: (
    results: NormalizedSearchResult[],
    context: RankingContext
  ) => Promise<NormalizedSearchResult[]>;
}

/**
 * 個性化引擎
 * 負責根據用戶的個人信息、行為模式和偏好對搜索結果進行個性化處理
 */
export class PersonalizationEngine {
  private preferenceTracker: UserPreferenceTracker;
  private behaviorAnalyzer: BehaviorAnalyzer;
  private adaptiveRanking: AdaptiveRanking;

  private strategies: Map<string, PersonalizationStrategy> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();

  constructor(private config: PersonalizationConfig) {
    this.preferenceTracker = new UserPreferenceTracker(config);
    this.behaviorAnalyzer = new BehaviorAnalyzer(config);
    this.adaptiveRanking = new AdaptiveRanking(config);

    this.initializeStrategies();
  }

  /**
   * 個性化搜索結果
   */
  async personalize(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<NormalizedSearchResult[]> {
    if (!this.config.enabled || !context.userContext) {
      return results;
    }

    try {
      // 1. 更新用戶偏好和行為分析
      await this.updateUserProfile(context.userContext);

      // 2. 計算個性化分數
      const personalizationScores = await this.calculatePersonalizationScores(results, context);

      // 3. 應用個性化策略
      const personalizedResults = await this.applyPersonalizationStrategies(
        results,
        context,
        personalizationScores
      );

      // 4. 自適應調整
      const adaptiveResults = await this.adaptiveRanking.adjust(personalizedResults, context);

      // 5. 偏差校正
      const correctedResults = this.config.biasCorrection
        ? await this.correctBias(adaptiveResults, context)
        : adaptiveResults;

      // 6. 添加個性化元數據
      return this.addPersonalizationMetadata(correctedResults, personalizationScores, context);
    } catch (error) {
      console.warn("個性化處理失敗:", error);
      return results;
    }
  }

  /**
   * 更新用戶檔案
   */
  private async updateUserProfile(userContext: UserContext): Promise<void> {
    const userId = userContext.userId || userContext.sessionId;

    // 更新偏好追蹤
    await this.preferenceTracker.updatePreferences(userContext);

    // 更新行為分析
    await this.behaviorAnalyzer.analyzeBehavior(userContext.behavior);

    // 更新用戶檔案
    this.userProfiles.set(userId, userContext.profile);
  }

  /**
   * 計算個性化分數
   */
  private async calculatePersonalizationScores(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<Map<string, PersonalizationScore>> {
    const scores = new Map<string, PersonalizationScore>();

    for (const result of results) {
      try {
        const score = await this.calculateSinglePersonalizationScore(result, context);
        scores.set(result.id, score);
      } catch (error) {
        console.warn(`個性化評分失敗 (ID: ${result.id}):`, error);
        scores.set(result.id, this.getDefaultPersonalizationScore(result));
      }
    }

    return scores;
  }

  /**
   * 計算單個結果的個性化分數
   */
  private async calculateSinglePersonalizationScore(
    result: NormalizedSearchResult,
    context: RankingContext
  ): Promise<PersonalizationScore> {
    const userContext = context.userContext!;

    // 1. 基礎分數
    const baseScore = (result.relevanceScore + result.qualityScore) / 2;

    // 2. 偏好分數
    const preferenceScore = this.calculatePreferenceScore(result, userContext.preferences);

    // 3. 行為分數
    const behaviorScore = this.calculateBehaviorScore(result, userContext.behavior);

    // 4. 檔案分數
    const profileScore = this.calculateProfileScore(result, userContext.profile);

    // 5. 自適應分數
    const adaptiveScore = await this.adaptiveRanking.calculateAdaptiveScore(result, context);

    // 6. 計算個性化因子
    const factors = this.calculatePersonalizationFactors(result, userContext);

    // 7. 加權計算最終分數
    const finalScore = this.calculateWeightedScore({
      baseScore,
      preferenceScore,
      behaviorScore,
      profileScore,
      adaptiveScore,
    });

    // 8. 計算信心度
    const confidence = this.calculatePersonalizationConfidence(userContext, factors);

    return {
      baseScore,
      preferenceScore,
      behaviorScore,
      profileScore,
      adaptiveScore,
      finalScore,
      confidence,
      factors,
    };
  }

  /**
   * 計算偏好分數
   */
  private calculatePreferenceScore(
    result: NormalizedSearchResult,
    preferences: UserPreferences
  ): number {
    let score = 0.5;
    let factors = 0;

    // 內容類型偏好
    if (preferences.contentTypes.length > 0) {
      const resultContentType = this.inferContentType(result.content);
      if (preferences.contentTypes.includes(resultContentType)) {
        score += 0.2;
      }
      factors++;
    }

    // 主題偏好
    if (preferences.topics.length > 0) {
      const resultTopics = this.extractTopics(result.content);
      const matchingTopics = preferences.topics.filter((topic) =>
        resultTopics.some((rTopic) => rTopic.toLowerCase().includes(topic.toLowerCase()))
      );
      score += (matchingTopics.length / preferences.topics.length) * 0.25;
      factors++;
    }

    // 來源偏好
    if (preferences.sources.length > 0) {
      const resultSources = result.sources.map((s) => s.id);
      const matchingSources = preferences.sources.filter((source) =>
        resultSources.includes(source)
      );
      score += (matchingSources.length / preferences.sources.length) * 0.15;
      factors++;
    }

    // 語言偏好
    if (preferences.languages.length > 0) {
      const detectedLanguage = this.detectLanguage(result.content);
      if (preferences.languages.includes(detectedLanguage)) {
        score += 0.1;
      }
      factors++;
    }

    // 時效性偏好
    const freshnessScore = this.calculateFreshnessScore(result.timestamp);
    switch (preferences.recency) {
      case "latest":
        score += freshnessScore * 0.2;
        break;
      case "recent":
        score += freshnessScore > 0.5 ? 0.15 : 0.05;
        break;
      default:
        score += 0.05;
    }
    factors++;

    // 深度偏好
    const contentLength = result.content.length;
    switch (preferences.depth) {
      case "overview":
        score += contentLength < 500 ? 0.1 : 0;
        break;
      case "detailed":
        score += contentLength >= 500 && contentLength <= 2000 ? 0.1 : 0;
        break;
      case "comprehensive":
        score += contentLength > 2000 ? 0.1 : 0;
        break;
    }
    factors++;

    // 格式偏好
    const resultFormat = this.inferFormat(result.content);
    if (preferences.format === resultFormat) {
      score += 0.1;
    }
    factors++;

    return factors > 0 ? Math.min(score, 1.0) : 0.5;
  }

  /**
   * 計算行為分數
   */
  private calculateBehaviorScore(result: NormalizedSearchResult, behavior: UserBehavior): number {
    let score = 0.5;

    // 搜索歷史匹配
    if (behavior.searchHistory.length > 0) {
      const similarQueries = behavior.searchHistory.filter((history) =>
        this.isContentRelatedToQuery(result.content, history.query)
      );
      score += Math.min(similarQueries.length / 20, 0.2);
    }

    // 點擊模式分析
    if (behavior.clickPatterns.length > 0) {
      const avgPosition =
        behavior.clickPatterns.reduce((sum, pattern) => sum + pattern.position, 0) /
        behavior.clickPatterns.length;

      // 如果用戶習慣點擊靠後的結果，提升後面結果的分數
      if (avgPosition > 5) {
        score += 0.1;
      }

      // 停留時間偏好
      const avgDwellTime =
        behavior.clickPatterns.reduce((sum, pattern) => sum + pattern.dwellTime, 0) /
        behavior.clickPatterns.length;

      if (avgDwellTime > 30000) {
        // 長停留時間，偏好深度內容
        const complexity = this.assessContentComplexity(result.content);
        score += complexity * 0.15;
      }
    }

    // 反饋歷史
    if (behavior.feedbackHistory.length > 0) {
      const positiveRatio =
        behavior.feedbackHistory.filter((feedback) => feedback.feedback === "positive").length /
        behavior.feedbackHistory.length;

      score += (positiveRatio - 0.5) * 0.2;
    }

    // 交互模式
    if (behavior.interactionPatterns.length > 0) {
      const bookmarkRatio =
        behavior.interactionPatterns.filter((pattern) => pattern.type === "bookmark").length /
        behavior.interactionPatterns.length;

      if (bookmarkRatio > 0.1) {
        // 經常收藏，偏好高質量內容
        score += result.qualityScore * 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算檔案分數
   */
  private calculateProfileScore(result: NormalizedSearchResult, profile: UserProfile): number {
    let score = 0.5;

    // 專業領域匹配
    if (profile.domains.length > 0) {
      const resultTopics = this.extractTopics(result.content);
      const domainMatches = profile.domains.filter((domain) =>
        resultTopics.some((topic) => topic.toLowerCase().includes(domain.toLowerCase()))
      );
      score += (domainMatches.length / profile.domains.length) * 0.2;
    }

    // 興趣匹配
    if (profile.interests.length > 0) {
      const content = result.content.toLowerCase();
      const interestMatches = profile.interests.filter((interest) =>
        content.includes(interest.toLowerCase())
      );
      score += (interestMatches.length / profile.interests.length) * 0.2;
    }

    // 專業程度匹配
    const complexity = this.assessContentComplexity(result.content);
    switch (profile.expertiseLevel) {
      case "beginner":
        score += complexity < 0.4 ? 0.15 : 0;
        break;
      case "intermediate":
        score += complexity >= 0.3 && complexity <= 0.7 ? 0.15 : 0;
        break;
      case "expert":
        score += complexity > 0.6 ? 0.15 : 0;
        break;
    }

    // 學習風格匹配
    const hasVisualElements = this.hasVisualElements(result.content);
    const isInteractive = this.isInteractiveContent(result.content);

    switch (profile.learningStyle) {
      case "visual":
        if (hasVisualElements) score += 0.1;
        break;
      case "textual":
        if (!hasVisualElements && result.content.length > 200) score += 0.1;
        break;
      case "interactive":
        if (isInteractive) score += 0.1;
        break;
    }

    // 活動級別匹配
    switch (profile.activityLevel) {
      case "low":
        score += result.content.length < 1000 ? 0.05 : 0;
        break;
      case "medium":
        score += 0.05; // 中等活動級別對所有內容都適中
        break;
      case "high":
        score += result.content.length > 500 ? 0.05 : 0;
        break;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 計算個性化因子
   */
  private calculatePersonalizationFactors(
    result: NormalizedSearchResult,
    userContext: UserContext
  ): PersonalizationFactors {
    return {
      contentTypeAlignment: this.calculateContentTypeAlignment(result, userContext.preferences),
      topicInterest: this.calculateTopicInterest(result, userContext.profile),
      sourcePreference: this.calculateSourcePreference(result, userContext.preferences),
      qualityExpectation: this.calculateQualityExpectation(result, userContext.behavior),
      recencyPreference: this.calculateRecencyPreference(result, userContext.preferences),
      complexityAlignment: this.calculateComplexityAlignment(result, userContext.profile),
      languagePreference: this.calculateLanguagePreference(result, userContext.preferences),
      formatPreference: this.calculateFormatPreference(result, userContext.preferences),
    };
  }

  /**
   * 計算加權分數
   */
  private calculateWeightedScore(scores: {
    baseScore: number;
    preferenceScore: number;
    behaviorScore: number;
    profileScore: number;
    adaptiveScore: number;
  }): number {
    const weights = {
      base: 0.3,
      preference: 0.25,
      behavior: 0.2,
      profile: 0.15,
      adaptive: 0.1,
    };

    return (
      scores.baseScore * weights.base +
      scores.preferenceScore * weights.preference +
      scores.behaviorScore * weights.behavior +
      scores.profileScore * weights.profile +
      scores.adaptiveScore * weights.adaptive
    );
  }

  /**
   * 計算個性化信心度
   */
  private calculatePersonalizationConfidence(
    userContext: UserContext,
    factors: PersonalizationFactors
  ): number {
    let confidence = 0.5;

    // 基於用戶數據完整性
    const dataCompleteness = this.assessUserDataCompleteness(userContext);
    confidence += dataCompleteness * 0.3;

    // 基於行為數據量
    const behaviorDataAmount =
      userContext.behavior.searchHistory.length +
      userContext.behavior.clickPatterns.length +
      userContext.behavior.feedbackHistory.length;
    confidence += Math.min(behaviorDataAmount / 100, 0.2);

    // 基於因子一致性
    const factorVariance = this.calculateFactorVariance(factors);
    confidence += (1 - factorVariance) * 0.2;

    // 基於會話長度
    if (userContext.behavior.searchHistory.length > 0) {
      const avgSessionLength =
        userContext.behavior.searchHistory.reduce(
          (sum, history) => sum + history.sessionDuration,
          0
        ) / userContext.behavior.searchHistory.length;
      confidence += Math.min(avgSessionLength / 300000, 0.1); // 5分鐘為滿分
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 應用個性化策略
   */
  private async applyPersonalizationStrategies(
    results: NormalizedSearchResult[],
    context: RankingContext,
    scores: Map<string, PersonalizationScore>
  ): Promise<NormalizedSearchResult[]> {
    let processedResults = [...results];

    // 按權重順序應用策略
    const sortedStrategies = Array.from(this.strategies.values()).sort(
      (a, b) => b.weight - a.weight
    );

    for (const strategy of sortedStrategies) {
      try {
        processedResults = await strategy.personalize(processedResults, context);
      } catch (error) {
        console.warn(`個性化策略 ${strategy.id} 執行失敗:`, error);
      }
    }

    return processedResults;
  }

  /**
   * 偏差校正
   */
  private async correctBias(
    results: NormalizedSearchResult[],
    context: RankingContext
  ): Promise<NormalizedSearchResult[]> {
    // 檢測和校正各種偏差

    // 1. 來源偏差校正
    const sourceCorrected = this.correctSourceBias(results);

    // 2. 主題偏差校正
    const topicCorrected = this.correctTopicBias(sourceCorrected);

    // 3. 時效性偏差校正
    const recencyCorrected = this.correctRecencyBias(topicCorrected);

    // 4. 質量偏差校正
    const qualityCorrected = this.correctQualityBias(recencyCorrected);

    return qualityCorrected;
  }

  /**
   * 添加個性化元數據
   */
  private addPersonalizationMetadata(
    results: NormalizedSearchResult[],
    scores: Map<string, PersonalizationScore>,
    context: RankingContext
  ): NormalizedSearchResult[] {
    return results.map((result) => {
      const score = scores.get(result.id)!;

      return {
        ...result,
        personalizedScore: score.finalScore,
        metadata: {
          ...result.metadata,
          personalization: {
            score: score.finalScore,
            confidence: score.confidence,
            factors: score.factors,
            applied: true,
            timestamp: Date.now(),
          },
        },
      };
    });
  }

  // ==================== 輔助方法 ====================

  private inferContentType(content: string): string {
    if (content.includes("```")) return "code";
    if (content.includes("?") && content.split("?").length > 3) return "faq";
    if (content.length > 2000) return "article";
    return "text";
  }

  private extractTopics(content: string): string[] {
    // 簡化的主題提取邏輯
    return ["general"];
  }

  private detectLanguage(content: string): string {
    // 簡化的語言檢測
    return "en";
  }

  private calculateFreshnessScore(timestamp: number): number {
    const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 7) return 0.8;
    if (ageInDays <= 30) return 0.6;
    return 0.4;
  }

  private inferFormat(content: string): string {
    if (content.includes("<") && content.includes(">")) return "structured";
    if (content.includes("![") || content.includes("<img")) return "multimedia";
    return "text";
  }

  private assessContentComplexity(content: string): number {
    const words = content.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    return Math.min(avgWordLength / 10, 1.0);
  }

  private isContentRelatedToQuery(content: string, query: string): boolean {
    const contentWords = content.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);
    const intersection = queryWords.filter((word) =>
      contentWords.some((cWord) => cWord.includes(word))
    );
    return intersection.length / queryWords.length > 0.3;
  }

  private hasVisualElements(content: string): boolean {
    return content.includes("![") || content.includes("<img") || content.includes("chart");
  }

  private isInteractiveContent(content: string): boolean {
    return content.includes("click") || content.includes("interactive") || content.includes("demo");
  }

  private calculateContentTypeAlignment(
    result: NormalizedSearchResult,
    preferences: UserPreferences
  ): number {
    const resultType = this.inferContentType(result.content);
    return preferences.contentTypes.includes(resultType) ? 1.0 : 0.0;
  }

  private calculateTopicInterest(result: NormalizedSearchResult, profile: UserProfile): number {
    const resultTopics = this.extractTopics(result.content);
    const matches = profile.interests.filter((interest) =>
      resultTopics.some((topic) => topic.includes(interest))
    );
    return profile.interests.length > 0 ? matches.length / profile.interests.length : 0.5;
  }

  private calculateSourcePreference(
    result: NormalizedSearchResult,
    preferences: UserPreferences
  ): number {
    const resultSources = result.sources.map((s) => s.id);
    const matches = preferences.sources.filter((source) => resultSources.includes(source));
    return preferences.sources.length > 0 ? matches.length / preferences.sources.length : 0.5;
  }

  private calculateQualityExpectation(
    result: NormalizedSearchResult,
    behavior: UserBehavior
  ): number {
    if (behavior.clickPatterns.length === 0) return 0.5;

    const avgQualityClicked =
      behavior.clickPatterns.reduce((sum, pattern) => {
        // 假設有質量評分記錄
        return sum + 0.7; // 簡化假設
      }, 0) / behavior.clickPatterns.length;

    return Math.abs(result.qualityScore - avgQualityClicked) < 0.2 ? 1.0 : 0.5;
  }

  private calculateRecencyPreference(
    result: NormalizedSearchResult,
    preferences: UserPreferences
  ): number {
    const freshness = this.calculateFreshnessScore(result.timestamp);
    switch (preferences.recency) {
      case "latest":
        return freshness;
      case "recent":
        return freshness > 0.5 ? 1.0 : 0.5;
      default:
        return 0.5;
    }
  }

  private calculateComplexityAlignment(
    result: NormalizedSearchResult,
    profile: UserProfile
  ): number {
    const complexity = this.assessContentComplexity(result.content);
    switch (profile.expertiseLevel) {
      case "beginner":
        return complexity < 0.4 ? 1.0 : 0.0;
      case "intermediate":
        return complexity >= 0.3 && complexity <= 0.7 ? 1.0 : 0.0;
      case "expert":
        return complexity > 0.6 ? 1.0 : 0.0;
      default:
        return 0.5;
    }
  }

  private calculateLanguagePreference(
    result: NormalizedSearchResult,
    preferences: UserPreferences
  ): number {
    const language = this.detectLanguage(result.content);
    return preferences.languages.includes(language) ? 1.0 : 0.0;
  }

  private calculateFormatPreference(
    result: NormalizedSearchResult,
    preferences: UserPreferences
  ): number {
    const format = this.inferFormat(result.content);
    return preferences.format === format ? 1.0 : 0.0;
  }

  private assessUserDataCompleteness(userContext: UserContext): number {
    let completeness = 0;
    let factors = 0;

    if (userContext.preferences.contentTypes.length > 0) {
      completeness += 1;
      factors++;
    }
    if (userContext.preferences.topics.length > 0) {
      completeness += 1;
      factors++;
    }
    if (userContext.profile.interests.length > 0) {
      completeness += 1;
      factors++;
    }
    if (userContext.behavior.searchHistory.length > 0) {
      completeness += 1;
      factors++;
    }

    return factors > 0 ? completeness / factors : 0;
  }

  private calculateFactorVariance(factors: PersonalizationFactors): number {
    const values = Object.values(factors);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  private correctSourceBias(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    // 確保來源多樣性
    const sourceDistribution = new Map<string, number>();
    results.forEach((result) => {
      result.sources.forEach((source) => {
        sourceDistribution.set(source.type, (sourceDistribution.get(source.type) || 0) + 1);
      });
    });

    // 如果某個來源過度代表，降低其權重
    return results.map((result) => {
      const overRepresentedSources = result.sources.filter(
        (source) => (sourceDistribution.get(source.type) || 0) > results.length * 0.6
      );

      if (overRepresentedSources.length > 0) {
        return {
          ...result,
          personalizedScore: (result.personalizedScore || result.normalizedScore) * 0.9,
        };
      }

      return result;
    });
  }

  private correctTopicBias(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    // 類似來源偏差校正的邏輯
    return results;
  }

  private correctRecencyBias(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    // 平衡新舊內容
    return results;
  }

  private correctQualityBias(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    // 避免過度偏向高質量內容
    return results;
  }

  private getDefaultPersonalizationScore(result: NormalizedSearchResult): PersonalizationScore {
    const baseScore = (result.relevanceScore + result.qualityScore) / 2;
    return {
      baseScore,
      preferenceScore: 0.5,
      behaviorScore: 0.5,
      profileScore: 0.5,
      adaptiveScore: 0.5,
      finalScore: baseScore,
      confidence: 0.3,
      factors: {
        contentTypeAlignment: 0.5,
        topicInterest: 0.5,
        sourcePreference: 0.5,
        qualityExpectation: 0.5,
        recencyPreference: 0.5,
        complexityAlignment: 0.5,
        languagePreference: 0.5,
        formatPreference: 0.5,
      },
    };
  }

  private initializeStrategies(): void {
    // 基於偏好的個性化策略
    this.strategies.set("preference-based", {
      id: "preference-based",
      name: "Preference-Based Personalization",
      description: "基於用戶偏好的個性化",
      weight: 0.4,
      personalize: async (results, context) => {
        // 根據偏好重新排序
        return results.sort((a, b) => {
          const scoreA = this.calculatePreferenceScore(a, context.userContext!.preferences);
          const scoreB = this.calculatePreferenceScore(b, context.userContext!.preferences);
          return scoreB - scoreA;
        });
      },
    });

    // 基於行為的個性化策略
    this.strategies.set("behavior-based", {
      id: "behavior-based",
      name: "Behavior-Based Personalization",
      description: "基於用戶行為的個性化",
      weight: 0.3,
      personalize: async (results, context) => {
        return results.sort((a, b) => {
          const scoreA = this.calculateBehaviorScore(a, context.userContext!.behavior);
          const scoreB = this.calculateBehaviorScore(b, context.userContext!.behavior);
          return scoreB - scoreA;
        });
      },
    });

    // 基於檔案的個性化策略
    this.strategies.set("profile-based", {
      id: "profile-based",
      name: "Profile-Based Personalization",
      description: "基於用戶檔案的個性化",
      weight: 0.3,
      personalize: async (results, context) => {
        return results.sort((a, b) => {
          const scoreA = this.calculateProfileScore(a, context.userContext!.profile);
          const scoreB = this.calculateProfileScore(b, context.userContext!.profile);
          return scoreB - scoreA;
        });
      },
    });
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      strategiesCount: this.strategies.size,
      userProfilesCount: this.userProfiles.size,
      biasCorrection: this.config.biasCorrection,
    };
  }

  /**
   * 註冊自定義個性化策略
   */
  registerStrategy(strategy: PersonalizationStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * 移除個性化策略
   */
  unregisterStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
  }
}
