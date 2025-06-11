import { ChatSharedState } from "../../types";
import { logInfo, logError } from "@/logger";

/**
 * 用戶偏好介面
 */
export interface UserPreference {
  toolName: string;
  weight: number; // 偏好權重 0-1
  contexts: string[]; // 偏好的上下文
  reasons: string[]; // 偏好原因
  lastUpdated: number;
  frequency: number; // 使用頻率
  satisfaction: number; // 平均滿意度
}

/**
 * 偏好規則介面
 */
export interface PreferenceRule {
  id: string;
  condition: {
    queryKeywords?: string[];
    timeOfDay?: { start: number; end: number }; // 小時範圍
    sessionLength?: { min: number; max: number }; // 會話長度範圍（分鐘）
    previousTools?: string[];
  };
  preference: {
    toolName: string;
    boost: number; // 加權係數
  };
  confidence: number;
  usage: number; // 規則觸發次數
}

/**
 * 偏好統計介面
 */
export interface PreferenceStatistics {
  totalPreferences: number;
  topPreferences: Array<{ toolName: string; weight: number }>;
  recentChanges: Array<{ toolName: string; change: number; timestamp: number }>;
  activeRules: number;
  adaptationRate: number; // 適應速度
}

/**
 * 偏好適配器
 *
 * 負責學習和適應用戶偏好，包括：
 * - 工具選擇偏好學習
 * - 上下文相關偏好
 * - 時間模式偏好
 * - 動態偏好調整
 */
export class PreferenceAdapter {
  private preferences: Map<string, UserPreference>;
  private rules: Map<string, PreferenceRule>;
  private adaptationRate: number;
  private decayRate: number;
  private minConfidence: number;

  constructor(adaptationRate: number = 0.1, decayRate: number = 0.95, minConfidence: number = 0.3) {
    this.preferences = new Map();
    this.rules = new Map();
    this.adaptationRate = adaptationRate;
    this.decayRate = decayRate;
    this.minConfidence = minConfidence;

    this.initializeDefaultPreferences();
  }

  /**
   * 獲取偏好分數
   */
  async getPreferenceScores(
    query: string,
    tools: any[],
    shared: ChatSharedState
  ): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    try {
      for (const tool of tools) {
        const toolName = this.getToolName(tool);
        const score = await this.calculatePreferenceScore(toolName, query, shared);
        scores[toolName] = score;
      }

      logInfo(`偏好分析完成，分析了 ${tools.length} 個工具`);
      return scores;
    } catch (error) {
      logError("偏好分析失敗:", error);
      return {};
    }
  }

  /**
   * 更新偏好
   */
  async updatePreference(
    toolName: string,
    success: boolean,
    satisfaction: number,
    query: string,
    shared: ChatSharedState
  ): Promise<void> {
    try {
      // 1. 更新基礎偏好
      await this.updateBasicPreference(toolName, success, satisfaction);

      // 2. 更新上下文偏好
      await this.updateContextualPreference(toolName, query, shared, success);

      // 3. 更新或創建偏好規則
      await this.updatePreferenceRules(toolName, query, shared, success, satisfaction);

      // 4. 應用衰減以保持偏好的時效性
      this.applyDecay();

      logInfo(`更新偏好: ${toolName}, 成功: ${success}, 滿意度: ${satisfaction}`);
    } catch (error) {
      logError("更新偏好失敗:", error);
    }
  }

  /**
   * 獲取偏好統計
   */
  async getPreferences(): Promise<PreferenceStatistics> {
    try {
      const allPreferences = Array.from(this.preferences.values());

      // 排序偏好
      const topPreferences = allPreferences
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map((p) => ({ toolName: p.toolName, weight: p.weight }));

      // 計算最近變化
      const recentChanges = this.calculateRecentChanges();

      // 活躍規則數量
      const activeRules = Array.from(this.rules.values()).filter(
        (rule) => rule.confidence >= this.minConfidence
      ).length;

      return {
        totalPreferences: allPreferences.length,
        topPreferences,
        recentChanges,
        activeRules,
        adaptationRate: this.adaptationRate,
      };
    } catch (error) {
      logError("獲取偏好統計失敗:", error);
      return {
        totalPreferences: 0,
        topPreferences: [],
        recentChanges: [],
        activeRules: 0,
        adaptationRate: 0,
      };
    }
  }

  /**
   * 計算偏好分數
   */
  private async calculatePreferenceScore(
    toolName: string,
    query: string,
    shared: ChatSharedState
  ): Promise<number> {
    let score = 0.5; // 基準分數

    // 1. 基礎偏好分數
    const basicPreference = this.preferences.get(toolName);
    if (basicPreference) {
      score = basicPreference.weight * 0.4 + score * 0.6;
    }

    // 2. 規則匹配分數
    const ruleScore = this.calculateRuleMatchScore(toolName, query, shared);
    score = ruleScore * 0.3 + score * 0.7;

    // 3. 上下文匹配分數
    const contextScore = this.calculateContextMatchScore(toolName, query, shared);
    score = contextScore * 0.2 + score * 0.8;

    // 4. 時間偏好分數
    const timeScore = this.calculateTimePreferenceScore(toolName);
    score = timeScore * 0.1 + score * 0.9;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 更新基礎偏好
   */
  private async updateBasicPreference(
    toolName: string,
    success: boolean,
    satisfaction: number
  ): Promise<void> {
    let preference = this.preferences.get(toolName);

    if (!preference) {
      preference = {
        toolName,
        weight: 0.5,
        contexts: [],
        reasons: [],
        lastUpdated: Date.now(),
        frequency: 0,
        satisfaction: satisfaction,
      };
      this.preferences.set(toolName, preference);
    }

    // 更新權重
    const feedback = success ? satisfaction / 5 : 0; // 將滿意度轉換為 0-1
    preference.weight =
      preference.weight * (1 - this.adaptationRate) + feedback * this.adaptationRate;

    // 更新其他屬性
    preference.frequency += 1;
    preference.satisfaction =
      (preference.satisfaction * (preference.frequency - 1) + satisfaction) / preference.frequency;
    preference.lastUpdated = Date.now();

    // 添加使用原因
    if (success && satisfaction >= 4) {
      const reason = `優秀表現 (滿意度 ${satisfaction}/5)`;
      if (!preference.reasons.includes(reason)) {
        preference.reasons.push(reason);
      }
    }
  }

  /**
   * 更新上下文偏好
   */
  private async updateContextualPreference(
    toolName: string,
    query: string,
    shared: ChatSharedState,
    success: boolean
  ): Promise<void> {
    const preference = this.preferences.get(toolName);
    if (!preference) return;

    // 提取查詢關鍵詞
    const keywords = this.extractKeywords(query);

    // 提取上下文
    const contexts: string[] = [];
    if (shared.currentStep) {
      contexts.push(`step:${shared.currentStep}`);
    }
    if (shared.chatHistory && shared.chatHistory.length > 0) {
      contexts.push("has_history");
    }

    // 如果成功，將上下文添加到偏好
    if (success) {
      for (const keyword of keywords) {
        if (!preference.contexts.includes(keyword)) {
          preference.contexts.push(keyword);
        }
      }
      for (const context of contexts) {
        if (!preference.contexts.includes(context)) {
          preference.contexts.push(context);
        }
      }
    }

    // 限制上下文數量
    if (preference.contexts.length > 20) {
      preference.contexts = preference.contexts.slice(-20);
    }
  }

  /**
   * 更新偏好規則
   */
  private async updatePreferenceRules(
    toolName: string,
    query: string,
    shared: ChatSharedState,
    success: boolean,
    satisfaction: number
  ): Promise<void> {
    if (!success || satisfaction < 3) return; // 只為成功且滿意的使用創建規則

    const keywords = this.extractKeywords(query);
    const hour = new Date().getHours();
    const sessionLength = this.calculateSessionLength(shared);
    const previousTools = this.getPreviousTools(shared);

    // 創建或更新基於關鍵詞的規則
    if (keywords.length > 0) {
      const keywordRuleId = `keyword_${keywords.join("_")}_${toolName}`;
      this.updateRule(
        keywordRuleId,
        {
          queryKeywords: keywords,
        },
        toolName,
        satisfaction / 5
      );
    }

    // 創建或更新基於時間的規則
    const timeRuleId = `time_${hour}_${toolName}`;
    this.updateRule(
      timeRuleId,
      {
        timeOfDay: { start: hour, end: hour },
      },
      toolName,
      satisfaction / 5
    );

    // 創建或更新基於會話長度的規則
    if (sessionLength > 0) {
      const lengthCategory = this.categorizeSessionLength(sessionLength);
      const lengthRuleId = `session_${lengthCategory}_${toolName}`;
      this.updateRule(
        lengthRuleId,
        {
          sessionLength: this.getSessionLengthRange(lengthCategory),
        },
        toolName,
        satisfaction / 5
      );
    }

    // 創建或更新基於前序工具的規則
    if (previousTools.length > 0) {
      const sequenceRuleId = `sequence_${previousTools.join("_")}_${toolName}`;
      this.updateRule(
        sequenceRuleId,
        {
          previousTools,
        },
        toolName,
        satisfaction / 5
      );
    }
  }

  /**
   * 更新規則
   */
  private updateRule(ruleId: string, condition: any, toolName: string, boost: number): void {
    let rule = this.rules.get(ruleId);

    if (!rule) {
      rule = {
        id: ruleId,
        condition,
        preference: { toolName, boost },
        confidence: 0.1,
        usage: 0,
      };
      this.rules.set(ruleId, rule);
    }

    // 更新規則
    rule.usage += 1;
    rule.confidence = Math.min(1, rule.confidence + this.adaptationRate);
    rule.preference.boost =
      rule.preference.boost * (1 - this.adaptationRate) + boost * this.adaptationRate;
  }

  /**
   * 計算規則匹配分數
   */
  private calculateRuleMatchScore(
    toolName: string,
    query: string,
    shared: ChatSharedState
  ): number {
    let maxScore = 0.5;

    const keywords = this.extractKeywords(query);
    const hour = new Date().getHours();
    const sessionLength = this.calculateSessionLength(shared);
    const previousTools = this.getPreviousTools(shared);

    for (const rule of this.rules.values()) {
      if (rule.preference.toolName !== toolName || rule.confidence < this.minConfidence) {
        continue;
      }

      let matchScore = 0;
      let totalConditions = 0;

      // 檢查關鍵詞匹配
      if (rule.condition.queryKeywords) {
        totalConditions++;
        const commonKeywords = rule.condition.queryKeywords.filter((k) => keywords.includes(k));
        if (commonKeywords.length > 0) {
          matchScore += commonKeywords.length / rule.condition.queryKeywords.length;
        }
      }

      // 檢查時間匹配
      if (rule.condition.timeOfDay) {
        totalConditions++;
        const { start, end } = rule.condition.timeOfDay;
        if (hour >= start && hour <= end) {
          matchScore += 1;
        }
      }

      // 檢查會話長度匹配
      if (rule.condition.sessionLength) {
        totalConditions++;
        const { min, max } = rule.condition.sessionLength;
        if (sessionLength >= min && sessionLength <= max) {
          matchScore += 1;
        }
      }

      // 檢查前序工具匹配
      if (rule.condition.previousTools) {
        totalConditions++;
        const matchingTools = rule.condition.previousTools.filter((t) => previousTools.includes(t));
        if (matchingTools.length > 0) {
          matchScore += matchingTools.length / rule.condition.previousTools.length;
        }
      }

      // 計算最終匹配分數
      if (totalConditions > 0) {
        const ruleScore = (matchScore / totalConditions) * rule.confidence * rule.preference.boost;
        maxScore = Math.max(maxScore, ruleScore);
      }
    }

    return Math.min(1, maxScore);
  }

  /**
   * 計算上下文匹配分數
   */
  private calculateContextMatchScore(
    toolName: string,
    query: string,
    shared: ChatSharedState
  ): number {
    const preference = this.preferences.get(toolName);
    if (!preference) return 0.5;

    const keywords = this.extractKeywords(query);
    const contexts: string[] = [];

    if (shared.currentStep) {
      contexts.push(`step:${shared.currentStep}`);
    }
    if (shared.chatHistory && shared.chatHistory.length > 0) {
      contexts.push("has_history");
    }

    let matchCount = 0;
    const allContextItems = [...keywords, ...contexts];

    for (const item of allContextItems) {
      if (preference.contexts.includes(item)) {
        matchCount++;
      }
    }

    return allContextItems.length > 0 ? matchCount / allContextItems.length : 0.5;
  }

  /**
   * 計算時間偏好分數
   */
  private calculateTimePreferenceScore(toolName: string): number {
    const hour = new Date().getHours();
    let maxScore = 0.5;

    for (const rule of this.rules.values()) {
      if (
        rule.preference.toolName === toolName &&
        rule.condition.timeOfDay &&
        rule.confidence >= this.minConfidence
      ) {
        const { start, end } = rule.condition.timeOfDay;
        if (hour >= start && hour <= end) {
          const score = rule.confidence * rule.preference.boost;
          maxScore = Math.max(maxScore, score);
        }
      }
    }

    return Math.min(1, maxScore);
  }

  /**
   * 提取關鍵詞
   */
  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[@#]/g, " ")
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 5);
  }

  /**
   * 計算會話長度
   */
  private calculateSessionLength(shared: ChatSharedState): number {
    if (!shared.chatHistory || shared.chatHistory.length === 0) return 0;

    const firstMessage = shared.chatHistory[0];
    const lastMessage = shared.chatHistory[shared.chatHistory.length - 1];

    if (typeof firstMessage.timestamp === "number" && typeof lastMessage.timestamp === "number") {
      return (lastMessage.timestamp - firstMessage.timestamp) / (1000 * 60); // 分鐘
    }

    return 0;
  }

  /**
   * 獲取前序工具
   */
  private getPreviousTools(shared: ChatSharedState): string[] {
    if (!shared.toolCalls) return [];

    return shared.toolCalls
      .slice(-3) // 最近3個工具
      .map((tc) => this.getToolName(tc.tool))
      .filter((name) => name !== "unknown");
  }

  /**
   * 分類會話長度
   */
  private categorizeSessionLength(minutes: number): string {
    if (minutes < 5) return "short";
    if (minutes < 30) return "medium";
    return "long";
  }

  /**
   * 獲取會話長度範圍
   */
  private getSessionLengthRange(category: string): { min: number; max: number } {
    switch (category) {
      case "short":
        return { min: 0, max: 5 };
      case "medium":
        return { min: 5, max: 30 };
      case "long":
        return { min: 30, max: Infinity };
      default:
        return { min: 0, max: Infinity };
    }
  }

  /**
   * 獲取工具名稱
   */
  private getToolName(tool: any): string {
    return tool?.name || tool?.function?.name || "unknown";
  }

  /**
   * 應用衰減
   */
  private applyDecay(): void {
    // 對偏好權重應用衰減
    for (const preference of this.preferences.values()) {
      preference.weight *= this.decayRate;
    }

    // 對規則信心度應用衰減
    for (const rule of this.rules.values()) {
      rule.confidence *= this.decayRate;
    }

    // 清理信心度過低的規則
    for (const [ruleId, rule] of this.rules) {
      if (rule.confidence < this.minConfidence / 2) {
        this.rules.delete(ruleId);
      }
    }
  }

  /**
   * 計算最近變化
   */
  private calculateRecentChanges(): Array<{ toolName: string; change: number; timestamp: number }> {
    // 這裡可以實現更複雜的變化追蹤邏輯
    // 目前返回空數組
    return [];
  }

  /**
   * 初始化默認偏好
   */
  private initializeDefaultPreferences(): void {
    const defaultTools = ["localSearch", "webSearch", "time", "file"];

    for (const toolName of defaultTools) {
      this.preferences.set(toolName, {
        toolName,
        weight: 0.5,
        contexts: [],
        reasons: ["系統默認"],
        lastUpdated: Date.now(),
        frequency: 0,
        satisfaction: 3,
      });
    }
  }

  /**
   * 重置適配器
   */
  async reset(): Promise<void> {
    this.preferences.clear();
    this.rules.clear();
    this.initializeDefaultPreferences();
    logInfo("偏好適配器已重置");
  }

  /**
   * 導出偏好數據
   */
  exportPreferences(): {
    preferences: UserPreference[];
    rules: PreferenceRule[];
    metadata: {
      exportTime: number;
      adaptationRate: number;
      decayRate: number;
    };
  } {
    return {
      preferences: Array.from(this.preferences.values()),
      rules: Array.from(this.rules.values()),
      metadata: {
        exportTime: Date.now(),
        adaptationRate: this.adaptationRate,
        decayRate: this.decayRate,
      },
    };
  }
}
