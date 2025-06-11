/**
 * 並行化向量搜索引擎 - 主協調器
 */

import { EventEmitter } from "events";
import {
  VectorSearchRequest,
  VectorSearchResult,
  VectorSearchEngineConfig,
  VectorPerformanceMetrics,
  VectorErrorCode,
  VectorSearchAnalytics,
} from "./types";
import { VectorSearchError } from "./errors";
import { ParallelVectorCalculator } from "./parallel/ParallelVectorCalculator";
import { VectorShardManager } from "./distributed/VectorShardManager";
import { DistributedVectorRetriever } from "./distributed/DistributedVectorRetriever";
import { VectorLoadBalancer } from "./distributed/VectorLoadBalancer";
import { VectorCacheManager } from "./cache/VectorCacheManager";
import { EmbeddingCacheStore } from "./cache/EmbeddingCacheStore";
import { SemanticSimilarityEnhancer } from "./semantic/SemanticSimilarityEnhancer";
import { ContextualVectorSearch } from "./semantic/ContextualVectorSearch";
import { VectorPerformanceMonitor } from "./monitoring/VectorPerformanceMonitor";
import { VectorMetricsCollector } from "./monitoring/VectorMetricsCollector";
import EmbeddingManager from "@/LLMProviders/embeddingManager";
import VectorStoreManager from "@/search/vectorStoreManager";
import { Document } from "@langchain/core/documents";

export class VectorSearchEngine extends EventEmitter {
  private config: VectorSearchEngineConfig;
  private parallelCalculator: ParallelVectorCalculator;
  private shardManager: VectorShardManager;
  private distributedRetriever: DistributedVectorRetriever;
  private loadBalancer: VectorLoadBalancer;
  private cacheManager: VectorCacheManager;
  private embeddingCache: EmbeddingCacheStore;
  private semanticEnhancer: SemanticSimilarityEnhancer;
  private contextualSearch: ContextualVectorSearch;
  private performanceMonitor: VectorPerformanceMonitor;
  private metricsCollector: VectorMetricsCollector;
  private embeddingManager: EmbeddingManager;
  private vectorStoreManager: VectorStoreManager;
  private isInitialized: boolean = false;
  private shutdownSignal: boolean = false;

  constructor(config: VectorSearchEngineConfig) {
    super();
    this.config = config;
    this.embeddingManager = EmbeddingManager.getInstance();
    this.vectorStoreManager = VectorStoreManager.getInstance();
    this.initializeComponents();
  }

  /**
   * 初始化所有組件
   */
  private initializeComponents(): void {
    try {
      // 初始化並行計算器
      this.parallelCalculator = new ParallelVectorCalculator(this.config.parallel);

      // 初始化分散式組件
      this.shardManager = new VectorShardManager(this.config.distributed);
      this.loadBalancer = new VectorLoadBalancer(this.config.distributed.loadBalancing);
      this.distributedRetriever = new DistributedVectorRetriever(
        this.shardManager,
        this.loadBalancer,
        this.config.distributed
      );

      // 初始化緩存組件
      this.cacheManager = new VectorCacheManager(this.config.cache);
      this.embeddingCache = new EmbeddingCacheStore(this.config.cache);

      // 初始化語義增強組件
      this.semanticEnhancer = new SemanticSimilarityEnhancer(this.config.semantic.enhancement);
      this.contextualSearch = new ContextualVectorSearch(this.config.semantic);

      // 初始化監控組件
      this.performanceMonitor = new VectorPerformanceMonitor(this.config.monitoring);
      this.metricsCollector = new VectorMetricsCollector(this.config.monitoring);

      // 設置事件監聽
      this.setupEventListeners();

      this.emit("initialized");
    } catch (error) {
      this.emit(
        "error",
        new VectorSearchError(
          "Engine initialization failed",
          VectorErrorCode.PARALLEL_EXECUTION_FAILED,
          "VectorSearchEngine",
          true,
          { error }
        )
      );
      throw error;
    }
  }

  /**
   * 引擎初始化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.emit("initialization_started");

      // 並行初始化所有組件
      await Promise.all([
        this.parallelCalculator.initialize(),
        this.shardManager.initialize(),
        this.distributedRetriever.initialize(),
        this.cacheManager.initialize(),
        this.embeddingCache.initialize(),
        this.semanticEnhancer.initialize(),
        this.contextualSearch.initialize(),
        this.performanceMonitor.initialize(),
        this.metricsCollector.initialize(),
      ]);

      // 啟動健康檢查
      await this.startHealthChecks();

      this.isInitialized = true;
      this.emit("initialization_completed");
    } catch (error) {
      this.emit(
        "error",
        new VectorSearchError(
          "Engine initialization failed",
          VectorErrorCode.PARALLEL_EXECUTION_FAILED,
          "VectorSearchEngine",
          true,
          { error }
        )
      );
      throw error;
    }
  }

  /**
   * 執行向量搜索
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw new VectorSearchError(
        "Engine not initialized",
        VectorErrorCode.PARALLEL_EXECUTION_FAILED,
        "VectorSearchEngine",
        false
      );
    }

    const searchStartTime = Date.now();
    const searchId = this.generateSearchId();

    try {
      this.emit("search_started", { searchId, request, timestamp: searchStartTime });

      // 階段 1: 查詢預處理和緩存檢查
      const preprocessedRequest = await this.preprocessRequest(request, searchId);

      // 檢查緩存
      if (preprocessedRequest.options?.enableCaching !== false) {
        const cachedResults = await this.checkCache(preprocessedRequest, searchId);
        if (cachedResults) {
          this.emit("search_completed", {
            searchId,
            results: cachedResults,
            fromCache: true,
            timestamp: Date.now(),
          });
          return cachedResults;
        }
      }

      // 階段 2: 查詢向量生成
      const queryVector = await this.generateQueryVector(preprocessedRequest, searchId);

      // 階段 3: 選擇搜索策略
      const searchStrategy = this.selectSearchStrategy(preprocessedRequest);

      // 階段 4: 執行搜索
      let results: VectorSearchResult[];

      if (
        searchStrategy === "distributed" &&
        preprocessedRequest.options?.enableDistributed !== false
      ) {
        results = await this.executeDistributedSearch(queryVector, preprocessedRequest, searchId);
      } else if (
        searchStrategy === "parallel" &&
        preprocessedRequest.options?.enableParallel !== false
      ) {
        results = await this.executeParallelSearch(queryVector, preprocessedRequest, searchId);
      } else {
        results = await this.executeDirectSearch(queryVector, preprocessedRequest, searchId);
      }

      // 階段 5: 語義增強
      if (preprocessedRequest.options?.enableSemanticEnhancement !== false) {
        results = await this.enhanceResults(results, preprocessedRequest, searchId);
      }

      // 階段 6: 結果後處理
      results = await this.postProcessResults(results, preprocessedRequest, searchId);

      // 階段 7: 緩存結果
      if (preprocessedRequest.options?.enableCaching !== false) {
        await this.cacheResults(preprocessedRequest, results, searchId);
      }

      // 階段 8: 記錄指標
      await this.recordMetrics(searchId, searchStartTime, results, "success");

      this.emit("search_completed", {
        searchId,
        results,
        fromCache: false,
        timestamp: Date.now(),
      });

      return results;
    } catch (error) {
      await this.recordMetrics(searchId, searchStartTime, [], "error");

      const vectorError = new VectorSearchError(
        `Search failed: ${error.message}`,
        VectorErrorCode.PARALLEL_EXECUTION_FAILED,
        "VectorSearchEngine",
        true,
        request
      );

      this.emit("search_failed", { searchId, error: vectorError, timestamp: Date.now() });
      throw vectorError;
    }
  }

  /**
   * 預處理搜索請求
   */
  private async preprocessRequest(
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchRequest> {
    // 驗證請求
    this.validateRequest(request);

    // 應用默認值
    const preprocessed = {
      ...request,
      options: {
        enableParallel: true,
        enableCaching: true,
        enableSemanticEnhancement: true,
        enableDistributed: true,
        timeout: 30000,
        ...request.options,
      },
      filters: {
        maxResults: 50,
        minSimilarityScore: 0.1,
        ...request.filters,
      },
    };

    this.emit("request_preprocessed", { searchId, request: preprocessed });
    return preprocessed;
  }

  /**
   * 檢查緩存
   */
  private async checkCache(
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchResult[] | null> {
    try {
      const cachedResults = await this.cacheManager.get(request);
      if (cachedResults) {
        this.emit("cache_hit", { searchId, resultCount: cachedResults.length });
        return cachedResults;
      }

      this.emit("cache_miss", { searchId });
      return null;
    } catch (error) {
      console.warn("Cache check failed:", error);
      this.emit("cache_error", { searchId, error });
      return null;
    }
  }

  /**
   * 生成查詢向量
   */
  private async generateQueryVector(
    request: VectorSearchRequest,
    searchId: string
  ): Promise<number[]> {
    if (Array.isArray(request.query)) {
      return request.query;
    }

    try {
      // 檢查嵌入緩存
      const cachedEmbedding = await this.embeddingCache.get(request.query);
      if (cachedEmbedding) {
        this.emit("embedding_cache_hit", { searchId, query: request.query });
        return cachedEmbedding;
      }

      // 生成新的嵌入
      const embeddingsAPI = await this.embeddingManager.getEmbeddingsAPI();
      const vector = await embeddingsAPI.embedQuery(request.query);

      if (vector.length === 0) {
        throw new Error("Query embedding returned an empty vector");
      }

      // 緩存嵌入
      await this.embeddingCache.set(request.query, vector);

      this.emit("embedding_generated", { searchId, vectorLength: vector.length });
      return vector;
    } catch (error) {
      throw new VectorSearchError(
        `Failed to generate query vector: ${error.message}`,
        VectorErrorCode.EMBEDDING_GENERATION_FAILED,
        "VectorSearchEngine",
        true,
        request
      );
    }
  }

  /**
   * 選擇搜索策略
   */
  private selectSearchStrategy(
    request: VectorSearchRequest
  ): "distributed" | "parallel" | "direct" {
    const maxResults = request.filters?.maxResults || 50;
    const hasShardPreference = (request.options?.preferredShards?.length ?? 0) > 0;
    const enableDistributed = request.options?.enableDistributed !== false;
    const enableParallel = request.options?.enableParallel !== false;

    if (enableDistributed && (maxResults > 100 || hasShardPreference)) {
      return "distributed";
    } else if (enableParallel && maxResults > 20) {
      return "parallel";
    } else {
      return "direct";
    }
  }

  /**
   * 執行分散式搜索
   */
  private async executeDistributedSearch(
    queryVector: number[],
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchResult[]> {
    this.emit("distributed_search_started", { searchId });

    const results = await this.distributedRetriever.search({
      queryVector,
      filters: request.filters!,
      options: request.options!,
      context: request.context,
    });

    this.emit("distributed_search_completed", {
      searchId,
      resultCount: results.length,
    });

    return results;
  }

  /**
   * 執行並行搜索
   */
  private async executeParallelSearch(
    queryVector: number[],
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchResult[]> {
    this.emit("parallel_search_started", { searchId });

    const results = await this.parallelCalculator.calculateSimilarities({
      queryVector,
      filters: request.filters!,
      options: request.options!,
    });

    this.emit("parallel_search_completed", {
      searchId,
      resultCount: results.length,
    });

    return results;
  }

  /**
   * 執行直接搜索
   */
  private async executeDirectSearch(
    queryVector: number[],
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchResult[]> {
    this.emit("direct_search_started", { searchId });

    // 使用現有的向量存儲管理器
    const db = await this.vectorStoreManager.getDb();
    const searchParams = {
      mode: "vector" as const,
      vector: {
        value: queryVector,
        property: "embedding",
      },
      similarity: request.filters?.minSimilarityScore || 0.1,
      limit: request.filters?.maxResults || 50,
      includeVectors: false,
    };

    const searchResults = await this.executeOramaSearch(db, searchParams);
    const results = this.convertOramaResults(searchResults, searchId);

    this.emit("direct_search_completed", {
      searchId,
      resultCount: results.length,
    });

    return results;
  }

  /**
   * 執行 Orama 搜索（私有方法）
   */
  private async executeOramaSearch(db: any, params: any): Promise<any> {
    const { search } = await import("@orama/orama");
    return search(db, params);
  }

  /**
   * 轉換 Orama 結果
   */
  private convertOramaResults(searchResults: any, searchId: string): VectorSearchResult[] {
    if (!searchResults || !searchResults.hits) {
      return [];
    }

    return searchResults.hits
      .map((hit: any) => {
        if (!hit || !hit.document) {
          return null;
        }

        const document = new Document({
          pageContent: hit.document.content || "",
          metadata: {
            ...(hit.document.metadata || {}),
            score: hit.score || 0,
            path: hit.document.path || "",
            title: hit.document.title || "",
          },
        });

        return {
          document,
          score: hit.score || 0,
          metadata: {
            searchTime: Date.now(),
            processingTime: 0,
            calculationMethod: "direct" as const,
            embeddingModel: hit.document.embeddingModel,
          },
        } as VectorSearchResult;
      })
      .filter((result: VectorSearchResult | null): result is VectorSearchResult => result !== null);
  }

  /**
   * 語義增強結果
   */
  private async enhanceResults(
    results: VectorSearchResult[],
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchResult[]> {
    try {
      this.emit("semantic_enhancement_started", { searchId });

      const enhancedResults = await this.semanticEnhancer.enhanceResults(
        results,
        request,
        request.context
      );

      this.emit("semantic_enhancement_completed", {
        searchId,
        enhancedCount: enhancedResults.length,
      });

      return enhancedResults;
    } catch (error) {
      console.warn("Semantic enhancement failed:", error);
      this.emit("semantic_enhancement_failed", { searchId, error });
      return results; // 返回原始結果
    }
  }

  /**
   * 後處理結果
   */
  private async postProcessResults(
    results: VectorSearchResult[],
    request: VectorSearchRequest,
    searchId: string
  ): Promise<VectorSearchResult[]> {
    // 按分數排序
    results.sort((a, b) => (b.normalizedScore || b.score) - (a.normalizedScore || a.score));

    // 限制結果數量
    const maxResults = request.filters?.maxResults || 50;
    const limitedResults = results.slice(0, maxResults);

    this.emit("results_post_processed", {
      searchId,
      originalCount: results.length,
      finalCount: limitedResults.length,
    });

    return limitedResults;
  }

  /**
   * 緩存結果
   */
  private async cacheResults(
    request: VectorSearchRequest,
    results: VectorSearchResult[],
    searchId: string
  ): Promise<void> {
    try {
      await this.cacheManager.set(request, results);
      this.emit("results_cached", { searchId, resultCount: results.length });
    } catch (error) {
      console.warn("Failed to cache results:", error);
      this.emit("cache_error", { searchId, error });
    }
  }

  /**
   * 記錄指標
   */
  private async recordMetrics(
    searchId: string,
    startTime: number,
    results: VectorSearchResult[],
    status: "success" | "error"
  ): Promise<void> {
    const executionTime = Date.now() - startTime;

    await this.metricsCollector.recordSearch({
      searchId,
      executionTime,
      resultCount: results.length,
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * 驗證請求
   */
  private validateRequest(request: VectorSearchRequest): void {
    if (!request.query) {
      throw new VectorSearchError(
        "Query is required",
        VectorErrorCode.PARALLEL_EXECUTION_FAILED,
        "VectorSearchEngine",
        false
      );
    }

    if (Array.isArray(request.query) && request.query.length === 0) {
      throw new VectorSearchError(
        "Query vector cannot be empty",
        VectorErrorCode.DIMENSION_MISMATCH,
        "VectorSearchEngine",
        false
      );
    }
  }

  /**
   * 設置事件監聽器
   */
  private setupEventListeners(): void {
    // 監聽組件事件並轉發
    const components = [
      this.parallelCalculator,
      this.distributedRetriever,
      this.cacheManager,
      this.semanticEnhancer,
      this.performanceMonitor,
    ];

    components.forEach((component) => {
      if (component && typeof component.on === "function") {
        component.on("error", (error: Error) => {
          this.emit("component_error", { component: component.constructor.name, error });
        });
      }
    });
  }

  /**
   * 啟動健康檢查
   */
  private async startHealthChecks(): Promise<void> {
    const healthCheckInterval = this.config.distributed.healthCheckInterval || 30000;

    setInterval(async () => {
      if (this.shutdownSignal) return;

      try {
        await this.performanceMonitor.performHealthCheck();
        this.emit("health_check_completed");
      } catch (error) {
        this.emit("health_check_failed", { error });
      }
    }, healthCheckInterval);
  }

  /**
   * 生成搜索 ID
   */
  private generateSearchId(): string {
    return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 獲取性能指標
   */
  async getPerformanceMetrics(): Promise<VectorPerformanceMetrics> {
    return this.performanceMonitor.getMetrics();
  }

  /**
   * 獲取搜索分析
   */
  async getAnalytics(): Promise<VectorSearchAnalytics> {
    return this.metricsCollector.getAnalytics();
  }

  /**
   * 關閉引擎
   */
  async shutdown(): Promise<void> {
    this.shutdownSignal = true;
    this.emit("shutdown_started");

    try {
      await Promise.all([
        this.parallelCalculator.shutdown(),
        this.distributedRetriever.shutdown(),
        this.cacheManager.shutdown(),
        this.performanceMonitor.shutdown(),
        this.metricsCollector.shutdown(),
      ]);

      this.emit("shutdown_completed");
    } catch (error) {
      this.emit("shutdown_error", { error });
      throw error;
    }
  }
}
