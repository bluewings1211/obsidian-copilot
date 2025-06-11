/**
 * MapReduce 搜索系統使用示例
 */

import {
  createSearchMapReduceEngine,
  getDefaultConfig,
  getHighPerformanceConfig,
  SearchContext,
} from "../index";

/**
 * 基礎使用示例
 */
async function basicSearchExample(): Promise<void> {
  console.log("=== Basic MapReduce Search Example ===");

  // 創建搜索引擎
  const searchEngine = createSearchMapReduceEngine();

  try {
    // 初始化引擎
    await searchEngine.initialize();

    // 定義搜索上下文
    const searchContext: SearchContext = {
      query: "machine learning algorithms neural networks",
      salientTerms: ["machine learning", "neural networks", "algorithms"],
      filters: {
        maxResults: 20,
        minSimilarityScore: 0.3,
      },
      metadata: {
        userDomain: "ai_research",
        priority: "high",
      },
    };

    // 執行搜索
    console.log("Executing search...");
    const startTime = Date.now();

    const results = await searchEngine.search(searchContext);

    const executionTime = Date.now() - startTime;
    console.log(`Search completed in ${executionTime}ms`);

    // 顯示結果
    console.log(`Found ${results.totalResults} results`);
    console.log(`Strategies used: ${results.aggregationMetadata.strategies.join(", ")}`);
    console.log(`Normalized scores: ${results.aggregationMetadata.normalizedScores}`);
    console.log(`Deduplicated: ${results.aggregationMetadata.deduplicated}`);
    console.log(`Reranked: ${results.aggregationMetadata.reranked}`);

    // 顯示前5個結果
    results.documents.slice(0, 5).forEach((doc, index) => {
      console.log(`\n${index + 1}. ${doc.metadata.title || "Untitled"}`);
      console.log(`   Score: ${doc.metadata.score?.toFixed(3)}`);
      console.log(`   Path: ${doc.metadata.path}`);
      console.log(`   Preview: ${doc.pageContent.substring(0, 100)}...`);
    });

    // 顯示性能指標
    const performanceMetrics = searchEngine.getPerformanceMetrics();
    console.log("\n=== Performance Metrics ===");
    console.log(`Total execution time: ${performanceMetrics.totalExecutionTime}ms`);
    console.log(`Map phase time: ${performanceMetrics.mapPhaseTime}ms`);
    console.log(`Reduce phase time: ${performanceMetrics.reducePhaseTime}ms`);
    console.log(`Parallel tasks: ${performanceMetrics.parallelTasksCount}`);
    console.log(
      `Success rate: ${((performanceMetrics.successfulTasks / (performanceMetrics.successfulTasks + performanceMetrics.failedTasks)) * 100).toFixed(1)}%`
    );
  } catch (error) {
    console.error("Search failed:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 高性能搜索示例
 */
async function highPerformanceSearchExample(): Promise<void> {
  console.log("\n=== High Performance Search Example ===");

  // 使用高性能配置
  const config = getHighPerformanceConfig();
  const searchEngine = createSearchMapReduceEngine(config);

  try {
    await searchEngine.initialize();

    // 並行執行多個搜索
    const searchPromises = [
      {
        query: "JavaScript TypeScript programming",
        salientTerms: ["JavaScript", "TypeScript", "programming"],
      },
      {
        query: "React components hooks useState",
        salientTerms: ["React", "components", "hooks"],
      },
      {
        query: "Node.js Express API development",
        salientTerms: ["Node.js", "Express", "API"],
      },
    ].map(async (contextData, index) => {
      const context: SearchContext = {
        ...contextData,
        filters: { maxResults: 10 },
        metadata: { searchId: `batch_${index}` },
      };

      const startTime = Date.now();
      const results = await searchEngine.search(context);
      const executionTime = Date.now() - startTime;

      return {
        searchId: index,
        query: contextData.query,
        resultCount: results.totalResults,
        executionTime,
        strategies: results.aggregationMetadata.strategies,
      };
    });

    console.log("Executing parallel searches...");
    const batchResults = await Promise.all(searchPromises);

    console.log("\n=== Batch Results ===");
    batchResults.forEach((result) => {
      console.log(`Search ${result.searchId}: "${result.query}"`);
      console.log(`  Results: ${result.resultCount}, Time: ${result.executionTime}ms`);
      console.log(`  Strategies: ${result.strategies.join(", ")}`);
    });

    const totalTime = Math.max(...batchResults.map((r) => r.executionTime));
    const avgTime = batchResults.reduce((sum, r) => sum + r.executionTime, 0) / batchResults.length;

    console.log(`\nParallel execution - Max: ${totalTime}ms, Avg: ${avgTime.toFixed(0)}ms`);
  } catch (error) {
    console.error("Batch search failed:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 帶時間範圍的搜索示例
 */
async function timeRangeSearchExample(): Promise<void> {
  console.log("\n=== Time Range Search Example ===");

  const searchEngine = createSearchMapReduceEngine();

  try {
    await searchEngine.initialize();

    // 搜索最近一周的內容
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const searchContext: SearchContext = {
      query: "project updates meeting notes",
      salientTerms: ["project", "updates", "meeting"],
      timeRange: {
        startTime: oneWeekAgo,
        endTime: now,
      },
      filters: {
        maxResults: 15,
        extension: ".md", // 只搜索 markdown 文件
      },
    };

    console.log(
      `Searching for content from ${new Date(oneWeekAgo).toLocaleDateString()} to ${new Date(now).toLocaleDateString()}`
    );

    const results = await searchEngine.search(searchContext);

    console.log(`Found ${results.totalResults} results in the specified time range`);

    // 按時間排序顯示結果
    const sortedByTime = results.documents
      .sort((a, b) => (b.metadata.mtime || 0) - (a.metadata.mtime || 0))
      .slice(0, 5);

    sortedByTime.forEach((doc, index) => {
      const modTime = new Date(doc.metadata.mtime || 0);
      console.log(`\n${index + 1}. ${doc.metadata.title || "Untitled"}`);
      console.log(`   Modified: ${modTime.toLocaleString()}`);
      console.log(`   Score: ${doc.metadata.score?.toFixed(3)}`);
    });
  } catch (error) {
    console.error("Time range search failed:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 監控和警報示例
 */
async function monitoringExample(): Promise<void> {
  console.log("\n=== Monitoring Example ===");

  const config = getDefaultConfig();
  config.monitoringEnabled = true;

  const searchEngine = createSearchMapReduceEngine(config);

  try {
    await searchEngine.initialize();

    // 設置事件監聽器
    searchEngine.on("searchEvent", (event) => {
      console.log(`Event: ${event.type} at ${new Date(event.timestamp).toLocaleTimeString()}`);
    });

    searchEngine.on("performanceAlert", (alert) => {
      console.log(`⚠️ Performance Alert: ${alert.message}`);
    });

    // 執行一些搜索以產生監控數據
    const searches = [
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "natural language processing",
    ];

    for (const query of searches) {
      const context: SearchContext = {
        query,
        filters: { maxResults: 5 },
      };

      await searchEngine.search(context);

      // 添加延遲以便觀察監控數據
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 獲取性能指標
    const metrics = searchEngine.getPerformanceMetrics();
    console.log("\n=== Final Performance Metrics ===");
    console.log(JSON.stringify(metrics, null, 2));
  } catch (error) {
    console.error("Monitoring example failed:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 自定義配置示例
 */
async function customConfigExample(): Promise<void> {
  console.log("\n=== Custom Configuration Example ===");

  // 創建自定義配置
  const customConfig = {
    ...getDefaultConfig(),
    maxConcurrentTasks: 15,
    taskTimeout: 20000,
    aggregationConfig: {
      ...getDefaultConfig().aggregationConfig,
      maxResults: 30,
      enableReranking: true,
      rerankingThreshold: 0.4,
      scoringWeights: {
        hybrid: 1.2,
        vector: 1.0,
        keyword: 0.8,
        rerank: 0.6,
      },
    },
    strategies: [
      {
        name: "hybrid",
        enabled: true,
        weight: 95,
        timeout: 12000,
        retries: 2,
        configuration: {
          textWeight: 0.6,
          vectorWeight: 0.4,
        },
      },
      {
        name: "vector",
        enabled: true,
        weight: 85,
        timeout: 8000,
        retries: 3,
        configuration: {
          enhanceQuery: true,
          minSimilarityScore: 0.2,
        },
      },
    ],
  };

  const searchEngine = createSearchMapReduceEngine(customConfig);

  try {
    await searchEngine.initialize();

    const searchContext: SearchContext = {
      query: "advanced search algorithms optimization",
      salientTerms: ["search", "algorithms", "optimization"],
      filters: { maxResults: 25 },
    };

    const results = await searchEngine.search(searchContext);

    console.log(`Custom search returned ${results.totalResults} results`);
    console.log(`Used strategies: ${results.aggregationMetadata.strategies.join(", ")}`);
    console.log(`Total search time: ${results.aggregationMetadata.totalSearchTime}ms`);
  } catch (error) {
    console.error("Custom config search failed:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 主函數 - 運行所有示例
 */
async function main(): Promise<void> {
  console.log("🚀 MapReduce Search System Examples\n");

  try {
    await basicSearchExample();
    await highPerformanceSearchExample();
    await timeRangeSearchExample();
    await monitoringExample();
    await customConfigExample();

    console.log("\n✅ All examples completed successfully!");
  } catch (error) {
    console.error("❌ Example execution failed:", error);
  }
}

// 如果直接運行此文件，執行示例
if (require.main === module) {
  main().catch(console.error);
}

export {
  basicSearchExample,
  highPerformanceSearchExample,
  timeRangeSearchExample,
  monitoringExample,
  customConfigExample,
};
