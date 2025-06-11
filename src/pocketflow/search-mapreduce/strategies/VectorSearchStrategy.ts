/**
 * 向量搜索策略 - 基於語義相似性的搜索
 */

import { Document } from "@langchain/core/documents";
import EmbeddingManager from "@/LLMProviders/embeddingManager";
import VectorStoreManager from "@/search/vectorStoreManager";
import { search } from "@orama/orama";
import { SearchContext, SearchResult, SearchStrategy, StrategyCapabilities } from "../types";

export class VectorSearchStrategy implements SearchStrategy {
  readonly name = "vector";
  readonly priority = 80;
  readonly timeout = 10000; // 10 seconds

  private embeddingManager: EmbeddingManager;
  private vectorStoreManager: VectorStoreManager;

  constructor() {
    this.embeddingManager = EmbeddingManager.getInstance();
    this.vectorStoreManager = VectorStoreManager.getInstance();
  }

  /**
   * 執行向量搜索
   */
  async search(context: SearchContext): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      // 生成查詢向量
      const queryVector = await this.convertQueryToVector(context.query);

      // 獲取數據庫實例
      const db = await this.vectorStoreManager.getDb();

      // 構建搜索參數
      const searchParams = this.buildSearchParams(queryVector, context);

      // 執行向量搜索
      const searchResults = await search(db, searchParams);

      // 轉換結果
      const results = this.convertToSearchResults(searchResults, startTime, context);

      return results;
    } catch (error) {
      console.error("Vector search failed:", error);
      throw error;
    }
  }

  /**
   * 驗證搜索上下文
   */
  validateContext(context: SearchContext): boolean {
    // 檢查查詢是否存在且不為空
    if (!context.query || context.query.trim().length === 0) {
      return false;
    }

    // 檢查查詢長度（向量搜索適合較長的查詢）
    if (context.query.length < 5) {
      return false;
    }

    return true;
  }

  /**
   * 估算執行時間
   */
  estimateExecutionTime(context: SearchContext): number {
    let baseTime = 2000; // 基礎時間 2 秒

    // 根據查詢複雜度調整
    if (context.query.length > 200) {
      baseTime += 1000; // 長查詢增加 1 秒
    }

    // 根據過濾條件調整
    if (context.timeRange) {
      baseTime += 500; // 時間過濾增加 0.5 秒
    }

    if (context.filters && Object.keys(context.filters).length > 0) {
      baseTime += 300; // 元數據過濾增加 0.3 秒
    }

    return Math.min(baseTime, this.timeout);
  }

  /**
   * 獲取策略能力
   */
  getCapabilities(): StrategyCapabilities {
    return {
      supportsVectorSearch: true,
      supportsKeywordSearch: false,
      supportsTimeFiltering: true,
      supportsMetadataFiltering: true,
      supportsHybridMode: false,
      maxResultsLimit: 100,
      estimatedLatency: 2000,
    };
  }

  /**
   * 將查詢轉換為向量
   */
  private async convertQueryToVector(query: string): Promise<number[]> {
    try {
      const embeddingsAPI = await this.embeddingManager.getEmbeddingsAPI();
      const vector = await embeddingsAPI.embedQuery(query);

      if (vector.length === 0) {
        throw new Error("Query embedding returned an empty vector");
      }

      return vector;
    } catch (error) {
      console.error("Failed to convert query to vector:", error);
      throw new Error(`Vector conversion failed: ${error}`);
    }
  }

  /**
   * 構建搜索參數
   */
  private buildSearchParams(queryVector: number[], context: SearchContext): any {
    const searchParams: any = {
      mode: "vector",
      vector: {
        value: queryVector,
        property: "embedding",
      },
      similarity: context.filters?.minSimilarityScore || 0.1,
      limit: context.filters?.maxResults || 50,
      includeVectors: false,
    };

    // 添加時間範圍過濾
    if (context.timeRange) {
      searchParams.where = {
        mtime: {
          between: [context.timeRange.startTime, context.timeRange.endTime],
        },
      };
    }

    // 添加其他過濾條件
    if (context.filters) {
      if (context.filters.extension) {
        searchParams.where = {
          ...searchParams.where,
          extension: context.filters.extension,
        };
      }

      if (context.filters.tags && context.filters.tags.length > 0) {
        searchParams.where = {
          ...searchParams.where,
          tags: { in: context.filters.tags },
        };
      }
    }

    return searchParams;
  }

  /**
   * 轉換搜索結果
   */
  private convertToSearchResults(
    searchResults: any,
    startTime: number,
    context: SearchContext
  ): SearchResult[] {
    const processingTime = Date.now() - startTime;

    if (!searchResults || !searchResults.hits) {
      console.warn("Vector search results or hits are undefined");
      return [];
    }

    return searchResults.hits
      .map((hit: any) => {
        if (!hit || !hit.document) {
          console.warn("Invalid hit or document in vector search results");
          return null;
        }

        // 驗證分數
        let score = hit.score;
        if (typeof score !== "number" || isNaN(score)) {
          console.warn("Invalid score in vector search result:", {
            score: hit.score,
            path: hit.document.path,
            title: hit.document.title,
          });
          score = 0;
        }

        // 創建文檔對象
        const document = new Document({
          pageContent: hit.document.content || "",
          metadata: {
            ...(hit.document.metadata || {}),
            score,
            path: hit.document.path || "",
            mtime: hit.document.mtime,
            ctime: hit.document.ctime,
            title: hit.document.title || "",
            id: hit.document.id,
            embeddingModel: hit.document.embeddingModel,
            tags: hit.document.tags || [],
            extension: hit.document.extension,
            created_at: hit.document.created_at,
            nchars: hit.document.nchars,
          },
        });

        // 創建搜索結果
        const result: SearchResult = {
          document,
          score,
          strategy: this.name,
          metadata: {
            searchTime: startTime,
            processingTime,
            strategyMetadata: {
              vectorSimilarity: score,
              embeddingModel: hit.document.embeddingModel,
              queryLength: context.query.length,
              hasTimeFilter: !!context.timeRange,
              hasMetadataFilter: !!(context.filters && Object.keys(context.filters).length > 0),
            },
          },
        };

        return result;
      })
      .filter((result: SearchResult | null): result is SearchResult => result !== null);
  }

  /**
   * 獲取最佳相似度閾值
   */
  private getOptimalSimilarityThreshold(context: SearchContext): number {
    let threshold = 0.1; // 默認閾值

    // 根據查詢類型調整閾值
    if (context.query.length < 20) {
      // 短查詢使用更高的閾值
      threshold = 0.2;
    } else if (context.query.length > 100) {
      // 長查詢可以使用較低的閾值
      threshold = 0.05;
    }

    // 如果有明確的相似度要求，使用指定值
    if (context.filters?.minSimilarityScore) {
      threshold = Math.max(threshold, context.filters.minSimilarityScore);
    }

    return threshold;
  }

  /**
   * 後處理結果
   */
  private postProcessResults(results: SearchResult[], context: SearchContext): SearchResult[] {
    // 按分數排序
    results.sort((a, b) => b.score - a.score);

    // 應用動態閾值過濾
    const threshold = this.getOptimalSimilarityThreshold(context);
    const filteredResults = results.filter((result) => result.score >= threshold);

    // 限制結果數量
    const maxResults = context.filters?.maxResults || 50;
    return filteredResults.slice(0, maxResults);
  }

  /**
   * 計算查詢增強版本
   */
  private enhanceQuery(query: string, context: SearchContext): string {
    let enhancedQuery = query;

    // 添加重要術語
    if (context.salientTerms && context.salientTerms.length > 0) {
      const relevantTerms = context.salientTerms.filter(
        (term) => !query.toLowerCase().includes(term.toLowerCase())
      );

      if (relevantTerms.length > 0) {
        enhancedQuery += " " + relevantTerms.slice(0, 3).join(" ");
      }
    }

    // 添加上下文信息
    if (context.userContext) {
      if (context.userContext.domain) {
        enhancedQuery += ` in the context of ${context.userContext.domain}`;
      }
    }

    return enhancedQuery;
  }

  /**
   * 獲取性能統計
   */
  getPerformanceStats(): {
    totalSearches: number;
    averageLatency: number;
    successRate: number;
  } {
    // 這裡應該從實際的性能監控系統獲取數據
    // 暫時返回模擬數據
    return {
      totalSearches: 0,
      averageLatency: 2000,
      successRate: 0.95,
    };
  }
}
