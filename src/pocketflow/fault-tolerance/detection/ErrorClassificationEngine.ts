/**
 * 錯誤分類引擎
 *
 * 提供高級錯誤分類功能，基於現有的 MCP 錯誤分類器：
 * - 擴展錯誤分類邏輯
 * - 增強模式匹配
 * - 提供統一的分類接口
 */

import { createLogger } from "@/pocketflow/utils/logger";
import {
  McpErrorClassifier,
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorClassification,
  ErrorContext,
  ErrorClassifierConfig,
} from "@/pocketflow/mcp-enhanced/reliability/McpErrorClassifier";

/**
 * 增強的錯誤分類配置
 */
export interface ErrorClassificationEngineConfig extends ErrorClassifierConfig {
  /** 分類置信度閾值 */
  confidenceThreshold?: number;
  /** 啟用上下文分析 */
  enableContextAnalysis?: boolean;
  /** 錯誤聚合窗口（毫秒） */
  aggregationWindow?: number;
}

/**
 * 增強的錯誤分類結果
 */
export interface EnhancedErrorClassification extends ErrorClassification {
  /** 錯誤指紋 */
  fingerprint: string;
  /** 聚合信息 */
  aggregation?: {
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    frequency: number;
  };
  /** 上下文分析 */
  contextAnalysis?: {
    environment: string;
    operation: string;
    impact: "low" | "medium" | "high" | "critical";
    affectedUsers: number;
  };
}

/**
 * 錯誤分類引擎
 */
export class ErrorClassificationEngine {
  private config: Required<ErrorClassificationEngineConfig>;
  private logger = createLogger("ErrorClassificationEngine");

  // 核心分類器
  private mcpClassifier: McpErrorClassifier;

  // 錯誤聚合
  private errorAggregation = new Map<
    string,
    {
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      examples: Error[];
    }
  >();

  constructor(config: ErrorClassificationEngineConfig = {}) {
    this.config = {
      ...config,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      enableContextAnalysis: config.enableContextAnalysis ?? true,
      aggregationWindow: config.aggregationWindow ?? 5 * 60 * 1000, // 5分鐘
      enableMachineLearning: config.enableMachineLearning ?? false,
      patternMatchThreshold: config.patternMatchThreshold ?? 0.7,
      statsInterval: config.statsInterval ?? 60000,
      errorHistoryDays: config.errorHistoryDays ?? 7,
      customPatterns: config.customPatterns || [],
      debug: config.debug ?? false,
    };

    this.initializeMcpClassifier();
  }

  /**
   * 啟動分類引擎
   */
  public async start(): Promise<void> {
    this.logger.info("啟動錯誤分類引擎");
    this.mcpClassifier.start();
  }

  /**
   * 停止分類引擎
   */
  public async stop(): Promise<void> {
    this.logger.info("停止錯誤分類引擎");
    this.mcpClassifier.stop();
  }

  /**
   * 分類錯誤
   */
  public async classify(
    error: Error,
    context: Record<string, any> = {}
  ): Promise<EnhancedErrorClassification> {
    try {
      // 創建錯誤上下文
      const errorContext: ErrorContext = {
        serverId: context.serverId || "unknown",
        serverName: context.serverName || "unknown",
        toolName: context.toolName,
        operation: context.operationName || context.operation,
        requestId: context.requestId,
        userId: context.userId,
        timestamp: new Date(),
        stackTrace: error.stack,
        additionalData: context,
      };

      // 使用 MCP 分類器進行基礎分類
      const basicClassification = this.mcpClassifier.classify(error, errorContext);

      // 生成錯誤指紋
      const fingerprint = this.generateErrorFingerprint(error, context);

      // 進行錯誤聚合
      const aggregation = this.aggregateError(fingerprint, error);

      // 增強分類結果
      const enhanced: EnhancedErrorClassification = {
        ...basicClassification,
        fingerprint,
        aggregation,
      };

      // 添加上下文分析
      if (this.config.enableContextAnalysis) {
        enhanced.contextAnalysis = this.analyzeContext(error, context, basicClassification);
      }

      // 調整置信度
      enhanced.confidence = this.adjustConfidence(enhanced, aggregation);

      return enhanced;
    } catch (classificationError) {
      this.logger.error("錯誤分類失敗", classificationError);
      return this.createFallbackClassification(error, context);
    }
  }

  /**
   * 獲取錯誤統計
   */
  public getStatistics() {
    return this.mcpClassifier.getStats();
  }

  /**
   * 獲取聚合統計
   */
  public getAggregationStatistics(): {
    totalUniqueErrors: number;
    totalOccurrences: number;
    topErrors: Array<{
      fingerprint: string;
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      frequency: number;
    }>;
  } {
    const entries = Array.from(this.errorAggregation.entries());
    const totalOccurrences = entries.reduce((sum, [, data]) => sum + data.count, 0);

    const topErrors = entries
      .map(([fingerprint, data]) => ({
        fingerprint,
        count: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        frequency: data.count / ((data.lastSeen.getTime() - data.firstSeen.getTime()) / 1000 / 60), // 每分鐘次數
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalUniqueErrors: entries.length,
      totalOccurrences,
      topErrors,
    };
  }

  /**
   * 清理過期的聚合數據
   */
  public cleanupAggregation(): void {
    const cutoffTime = new Date(Date.now() - this.config.aggregationWindow);

    for (const [fingerprint, data] of this.errorAggregation.entries()) {
      if (data.lastSeen < cutoffTime) {
        this.errorAggregation.delete(fingerprint);
      }
    }
  }

  /**
   * 初始化 MCP 分類器
   */
  private initializeMcpClassifier(): void {
    this.mcpClassifier = new McpErrorClassifier({
      enableMachineLearning: this.config.enableMachineLearning,
      patternMatchThreshold: this.config.patternMatchThreshold,
      statsInterval: this.config.statsInterval,
      errorHistoryDays: this.config.errorHistoryDays,
      customPatterns: this.config.customPatterns,
      debug: this.config.debug,
    });
  }

  /**
   * 生成錯誤指紋
   */
  private generateErrorFingerprint(error: Error, context: Record<string, any>): string {
    const components = [
      error.name,
      this.normalizeErrorMessage(error.message),
      context.operationName || context.operation || "",
      context.toolName || "",
    ];

    // 創建簡單哈希
    const content = components.join("|");
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為32位整數
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * 標準化錯誤消息
   */
  private normalizeErrorMessage(message: string): string {
    // 移除動態內容，如ID、時間戳等
    return message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "TIMESTAMP") // ISO時間戳
      .replace(/\b\d+\b/g, "NUMBER") // 數字
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID") // UUID
      .replace(/\b[A-Za-z0-9]{20,}\b/g, "TOKEN") // 長字符串標記
      .slice(0, 200); // 限制長度
  }

  /**
   * 聚合錯誤
   */
  private aggregateError(
    fingerprint: string,
    error: Error
  ): {
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    frequency: number;
  } {
    const now = new Date();
    let aggregation = this.errorAggregation.get(fingerprint);

    if (aggregation) {
      aggregation.count++;
      aggregation.lastSeen = now;
      aggregation.examples.push(error);

      // 只保留最近幾個例子
      if (aggregation.examples.length > 5) {
        aggregation.examples = aggregation.examples.slice(-5);
      }
    } else {
      aggregation = {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        examples: [error],
      };
      this.errorAggregation.set(fingerprint, aggregation);
    }

    // 計算頻率（每分鐘次數）
    const timeSpanMinutes =
      (aggregation.lastSeen.getTime() - aggregation.firstSeen.getTime()) / 1000 / 60;
    const frequency = timeSpanMinutes > 0 ? aggregation.count / timeSpanMinutes : aggregation.count;

    return {
      count: aggregation.count,
      firstSeen: aggregation.firstSeen,
      lastSeen: aggregation.lastSeen,
      frequency,
    };
  }

  /**
   * 分析上下文
   */
  private analyzeContext(
    error: Error,
    context: Record<string, any>,
    classification: ErrorClassification
  ): {
    environment: string;
    operation: string;
    impact: "low" | "medium" | "high" | "critical";
    affectedUsers: number;
  } {
    // 確定環境
    const environment =
      context.environment || (context.serverId?.includes("prod") ? "production" : "development");

    // 確定操作
    const operation = context.operationName || context.operation || "unknown";

    // 評估影響程度
    let impact: "low" | "medium" | "high" | "critical" = "low";

    switch (classification.severity) {
      case ErrorSeverity.CRITICAL:
        impact = "critical";
        break;
      case ErrorSeverity.HIGH:
        impact = "high";
        break;
      case ErrorSeverity.MEDIUM:
        impact = "medium";
        break;
      default:
        impact = "low";
    }

    // 估算受影響用戶數
    let affectedUsers = 0;
    if (context.userId) {
      affectedUsers = 1;
    } else if (impact === "critical") {
      affectedUsers = 1000; // 估算
    } else if (impact === "high") {
      affectedUsers = 100;
    } else if (impact === "medium") {
      affectedUsers = 10;
    }

    return {
      environment,
      operation,
      impact,
      affectedUsers,
    };
  }

  /**
   * 調整置信度
   */
  private adjustConfidence(
    classification: EnhancedErrorClassification,
    aggregation: { count: number; frequency: number }
  ): number {
    let confidence = classification.confidence;

    // 根據聚合數據調整置信度
    if (aggregation.count > 1) {
      // 重複錯誤的置信度更高
      confidence = Math.min(confidence * (1 + Math.log(aggregation.count) * 0.1), 1.0);
    }

    // 根據頻率調整
    if (aggregation.frequency > 1) {
      // 高頻錯誤置信度更高
      confidence = Math.min(confidence * 1.2, 1.0);
    }

    return Math.round(confidence * 100) / 100; // 保留兩位小數
  }

  /**
   * 創建後備分類
   */
  private createFallbackClassification(
    error: Error,
    context: Record<string, any>
  ): EnhancedErrorClassification {
    const fingerprint = this.generateErrorFingerprint(error, context);
    const aggregation = this.aggregateError(fingerprint, error);

    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.MANUAL,
      confidence: 0.1,
      description: `未分類錯誤: ${error.message}`,
      possibleCauses: ["分類器故障", "未知錯誤類型"],
      suggestedActions: ["檢查分類器狀態", "手動分析錯誤"],
      isRetryable: false,
      estimatedRetryDelay: 0,
      maxRetryAttempts: 0,
      relatedErrors: [],
      tags: ["fallback", "unclassified"],
      fingerprint,
      aggregation,
    };
  }
}
