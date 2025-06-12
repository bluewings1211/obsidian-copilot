/**
 * PocketFlow.js Search Aggregation System - Unified Search Aggregator
 * 統一搜索結果聚合器：整合所有搜索源的結果
 */

import {
  SearchSource,
  RawSearchResult,
  NormalizedSearchResult,
  SearchAggregationConfig,
  SearchAggregationEvent,
  SearchAggregationError,
  RankingContext,
  AggregationMetrics,
} from "../types";

import { SearchResultNormalizer } from "./SearchResultNormalizer";
import { MultiSourceResultMerger } from "./MultiSourceResultMerger";
import { ResultQualityFilter } from "./ResultQualityFilter";
import { IntelligentRanker } from "../ranking/IntelligentRanker";
import { PersonalizationEngine } from "../personalization/PersonalizationEngine";
import { AggregationMonitor } from "../monitoring/AggregationMonitor";

export interface AggregationRequest {
  query: string;
  sources: SearchSource[];
  context?: RankingContext;
  options?: AggregationOptions;
}

export interface AggregationOptions {
  maxResults?: number;
  enablePersonalization?: boolean;
  enableQualityFilter?: boolean;
  enableRanking?: boolean;
  timeout?: number;
  cacheResults?: boolean;
}

export interface AggregationResult {
  results: NormalizedSearchResult[];
  metrics: AggregationMetrics;
  metadata: {
    totalProcessed: number;
    sourcesUsed: string[];
    processingTime: number;
    qualityStats: {
      high: number;
      medium: number;
      low: number;
      filtered: number;
    };
  };
}

/**
 * 統一搜索結果聚合器
 * 負責協調整個聚合流程，整合所有搜索策略的結果
 */
export class UnifiedSearchAggregator {
  private normalizer: SearchResultNormalizer;
  private merger: MultiSourceResultMerger;
  private qualityFilter: ResultQualityFilter;
  private ranker: IntelligentRanker;
  private personalizationEngine: PersonalizationEngine;
  private monitor: AggregationMonitor;

  private eventListeners: Map<string, ((event: SearchAggregationEvent) => void)[]> = new Map();
  private cache: Map<string, AggregationResult> = new Map();

  constructor(private config: SearchAggregationConfig) {
    this.normalizer = new SearchResultNormalizer(config.core);
    this.merger = new MultiSourceResultMerger(config.core);
    this.qualityFilter = new ResultQualityFilter(config.quality);
    this.ranker = new IntelligentRanker(config.ranking);
    this.personalizationEngine = new PersonalizationEngine(config.personalization);
    this.monitor = new AggregationMonitor(config.monitoring);
  }

  /**
   * 聚合搜索結果
   */
  async aggregate(request: AggregationRequest): Promise<AggregationResult> {
    const startTime = Date.now();
    const aggregationId = this.generateAggregationId(request);

    try {
      this.emitEvent("aggregation_started", {
        aggregationId,
        query: request.query,
        sources: request.sources.map((s) => s.id),
      });

      // 1. 預處理和驗證
      this.validateRequest(request);
      const processedSources = this.preprocessSources(request.sources);

      // 2. 檢查緩存
      const cacheKey = this.generateCacheKey(request);
      if (request.options?.cacheResults !== false && this.cache.has(cacheKey)) {
        const cachedResult = this.cache.get(cacheKey)!;
        this.monitor.recordCacheHit(aggregationId);
        return cachedResult;
      }

      // 3. 並行執行搜索（模擬從各個搜索引擎獲取結果）
      const rawResults = await this.executeParallelSearches(request, processedSources);

      // 4. 標準化結果
      const normalizedResults = await this.normalizeResults(rawResults, aggregationId);

      // 5. 合併多源結果
      const mergedResults = await this.mergeResults(normalizedResults, aggregationId);

      // 6. 質量過濾
      let filteredResults = mergedResults;
      if (request.options?.enableQualityFilter !== false) {
        filteredResults = await this.filterQuality(mergedResults, aggregationId);
      }

      // 7. 個性化處理
      if (request.options?.enablePersonalization && request.context?.userContext) {
        filteredResults = await this.personalizeResults(
          filteredResults,
          request.context,
          aggregationId
        );
      }

      // 8. 智能排序
      let finalResults = filteredResults;
      if (request.options?.enableRanking !== false && request.context) {
        finalResults = await this.rankResults(filteredResults, request.context, aggregationId);
      }

      // 9. 限制結果數量
      const maxResults = request.options?.maxResults || this.config.core.maxResults;
      finalResults = finalResults.slice(0, maxResults);

      // 10. 生成指標和元數據
      const processingTime = Date.now() - startTime;
      const metrics = this.generateMetrics(rawResults, finalResults, processingTime);
      const metadata = this.generateMetadata(
        rawResults,
        finalResults,
        processedSources,
        processingTime
      );

      const result: AggregationResult = {
        results: finalResults,
        metrics,
        metadata,
      };

      // 11. 緩存結果
      if (request.options?.cacheResults !== false) {
        this.cacheResult(cacheKey, result);
      }

      // 12. 記錄監控指標
      this.monitor.recordAggregation(aggregationId, result);

      this.emitEvent("aggregation_completed", {
        aggregationId,
        resultCount: finalResults.length,
        processingTime,
      });

      return result;
    } catch (error) {
      this.emitEvent("error_occurred", {
        aggregationId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.monitor.recordError(aggregationId, error as Error);
      throw new SearchAggregationError(
        `聚合失敗: ${error instanceof Error ? error.message : String(error)}`,
        "AGGREGATION_FAILED",
        { aggregationId, query: request.query }
      );
    }
  }

  /**
   * 執行並行搜索（模擬）
   */
  private async executeParallelSearches(
    request: AggregationRequest,
    sources: SearchSource[]
  ): Promise<RawSearchResult[]> {
    const timeout = request.options?.timeout || this.config.core.aggregationTimeout;

    // 這裡模擬調用各個搜索引擎的邏輯
    // 在實際應用中，這會調用 MapReduce、向量搜索、關鍵字搜索等引擎
    const searchPromises = sources.map(async (source) => {
      try {
        // 模擬搜索延遲
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));

        // 模擬搜索結果
        return this.simulateSearchResults(request.query, source);
      } catch (error) {
        console.warn(`搜索源 ${source.id} 執行失敗:`, error);
        return [];
      }
    });

    const results = await Promise.allSettled(
      searchPromises.map((promise) =>
        Promise.race([
          promise,
          new Promise<RawSearchResult[]>((_, reject) =>
            setTimeout(() => reject(new Error("搜索超時")), timeout)
          ),
        ])
      )
    );

    return results
      .filter(
        (result): result is PromiseFulfilledResult<RawSearchResult[]> =>
          result.status === "fulfilled"
      )
      .flatMap((result) => result.value);
  }

  /**
   * 模擬搜索結果（在實際應用中會被真實的搜索調用替代）
   */
  private simulateSearchResults(query: string, source: SearchSource): RawSearchResult[] {
    const mockResults: RawSearchResult[] = [];
    const resultCount = Math.floor(Math.random() * 10) + 1;

    for (let i = 0; i < resultCount; i++) {
      mockResults.push({
        id: `${source.id}-result-${i}`,
        content: `${source.type} 搜索結果 ${i + 1} for "${query}"`,
        title: `${source.type} 結果 ${i + 1}`,
        source,
        score: Math.random(),
        metadata: {
          sourceType: source.type,
          originalQuery: query,
          position: i,
        },
        timestamp: Date.now(),
        relevanceFactors: {
          textMatch: Math.random(),
          semanticSimilarity: Math.random(),
          contextRelevance: Math.random(),
          freshness: Math.random(),
          authority: Math.random(),
        },
      });
    }

    return mockResults;
  }

  /**
   * 標準化結果
   */
  private async normalizeResults(
    rawResults: RawSearchResult[],
    aggregationId: string
  ): Promise<NormalizedSearchResult[]> {
    this.emitEvent("source_processed", {
      aggregationId,
      processedCount: rawResults.length,
    });

    return await this.normalizer.normalize(rawResults);
  }

  /**
   * 合併多源結果
   */
  private async mergeResults(
    normalizedResults: NormalizedSearchResult[],
    aggregationId: string
  ): Promise<NormalizedSearchResult[]> {
    const mergedResults = await this.merger.merge(normalizedResults);

    this.emitEvent("results_normalized", {
      aggregationId,
      originalCount: normalizedResults.length,
      mergedCount: mergedResults.length,
    });

    return mergedResults;
  }

  /**
   * 質量過濾
   */
  private async filterQuality(
    results: NormalizedSearchResult[],
    aggregationId: string
  ): Promise<NormalizedSearchResult[]> {
    const filteredResults = await this.qualityFilter.filter(results);

    this.emitEvent("quality_assessed", {
      aggregationId,
      originalCount: results.length,
      filteredCount: filteredResults.length,
    });

    return filteredResults;
  }

  /**
   * 個性化處理
   */
  private async personalizeResults(
    results: NormalizedSearchResult[],
    context: RankingContext,
    aggregationId: string
  ): Promise<NormalizedSearchResult[]> {
    const personalizedResults = await this.personalizationEngine.personalize(results, context);

    this.emitEvent("personalization_applied", {
      aggregationId,
      resultCount: personalizedResults.length,
    });

    return personalizedResults;
  }

  /**
   * 智能排序
   */
  private async rankResults(
    results: NormalizedSearchResult[],
    context: RankingContext,
    aggregationId: string
  ): Promise<NormalizedSearchResult[]> {
    const rankedResults = await this.ranker.rank(results, context);

    this.emitEvent("ranking_completed", {
      aggregationId,
      resultCount: rankedResults.length,
    });

    return rankedResults;
  }

  /**
   * 驗證請求
   */
  private validateRequest(request: AggregationRequest): void {
    if (!request.query?.trim()) {
      throw new SearchAggregationError("查詢不能為空", "INVALID_QUERY");
    }

    if (!request.sources || request.sources.length === 0) {
      throw new SearchAggregationError("必須指定至少一個搜索源", "NO_SOURCES");
    }

    if (request.sources.some((s) => !s.enabled)) {
      console.warn("包含未啟用的搜索源");
    }
  }

  /**
   * 預處理搜索源
   */
  private preprocessSources(sources: SearchSource[]): SearchSource[] {
    return sources.filter((source) => source.enabled).sort((a, b) => b.weight - a.weight);
  }

  /**
   * 生成聚合 ID
   */
  private generateAggregationId(request: AggregationRequest): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(JSON.stringify(request));
    return `agg-${timestamp}-${hash}`;
  }

  /**
   * 生成緩存鍵
   */
  private generateCacheKey(request: AggregationRequest): string {
    const key = {
      query: request.query,
      sources: request.sources.map((s) => ({ id: s.id, weight: s.weight })),
      options: request.options,
    };
    return this.simpleHash(JSON.stringify(key));
  }

  /**
   * 簡單哈希函數
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 緩存結果
   */
  private cacheResult(key: string, result: AggregationResult): void {
    if (this.cache.size >= this.config.core.caching.maxSize) {
      // 簡單的 LRU 清理策略
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
  }

  /**
   * 生成指標
   */
  private generateMetrics(
    rawResults: RawSearchResult[],
    finalResults: NormalizedSearchResult[],
    processingTime: number
  ): AggregationMetrics {
    const sourceContributions: Record<string, number> = {};
    rawResults.forEach((result) => {
      sourceContributions[result.source.id] = (sourceContributions[result.source.id] || 0) + 1;
    });

    const qualityDistribution = {
      high: finalResults.filter((r) => r.qualityScore >= 0.8).length,
      medium: finalResults.filter((r) => r.qualityScore >= 0.5 && r.qualityScore < 0.8).length,
      low: finalResults.filter((r) => r.qualityScore < 0.5).length,
      spam: 0, // 會由質量過濾器設置
    };

    return {
      processingTime,
      sourceContributions,
      qualityDistribution,
      userSatisfaction: 0.8, // 預設值，實際應用中會根據用戶反饋計算
      errorRate: 0, // 在錯誤處理中更新
      throughput: finalResults.length / (processingTime / 1000), // 結果數/秒
    };
  }

  /**
   * 生成元數據
   */
  private generateMetadata(
    rawResults: RawSearchResult[],
    finalResults: NormalizedSearchResult[],
    sources: SearchSource[],
    processingTime: number
  ) {
    const qualityStats = {
      high: finalResults.filter((r) => r.qualityScore >= 0.8).length,
      medium: finalResults.filter((r) => r.qualityScore >= 0.5 && r.qualityScore < 0.8).length,
      low: finalResults.filter((r) => r.qualityScore < 0.5).length,
      filtered: rawResults.length - finalResults.length,
    };

    return {
      totalProcessed: rawResults.length,
      sourcesUsed: sources.map((s) => s.id),
      processingTime,
      qualityStats,
    };
  }

  /**
   * 發出事件
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event: SearchAggregationEvent = {
      type: type as any,
      timestamp: Date.now(),
      data,
    };

    const listeners = this.eventListeners.get(type) || [];
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`事件監聽器錯誤 (${type}):`, error);
      }
    });
  }

  /**
   * 添加事件監聽器
   */
  addEventListener(type: string, listener: (event: SearchAggregationEvent) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(listener);
  }

  /**
   * 移除事件監聽器
   */
  removeEventListener(type: string, listener: (event: SearchAggregationEvent) => void): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 獲取聚合統計
   */
  getAggregationStats() {
    return this.monitor.getStats();
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    this.cache.clear();
    this.eventListeners.clear();
    await this.monitor.cleanup();
  }
}
