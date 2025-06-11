/**
 * 混合搜索協調器 - 整合關鍵字和向量搜索
 */

import {
  KeywordSearchRequest,
  KeywordSearchResult,
  ParsedQuery,
  HybridConfig,
  HybridSearchMode,
} from "../types";

export class HybridSearchCoordinator {
  private config: HybridConfig;
  private isInitialized = false;

  constructor(config: HybridConfig) {
    this.config = config;
  }

  /**
   * 初始化混合搜索協調器
   */
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * 執行混合搜索
   */
  async executeHybridSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string,
    engines: {
      keywordEngine: any;
      parallelMatcher: any;
      indexManager: any;
      resultAggregator: any;
    }
  ): Promise<KeywordSearchResult> {
    if (!this.isInitialized) {
      throw new Error("HybridSearchCoordinator not initialized");
    }

    const mode = request.options?.hybridMode || this.config.defaultMode;

    switch (mode) {
      case HybridSearchMode.KEYWORD_FIRST: {
        return await this.executeKeywordFirstSearch(request, parsedQuery, searchId, engines);
      }

      case HybridSearchMode.VECTOR_FIRST: {
        return await this.executeVectorFirstSearch(request, parsedQuery, searchId, engines);
      }

      case HybridSearchMode.PARALLEL: {
        return await this.executeParallelSearch(request, parsedQuery, searchId, engines);
      }

      case HybridSearchMode.ADAPTIVE: {
        return await this.executeAdaptiveSearch(request, parsedQuery, searchId, engines);
      }

      default: {
        return await this.executeParallelSearch(request, parsedQuery, searchId, engines);
      }
    }
  }

  /**
   * 執行關鍵字優先搜索
   */
  private async executeKeywordFirstSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string,
    engines: any
  ): Promise<KeywordSearchResult> {
    // 先執行關鍵字搜索
    const keywordResult = await this.executeKeywordSearch(request, parsedQuery, searchId, engines);

    // 如果關鍵字搜索結果足夠好，直接返回
    if (this.isResultSufficient(keywordResult)) {
      return this.enhanceWithHybridMetadata(keywordResult, "keyword_only");
    }

    // 否則執行向量搜索並融合結果
    const vectorResult = await this.executeVectorSearch(request, searchId);
    return await this.fuseResults(keywordResult, vectorResult, searchId);
  }

  /**
   * 執行向量優先搜索
   */
  private async executeVectorFirstSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string,
    engines: any
  ): Promise<KeywordSearchResult> {
    // 先執行向量搜索
    const vectorResult = await this.executeVectorSearch(request, searchId);

    // 如果向量搜索結果足夠好，直接返回
    if (this.isResultSufficient(vectorResult)) {
      return this.convertVectorToKeywordResult(vectorResult, "vector_only");
    }

    // 否則執行關鍵字搜索並融合結果
    const keywordResult = await this.executeKeywordSearch(request, parsedQuery, searchId, engines);
    return await this.fuseResults(keywordResult, vectorResult, searchId);
  }

  /**
   * 執行並行搜索
   */
  private async executeParallelSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string,
    engines: any
  ): Promise<KeywordSearchResult> {
    // 並行執行關鍵字和向量搜索
    const [keywordResult, vectorResult] = await Promise.all([
      this.executeKeywordSearch(request, parsedQuery, searchId, engines),
      this.executeVectorSearch(request, searchId),
    ]);

    // 融合結果
    return await this.fuseResults(keywordResult, vectorResult, searchId);
  }

  /**
   * 執行自適應搜索
   */
  private async executeAdaptiveSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string,
    engines: any
  ): Promise<KeywordSearchResult> {
    // 基於查詢特徵決定最佳策略
    const strategy = this.determineAdaptiveStrategy(request, parsedQuery);

    switch (strategy) {
      case "keyword_only": {
        return await this.executeKeywordSearch(request, parsedQuery, searchId, engines);
      }

      case "vector_only": {
        const vectorResult = await this.executeVectorSearch(request, searchId);
        return this.convertVectorToKeywordResult(vectorResult, "vector_adaptive");
      }

      case "hybrid": {
        return await this.executeParallelSearch(request, parsedQuery, searchId, engines);
      }

      default: {
        return await this.executeParallelSearch(request, parsedQuery, searchId, engines);
      }
    }
  }

  /**
   * 執行關鍵字搜索
   */
  private async executeKeywordSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string,
    engines: any
  ): Promise<KeywordSearchResult> {
    // 創建純關鍵字搜索請求
    const keywordRequest = {
      ...request,
      options: {
        ...request.options,
        hybridMode: undefined, // 移除混合模式以執行純關鍵字搜索
      },
    };

    // 準備搜索任務
    const searchTasks = await this.prepareKeywordSearchTasks(
      keywordRequest,
      parsedQuery,
      searchId,
      engines
    );

    // 執行並行搜索
    const taskResults =
      request.options?.enableParallel !== false
        ? await engines.parallelMatcher.executeParallelSearch(searchTasks)
        : await this.executeSequentialSearch(searchTasks, engines);

    // 聚合結果
    const result = await engines.resultAggregator.aggregateResults(
      taskResults,
      keywordRequest,
      parsedQuery
    );

    return {
      ...result,
      strategy: "keyword_hybrid_component",
    };
  }

  /**
   * 執行向量搜索
   */
  private async executeVectorSearch(request: KeywordSearchRequest, searchId: string): Promise<any> {
    // 模擬向量搜索調用
    // 實際實現中，這裡會調用向量搜索引擎

    const vectorSearchTime = Math.random() * 2000 + 500; // 0.5-2.5秒
    await new Promise((resolve) => setTimeout(resolve, vectorSearchTime));

    // 生成模擬向量搜索結果
    const mockResults = this.generateMockVectorResults(request.query);

    return {
      documents: mockResults,
      totalFound: mockResults.length,
      searchTime: vectorSearchTime,
      strategy: "vector_similarity",
      metadata: {
        searchTime: vectorSearchTime,
        vectorSearchMetadata: {
          embeddingModel: "text-embedding-ada-002",
          similarityThreshold: 0.7,
          documentsScanned: mockResults.length * 5,
        },
      },
    };
  }

  /**
   * 生成模擬向量搜索結果
   */
  private generateMockVectorResults(query: string): any[] {
    const resultCount = Math.floor(Math.random() * 15) + 5;
    const results = [];

    for (let i = 0; i < resultCount; i++) {
      results.push({
        id: `vector_doc_${i}_${Date.now()}`,
        content: `Vector-based content related to "${query}" - document ${i}`,
        title: `Vector Match ${i}: ${query}`,
        path: `/vector/search/result_${i}.md`,
        score: Math.random() * 0.6 + 0.4, // 0.4-1.0
        highlights: [
          {
            field: "content",
            start: 0,
            end: 20,
            text: `Vector-based content`,
            score: 0.8,
          },
        ],
        metadata: {
          size: Math.floor(Math.random() * 8000) + 2000,
          mtime: Date.now() - Math.random() * 86400000 * 7, // 最近7天
          ctime: Date.now() - Math.random() * 86400000 * 30,
          extension: "md",
          tags: [`vector_tag_${i}`, "semantic"],
          language: "en",
          wordCount: Math.floor(Math.random() * 3000) + 500,
          vectorSimilarity: Math.random() * 0.3 + 0.7,
        },
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 融合搜索結果
   */
  private async fuseResults(
    keywordResult: KeywordSearchResult,
    vectorResult: any,
    searchId: string
  ): Promise<KeywordSearchResult> {
    // 根據配置的融合算法融合結果
    const fusedDocuments = await this.applyFusionAlgorithm(
      keywordResult.documents,
      vectorResult.documents
    );

    // 重新排序和去重
    const finalDocuments = this.postProcessFusedResults(fusedDocuments);

    // 計算融合後的元數據
    const fusedMetadata = this.calculateFusedMetadata(keywordResult, vectorResult);

    return {
      documents: finalDocuments,
      totalFound: finalDocuments.length,
      searchTime: Math.max(keywordResult.searchTime, vectorResult.searchTime),
      strategy: `hybrid_${this.config.fusionAlgorithm}`,
      metadata: fusedMetadata,
    };
  }

  /**
   * 應用融合算法
   */
  private async applyFusionAlgorithm(keywordDocs: any[], vectorDocs: any[]): Promise<any[]> {
    switch (this.config.fusionAlgorithm) {
      case "linear":
        return this.linearFusion(keywordDocs, vectorDocs);

      case "rank":
        return this.rankFusion(keywordDocs, vectorDocs);

      case "reciprocal":
        return this.reciprocalRankFusion(keywordDocs, vectorDocs);

      case "custom":
        return this.customFusion(keywordDocs, vectorDocs);

      default:
        return this.linearFusion(keywordDocs, vectorDocs);
    }
  }

  /**
   * 線性融合
   */
  private linearFusion(keywordDocs: any[], vectorDocs: any[]): any[] {
    const documentMap = new Map<string, any>();

    // 處理關鍵字搜索結果
    keywordDocs.forEach((doc) => {
      const fusedDoc = {
        ...doc,
        fusedScore: doc.score * this.config.keywordWeight,
        sources: ["keyword"],
      };
      documentMap.set(this.getDocumentKey(doc), fusedDoc);
    });

    // 處理向量搜索結果
    vectorDocs.forEach((doc) => {
      const key = this.getDocumentKey(doc);
      const existing = documentMap.get(key);

      if (existing) {
        // 合併分數
        existing.fusedScore += doc.score * this.config.vectorWeight;
        existing.sources.push("vector");
        existing.vectorScore = doc.score;
      } else {
        const fusedDoc = {
          ...doc,
          fusedScore: doc.score * this.config.vectorWeight,
          sources: ["vector"],
          vectorScore: doc.score,
        };
        documentMap.set(key, fusedDoc);
      }
    });

    // 轉換為數組並排序
    return Array.from(documentMap.values()).sort((a, b) => b.fusedScore - a.fusedScore);
  }

  /**
   * 排名融合
   */
  private rankFusion(keywordDocs: any[], vectorDocs: any[]): any[] {
    const documentMap = new Map<string, any>();

    // 為關鍵字搜索結果分配排名分數
    keywordDocs.forEach((doc, index) => {
      const rankScore = 1.0 / (index + 1); // 排名越高分數越高
      const fusedDoc = {
        ...doc,
        fusedScore: rankScore * this.config.keywordWeight,
        keywordRank: index + 1,
        sources: ["keyword"],
      };
      documentMap.set(this.getDocumentKey(doc), fusedDoc);
    });

    // 為向量搜索結果分配排名分數
    vectorDocs.forEach((doc, index) => {
      const key = this.getDocumentKey(doc);
      const rankScore = 1.0 / (index + 1);
      const existing = documentMap.get(key);

      if (existing) {
        existing.fusedScore += rankScore * this.config.vectorWeight;
        existing.sources.push("vector");
        existing.vectorRank = index + 1;
      } else {
        const fusedDoc = {
          ...doc,
          fusedScore: rankScore * this.config.vectorWeight,
          vectorRank: index + 1,
          sources: ["vector"],
        };
        documentMap.set(key, fusedDoc);
      }
    });

    return Array.from(documentMap.values()).sort((a, b) => b.fusedScore - a.fusedScore);
  }

  /**
   * 倒數排名融合
   */
  private reciprocalRankFusion(keywordDocs: any[], vectorDocs: any[]): any[] {
    const k = 60; // RRF 常數
    const documentMap = new Map<string, any>();

    // 處理關鍵字搜索結果
    keywordDocs.forEach((doc, index) => {
      const rrfScore = 1.0 / (k + index + 1);
      const fusedDoc = {
        ...doc,
        fusedScore: rrfScore * this.config.keywordWeight,
        keywordRank: index + 1,
        sources: ["keyword"],
      };
      documentMap.set(this.getDocumentKey(doc), fusedDoc);
    });

    // 處理向量搜索結果
    vectorDocs.forEach((doc, index) => {
      const key = this.getDocumentKey(doc);
      const rrfScore = 1.0 / (k + index + 1);
      const existing = documentMap.get(key);

      if (existing) {
        existing.fusedScore += rrfScore * this.config.vectorWeight;
        existing.sources.push("vector");
        existing.vectorRank = index + 1;
      } else {
        const fusedDoc = {
          ...doc,
          fusedScore: rrfScore * this.config.vectorWeight,
          vectorRank: index + 1,
          sources: ["vector"],
        };
        documentMap.set(key, fusedDoc);
      }
    });

    return Array.from(documentMap.values()).sort((a, b) => b.fusedScore - a.fusedScore);
  }

  /**
   * 自定義融合
   */
  private customFusion(keywordDocs: any[], vectorDocs: any[]): any[] {
    // 實現自定義融合邏輯
    // 這裡可以根據具體需求實現更複雜的融合算法
    return this.linearFusion(keywordDocs, vectorDocs);
  }

  /**
   * 獲取文檔鍵
   */
  private getDocumentKey(doc: any): string {
    // 使用多種方式生成文檔唯一鍵
    if (doc.id) return doc.id;
    if (doc.path) return doc.path;
    if (doc.title && doc.metadata?.size) {
      return `${doc.title}:${doc.metadata.size}`;
    }
    return `fallback:${JSON.stringify(doc).substring(0, 100)}`;
  }

  /**
   * 後處理融合結果
   */
  private postProcessFusedResults(documents: any[]): any[] {
    // 更新最終分數
    const processedDocs = documents.map((doc) => ({
      ...doc,
      score: doc.fusedScore, // 使用融合分數作為最終分數
    }));

    // 應用結果交替排列（如果啟用）
    if (this.config.enableResultInterleaving) {
      return this.interleaveResults(processedDocs);
    }

    return processedDocs;
  }

  /**
   * 結果交替排列
   */
  private interleaveResults(documents: any[]): any[] {
    const keywordOnly = documents.filter(
      (doc) => doc.sources.includes("keyword") && !doc.sources.includes("vector")
    );
    const vectorOnly = documents.filter(
      (doc) => doc.sources.includes("vector") && !doc.sources.includes("keyword")
    );
    const hybrid = documents.filter(
      (doc) => doc.sources.includes("keyword") && doc.sources.includes("vector")
    );

    // 優先顯示混合結果，然後交替顯示純關鍵字和純向量結果
    const interleaved = [...hybrid];
    const maxLength = Math.max(keywordOnly.length, vectorOnly.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < keywordOnly.length) interleaved.push(keywordOnly[i]);
      if (i < vectorOnly.length) interleaved.push(vectorOnly[i]);
    }

    return interleaved;
  }

  /**
   * 計算融合後的元數據
   */
  private calculateFusedMetadata(keywordResult: KeywordSearchResult, vectorResult: any): any {
    return {
      ...keywordResult.metadata,
      hybridSearchMetadata: {
        keywordWeight: this.config.keywordWeight,
        vectorWeight: this.config.vectorWeight,
        fusionAlgorithm: this.config.fusionAlgorithm,
        keywordResultCount: keywordResult.documents.length,
        vectorResultCount: vectorResult.documents.length,
        keywordSearchTime: keywordResult.searchTime,
        vectorSearchTime: vectorResult.searchTime,
        fusionMode: this.config.defaultMode,
      },
    };
  }

  /**
   * 其他輔助方法
   */
  private async prepareKeywordSearchTasks(
    request: any,
    parsedQuery: any,
    searchId: string,
    engines: any
  ): Promise<any[]> {
    // 簡化實現，實際中應該調用引擎的方法
    return [];
  }

  private async executeSequentialSearch(tasks: any[], engines: any): Promise<any[]> {
    // 簡化實現
    return [];
  }

  private isResultSufficient(result: any): boolean {
    // 簡單的充分性檢查
    return (
      result.documents.length >= 10 &&
      result.documents.filter((doc: any) => doc.score > 0.7).length >= 3
    );
  }

  private enhanceWithHybridMetadata(
    result: KeywordSearchResult,
    strategy: string
  ): KeywordSearchResult {
    return {
      ...result,
      strategy: `hybrid_${strategy}`,
      metadata: {
        ...result.metadata,
        hybridSearchMetadata: {
          mode: strategy,
          fallbackUsed: false,
        },
      } as any,
    };
  }

  private convertVectorToKeywordResult(vectorResult: any, strategy: string): KeywordSearchResult {
    return {
      documents: vectorResult.documents,
      totalFound: vectorResult.totalFound,
      searchTime: vectorResult.searchTime,
      strategy: `hybrid_${strategy}`,
      metadata: {
        totalProcessingTime: vectorResult.searchTime,
        queryParsingTime: 0,
        indexSearchTime: vectorResult.searchTime,
        resultAggregationTime: 0,
        cacheHit: false,
        parallelTasksUsed: 0,
        indexesSearched: ["vector_index"],
        qualityMetrics: {
          precision: 0.8,
          recall: 0.7,
          relevanceScore: 0.75,
          diversityScore: 0.6,
          coverageScore: 0.7,
        },
        hybridSearchMetadata: {
          mode: strategy,
          vectorOnly: true,
        },
      } as any,
    };
  }

  private determineAdaptiveStrategy(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery
  ): string {
    // 基於查詢特徵決定策略
    const queryLength = request.query.length;
    const hasComplexStructure = parsedQuery.structure.complexity > 3;
    const hasPhrases = parsedQuery.phrases.length > 0;

    // 短查詢傾向於向量搜索
    if (queryLength < 20 && !hasComplexStructure) {
      return "vector_only";
    }

    // 複雜查詢結構傾向於關鍵字搜索
    if (hasComplexStructure || hasPhrases) {
      return "keyword_only";
    }

    // 中等複雜度使用混合搜索
    return "hybrid";
  }

  /**
   * 關閉混合搜索協調器
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }
}
