/**
 * 並行關鍵字搜索引擎 - 主協調器
 */

import {
  KeywordSearchRequest,
  KeywordSearchResult,
  KeywordSearchConfig,
  KeywordSearchMetrics,
  KeywordSearchError,
  QueryStrategy,
  IndexStrategy,
  ParallelSearchTask,
  TaskStatus,
  ParsedQuery,
} from "./types";
import { ParallelTextMatcher } from "./parallel/ParallelTextMatcher";
import { TextIndexManager } from "./indexing/TextIndexManager";
import { QueryParser } from "./query/QueryParser";
import { KeywordResultAggregator } from "./parallel/KeywordResultAggregator";
import { KeywordPerformanceMonitor } from "./monitoring/KeywordPerformanceMonitor";
import { HybridSearchCoordinator } from "./hybrid/HybridSearchCoordinator";

export class KeywordSearchEngine {
  private config: KeywordSearchConfig;
  private parallelMatcher: ParallelTextMatcher;
  private indexManager: TextIndexManager;
  private queryParser: QueryParser;
  private resultAggregator: KeywordResultAggregator;
  private performanceMonitor: KeywordPerformanceMonitor;
  private hybridCoordinator: HybridSearchCoordinator;
  private isInitialized = false;
  private searchCounter = 0;

  constructor(config: KeywordSearchConfig) {
    this.config = config;
    this.parallelMatcher = new ParallelTextMatcher(config.parallel);
    this.indexManager = new TextIndexManager(config.indexing);
    this.queryParser = new QueryParser(config.query);
    this.resultAggregator = new KeywordResultAggregator();
    this.performanceMonitor = new KeywordPerformanceMonitor(config.monitoring);
    this.hybridCoordinator = new HybridSearchCoordinator(config.hybrid);
  }

  /**
   * 初始化搜索引擎
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 並行初始化各組件
      await Promise.all([
        this.parallelMatcher.initialize(),
        this.indexManager.initialize(),
        this.queryParser.initialize(),
        this.resultAggregator.initialize(),
        this.performanceMonitor.initialize(),
        this.hybridCoordinator.initialize(),
      ]);

      this.isInitialized = true;
      this.performanceMonitor.recordEvent("engine_initialized", {
        timestamp: Date.now(),
        config: this.getConfigSummary(),
      });
    } catch (error) {
      throw new KeywordSearchError(
        "Failed to initialize keyword search engine",
        "INITIALIZATION_ERROR",
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 執行關鍵字搜索
   */
  async search(request: KeywordSearchRequest): Promise<KeywordSearchResult> {
    if (!this.isInitialized) {
      throw new KeywordSearchError("Search engine not initialized", "NOT_INITIALIZED_ERROR");
    }

    const searchId = `search_${++this.searchCounter}_${Date.now()}`;
    const startTime = Date.now();

    try {
      // 記錄搜索開始
      this.performanceMonitor.recordSearchStart(searchId, request);

      // 階段 1: 查詢解析和預處理
      const parsedQuery = await this.parseAndPreprocessQuery(request, searchId);

      // 階段 2: 決定搜索策略
      const searchStrategy = await this.determineSearchStrategy(request, parsedQuery);

      // 階段 3: 執行搜索
      let searchResult: KeywordSearchResult;

      if (request.options?.hybridMode !== undefined) {
        // 混合搜索模式
        searchResult = await this.executeHybridSearch(request, parsedQuery, searchId);
      } else {
        // 純關鍵字搜索模式
        searchResult = await this.executeKeywordSearch(
          request,
          parsedQuery,
          searchStrategy,
          searchId
        );
      }

      // 階段 4: 結果後處理
      const finalResult = await this.postProcessResults(searchResult, request, searchId);

      // 記錄搜索完成
      const totalTime = Date.now() - startTime;
      this.performanceMonitor.recordSearchCompletion(searchId, finalResult, totalTime);

      return finalResult;
    } catch (error) {
      // 記錄搜索失敗
      const totalTime = Date.now() - startTime;
      this.performanceMonitor.recordSearchError(searchId, error, totalTime);

      if (error instanceof KeywordSearchError) {
        throw error;
      }

      throw new KeywordSearchError("Search execution failed", "SEARCH_EXECUTION_ERROR", {
        searchId,
        request: this.sanitizeRequest(request),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 解析和預處理查詢
   */
  private async parseAndPreprocessQuery(
    request: KeywordSearchRequest,
    searchId: string
  ): Promise<ParsedQuery> {
    const startTime = Date.now();

    try {
      // 解析查詢語法
      const parsedQuery = await this.queryParser.parse(request.query, {
        enableExpansion: request.options?.enableQueryExpansion ?? true,
        enableSpellCorrection: true,
        context: request.context,
      });

      // 記錄查詢解析時間
      const parseTime = Date.now() - startTime;
      this.performanceMonitor.recordQueryParseTime(searchId, parseTime);

      return parsedQuery;
    } catch (error) {
      throw new KeywordSearchError("Query parsing failed", "QUERY_PARSE_ERROR", {
        query: request.query,
        searchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 決定搜索策略
   */
  private async determineSearchStrategy(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery
  ): Promise<{ query: QueryStrategy; index: IndexStrategy }> {
    // 基於查詢複雜度和配置決定策略
    let queryStrategy = request.options?.queryStrategy ?? this.config.query.defaultStrategy;
    let indexStrategy = request.options?.indexStrategy ?? this.config.indexing.defaultStrategy;

    // 根據查詢結構調整策略
    if (parsedQuery.structure.type === "boolean" && parsedQuery.structure.complexity > 3) {
      queryStrategy = QueryStrategy.BOOLEAN_LOGIC;
    } else if (parsedQuery.phrases.length > 0) {
      queryStrategy = QueryStrategy.PHRASE_SEARCH;
    } else if (parsedQuery.structure.hasWildcards || parsedQuery.structure.hasRegexp) {
      queryStrategy = QueryStrategy.WILDCARD;
    }

    // 根據文檔數量調整索引策略
    const documentCount = await this.indexManager.getDocumentCount();
    if (documentCount > 100000 && indexStrategy === IndexStrategy.INVERTED_INDEX) {
      indexStrategy = IndexStrategy.HYBRID;
    }

    return { query: queryStrategy, index: indexStrategy };
  }

  /**
   * 執行關鍵字搜索
   */
  private async executeKeywordSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    strategy: { query: QueryStrategy; index: IndexStrategy },
    searchId: string
  ): Promise<KeywordSearchResult> {
    const startTime = Date.now();

    try {
      // 準備並行搜索任務
      const searchTasks = await this.prepareSearchTasks(request, parsedQuery, strategy, searchId);

      // 執行並行搜索
      const taskResults =
        request.options?.enableParallel !== false
          ? await this.parallelMatcher.executeParallelSearch(searchTasks)
          : await this.executeSequentialSearch(searchTasks);

      // 聚合結果
      const aggregatedResult = await this.resultAggregator.aggregateResults(
        taskResults,
        request,
        parsedQuery
      );

      // 構建最終結果
      const searchTime = Date.now() - startTime;
      return {
        ...aggregatedResult,
        searchTime,
        strategy: `keyword_${strategy.query}_${strategy.index}`,
        metadata: {
          ...aggregatedResult.metadata,
          totalProcessingTime: searchTime,
          indexSearchTime: searchTime,
          parallelTasksUsed: taskResults.length,
          indexesSearched: searchTasks.map((task) => task.index),
        },
      };
    } catch (error) {
      throw new KeywordSearchError("Keyword search execution failed", "KEYWORD_SEARCH_ERROR", {
        searchId,
        strategy,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 執行混合搜索
   */
  private async executeHybridSearch(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    searchId: string
  ): Promise<KeywordSearchResult> {
    return await this.hybridCoordinator.executeHybridSearch(request, parsedQuery, searchId, {
      keywordEngine: this,
      parallelMatcher: this.parallelMatcher,
      indexManager: this.indexManager,
      resultAggregator: this.resultAggregator,
    });
  }

  /**
   * 準備搜索任務
   */
  private async prepareSearchTasks(
    request: KeywordSearchRequest,
    parsedQuery: ParsedQuery,
    strategy: { query: QueryStrategy; index: IndexStrategy },
    searchId: string
  ): Promise<ParallelSearchTask[]> {
    const tasks: ParallelSearchTask[] = [];
    const availableIndexes = await this.indexManager.getAvailableIndexes();

    // 為每個可用索引創建搜索任務
    for (const indexName of availableIndexes) {
      const task: ParallelSearchTask = {
        id: `${searchId}_${indexName}_${Date.now()}`,
        query: parsedQuery,
        index: indexName,
        priority: this.calculateTaskPriority(indexName, parsedQuery),
        timeout: request.options?.timeout ?? this.config.parallel.taskTimeout,
        retries: this.config.parallel.retryAttempts,
        startTime: Date.now(),
        status: TaskStatus.PENDING,
      };

      tasks.push(task);
    }

    // 根據優先級排序
    tasks.sort((a, b) => b.priority - a.priority);

    return tasks;
  }

  /**
   * 計算任務優先級
   */
  private calculateTaskPriority(indexName: string, parsedQuery: ParsedQuery): number {
    let priority = 50; // 基礎優先級

    // 根據索引大小調整
    const indexStats = this.indexManager.getIndexStatistics(indexName);
    if (indexStats) {
      if (indexStats.documentCount < 1000) {
        priority += 20; // 小索引優先
      } else if (indexStats.documentCount > 10000) {
        priority -= 10; // 大索引降低優先級
      }
    }

    // 根據查詢複雜度調整
    if (parsedQuery.structure.complexity > 5) {
      priority -= 15; // 複雜查詢降低優先級
    }

    // 根據歷史性能調整
    const performanceStats = this.performanceMonitor.getIndexPerformanceStats(indexName);
    if (performanceStats) {
      if (performanceStats.averageLatency < 1000) {
        priority += 10; // 快速索引優先
      } else if (performanceStats.averageLatency > 5000) {
        priority -= 20; // 慢索引降低優先級
      }
    }

    return Math.max(1, Math.min(100, priority));
  }

  /**
   * 執行順序搜索
   */
  private async executeSequentialSearch(tasks: ParallelSearchTask[]): Promise<any[]> {
    const results = [];

    for (const task of tasks) {
      try {
        task.status = TaskStatus.RUNNING;
        const result = await this.indexManager.searchIndex(task.index, task.query);
        task.status = TaskStatus.COMPLETED;
        results.push({
          taskId: task.id,
          results: result.documents,
          metadata: {
            searchTime: Date.now() - task.startTime,
            indexName: task.index,
            documentsScanned: result.totalFound,
            termsMatched: task.query.terms.length,
          },
        });
      } catch (error) {
        task.status = TaskStatus.FAILED;
        console.error(`Sequential search task ${task.id} failed:`, error);
      }
    }

    return results;
  }

  /**
   * 結果後處理
   */
  private async postProcessResults(
    result: KeywordSearchResult,
    request: KeywordSearchRequest,
    searchId: string
  ): Promise<KeywordSearchResult> {
    // 應用額外的過濾和排序
    let processedDocuments = result.documents;

    // 最小相似度過濾
    if (request.options?.minSimilarityScore) {
      processedDocuments = processedDocuments.filter(
        (doc) => doc.score >= request.options!.minSimilarityScore!
      );
    }

    // 結果數量限制
    const maxResults = request.options?.maxResults ?? 50;
    if (processedDocuments.length > maxResults) {
      processedDocuments = processedDocuments.slice(0, maxResults);
    }

    // 更新質量指標
    const qualityMetrics = await this.calculateQualityMetrics(
      processedDocuments,
      request,
      searchId
    );

    return {
      ...result,
      documents: processedDocuments,
      totalFound: processedDocuments.length,
      metadata: {
        ...result.metadata,
        qualityMetrics,
      },
    };
  }

  /**
   * 計算搜索質量指標
   */
  private async calculateQualityMetrics(
    documents: any[],
    request: KeywordSearchRequest,
    searchId: string
  ): Promise<any> {
    // 基礎質量指標計算
    const totalDocs = documents.length;
    const avgScore =
      totalDocs > 0 ? documents.reduce((sum, doc) => sum + doc.score, 0) / totalDocs : 0;

    // 多樣性分數計算
    const diversityScore = this.calculateDiversityScore(documents);

    // 覆蓋率分數計算
    const coverageScore = this.calculateCoverageScore(documents, request);

    return {
      precision: avgScore,
      recall: Math.min(1.0, totalDocs / 100), // 假設理想結果為100個
      relevanceScore: avgScore,
      diversityScore,
      coverageScore,
    };
  }

  /**
   * 計算多樣性分數
   */
  private calculateDiversityScore(documents: any[]): number {
    if (documents.length <= 1) return 1.0;

    // 基於文檔類型和路徑的多樣性計算
    const extensions = new Set(documents.map((doc) => doc.metadata.extension));
    const paths = new Set(documents.map((doc) => doc.path.split("/")[0]));

    const extensionDiversity = extensions.size / Math.min(5, documents.length);
    const pathDiversity = paths.size / Math.min(10, documents.length);

    return (extensionDiversity + pathDiversity) / 2;
  }

  /**
   * 計算覆蓋率分數
   */
  private calculateCoverageScore(documents: any[], request: KeywordSearchRequest): number {
    // 簡化的覆蓋率計算 - 基於查詢詞在結果中的覆蓋情況
    const queryTerms = request.query.toLowerCase().split(/\s+/);
    const coveredTerms = new Set<string>();

    documents.forEach((doc) => {
      const content = (doc.content + " " + doc.title).toLowerCase();
      queryTerms.forEach((term) => {
        if (content.includes(term)) {
          coveredTerms.add(term);
        }
      });
    });

    return queryTerms.length > 0 ? coveredTerms.size / queryTerms.length : 1.0;
  }

  /**
   * 獲取配置摘要
   */
  private getConfigSummary(): Record<string, any> {
    return {
      parallelEnabled: this.config.parallel.maxConcurrentTasks > 1,
      indexingStrategy: this.config.indexing.defaultStrategy,
      queryStrategy: this.config.query.defaultStrategy,
      hybridMode: this.config.hybrid.defaultMode,
      monitoringEnabled: this.config.monitoring.enableMetrics,
    };
  }

  /**
   * 清理請求敏感信息
   */
  private sanitizeRequest(request: KeywordSearchRequest): Record<string, any> {
    return {
      query: request.query,
      options: request.options,
      contextType: request.context ? "provided" : "none",
    };
  }

  /**
   * 獲取性能指標
   */
  async getMetrics(): Promise<KeywordSearchMetrics> {
    return await this.performanceMonitor.getMetrics();
  }

  /**
   * 獲取索引統計
   */
  async getIndexStatistics(): Promise<Record<string, any>> {
    return await this.indexManager.getAllIndexStatistics();
  }

  /**
   * 重建索引
   */
  async rebuildIndexes(): Promise<void> {
    await this.indexManager.rebuildAllIndexes();
  }

  /**
   * 優化索引
   */
  async optimizeIndexes(): Promise<void> {
    await this.indexManager.optimizeAllIndexes();
  }

  /**
   * 關閉搜索引擎
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await Promise.all([
        this.parallelMatcher.shutdown(),
        this.indexManager.shutdown(),
        this.queryParser.shutdown(),
        this.resultAggregator.shutdown(),
        this.performanceMonitor.shutdown(),
        this.hybridCoordinator.shutdown(),
      ]);

      this.isInitialized = false;
    } catch (error) {
      console.error("Error during keyword search engine shutdown:", error);
    }
  }
}
