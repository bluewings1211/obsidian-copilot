/**
 * 並行向量相似度計算器
 */

import { EventEmitter } from "events";
import {
  VectorCalculationTask,
  VectorCalculationResult,
  VectorSearchResult,
  VectorSearchFilters,
  VectorSearchOptions,
  VectorSimilarity,
  VectorSimilarityMethod,
  ParallelConfig,
  VectorDocument,
} from "../types";
import VectorStoreManager from "@/search/vectorStoreManager";
import { Document } from "@langchain/core/documents";

export class ParallelVectorCalculator extends EventEmitter {
  private config: ParallelConfig;
  private vectorStoreManager: VectorStoreManager;
  private workerPool: Worker[] = [];
  private activeCalculations: Map<string, VectorCalculationTask> = new Map();
  private isInitialized: boolean = false;

  constructor(config: ParallelConfig) {
    super();
    this.config = config;
    this.vectorStoreManager = VectorStoreManager.getInstance();
  }

  /**
   * 初始化並行計算器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化工作池 (在瀏覽器環境中使用 setTimeout 模擬)
      this.initializeWorkerPool();
      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 並行計算向量相似度
   */
  async calculateSimilarities(params: {
    queryVector: number[];
    filters: VectorSearchFilters;
    options: VectorSearchOptions;
  }): Promise<VectorSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error("ParallelVectorCalculator not initialized");
    }

    const startTime = Date.now();
    const taskId = this.generateTaskId();

    try {
      this.emit("calculation_started", { taskId, vectorLength: params.queryVector.length });

      // 獲取文檔向量
      const documents = await this.getDocumentVectors(params.filters);

      if (documents.length === 0) {
        return [];
      }

      // 分割任務
      const chunks = this.chunkDocuments(documents, this.config.chunkSize);

      // 並行計算相似度
      const calculationTasks = chunks.map((chunk, index) =>
        this.createCalculationTask(
          taskId + "_" + index,
          params.queryVector,
          chunk,
          this.config.preferredSimilarityMethod
        )
      );

      // 執行並行計算
      const results = await this.executeParallelCalculations(calculationTasks);

      // 聚合結果
      const aggregatedResults = this.aggregateResults(results);

      // 轉換為搜索結果
      const searchResults = await this.convertToSearchResults(
        aggregatedResults,
        params.filters,
        startTime
      );

      this.emit("calculation_completed", {
        taskId,
        resultCount: searchResults.length,
        executionTime: Date.now() - startTime,
      });

      return searchResults;
    } catch (error) {
      this.emit("calculation_failed", { taskId, error });
      throw error;
    } finally {
      this.activeCalculations.delete(taskId);
    }
  }

  /**
   * 獲取文檔向量
   */
  private async getDocumentVectors(filters: VectorSearchFilters): Promise<VectorDocument[]> {
    try {
      const db = await this.vectorStoreManager.getDb();

      // 構建查詢參數
      const searchParams: any = {
        limit: 10000, // 獲取大量文檔用於並行計算
        includeVectors: true,
      };

      // 添加過濾條件
      if (filters.timeRange) {
        searchParams.where = {
          mtime: {
            between: [filters.timeRange.startTime, filters.timeRange.endTime],
          },
        };
      }

      if (filters.metadata) {
        searchParams.where = {
          ...searchParams.where,
          ...filters.metadata,
        };
      }

      const { search } = await import("@orama/orama");
      const results = await search(db, searchParams);

      if (!results || !results.hits) {
        return [];
      }

      return results.hits
        .map((hit: any) => {
          if (!hit.document || !hit.document.embedding) {
            return null;
          }

          return {
            id: hit.document.id || hit.document.path,
            vector: hit.document.embedding,
            metadata: hit.document,
            content: hit.document.content,
            shardId: "default",
          } as VectorDocument;
        })
        .filter((doc: VectorDocument | null): doc is VectorDocument => doc !== null);
    } catch (error) {
      console.error("Failed to get document vectors:", error);
      throw error;
    }
  }

  /**
   * 分割文檔為計算塊
   */
  private chunkDocuments(documents: VectorDocument[], chunkSize: number): VectorDocument[][] {
    const chunks: VectorDocument[][] = [];

    for (let i = 0; i < documents.length; i += chunkSize) {
      chunks.push(documents.slice(i, i + chunkSize));
    }

    return chunks;
  }

  /**
   * 創建計算任務
   */
  private createCalculationTask(
    taskId: string,
    queryVector: number[],
    documents: VectorDocument[],
    method: VectorSimilarityMethod
  ): VectorCalculationTask {
    const task: VectorCalculationTask = {
      id: taskId,
      queryVector,
      documentVectors: documents,
      method,
      priority: 1,
    };

    this.activeCalculations.set(taskId, task);
    return task;
  }

  /**
   * 執行並行計算
   */
  private async executeParallelCalculations(
    tasks: VectorCalculationTask[]
  ): Promise<VectorCalculationResult[]> {
    const maxConcurrent = this.config.maxConcurrentCalculations;
    const results: VectorCalculationResult[] = [];

    // 分批執行任務
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map((task) => this.executeCalculationTask(task))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 執行單個計算任務
   */
  private async executeCalculationTask(
    task: VectorCalculationTask
  ): Promise<VectorCalculationResult> {
    const startTime = Date.now();

    try {
      const similarities = task.documentVectors.map((doc) => {
        const similarity = this.calculateSimilarity(task.queryVector, doc.vector, task.method);

        return {
          documentId: doc.id,
          similarity,
          confidence: this.calculateConfidence(similarity, task.method),
          metadata: { shardId: doc.shardId },
        } as VectorSimilarity;
      });

      return {
        taskId: task.id,
        similarities,
        executionTime: Date.now() - startTime,
        method: task.method,
        shardId: task.shardId,
      };
    } catch (error) {
      console.error("Calculation task failed:", error);
      throw error;
    }
  }

  /**
   * 計算向量相似度
   */
  private calculateSimilarity(
    vector1: number[],
    vector2: number[],
    method: VectorSimilarityMethod
  ): number {
    if (vector1.length !== vector2.length) {
      throw new Error("Vector dimensions do not match");
    }

    switch (method) {
      case VectorSimilarityMethod.COSINE:
        return this.cosineSimilarity(vector1, vector2);
      case VectorSimilarityMethod.EUCLIDEAN:
        return this.euclideanDistance(vector1, vector2);
      case VectorSimilarityMethod.DOT_PRODUCT:
        return this.dotProduct(vector1, vector2);
      case VectorSimilarityMethod.MANHATTAN:
        return this.manhattanDistance(vector1, vector2);
      default:
        return this.cosineSimilarity(vector1, vector2);
    }
  }

  /**
   * 余弦相似度
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
   * 歐幾里德距離
   */
  private euclideanDistance(vector1: number[], vector2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector1.length; i++) {
      const diff = vector1[i] - vector2[i];
      sum += diff * diff;
    }
    return 1 / (1 + Math.sqrt(sum)); // 轉換為相似度
  }

  /**
   * 點積
   */
  private dotProduct(vector1: number[], vector2: number[]): number {
    let product = 0;
    for (let i = 0; i < vector1.length; i++) {
      product += vector1[i] * vector2[i];
    }
    return product;
  }

  /**
   * 曼哈頓距離
   */
  private manhattanDistance(vector1: number[], vector2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector1.length; i++) {
      sum += Math.abs(vector1[i] - vector2[i]);
    }
    return 1 / (1 + sum); // 轉換為相似度
  }

  /**
   * 計算置信度
   */
  private calculateConfidence(similarity: number, method: VectorSimilarityMethod): number {
    switch (method) {
      case VectorSimilarityMethod.COSINE:
        return Math.abs(similarity);
      case VectorSimilarityMethod.EUCLIDEAN:
      case VectorSimilarityMethod.MANHATTAN:
        return similarity;
      case VectorSimilarityMethod.DOT_PRODUCT:
        return Math.min(1, Math.abs(similarity));
      default:
        return Math.abs(similarity);
    }
  }

  /**
   * 聚合結果
   */
  private aggregateResults(results: VectorCalculationResult[]): VectorSimilarity[] {
    const allSimilarities: VectorSimilarity[] = [];

    results.forEach((result) => {
      allSimilarities.push(...result.similarities);
    });

    // 按相似度排序
    allSimilarities.sort((a, b) => b.similarity - a.similarity);

    return allSimilarities;
  }

  /**
   * 轉換為搜索結果
   */
  private async convertToSearchResults(
    similarities: VectorSimilarity[],
    filters: VectorSearchFilters,
    startTime: number
  ): Promise<VectorSearchResult[]> {
    const minSimilarity = filters.minSimilarityScore || 0.1;
    const maxResults = filters.maxResults || 50;

    const filteredSimilarities = similarities
      .filter((sim) => sim.similarity >= minSimilarity)
      .slice(0, maxResults);

    const results: VectorSearchResult[] = [];

    for (const similarity of filteredSimilarities) {
      try {
        const document = await this.getDocumentById(similarity.documentId);
        if (document) {
          results.push({
            document,
            score: similarity.similarity,
            metadata: {
              searchTime: startTime,
              processingTime: Date.now() - startTime,
              calculationMethod: "parallel",
            },
          });
        }
      } catch (error) {
        console.warn(`Failed to get document ${similarity.documentId}:`, error);
      }
    }

    return results;
  }

  /**
   * 根據 ID 獲取文檔
   */
  private async getDocumentById(documentId: string): Promise<Document | null> {
    try {
      const db = await this.vectorStoreManager.getDb();
      const { search } = await import("@orama/orama");

      const results = await search(db, {
        where: {
          id: documentId,
        },
        limit: 1,
      });

      if (results.hits && results.hits.length > 0) {
        const hit = results.hits[0];
        return new Document({
          pageContent: hit.document.content || "",
          metadata: {
            ...(hit.document.metadata || {}),
            path: hit.document.path || "",
            title: hit.document.title || "",
            id: hit.document.id,
          },
        });
      }

      return null;
    } catch (error) {
      console.error("Failed to get document by ID:", error);
      return null;
    }
  }

  /**
   * 初始化工作池（模擬）
   */
  private initializeWorkerPool(): void {
    // 在瀏覽器環境中，我們不使用真正的 Worker，而是使用 Promise 模擬
    // 這裡主要是設置工作池大小等配置
    const poolSize = this.config.workerPoolSize || 4;
    this.emit("worker_pool_initialized", { poolSize });
  }

  /**
   * 生成任務 ID
   */
  private generateTaskId(): string {
    return `calc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 關閉計算器
   */
  async shutdown(): Promise<void> {
    this.activeCalculations.clear();
    this.workerPool = [];
    this.isInitialized = false;
    this.emit("shutdown");
  }
}
