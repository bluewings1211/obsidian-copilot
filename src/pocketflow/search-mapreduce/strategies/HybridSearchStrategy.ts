/**
 * 混合搜索策略 - 結合向量搜索和關鍵字搜索
 */

import { Document } from "@langchain/core/documents";
import EmbeddingManager from "@/LLMProviders/embeddingManager";
import VectorStoreManager from "@/search/vectorStoreManager";
import { search } from "@orama/orama";
import { SearchContext, SearchResult, SearchStrategy, StrategyCapabilities } from "../types";

export class HybridSearchStrategy implements SearchStrategy {
  readonly name = "hybrid";
  readonly priority = 90;
  readonly timeout = 15000; // 15 seconds

  private embeddingManager: EmbeddingManager;
  private vectorStoreManager: VectorStoreManager;

  constructor() {
    this.embeddingManager = EmbeddingManager.getInstance();
    this.vectorStoreManager = VectorStoreManager.getInstance();
  }

  /**
   * 執行混合搜索
   */
  async search(context: SearchContext): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      // 確定搜索權重
      const weights = this.determineSearchWeights(context);

      // 準備搜索參數
      const { queryVector, keywords } = await this.prepareSearchComponents(context);

      // 執行混合搜索
      const searchResults = await this.executeHybridSearch(queryVector, keywords, weights, context);

      // 轉換和處理結果
      const results = this.convertToSearchResults(
        searchResults,
        startTime,
        context,
        weights,
        keywords
      );

      return this.postProcessResults(results, context);
    } catch (error) {
      console.error("Hybrid search failed:", error);
      throw error;
    }
  }

  /**
   * 驗證搜索上下文
   */
  validateContext(context: SearchContext): boolean {
    // 需要有查詢內容
    if (!context.query || context.query.trim().length === 0) {
      return false;
    }

    // 查詢長度應該適中（既不太短也不太長）
    if (context.query.length < 3 || context.query.length > 1000) {
      return false;
    }

    return true;
  }

  /**
   * 估算執行時間
   */
  estimateExecutionTime(context: SearchContext): number {
    let baseTime = 3000; // 基礎時間 3 秒

    // 根據查詢複雜度調整
    if (context.query.length > 200) {
      baseTime += 2000; // 長查詢增加 2 秒
    }

    // 根據關鍵詞數量調整
    const keywordCount = this.extractKeywords(context).length;
    if (keywordCount > 5) {
      baseTime += (keywordCount - 5) * 200; // 每個額外關鍵詞增加 0.2 秒
    }

    // 根據過濾條件調整
    if (context.timeRange) {
      baseTime += 1000; // 時間過濾增加 1 秒
    }

    if (context.filters && Object.keys(context.filters).length > 0) {
      baseTime += 500; // 元數據過濾增加 0.5 秒
    }

    return Math.min(baseTime, this.timeout);
  }

  /**
   * 獲取策略能力
   */
  getCapabilities(): StrategyCapabilities {
    return {
      supportsVectorSearch: true,
      supportsKeywordSearch: true,
      supportsTimeFiltering: true,
      supportsMetadataFiltering: true,
      supportsHybridMode: true,
      maxResultsLimit: 150,
      estimatedLatency: 3000,
    };
  }

  /**
   * 確定搜索權重
   */
  private determineSearchWeights(context: SearchContext): {
    vectorWeight: number;
    textWeight: number;
  } {
    // 從上下文元數據中獲取權重配置
    let vectorWeight = context.metadata?.vectorWeight || 0.5;
    let textWeight = context.metadata?.textWeight || 0.5;

    // 根據查詢特徵動態調整權重
    const queryLength = context.query.length;
    const hasKeywords = context.salientTerms && context.salientTerms.length > 0;
    const hasTagKeywords = context.salientTerms?.some((term) => term.startsWith("#"));

    // 如果查詢很短，增加關鍵字搜索權重
    if (queryLength < 20) {
      textWeight += 0.2;
      vectorWeight -= 0.2;
    }

    // 如果查詢很長，增加向量搜索權重
    if (queryLength > 100) {
      vectorWeight += 0.2;
      textWeight -= 0.2;
    }

    // 如果有明確的關鍵詞，增加文本搜索權重
    if (hasKeywords) {
      textWeight += 0.1;
      vectorWeight -= 0.1;
    }

    // 如果有標籤關鍵詞，大幅增加文本搜索權重
    if (hasTagKeywords) {
      textWeight = 0.8;
      vectorWeight = 0.2;
    }

    // 確保權重在有效範圍內且總和為 1
    vectorWeight = Math.max(0.1, Math.min(0.9, vectorWeight));
    textWeight = Math.max(0.1, Math.min(0.9, textWeight));

    const total = vectorWeight + textWeight;
    vectorWeight = vectorWeight / total;
    textWeight = textWeight / total;

    return { vectorWeight, textWeight };
  }

  /**
   * 準備搜索組件
   */
  private async prepareSearchComponents(context: SearchContext): Promise<{
    queryVector: number[];
    keywords: string[];
  }> {
    // 並行準備向量和關鍵詞
    const [queryVector, keywords] = await Promise.all([
      this.convertQueryToVector(context.query),
      Promise.resolve(this.extractKeywords(context)),
    ]);

    return { queryVector, keywords };
  }

  /**
   * 執行混合搜索
   */
  private async executeHybridSearch(
    queryVector: number[],
    keywords: string[],
    weights: { vectorWeight: number; textWeight: number },
    context: SearchContext
  ): Promise<any> {
    // 獲取數據庫實例
    const db = await this.vectorStoreManager.getDb();

    // 構建混合搜索參數
    const searchParams = this.buildHybridSearchParams(queryVector, keywords, weights, context);

    // 執行搜索
    return await search(db, searchParams);
  }

  /**
   * 構建混合搜索參數
   */
  private buildHybridSearchParams(
    queryVector: number[],
    keywords: string[],
    weights: { vectorWeight: number; textWeight: number },
    context: SearchContext
  ): any {
    const searchParams: any = {
      mode: "hybrid",
      vector: {
        value: queryVector,
        property: "embedding",
      },
      term: keywords.join(" "),
      hybridWeights: {
        vector: weights.vectorWeight,
        text: weights.textWeight,
      },
      similarity: context.filters?.minSimilarityScore || 0.1,
      limit: context.filters?.maxResults || 100,
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
      searchParams.where = {
        ...searchParams.where,
        ...this.buildFilterConditions(context.filters),
      };
    }

    return searchParams;
  }

  /**
   * 構建過濾條件
   */
  private buildFilterConditions(filters: Record<string, any>): any {
    const conditions: any = {};

    if (filters.extension) {
      conditions.extension = filters.extension;
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.tags = { in: filters.tags };
    }

    if (filters.minFileSize) {
      conditions.nchars = { gte: filters.minFileSize };
    }

    if (filters.maxFileSize) {
      conditions.nchars = {
        ...conditions.nchars,
        lte: filters.maxFileSize,
      };
    }

    return conditions;
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
   * 提取關鍵詞
   */
  private extractKeywords(context: SearchContext): string[] {
    const keywords = new Set<string>();

    // 從重要術語中提取
    if (context.salientTerms && context.salientTerms.length > 0) {
      context.salientTerms.forEach((term) => {
        const cleanTerm = this.cleanKeyword(term);
        if (cleanTerm) {
          keywords.add(cleanTerm);
        }
      });
    }

    // 從查詢中提取
    if (context.query) {
      const queryKeywords = this.extractKeywordsFromQuery(context.query);
      queryKeywords.forEach((keyword) => keywords.add(keyword));
    }

    return Array.from(keywords);
  }

  /**
   * 從查詢中提取關鍵詞
   */
  private extractKeywordsFromQuery(query: string): string[] {
    // 使用更智能的關鍵詞提取
    const words = query
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .filter((word) => !this.isStopWord(word));

    // 提取重要的短語（2-3個詞的組合）
    const phrases: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length > 3 && words[i + 1].length > 3) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }
    }

    return [...words, ...phrases].slice(0, 10); // 限制關鍵詞數量
  }

  /**
   * 檢查停用詞
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      "the",
      "is",
      "at",
      "which",
      "on",
      "and",
      "or",
      "but",
      "in",
      "with",
      "a",
      "an",
      "as",
      "are",
      "was",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "to",
      "of",
      "for",
      "by",
      "from",
      "about",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "up",
      "down",
      "out",
      "off",
      "over",
      "under",
      "again",
      "further",
      "then",
      "once",
    ]);

    return stopWords.has(word.toLowerCase());
  }

  /**
   * 清理關鍵詞
   */
  private cleanKeyword(keyword: string): string | null {
    const cleaned = keyword.trim().replace(/^[^\w#]+|[^\w]+$/g, "");

    if (cleaned.length < 2) {
      return null;
    }

    return cleaned;
  }

  /**
   * 轉換搜索結果
   */
  private convertToSearchResults(
    searchResults: any,
    startTime: number,
    context: SearchContext,
    weights: { vectorWeight: number; textWeight: number },
    keywords: string[]
  ): SearchResult[] {
    const processingTime = Date.now() - startTime;

    if (!searchResults || !searchResults.hits) {
      console.warn("Hybrid search results or hits are undefined");
      return [];
    }

    return searchResults.hits
      .map((hit: any) => {
        if (!hit || !hit.document) {
          console.warn("Invalid hit or document in hybrid search results");
          return null;
        }

        // 計算額外的相關性分數
        const relevanceScore = this.calculateRelevanceScore(hit.document, context, keywords);

        // 結合原始分數和相關性分數
        const finalScore = (hit.score || 0) * 0.8 + relevanceScore * 0.2;

        // 創建文檔對象
        const document = new Document({
          pageContent: hit.document.content || "",
          metadata: {
            ...(hit.document.metadata || {}),
            score: finalScore,
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
          score: finalScore,
          relevanceScore,
          strategy: this.name,
          metadata: {
            searchTime: startTime,
            processingTime,
            strategyMetadata: {
              originalScore: hit.score,
              relevanceScore,
              vectorWeight: weights.vectorWeight,
              textWeight: weights.textWeight,
              matchedKeywords: this.getMatchedKeywords(hit.document, keywords),
              keywordCount: keywords.length,
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
   * 計算相關性分數
   */
  private calculateRelevanceScore(
    document: any,
    context: SearchContext,
    keywords: string[]
  ): number {
    let score = 0;

    // 查詢詞在標題中的匹配
    const titleMatch = this.calculateTextMatch(document.title || "", context.query);
    score += titleMatch * 0.4;

    // 查詢詞在內容中的匹配
    const contentMatch = this.calculateTextMatch(document.content || "", context.query);
    score += contentMatch * 0.3;

    // 關鍵詞匹配
    const keywordMatch = this.calculateKeywordMatch(document, keywords);
    score += keywordMatch * 0.3;

    return Math.min(1.0, score);
  }

  /**
   * 計算文本匹配度
   */
  private calculateTextMatch(text: string, query: string): number {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // 完全匹配
    if (lowerText.includes(lowerQuery)) {
      return 1.0;
    }

    // 詞匹配
    const queryWords = lowerQuery.split(/\s+/).filter((word) => word.length > 2);
    const matchedWords = queryWords.filter((word) => lowerText.includes(word));

    return queryWords.length > 0 ? matchedWords.length / queryWords.length : 0;
  }

  /**
   * 計算關鍵詞匹配度
   */
  private calculateKeywordMatch(document: any, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const content = (document.content || "").toLowerCase();
    const title = (document.title || "").toLowerCase();
    const tags = (document.tags || []).map((tag: string) => tag.toLowerCase());

    const matchedCount = keywords.filter((keyword) => {
      const lowerKeyword = keyword.toLowerCase().replace(/^#/, "");

      return (
        title.includes(lowerKeyword) ||
        content.includes(lowerKeyword) ||
        tags.some((tag: string) => tag.includes(lowerKeyword))
      );
    }).length;

    return matchedCount / keywords.length;
  }

  /**
   * 獲取匹配的關鍵詞
   */
  private getMatchedKeywords(document: any, keywords: string[]): string[] {
    const content = (document.content || "").toLowerCase();
    const title = (document.title || "").toLowerCase();
    const tags = (document.tags || []).map((tag: string) => tag.toLowerCase());

    return keywords.filter((keyword) => {
      const lowerKeyword = keyword.toLowerCase().replace(/^#/, "");

      return (
        title.includes(lowerKeyword) ||
        content.includes(lowerKeyword) ||
        tags.some((tag: string) => tag.includes(lowerKeyword))
      );
    });
  }

  /**
   * 後處理結果
   */
  private postProcessResults(results: SearchResult[], context: SearchContext): SearchResult[] {
    // 按分數排序
    results.sort((a, b) => {
      // 優先按主分數排序
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // 分數相同時按相關性分數排序
      if (b.relevanceScore !== undefined && a.relevanceScore !== undefined) {
        return b.relevanceScore - a.relevanceScore;
      }

      return 0;
    });

    // 過濾低分結果
    const filteredResults = results.filter((result) => result.score > 0.05);

    // 限制結果數量
    const maxResults = context.filters?.maxResults || 100;
    return filteredResults.slice(0, maxResults);
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
      averageLatency: 3000,
      successRate: 0.92,
    };
  }
}
