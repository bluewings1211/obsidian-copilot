import { logInfo, logError } from "@/logger";

/**
 * 反饋記錄介面
 */
export interface FeedbackRecord {
  toolName: string;
  success: boolean;
  duration: number;
  userSatisfaction?: number; // 1-5 分
  timestamp: number;
  errorType?: string;
  context?: {
    query?: string;
    expectedResult?: string;
    actualResult?: string;
    userComment?: string;
  };
}

/**
 * 反饋統計介面
 */
export interface FeedbackStatistics {
  totalFeedbacks: number;
  averageSatisfaction: number;
  successRate: number;
  toolStatistics: Record<
    string,
    {
      count: number;
      successRate: number;
      averageSatisfaction: number;
      averageDuration: number;
      commonErrors: string[];
    }
  >;
  recentTrends: {
    dailySuccess: Array<{ date: string; rate: number }>;
    dailySatisfaction: Array<{ date: string; satisfaction: number }>;
  };
}

/**
 * 反饋分析結果介面
 */
export interface FeedbackAnalysis {
  overallHealth: number; // 0-1 整體健康度
  problemAreas: Array<{
    toolName: string;
    issues: string[];
    severity: "low" | "medium" | "high";
    recommendations: string[];
  }>;
  improvementSuggestions: string[];
  positivePatterns: string[];
}

/**
 * 反饋收集器
 *
 * 負責收集和分析工具使用反饋，包括：
 * - 成功/失敗反饋
 * - 用戶滿意度評分
 * - 錯誤類型分析
 * - 性能指標收集
 * - 趨勢分析
 */
export class FeedbackCollector {
  private feedbackHistory: FeedbackRecord[];
  private maxHistorySize: number;
  private analysisCache: FeedbackAnalysis | null;
  private cacheExpiration: number;
  private lastCacheUpdate: number;

  constructor(maxHistorySize: number = 5000, cacheExpirationMs: number = 30 * 60 * 1000) {
    this.feedbackHistory = [];
    this.maxHistorySize = maxHistorySize;
    this.analysisCache = null;
    this.cacheExpiration = cacheExpirationMs;
    this.lastCacheUpdate = 0;
  }

  /**
   * 記錄反饋
   */
  async recordFeedback(feedback: FeedbackRecord): Promise<void> {
    try {
      // 驗證反饋數據
      this.validateFeedback(feedback);

      // 添加時間戳（如果沒有）
      if (!feedback.timestamp) {
        feedback.timestamp = Date.now();
      }

      // 添加到歷史記錄
      this.feedbackHistory.push(feedback);

      // 限制歷史記錄大小
      if (this.feedbackHistory.length > this.maxHistorySize) {
        this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
      }

      // 清除分析緩存
      this.analysisCache = null;
      this.lastCacheUpdate = 0;

      logInfo(
        `記錄工具反饋: ${feedback.toolName}, 成功: ${feedback.success}, 滿意度: ${feedback.userSatisfaction || "N/A"}`
      );
    } catch (error) {
      logError("記錄反饋失敗:", error);
      throw error;
    }
  }

  /**
   * 獲取反饋統計
   */
  async getFeedbackStatistics(): Promise<FeedbackStatistics> {
    try {
      if (this.feedbackHistory.length === 0) {
        return this.getEmptyStatistics();
      }

      const totalFeedbacks = this.feedbackHistory.length;

      // 計算整體統計
      const successCount = this.feedbackHistory.filter((f) => f.success).length;
      const successRate = successCount / totalFeedbacks;

      const satisfactionFeedbacks = this.feedbackHistory.filter(
        (f) => f.userSatisfaction !== undefined
      );
      const averageSatisfaction =
        satisfactionFeedbacks.length > 0
          ? satisfactionFeedbacks.reduce((sum, f) => sum + (f.userSatisfaction || 0), 0) /
            satisfactionFeedbacks.length
          : 0;

      // 計算每個工具的統計
      const toolStatistics = this.calculateToolStatistics();

      // 計算最近趨勢
      const recentTrends = this.calculateRecentTrends();

      return {
        totalFeedbacks,
        averageSatisfaction,
        successRate,
        toolStatistics,
        recentTrends,
      };
    } catch (error) {
      logError("獲取反饋統計失敗:", error);
      return this.getEmptyStatistics();
    }
  }

  /**
   * 獲取反饋分析
   */
  async getFeedbackAnalysis(): Promise<FeedbackAnalysis> {
    try {
      // 檢查緩存
      if (this.analysisCache && this.shouldUseCache()) {
        return this.analysisCache;
      }

      // 生成新的分析
      const analysis = await this.generateAnalysis();

      // 更新緩存
      this.analysisCache = analysis;
      this.lastCacheUpdate = Date.now();

      return analysis;
    } catch (error) {
      logError("獲取反饋分析失敗:", error);
      return this.getEmptyAnalysis();
    }
  }

  /**
   * 獲取工具特定反饋
   */
  async getToolFeedback(toolName: string, limit: number = 100): Promise<FeedbackRecord[]> {
    try {
      return this.feedbackHistory
        .filter((f) => f.toolName === toolName)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      logError(`獲取工具 ${toolName} 反饋失敗:`, error);
      return [];
    }
  }

  /**
   * 獲取最近反饋
   */
  async getRecentFeedback(hours: number = 24, limit: number = 100): Promise<FeedbackRecord[]> {
    try {
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

      return this.feedbackHistory
        .filter((f) => f.timestamp >= cutoffTime)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      logError("獲取最近反饋失敗:", error);
      return [];
    }
  }

  /**
   * 驗證反饋數據
   */
  private validateFeedback(feedback: FeedbackRecord): void {
    if (!feedback.toolName) {
      throw new Error("工具名稱不能為空");
    }

    if (typeof feedback.success !== "boolean") {
      throw new Error("成功狀態必須是布爾值");
    }

    if (typeof feedback.duration !== "number" || feedback.duration < 0) {
      throw new Error("持續時間必須是非負數");
    }

    if (feedback.userSatisfaction !== undefined) {
      if (
        typeof feedback.userSatisfaction !== "number" ||
        feedback.userSatisfaction < 1 ||
        feedback.userSatisfaction > 5
      ) {
        throw new Error("用戶滿意度必須是 1-5 之間的數字");
      }
    }
  }

  /**
   * 計算工具統計
   */
  private calculateToolStatistics(): Record<string, any> {
    const toolStats: Record<string, any> = {};

    // 按工具分組
    const toolGroups = this.groupByTool();

    for (const [toolName, feedbacks] of toolGroups) {
      const successCount = feedbacks.filter((f) => f.success).length;
      const successRate = successCount / feedbacks.length;

      const satisfactionFeedbacks = feedbacks.filter((f) => f.userSatisfaction !== undefined);
      const averageSatisfaction =
        satisfactionFeedbacks.length > 0
          ? satisfactionFeedbacks.reduce((sum, f) => sum + (f.userSatisfaction || 0), 0) /
            satisfactionFeedbacks.length
          : 0;

      const averageDuration = feedbacks.reduce((sum, f) => sum + f.duration, 0) / feedbacks.length;

      // 統計常見錯誤
      const errorFeedbacks = feedbacks.filter((f) => !f.success && f.errorType);
      const errorCounts = new Map<string, number>();

      for (const feedback of errorFeedbacks) {
        const errorType = feedback.errorType!;
        errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
      }

      const commonErrors = Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([error, _]) => error);

      toolStats[toolName] = {
        count: feedbacks.length,
        successRate,
        averageSatisfaction,
        averageDuration,
        commonErrors,
      };
    }

    return toolStats;
  }

  /**
   * 計算最近趨勢
   */
  private calculateRecentTrends(): {
    dailySuccess: Array<{ date: string; rate: number }>;
    dailySatisfaction: Array<{ date: string; satisfaction: number }>;
  } {
    const days = 7; // 分析最近7天
    const dailySuccess: Array<{ date: string; rate: number }> = [];
    const dailySatisfaction: Array<{ date: string; satisfaction: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split("T")[0];

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayFeedbacks = this.feedbackHistory.filter(
        (f) => f.timestamp >= dayStart.getTime() && f.timestamp <= dayEnd.getTime()
      );

      if (dayFeedbacks.length > 0) {
        // 成功率
        const successCount = dayFeedbacks.filter((f) => f.success).length;
        const successRate = successCount / dayFeedbacks.length;
        dailySuccess.push({ date: dateString, rate: successRate });

        // 滿意度
        const satisfactionFeedbacks = dayFeedbacks.filter((f) => f.userSatisfaction !== undefined);
        if (satisfactionFeedbacks.length > 0) {
          const avgSatisfaction =
            satisfactionFeedbacks.reduce((sum, f) => sum + (f.userSatisfaction || 0), 0) /
            satisfactionFeedbacks.length;
          dailySatisfaction.push({ date: dateString, satisfaction: avgSatisfaction });
        }
      }
    }

    return { dailySuccess, dailySatisfaction };
  }

  /**
   * 生成分析
   */
  private async generateAnalysis(): Promise<FeedbackAnalysis> {
    const statistics = await this.getFeedbackStatistics();

    // 計算整體健康度
    const overallHealth = this.calculateOverallHealth(statistics);

    // 識別問題區域
    const problemAreas = this.identifyProblemAreas(statistics);

    // 生成改進建議
    const improvementSuggestions = this.generateImprovementSuggestions(statistics);

    // 識別積極模式
    const positivePatterns = this.identifyPositivePatterns(statistics);

    return {
      overallHealth,
      problemAreas,
      improvementSuggestions,
      positivePatterns,
    };
  }

  /**
   * 計算整體健康度
   */
  private calculateOverallHealth(statistics: FeedbackStatistics): number {
    if (statistics.totalFeedbacks === 0) return 0.5;

    const successWeight = 0.4;
    const satisfactionWeight = 0.4;
    const volumeWeight = 0.2;

    const successScore = statistics.successRate;
    const satisfactionScore = statistics.averageSatisfaction / 5; // 正規化到 0-1
    const volumeScore = Math.min(1, statistics.totalFeedbacks / 100); // 100個反饋為滿分

    return (
      successScore * successWeight +
      satisfactionScore * satisfactionWeight +
      volumeScore * volumeWeight
    );
  }

  /**
   * 識別問題區域
   */
  private identifyProblemAreas(statistics: FeedbackStatistics): Array<{
    toolName: string;
    issues: string[];
    severity: "low" | "medium" | "high";
    recommendations: string[];
  }> {
    const problemAreas: Array<{
      toolName: string;
      issues: string[];
      severity: "low" | "medium" | "high";
      recommendations: string[];
    }> = [];

    for (const [toolName, stats] of Object.entries(statistics.toolStatistics)) {
      const issues: string[] = [];
      const recommendations: string[] = [];
      let severity: "low" | "medium" | "high" = "low";

      // 檢查成功率
      if (stats.successRate < 0.7) {
        issues.push(`成功率過低 (${(stats.successRate * 100).toFixed(1)}%)`);
        recommendations.push("檢查工具實現和錯誤處理機制");
        severity = stats.successRate < 0.5 ? "high" : "medium";
      }

      // 檢查滿意度
      if (stats.averageSatisfaction < 3 && stats.averageSatisfaction > 0) {
        issues.push(`用戶滿意度偏低 (${stats.averageSatisfaction.toFixed(1)}/5)`);
        recommendations.push("改進用戶體驗和結果質量");
        if (severity === "low") severity = "medium";
      }

      // 檢查性能
      if (stats.averageDuration > 5000) {
        // 超過5秒
        issues.push(`響應時間過長 (${(stats.averageDuration / 1000).toFixed(1)}秒)`);
        recommendations.push("優化工具性能和響應速度");
        if (severity === "low") severity = "medium";
      }

      // 檢查常見錯誤
      if (stats.commonErrors.length > 0) {
        issues.push(`頻繁出現錯誤: ${stats.commonErrors.join(", ")}`);
        recommendations.push("分析和修復常見錯誤原因");
      }

      if (issues.length > 0) {
        problemAreas.push({
          toolName,
          issues,
          severity,
          recommendations,
        });
      }
    }

    return problemAreas.sort((a, b) => {
      const severityOrder: Record<"high" | "medium" | "low", number> = {
        high: 3,
        medium: 2,
        low: 1,
      };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * 生成改進建議
   */
  private generateImprovementSuggestions(statistics: FeedbackStatistics): string[] {
    const suggestions: string[] = [];

    if (statistics.successRate < 0.8) {
      suggestions.push("提高整體工具成功率，重點關注錯誤處理");
    }

    if (statistics.averageSatisfaction < 4) {
      suggestions.push("改善用戶體驗，收集更多用戶反饋");
    }

    if (statistics.totalFeedbacks < 50) {
      suggestions.push("增加反饋收集機制，獲得更多數據洞察");
    }

    return suggestions;
  }

  /**
   * 識別積極模式
   */
  private identifyPositivePatterns(statistics: FeedbackStatistics): string[] {
    const patterns: string[] = [];

    // 找出表現優秀的工具
    const excellentTools = Object.entries(statistics.toolStatistics)
      .filter(([_, stats]) => stats.successRate > 0.9 && stats.averageSatisfaction > 4)
      .map(([toolName, _]) => toolName);

    if (excellentTools.length > 0) {
      patterns.push(`表現優秀的工具: ${excellentTools.join(", ")}`);
    }

    if (statistics.successRate > 0.9) {
      patterns.push("整體工具成功率表現優異");
    }

    if (statistics.averageSatisfaction > 4) {
      patterns.push("用戶滿意度保持在高水平");
    }

    return patterns;
  }

  /**
   * 按工具分組反饋
   */
  private groupByTool(): Map<string, FeedbackRecord[]> {
    const groups = new Map<string, FeedbackRecord[]>();

    for (const feedback of this.feedbackHistory) {
      if (!groups.has(feedback.toolName)) {
        groups.set(feedback.toolName, []);
      }
      groups.get(feedback.toolName)!.push(feedback);
    }

    return groups;
  }

  /**
   * 檢查是否應該使用緩存
   */
  private shouldUseCache(): boolean {
    return Date.now() - this.lastCacheUpdate < this.cacheExpiration;
  }

  /**
   * 獲取空統計
   */
  private getEmptyStatistics(): FeedbackStatistics {
    return {
      totalFeedbacks: 0,
      averageSatisfaction: 0,
      successRate: 0,
      toolStatistics: {},
      recentTrends: {
        dailySuccess: [],
        dailySatisfaction: [],
      },
    };
  }

  /**
   * 獲取空分析
   */
  private getEmptyAnalysis(): FeedbackAnalysis {
    return {
      overallHealth: 0.5,
      problemAreas: [],
      improvementSuggestions: ["收集更多反饋數據以進行分析"],
      positivePatterns: [],
    };
  }

  /**
   * 重置收集器
   */
  async reset(): Promise<void> {
    this.feedbackHistory = [];
    this.analysisCache = null;
    this.lastCacheUpdate = 0;
    logInfo("反饋收集器已重置");
  }

  /**
   * 導出反饋數據
   */
  exportFeedback(): {
    feedbacks: FeedbackRecord[];
    statistics: FeedbackStatistics;
    metadata: {
      exportTime: number;
      totalRecords: number;
    };
  } {
    return {
      feedbacks: [...this.feedbackHistory],
      statistics: this.getEmptyStatistics(), // 需要異步計算，這裡返回空統計
      metadata: {
        exportTime: Date.now(),
        totalRecords: this.feedbackHistory.length,
      },
    };
  }
}
