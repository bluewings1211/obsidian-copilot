/**
 * 上下文感知向量搜索
 */

import { EventEmitter } from "events";
import {
  VectorSearchResult,
  VectorSearchRequest,
  VectorSearchContext,
  SemanticConfig,
  MultiLevelSearchResult,
  SemanticCluster,
} from "../types";

export class ContextualVectorSearch extends EventEmitter {
  private config: SemanticConfig;
  private contextHistory: Map<string, ContextSession> = new Map();
  private isInitialized: boolean = false;

  constructor(config: SemanticConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化上下文感知搜索
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 執行上下文感知搜索
   */
  async searchWithContext(
    request: VectorSearchRequest,
    context?: VectorSearchContext
  ): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error("ContextualVectorSearch not initialized");
    }

    const searchStartTime = Date.now();

    try {
      this.emit("contextual_search_started", {
        hasContext: !!context,
        sessionId: context?.sessionId,
      });

      // 1. 獲取或創建會話上下文
      const session = this.getOrCreateSession(context);

      // 2. 更新會話歷史
      this.updateSessionHistory(session, request);

      // 3. 生成上下文增強查詢
      const enhancedRequest = await this.enhanceQueryWithContext(request, session);

      // 4. 執行多層次搜索
      let results: VectorSearchResult[] = [];

      if (this.config.multiLevelSearch) {
        const multiLevelResults = await this.performMultiLevelSearch(enhancedRequest, session);
        results = this.aggregateMultiLevelResults(multiLevelResults);
      } else {
        // 簡單的上下文增強搜索
        results = await this.performContextualSearch(enhancedRequest, session);
      }

      // 5. 應用上下文權重
      results = this.applyContextualWeighting(results, session);

      // 6. 更新會話狀態
      this.updateSessionResults(session, results);

      this.emit("contextual_search_completed", {
        sessionId: session.id,
        resultCount: results.length,
        processingTime: Date.now() - searchStartTime,
      });

      return results;
    } catch (error) {
      this.emit("contextual_search_failed", { error });
      throw error;
    }
  }

  /**
   * 獲取或創建會話
   */
  private getOrCreateSession(context?: VectorSearchContext): ContextSession {
    const sessionId = context?.sessionId || this.generateSessionId();

    let session = this.contextHistory.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        userId: context?.userId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        queryHistory: [],
        resultHistory: [],
        userPreferences: context?.userPreferences || {},
        contextualPatterns: new Map(),
        semanticClusters: [],
      };
      this.contextHistory.set(sessionId, session);
    }

    session.lastActivity = Date.now();
    return session;
  }

  /**
   * 更新會話歷史
   */
  private updateSessionHistory(session: ContextSession, request: VectorSearchRequest): void {
    const queryEntry = {
      query: typeof request.query === "string" ? request.query : "vector_query",
      timestamp: Date.now(),
      filters: request.filters,
      context: request.context,
    };

    session.queryHistory.push(queryEntry);

    // 保持歷史記錄在合理範圍內
    if (session.queryHistory.length > 20) {
      session.queryHistory = session.queryHistory.slice(-15);
    }

    // 分析查詢模式
    this.analyzeQueryPatterns(session);
  }

  /**
   * 使用上下文增強查詢
   */
  private async enhanceQueryWithContext(
    request: VectorSearchRequest,
    session: ContextSession
  ): Promise<VectorSearchRequest> {
    const enhanced = { ...request };

    // 1. 基於查詢歷史增強
    if (session.queryHistory.length > 0) {
      enhanced.context = {
        ...enhanced.context,
        previousQueries: session.queryHistory
          .slice(-5)
          .map((q) => q.query)
          .filter((q) => q !== "vector_query"),
        queryPatterns: Array.from(session.contextualPatterns.keys()),
      };
    }

    // 2. 基於用戶偏好增強
    if (Object.keys(session.userPreferences).length > 0) {
      enhanced.context = {
        ...enhanced.context,
        userPreferences: session.userPreferences,
      };
    }

    // 3. 基於語義聚類增強
    if (session.semanticClusters.length > 0) {
      enhanced.context = {
        ...enhanced.context,
        semanticContext: this.extractSemanticContext(session.semanticClusters),
      };
    }

    return enhanced;
  }

  /**
   * 執行多層次搜索
   */
  private async performMultiLevelSearch(
    request: VectorSearchRequest,
    session: ContextSession
  ): Promise<MultiLevelSearchResult> {
    // 主要搜索：直接匹配
    const primaryResults = await this.performPrimarySearch(request);

    // 次要搜索：上下文擴展
    const secondaryResults = await this.performSecondarySearch(request, session);

    // 三級搜索：語義聯想
    const tertiaryResults = await this.performTertiarySearch(request, session);

    return {
      primaryResults,
      secondaryResults,
      tertiaryResults,
      levelWeights: [0.6, 0.3, 0.1], // 主要、次要、三級權重
      aggregatedScore: 0, // 將在聚合時計算
    };
  }

  /**
   * 執行主要搜索
   */
  private async performPrimarySearch(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    // 這裡應該調用核心向量搜索
    // 暫時返回空結果，實際實現需要集成主搜索引擎
    return [];
  }

  /**
   * 執行次要搜索（上下文擴展）
   */
  private async performSecondarySearch(
    request: VectorSearchRequest,
    session: ContextSession
  ): Promise<VectorSearchResult[]> {
    // 基於上下文歷史的擴展搜索
    const expandedTerms = this.generateContextualExpansion(request, session);

    if (expandedTerms.length === 0) {
      return [];
    }

    // 使用擴展詞彙進行搜索
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const expandedRequest = {
      ...request,
      query:
        typeof request.query === "string"
          ? `${request.query} ${expandedTerms.join(" ")}`
          : request.query,
    };

    // 這裡應該調用擴展搜索
    return [];
  }

  /**
   * 執行三級搜索（語義聯想）
   */
  private async performTertiarySearch(
    request: VectorSearchRequest,
    session: ContextSession
  ): Promise<VectorSearchResult[]> {
    // 基於語義聚類的聯想搜索
    const associativeTerms = this.generateSemanticAssociations(request, session);

    if (associativeTerms.length === 0) {
      return [];
    }

    // 使用聯想詞彙進行搜索
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const associativeRequest = {
      ...request,
      query: typeof request.query === "string" ? associativeTerms.join(" ") : request.query,
    };

    // 這裡應該調用聯想搜索
    return [];
  }

  /**
   * 聚合多層次結果
   */
  private aggregateMultiLevelResults(multiLevel: MultiLevelSearchResult): VectorSearchResult[] {
    const allResults: VectorSearchResult[] = [];
    const seenIds = new Set<string>();

    // 按權重合併結果
    const levels = [
      { results: multiLevel.primaryResults, weight: multiLevel.levelWeights[0] },
      { results: multiLevel.secondaryResults, weight: multiLevel.levelWeights[1] },
      { results: multiLevel.tertiaryResults, weight: multiLevel.levelWeights[2] },
    ];

    for (const level of levels) {
      for (const result of level.results) {
        const docId = result.document.metadata.id || result.document.metadata.path;

        if (!seenIds.has(docId)) {
          // 應用層次權重
          const weightedResult = {
            ...result,
            score: result.score * level.weight,
            metadata: {
              ...result.metadata,
              multiLevelWeight: level.weight,
            },
          };

          allResults.push(weightedResult);
          seenIds.add(docId);
        }
      }
    }

    return allResults.sort((a, b) => b.score - a.score);
  }

  /**
   * 執行上下文搜索
   */
  private async performContextualSearch(
    request: VectorSearchRequest,
    session: ContextSession
  ): Promise<VectorSearchResult[]> {
    // 簡化的上下文搜索實現
    return [];
  }

  /**
   * 應用上下文權重
   */
  private applyContextualWeighting(
    results: VectorSearchResult[],
    session: ContextSession
  ): VectorSearchResult[] {
    if (!this.config.contextualWeighting) {
      return results;
    }

    return results.map((result) => {
      const contextWeight = this.calculateContextualWeight(result, session);

      return {
        ...result,
        score: result.score * contextWeight,
        metadata: {
          ...result.metadata,
          contextualWeight: contextWeight,
        },
      };
    });
  }

  /**
   * 計算上下文權重
   */
  private calculateContextualWeight(result: VectorSearchResult, session: ContextSession): number {
    let weight = 1.0;

    // 基於查詢歷史的權重
    const historyWeight = this.calculateHistoryWeight(result, session);
    weight *= 1 + historyWeight * 0.1;

    // 基於用戶偏好的權重
    const preferenceWeight = this.calculatePreferenceWeight(result, session);
    weight *= 1 + preferenceWeight * 0.15;

    // 基於語義一致性的權重
    const semanticWeight = this.calculateSemanticConsistency(result, session);
    weight *= 1 + semanticWeight * 0.1;

    return Math.min(weight, 2.0); // 限制最大權重
  }

  /**
   * 計算歷史權重
   */
  private calculateHistoryWeight(result: VectorSearchResult, session: ContextSession): number {
    const documentContent = result.document.pageContent.toLowerCase();
    let historyScore = 0;

    // 檢查與歷史查詢的相關性
    for (const queryEntry of session.queryHistory.slice(-5)) {
      if (queryEntry.query === "vector_query") continue;

      const queryTerms = queryEntry.query.toLowerCase().split(/\s+/);
      let termMatches = 0;

      for (const term of queryTerms) {
        if (term.length > 2 && documentContent.includes(term)) {
          termMatches++;
        }
      }

      if (queryTerms.length > 0) {
        historyScore += termMatches / queryTerms.length;
      }
    }

    return Math.min(historyScore / 5, 1.0);
  }

  /**
   * 計算偏好權重
   */
  private calculatePreferenceWeight(result: VectorSearchResult, session: ContextSession): number {
    if (Object.keys(session.userPreferences).length === 0) {
      return 0;
    }

    let preferenceScore = 0;
    let factorCount = 0;

    // 文檔類型偏好
    if (session.userPreferences.documentTypes) {
      const docType = this.extractDocumentType(result);
      const typeScore = session.userPreferences.documentTypes[docType] || 0;
      preferenceScore += typeScore;
      factorCount++;
    }

    // 內容長度偏好
    if (session.userPreferences.contentLength) {
      const lengthScore = this.calculateLengthPreference(
        result.document.pageContent.length,
        session.userPreferences.contentLength
      );
      preferenceScore += lengthScore;
      factorCount++;
    }

    return factorCount > 0 ? preferenceScore / factorCount : 0;
  }

  /**
   * 計算語義一致性
   */
  private calculateSemanticConsistency(
    result: VectorSearchResult,
    session: ContextSession
  ): number {
    if (session.semanticClusters.length === 0) {
      return 0;
    }

    const documentContent = result.document.pageContent.toLowerCase();
    let maxConsistency = 0;

    for (const cluster of session.semanticClusters) {
      let clusterMatch = 0;

      for (const term of cluster.terms) {
        if (documentContent.includes(term.toLowerCase())) {
          clusterMatch++;
        }
      }

      const consistency =
        cluster.terms.length > 0 ? (clusterMatch / cluster.terms.length) * cluster.weight : 0;

      maxConsistency = Math.max(maxConsistency, consistency);
    }

    return maxConsistency;
  }

  /**
   * 分析查詢模式
   */
  private analyzeQueryPatterns(session: ContextSession): void {
    if (session.queryHistory.length < 3) {
      return;
    }

    const recentQueries = session.queryHistory
      .slice(-5)
      .map((q) => q.query)
      .filter((q) => q !== "vector_query");

    // 提取常見詞彙
    const termFrequency = new Map<string, number>();

    for (const query of recentQueries) {
      const terms = query.toLowerCase().split(/\s+/);
      for (const term of terms) {
        if (term.length > 2) {
          termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
        }
      }
    }

    // 識別模式
    for (const [term, frequency] of termFrequency.entries()) {
      if (frequency >= 2) {
        session.contextualPatterns.set(term, frequency / recentQueries.length);
      }
    }

    // 創建語義聚類
    this.updateSemanticClusters(session, termFrequency);
  }

  /**
   * 更新語義聚類
   */
  private updateSemanticClusters(
    session: ContextSession,
    termFrequency: Map<string, number>
  ): void {
    const significantTerms = Array.from(termFrequency.entries())
      .filter(([_, freq]) => freq >= 2)
      .map(([term, freq]) => ({ term, weight: freq }));

    if (significantTerms.length > 0) {
      const cluster: SemanticCluster = {
        centroid: [], // 簡化實現，實際應計算向量中心
        terms: significantTerms.map((t) => t.term),
        weight: significantTerms.reduce((sum, t) => sum + t.weight, 0) / significantTerms.length,
        coherenceScore: 0.8, // 簡化值
      };

      session.semanticClusters.push(cluster);

      // 保持聚類數量合理
      if (session.semanticClusters.length > 5) {
        session.semanticClusters = session.semanticClusters.slice(-3);
      }
    }
  }

  /**
   * 生成上下文擴展
   */
  private generateContextualExpansion(
    request: VectorSearchRequest,
    session: ContextSession
  ): string[] {
    const expansionTerms: string[] = [];

    // 從上下文模式中提取擴展詞
    const topPatterns = Array.from(session.contextualPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([term]) => term);

    expansionTerms.push(...topPatterns);

    return expansionTerms;
  }

  /**
   * 生成語義聯想
   */
  private generateSemanticAssociations(
    request: VectorSearchRequest,
    session: ContextSession
  ): string[] {
    const associations: string[] = [];

    // 從語義聚類中提取聯想詞
    for (const cluster of session.semanticClusters.slice(0, 2)) {
      associations.push(...cluster.terms.slice(0, 2));
    }

    return associations;
  }

  /**
   * 提取語義上下文
   */
  private extractSemanticContext(clusters: SemanticCluster[]): Record<string, any> {
    return {
      primaryTopics: clusters.map((c) => c.terms.slice(0, 3)),
      coherenceScores: clusters.map((c) => c.coherenceScore),
      clusterWeights: clusters.map((c) => c.weight),
    };
  }

  /**
   * 更新會話結果
   */
  private updateSessionResults(session: ContextSession, results: VectorSearchResult[]): void {
    const resultSummary = {
      timestamp: Date.now(),
      resultCount: results.length,
      topScores: results.slice(0, 3).map((r) => r.score),
      documentTypes: results.map((r) => this.extractDocumentType(r)),
    };

    session.resultHistory.push(resultSummary);

    // 保持結果歷史在合理範圍內
    if (session.resultHistory.length > 10) {
      session.resultHistory = session.resultHistory.slice(-8);
    }
  }

  /**
   * 輔助方法
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractDocumentType(result: VectorSearchResult): string {
    const path = result.document.metadata.path || "";
    const extension = path.split(".").pop()?.toLowerCase() || "unknown";
    return extension;
  }

  private calculateLengthPreference(contentLength: number, preference: any): number {
    const preferredLength = preference.preferred || 1000;
    const tolerance = preference.tolerance || 0.5;

    const ratio = contentLength / preferredLength;
    if (ratio >= 1 - tolerance && ratio <= 1 + tolerance) {
      return 1.0;
    }

    return Math.max(0, 1 - Math.abs(ratio - 1));
  }

  /**
   * 清理過期會話
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    for (const [sessionId, session] of this.contextHistory.entries()) {
      if (now - session.lastActivity > maxAge) {
        this.contextHistory.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.emit("sessions_cleaned", { cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * 獲取會話統計
   */
  getSessionStatistics(): {
    totalSessions: number;
    activeSessions: number;
    averageQueriesPerSession: number;
    topPatterns: Array<{ pattern: string; frequency: number }>;
  } {
    const now = Date.now();
    const activeThreshold = 30 * 60 * 1000; // 30 minutes

    let activeSessions = 0;
    let totalQueries = 0;
    const allPatterns = new Map<string, number>();

    for (const session of this.contextHistory.values()) {
      if (now - session.lastActivity < activeThreshold) {
        activeSessions++;
      }

      totalQueries += session.queryHistory.length;

      for (const [pattern, frequency] of session.contextualPatterns.entries()) {
        allPatterns.set(pattern, (allPatterns.get(pattern) || 0) + frequency);
      }
    }

    const topPatterns = Array.from(allPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, frequency]) => ({ pattern, frequency }));

    return {
      totalSessions: this.contextHistory.size,
      activeSessions,
      averageQueriesPerSession:
        this.contextHistory.size > 0 ? totalQueries / this.contextHistory.size : 0,
      topPatterns,
    };
  }

  /**
   * 關閉上下文搜索
   */
  async shutdown(): Promise<void> {
    this.contextHistory.clear();
    this.isInitialized = false;
    this.emit("shutdown");
  }
}

/**
 * 會話上下文接口
 */
interface ContextSession {
  id: string;
  userId?: string;
  createdAt: number;
  lastActivity: number;
  queryHistory: Array<{
    query: string;
    timestamp: number;
    filters?: any;
    context?: any;
  }>;
  resultHistory: Array<{
    timestamp: number;
    resultCount: number;
    topScores: number[];
    documentTypes: string[];
  }>;
  userPreferences: Record<string, any>;
  contextualPatterns: Map<string, number>;
  semanticClusters: SemanticCluster[];
}
