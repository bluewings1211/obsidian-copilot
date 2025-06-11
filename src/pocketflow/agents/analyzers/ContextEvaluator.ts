import { ChatSharedState } from "../../types";
import { logInfo, logError } from "@/logger";

/**
 * 上下文相關性分數介面
 */
export interface ContextRelevance {
  chatHistory: number;
  currentSession: number;
  userBehavior: number;
  timeContext: number;
  overall: number;
}

/**
 * 上下文評估器
 *
 * 負責評估工具與當前上下文的相關性，包括：
 * - 聊天歷史分析
 * - 用戶行為模式
 * - 時間上下文
 * - 會話狀態
 */
export class ContextEvaluator {
  private recentTools: Map<string, number[]>; // 工具名稱 -> 使用時間戳列表
  private sessionStartTime: number;
  private contextWindow: number; // 上下文窗口大小（毫秒）

  constructor(contextWindowMs: number = 30 * 60 * 1000) {
    // 默認30分鐘
    this.recentTools = new Map();
    this.sessionStartTime = Date.now();
    this.contextWindow = contextWindowMs;
  }

  /**
   * 評估工具與上下文的相關性
   */
  async evaluateContext(
    query: string,
    tools: any[],
    shared: ChatSharedState
  ): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    try {
      for (const tool of tools) {
        const toolName = this.getToolName(tool);
        const relevance = await this.calculateContextRelevance(toolName, query, shared);
        scores[toolName] = relevance.overall;
      }

      logInfo(`上下文評估完成，評估了 ${tools.length} 個工具`);
      return scores;
    } catch (error) {
      logError("上下文評估失敗:", error);
      return {};
    }
  }

  /**
   * 計算上下文相關性
   */
  private async calculateContextRelevance(
    toolName: string,
    query: string,
    shared: ChatSharedState
  ): Promise<ContextRelevance> {
    // 1. 聊天歷史相關性
    const chatHistory = this.evaluateChatHistory(toolName, shared);

    // 2. 當前會話相關性
    const currentSession = this.evaluateCurrentSession(toolName, shared);

    // 3. 用戶行為相關性
    const userBehavior = this.evaluateUserBehavior(toolName, query, shared);

    // 4. 時間上下文相關性
    const timeContext = this.evaluateTimeContext(toolName, shared);

    // 5. 計算綜合分數
    const overall = this.calculateOverallScore(
      chatHistory,
      currentSession,
      userBehavior,
      timeContext
    );

    return {
      chatHistory,
      currentSession,
      userBehavior,
      timeContext,
      overall,
    };
  }

  /**
   * 評估聊天歷史相關性
   */
  private evaluateChatHistory(toolName: string, shared: ChatSharedState): number {
    const chatHistory = shared.chatHistory || [];
    let relevanceScore = 0;
    const totalMessages = chatHistory.length;

    if (totalMessages === 0) {
      return 0.5; // 沒有歷史時返回中性分數
    }

    // 分析最近的聊天消息
    const recentMessages = chatHistory.slice(-10); // 最近10條消息

    for (let i = 0; i < recentMessages.length; i++) {
      const message = recentMessages[i];
      const messageContent = message.message.toLowerCase();
      const weight = (i + 1) / recentMessages.length; // 越近的消息權重越高

      // 檢查消息中是否提到該工具或相關關鍵詞
      if (this.isToolMentioned(toolName, messageContent)) {
        relevanceScore += weight * 0.3;
      }

      // 檢查消息類型相關性
      if (this.isMessageTypeRelevant(toolName, message)) {
        relevanceScore += weight * 0.2;
      }
    }

    // 檢查是否存在工具使用模式
    const patternScore = this.detectUsagePattern(toolName, chatHistory);
    relevanceScore += patternScore * 0.5;

    return Math.min(1, relevanceScore);
  }

  /**
   * 評估當前會話相關性
   */
  private evaluateCurrentSession(toolName: string, shared: ChatSharedState): number {
    let sessionScore = 0;

    // 檢查當前會話中是否已經使用過該工具
    const toolCalls = shared.toolCalls || [];
    const hasBeenUsed = toolCalls.some((call) => this.getToolName(call.tool) === toolName);

    if (hasBeenUsed) {
      sessionScore += 0.3; // 已使用過的工具在當前會話中更相關
    }

    // 檢查會話狀態
    if (shared.currentStep) {
      const stepRelevance = this.getStepRelevance(toolName, shared.currentStep);
      sessionScore += stepRelevance * 0.4;
    }

    // 檢查是否有相關的上下文數據
    if (shared.context) {
      const contextRelevance = this.getContextDataRelevance(toolName, shared.context);
      sessionScore += contextRelevance * 0.3;
    }

    return Math.min(1, sessionScore);
  }

  /**
   * 評估用戶行為相關性
   */
  private evaluateUserBehavior(toolName: string, query: string, shared: ChatSharedState): number {
    let behaviorScore = 0;

    // 檢查查詢中的行為意圖
    const intentScore = this.analyzeQueryIntent(toolName, query);
    behaviorScore += intentScore * 0.4;

    // 檢查用戶偏好（基於歷史使用）
    const preferenceScore = this.getUserPreference(toolName);
    behaviorScore += preferenceScore * 0.3;

    // 檢查查詢的緊急性和重要性
    const urgencyScore = this.analyzeQueryUrgency(query);
    const toolUrgencyMatch = this.getToolUrgencyMatch(toolName, urgencyScore);
    behaviorScore += toolUrgencyMatch * 0.3;

    return Math.min(1, behaviorScore);
  }

  /**
   * 評估時間上下文相關性
   */
  private evaluateTimeContext(toolName: string, shared: ChatSharedState): number {
    let timeScore = 0;

    // 檢查工具的最近使用頻率
    const recentUsage = this.getRecentUsage(toolName);
    timeScore += recentUsage * 0.4;

    // 檢查時間敏感性
    const timeSensitivity = this.getTimeSensitivity(toolName, shared);
    timeScore += timeSensitivity * 0.3;

    // 檢查會話持續時間對工具選擇的影響
    const sessionDuration = Date.now() - this.sessionStartTime;
    const durationEffect = this.getSessionDurationEffect(toolName, sessionDuration);
    timeScore += durationEffect * 0.3;

    return Math.min(1, timeScore);
  }

  /**
   * 計算綜合分數
   */
  private calculateOverallScore(
    chatHistory: number,
    currentSession: number,
    userBehavior: number,
    timeContext: number
  ): number {
    // 加權平均，可以根據需要調整權重
    const weights = {
      chatHistory: 0.3,
      currentSession: 0.25,
      userBehavior: 0.25,
      timeContext: 0.2,
    };

    return (
      chatHistory * weights.chatHistory +
      currentSession * weights.currentSession +
      userBehavior * weights.userBehavior +
      timeContext * weights.timeContext
    );
  }

  // 輔助方法

  private getToolName(tool: any): string {
    return tool.name || tool.function?.name || "unknown";
  }

  private isToolMentioned(toolName: string, messageContent: string): boolean {
    const normalizedToolName = toolName.toLowerCase();
    const normalizedContent = messageContent.toLowerCase();

    // 直接提及
    if (normalizedContent.includes(normalizedToolName)) {
      return true;
    }

    // 相關關鍵詞
    const keywords = this.getToolKeywords(toolName);
    return keywords.some((keyword) => normalizedContent.includes(keyword.toLowerCase()));
  }

  private isMessageTypeRelevant(toolName: string, message: any): boolean {
    // 根據消息類型判斷工具相關性
    if (message.role === "user") {
      return true; // 用戶消息通常更相關
    }
    return false;
  }

  private detectUsagePattern(toolName: string, chatHistory: any[]): number {
    // 檢測工具使用模式，如：用戶傾向於在特定情況下使用某工具
    const patternScore = 0;

    // 簡單的模式檢測：在相似查詢後使用該工具
    // 這裡可以實現更複雜的模式檢測算法

    return patternScore;
  }

  private getStepRelevance(toolName: string, currentStep: string): number {
    const stepMappings: Record<string, string[]> = {
      意圖分析: ["localSearch", "webSearch", "time"],
      本地搜索: ["localSearch", "index"],
      網路搜索: ["webSearch", "brave"],
      工具執行: ["mcp_", "pomodoro", "file"],
    };

    for (const [step, relevantTools] of Object.entries(stepMappings)) {
      if (currentStep.includes(step)) {
        const isRelevant = relevantTools.some((tool) =>
          toolName.toLowerCase().includes(tool.toLowerCase())
        );
        return isRelevant ? 0.8 : 0.2;
      }
    }

    return 0.5;
  }

  private getContextDataRelevance(toolName: string, context: any): number {
    let relevance = 0;

    if (context.notes && toolName.includes("search")) {
      relevance += 0.3;
    }
    if (context.urls && toolName.includes("web")) {
      relevance += 0.3;
    }
    if (context.timeExpression && toolName.includes("time")) {
      relevance += 0.4;
    }

    return Math.min(1, relevance);
  }

  private analyzeQueryIntent(toolName: string, query: string): number {
    const normalizedQuery = query.toLowerCase();

    // 意圖關鍵詞映射
    const intentMappings = new Map([
      ["search", ["找", "搜", "查", "find", "search", "look"]],
      ["time", ["時間", "現在", "今天", "time", "now", "today"]],
      ["web", ["網路", "線上", "web", "online", "internet"]],
      ["file", ["文件", "檔案", "file", "document"]],
    ]);

    for (const [intent, keywords] of intentMappings) {
      if (toolName.toLowerCase().includes(intent)) {
        const hasIntentKeyword = keywords.some((keyword) => normalizedQuery.includes(keyword));
        if (hasIntentKeyword) {
          return 0.8;
        }
      }
    }

    return 0.3;
  }

  private getUserPreference(toolName: string): number {
    // 基於歷史使用頻率計算用戶偏好
    const usageHistory = this.recentTools.get(toolName) || [];
    const recentUsages = usageHistory.filter(
      (timestamp) => Date.now() - timestamp < this.contextWindow
    );

    // 使用頻率轉換為偏好分數
    return Math.min(1, recentUsages.length / 10);
  }

  private analyzeQueryUrgency(query: string): number {
    const urgentKeywords = [
      "緊急",
      "快速",
      "立即",
      "現在",
      "urgent",
      "quickly",
      "now",
      "immediately",
    ];
    const normalizedQuery = query.toLowerCase();

    const hasUrgentKeyword = urgentKeywords.some((keyword) => normalizedQuery.includes(keyword));

    return hasUrgentKeyword ? 0.9 : 0.5;
  }

  private getToolUrgencyMatch(toolName: string, urgencyScore: number): number {
    // 某些工具更適合緊急請求
    const fastTools = ["time", "current", "quick"];
    const isFastTool = fastTools.some((fast) => toolName.toLowerCase().includes(fast));

    if (urgencyScore > 0.7 && isFastTool) {
      return 0.8;
    }
    if (urgencyScore < 0.3 && !isFastTool) {
      return 0.8;
    }

    return 0.5;
  }

  private getRecentUsage(toolName: string): number {
    const usageHistory = this.recentTools.get(toolName) || [];
    const now = Date.now();

    // 計算最近使用的權重分數
    let score = 0;
    for (const timestamp of usageHistory) {
      const age = now - timestamp;
      if (age < this.contextWindow) {
        // 越近的使用權重越高
        const ageRatio = 1 - age / this.contextWindow;
        score += ageRatio * 0.2;
      }
    }

    return Math.min(1, score);
  }

  private getTimeSensitivity(toolName: string, shared: ChatSharedState): number {
    // 檢查工具的時間敏感性
    if (toolName.includes("time") || toolName.includes("current")) {
      return 0.9;
    }
    if (toolName.includes("web") || toolName.includes("search")) {
      return 0.6;
    }

    return 0.3;
  }

  private getSessionDurationEffect(toolName: string, duration: number): number {
    // 會話時間對工具選擇的影響
    const minutes = duration / (1000 * 60);

    if (minutes < 5) {
      // 短會話偏好簡單工具
      return toolName.includes("search") ? 0.7 : 0.4;
    } else if (minutes > 30) {
      // 長會話可能需要更復雜的工具
      return toolName.includes("mcp_") ? 0.7 : 0.5;
    }

    return 0.5;
  }

  private getToolKeywords(toolName: string): string[] {
    const keywordMap: Record<string, string[]> = {
      localSearch: ["搜索", "筆記", "文檔"],
      webSearch: ["網路", "線上", "搜索"],
      time: ["時間", "日期", "現在"],
      file: ["文件", "檔案", "目錄"],
    };

    for (const [tool, keywords] of Object.entries(keywordMap)) {
      if (toolName.toLowerCase().includes(tool.toLowerCase())) {
        return keywords;
      }
    }

    return [];
  }

  /**
   * 記錄工具使用
   */
  recordToolUsage(toolName: string): void {
    const now = Date.now();
    const usageHistory = this.recentTools.get(toolName) || [];

    // 添加新的使用記錄
    usageHistory.push(now);

    // 清理舊記錄
    const validHistory = usageHistory.filter((timestamp) => now - timestamp < this.contextWindow);

    this.recentTools.set(toolName, validHistory);
  }

  /**
   * 獲取統計信息
   */
  getStatistics(): {
    trackedTools: number;
    totalUsages: number;
    sessionDuration: number;
  } {
    const totalUsages = Array.from(this.recentTools.values()).reduce(
      (sum, usages) => sum + usages.length,
      0
    );

    return {
      trackedTools: this.recentTools.size,
      totalUsages,
      sessionDuration: Date.now() - this.sessionStartTime,
    };
  }

  /**
   * 重置評估器
   */
  reset(): void {
    this.recentTools.clear();
    this.sessionStartTime = Date.now();
  }
}
