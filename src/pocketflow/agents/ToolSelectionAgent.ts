import { ChatSharedState } from "../types";
import { logInfo, logError } from "@/logger";
import { SemanticAnalyzer } from "./analyzers/SemanticAnalyzer";
import { ContextEvaluator } from "./analyzers/ContextEvaluator";
import { PerformanceTracker } from "./analyzers/PerformanceTracker";
import { CandidateRanker } from "./analyzers/CandidateRanker";
import { UsagePatternLearner } from "./learners/UsagePatternLearner";
import { FeedbackCollector } from "./learners/FeedbackCollector";
import { PreferenceAdapter } from "./learners/PreferenceAdapter";

/**
 * 工具候選項介面
 */
export interface ToolCandidate {
  tool: any;
  name: string;
  category: string;
  score: number;
  confidence: number;
  reasons: string[];
  semanticMatch: number;
  contextRelevance: number;
  performanceScore: number;
  userPreference: number;
  args?: any;
}

/**
 * 工具選擇結果介面
 */
export interface ToolSelectionResult {
  primaryTool?: ToolCandidate;
  alternatives: ToolCandidate[];
  selectionReason: string;
  confidence: number;
  suggestedAction: string;
  metadata: {
    analysisTime: number;
    considereredTools: number;
    selectionStrategy: string;
  };
}

/**
 * 工具選擇配置介面
 */
export interface ToolSelectionConfig {
  maxCandidates: number;
  minConfidenceThreshold: number;
  enableLearning: boolean;
  enablePerformanceTracking: boolean;
  semanticWeight: number;
  contextWeight: number;
  performanceWeight: number;
  preferenceWeight: number;
}

/**
 * 工具選擇代理
 *
 * 提供基於上下文的智能工具選擇能力，包括：
 * - 語義分析：基於查詢內容分析最適合的工具
 * - 上下文感知：考慮聊天歷史和用戶偏好
 * - 性能考量：根據工具歷史性能進行選擇
 * - 自適應學習：學習用戶使用模式和偏好
 */
export class ToolSelectionAgent {
  private semanticAnalyzer: SemanticAnalyzer;
  private contextEvaluator: ContextEvaluator;
  private performanceTracker: PerformanceTracker;
  private candidateRanker: CandidateRanker;
  private usagePatternLearner: UsagePatternLearner;
  private feedbackCollector: FeedbackCollector;
  private preferenceAdapter: PreferenceAdapter;
  private config: ToolSelectionConfig;

  constructor(config: Partial<ToolSelectionConfig> = {}) {
    this.config = {
      maxCandidates: 5,
      minConfidenceThreshold: 0.3,
      enableLearning: true,
      enablePerformanceTracking: true,
      semanticWeight: 0.3,
      contextWeight: 0.25,
      performanceWeight: 0.25,
      preferenceWeight: 0.2,
      ...config,
    };

    this.initializeComponents();
  }

  /**
   * 初始化分析組件
   */
  private initializeComponents(): void {
    this.semanticAnalyzer = new SemanticAnalyzer();
    this.contextEvaluator = new ContextEvaluator();
    this.performanceTracker = new PerformanceTracker();
    this.candidateRanker = new CandidateRanker(this.config);
    this.usagePatternLearner = new UsagePatternLearner();
    this.feedbackCollector = new FeedbackCollector();
    this.preferenceAdapter = new PreferenceAdapter();
  }

  /**
   * 執行智能工具選擇
   */
  async selectTools(
    query: string,
    availableTools: any[],
    shared: ChatSharedState
  ): Promise<ToolSelectionResult> {
    const startTime = Date.now();

    try {
      logInfo(`開始智能工具選擇，可用工具數量: ${availableTools.length}`);

      // 1. 語義分析
      const semanticScores = await this.semanticAnalyzer.analyzeQuery(query, availableTools);

      // 2. 上下文評估
      const contextScores = await this.contextEvaluator.evaluateContext(
        query,
        availableTools,
        shared
      );

      // 3. 性能分析
      const performanceScores = this.config.enablePerformanceTracking
        ? await this.performanceTracker.getPerformanceScores(availableTools)
        : {};

      // 4. 用戶偏好分析
      const preferenceScores = this.config.enableLearning
        ? await this.preferenceAdapter.getPreferenceScores(query, availableTools, shared)
        : {};

      // 5. 生成候選項
      const candidates = this.generateCandidates(
        availableTools,
        semanticScores,
        contextScores,
        performanceScores,
        preferenceScores,
        query
      );

      // 6. 排序候選項
      const rankedCandidates = this.candidateRanker.rankCandidates(candidates);

      // 7. 選擇最佳工具
      const result = this.createSelectionResult(rankedCandidates, startTime, availableTools.length);

      // 8. 記錄使用模式（如果啟用學習）
      if (this.config.enableLearning && result.primaryTool) {
        await this.usagePatternLearner.recordUsage(query, result.primaryTool, shared);
      }

      logInfo(`工具選擇完成，主要工具: ${result.primaryTool?.name || "none"}`);
      return result;
    } catch (error) {
      logError("智能工具選擇失敗:", error);
      return this.createFallbackResult(availableTools, startTime);
    }
  }

  /**
   * 生成工具候選項
   */
  private generateCandidates(
    tools: any[],
    semanticScores: Record<string, number>,
    contextScores: Record<string, number>,
    performanceScores: Record<string, number>,
    preferenceScores: Record<string, number>,
    query: string
  ): ToolCandidate[] {
    return tools.map((tool) => {
      const toolName = tool.name || tool.function?.name || "unknown";

      const semanticMatch = semanticScores[toolName] || 0;
      const contextRelevance = contextScores[toolName] || 0;
      const performanceScore = performanceScores[toolName] || 0.5;
      const userPreference = preferenceScores[toolName] || 0.5;

      // 計算綜合分數
      const score =
        semanticMatch * this.config.semanticWeight +
        contextRelevance * this.config.contextWeight +
        performanceScore * this.config.performanceWeight +
        userPreference * this.config.preferenceWeight;

      // 計算信心分數
      const confidence = this.calculateConfidence(
        semanticMatch,
        contextRelevance,
        performanceScore,
        userPreference
      );

      // 生成選擇原因
      const reasons = this.generateReasons(
        semanticMatch,
        contextRelevance,
        performanceScore,
        userPreference,
        toolName
      );

      return {
        tool,
        name: toolName,
        category: this.categorizetool(tool),
        score,
        confidence,
        reasons,
        semanticMatch,
        contextRelevance,
        performanceScore,
        userPreference,
        args: this.generateToolArgs(tool, query),
      };
    });
  }

  /**
   * 計算信心分數
   */
  private calculateConfidence(
    semantic: number,
    context: number,
    performance: number,
    preference: number
  ): number {
    // 使用方差來計算信心分數，分數越一致信心越高
    const scores = [semantic, context, performance, preference];
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;

    // 將方差轉換為信心分數（方差越小信心越高）
    return Math.max(0, Math.min(1, 1 - variance * 2));
  }

  /**
   * 生成選擇原因
   */
  private generateReasons(
    semantic: number,
    context: number,
    performance: number,
    preference: number,
    toolName: string
  ): string[] {
    const reasons: string[] = [];

    if (semantic > 0.7) {
      reasons.push(`與查詢語義高度匹配 (${(semantic * 100).toFixed(1)}%)`);
    }
    if (context > 0.7) {
      reasons.push(`上下文高度相關 (${(context * 100).toFixed(1)}%)`);
    }
    if (performance > 0.7) {
      reasons.push(`歷史性能優秀 (${(performance * 100).toFixed(1)}%)`);
    }
    if (preference > 0.7) {
      reasons.push(`符合用戶偏好 (${(preference * 100).toFixed(1)}%)`);
    }

    if (reasons.length === 0) {
      reasons.push(`${toolName} 是可用選項之一`);
    }

    return reasons;
  }

  /**
   * 分類工具
   */
  private categorizetool(tool: any): string {
    const name = (tool.name || tool.function?.name || "").toLowerCase();

    if (name.includes("search") || name.includes("find")) {
      return "search";
    }
    if (name.includes("web") || name.includes("internet")) {
      return "web";
    }
    if (name.includes("time") || name.includes("date")) {
      return "time";
    }
    if (name.includes("file") || name.includes("document")) {
      return "file";
    }
    if (name.includes("mcp_")) {
      return "mcp";
    }

    return "general";
  }

  /**
   * 生成工具參數
   */
  private generateToolArgs(tool: any, query: string): any {
    // 這裡可以實現更智能的參數生成邏輯
    // 目前使用基本的參數映射
    const args: any = {};

    if (tool.inputSchema?.properties) {
      const properties = tool.inputSchema.properties;

      // 常見的查詢參數映射
      if (properties.query) {
        args.query = query;
      }
      if (properties.prompt) {
        args.prompt = query;
      }
      if (properties.text) {
        args.text = query;
      }
      if (properties.question) {
        args.question = query;
      }
    }

    return args;
  }

  /**
   * 創建選擇結果
   */
  private createSelectionResult(
    candidates: ToolCandidate[],
    startTime: number,
    totalTools: number
  ): ToolSelectionResult {
    const analysisTime = Date.now() - startTime;

    // 過濾低信心的候選項
    const validCandidates = candidates.filter(
      (c) => c.confidence >= this.config.minConfidenceThreshold
    );

    // 限制候選項數量
    const limitedCandidates = validCandidates.slice(0, this.config.maxCandidates);

    const primaryTool = limitedCandidates[0];
    const alternatives = limitedCandidates.slice(1);

    let suggestedAction = "direct_llm";
    let selectionReason = "沒有找到合適的工具";

    if (primaryTool) {
      suggestedAction = this.mapToolToAction(primaryTool);
      selectionReason = `選擇 ${primaryTool.name}：${primaryTool.reasons.join(", ")}`;
    }

    return {
      primaryTool,
      alternatives,
      selectionReason,
      confidence: primaryTool?.confidence || 0,
      suggestedAction,
      metadata: {
        analysisTime,
        considereredTools: totalTools,
        selectionStrategy: "intelligent_agent",
      },
    };
  }

  /**
   * 映射工具到動作
   */
  private mapToolToAction(candidate: ToolCandidate): string {
    const category = candidate.category;
    const name = candidate.name.toLowerCase();

    if (name.includes("localsearch") || name.includes("vault")) {
      return "local_search";
    }
    if (name.includes("websearch") || name.includes("web")) {
      return "web_search";
    }
    if (name.startsWith("mcp_")) {
      return "mcp_tools";
    }
    if (category === "search") {
      return "local_search";
    }
    if (category === "web") {
      return "web_search";
    }
    if (category === "mcp") {
      return "mcp_tools";
    }

    return "tool_execution";
  }

  /**
   * 創建回退結果
   */
  private createFallbackResult(tools: any[], startTime: number): ToolSelectionResult {
    return {
      alternatives: [],
      selectionReason: "智能選擇失敗，使用默認處理",
      confidence: 0,
      suggestedAction: "direct_llm",
      metadata: {
        analysisTime: Date.now() - startTime,
        considereredTools: tools.length,
        selectionStrategy: "fallback",
      },
    };
  }

  /**
   * 記錄工具使用反饋
   */
  async recordFeedback(
    toolName: string,
    success: boolean,
    duration: number,
    userSatisfaction?: number
  ): Promise<void> {
    if (!this.config.enableLearning) {
      return;
    }

    try {
      await this.feedbackCollector.recordFeedback({
        toolName,
        success,
        duration,
        userSatisfaction,
        timestamp: Date.now(),
      });

      if (this.config.enablePerformanceTracking) {
        await this.performanceTracker.updatePerformance(toolName, success, duration);
      }
    } catch (error) {
      logError("記錄工具反饋失敗:", error);
    }
  }

  /**
   * 獲取工具使用統計
   */
  async getToolStatistics(): Promise<any> {
    try {
      const performance = await this.performanceTracker.getStatistics();
      const patterns = await this.usagePatternLearner.getPatterns();
      const preferences = await this.preferenceAdapter.getPreferences();

      return {
        performance,
        patterns,
        preferences,
        config: this.config,
      };
    } catch (error) {
      logError("獲取工具統計失敗:", error);
      return {};
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<ToolSelectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.candidateRanker.updateConfig(this.config);
  }

  /**
   * 重置學習數據
   */
  async resetLearningData(): Promise<void> {
    if (this.config.enableLearning) {
      await this.usagePatternLearner.reset();
      await this.feedbackCollector.reset();
      await this.preferenceAdapter.reset();
    }

    if (this.config.enablePerformanceTracking) {
      await this.performanceTracker.reset();
    }
  }
}
