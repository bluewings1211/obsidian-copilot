/**
 * 分散式向量檢索器
 */

import { EventEmitter } from "events";
import { Document } from "@langchain/core/documents";
import {
  VectorSearchResult,
  VectorSearchFilters,
  VectorSearchOptions,
  VectorSearchContext,
  VectorShardQuery,
  VectorShardResult,
  DistributedConfig,
} from "../types";
import { VectorShardManager } from "./VectorShardManager";
import { VectorLoadBalancer } from "./VectorLoadBalancer";

interface DistributedSearchParams {
  queryVector: number[];
  filters: VectorSearchFilters;
  options: VectorSearchOptions;
  context?: VectorSearchContext;
}

export class DistributedVectorRetriever extends EventEmitter {
  private config: DistributedConfig;
  private shardManager: VectorShardManager;
  private loadBalancer: VectorLoadBalancer;
  private isInitialized: boolean = false;

  constructor(
    shardManager: VectorShardManager,
    loadBalancer: VectorLoadBalancer,
    config: DistributedConfig
  ) {
    super();
    this.shardManager = shardManager;
    this.loadBalancer = loadBalancer;
    this.config = config;
  }

  /**
   * 初始化分散式檢索器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 確保依賴組件已初始化
      if (!this.shardManager) {
        throw new Error("ShardManager is required");
      }
      if (!this.loadBalancer) {
        throw new Error("LoadBalancer is required");
      }

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 執行分散式向量搜索
   */
  async search(params: DistributedSearchParams): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error("DistributedVectorRetriever not initialized");
    }

    const searchStartTime = Date.now();
    const searchId = this.generateSearchId();

    try {
      this.emit("distributed_search_started", {
        searchId,
        vectorLength: params.queryVector.length,
      });

      // 1. 選擇要查詢的分片
      const selectedShards = this.selectShards(params);

      if (selectedShards.length === 0) {
        this.emit("no_shards_available", { searchId });
        return [];
      }

      // 2. 創建分片查詢
      const shardQueries = this.createShardQueries(selectedShards, params);

      // 3. 並行執行分片查詢
      const shardResults = await this.executeShardQueries(shardQueries, searchId);

      // 4. 合併和排序結果
      const mergedResults = this.mergeShardResults(shardResults, params);

      // 5. 應用最終過濾和限制
      const finalResults = this.applyFinalFilters(mergedResults, params);

      this.emit("distributed_search_completed", {
        searchId,
        shardsQueried: selectedShards.length,
        totalResults: finalResults.length,
        executionTime: Date.now() - searchStartTime,
      });

      return finalResults;
    } catch (error) {
      this.emit("distributed_search_failed", { searchId, error });
      throw error;
    }
  }

  /**
   * 選擇要查詢的分片
   */
  private selectShards(params: DistributedSearchParams) {
    const maxShards = Math.min(
      this.config.maxShardsPerQuery,
      params.options.preferredShards?.length || this.config.maxShardsPerQuery
    );

    // 使用負載均衡器選擇分片
    return this.loadBalancer.selectShards(
      maxShards,
      params.options.preferredShards,
      params.filters
    );
  }

  /**
   * 創建分片查詢
   */
  private createShardQueries(shards: any[], params: DistributedSearchParams): VectorShardQuery[] {
    const resultsPerShard = Math.ceil((params.filters.maxResults || 50) / shards.length);

    return shards.map((shard) => ({
      shardId: shard.id,
      queryVector: params.queryVector,
      filters: {
        ...params.filters,
        maxResults: resultsPerShard * 2, // 獲取更多結果以便後續排序
        shardIds: [shard.id],
      },
      maxResults: resultsPerShard * 2,
    }));
  }

  /**
   * 並行執行分片查詢
   */
  private async executeShardQueries(
    queries: VectorShardQuery[],
    searchId: string
  ): Promise<VectorShardResult[]> {
    const startTime = Date.now();

    try {
      // 並行執行所有分片查詢
      const queryPromises = queries.map((query) => this.executeShardQuery(query, searchId));

      const results = await Promise.allSettled(queryPromises);

      // 處理結果，過濾失敗的查詢
      const successfulResults: VectorShardResult[] = [];
      const failedQueries: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successfulResults.push(result.value);
        } else {
          failedQueries.push(queries[index].shardId);
          this.emit("shard_query_failed", {
            searchId,
            shardId: queries[index].shardId,
            error: result.reason,
          });
        }
      });

      this.emit("shard_queries_completed", {
        searchId,
        totalQueries: queries.length,
        successfulQueries: successfulResults.length,
        failedQueries: failedQueries.length,
        executionTime: Date.now() - startTime,
      });

      return successfulResults;
    } catch (error) {
      this.emit("shard_queries_error", { searchId, error });
      throw error;
    }
  }

  /**
   * 執行單個分片查詢
   */
  private async executeShardQuery(
    query: VectorShardQuery,
    searchId: string
  ): Promise<VectorShardResult> {
    const startTime = Date.now();

    try {
      // 獲取分片文檔
      const shardDocuments = this.shardManager.getShardDocuments(query.shardId);

      if (shardDocuments.length === 0) {
        return {
          shardId: query.shardId,
          results: [],
          executionTime: Date.now() - startTime,
          documentsCovered: 0,
          loadFactor: 0,
        };
      }

      // 計算相似度
      const similarities = this.calculateSimilarities(
        query.queryVector,
        shardDocuments,
        query.filters
      );

      // 轉換為搜索結果
      const results = this.convertToSearchResults(similarities, query.shardId);

      // 獲取分片負載信息
      const shard = this.shardManager.getShard(query.shardId);
      const loadFactor = shard?.loadFactor || 0;

      return {
        shardId: query.shardId,
        results,
        executionTime: Date.now() - startTime,
        documentsCovered: shardDocuments.length,
        loadFactor,
      };
    } catch (error) {
      this.emit("shard_query_error", {
        searchId,
        shardId: query.shardId,
        error,
      });
      throw error;
    }
  }

  /**
   * 計算向量相似度
   */
  private calculateSimilarities(
    queryVector: number[],
    documents: any[],
    filters: VectorSearchFilters
  ): Array<{ document: any; similarity: number }> {
    const minSimilarity = filters.minSimilarityScore || 0.1;
    const similarities: Array<{ document: any; similarity: number }> = [];

    for (const doc of documents) {
      if (!doc.vector || doc.vector.length !== queryVector.length) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryVector, doc.vector);

      if (similarity >= minSimilarity) {
        similarities.push({ document: doc, similarity });
      }
    }

    // 按相似度排序
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, filters.maxResults || 50);
  }

  /**
   * 余弦相似度計算
   */
  private cosineSimilarity(vector1: number[], vector2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 轉換為搜索結果
   */
  private convertToSearchResults(
    similarities: Array<{ document: any; similarity: number }>,
    shardId: string
  ): VectorSearchResult[] {
    return similarities.map(({ document, similarity }) => ({
      document: new Document({
        pageContent: document.content || "",
        metadata: {
          ...(document.metadata || {}),
          path: document.metadata?.path || "",
          title: document.metadata?.title || "",
          id: document.id,
        },
      }),
      score: similarity,
      shardId,
      metadata: {
        searchTime: Date.now(),
        processingTime: 0,
        calculationMethod: "distributed" as const,
        shardMetadata: { shardId },
      },
    }));
  }

  /**
   * 合併分片結果
   */
  private mergeShardResults(
    shardResults: VectorShardResult[],
    params: DistributedSearchParams
  ): VectorSearchResult[] {
    const allResults: VectorSearchResult[] = [];

    // 合併所有分片的結果
    for (const shardResult of shardResults) {
      allResults.push(...shardResult.results);
    }

    // 按分數排序
    allResults.sort((a, b) => b.score - a.score);

    return allResults;
  }

  /**
   * 應用最終過濾
   */
  private applyFinalFilters(
    results: VectorSearchResult[],
    params: DistributedSearchParams
  ): VectorSearchResult[] {
    let filteredResults = results;

    // 應用最小相似度過濾
    const minSimilarity = params.filters.minSimilarityScore || 0.1;
    filteredResults = filteredResults.filter((result) => result.score >= minSimilarity);

    // 去重（基於文檔 ID）
    const seenIds = new Set<string>();
    filteredResults = filteredResults.filter((result) => {
      const docId = result.document.metadata.id || result.document.metadata.path;
      if (seenIds.has(docId)) {
        return false;
      }
      seenIds.add(docId);
      return true;
    });

    // 限制結果數量
    const maxResults = params.filters.maxResults || 50;
    filteredResults = filteredResults.slice(0, maxResults);

    return filteredResults;
  }

  /**
   * 檢查分片健康狀態
   */
  async checkShardHealth(shardId: string): Promise<boolean> {
    try {
      const health = this.shardManager.getShardHealth(shardId);
      return health.isHealthy;
    } catch (error) {
      this.emit("shard_health_check_failed", { shardId, error });
      return false;
    }
  }

  /**
   * 獲取分散式檢索統計
   */
  getDistributedStatistics(): {
    totalShards: number;
    activeShards: number;
    averageResponseTime: number;
    failureRate: number;
    loadDistribution: Record<string, number>;
  } {
    const shardStats = this.shardManager.getShardStatistics();

    return {
      totalShards: shardStats.totalShards,
      activeShards: shardStats.activeShards,
      averageResponseTime: 0, // TODO: 實現響應時間統計
      failureRate: 0, // TODO: 實現失敗率統計
      loadDistribution: shardStats.shardDetails.reduce(
        (acc, shard) => {
          acc[shard.id] = shard.loadFactor;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }

  /**
   * 重新平衡分片負載
   */
  async rebalanceLoad(): Promise<void> {
    try {
      this.emit("load_rebalancing_started");
      await this.shardManager.rebalanceShards();
      this.emit("load_rebalancing_completed");
    } catch (error) {
      this.emit("load_rebalancing_failed", { error });
      throw error;
    }
  }

  /**
   * 生成搜索 ID
   */
  private generateSearchId(): string {
    return `dist_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 關閉分散式檢索器
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.emit("shutdown");
  }
}
