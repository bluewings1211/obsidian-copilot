import { ChatSharedState } from "../../types";
import { ToolCandidate } from "../ToolSelectionAgent";
import { logInfo, logError } from "@/logger";

/**
 * 使用模式介面
 */
export interface UsagePattern {
  id: string;
  pattern: string;
  tools: string[];
  confidence: number;
  frequency: number;
  lastSeen: number;
  contexts: string[];
}

/**
 * 查詢上下文介面
 */
export interface QueryContext {
  query: string;
  timestamp: number;
  selectedTool: string;
  userSatisfaction?: number;
  sessionDuration: number;
  previousTools: string[];
}

/**
 * 模式統計介面
 */
export interface PatternStatistics {
  totalPatterns: number;
  activePatterns: number;
  mostFrequentPattern: UsagePattern | null;
  recentPatterns: UsagePattern[];
  toolUsageDistribution: Record<string, number>;
}

/**
 * 使用模式學習器
 *
 * 負責學習和識別用戶的工具使用模式，包括：
 * - 查詢模式識別
 * - 工具選擇序列分析
 * - 上下文關聯學習
 * - 時間模式分析
 */
export class UsagePatternLearner {
  private patterns: Map<string, UsagePattern>;
  private queryHistory: QueryContext[];
  private maxHistorySize: number;
  private minPatternFrequency: number;
  private patternExpirationDays: number;

  constructor(
    maxHistorySize: number = 1000,
    minPatternFrequency: number = 3,
    patternExpirationDays: number = 30
  ) {
    this.patterns = new Map();
    this.queryHistory = [];
    this.maxHistorySize = maxHistorySize;
    this.minPatternFrequency = minPatternFrequency;
    this.patternExpirationDays = patternExpirationDays;
  }

  /**
   * 記錄工具使用
   */
  async recordUsage(
    query: string,
    selectedTool: ToolCandidate,
    shared: ChatSharedState
  ): Promise<void> {
    try {
      const context: QueryContext = {
        query: this.normalizeQuery(query),
        timestamp: Date.now(),
        selectedTool: selectedTool.name,
        sessionDuration: this.calculateSessionDuration(shared),
        previousTools: this.getPreviousTools(5), // 獲取前5個工具
      };

      // 添加到歷史記錄
      this.queryHistory.push(context);

      // 限制歷史記錄大小
      if (this.queryHistory.length > this.maxHistorySize) {
        this.queryHistory = this.queryHistory.slice(-this.maxHistorySize);
      }

      // 分析和更新模式
      await this.analyzeAndUpdatePatterns();

      logInfo(`記錄工具使用: ${selectedTool.name} for query: ${query.substring(0, 50)}...`);
    } catch (error) {
      logError("記錄使用模式失敗:", error);
    }
  }

  /**
   * 獲取相關模式
   */
  async getRelevantPatterns(query: string, context: ChatSharedState): Promise<UsagePattern[]> {
    try {
      const normalizedQuery = this.normalizeQuery(query);
      const relevantPatterns: { pattern: UsagePattern; score: number }[] = [];

      for (const pattern of this.patterns.values()) {
        const score = this.calculatePatternRelevance(normalizedQuery, pattern, context);

        if (score > 0.3) {
          // 最低相關性閾值
          relevantPatterns.push({ pattern, score });
        }
      }

      // 按相關性排序
      relevantPatterns.sort((a, b) => b.score - a.score);

      return relevantPatterns.slice(0, 5).map((rp) => rp.pattern);
    } catch (error) {
      logError("獲取相關模式失敗:", error);
      return [];
    }
  }

  /**
   * 獲取模式統計
   */
  async getPatterns(): Promise<PatternStatistics> {
    try {
      const allPatterns = Array.from(this.patterns.values());
      const activePatterns = allPatterns.filter((p) => this.isPatternActive(p));

      // 找出最頻繁的模式
      const mostFrequentPattern = allPatterns.reduce(
        (max: UsagePattern | null, pattern) =>
          pattern.frequency > (max?.frequency || 0) ? pattern : max,
        null as UsagePattern | null
      );

      // 獲取最近的模式
      const recentPatterns = allPatterns
        .filter((p) => Date.now() - p.lastSeen < 7 * 24 * 60 * 60 * 1000) // 7天內
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 10);

      // 計算工具使用分佈
      const toolUsageDistribution = this.calculateToolDistribution();

      return {
        totalPatterns: allPatterns.length,
        activePatterns: activePatterns.length,
        mostFrequentPattern,
        recentPatterns,
        toolUsageDistribution,
      };
    } catch (error) {
      logError("獲取模式統計失敗:", error);
      return {
        totalPatterns: 0,
        activePatterns: 0,
        mostFrequentPattern: null,
        recentPatterns: [],
        toolUsageDistribution: {},
      };
    }
  }

  /**
   * 分析並更新模式
   */
  private async analyzeAndUpdatePatterns(): Promise<void> {
    // 1. 序列模式分析
    await this.analyzeSequencePatterns();

    // 2. 查詢模式分析
    await this.analyzeQueryPatterns();

    // 3. 時間模式分析
    await this.analyzeTimePatterns();

    // 4. 清理過期模式
    this.cleanupExpiredPatterns();
  }

  /**
   * 分析序列模式
   */
  private async analyzeSequencePatterns(): Promise<void> {
    const recentHistory = this.queryHistory.slice(-20); // 分析最近20次使用

    // 尋找工具使用序列
    for (let i = 0; i < recentHistory.length - 1; i++) {
      const current = recentHistory[i];
      const next = recentHistory[i + 1];

      // 檢查是否在相近時間內使用
      const timeDiff = next.timestamp - current.timestamp;
      if (timeDiff < 10 * 60 * 1000) {
        // 10分鐘內
        const sequencePattern = `${current.selectedTool} -> ${next.selectedTool}`;
        this.updateOrCreatePattern(
          `sequence_${sequencePattern}`,
          sequencePattern,
          [current.selectedTool, next.selectedTool],
          [current.query, next.query]
        );
      }
    }
  }

  /**
   * 分析查詢模式
   */
  private async analyzeQueryPatterns(): Promise<void> {
    // 按工具分組查詢
    const toolQueries = new Map<string, string[]>();

    for (const context of this.queryHistory) {
      if (!toolQueries.has(context.selectedTool)) {
        toolQueries.set(context.selectedTool, []);
      }
      toolQueries.get(context.selectedTool)!.push(context.query);
    }

    // 為每個工具分析查詢模式
    for (const [tool, queries] of toolQueries) {
      const commonKeywords = this.extractCommonKeywords(queries);
      if (commonKeywords.length > 0) {
        const pattern = `${tool}_keywords: ${commonKeywords.join(", ")}`;
        this.updateOrCreatePattern(`query_${tool}`, pattern, [tool], commonKeywords);
      }
    }
  }

  /**
   * 分析時間模式
   */
  private async analyzeTimePatterns(): Promise<void> {
    // 按小時分組工具使用
    const hourlyUsage = new Map<number, Map<string, number>>();

    for (const context of this.queryHistory) {
      const hour = new Date(context.timestamp).getHours();

      if (!hourlyUsage.has(hour)) {
        hourlyUsage.set(hour, new Map());
      }

      const hourMap = hourlyUsage.get(hour)!;
      const count = hourMap.get(context.selectedTool) || 0;
      hourMap.set(context.selectedTool, count + 1);
    }

    // 識別特定時間的偏好工具
    for (const [hour, toolMap] of hourlyUsage) {
      const mostUsedTool = Array.from(toolMap.entries()).sort((a, b) => b[1] - a[1])[0];

      if (mostUsedTool && mostUsedTool[1] >= this.minPatternFrequency) {
        const pattern = `${hour}時偏好使用 ${mostUsedTool[0]}`;
        this.updateOrCreatePattern(
          `time_${hour}_${mostUsedTool[0]}`,
          pattern,
          [mostUsedTool[0]],
          [`hour_${hour}`]
        );
      }
    }
  }

  /**
   * 更新或創建模式
   */
  private updateOrCreatePattern(
    id: string,
    pattern: string,
    tools: string[],
    contexts: string[]
  ): void {
    const existing = this.patterns.get(id);

    if (existing) {
      // 更新現有模式
      existing.frequency += 1;
      existing.lastSeen = Date.now();
      existing.confidence = Math.min(1, existing.frequency / 10); // 最多10次後達到最高信心

      // 合併上下文
      for (const context of contexts) {
        if (!existing.contexts.includes(context)) {
          existing.contexts.push(context);
        }
      }
    } else {
      // 創建新模式
      const newPattern: UsagePattern = {
        id,
        pattern,
        tools,
        confidence: 0.1,
        frequency: 1,
        lastSeen: Date.now(),
        contexts,
      };

      this.patterns.set(id, newPattern);
    }
  }

  /**
   * 計算模式相關性
   */
  private calculatePatternRelevance(
    query: string,
    pattern: UsagePattern,
    context: ChatSharedState
  ): number {
    let relevance = 0;

    // 1. 查詢關鍵詞匹配
    const queryWords = query.toLowerCase().split(/\s+/);
    let keywordMatches = 0;

    for (const contextItem of pattern.contexts) {
      for (const word of queryWords) {
        if (contextItem.toLowerCase().includes(word) || word.includes(contextItem.toLowerCase())) {
          keywordMatches++;
        }
      }
    }

    const keywordRelevance = keywordMatches / queryWords.length;
    relevance += keywordRelevance * 0.4;

    // 2. 模式頻率和信心度
    relevance += pattern.confidence * 0.3;

    // 3. 最近使用程度
    const daysSinceLastUse = (Date.now() - pattern.lastSeen) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - daysSinceLastUse / 30); // 30天內的相關性
    relevance += recencyScore * 0.2;

    // 4. 上下文匹配
    const contextScore = this.calculateContextMatch(pattern, context);
    relevance += contextScore * 0.1;

    return Math.min(1, relevance);
  }

  /**
   * 計算上下文匹配度
   */
  private calculateContextMatch(pattern: UsagePattern, context: ChatSharedState): number {
    let matchScore = 0;

    // 檢查當前步驟
    if (context.currentStep) {
      const stepContext = context.currentStep.toLowerCase();
      const hasStepMatch = pattern.contexts.some(
        (c) => c.toLowerCase().includes(stepContext) || stepContext.includes(c.toLowerCase())
      );
      if (hasStepMatch) matchScore += 0.5;
    }

    // 檢查已使用的工具
    if (context.toolCalls && context.toolCalls.length > 0) {
      const usedTools = context.toolCalls.map((tc) => tc.tool?.name || "");
      const hasToolMatch = pattern.tools.some((tool) => usedTools.includes(tool));
      if (hasToolMatch) matchScore += 0.3;
    }

    return Math.min(1, matchScore);
  }

  /**
   * 提取常見關鍵詞
   */
  private extractCommonKeywords(queries: string[]): string[] {
    const wordCount = new Map<string, number>();

    for (const query of queries) {
      const words = this.normalizeQuery(query).split(/\s+/);
      for (const word of words) {
        if (word.length > 2) {
          // 忽略短詞
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }
      }
    }

    // 返回出現頻率高的詞
    return Array.from(wordCount.entries())
      .filter(([_, count]) => count >= Math.max(2, queries.length * 0.3))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, _]) => word);
  }

  /**
   * 正規化查詢
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[@#]/g, " ")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 計算會話持續時間
   */
  private calculateSessionDuration(shared: ChatSharedState): number {
    // 這裡可以實現更複雜的會話時間計算
    const firstMessageTime = shared.chatHistory?.[0]?.timestamp;
    if (typeof firstMessageTime === "number") {
      return Date.now() - firstMessageTime;
    }
    return 0; // 如果沒有聊天歷史，返回0
  }

  /**
   * 獲取前幾個使用的工具
   */
  private getPreviousTools(count: number): string[] {
    return this.queryHistory.slice(-count).map((context) => context.selectedTool);
  }

  /**
   * 檢查模式是否仍然活躍
   */
  private isPatternActive(pattern: UsagePattern): boolean {
    const daysSinceLastUse = (Date.now() - pattern.lastSeen) / (1000 * 60 * 60 * 24);
    return (
      daysSinceLastUse <= this.patternExpirationDays &&
      pattern.frequency >= this.minPatternFrequency
    );
  }

  /**
   * 計算工具使用分佈
   */
  private calculateToolDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const context of this.queryHistory) {
      distribution[context.selectedTool] = (distribution[context.selectedTool] || 0) + 1;
    }

    return distribution;
  }

  /**
   * 清理過期模式
   */
  private cleanupExpiredPatterns(): void {
    const expiredPatterns: string[] = [];

    for (const [id, pattern] of this.patterns) {
      if (!this.isPatternActive(pattern)) {
        expiredPatterns.push(id);
      }
    }

    for (const id of expiredPatterns) {
      this.patterns.delete(id);
    }

    if (expiredPatterns.length > 0) {
      logInfo(`清理了 ${expiredPatterns.length} 個過期模式`);
    }
  }

  /**
   * 重置學習器
   */
  async reset(): Promise<void> {
    this.patterns.clear();
    this.queryHistory = [];
    logInfo("使用模式學習器已重置");
  }

  /**
   * 導出模式數據
   */
  exportPatterns(): {
    patterns: UsagePattern[];
    queryHistory: QueryContext[];
    metadata: {
      exportTime: number;
      totalPatterns: number;
      totalQueries: number;
    };
  } {
    return {
      patterns: Array.from(this.patterns.values()),
      queryHistory: this.queryHistory,
      metadata: {
        exportTime: Date.now(),
        totalPatterns: this.patterns.size,
        totalQueries: this.queryHistory.length,
      },
    };
  }
}
