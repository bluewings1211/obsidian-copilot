/**
 * 關鍵字搜索策略 - 基於關鍵詞匹配的搜索
 */

import { Document } from "@langchain/core/documents";
import VectorStoreManager from "@/search/vectorStoreManager";
import { search } from "@orama/orama";
import { SearchContext, SearchResult, SearchStrategy, StrategyCapabilities } from "../types";

export class KeywordSearchStrategy implements SearchStrategy {
  readonly name = "keyword";
  readonly priority = 70;
  readonly timeout = 5000; // 5 seconds

  private vectorStoreManager: VectorStoreManager;

  constructor() {
    this.vectorStoreManager = VectorStoreManager.getInstance();
  }

  /**
   * 執行關鍵字搜索
   */
  async search(context: SearchContext): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      // 提取並處理關鍵詞
      const keywords = this.extractKeywords(context);

      if (keywords.length === 0) {
        return [];
      }

      // 獲取數據庫實例
      const db = await this.vectorStoreManager.getDb();

      // 構建搜索參數
      const searchParams = this.buildSearchParams(keywords, context);

      // 執行關鍵字搜索
      const searchResults = await search(db, searchParams);

      // 轉換結果
      const results = this.convertToSearchResults(searchResults, startTime, context, keywords);

      return this.postProcessResults(results, context);
    } catch (error) {
      console.error("Keyword search failed:", error);
      throw error;
    }
  }

  /**
   * 驗證搜索上下文
   */
  validateContext(context: SearchContext): boolean {
    // 檢查是否有查詢或重要術語
    if (!context.query && (!context.salientTerms || context.salientTerms.length === 0)) {
      return false;
    }

    // 如果只有查詢，檢查是否可以提取關鍵詞
    if (context.query && !context.salientTerms) {
      const keywords = this.extractKeywordsFromQuery(context.query);
      return keywords.length > 0;
    }

    return true;
  }

  /**
   * 估算執行時間
   */
  estimateExecutionTime(context: SearchContext): number {
    let baseTime = 1000; // 基礎時間 1 秒

    // 根據關鍵詞數量調整
    const keywordCount = this.getKeywordCount(context);
    if (keywordCount > 5) {
      baseTime += (keywordCount - 5) * 100; // 每個額外關鍵詞增加 0.1 秒
    }

    // 根據過濾條件調整
    if (context.timeRange) {
      baseTime += 200; // 時間過濾增加 0.2 秒
    }

    if (context.filters && Object.keys(context.filters).length > 0) {
      baseTime += 150; // 元數據過濾增加 0.15 秒
    }

    return Math.min(baseTime, this.timeout);
  }

  /**
   * 獲取策略能力
   */
  getCapabilities(): StrategyCapabilities {
    return {
      supportsVectorSearch: false,
      supportsKeywordSearch: true,
      supportsTimeFiltering: true,
      supportsMetadataFiltering: true,
      supportsHybridMode: false,
      maxResultsLimit: 200,
      estimatedLatency: 1000,
    };
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
    // 分詞並過濾
    const words = query
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ") // 移除標點符號，保留連字符
      .split(/\s+/)
      .filter((word) => word.length > 0);

    return words
      .filter((word) => this.isValidKeyword(word))
      .map((word) => this.cleanKeyword(word))
      .filter((word) => word !== null) as string[];
  }

  /**
   * 檢查是否為有效關鍵詞
   */
  private isValidKeyword(word: string): boolean {
    // 長度檢查
    if (word.length < 2 || word.length > 50) {
      return false;
    }

    // 停用詞檢查
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

    if (stopWords.has(word.toLowerCase())) {
      return false;
    }

    // 純數字檢查（除非很長）
    if (/^\d+$/.test(word) && word.length < 4) {
      return false;
    }

    return true;
  }

  /**
   * 清理關鍵詞
   */
  private cleanKeyword(keyword: string): string | null {
    // 移除首尾空格和特殊字符
    const cleaned = keyword.trim().replace(/^[^\w]+|[^\w]+$/g, "");

    if (cleaned.length < 2) {
      return null;
    }

    return cleaned;
  }

  /**
   * 獲取關鍵詞數量
   */
  private getKeywordCount(context: SearchContext): number {
    return this.extractKeywords(context).length;
  }

  /**
   * 構建搜索參數
   */
  private buildSearchParams(keywords: string[], context: SearchContext): any {
    // 處理標籤關鍵詞
    const tagKeywords = keywords.filter((keyword) => keyword.startsWith("#"));
    const textKeywords = keywords.filter((keyword) => !keyword.startsWith("#"));

    let searchParams: any;

    if (tagKeywords.length > 0 && textKeywords.length === 0) {
      // 純標籤搜索
      searchParams = {
        mode: "fulltext",
        term: tagKeywords.join(" "),
        threshold: 0,
        limit: context.filters?.maxResults || 100,
      };
    } else if (textKeywords.length > 0) {
      // 文本關鍵詞搜索
      const searchTerm = this.buildSearchTerm(textKeywords);

      searchParams = {
        mode: "fulltext",
        term: searchTerm,
        threshold: 0.1,
        limit: context.filters?.maxResults || 100,
        boost: this.buildBoostConfig(),
      };
    } else {
      // 沒有有效關鍵詞
      throw new Error("No valid keywords found for search");
    }

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
   * 構建搜索詞
   */
  private buildSearchTerm(keywords: string[]): string {
    // 對關鍵詞進行優先級排序
    const prioritizedKeywords = this.prioritizeKeywords(keywords);

    // 構建搜索查詢
    // 使用 OR 操作符連接關鍵詞，但給重要詞更高權重
    return prioritizedKeywords.join(" OR ");
  }

  /**
   * 關鍵詞優先級排序
   */
  private prioritizeKeywords(keywords: string[]): string[] {
    return keywords.sort((a, b) => {
      // 較長的關鍵詞優先級更高
      if (a.length !== b.length) {
        return b.length - a.length;
      }

      // 包含連字符的關鍵詞優先級更高（可能是復合詞）
      const aHasHyphen = a.includes("-");
      const bHasHyphen = b.includes("-");
      if (aHasHyphen !== bHasHyphen) {
        return aHasHyphen ? -1 : 1;
      }

      // 字母順序
      return a.localeCompare(b);
    });
  }

  /**
   * 構建提升配置
   */
  private buildBoostConfig(): any {
    return {
      title: 2.0, // 標題字段權重
      content: 1.0, // 內容字段權重
      tags: 1.5, // 標籤字段權重
    };
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
   * 轉換搜索結果
   */
  private convertToSearchResults(
    searchResults: any,
    startTime: number,
    context: SearchContext,
    keywords: string[]
  ): SearchResult[] {
    const processingTime = Date.now() - startTime;

    if (!searchResults || !searchResults.hits) {
      console.warn("Keyword search results or hits are undefined");
      return [];
    }

    return searchResults.hits
      .map((hit: any) => {
        if (!hit || !hit.document) {
          console.warn("Invalid hit or document in keyword search results");
          return null;
        }

        // 計算關鍵詞匹配分數
        const keywordMatchScore = this.calculateKeywordMatchScore(hit.document, keywords);

        // 使用原始分數和關鍵詞匹配分數的組合
        const combinedScore = (hit.score || 0) * 0.7 + keywordMatchScore * 0.3;

        // 創建文檔對象
        const document = new Document({
          pageContent: hit.document.content || "",
          metadata: {
            ...(hit.document.metadata || {}),
            score: combinedScore,
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
          score: combinedScore,
          strategy: this.name,
          metadata: {
            searchTime: startTime,
            processingTime,
            strategyMetadata: {
              originalScore: hit.score,
              keywordMatchScore,
              matchedKeywords: this.getMatchedKeywords(hit.document, keywords),
              keywordCount: keywords.length,
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
   * 計算關鍵詞匹配分數
   */
  private calculateKeywordMatchScore(document: any, keywords: string[]): number {
    const content = (document.content || "").toLowerCase();
    const title = (document.title || "").toLowerCase();
    const tags = (document.tags || []).map((tag: string) => tag.toLowerCase());

    let score = 0;
    const totalKeywords = keywords.length;

    keywords.forEach((keyword) => {
      const lowerKeyword = keyword.toLowerCase().replace(/^#/, "");

      // 標題匹配（高權重）
      if (title.includes(lowerKeyword)) {
        score += 0.4;
      }

      // 內容匹配
      if (content.includes(lowerKeyword)) {
        score += 0.3;
      }

      // 標籤匹配（中權重）
      if (tags.some((tag: string) => tag.includes(lowerKeyword))) {
        score += 0.3;
      }
    });

    return totalKeywords > 0 ? score / totalKeywords : 0;
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
    results.sort((a, b) => b.score - a.score);

    // 過濾低分結果
    const filteredResults = results.filter((result) => result.score > 0.1);

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
      averageLatency: 1000,
      successRate: 0.98,
    };
  }
}
