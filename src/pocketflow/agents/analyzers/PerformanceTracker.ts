import { logInfo, logError } from "@/logger";

/**
 * 工具性能統計介面
 */
export interface ToolPerformanceStats {
  name: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  successRate: number;
  reliabilityScore: number;
  lastUsed: number;
  recentPerformance: number; // 最近的性能分數
}

/**
 * 性能記錄介面
 */
export interface PerformanceRecord {
  toolName: string;
  success: boolean;
  duration: number;
  timestamp: number;
  errorType?: string;
}

/**
 * 性能追蹤器
 *
 * 負責追蹤和分析工具的性能，包括：
 * - 成功率統計
 * - 執行時間分析
 * - 可靠性評估
 * - 性能趨勢分析
 */
export class PerformanceTracker {
  private performanceHistory: Map<string, PerformanceRecord[]>;
  private statsCache: Map<string, ToolPerformanceStats>;
  private maxHistorySize: number;
  private cacheExpiration: number;
  private lastCacheUpdate: number;

  constructor(maxHistorySize: number = 1000, cacheExpirationMs: number = 5 * 60 * 1000) {
    this.performanceHistory = new Map();
    this.statsCache = new Map();
    this.maxHistorySize = maxHistorySize;
    this.cacheExpiration = cacheExpirationMs;
    this.lastCacheUpdate = 0;
  }

  /**
   * 獲取工具性能分數
   */
  async getPerformanceScores(tools: any[]): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    try {
      // 更新統計緩存（如果需要）
      if (this.shouldUpdateCache()) {
        await this.updateStatsCache();
      }

      for (const tool of tools) {
        const toolName = this.getToolName(tool);
        const stats = this.statsCache.get(toolName);

        if (stats) {
          scores[toolName] = this.calculatePerformanceScore(stats);
        } else {
          // 新工具，給予中性分數
          scores[toolName] = 0.5;
        }
      }

      logInfo(`性能分析完成，分析了 ${tools.length} 個工具`);
      return scores;
    } catch (error) {
      logError("性能分析失敗:", error);
      return {};
    }
  }

  /**
   * 更新工具性能
   */
  async updatePerformance(
    toolName: string,
    success: boolean,
    duration: number,
    errorType?: string
  ): Promise<void> {
    const record: PerformanceRecord = {
      toolName,
      success,
      duration,
      timestamp: Date.now(),
      errorType,
    };

    // 添加到歷史記錄
    let history = this.performanceHistory.get(toolName) || [];
    history.push(record);

    // 限制歷史記錄大小
    if (history.length > this.maxHistorySize) {
      history = history.slice(-this.maxHistorySize);
    }

    this.performanceHistory.set(toolName, history);

    // 清除緩存以觸發重新計算
    this.statsCache.delete(toolName);
    this.lastCacheUpdate = 0;

    logInfo(`更新工具性能: ${toolName}, 成功: ${success}, 耗時: ${duration}ms`);
  }

  /**
   * 獲取工具統計信息
   */
  async getToolStats(toolName: string): Promise<ToolPerformanceStats | null> {
    if (this.shouldUpdateCache()) {
      await this.updateStatsCache();
    }

    return this.statsCache.get(toolName) || null;
  }

  /**
   * 獲取所有統計信息
   */
  async getStatistics(): Promise<Record<string, ToolPerformanceStats>> {
    if (this.shouldUpdateCache()) {
      await this.updateStatsCache();
    }

    const stats: Record<string, ToolPerformanceStats> = {};
    for (const [toolName, toolStats] of this.statsCache) {
      stats[toolName] = toolStats;
    }

    return stats;
  }

  /**
   * 計算性能分數
   */
  private calculatePerformanceScore(stats: ToolPerformanceStats): number {
    // 多維度性能評估
    const weights = {
      successRate: 0.4, // 成功率權重
      reliability: 0.3, // 可靠性權重
      speed: 0.2, // 速度權重
      recency: 0.1, // 最近使用權重
    };

    // 1. 成功率分數 (0-1)
    const successScore = stats.successRate;

    // 2. 可靠性分數 (0-1)
    const reliabilityScore = stats.reliabilityScore;

    // 3. 速度分數 (基於平均執行時間)
    const speedScore = this.calculateSpeedScore(stats.averageDuration);

    // 4. 最近使用分數
    const recencyScore = this.calculateRecencyScore(stats.lastUsed);

    // 計算加權總分
    const totalScore =
      successScore * weights.successRate +
      reliabilityScore * weights.reliability +
      speedScore * weights.speed +
      recencyScore * weights.recency;

    return Math.max(0, Math.min(1, totalScore));
  }

  /**
   * 計算速度分數
   */
  private calculateSpeedScore(averageDuration: number): number {
    // 將執行時間轉換為分數 (越快分數越高)
    // 假設理想執行時間為 100ms，超過 5000ms 分數為 0
    const idealTime = 100;
    const maxTime = 5000;

    if (averageDuration <= idealTime) {
      return 1;
    } else if (averageDuration >= maxTime) {
      return 0;
    } else {
      return 1 - (averageDuration - idealTime) / (maxTime - idealTime);
    }
  }

  /**
   * 計算最近使用分數
   */
  private calculateRecencyScore(lastUsed: number): number {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const timeSinceLastUse = now - lastUsed;

    if (timeSinceLastUse <= dayInMs) {
      return 1; // 一天內使用過
    } else if (timeSinceLastUse <= 7 * dayInMs) {
      return 0.8; // 一週內使用過
    } else if (timeSinceLastUse <= 30 * dayInMs) {
      return 0.5; // 一個月內使用過
    } else {
      return 0.2; // 很久沒用過
    }
  }

  /**
   * 更新統計緩存
   */
  private async updateStatsCache(): Promise<void> {
    this.statsCache.clear();

    for (const [toolName, history] of this.performanceHistory) {
      const stats = this.calculateToolStats(toolName, history);
      this.statsCache.set(toolName, stats);
    }

    this.lastCacheUpdate = Date.now();
  }

  /**
   * 計算工具統計
   */
  private calculateToolStats(toolName: string, history: PerformanceRecord[]): ToolPerformanceStats {
    if (history.length === 0) {
      return {
        name: toolName,
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
        successRate: 0,
        reliabilityScore: 0,
        lastUsed: 0,
        recentPerformance: 0,
      };
    }

    const totalExecutions = history.length;
    const successCount = history.filter((r) => r.success).length;
    const failureCount = totalExecutions - successCount;
    const successRate = successCount / totalExecutions;

    // 計算平均執行時間
    const totalDuration = history.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = totalDuration / totalExecutions;

    // 計算可靠性分數 (考慮時間趨勢)
    const reliabilityScore = this.calculateReliabilityScore(history);

    // 最後使用時間
    const lastUsed = Math.max(...history.map((r) => r.timestamp));

    // 最近性能 (最近10次執行的性能)
    const recentHistory = history.slice(-10);
    const recentPerformance = this.calculateRecentPerformance(recentHistory);

    return {
      name: toolName,
      totalExecutions,
      successCount,
      failureCount,
      averageDuration,
      successRate,
      reliabilityScore,
      lastUsed,
      recentPerformance,
    };
  }

  /**
   * 計算可靠性分數
   */
  private calculateReliabilityScore(history: PerformanceRecord[]): number {
    if (history.length < 3) {
      // 數據不足，返回基於成功率的分數
      const successCount = history.filter((r) => r.success).length;
      return successCount / history.length;
    }

    // 計算時間加權的可靠性
    const now = Date.now();
    let weightedSuccess = 0;
    let totalWeight = 0;

    for (const record of history) {
      // 越近的記錄權重越高
      const age = now - record.timestamp;
      const weight = Math.exp(-age / (7 * 24 * 60 * 60 * 1000)); // 7天衰減

      totalWeight += weight;
      if (record.success) {
        weightedSuccess += weight;
      }
    }

    return totalWeight > 0 ? weightedSuccess / totalWeight : 0;
  }

  /**
   * 計算最近性能
   */
  private calculateRecentPerformance(recentHistory: PerformanceRecord[]): number {
    if (recentHistory.length === 0) {
      return 0;
    }

    const recentSuccessRate = recentHistory.filter((r) => r.success).length / recentHistory.length;
    const recentAvgDuration =
      recentHistory.reduce((sum, r) => sum + r.duration, 0) / recentHistory.length;
    const speedScore = this.calculateSpeedScore(recentAvgDuration);

    // 結合成功率和速度
    return recentSuccessRate * 0.7 + speedScore * 0.3;
  }

  /**
   * 檢查是否需要更新緩存
   */
  private shouldUpdateCache(): boolean {
    return Date.now() - this.lastCacheUpdate > this.cacheExpiration;
  }

  /**
   * 獲取工具名稱
   */
  private getToolName(tool: any): string {
    return tool.name || tool.function?.name || "unknown";
  }

  /**
   * 獲取性能趨勢
   */
  getPerformanceTrend(
    toolName: string,
    days: number = 7
  ): {
    timestamps: number[];
    successRates: number[];
    avgDurations: number[];
  } {
    const history = this.performanceHistory.get(toolName) || [];
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const recentHistory = history.filter((r) => r.timestamp >= cutoffTime);

    // 按天分組
    const dailyData = new Map<string, PerformanceRecord[]>();

    for (const record of recentHistory) {
      const date = new Date(record.timestamp).toDateString();
      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push(record);
    }

    const timestamps: number[] = [];
    const successRates: number[] = [];
    const avgDurations: number[] = [];

    for (const [date, records] of dailyData) {
      timestamps.push(new Date(date).getTime());

      const successCount = records.filter((r) => r.success).length;
      const successRate = successCount / records.length;
      successRates.push(successRate);

      const avgDuration = records.reduce((sum, r) => sum + r.duration, 0) / records.length;
      avgDurations.push(avgDuration);
    }

    return { timestamps, successRates, avgDurations };
  }

  /**
   * 獲取工具排名
   */
  async getToolRanking(): Promise<
    Array<{ name: string; score: number; stats: ToolPerformanceStats }>
  > {
    const stats = await this.getStatistics();
    const ranking = Object.entries(stats)
      .map(([name, toolStats]) => ({
        name,
        score: this.calculatePerformanceScore(toolStats),
        stats: toolStats,
      }))
      .sort((a, b) => b.score - a.score);

    return ranking;
  }

  /**
   * 清理舊數據
   */
  cleanupOldData(daysToKeep: number = 30): void {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    for (const [toolName, history] of this.performanceHistory) {
      const filteredHistory = history.filter((r) => r.timestamp >= cutoffTime);
      if (filteredHistory.length !== history.length) {
        this.performanceHistory.set(toolName, filteredHistory);
      }
    }

    // 清除緩存以觸發重新計算
    this.statsCache.clear();
    this.lastCacheUpdate = 0;

    logInfo(`清理了 ${daysToKeep} 天前的性能數據`);
  }

  /**
   * 導出性能數據
   */
  exportData(): {
    history: Record<string, PerformanceRecord[]>;
    stats: Record<string, ToolPerformanceStats>;
    metadata: {
      exportTime: number;
      totalTools: number;
      totalRecords: number;
    };
  } {
    const history: Record<string, PerformanceRecord[]> = {};
    let totalRecords = 0;

    for (const [toolName, records] of this.performanceHistory) {
      history[toolName] = records;
      totalRecords += records.length;
    }

    const stats: Record<string, ToolPerformanceStats> = {};
    for (const [toolName, toolStats] of this.statsCache) {
      stats[toolName] = toolStats;
    }

    return {
      history,
      stats,
      metadata: {
        exportTime: Date.now(),
        totalTools: this.performanceHistory.size,
        totalRecords,
      },
    };
  }

  /**
   * 重置性能追蹤器
   */
  async reset(): Promise<void> {
    this.performanceHistory.clear();
    this.statsCache.clear();
    this.lastCacheUpdate = 0;
    logInfo("性能追蹤器已重置");
  }
}
