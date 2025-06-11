/**
 * MCP 錯誤分類器
 *
 * 提供智能錯誤分類和診斷功能：
 * - 錯誤類型識別
 * - 錯誤模式分析
 * - 根本原因分析
 * - 修復建議生成
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 錯誤類別
 */
export enum ErrorCategory {
  CONNECTION = "connection",
  TIMEOUT = "timeout",
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  RATE_LIMIT = "rate_limit",
  SERVER_ERROR = "server_error",
  CLIENT_ERROR = "client_error",
  VALIDATION = "validation",
  RESOURCE_NOT_FOUND = "resource_not_found",
  TOOL_NOT_FOUND = "tool_not_found",
  PROTOCOL_ERROR = "protocol_error",
  NETWORK_ERROR = "network_error",
  UNKNOWN = "unknown",
}

/**
 * 錯誤嚴重程度
 */
export enum ErrorSeverity {
  CRITICAL = "critical", // 系統無法正常運行
  HIGH = "high", // 功能嚴重受影響
  MEDIUM = "medium", // 功能部分受影響
  LOW = "low", // 輕微影響
  INFO = "info", // 僅供參考
}

/**
 * 恢復策略
 */
export enum RecoveryStrategy {
  RETRY = "retry", // 重試
  FALLBACK = "fallback", // 降級
  CIRCUIT_BREAKER = "circuit_breaker", // 熔斷
  BACKOFF = "backoff", // 退避
  IGNORE = "ignore", // 忽略
  ESCALATE = "escalate", // 升級
  MANUAL = "manual", // 人工處理
}

/**
 * 錯誤分類結果
 */
export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  confidence: number; // 0-1，分類信心度
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
  isRetryable: boolean;
  estimatedRetryDelay: number; // 毫秒
  maxRetryAttempts: number;
  relatedErrors: string[]; // 相關錯誤模式
  tags: string[];
}

/**
 * 錯誤模式
 */
export interface ErrorPattern {
  id: string;
  name: string;
  description: string;
  category: ErrorCategory;
  keywords: string[];
  regex: RegExp[];
  conditions: Array<{
    field: string;
    operator: "equals" | "contains" | "startsWith" | "endsWith" | "regex";
    value: string | number | boolean;
  }>;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  weight: number; // 匹配權重
}

/**
 * 錯誤統計
 */
export interface ErrorStats {
  totalErrors: number;
  categoryCounts: Record<ErrorCategory, number>;
  severityCounts: Record<ErrorSeverity, number>;
  topErrorPatterns: Array<{
    pattern: string;
    count: number;
    percentage: number;
  }>;
  averageClassificationTime: number;
  classificationAccuracy: number; // 0-1
  recurrentErrors: Array<{
    signature: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
  }>;
}

/**
 * 錯誤上下文
 */
export interface ErrorContext {
  serverId: string;
  serverName: string;
  toolName?: string;
  operation?: string;
  requestId?: string;
  userId?: string;
  timestamp: Date;
  stackTrace?: string;
  additionalData?: Record<string, any>;
  previousErrors?: Error[];
  systemState?: {
    memoryUsage: number;
    cpuUsage: number;
    connectionCount: number;
  };
}

/**
 * 錯誤分類器配置
 */
export interface ErrorClassifierConfig {
  /** 啟用機器學習模式 */
  enableMachineLearning?: boolean;
  /** 模式匹配閾值 */
  patternMatchThreshold?: number;
  /** 統計計算間隔（毫秒） */
  statsInterval?: number;
  /** 錯誤歷史保留天數 */
  errorHistoryDays?: number;
  /** 自定義錯誤模式 */
  customPatterns?: ErrorPattern[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 錯誤分類器事件
 */
export interface ErrorClassifierEvents {
  errorClassified: (
    error: Error,
    classification: ErrorClassification,
    context: ErrorContext
  ) => void;
  patternMatched: (patternId: string, error: Error, confidence: number) => void;
  newPatternDetected: (pattern: ErrorPattern, errors: Error[]) => void;
  statsUpdated: (stats: ErrorStats) => void;
  classificationFailed: (error: Error, reason: string) => void;
}

/**
 * 錯誤記錄
 */
interface ErrorRecord {
  error: Error;
  classification: ErrorClassification;
  context: ErrorContext;
  timestamp: Date;
  signature: string;
}

/**
 * MCP 錯誤分類器
 */
export class McpErrorClassifier extends EventEmitter {
  private config: Required<ErrorClassifierConfig>;
  private errorPatterns: ErrorPattern[] = [];
  private errorHistory: ErrorRecord[] = [];
  private stats: ErrorStats;
  private statsTimer: NodeJS.Timeout | null = null;
  private logger = createLogger("McpErrorClassifier");

  constructor(config: ErrorClassifierConfig = {}) {
    super();

    this.config = {
      enableMachineLearning: config.enableMachineLearning ?? false,
      patternMatchThreshold: config.patternMatchThreshold || 0.7,
      statsInterval: config.statsInterval || 60000, // 1 minute
      errorHistoryDays: config.errorHistoryDays || 7,
      customPatterns: config.customPatterns || [],
      debug: config.debug ?? false,
    };

    this.stats = this.createEmptyStats();
    this.initializeDefaultPatterns();

    if (this.config.customPatterns.length > 0) {
      this.errorPatterns.push(...this.config.customPatterns);
    }
  }

  /**
   * 啟動錯誤分類器
   */
  public start(): void {
    this.logger.info("啟動 MCP 錯誤分類器", { config: this.config });

    // 啟動統計計算
    this.startStatsCalculation();
  }

  /**
   * 停止錯誤分類器
   */
  public stop(): void {
    this.logger.info("停止 MCP 錯誤分類器");

    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  /**
   * 分類錯誤
   */
  public classify(error: Error, context: ErrorContext): ErrorClassification {
    const startTime = Date.now();

    try {
      // 生成錯誤簽名
      const signature = this.generateErrorSignature(error, context);

      // 尋找匹配的模式
      const matchedPatterns = this.findMatchingPatterns(error, context);

      let classification: ErrorClassification;

      if (matchedPatterns.length > 0) {
        // 使用最匹配的模式
        const bestMatch = matchedPatterns[0];
        classification = this.createClassificationFromPattern(
          bestMatch.pattern,
          bestMatch.confidence
        );

        this.emit("patternMatched", bestMatch.pattern.id, error, bestMatch.confidence);
      } else {
        // 使用默認分類邏輯
        classification = this.performDefaultClassification(error, context);
      }

      // 記錄錯誤
      const record: ErrorRecord = {
        error,
        classification,
        context,
        timestamp: new Date(),
        signature,
      };

      this.errorHistory.push(record);
      this.cleanupOldRecords();

      // 更新統計
      this.updateStats(classification);

      // 計算分類時間
      const classificationTime = Date.now() - startTime;
      this.stats.averageClassificationTime =
        (this.stats.averageClassificationTime + classificationTime) / 2;

      this.emit("errorClassified", error, classification, context);
      return classification;
    } catch (classificationError) {
      this.logger.error("錯誤分類失敗", classificationError, {
        originalError: error.message,
        context,
      });

      this.emit("classificationFailed", error, classificationError.message);

      // 返回默認分類
      return this.createDefaultClassification(error);
    }
  }

  /**
   * 添加自定義錯誤模式
   */
  public addPattern(pattern: ErrorPattern): void {
    this.errorPatterns.push(pattern);
    this.logger.info(`添加自定義錯誤模式: ${pattern.name}`, { patternId: pattern.id });
  }

  /**
   * 移除錯誤模式
   */
  public removePattern(patternId: string): boolean {
    const index = this.errorPatterns.findIndex((p) => p.id === patternId);
    if (index !== -1) {
      const pattern = this.errorPatterns.splice(index, 1)[0];
      this.logger.info(`移除錯誤模式: ${pattern.name}`, { patternId });
      return true;
    }
    return false;
  }

  /**
   * 獲取錯誤統計
   */
  public getStats(): ErrorStats {
    this.calculateStats();
    return { ...this.stats };
  }

  /**
   * 獲取錯誤模式
   */
  public getPatterns(): ErrorPattern[] {
    return [...this.errorPatterns];
  }

  /**
   * 分析錯誤趨勢
   */
  public analyzeErrorTrends(timeWindowHours: number = 24): {
    increasing: ErrorCategory[];
    decreasing: ErrorCategory[];
    stable: ErrorCategory[];
  } {
    const windowStart = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
    const recentErrors = this.errorHistory.filter((record) => record.timestamp >= windowStart);

    // 分時段統計
    const hourlyStats = new Map<number, Record<ErrorCategory, number>>();

    for (const record of recentErrors) {
      const hour = record.timestamp.getHours();
      if (!hourlyStats.has(hour)) {
        hourlyStats.set(
          hour,
          Object.values(ErrorCategory).reduce(
            (acc, cat) => {
              acc[cat] = 0;
              return acc;
            },
            {} as Record<ErrorCategory, number>
          )
        );
      }

      const stats = hourlyStats.get(hour)!;
      stats[record.classification.category]++;
    }

    // 分析趨勢
    const increasing: ErrorCategory[] = [];
    const decreasing: ErrorCategory[] = [];
    const stable: ErrorCategory[] = [];

    for (const category of Object.values(ErrorCategory)) {
      const hourlyData = Array.from(hourlyStats.values()).map((stats) => stats[category]);
      if (hourlyData.length < 2) continue;

      const trend = this.calculateTrend(hourlyData);
      if (trend > 0.1) {
        increasing.push(category);
      } else if (trend < -0.1) {
        decreasing.push(category);
      } else {
        stable.push(category);
      }
    }

    return { increasing, decreasing, stable };
  }

  /**
   * 初始化默認錯誤模式
   */
  private initializeDefaultPatterns(): void {
    this.errorPatterns = [
      {
        id: "connection-refused",
        name: "連接被拒絕",
        description: "服務器拒絕連接請求",
        category: ErrorCategory.CONNECTION,
        keywords: ["connection refused", "connect failed", "ECONNREFUSED"],
        regex: [/connection\s+refused/i, /ECONNREFUSED/i],
        conditions: [],
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.RETRY,
        weight: 1.0,
      },
      {
        id: "timeout-error",
        name: "請求超時",
        description: "請求在指定時間內未完成",
        category: ErrorCategory.TIMEOUT,
        keywords: ["timeout", "timed out", "ETIMEDOUT"],
        regex: [/timeout/i, /timed\s+out/i, /ETIMEDOUT/i],
        conditions: [],
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.RETRY,
        weight: 1.0,
      },
      {
        id: "rate-limit-exceeded",
        name: "速率限制",
        description: "超過 API 調用速率限制",
        category: ErrorCategory.RATE_LIMIT,
        keywords: ["rate limit", "too many requests", "429"],
        regex: [/rate\s+limit/i, /too\s+many\s+requests/i],
        conditions: [],
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.BACKOFF,
        weight: 1.0,
      },
      {
        id: "authentication-failed",
        name: "認證失敗",
        description: "身份驗證失敗",
        category: ErrorCategory.AUTHENTICATION,
        keywords: ["authentication failed", "invalid credentials", "unauthorized", "401"],
        regex: [/authentication\s+failed/i, /invalid\s+credentials/i, /unauthorized/i],
        conditions: [],
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.MANUAL,
        weight: 1.0,
      },
      {
        id: "tool-not-found",
        name: "工具不存在",
        description: "請求的工具不存在",
        category: ErrorCategory.TOOL_NOT_FOUND,
        keywords: ["tool not found", "method not found", "unknown tool"],
        regex: [/tool\s+not\s+found/i, /method\s+not\s+found/i, /unknown\s+tool/i],
        conditions: [],
        severity: ErrorSeverity.LOW,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        weight: 1.0,
      },
      {
        id: "server-internal-error",
        name: "服務器內部錯誤",
        description: "服務器發生內部錯誤",
        category: ErrorCategory.SERVER_ERROR,
        keywords: ["internal server error", "500", "server error"],
        regex: [/internal\s+server\s+error/i, /server\s+error/i],
        conditions: [],
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.RETRY,
        weight: 1.0,
      },
      {
        id: "validation-error",
        name: "參數驗證錯誤",
        description: "請求參數驗證失敗",
        category: ErrorCategory.VALIDATION,
        keywords: ["validation error", "invalid parameter", "bad request", "400"],
        regex: [/validation\s+error/i, /invalid\s+parameter/i, /bad\s+request/i],
        conditions: [],
        severity: ErrorSeverity.LOW,
        recoveryStrategy: RecoveryStrategy.IGNORE,
        weight: 1.0,
      },
    ];
  }

  /**
   * 尋找匹配的錯誤模式
   */
  private findMatchingPatterns(
    error: Error,
    context: ErrorContext
  ): Array<{
    pattern: ErrorPattern;
    confidence: number;
  }> {
    const matches: Array<{ pattern: ErrorPattern; confidence: number }> = [];

    for (const pattern of this.errorPatterns) {
      const confidence = this.calculatePatternMatch(error, context, pattern);

      if (confidence >= this.config.patternMatchThreshold) {
        matches.push({ pattern, confidence });
      }
    }

    // 按信心度排序
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 計算模式匹配度
   */
  private calculatePatternMatch(
    error: Error,
    context: ErrorContext,
    pattern: ErrorPattern
  ): number {
    let score = 0;
    let totalChecks = 0;

    // 檢查關鍵詞匹配
    if (pattern.keywords.length > 0) {
      const errorText = `${error.message} ${error.stack || ""}`.toLowerCase();
      const matchedKeywords = pattern.keywords.filter((keyword) =>
        errorText.includes(keyword.toLowerCase())
      );

      score += (matchedKeywords.length / pattern.keywords.length) * pattern.weight;
      totalChecks += pattern.weight;
    }

    // 檢查正則表達式匹配
    if (pattern.regex.length > 0) {
      const errorText = `${error.message} ${error.stack || ""}`;
      const matchedRegex = pattern.regex.filter((regex) => regex.test(errorText));

      score += (matchedRegex.length / pattern.regex.length) * pattern.weight;
      totalChecks += pattern.weight;
    }

    // 檢查條件匹配
    if (pattern.conditions.length > 0) {
      const matchedConditions = pattern.conditions.filter((condition) =>
        this.evaluateCondition(error, context, condition)
      );

      score += (matchedConditions.length / pattern.conditions.length) * pattern.weight;
      totalChecks += pattern.weight;
    }

    return totalChecks > 0 ? score / totalChecks : 0;
  }

  /**
   * 評估條件
   */
  private evaluateCondition(
    error: Error,
    context: ErrorContext,
    condition: ErrorPattern["conditions"][0]
  ): boolean {
    let fieldValue: any;

    // 獲取字段值
    switch (condition.field) {
      case "error.name":
        fieldValue = error.name;
        break;
      case "error.message":
        fieldValue = error.message;
        break;
      case "context.serverId":
        fieldValue = context.serverId;
        break;
      case "context.toolName":
        fieldValue = context.toolName;
        break;
      default:
        return false;
    }

    // 執行比較
    switch (condition.operator) {
      case "equals":
        return fieldValue === condition.value;
      case "contains":
        return typeof fieldValue === "string" && fieldValue.includes(String(condition.value));
      case "startsWith":
        return typeof fieldValue === "string" && fieldValue.startsWith(String(condition.value));
      case "endsWith":
        return typeof fieldValue === "string" && fieldValue.endsWith(String(condition.value));
      case "regex":
        return (
          typeof fieldValue === "string" && new RegExp(String(condition.value)).test(fieldValue)
        );
      default:
        return false;
    }
  }

  /**
   * 從模式創建分類結果
   */
  private createClassificationFromPattern(
    pattern: ErrorPattern,
    confidence: number
  ): ErrorClassification {
    return {
      category: pattern.category,
      severity: pattern.severity,
      recoveryStrategy: pattern.recoveryStrategy,
      confidence,
      description: pattern.description,
      possibleCauses: this.getPossibleCauses(pattern.category),
      suggestedActions: this.getSuggestedActions(pattern.recoveryStrategy),
      isRetryable: this.isRetryableStrategy(pattern.recoveryStrategy),
      estimatedRetryDelay: this.getRetryDelay(pattern.category),
      maxRetryAttempts: this.getMaxRetryAttempts(pattern.severity),
      relatedErrors: [],
      tags: [pattern.name],
    };
  }

  /**
   * 執行默認分類
   */
  private performDefaultClassification(error: Error, context: ErrorContext): ErrorClassification {
    const errorMessage = error.message.toLowerCase();

    // 基於錯誤消息的簡單分類
    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let recoveryStrategy = RecoveryStrategy.RETRY;

    if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      category = ErrorCategory.TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
      recoveryStrategy = RecoveryStrategy.RETRY;
    } else if (errorMessage.includes("connection") || errorMessage.includes("network")) {
      category = ErrorCategory.NETWORK_ERROR;
      severity = ErrorSeverity.HIGH;
      recoveryStrategy = RecoveryStrategy.RETRY;
    } else if (errorMessage.includes("unauthorized") || errorMessage.includes("auth")) {
      category = ErrorCategory.AUTHENTICATION;
      severity = ErrorSeverity.HIGH;
      recoveryStrategy = RecoveryStrategy.MANUAL;
    } else if (errorMessage.includes("not found")) {
      category = ErrorCategory.RESOURCE_NOT_FOUND;
      severity = ErrorSeverity.LOW;
      recoveryStrategy = RecoveryStrategy.FALLBACK;
    }

    return {
      category,
      severity,
      recoveryStrategy,
      confidence: 0.5, // 低信心度
      description: `基於消息內容的默認分類: ${error.message}`,
      possibleCauses: this.getPossibleCauses(category),
      suggestedActions: this.getSuggestedActions(recoveryStrategy),
      isRetryable: this.isRetryableStrategy(recoveryStrategy),
      estimatedRetryDelay: this.getRetryDelay(category),
      maxRetryAttempts: this.getMaxRetryAttempts(severity),
      relatedErrors: [],
      tags: ["default-classification"],
    };
  }

  /**
   * 創建默認分類
   */
  private createDefaultClassification(error: Error): ErrorClassification {
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.MANUAL,
      confidence: 0.1,
      description: `無法分類的錯誤: ${error.message}`,
      possibleCauses: ["未知原因"],
      suggestedActions: ["檢查錯誤日誌", "聯繫技術支援"],
      isRetryable: false,
      estimatedRetryDelay: 0,
      maxRetryAttempts: 0,
      relatedErrors: [],
      tags: ["unclassified"],
    };
  }

  /**
   * 獲取可能原因
   */
  private getPossibleCauses(category: ErrorCategory): string[] {
    const causesMap: Record<ErrorCategory, string[]> = {
      [ErrorCategory.CONNECTION]: ["服務器未啟動", "網絡不通", "防火牆阻止", "端口未開放"],
      [ErrorCategory.TIMEOUT]: ["請求處理時間過長", "網絡延遲", "服務器負載過高", "超時設置過短"],
      [ErrorCategory.AUTHENTICATION]: ["憑證過期", "用戶名密碼錯誤", "API 密鑰無效", "權限不足"],
      [ErrorCategory.AUTHORIZATION]: ["權限不足", "角色配置錯誤", "資源訪問被拒絕"],
      [ErrorCategory.RATE_LIMIT]: ["請求頻率過高", "配額用盡", "並發限制"],
      [ErrorCategory.SERVER_ERROR]: ["服務器內部錯誤", "數據庫連接失敗", "依賴服務不可用"],
      [ErrorCategory.CLIENT_ERROR]: ["請求格式錯誤", "參數缺失", "數據類型錯誤"],
      [ErrorCategory.VALIDATION]: ["參數格式錯誤", "必填字段缺失", "數據驗證失敗"],
      [ErrorCategory.RESOURCE_NOT_FOUND]: ["資源已被刪除", "URL 路徑錯誤", "服務不存在"],
      [ErrorCategory.TOOL_NOT_FOUND]: ["工具名稱錯誤", "工具未註冊", "版本不兼容"],
      [ErrorCategory.PROTOCOL_ERROR]: ["協議版本不匹配", "消息格式錯誤", "握手失敗"],
      [ErrorCategory.NETWORK_ERROR]: ["網絡斷開", "DNS 解析失敗", "路由問題"],
      [ErrorCategory.UNKNOWN]: ["未知原因", "需要進一步調查"],
    };

    return causesMap[category] || ["未知原因"];
  }

  /**
   * 獲取建議操作
   */
  private getSuggestedActions(strategy: RecoveryStrategy): string[] {
    const actionsMap: Record<RecoveryStrategy, string[]> = {
      [RecoveryStrategy.RETRY]: ["等待後重試", "檢查網絡連接", "確認服務狀態"],
      [RecoveryStrategy.FALLBACK]: ["使用備用服務", "切換到離線模式", "提供默認結果"],
      [RecoveryStrategy.CIRCUIT_BREAKER]: ["暫停服務調用", "等待服務恢復", "監控服務狀態"],
      [RecoveryStrategy.BACKOFF]: ["指數退避重試", "減少請求頻率", "等待配額恢復"],
      [RecoveryStrategy.IGNORE]: ["記錄錯誤", "繼續後續操作", "定期檢查"],
      [RecoveryStrategy.ESCALATE]: ["升級到上級處理", "發送告警通知", "啟動應急預案"],
      [RecoveryStrategy.MANUAL]: ["人工干預", "檢查配置", "聯繫技術支援"],
    };

    return actionsMap[strategy] || ["聯繫技術支援"];
  }

  /**
   * 檢查是否可重試
   */
  private isRetryableStrategy(strategy: RecoveryStrategy): boolean {
    return [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.BACKOFF,
      RecoveryStrategy.CIRCUIT_BREAKER,
    ].includes(strategy);
  }

  /**
   * 獲取重試延遲
   */
  private getRetryDelay(category: ErrorCategory): number {
    const delayMap: Partial<Record<ErrorCategory, number>> = {
      [ErrorCategory.CONNECTION]: 5000, // 5 seconds
      [ErrorCategory.TIMEOUT]: 3000, // 3 seconds
      [ErrorCategory.RATE_LIMIT]: 60000, // 1 minute
      [ErrorCategory.SERVER_ERROR]: 10000, // 10 seconds
      [ErrorCategory.NETWORK_ERROR]: 5000, // 5 seconds
    };

    return delayMap[category] || 5000;
  }

  /**
   * 獲取最大重試次數
   */
  private getMaxRetryAttempts(severity: ErrorSeverity): number {
    const attemptsMap: Record<ErrorSeverity, number> = {
      [ErrorSeverity.CRITICAL]: 0, // 不重試
      [ErrorSeverity.HIGH]: 1, // 重試 1 次
      [ErrorSeverity.MEDIUM]: 3, // 重試 3 次
      [ErrorSeverity.LOW]: 5, // 重試 5 次
      [ErrorSeverity.INFO]: 0, // 不重試
    };

    return attemptsMap[severity] || 3;
  }

  /**
   * 生成錯誤簽名
   */
  private generateErrorSignature(error: Error, context: ErrorContext): string {
    const parts = [
      error.name,
      error.message.slice(0, 100), // 只取前100字符
      context.serverId,
      context.toolName || "",
    ];

    return this.simpleHash(parts.join("|"));
  }

  /**
   * 簡單哈希函數
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為32位整數
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 清理舊記錄
   */
  private cleanupOldRecords(): void {
    const cutoffDate = new Date(Date.now() - this.config.errorHistoryDays * 24 * 60 * 60 * 1000);
    this.errorHistory = this.errorHistory.filter((record) => record.timestamp >= cutoffDate);
  }

  /**
   * 更新統計
   */
  private updateStats(classification: ErrorClassification): void {
    this.stats.totalErrors++;
    this.stats.categoryCounts[classification.category]++;
    this.stats.severityCounts[classification.severity]++;
  }

  /**
   * 啟動統計計算
   */
  private startStatsCalculation(): void {
    this.statsTimer = setInterval(() => {
      this.calculateStats();
    }, this.config.statsInterval);
  }

  /**
   * 計算統計信息
   */
  private calculateStats(): void {
    // 計算頂級錯誤模式
    const patternCounts = new Map<string, number>();
    for (const record of this.errorHistory) {
      const pattern = record.classification.tags[0] || "unknown";
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }

    this.stats.topErrorPatterns = Array.from(patternCounts.entries())
      .map(([pattern, count]) => ({
        pattern,
        count,
        percentage: (count / this.stats.totalErrors) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 計算重複錯誤
    const signatureCounts = new Map<string, { count: number; firstSeen: Date; lastSeen: Date }>();
    for (const record of this.errorHistory) {
      const existing = signatureCounts.get(record.signature);
      if (existing) {
        existing.count++;
        existing.lastSeen = record.timestamp;
      } else {
        signatureCounts.set(record.signature, {
          count: 1,
          firstSeen: record.timestamp,
          lastSeen: record.timestamp,
        });
      }
    }

    this.stats.recurrentErrors = Array.from(signatureCounts.entries())
      .filter(([, data]) => data.count > 1)
      .map(([signature, data]) => ({
        signature,
        ...data,
      }))
      .sort((a, b) => b.count - a.count);

    this.emit("statsUpdated", this.stats);
  }

  /**
   * 計算趨勢
   */
  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;

    // 簡單線性回歸斜率
    const n = data.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = data.reduce((sum, val) => sum + val, 0);
    const sumXY = data.reduce((sum, val, i) => sum + i * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * 創建空統計對象
   */
  private createEmptyStats(): ErrorStats {
    return {
      totalErrors: 0,
      categoryCounts: Object.values(ErrorCategory).reduce(
        (acc, cat) => {
          acc[cat] = 0;
          return acc;
        },
        {} as Record<ErrorCategory, number>
      ),
      severityCounts: Object.values(ErrorSeverity).reduce(
        (acc, sev) => {
          acc[sev] = 0;
          return acc;
        },
        {} as Record<ErrorSeverity, number>
      ),
      topErrorPatterns: [],
      averageClassificationTime: 0,
      classificationAccuracy: 0,
      recurrentErrors: [],
    };
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof ErrorClassifierEvents>(
    event: K,
    listener: ErrorClassifierEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof ErrorClassifierEvents>(
    event: K,
    ...args: Parameters<ErrorClassifierEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
