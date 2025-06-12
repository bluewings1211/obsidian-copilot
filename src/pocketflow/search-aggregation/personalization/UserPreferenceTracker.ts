/**
 * PocketFlow.js Search Aggregation System - User Preference Tracker
 * 用戶偏好追蹤器：追蹤和更新用戶偏好
 */

import { PersonalizationConfig, UserContext, UserPreferences } from "../types";

export interface PreferenceUpdate {
  type: "implicit" | "explicit";
  source: string;
  preferences: Partial<UserPreferences>;
  confidence: number;
  timestamp: number;
}

export interface PreferencePattern {
  pattern: string;
  frequency: number;
  recency: number;
  confidence: number;
}

/**
 * 用戶偏好追蹤器
 * 負責學習和更新用戶的搜索偏好
 */
export class UserPreferenceTracker {
  private preferenceHistory: Map<string, PreferenceUpdate[]> = new Map();
  private patterns: Map<string, PreferencePattern[]> = new Map();

  constructor(private config: PersonalizationConfig) {}

  /**
   * 更新用戶偏好
   */
  async updatePreferences(userContext: UserContext): Promise<void> {
    const userId = userContext.userId || userContext.sessionId;

    // 1. 隱式偏好學習
    const implicitUpdates = await this.learnImplicitPreferences(userContext);

    // 2. 顯式偏好更新
    const explicitUpdates = this.processExplicitPreferences(userContext);

    // 3. 合併偏好更新
    const allUpdates = [...implicitUpdates, ...explicitUpdates];

    // 4. 存儲偏好歷史
    this.storePreferenceHistory(userId, allUpdates);

    // 5. 更新用戶偏好
    await this.applyPreferenceUpdates(userContext, allUpdates);
  }

  /**
   * 學習隱式偏好
   */
  private async learnImplicitPreferences(userContext: UserContext): Promise<PreferenceUpdate[]> {
    const updates: PreferenceUpdate[] = [];

    // 從搜索歷史學習
    if (userContext.behavior.searchHistory.length > 0) {
      const searchUpdates = this.learnFromSearchHistory(userContext.behavior.searchHistory);
      updates.push(...searchUpdates);
    }

    // 從點擊模式學習
    if (userContext.behavior.clickPatterns.length > 0) {
      const clickUpdates = this.learnFromClickPatterns(userContext.behavior.clickPatterns);
      updates.push(...clickUpdates);
    }

    // 從停留時間學習
    if (userContext.behavior.dwellTime.length > 0) {
      const dwellUpdates = this.learnFromDwellTime(userContext.behavior.dwellTime);
      updates.push(...dwellUpdates);
    }

    // 從反饋學習
    if (userContext.behavior.feedbackHistory.length > 0) {
      const feedbackUpdates = this.learnFromFeedback(userContext.behavior.feedbackHistory);
      updates.push(...feedbackUpdates);
    }

    return updates;
  }

  /**
   * 從搜索歷史學習
   */
  private learnFromSearchHistory(searchHistory: any[]): PreferenceUpdate[] {
    const updates: PreferenceUpdate[] = [];

    // 分析查詢模式
    const queryTopics = this.extractTopicsFromQueries(searchHistory);
    if (queryTopics.length > 0) {
      updates.push({
        type: "implicit",
        source: "search_history",
        preferences: { topics: queryTopics },
        confidence: 0.7,
        timestamp: Date.now(),
      });
    }

    // 分析查詢時間模式（時效性偏好）
    const recencyPattern = this.analyzeRecencyPattern(searchHistory);
    if (recencyPattern) {
      updates.push({
        type: "implicit",
        source: "search_history",
        preferences: { recency: recencyPattern },
        confidence: 0.6,
        timestamp: Date.now(),
      });
    }

    return updates;
  }

  /**
   * 從點擊模式學習
   */
  private learnFromClickPatterns(clickPatterns: any[]): PreferenceUpdate[] {
    const updates: PreferenceUpdate[] = [];

    // 分析位置偏好
    // Calculate average position for position preference analysis
    // const avgPosition =
    //   clickPatterns.reduce((sum, pattern) => sum + pattern.position, 0) / clickPatterns.length;

    // 分析內容類型偏好
    const contentTypes = this.inferContentTypesFromClicks(clickPatterns);
    if (contentTypes.length > 0) {
      updates.push({
        type: "implicit",
        source: "click_patterns",
        preferences: { contentTypes },
        confidence: 0.8,
        timestamp: Date.now(),
      });
    }

    return updates;
  }

  /**
   * 從停留時間學習
   */
  private learnFromDwellTime(dwellTime: any[]): PreferenceUpdate[] {
    const updates: PreferenceUpdate[] = [];

    // 分析深度偏好
    const avgDwellTime =
      dwellTime.reduce((sum, data) => sum + data.timeSpent, 0) / dwellTime.length;

    let depthPreference: "overview" | "detailed" | "comprehensive";
    if (avgDwellTime < 30000) {
      // 30秒
      depthPreference = "overview";
    } else if (avgDwellTime < 120000) {
      // 2分鐘
      depthPreference = "detailed";
    } else {
      depthPreference = "comprehensive";
    }

    updates.push({
      type: "implicit",
      source: "dwell_time",
      preferences: { depth: depthPreference },
      confidence: 0.7,
      timestamp: Date.now(),
    });

    return updates;
  }

  /**
   * 從反饋學習
   */
  private learnFromFeedback(feedbackHistory: any[]): PreferenceUpdate[] {
    const updates: PreferenceUpdate[] = [];

    // 分析正面反饋的內容特徵
    const positiveFeeback = feedbackHistory.filter((f) => f.feedback === "positive");

    if (positiveFeeback.length > 0) {
      // 這裡可以分析正面反饋內容的特徵
      // 簡化實現
      updates.push({
        type: "implicit",
        source: "feedback",
        preferences: {}, // 根據具體反饋內容更新
        confidence: 0.9,
        timestamp: Date.now(),
      });
    }

    return updates;
  }

  /**
   * 處理顯式偏好
   */
  private processExplicitPreferences(userContext: UserContext): PreferenceUpdate[] {
    // 用戶直接設置的偏好具有最高信心度
    return [
      {
        type: "explicit",
        source: "user_settings",
        preferences: userContext.preferences,
        confidence: 1.0,
        timestamp: Date.now(),
      },
    ];
  }

  /**
   * 應用偏好更新
   */
  private async applyPreferenceUpdates(
    userContext: UserContext,
    updates: PreferenceUpdate[]
  ): Promise<void> {
    // 按信心度和類型排序更新
    const sortedUpdates = updates.sort((a, b) => {
      // 顯式偏好優先
      if (a.type !== b.type) {
        return a.type === "explicit" ? -1 : 1;
      }
      // 高信心度優先
      return b.confidence - a.confidence;
    });

    // 應用偏好更新（使用指數衰減的學習率）
    const learningRate = this.config.adaptationRate || 0.1;

    for (const update of sortedUpdates) {
      this.mergePreferences(
        userContext.preferences,
        update.preferences,
        learningRate * update.confidence
      );
    }
  }

  /**
   * 合併偏好
   */
  private mergePreferences(
    current: UserPreferences,
    update: Partial<UserPreferences>,
    weight: number
  ): void {
    // 內容類型偏好
    if (update.contentTypes) {
      current.contentTypes = this.mergeArrayPreferences(
        current.contentTypes,
        update.contentTypes,
        weight
      );
    }

    // 主題偏好
    if (update.topics) {
      current.topics = this.mergeArrayPreferences(current.topics, update.topics, weight);
    }

    // 來源偏好
    if (update.sources) {
      current.sources = this.mergeArrayPreferences(current.sources, update.sources, weight);
    }

    // 語言偏好
    if (update.languages) {
      current.languages = this.mergeArrayPreferences(current.languages, update.languages, weight);
    }

    // 時效性偏好
    if (update.recency && weight > 0.5) {
      current.recency = update.recency;
    }

    // 深度偏好
    if (update.depth && weight > 0.5) {
      current.depth = update.depth;
    }

    // 格式偏好
    if (update.format && weight > 0.5) {
      current.format = update.format;
    }
  }

  /**
   * 合併數組偏好
   */
  private mergeArrayPreferences(current: string[], update: string[], weight: number): string[] {
    const merged = [...current];

    for (const item of update) {
      if (!merged.includes(item) && weight > 0.3) {
        merged.push(item);
      }
    }

    // 限制數組長度
    return merged.slice(0, 10);
  }

  /**
   * 存儲偏好歷史
   */
  private storePreferenceHistory(userId: string, updates: PreferenceUpdate[]): void {
    if (!this.preferenceHistory.has(userId)) {
      this.preferenceHistory.set(userId, []);
    }

    const history = this.preferenceHistory.get(userId)!;
    history.push(...updates);

    // 限制歷史記錄長度
    const maxHistory = this.config.historyDepth || 100;
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }
  }

  /**
   * 提取查詢主題
   */
  private extractTopicsFromQueries(searchHistory: any[]): string[] {
    const topicKeywords = {
      technology: ["tech", "software", "programming", "AI", "computer"],
      science: ["research", "study", "experiment", "analysis"],
      business: ["business", "market", "company", "finance"],
      health: ["health", "medical", "treatment", "wellness"],
    };

    const topicCounts: Record<string, number> = {};

    for (const history of searchHistory) {
      const query = history.query.toLowerCase();

      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        const matches = keywords.filter((keyword) => query.includes(keyword));
        if (matches.length > 0) {
          topicCounts[topic] = (topicCounts[topic] || 0) + matches.length;
        }
      }
    }

    // 返回頻率最高的主題
    return Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * 分析時效性模式
   */
  private analyzeRecencyPattern(searchHistory: any[]): "latest" | "recent" | "any" | null {
    // 簡化的時效性分析
    const recentQueries = searchHistory.filter((history) => {
      const ageInDays = (Date.now() - history.timestamp) / (1000 * 60 * 60 * 24);
      return ageInDays <= 7;
    });

    const ratio = recentQueries.length / searchHistory.length;

    if (ratio > 0.8) return "latest";
    if (ratio > 0.5) return "recent";
    if (ratio > 0.2) return "any";

    return null;
  }

  /**
   * 從點擊推斷內容類型
   */
  private inferContentTypesFromClicks(clickPatterns: any[]): string[] {
    // 簡化的內容類型推斷
    const types: string[] = [];

    // 基於點擊的結果類型進行推斷
    // 這裡需要額外的上下文信息
    types.push("text"); // 默認類型

    return types;
  }

  /**
   * 獲取用戶偏好歷史
   */
  getUserPreferenceHistory(userId: string): PreferenceUpdate[] {
    return this.preferenceHistory.get(userId) || [];
  }

  /**
   * 獲取偏好模式
   */
  getPreferencePatterns(userId: string): PreferencePattern[] {
    return this.patterns.get(userId) || [];
  }

  /**
   * 清理過期數據
   */
  cleanup(): void {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    const cutoff = Date.now() - maxAge;

    for (const [userId, history] of this.preferenceHistory.entries()) {
      const filtered = history.filter((update) => update.timestamp > cutoff);
      if (filtered.length === 0) {
        this.preferenceHistory.delete(userId);
      } else {
        this.preferenceHistory.set(userId, filtered);
      }
    }
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      trackedUsers: this.preferenceHistory.size,
      totalUpdates: Array.from(this.preferenceHistory.values()).reduce(
        (sum, history) => sum + history.length,
        0
      ),
      adaptationRate: this.config.adaptationRate,
    };
  }
}
