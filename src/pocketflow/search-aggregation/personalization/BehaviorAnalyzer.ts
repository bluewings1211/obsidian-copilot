/**
 * PocketFlow.js Search Aggregation System - Behavior Analyzer
 * 行為分析器：分析用戶搜索行為模式
 */

import { PersonalizationConfig, UserBehavior } from "../types";

export interface BehaviorPattern {
  type: "search" | "click" | "dwell" | "feedback" | "interaction";
  pattern: string;
  frequency: number;
  confidence: number;
  lastSeen: number;
}

export interface BehaviorInsight {
  searchStyle: "explorer" | "focused" | "mixed";
  contentPreference: "shallow" | "moderate" | "deep";
  qualityExpectation: "low" | "medium" | "high";
  diversityTolerance: "low" | "medium" | "high";
  sessionLength: "short" | "medium" | "long";
  engagement: "passive" | "active" | "highly_active";
}

/**
 * 行為分析器
 * 負責分析用戶行為模式並提供行為洞察
 */
export class BehaviorAnalyzer {
  private behaviorPatterns: Map<string, BehaviorPattern[]> = new Map();
  private behaviorInsights: Map<string, BehaviorInsight> = new Map();

  constructor(private config: PersonalizationConfig) {}

  /**
   * 分析用戶行為
   */
  async analyzeBehavior(behavior: UserBehavior): Promise<BehaviorInsight> {
    // 1. 分析搜索模式
    const searchPatterns = this.analyzeSearchPatterns(behavior.searchHistory);

    // 2. 分析點擊模式
    const clickPatterns = this.analyzeClickPatterns(behavior.clickPatterns);

    // 3. 分析停留時間模式
    const dwellPatterns = this.analyzeDwellTimePatterns(behavior.dwellTime);

    // 4. 分析反饋模式
    const feedbackPatterns = this.analyzeFeedbackPatterns(behavior.feedbackHistory);

    // 5. 分析交互模式
    const interactionPatterns = this.analyzeInteractionPatterns(behavior.interactionPatterns);

    // 6. 生成行為洞察
    const insight = this.generateBehaviorInsight({
      searchPatterns,
      clickPatterns,
      dwellPatterns,
      feedbackPatterns,
      interactionPatterns,
    });

    return insight;
  }

  /**
   * 分析搜索模式
   */
  private analyzeSearchPatterns(searchHistory: any[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];

    if (searchHistory.length === 0) return patterns;

    // 查詢長度模式
    const avgQueryLength =
      searchHistory.reduce((sum, history) => sum + history.query.split(" ").length, 0) /
      searchHistory.length;

    patterns.push({
      type: "search",
      pattern: avgQueryLength > 5 ? "detailed_queries" : "simple_queries",
      frequency: searchHistory.length,
      confidence: Math.min(searchHistory.length / 20, 1.0),
      lastSeen: Math.max(...searchHistory.map((h) => h.timestamp)),
    });

    // 查詢頻率模式
    const queryFrequency = this.calculateQueryFrequency(searchHistory);
    patterns.push({
      type: "search",
      pattern: queryFrequency > 0.5 ? "frequent_searcher" : "occasional_searcher",
      frequency: queryFrequency,
      confidence: 0.8,
      lastSeen: Date.now(),
    });

    // 查詢修正模式
    const refinementRate = this.calculateRefinementRate(searchHistory);
    if (refinementRate > 0.3) {
      patterns.push({
        type: "search",
        pattern: "query_refiner",
        frequency: refinementRate,
        confidence: 0.7,
        lastSeen: Date.now(),
      });
    }

    return patterns;
  }

  /**
   * 分析點擊模式
   */
  private analyzeClickPatterns(clickPatterns: any[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];

    if (clickPatterns.length === 0) return patterns;

    // 點擊位置偏好
    const avgPosition =
      clickPatterns.reduce((sum, pattern) => sum + pattern.position, 0) / clickPatterns.length;

    patterns.push({
      type: "click",
      pattern: avgPosition <= 3 ? "top_clicker" : "deep_explorer",
      frequency: clickPatterns.length,
      confidence: Math.min(clickPatterns.length / 50, 1.0),
      lastSeen: Math.max(...clickPatterns.map((p) => p.timestamp)),
    });

    // 點擊率分析
    const clickRate = this.calculateClickRate(clickPatterns);
    patterns.push({
      type: "click",
      pattern: clickRate > 0.3 ? "high_clicker" : "selective_clicker",
      frequency: clickRate,
      confidence: 0.8,
      lastSeen: Date.now(),
    });

    return patterns;
  }

  /**
   * 分析停留時間模式
   */
  private analyzeDwellTimePatterns(dwellTime: any[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];

    if (dwellTime.length === 0) return patterns;

    // 平均停留時間
    const avgDwellTime =
      dwellTime.reduce((sum, data) => sum + data.timeSpent, 0) / dwellTime.length;

    let dwellPattern: string;
    if (avgDwellTime < 30000) {
      // 30秒
      dwellPattern = "quick_scanner";
    } else if (avgDwellTime < 120000) {
      // 2分鐘
      dwellPattern = "moderate_reader";
    } else {
      dwellPattern = "deep_reader";
    }

    patterns.push({
      type: "dwell",
      pattern: dwellPattern,
      frequency: dwellTime.length,
      confidence: Math.min(dwellTime.length / 30, 1.0),
      lastSeen: Math.max(...dwellTime.map((d) => d.timestamp || Date.now())),
    });

    // 參與度分析
    const highEngagementCount = dwellTime.filter((d) => d.engagement === "high").length;
    const engagementRate = highEngagementCount / dwellTime.length;

    if (engagementRate > 0.3) {
      patterns.push({
        type: "dwell",
        pattern: "high_engagement",
        frequency: engagementRate,
        confidence: 0.8,
        lastSeen: Date.now(),
      });
    }

    return patterns;
  }

  /**
   * 分析反饋模式
   */
  private analyzeFeedbackPatterns(feedbackHistory: any[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];

    if (feedbackHistory.length === 0) return patterns;

    // 反饋頻率
    const feedbackRate = feedbackHistory.length / 100; // 假設每100次搜索的反饋率

    patterns.push({
      type: "feedback",
      pattern: feedbackRate > 0.1 ? "active_feedback" : "passive_feedback",
      frequency: feedbackRate,
      confidence: Math.min(feedbackHistory.length / 20, 1.0),
      lastSeen: Math.max(...feedbackHistory.map((f) => f.timestamp)),
    });

    // 正面反饋比例
    const positiveRatio =
      feedbackHistory.filter((f) => f.feedback === "positive").length / feedbackHistory.length;

    patterns.push({
      type: "feedback",
      pattern:
        positiveRatio > 0.7
          ? "satisfied_user"
          : positiveRatio > 0.3
            ? "moderate_satisfaction"
            : "hard_to_please",
      frequency: positiveRatio,
      confidence: 0.9,
      lastSeen: Date.now(),
    });

    return patterns;
  }

  /**
   * 分析交互模式
   */
  private analyzeInteractionPatterns(interactionPatterns: any[]): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];

    if (interactionPatterns.length === 0) return patterns;

    // 交互類型分佈
    const interactionTypes = interactionPatterns.reduce(
      (acc, pattern) => {
        acc[pattern.type] = (acc[pattern.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // 收藏行為
    const bookmarkRatio = (interactionTypes.bookmark || 0) / interactionPatterns.length;
    if (bookmarkRatio > 0.1) {
      patterns.push({
        type: "interaction",
        pattern: "frequent_bookmarker",
        frequency: bookmarkRatio,
        confidence: 0.8,
        lastSeen: Date.now(),
      });
    }

    // 分享行為
    const shareRatio = (interactionTypes.share || 0) / interactionPatterns.length;
    if (shareRatio > 0.05) {
      patterns.push({
        type: "interaction",
        pattern: "content_sharer",
        frequency: shareRatio,
        confidence: 0.7,
        lastSeen: Date.now(),
      });
    }

    return patterns;
  }

  /**
   * 生成行為洞察
   */
  private generateBehaviorInsight(patternGroups: {
    searchPatterns: BehaviorPattern[];
    clickPatterns: BehaviorPattern[];
    dwellPatterns: BehaviorPattern[];
    feedbackPatterns: BehaviorPattern[];
    interactionPatterns: BehaviorPattern[];
  }): BehaviorInsight {
    // 搜索風格
    const searchStyle = this.determineSearchStyle(
      patternGroups.searchPatterns,
      patternGroups.clickPatterns
    );

    // 內容偏好深度
    const contentPreference = this.determineContentPreference(patternGroups.dwellPatterns);

    // 質量期望
    const qualityExpectation = this.determineQualityExpectation(patternGroups.feedbackPatterns);

    // 多樣性容忍度
    const diversityTolerance = this.determineDiversityTolerance(patternGroups.clickPatterns);

    // 會話長度偏好
    const sessionLength = this.determineSessionLength(patternGroups.searchPatterns);

    // 參與度
    const engagement = this.determineEngagement(
      patternGroups.dwellPatterns,
      patternGroups.interactionPatterns
    );

    return {
      searchStyle,
      contentPreference,
      qualityExpectation,
      diversityTolerance,
      sessionLength,
      engagement,
    };
  }

  /**
   * 確定搜索風格
   */
  private determineSearchStyle(
    searchPatterns: BehaviorPattern[],
    clickPatterns: BehaviorPattern[]
  ): "explorer" | "focused" | "mixed" {
    const hasDeepExplorer = clickPatterns.some((p) => p.pattern === "deep_explorer");
    const hasQueryRefiner = searchPatterns.some((p) => p.pattern === "query_refiner");

    if (hasDeepExplorer && hasQueryRefiner) return "explorer";
    if (!hasDeepExplorer && !hasQueryRefiner) return "focused";
    return "mixed";
  }

  /**
   * 確定內容偏好
   */
  private determineContentPreference(
    dwellPatterns: BehaviorPattern[]
  ): "shallow" | "moderate" | "deep" {
    const deepReader = dwellPatterns.find((p) => p.pattern === "deep_reader");
    if (deepReader && deepReader.confidence > 0.7) return "deep";

    const quickScanner = dwellPatterns.find((p) => p.pattern === "quick_scanner");
    if (quickScanner && quickScanner.confidence > 0.7) return "shallow";

    return "moderate";
  }

  /**
   * 確定質量期望
   */
  private determineQualityExpectation(
    feedbackPatterns: BehaviorPattern[]
  ): "low" | "medium" | "high" {
    const hardToPlease = feedbackPatterns.find((p) => p.pattern === "hard_to_please");
    if (hardToPlease && hardToPlease.confidence > 0.7) return "high";

    const satisfied = feedbackPatterns.find((p) => p.pattern === "satisfied_user");
    if (satisfied && satisfied.confidence > 0.7) return "low";

    return "medium";
  }

  /**
   * 確定多樣性容忍度
   */
  private determineDiversityTolerance(clickPatterns: BehaviorPattern[]): "low" | "medium" | "high" {
    const deepExplorer = clickPatterns.find((p) => p.pattern === "deep_explorer");
    if (deepExplorer && deepExplorer.confidence > 0.6) return "high";

    const topClicker = clickPatterns.find((p) => p.pattern === "top_clicker");
    if (topClicker && topClicker.confidence > 0.8) return "low";

    return "medium";
  }

  /**
   * 確定會話長度偏好
   */
  private determineSessionLength(searchPatterns: BehaviorPattern[]): "short" | "medium" | "long" {
    const frequentSearcher = searchPatterns.find((p) => p.pattern === "frequent_searcher");
    if (frequentSearcher && frequentSearcher.frequency > 0.8) return "long";

    const occasionalSearcher = searchPatterns.find((p) => p.pattern === "occasional_searcher");
    if (occasionalSearcher && occasionalSearcher.frequency < 0.3) return "short";

    return "medium";
  }

  /**
   * 確定參與度
   */
  private determineEngagement(
    dwellPatterns: BehaviorPattern[],
    interactionPatterns: BehaviorPattern[]
  ): "passive" | "active" | "highly_active" {
    const highEngagement = dwellPatterns.find((p) => p.pattern === "high_engagement");
    const frequentBookmarker = interactionPatterns.find((p) => p.pattern === "frequent_bookmarker");
    const contentSharer = interactionPatterns.find((p) => p.pattern === "content_sharer");

    if (highEngagement && (frequentBookmarker || contentSharer)) return "highly_active";
    if (highEngagement || frequentBookmarker) return "active";
    return "passive";
  }

  // ==================== 輔助計算方法 ====================

  /**
   * 計算查詢頻率
   */
  private calculateQueryFrequency(searchHistory: any[]): number {
    if (searchHistory.length === 0) return 0;

    const timeSpan =
      Math.max(...searchHistory.map((h) => h.timestamp)) -
      Math.min(...searchHistory.map((h) => h.timestamp));
    const days = timeSpan / (1000 * 60 * 60 * 24);

    return days > 0 ? searchHistory.length / days : 0;
  }

  /**
   * 計算查詢修正率
   */
  private calculateRefinementRate(searchHistory: any[]): number {
    if (searchHistory.length < 2) return 0;

    let refinements = 0;
    for (let i = 1; i < searchHistory.length; i++) {
      const current = searchHistory[i].query.toLowerCase();
      const previous = searchHistory[i - 1].query.toLowerCase();

      // 簡單的相似性檢查
      const similarity = this.calculateQuerySimilarity(current, previous);
      if (similarity > 0.5 && similarity < 1.0) {
        refinements++;
      }
    }

    return refinements / (searchHistory.length - 1);
  }

  /**
   * 計算查詢相似性
   */
  private calculateQuerySimilarity(query1: string, query2: string): number {
    const words1 = query1.split(" ");
    const words2 = query2.split(" ");
    const intersection = words1.filter((word) => words2.includes(word));
    const union = Array.from(new Set([...words1, ...words2]));

    return union.length > 0 ? intersection.length / union.length : 0;
  }

  /**
   * 計算點擊率
   */
  private calculateClickRate(clickPatterns: any[]): number {
    // 簡化實現：假設有總的搜索結果展示次數
    const estimatedShows = clickPatterns.length * 10; // 假設每次點擊對應10次展示
    return clickPatterns.length / estimatedShows;
  }

  /**
   * 獲取用戶行為模式
   */
  getUserBehaviorPatterns(userId: string): BehaviorPattern[] {
    return this.behaviorPatterns.get(userId) || [];
  }

  /**
   * 獲取用戶行為洞察
   */
  getUserBehaviorInsight(userId: string): BehaviorInsight | null {
    return this.behaviorInsights.get(userId) || null;
  }

  /**
   * 更新行為模式
   */
  updateBehaviorPatterns(userId: string, patterns: BehaviorPattern[]): void {
    this.behaviorPatterns.set(userId, patterns);
  }

  /**
   * 清理過期數據
   */
  cleanup(): void {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    const cutoff = Date.now() - maxAge;

    for (const [userId, patterns] of this.behaviorPatterns.entries()) {
      const filtered = patterns.filter((pattern) => pattern.lastSeen > cutoff);
      if (filtered.length === 0) {
        this.behaviorPatterns.delete(userId);
        this.behaviorInsights.delete(userId);
      } else {
        this.behaviorPatterns.set(userId, filtered);
      }
    }
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      analyzedUsers: this.behaviorPatterns.size,
      totalPatterns: Array.from(this.behaviorPatterns.values()).reduce(
        (sum, patterns) => sum + patterns.length,
        0
      ),
      insightsGenerated: this.behaviorInsights.size,
    };
  }
}
