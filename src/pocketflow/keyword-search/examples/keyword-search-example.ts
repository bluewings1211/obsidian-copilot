/**
 * 關鍵字搜索系統使用示例
 */

import {
  createKeywordSearchEngine,
  getHighPerformanceConfig,
  getMemoryOptimizedConfig,
  getDevelopmentConfig,
  KeywordSearchRequest,
  QueryStrategy,
  IndexStrategy,
  HybridSearchMode,
} from "../index";

/**
 * 基本使用示例
 */
async function basicUsageExample() {
  console.log("=== 基本使用示例 ===");

  // 創建關鍵字搜索引擎
  const searchEngine = createKeywordSearchEngine();

  try {
    // 初始化引擎
    await searchEngine.initialize();
    console.log("搜索引擎初始化完成");

    // 執行基本搜索
    const searchRequest: KeywordSearchRequest = {
      query: "machine learning algorithms",
      options: {
        maxResults: 20,
        enableParallel: true,
        enableCaching: true,
        timeout: 5000,
      },
    };

    const results = await searchEngine.search(searchRequest);

    console.log(`找到 ${results.totalFound} 個結果`);
    console.log(`搜索耗時: ${results.searchTime}ms`);
    console.log(`使用策略: ${results.strategy}`);

    // 顯示前3個結果
    results.documents.slice(0, 3).forEach((doc: any, index: number) => {
      console.log(`結果 ${index + 1}:`);
      console.log(`  標題: ${doc.title}`);
      console.log(`  分數: ${doc.score.toFixed(3)}`);
      console.log(`  路徑: ${doc.path}`);
      console.log("");
    });
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 高性能配置示例
 */
async function highPerformanceExample() {
  console.log("=== 高性能配置示例 ===");

  // 使用高性能配置
  const searchEngine = createKeywordSearchEngine(getHighPerformanceConfig());

  try {
    await searchEngine.initialize();
    console.log("高性能搜索引擎初始化完成");

    // 複雜查詢示例
    const complexRequest: KeywordSearchRequest = {
      query: 'neural networks AND "deep learning" OR transformer',
      options: {
        maxResults: 50,
        enableParallel: true,
        enableCaching: true,
        enableQueryExpansion: true,
        enableSemanticAnalysis: true,
        queryStrategy: QueryStrategy.BOOLEAN_LOGIC,
        indexStrategy: IndexStrategy.HYBRID,
        timeout: 10000,
      },
      context: {
        userId: "user_123",
        domain: "artificial_intelligence",
        documentTypes: ["pdf", "md", "txt"],
        previousQueries: ["machine learning", "neural networks"],
        userPreferences: {
          documentTypes: { pdf: 0.8, md: 0.6, txt: 0.4 },
          topics: { ai: 0.9, ml: 0.8, dl: 0.7 },
        },
      },
    };

    const results = await searchEngine.search(complexRequest);

    console.log(`高性能搜索結果: ${results.totalFound} 個文檔`);
    console.log(`搜索耗時: ${results.searchTime}ms`);
    console.log(`並行任務數: ${results.metadata.parallelTasksUsed}`);
    console.log(`搜索的索引: ${results.metadata.indexesSearched.join(", ")}`);
    console.log(`緩存命中: ${results.metadata.cacheHit ? "是" : "否"}`);

    // 顯示質量指標
    const metrics = results.metadata.qualityMetrics;
    console.log("搜索質量指標:");
    console.log(`  精確度: ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`  召回率: ${(metrics.recall * 100).toFixed(1)}%`);
    console.log(`  相關性: ${(metrics.relevanceScore * 100).toFixed(1)}%`);
    console.log(`  多樣性: ${(metrics.diversityScore * 100).toFixed(1)}%`);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 混合搜索示例
 */
async function hybridSearchExample() {
  console.log("=== 混合搜索示例 ===");

  const searchEngine = createKeywordSearchEngine({
    hybrid: {
      defaultMode: HybridSearchMode.PARALLEL,
      keywordWeight: 0.7,
      vectorWeight: 0.3,
      adaptiveThreshold: 0.8,
      fusionAlgorithm: "reciprocal",
      enableResultInterleaving: true,
      enableContextualReranking: true,
    },
  });

  try {
    await searchEngine.initialize();
    console.log("混合搜索引擎初始化完成");

    // 混合搜索請求
    const hybridRequest: KeywordSearchRequest = {
      query: "explain transformer architecture",
      options: {
        maxResults: 30,
        hybridMode: HybridSearchMode.PARALLEL,
        enableSemanticAnalysis: true,
        minSimilarityScore: 0.3,
      },
      context: {
        domain: "deep_learning",
        previousQueries: ["attention mechanism", "neural networks"],
      },
    };

    const results = await searchEngine.search(hybridRequest);

    console.log(`混合搜索結果: ${results.totalFound} 個文檔`);
    console.log(`搜索策略: ${results.strategy}`);

    // 分析結果來源
    const keywordOnly = results.documents.filter(
      (doc: any) => doc.metadata.sourceIndex && !doc.metadata.vectorSimilarity
    ).length;
    const vectorOnly = results.documents.filter(
      (doc: any) => doc.metadata.vectorSimilarity && !doc.metadata.sourceIndex
    ).length;
    const hybrid = results.documents.length - keywordOnly - vectorOnly;

    console.log("結果來源分佈:");
    console.log(`  純關鍵字: ${keywordOnly} 個`);
    console.log(`  純向量: ${vectorOnly} 個`);
    console.log(`  混合: ${hybrid} 個`);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 高級查詢語法示例
 */
async function advancedQueryExample() {
  console.log("=== 高級查詢語法示例 ===");

  const searchEngine = createKeywordSearchEngine({
    query: {
      defaultStrategy: QueryStrategy.BOOLEAN_LOGIC,
      enableQueryExpansion: true,
      enableSpellCorrection: true,
      enableSynonymExpansion: true,
      enableHighlighting: true,
      maxQueryTerms: 20,
      maxQueryLength: 500,
      defaultOperator: "AND",
      highlightFragmentSize: 150,
      highlightMaxFragments: 3,
    },
  });

  try {
    await searchEngine.initialize();

    // 測試各種查詢語法
    const queries = [
      // 布爾查詢
      'machine AND learning NOT "supervised learning"',

      // 短語查詢
      '"natural language processing" AND "transformer model"',

      // 字段查詢
      'title:"deep learning" AND tags:ai',

      // 模糊查詢
      "algoritm~0.8 AND machne~0.7",

      // 權重提升
      "neural^2.0 networks^1.5 AND learning",

      // 範圍查詢
      "date:[2020-01-01 TO 2023-12-31] AND machine learning",

      // 鄰近查詢
      "neural NEAR/3 networks",
    ];

    for (const query of queries) {
      console.log(`\n查詢: ${query}`);

      const request: KeywordSearchRequest = {
        query,
        options: {
          maxResults: 5,
          enableParallel: true,
          queryStrategy: QueryStrategy.BOOLEAN_LOGIC,
        },
      };

      try {
        const results = await searchEngine.search(request);
        console.log(`  結果數: ${results.totalFound}`);
        console.log(`  耗時: ${results.searchTime}ms`);

        if (results.documents.length > 0) {
          const topResult = results.documents[0];
          console.log(`  最佳匹配: ${topResult.title} (分數: ${topResult.score.toFixed(3)})`);
        }
      } catch (error) {
        console.log(`  查詢錯誤: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 性能監控示例
 */
async function performanceMonitoringExample() {
  console.log("=== 性能監控示例 ===");

  const searchEngine = createKeywordSearchEngine({
    monitoring: {
      enableMetrics: true,
      enablePerformanceTracing: true,
      enableQueryLogging: true,
      sampleRate: 1.0,
      metricsRetentionDays: 7,
      alertThresholds: {
        maxLatency: 5000,
        minSuccessRate: 0.95,
        maxErrorRate: 0.05,
        maxMemoryUsage: 500000000, // 500MB
        maxCpuUsage: 0.8,
      },
    },
  });

  try {
    await searchEngine.initialize();

    // 訂閱性能警報
    // searchEngine.subscribeToAlerts((alert) => {
    //   console.log(`🚨 性能警報: ${alert.type} - ${alert.message}`);
    // });

    // 執行多個搜索請求來生成指標
    const testQueries = [
      "machine learning",
      "deep learning neural networks",
      "natural language processing",
      "computer vision algorithms",
      "reinforcement learning",
    ];

    console.log("執行測試查詢...");
    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i];
      console.log(`執行查詢 ${i + 1}/${testQueries.length}: ${query}`);

      await searchEngine.search({
        query,
        options: { maxResults: 10 },
      });

      // 添加一些延遲
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 獲取性能指標
    const metrics = await searchEngine.getMetrics();

    console.log("\n性能指標:");
    console.log(`總搜索請求: ${metrics.searchRequests}`);
    console.log(`成功搜索: ${metrics.successfulSearches}`);
    console.log(`失敗搜索: ${metrics.failedSearches}`);
    console.log(`平均延遲: ${Math.round(metrics.averageLatency)}ms`);
    console.log(`P95延遲: ${Math.round(metrics.p95Latency)}ms`);
    console.log(`P99延遲: ${Math.round(metrics.p99Latency)}ms`);
    console.log(`緩存命中率: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);

    // 獲取索引統計
    const indexStats = await searchEngine.getIndexStatistics();
    console.log("\n索引統計:");
    Object.entries(indexStats).forEach(([indexName, stats]) => {
      console.log(`  ${indexName}: ${(stats as any).documentCount} 個文檔`);
    });
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 內存優化示例
 */
async function memoryOptimizedExample() {
  console.log("=== 內存優化示例 ===");

  const searchEngine = createKeywordSearchEngine(getMemoryOptimizedConfig());

  try {
    await searchEngine.initialize();
    console.log("內存優化搜索引擎初始化完成");

    // 小批量搜索
    const request: KeywordSearchRequest = {
      query: "machine learning optimization",
      options: {
        maxResults: 10, // 較小的結果集
        enableParallel: false, // 禁用並行以節省內存
        enableCaching: true, // 啟用緩存以減少重複計算
        timeout: 3000,
      },
    };

    const results = await searchEngine.search(request);

    console.log(`內存優化搜索結果: ${results.totalFound} 個文檔`);
    console.log(`搜索耗時: ${results.searchTime}ms`);

    // 模擬內存使用情況檢查
    const memoryUsage = process.memoryUsage();
    console.log("當前內存使用:");
    console.log(`  RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`);
    console.log(`  Heap Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Heap Total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 開發配置示例
 */
async function developmentConfigExample() {
  console.log("=== 開發配置示例 ===");

  const searchEngine = createKeywordSearchEngine(getDevelopmentConfig());

  try {
    await searchEngine.initialize();
    console.log("開發模式搜索引擎初始化完成");

    // 開發模式下的簡單搜索
    const request: KeywordSearchRequest = {
      query: "test search query",
      options: {
        maxResults: 5,
        enableParallel: false, // 開發模式下簡化並行處理
        enableCaching: false, // 開發模式下禁用緩存以便調試
        timeout: 10000, // 更長的超時時間便於調試
      },
    };

    const results = await searchEngine.search(request);

    console.log(`開發模式搜索結果: ${results.totalFound} 個文檔`);
    console.log(`搜索耗時: ${results.searchTime}ms`);
    console.log("開發模式適合調試和測試，提供詳細的日誌和較寬鬆的配置");
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 運行所有示例
 */
async function runAllExamples() {
  try {
    await basicUsageExample();
    console.log("\n" + "=".repeat(50) + "\n");

    await highPerformanceExample();
    console.log("\n" + "=".repeat(50) + "\n");

    await hybridSearchExample();
    console.log("\n" + "=".repeat(50) + "\n");

    await advancedQueryExample();
    console.log("\n" + "=".repeat(50) + "\n");

    await performanceMonitoringExample();
    console.log("\n" + "=".repeat(50) + "\n");

    await memoryOptimizedExample();
    console.log("\n" + "=".repeat(50) + "\n");

    await developmentConfigExample();

    console.log("\n所有示例執行完成！");
  } catch (error) {
    console.error("示例執行失敗:", error);
  }
}

// 導出示例函數
export {
  basicUsageExample,
  highPerformanceExample,
  hybridSearchExample,
  advancedQueryExample,
  performanceMonitoringExample,
  memoryOptimizedExample,
  developmentConfigExample,
  runAllExamples,
};

// 如果直接運行此文件，執行所有示例
if (require.main === module) {
  runAllExamples();
}
