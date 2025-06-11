/**
 * 故障檢測器
 *
 * 提供智能故障檢測和分析功能：
 * - 實時故障監測
 * - 故障模式識別
 * - 根本原因分析
 * - 預測性故障檢測
 */

import { EventEmitter } from "events";
import { createLogger } from "@/pocketflow/utils/logger";
import { ErrorClassificationEngine } from "./ErrorClassificationEngine";

/**
 * 故障類型
 */
export enum FaultType {
  TIMEOUT = "timeout",
  CONNECTION = "connection",
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
  PERFORMANCE = "performance",
  MEMORY = "memory",
  UNKNOWN = "unknown",
}

/**
 * 故障嚴重程度
 */
export enum FaultSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

/**
 * 故障信息
 */
export interface FaultInfo {
  id: string;
  type: FaultType;
  severity: FaultSeverity;
  timestamp: Date;
  description: string;
  originalError: Error;
  context: Record<string, any>;
  stackTrace?: string;
  possibleCauses: string[];
  suggestedActions: string[];
  isRecoverable: boolean;
  estimatedRecoveryTime: number;
  affectedComponents: string[];
  metadata: Record<string, any>;
}

/**
 * 故障模式
 */
export interface FaultPattern {
  id: string;
  name: string;
  type: FaultType;
  description: string;
  indicators: Array<{
    field: string;
    operator: "equals" | "contains" | "regex" | "threshold";
    value: any;
    weight: number;
  }>;
  confidence: number;
  actions: string[];
}

/**
 * 故障檢測配置
 */
export interface FaultDetectorConfig {
  /** 啟用故障檢測 */
  enabled?: boolean;
  /** 檢測間隔（毫秒） */
  detectionInterval?: number;
  /** 故障閾值 */
  faultThreshold?: number;
  /** 啟用預測性檢測 */
  enablePredictive?: boolean;
  /** 歷史數據保留天數 */
  historyRetentionDays?: number;
  /** 自定義故障模式 */
  customPatterns?: FaultPattern[];
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 故障統計
 */
export interface FaultStatistics {
  totalFaults: number;
  faultsByType: Record<FaultType, number>;
  faultsBySeverity: Record<FaultSeverity, number>;
  averageDetectionTime: number;
  falsePositiveRate: number;
  recoverySuccessRate: number;
  recentTrends: {
    increasing: FaultType[];
    decreasing: FaultType[];
    stable: FaultType[];
  };
}

/**
 * 故障檢測事件
 */
export interface FaultDetectorEvents {
  faultDetected: (fault: FaultInfo) => void;
  patternMatched: (pattern: FaultPattern, fault: FaultInfo) => void;
  predictiveFaultWarning: (prediction: any) => void;
  statisticsUpdated: (stats: FaultStatistics) => void;
}

/**
 * 故障檢測器
 */
export class FaultDetector extends EventEmitter {
  private config: Required<FaultDetectorConfig>;
  private logger = createLogger("FaultDetector");

  // 組件
  private errorClassifier: ErrorClassificationEngine;

  // 運行時狀態
  private isStarted = false;
  private faultHistory: FaultInfo[] = [];
  private faultPatterns: FaultPattern[] = [];
  private statistics: FaultStatistics;
  private detectionTimer: NodeJS.Timeout | null = null;
  private faultCounter = 0;

  constructor(config: FaultDetectorConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? true,
      detectionInterval: config.detectionInterval ?? 5000,
      faultThreshold: config.faultThreshold ?? 0.8,
      enablePredictive: config.enablePredictive ?? false,
      historyRetentionDays: config.historyRetentionDays ?? 7,
      customPatterns: config.customPatterns || [],
      debug: config.debug ?? false,
    };

    this.statistics = this.createEmptyStatistics();
    this.initializeComponents();
    this.initializeDefaultPatterns();
  }

  /**
   * 啟動故障檢測器
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.logger.info("啟動故障檢測器", { config: this.config });

    try {
      await this.errorClassifier.start();

      if (this.config.enabled) {
        this.startDetectionLoop();
      }

      this.isStarted = true;
      this.logger.info("故障檢測器啟動成功");
    } catch (error) {
      this.logger.error("故障檢測器啟動失敗", error);
      throw error;
    }
  }

  /**
   * 停止故障檢測器
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info("停止故障檢測器");

    this.stopDetectionLoop();
    await this.errorClassifier.stop();

    this.isStarted = false;
    this.logger.info("故障檢測器已停止");
  }

  /**
   * 分析故障
   */
  public async analyzeFault(error: Error, context: Record<string, any> = {}): Promise<FaultInfo> {
    const startTime = Date.now();

    try {
      // 使用錯誤分類引擎進行分析
      const classification = await this.errorClassifier.classify(error, context);

      // 創建故障信息
      const fault: FaultInfo = {
        id: this.generateFaultId(),
        type: this.mapErrorCategoryToFaultType(classification.category),
        severity: this.mapErrorSeverityToFaultSeverity(classification.severity),
        timestamp: new Date(),
        description: classification.description,
        originalError: error,
        context,
        stackTrace: error.stack,
        possibleCauses: classification.possibleCauses,
        suggestedActions: classification.suggestedActions,
        isRecoverable: classification.isRetryable,
        estimatedRecoveryTime: classification.estimatedRetryDelay,
        affectedComponents: this.identifyAffectedComponents(error, context),
        metadata: {
          confidence: classification.confidence,
          recoveryStrategy: classification.recoveryStrategy,
          maxRetryAttempts: classification.maxRetryAttempts,
          tags: classification.tags,
        },
      };

      // 檢查故障模式
      const matchedPatterns = this.findMatchingPatterns(fault);
      if (matchedPatterns.length > 0) {
        const bestMatch = matchedPatterns[0];
        fault.metadata.matchedPattern = bestMatch.id;
        fault.metadata.patternConfidence = bestMatch.confidence;

        this.emit("patternMatched", bestMatch, fault);
      }

      // 記錄故障
      this.recordFault(fault);

      // 更新統計
      const detectionTime = Date.now() - startTime;
      this.updateStatistics(fault, detectionTime);

      this.emit("faultDetected", fault);
      return fault;
    } catch (analysisError) {
      this.logger.error("故障分析失敗", analysisError);

      // 返回基本故障信息
      return this.createBasicFaultInfo(error, context);
    }
  }

  /**
   * 添加自定義故障模式
   */
  public addPattern(pattern: FaultPattern): void {
    this.faultPatterns.push(pattern);
    this.logger.info(`添加自定義故障模式: ${pattern.name}`, { patternId: pattern.id });
  }

  /**
   * 移除故障模式
   */
  public removePattern(patternId: string): boolean {
    const index = this.faultPatterns.findIndex((p) => p.id === patternId);
    if (index !== -1) {
      const pattern = this.faultPatterns.splice(index, 1)[0];
      this.logger.info(`移除故障模式: ${pattern.name}`, { patternId });
      return true;
    }
    return false;
  }

  /**
   * 獲取故障統計
   */
  public getStatistics(): FaultStatistics {
    this.calculateStatistics();
    return { ...this.statistics };
  }

  /**
   * 獲取故障歷史
   */
  public getFaultHistory(
    limit: number = 100,
    filter?: Partial<Pick<FaultInfo, "type" | "severity">>
  ): FaultInfo[] {
    let filtered = this.faultHistory;

    if (filter) {
      filtered = this.faultHistory.filter((fault) => {
        if (filter.type && fault.type !== filter.type) return false;
        if (filter.severity && fault.severity !== filter.severity) return false;
        return true;
      });
    }

    return filtered.slice(0, limit);
  }

  /**
   * 檢查健康狀態
   */
  public isHealthy(): boolean {
    if (!this.isStarted) return false;

    const recentFaults = this.getRecentFaults(5); // 最近5分鐘
    const criticalFaults = recentFaults.filter((f) => f.severity === FaultSeverity.CRITICAL);

    return criticalFaults.length === 0;
  }

  /**
   * 預測故障
   */
  public async predictFaults(): Promise<
    Array<{
      type: FaultType;
      probability: number;
      timeWindow: number;
      reason: string;
    }>
  > {
    if (!this.config.enablePredictive) {
      return [];
    }

    // 簡單的趨勢分析
    const predictions: Array<{
      type: FaultType;
      probability: number;
      timeWindow: number;
      reason: string;
    }> = [];

    const recentFaults = this.getRecentFaults(60); // 最近1小時
    const faultCounts = this.groupFaultsByType(recentFaults);

    for (const [type, count] of Object.entries(faultCounts)) {
      if (count > 3) {
        // 如果某類型故障頻繁出現
        const probability = Math.min(count / 10, 0.9); // 最高90%概率
        predictions.push({
          type: type as FaultType,
          probability,
          timeWindow: 30 * 60 * 1000, // 30分鐘
          reason: `最近1小時內該類型故障發生${count}次，頻率較高`,
        });
      }
    }

    return predictions;
  }

  /**
   * 初始化組件
   */
  private initializeComponents(): void {
    this.errorClassifier = new ErrorClassificationEngine({
      enableMachineLearning: false,
      debug: this.config.debug,
    });
  }

  /**
   * 初始化默認故障模式
   */
  private initializeDefaultPatterns(): void {
    this.faultPatterns = [
      {
        id: "timeout-pattern",
        name: "超時故障模式",
        type: FaultType.TIMEOUT,
        description: "請求超時故障",
        indicators: [
          { field: "error.message", operator: "contains", value: "timeout", weight: 1.0 },
          { field: "error.message", operator: "contains", value: "timed out", weight: 1.0 },
        ],
        confidence: 0.9,
        actions: ["重試", "增加超時時間", "檢查網絡連接"],
      },
      {
        id: "connection-pattern",
        name: "連接故障模式",
        type: FaultType.CONNECTION,
        description: "連接失敗故障",
        indicators: [
          { field: "error.message", operator: "contains", value: "connection", weight: 1.0 },
          { field: "error.message", operator: "contains", value: "ECONNREFUSED", weight: 1.0 },
        ],
        confidence: 0.9,
        actions: ["檢查服務狀態", "重試連接", "使用備用服務"],
      },
      {
        id: "auth-pattern",
        name: "認證故障模式",
        type: FaultType.AUTHENTICATION,
        description: "身份驗證失敗",
        indicators: [
          { field: "error.message", operator: "contains", value: "unauthorized", weight: 1.0 },
          { field: "error.message", operator: "contains", value: "authentication", weight: 1.0 },
        ],
        confidence: 0.95,
        actions: ["檢查憑證", "重新認證", "聯繫管理員"],
      },
    ];

    // 添加自定義模式
    if (this.config.customPatterns.length > 0) {
      this.faultPatterns.push(...this.config.customPatterns);
    }
  }

  /**
   * 找到匹配的故障模式
   */
  private findMatchingPatterns(fault: FaultInfo): FaultPattern[] {
    const matches: Array<{ pattern: FaultPattern; confidence: number }> = [];

    for (const pattern of this.faultPatterns) {
      const confidence = this.calculatePatternMatch(fault, pattern);

      if (confidence >= this.config.faultThreshold) {
        matches.push({ pattern, confidence });
      }
    }

    // 按信心度排序
    return matches.sort((a, b) => b.confidence - a.confidence).map((m) => m.pattern);
  }

  /**
   * 計算模式匹配度
   */
  private calculatePatternMatch(fault: FaultInfo, pattern: FaultPattern): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const indicator of pattern.indicators) {
      const score = this.evaluateIndicator(fault, indicator);
      totalScore += score * indicator.weight;
      totalWeight += indicator.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * 評估指標
   */
  private evaluateIndicator(fault: FaultInfo, indicator: FaultPattern["indicators"][0]): number {
    let fieldValue: any;

    // 獲取字段值
    switch (indicator.field) {
      case "error.message":
        fieldValue = fault.originalError.message;
        break;
      case "error.name":
        fieldValue = fault.originalError.name;
        break;
      case "fault.type":
        fieldValue = fault.type;
        break;
      case "fault.severity":
        fieldValue = fault.severity;
        break;
      default:
        return 0;
    }

    // 執行比較
    switch (indicator.operator) {
      case "equals":
        return fieldValue === indicator.value ? 1 : 0;
      case "contains":
        return typeof fieldValue === "string" &&
          fieldValue.toLowerCase().includes(String(indicator.value).toLowerCase())
          ? 1
          : 0;
      case "regex":
        return typeof fieldValue === "string" &&
          new RegExp(String(indicator.value), "i").test(fieldValue)
          ? 1
          : 0;
      case "threshold":
        return typeof fieldValue === "number" && fieldValue >= indicator.value ? 1 : 0;
      default:
        return 0;
    }
  }

  /**
   * 映射錯誤類別到故障類型
   */
  private mapErrorCategoryToFaultType(category: string): FaultType {
    const mapping: Record<string, FaultType> = {
      connection: FaultType.CONNECTION,
      timeout: FaultType.TIMEOUT,
      authentication: FaultType.AUTHENTICATION,
      authorization: FaultType.AUTHORIZATION,
      rate_limit: FaultType.RATE_LIMIT,
      server_error: FaultType.SERVER_ERROR,
      client_error: FaultType.CLIENT_ERROR,
      validation: FaultType.VALIDATION,
      resource_not_found: FaultType.RESOURCE_NOT_FOUND,
      tool_not_found: FaultType.TOOL_NOT_FOUND,
      protocol_error: FaultType.PROTOCOL_ERROR,
      network_error: FaultType.NETWORK_ERROR,
    };

    return mapping[category] || FaultType.UNKNOWN;
  }

  /**
   * 映射錯誤嚴重程度到故障嚴重程度
   */
  private mapErrorSeverityToFaultSeverity(severity: string): FaultSeverity {
    const mapping: Record<string, FaultSeverity> = {
      critical: FaultSeverity.CRITICAL,
      high: FaultSeverity.HIGH,
      medium: FaultSeverity.MEDIUM,
      low: FaultSeverity.LOW,
      info: FaultSeverity.INFO,
    };

    return mapping[severity] || FaultSeverity.MEDIUM;
  }

  /**
   * 識別受影響的組件
   */
  private identifyAffectedComponents(error: Error, context: Record<string, any>): string[] {
    const components: string[] = [];

    // 根據錯誤和上下文推斷受影響的組件
    if (context.serverId) {
      components.push(`server:${context.serverId}`);
    }

    if (context.toolName) {
      components.push(`tool:${context.toolName}`);
    }

    if (context.operationName) {
      components.push(`operation:${context.operationName}`);
    }

    // 根據錯誤消息推斷
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("database")) {
      components.push("database");
    }
    if (errorMessage.includes("network")) {
      components.push("network");
    }
    if (errorMessage.includes("memory")) {
      components.push("memory");
    }

    return components;
  }

  /**
   * 生成故障ID
   */
  private generateFaultId(): string {
    return `fault-${Date.now()}-${++this.faultCounter}`;
  }

  /**
   * 創建基本故障信息
   */
  private createBasicFaultInfo(error: Error, context: Record<string, any>): FaultInfo {
    return {
      id: this.generateFaultId(),
      type: FaultType.UNKNOWN,
      severity: FaultSeverity.MEDIUM,
      timestamp: new Date(),
      description: `未分類故障: ${error.message}`,
      originalError: error,
      context,
      stackTrace: error.stack,
      possibleCauses: ["未知原因"],
      suggestedActions: ["檢查錯誤日誌", "聯繫技術支援"],
      isRecoverable: false,
      estimatedRecoveryTime: 0,
      affectedComponents: [],
      metadata: {},
    };
  }

  /**
   * 記錄故障
   */
  private recordFault(fault: FaultInfo): void {
    this.faultHistory.unshift(fault);

    // 清理舊記錄
    const cutoffDate = new Date(
      Date.now() - this.config.historyRetentionDays * 24 * 60 * 60 * 1000
    );
    this.faultHistory = this.faultHistory.filter((f) => f.timestamp >= cutoffDate);
  }

  /**
   * 更新統計
   */
  private updateStatistics(fault: FaultInfo, detectionTime: number): void {
    this.statistics.totalFaults++;
    this.statistics.faultsByType[fault.type]++;
    this.statistics.faultsBySeverity[fault.severity]++;

    // 更新平均檢測時間
    this.statistics.averageDetectionTime =
      (this.statistics.averageDetectionTime + detectionTime) / 2;
  }

  /**
   * 獲取最近的故障
   */
  private getRecentFaults(minutes: number): FaultInfo[] {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    return this.faultHistory.filter((f) => f.timestamp >= cutoffTime);
  }

  /**
   * 按類型分組故障
   */
  private groupFaultsByType(faults: FaultInfo[]): Record<string, number> {
    const groups: Record<string, number> = {};

    for (const fault of faults) {
      groups[fault.type] = (groups[fault.type] || 0) + 1;
    }

    return groups;
  }

  /**
   * 啟動檢測循環
   */
  private startDetectionLoop(): void {
    if (this.detectionTimer) {
      return;
    }

    this.detectionTimer = setInterval(async () => {
      try {
        // 執行預測性檢測
        if (this.config.enablePredictive) {
          const predictions = await this.predictFaults();
          for (const prediction of predictions) {
            if (prediction.probability > 0.7) {
              this.emit("predictiveFaultWarning", prediction);
            }
          }
        }

        // 計算統計
        this.calculateStatistics();
      } catch (error) {
        this.logger.error("檢測循環執行失敗", error);
      }
    }, this.config.detectionInterval);
  }

  /**
   * 停止檢測循環
   */
  private stopDetectionLoop(): void {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = null;
    }
  }

  /**
   * 計算統計信息
   */
  private calculateStatistics(): void {
    // 計算趨勢
    const recentFaults = this.getRecentFaults(60); // 最近1小時
    const previousFaults = this.faultHistory.filter((f) => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
      return f.timestamp < oneHourAgo && f.timestamp >= twoHoursAgo;
    });

    this.statistics.recentTrends = this.calculateTrends(recentFaults, previousFaults);
    this.emit("statisticsUpdated", this.statistics);
  }

  /**
   * 計算趨勢
   */
  private calculateTrends(
    recent: FaultInfo[],
    previous: FaultInfo[]
  ): { increasing: FaultType[]; decreasing: FaultType[]; stable: FaultType[] } {
    const recentCounts = this.groupFaultsByType(recent);
    const previousCounts = this.groupFaultsByType(previous);

    const increasing: FaultType[] = [];
    const decreasing: FaultType[] = [];
    const stable: FaultType[] = [];

    for (const type of Object.values(FaultType)) {
      const recentCount = recentCounts[type] || 0;
      const previousCount = previousCounts[type] || 0;

      if (recentCount > previousCount * 1.2) {
        increasing.push(type);
      } else if (recentCount < previousCount * 0.8) {
        decreasing.push(type);
      } else {
        stable.push(type);
      }
    }

    return { increasing, decreasing, stable };
  }

  /**
   * 創建空統計對象
   */
  private createEmptyStatistics(): FaultStatistics {
    return {
      totalFaults: 0,
      faultsByType: Object.values(FaultType).reduce(
        (acc, type) => {
          acc[type] = 0;
          return acc;
        },
        {} as Record<FaultType, number>
      ),
      faultsBySeverity: Object.values(FaultSeverity).reduce(
        (acc, severity) => {
          acc[severity] = 0;
          return acc;
        },
        {} as Record<FaultSeverity, number>
      ),
      averageDetectionTime: 0,
      falsePositiveRate: 0,
      recoverySuccessRate: 0,
      recentTrends: {
        increasing: [],
        decreasing: [],
        stable: [],
      },
    };
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof FaultDetectorEvents>(event: K, listener: FaultDetectorEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof FaultDetectorEvents>(
    event: K,
    ...args: Parameters<FaultDetectorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
