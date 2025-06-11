/**
 * 並行化向量搜索系統使用示例
 */

import {
  createVectorSearchEngine,
  getHighPerformanceConfig,
  validateVectorSearchConfig,
  VectorSearchRequest,
} from "../index";

/**
 * 基本使用示例
 */
export async function basicVectorSearchExample(): Promise<void> {
  console.log("🔍 並行化向量搜索系統 - 基本使用示例");

  // 創建向量搜索引擎
  const searchEngine = createVectorSearchEngine();

  try {
    // 初始化引擎
    await searchEngine.initialize();
    console.log("✅ 向量搜索引擎初始化完成");

    // 創建搜索請求
    const searchRequest: VectorSearchRequest = {
      query: "machine learning algorithms for natural language processing",
      filters: {
        maxResults: 20,
        minSimilarityScore: 0.3,
      },
      options: {
        enableParallel: true,
        enableCaching: true,
        enableSemanticEnhancement: true,
        timeout: 30000,
      },
      context: {
        userId: "user123",
        sessionId: "session456",
        domain: "technology",
        intent: "research",
      },
    };

    // 執行搜索
    console.log("🔍 執行向量搜索...");
    const results = await searchEngine.search(searchRequest);

    console.log(`📊 搜索完成，找到 ${results.length} 個結果`);

    // 顯示前3個結果
    results.slice(0, 3).forEach((result, index) => {
      console.log(`\n結果 ${index + 1}:`);
      console.log(`  分數: ${result.score.toFixed(4)}`);
      console.log(`  語義分數: ${result.semanticScore?.toFixed(4) || "N/A"}`);
      console.log(`  標準化分數: ${result.normalizedScore?.toFixed(4) || "N/A"}`);
      console.log(`  計算方法: ${result.metadata.calculationMethod}`);
      console.log(`  文檔路徑: ${result.document.metadata.path || "N/A"}`);
      console.log(`  內容預覽: ${result.document.pageContent.substring(0, 100)}...`);
    });

    // 獲取性能指標
    const metrics = await searchEngine.getPerformanceMetrics();
    console.log("\n📈 性能指標:");
    console.log(`  總搜索次數: ${metrics.totalSearches}`);
    console.log(`  平均延遲: ${metrics.averageLatency.toFixed(2)}ms`);
    console.log(`  吞吐量: ${metrics.throughput.toFixed(2)} queries/sec`);
    console.log(`  緩存命中率: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  並行效率: ${(metrics.parallelEfficiency * 100).toFixed(1)}%`);
  } catch (error) {
    console.error("❌ 搜索失敗:", error);
  } finally {
    // 關閉引擎
    await searchEngine.shutdown();
    console.log("🔚 向量搜索引擎已關閉");
  }
}

/**
 * 高性能配置示例
 */
export async function highPerformanceExample(): Promise<void> {
  console.log("\n🚀 高性能配置示例");

  // 使用高性能配置
  const config = getHighPerformanceConfig();

  // 驗證配置
  const validation = validateVectorSearchConfig(config);
  if (!validation.isValid) {
    console.error("❌ 配置驗證失敗:", validation.errors);
    return;
  }

  const searchEngine = createVectorSearchEngine(config);

  try {
    await searchEngine.initialize();
    console.log("✅ 高性能搜索引擎初始化完成");

    // 批量搜索示例
    const queries = [
      "deep learning neural networks",
      "computer vision image recognition",
      "natural language understanding",
      "reinforcement learning algorithms",
      "data mining techniques",
    ];

    console.log("🔍 執行批量搜索...");
    const startTime = Date.now();

    const results = await Promise.all(
      queries.map(async (query, index) => {
        const request: VectorSearchRequest = {
          query,
          filters: { maxResults: 10, minSimilarityScore: 0.4 },
          options: { enableParallel: true, enableDistributed: true },
          context: { sessionId: `batch_${index}` },
        };
        return searchEngine.search(request);
      })
    );

    const totalTime = Date.now() - startTime;
    const totalResults = results.reduce((sum, r) => sum + r.length, 0);

    console.log(`📊 批量搜索完成:`);
    console.log(`  查詢數量: ${queries.length}`);
    console.log(`  總結果數: ${totalResults}`);
    console.log(`  總耗時: ${totalTime}ms`);
    console.log(`  平均每查詢: ${(totalTime / queries.length).toFixed(2)}ms`);
  } catch (error) {
    console.error("❌ 高性能搜索失敗:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 語義增強搜索示例
 */
export async function semanticEnhancementExample(): Promise<void> {
  console.log("\n🧠 語義增強搜索示例");

  const searchEngine = createVectorSearchEngine({
    semantic: {
      enhancement: {
        enableContextualBoost: true,
        enableSemanticExpansion: true,
        enableMultiLevelSearch: true,
        contextualWeights: {
          domain: 0.4,
          history: 0.3,
          preference: 0.2,
          temporal: 0.1,
        },
        semanticThreshold: 0.8,
        expansionTermCount: 5,
      },
      contextualWeighting: true,
      multiLevelSearch: true,
    },
  });

  try {
    await searchEngine.initialize();

    // 模擬用戶會話，逐步建立上下文
    const userContext = {
      userId: "researcher_001",
      sessionId: "research_session_001",
      domain: "artificial_intelligence",
      intent: "academic_research",
      previousQueries: ["machine learning fundamentals", "neural network architectures"],
      userPreferences: {
        documentTypes: { pdf: 0.8, md: 0.6, txt: 0.3 },
        contentLength: { preferred: 2000, tolerance: 0.5 },
      },
    };

    // 第一次搜索
    console.log("🔍 第一次搜索 (建立上下文)...");
    const firstResults = await searchEngine.search({
      query: "transformer attention mechanisms",
      filters: { maxResults: 15 },
      context: userContext,
    });

    console.log(
      `找到 ${firstResults.length} 個結果，語義增強:`,
      firstResults.filter((r) => r.semanticScore).length
    );

    // 第二次搜索（基於上下文）
    console.log("🔍 第二次搜索 (利用上下文)...");
    const secondResults = await searchEngine.search({
      query: "attention is all you need paper analysis",
      filters: { maxResults: 15 },
      context: {
        ...userContext,
        previousQueries: [...userContext.previousQueries, "transformer attention mechanisms"],
      },
    });

    console.log(
      `找到 ${secondResults.length} 個結果，語義增強:`,
      secondResults.filter((r) => r.semanticScore).length
    );

    // 比較語義增強效果
    const enhancedResults = secondResults.filter(
      (r) => r.semanticScore && r.semanticScore > r.score
    );
    console.log(`\n📊 語義增強效果:`);
    console.log(`  增強結果數: ${enhancedResults.length}`);

    if (enhancedResults.length > 0) {
      const avgImprovement =
        enhancedResults.reduce((sum, r) => sum + (r.semanticScore! - r.score) / r.score, 0) /
        enhancedResults.length;
      console.log(`  平均提升: ${(avgImprovement * 100).toFixed(1)}%`);
    }
  } catch (error) {
    console.error("❌ 語義增強搜索失敗:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 緩存效果示例
 */
export async function cacheEffectivenessExample(): Promise<void> {
  console.log("\n💾 緩存效果示例");

  const searchEngine = createVectorSearchEngine({
    cache: {
      enableQueryCache: true,
      enableEmbeddingCache: true,
      maxCacheSize: 1000,
      defaultTTL: 300000, // 5 minutes
      cacheStrategy: "adaptive" as any,
      compressionEnabled: false,
    },
  });

  try {
    await searchEngine.initialize();

    const query = "convolutional neural networks image classification";
    const searchRequest: VectorSearchRequest = {
      query,
      filters: { maxResults: 20 },
      options: { enableCaching: true },
    };

    // 第一次搜索（無緩存）
    console.log("🔍 第一次搜索 (無緩存)...");
    const start1 = Date.now();
    const results1 = await searchEngine.search(searchRequest);
    const time1 = Date.now() - start1;

    console.log(`第一次搜索: ${time1}ms, ${results1.length} 個結果`);

    // 第二次搜索（使用緩存）
    console.log("🔍 第二次搜索 (使用緩存)...");
    const start2 = Date.now();
    const results2 = await searchEngine.search(searchRequest);
    const time2 = Date.now() - start2;

    console.log(`第二次搜索: ${time2}ms, ${results2.length} 個結果`);

    // 計算緩存效果
    const speedup = time1 / time2;
    console.log(`\n📊 緩存效果:`);
    console.log(`  加速比: ${speedup.toFixed(2)}x`);
    console.log(`  時間節省: ${((1 - time2 / time1) * 100).toFixed(1)}%`);

    // 獲取緩存統計
    const metrics = await searchEngine.getPerformanceMetrics();
    console.log(`  緩存命中率: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  } catch (error) {
    console.error("❌ 緩存效果測試失敗:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 分散式搜索示例
 */
export async function distributedSearchExample(): Promise<void> {
  console.log("\n🌐 分散式搜索示例");

  const searchEngine = createVectorSearchEngine({
    distributed: {
      maxShardsPerQuery: 4,
      shardSelectionStrategy: "adaptive",
      loadBalancing: {
        strategy: "adaptive" as any,
        maxShardsPerQuery: 4,
        loadThreshold: 0.8,
        failoverEnabled: true,
        healthCheckInterval: 60000,
      },
      replicationFactor: 1,
      healthCheckInterval: 60000,
    },
  });

  try {
    await searchEngine.initialize();

    // 大規模搜索請求
    const largeSearchRequest: VectorSearchRequest = {
      query: "distributed systems microservices architecture",
      filters: {
        maxResults: 100, // 大量結果
        minSimilarityScore: 0.2,
      },
      options: {
        enableDistributed: true,
        preferredShards: [], // 讓系統自動選擇
        timeout: 60000,
      },
    };

    console.log("🔍 執行大規模分散式搜索...");
    const startTime = Date.now();
    const results = await searchEngine.search(largeSearchRequest);
    const totalTime = Date.now() - startTime;

    console.log(`📊 分散式搜索完成:`);
    console.log(`  結果數量: ${results.length}`);
    console.log(`  搜索時間: ${totalTime}ms`);
    console.log(`  平均每結果: ${(totalTime / results.length).toFixed(2)}ms`);

    // 分析結果來源
    const shardDistribution = new Map<string, number>();
    results.forEach((result) => {
      const shardId = result.shardId || "unknown";
      shardDistribution.set(shardId, (shardDistribution.get(shardId) || 0) + 1);
    });

    console.log("\n📊 分片分佈:");
    shardDistribution.forEach((count, shardId) => {
      console.log(
        `  ${shardId}: ${count} 個結果 (${((count / results.length) * 100).toFixed(1)}%)`
      );
    });
  } catch (error) {
    console.error("❌ 分散式搜索失敗:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 性能監控示例
 */
export async function performanceMonitoringExample(): Promise<void> {
  console.log("\n📊 性能監控示例");

  const searchEngine = createVectorSearchEngine({
    monitoring: {
      enableRealTimeMetrics: true,
      metricsCollectionInterval: 10000, // 10 seconds
      enableAnalytics: true,
      alertThresholds: {
        averageLatency: 2000,
        errorRate: 0.05,
        throughput: 1,
        memoryUsage: 1000,
      },
    },
  });

  // 監聽性能事件
  searchEngine.on("performance_degradation_detected", (data) => {
    console.log("⚠️ 性能降級檢測:", data.degradingMetrics);
  });

  searchEngine.on("latency_alert", (data) => {
    console.log("🚨 延遲警報:", `${data.current}ms > ${data.threshold}ms`);
  });

  try {
    await searchEngine.initialize();

    // 執行一系列搜索以生成性能數據
    const queries = [
      "artificial intelligence ethics",
      "blockchain consensus algorithms",
      "quantum computing applications",
      "cybersecurity threat detection",
      "cloud computing scalability",
    ];

    console.log("🔍 執行監控測試搜索...");

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const startTime = Date.now();

      try {
        const results = await searchEngine.search({
          query,
          filters: { maxResults: 15 },
        });

        const executionTime = Date.now() - startTime;
        console.log(
          `搜索 ${i + 1}: ${query.substring(0, 20)}... (${executionTime}ms, ${results.length} 結果)`
        );

        // 模擬延遲
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.log(`搜索 ${i + 1} 失敗:`, error.message);
      }
    }

    // 獲取性能分析
    const analytics = await searchEngine.getAnalytics();
    console.log("\n📈 性能分析結果:");
    console.log(`  查詢模式數: ${analytics.queryPatterns.length}`);
    console.log(`  平均相關性: ${analytics.resultQuality.averageRelevanceScore.toFixed(3)}`);
    console.log(`  結果一致性: ${analytics.resultQuality.resultConsistency.toFixed(3)}`);

    // 顯示優化建議
    if (analytics.optimizationRecommendations.length > 0) {
      console.log("\n💡 優化建議:");
      analytics.optimizationRecommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec.description}`);
        console.log(`     預期改善: ${(rec.expectedImprovement * 100).toFixed(1)}%`);
        console.log(`     優先級: ${rec.priority}/10`);
      });
    }
  } catch (error) {
    console.error("❌ 性能監控示例失敗:", error);
  } finally {
    await searchEngine.shutdown();
  }
}

/**
 * 運行所有示例
 */
export async function runAllVectorSearchExamples(): Promise<void> {
  console.log("🎯 並行化向量搜索系統完整示例\n");

  try {
    await basicVectorSearchExample();
    await highPerformanceExample();
    await semanticEnhancementExample();
    await cacheEffectivenessExample();
    await distributedSearchExample();
    await performanceMonitoringExample();

    console.log("\n✅ 所有向量搜索示例執行完成！");
  } catch (error) {
    console.error("❌ 示例執行失敗:", error);
  }
}

// 如果直接運行此文件
if (require.main === module) {
  runAllVectorSearchExamples().catch(console.error);
}
