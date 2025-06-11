/**
 * 關鍵字搜索結果聚合器
 */

import {
  KeywordSearchRequest,
  KeywordSearchResult,
  KeywordDocument,
  ParsedQuery,
  ParallelSearchResult,
  KeywordSearchMetadata,
  SearchQualityMetrics,
} from "../types";

export class KeywordResultAggregator {
  private isInitialized = false;

  /**
   * 初始化聚合器
   */
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * 聚合搜索結果
   */
  async aggregateResults(
    taskResults: ParallelSearchResult[],
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery
  ): Promise<KeywordSearchResult> {
    if (!this.isInitialized) {
      throw new Error("KeywordResultAggregator not initialized");
    }

    const startTime = Date.now();

    try {
      // 階段 1: 收集所有文檔
      const allDocuments = this.collectAllDocuments(taskResults);

      // 階段 2: 去重處理
      const deduplicatedDocuments = this.removeDuplicates(allDocuments);

      // 階段 3: 分數標準化
      const normalizedDocuments = this.normalizeScores(deduplicatedDocuments);

      // 階段 4: 相關性重排序
      const rerankedDocuments = this.rerankedByRelevance(normalizedDocuments, request, parsedQuery);

      // 階段 5: 應用過濾和限制
      const filteredDocuments = this.applyFiltersAndLimits(rerankedDocuments, request);

      // 階段 6: 生成質量指標
      const qualityMetrics = this.calculateQualityMetrics(filteredDocuments, request, parsedQuery);

      // 階段 7: 生成元數據
      const metadata = this.generateMetadata(
        taskResults,
        request,
        parsedQuery,
        qualityMetrics,
        Date.now() - startTime
      );

      return {
        documents: filteredDocuments,
        totalFound: allDocuments.length,
        searchTime: Date.now() - startTime,
        strategy: "keyword_aggregated",
        metadata,
      };
    } catch (error) {
      throw new Error(`Result aggregation failed: ${error}`);
    }
  }

  /**
   * 收集所有文檔
   */
  private collectAllDocuments(taskResults: ParallelSearchResult[]): KeywordDocument[] {
    const allDocuments: KeywordDocument[] = [];

    taskResults.forEach((taskResult) => {
      if (taskResult.results && Array.isArray(taskResult.results)) {
        taskResult.results.forEach((doc) => {
          // 確保文檔格式正確
          const formattedDoc = this.formatDocument(doc, taskResult.metadata.indexName);
          if (formattedDoc) {
            allDocuments.push(formattedDoc);
          }
        });
      }
    });

    return allDocuments;
  }

  /**
   * 格式化文檔
   */
  private formatDocument(doc: any, indexName: string): KeywordDocument | null {
    try {
      return {
        id: doc.id || `${indexName}_${Math.random().toString(36).substr(2, 9)}`,
        content: doc.content || "",
        title: doc.title || "Untitled",
        path: doc.path || "",
        score: typeof doc.score === "number" ? doc.score : 0,
        highlights: doc.highlights || [],
        metadata: {
          size: doc.metadata?.size || 0,
          mtime: doc.metadata?.mtime || Date.now(),
          ctime: doc.metadata?.ctime || Date.now(),
          extension: doc.metadata?.extension || "unknown",
          tags: doc.metadata?.tags || [],
          language: doc.metadata?.language,
          wordCount: doc.metadata?.wordCount,
          ...doc.metadata,
          sourceIndex: indexName,
        },
      };
    } catch (error) {
      console.error("Error formatting document:", error, doc);
      return null;
    }
  }

  /**
   * 去重處理
   */
  private removeDuplicates(documents: KeywordDocument[]): KeywordDocument[] {
    const seen = new Set<string>();
    const deduplicatedDocs: KeywordDocument[] = [];

    // 按分數降序排序，保留分數最高的重複文檔
    const sortedDocs = [...documents].sort((a, b) => b.score - a.score);

    sortedDocs.forEach((doc) => {
      // 使用多種策略來識別重複文檔
      const keys = this.generateDeduplicationKeys(doc);

      let isDuplicate = false;
      for (const key of keys) {
        if (seen.has(key)) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        keys.forEach((key) => seen.add(key));
        deduplicatedDocs.push(doc);
      }
    });

    return deduplicatedDocs;
  }

  /**
   * 生成去重鍵
   */
  private generateDeduplicationKeys(doc: KeywordDocument): string[] {
    const keys: string[] = [];

    // 基於 ID 的去重
    if (doc.id) {
      keys.push(`id:${doc.id}`);
    }

    // 基於路徑的去重
    if (doc.path) {
      keys.push(`path:${doc.path}`);
    }

    // 基於內容哈希的去重（簡化版）
    if (doc.content.length > 50) {
      const contentHash = this.simpleHash(doc.content);
      keys.push(`content:${contentHash}`);
    }

    // 基於標題和大小的組合去重
    if (doc.title && doc.metadata.size) {
      keys.push(`title_size:${doc.title}:${doc.metadata.size}`);
    }

    return keys;
  }

  /**
   * 簡單哈希函數
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為32位整數
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * 分數標準化
   */
  private normalizeScores(documents: KeywordDocument[]): KeywordDocument[] {
    if (documents.length === 0) {
      return documents;
    }

    // 獲取分數統計
    const scores = documents.map((doc) => doc.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const scoreRange = maxScore - minScore;

    // 避免除以零
    if (scoreRange === 0) {
      return documents.map((doc) => ({
        ...doc,
        score: 1.0,
      }));
    }

    // Min-Max 標準化到 [0, 1] 區間
    return documents.map((doc) => ({
      ...doc,
      score: (doc.score - minScore) / scoreRange,
    }));
  }

  /**
   * 相關性重排序
   */
  private rerankedByRelevance(
    documents: KeywordDocument[],
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery
  ): KeywordDocument[] {
    // 計算額外的相關性分數
    const rerankedDocs = documents.map((doc) => {
      const relevanceBoost = this.calculateRelevanceBoost(doc, request, parsedQuery);
      const finalScore = doc.score * 0.7 + relevanceBoost * 0.3;

      return {
        ...doc,
        score: Math.max(0, Math.min(1, finalScore)),
      };
    });

    // 按最終分數降序排序
    return rerankedDocs.sort((a, b) => b.score - a.score);
  }

  /**
   * 計算相關性提升分數
   */
  private calculateRelevanceBoost(
    doc: KeywordDocument,
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery
  ): number {
    let boost = 0;

    // 查詢詞在標題中的匹配
    const titleMatches = this.countTermMatches(doc.title.toLowerCase(), parsedQuery.terms);
    boost += titleMatches * 0.3;

    // 查詢詞在內容中的匹配密度
    const contentMatches = this.countTermMatches(doc.content.toLowerCase(), parsedQuery.terms);
    const contentDensity =
      doc.content.length > 0 ? (contentMatches / doc.content.length) * 1000 : 0;
    boost += Math.min(contentDensity, 0.5) * 0.2;

    // 短語匹配
    const phraseMatches = this.countPhraseMatches(doc, parsedQuery.phrases);
    boost += phraseMatches * 0.4;

    // 文件類型偏好
    if (request.context?.userPreferences?.documentTypes) {
      const typePreference =
        request.context.userPreferences.documentTypes[doc.metadata.extension] || 0;
      boost += typePreference * 0.1;
    }

    // 新鮮度加權（較新的文檔得分稍高）
    const ageInDays = (Date.now() - doc.metadata.mtime) / (1000 * 60 * 60 * 24);
    const freshnessBoost = Math.max(0, (30 - ageInDays) / 30) * 0.1;
    boost += freshnessBoost;

    return Math.max(0, Math.min(1, boost));
  }

  /**
   * 計算詞匹配數量
   */
  private countTermMatches(text: string, terms: any[]): number {
    let matches = 0;
    terms.forEach((term) => {
      const termText = term.text?.toLowerCase() || "";
      if (termText && text.includes(termText)) {
        matches++;
      }
    });
    return matches;
  }

  /**
   * 計算短語匹配數量
   */
  private countPhraseMatches(doc: KeywordDocument, phrases: any[]): number {
    let matches = 0;
    const fullText = (doc.title + " " + doc.content).toLowerCase();

    phrases.forEach((phrase) => {
      const phraseText = phrase.text?.toLowerCase() || "";
      if (phraseText && fullText.includes(phraseText)) {
        matches++;
      }
    });

    return matches;
  }

  /**
   * 應用過濾和限制
   */
  private applyFiltersAndLimits(
    documents: KeywordDocument[],
    request: KeywordSearchRequest
  ): KeywordDocument[] {
    let filtered = documents;

    // 最小分數過濾
    if (request.options?.minSimilarityScore) {
      filtered = filtered.filter((doc) => doc.score >= request.options!.minSimilarityScore!);
    }

    // 時間範圍過濾
    if (request.context?.timeRange) {
      const { startTime, endTime } = request.context.timeRange;
      filtered = filtered.filter(
        (doc) => doc.metadata.mtime >= startTime && doc.metadata.mtime <= endTime
      );
    }

    // 文檔類型過濾
    if (request.context?.documentTypes && request.context.documentTypes.length > 0) {
      const allowedTypes = new Set(request.context.documentTypes);
      filtered = filtered.filter((doc) => allowedTypes.has(doc.metadata.extension));
    }

    // 結果數量限制
    const maxResults = request.options?.maxResults || 50;
    if (filtered.length > maxResults) {
      filtered = filtered.slice(0, maxResults);
    }

    return filtered;
  }

  /**
   * 計算質量指標
   */
  private calculateQualityMetrics(
    documents: KeywordDocument[],
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery
  ): SearchQualityMetrics {
    if (documents.length === 0) {
      return {
        precision: 0,
        recall: 0,
        relevanceScore: 0,
        diversityScore: 0,
        coverageScore: 0,
      };
    }

    // 精確度 - 平均相關性分數
    const precision = documents.reduce((sum, doc) => sum + doc.score, 0) / documents.length;

    // 召回率 - 基於查詢詞覆蓋率估算
    const queryTerms = parsedQuery.terms.map((t) => t.text?.toLowerCase() || "").filter((t) => t);
    const coveredTerms = new Set<string>();
    documents.forEach((doc) => {
      const text = (doc.title + " " + doc.content).toLowerCase();
      queryTerms.forEach((term) => {
        if (text.includes(term)) {
          coveredTerms.add(term);
        }
      });
    });
    const recall = queryTerms.length > 0 ? coveredTerms.size / queryTerms.length : 1;

    // 相關性分數 - 高分文檔的比例
    const highScoreDocs = documents.filter((doc) => doc.score > 0.7).length;
    const relevanceScore = documents.length > 0 ? highScoreDocs / documents.length : 0;

    // 多樣性分數 - 基於文件類型和路徑的多樣性
    const extensions = new Set(documents.map((doc) => doc.metadata.extension));
    const paths = new Set(
      documents.map((doc) => {
        const pathParts = doc.path.split("/");
        return pathParts.length > 1 ? pathParts[0] : "root";
      })
    );
    const diversityScore = Math.min(
      1,
      (extensions.size + paths.size) / Math.max(10, documents.length)
    );

    // 覆蓋率分數 - 查詢意圖的覆蓋程度
    const coverageScore = Math.min(1, recall * precision);

    return {
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      relevanceScore: Math.round(relevanceScore * 1000) / 1000,
      diversityScore: Math.round(diversityScore * 1000) / 1000,
      coverageScore: Math.round(coverageScore * 1000) / 1000,
    };
  }

  /**
   * 生成元數據
   */
  private generateMetadata(
    taskResults: ParallelSearchResult[],
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    qualityMetrics: SearchQualityMetrics,
    totalProcessingTime: number
  ): KeywordSearchMetadata {
    // 計算各階段耗時
    const queryParsingTime = 50; // 簡化，實際應該測量
    const indexSearchTime = taskResults.reduce(
      (sum, result) => sum + (result.metadata.searchTime || 0),
      0
    );
    const resultAggregationTime = totalProcessingTime - indexSearchTime;

    // 檢查緩存命中（簡化處理）
    const cacheHit = false; // 實際應該從緩存系統獲取

    // 統計並行任務使用情況
    const parallelTasksUsed = taskResults.length;

    // 收集搜索的索引
    const indexesSearched = [...new Set(taskResults.map((result) => result.metadata.indexName))];

    return {
      totalProcessingTime,
      queryParsingTime,
      indexSearchTime,
      resultAggregationTime,
      cacheHit,
      parallelTasksUsed,
      indexesSearched,
      qualityMetrics,
    };
  }

  /**
   * 關閉聚合器
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }
}
