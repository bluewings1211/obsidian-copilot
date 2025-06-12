/**
 * PocketFlow.js Search Aggregation System - Comprehensive Example
 * 搜索聚合系統綜合示例
 */

import {
  createSearchAggregationSystem,
  createHighPerformanceConfig,
  createQualityFocusedConfig,
  createPersonalizationFocusedConfig,
  SearchSource,
  RankingContext,
  UserContext,
  SearchIntent,
  AggregationRequest,
} from "../index";

/**
 * 基本聚合示例
 */
export async function basicAggregationExample() {
  console.log("=== 基本搜索聚合示例 ===");

  // 1. 創建聚合系統
  const aggregator = createSearchAggregationSystem();

  // 2. 定義搜索源
  const searchSources: SearchSource[] = [
    {
      id: "vector-search",
      name: "Vector Search Engine",
      type: "vector",
      weight: 0.8,
      enabled: true,
      config: { model: "text-embedding-ada-002" },
    },
    {
      id: "keyword-search",
      name: "Keyword Search Engine",
      type: "keyword",
      weight: 0.7,
      enabled: true,
      config: { analyzer: "standard" },
    },
    {
      id: "hybrid-search",
      name: "Hybrid Search Engine",
      type: "hybrid",
      weight: 0.9,
      enabled: true,
      config: { vectorWeight: 0.6, keywordWeight: 0.4 },
    },
  ];

  // 3. 創建聚合請求
  const request: AggregationRequest = {
    query: "machine learning algorithms for natural language processing",
    sources: searchSources,
    options: {
      maxResults: 20,
      enablePersonalization: false,
      enableQualityFilter: true,
      enableRanking: true,
      timeout: 10000,
      cacheResults: true,
    },
  };

  try {
    // 4. 執行聚合
    const result = await aggregator.aggregate(request);

    // 5. 顯示結果
    console.log("聚合結果:");
    console.log(`- 總結果數: ${result.results.length}`);
    console.log(`- 處理時間: ${result.metadata.processingTime}ms`);
    console.log(`- 使用的源: ${result.metadata.sourcesUsed.join(", ")}`);
    console.log(`- 質量統計:`, result.metadata.qualityStats);

    // 顯示前5個結果
    console.log("\n前5個結果:");
    result.results.slice(0, 5).forEach((result, index) => {
      console.log(`${index + 1}. ${result.title || "無標題"}`);
      console.log(`   相關性: ${result.relevanceScore.toFixed(3)}`);
      console.log(`   質量: ${result.qualityScore.toFixed(3)}`);
      console.log(`   來源: ${result.sources.map((s) => s.name).join(", ")}`);
      console.log("");
    });

    return result;
  } catch (error) {
    console.error("聚合失敗:", error);
    throw error;
  }
}

/**
 * 高性能聚合示例
 */
export async function highPerformanceAggregationExample() {
  console.log("=== 高性能搜索聚合示例 ===");

  // 使用高性能配置
  const aggregator = createSearchAggregationSystem(createHighPerformanceConfig());

  const searchSources: SearchSource[] = [
    {
      id: "mapreduce-search",
      name: "MapReduce Search",
      type: "mapreduce",
      weight: 1.0,
      enabled: true,
    },
    {
      id: "vector-search-fast",
      name: "Fast Vector Search",
      type: "vector",
      weight: 0.9,
      enabled: true,
    },
    {
      id: "keyword-search-parallel",
      name: "Parallel Keyword Search",
      type: "keyword",
      weight: 0.8,
      enabled: true,
    },
  ];

  const request: AggregationRequest = {
    query: "real-time data processing frameworks",
    sources: searchSources,
    options: {
      maxResults: 100,
      enablePersonalization: true,
      enableQualityFilter: true,
      enableRanking: true,
      timeout: 15000,
    },
  };

  const startTime = Date.now();
  const result = await aggregator.aggregate(request);
  const endTime = Date.now();

  console.log("高性能聚合完成:");
  console.log(`- 結果數: ${result.results.length}`);
  console.log(`- 總耗時: ${endTime - startTime}ms`);
  console.log(`- 平均每結果耗時: ${(endTime - startTime) / result.results.length}ms`);

  return result;
}

/**
 * 個性化聚合示例
 */
export async function personalizedAggregationExample() {
  console.log("=== 個性化搜索聚合示例 ===");

  // 使用個性化優先配置
  const aggregator = createSearchAggregationSystem(createPersonalizationFocusedConfig());

  // 模擬用戶上下文
  const userContext: UserContext = {
    userId: "user-123",
    sessionId: "session-456",
    preferences: {
      contentTypes: ["article", "code"],
      topics: ["machine learning", "python", "data science"],
      sources: ["academic", "github", "stackoverflow"],
      languages: ["en", "zh"],
      recency: "recent",
      depth: "detailed",
      format: "text",
    },
    behavior: {
      searchHistory: [
        {
          query: "neural networks tutorial",
          timestamp: Date.now() - 86400000, // 1天前
          resultClicks: ["result-1", "result-3"],
          sessionDuration: 300000, // 5分鐘
          satisfaction: 0.8,
        },
      ],
      clickPatterns: [
        {
          resultId: "result-1",
          position: 1,
          dwellTime: 120000, // 2分鐘
          timestamp: Date.now() - 86400000,
        },
      ],
      dwellTime: [
        {
          resultId: "result-1",
          timeSpent: 120000,
          engagement: "high",
          bounce: false,
        },
      ],
      feedbackHistory: [
        {
          resultId: "result-1",
          feedback: "positive",
          timestamp: Date.now() - 86400000,
        },
      ],
      interactionPatterns: [
        {
          type: "bookmark",
          target: "result-1",
          context: {},
          timestamp: Date.now() - 86400000,
        },
      ],
    },
    profile: {
      expertiseLevel: "intermediate",
      domains: ["machine learning", "software engineering"],
      interests: ["AI", "python", "data visualization"],
      learningStyle: "textual",
      activityLevel: "high",
    },
  };

  // 搜索意圖
  const searchIntent: SearchIntent = {
    type: "informational",
    confidence: 0.8,
    entities: ["machine learning", "algorithms"],
    topics: ["AI", "ML"],
    urgency: "medium",
  };

  // 排序上下文
  const rankingContext: RankingContext = {
    query: "advanced machine learning algorithms implementation",
    userContext,
    searchIntent,
    preferences: userContext.preferences,
    sessionHistory: [
      {
        sessionId: "session-456",
        queries: ["machine learning basics", "neural networks"],
        results: ["result-1", "result-2"],
        startTime: Date.now() - 3600000, // 1小時前
        endTime: Date.now() - 3300000, // 55分鐘前
        satisfaction: 0.7,
      },
    ],
  };

  const searchSources: SearchSource[] = [
    {
      id: "personalized-vector",
      name: "Personalized Vector Search",
      type: "vector",
      weight: 0.9,
      enabled: true,
    },
    {
      id: "user-history-search",
      name: "User History Search",
      type: "hybrid",
      weight: 0.8,
      enabled: true,
    },
  ];

  const request: AggregationRequest = {
    query: "advanced machine learning algorithms implementation",
    sources: searchSources,
    context: rankingContext,
    options: {
      maxResults: 30,
      enablePersonalization: true,
      enableQualityFilter: true,
      enableRanking: true,
    },
  };

  const result = await aggregator.aggregate(request);

  console.log("個性化聚合完成:");
  console.log(`- 結果數: ${result.results.length}`);
  console.log(`- 個性化結果數: ${result.results.filter((r) => r.personalizedScore).length}`);

  // 顯示個性化分數
  console.log("\n個性化結果示例:");
  result.results.slice(0, 3).forEach((result, index) => {
    if (result.personalizedScore) {
      console.log(`${index + 1}. ${result.title || "無標題"}`);
      console.log(`   個性化分數: ${result.personalizedScore.toFixed(3)}`);
      console.log(`   相關性分數: ${result.relevanceScore.toFixed(3)}`);
      console.log(`   質量分數: ${result.qualityScore.toFixed(3)}`);
      console.log("");
    }
  });

  return result;
}

/**
 * 質量優先聚合示例
 */
export async function qualityFocusedAggregationExample() {
  console.log("=== 質量優先搜索聚合示例 ===");

  // 使用質量優先配置
  const aggregator = createSearchAggregationSystem(createQualityFocusedConfig());

  const searchSources: SearchSource[] = [
    {
      id: "academic-papers",
      name: "Academic Papers",
      type: "vector",
      weight: 1.0,
      enabled: true,
      config: { requirePeerReview: true },
    },
    {
      id: "authoritative-sources",
      name: "Authoritative Sources",
      type: "keyword",
      weight: 0.9,
      enabled: true,
      config: { minimumAuthority: 0.8 },
    },
  ];

  const request: AggregationRequest = {
    query: "climate change impact on biodiversity",
    sources: searchSources,
    options: {
      maxResults: 15,
      enablePersonalization: false, // 質量優先，不使用個性化
      enableQualityFilter: true,
      enableRanking: true,
    },
  };

  const result = await aggregator.aggregate(request);

  console.log("質量優先聚合完成:");
  console.log(`- 結果數: ${result.results.length}`);
  console.log(
    `- 平均質量分數: ${(result.results.reduce((sum, r) => sum + r.qualityScore, 0) / result.results.length).toFixed(3)}`
  );
  console.log(
    `- 高質量結果數 (>0.8): ${result.results.filter((r) => r.qualityScore > 0.8).length}`
  );

  // 顯示質量分析
  console.log("\n質量分析:");
  result.results.slice(0, 3).forEach((result, index) => {
    console.log(`${index + 1}. ${result.title || "無標題"}`);
    console.log(`   質量分數: ${result.qualityScore.toFixed(3)}`);
    console.log(`   來源權重: ${result.sources.map((s) => s.weight).join(", ")}`);
    console.log(`   質量指標:`, result.aggregationInfo.qualityIndicators);
    console.log("");
  });

  return result;
}

/**
 * 監控和分析示例
 */
export async function monitoringExample() {
  console.log("=== 監控和分析示例 ===");

  const aggregator = createSearchAggregationSystem();

  // 執行多次聚合以生成監控數據
  const queries = [
    "artificial intelligence trends",
    "blockchain technology applications",
    "quantum computing fundamentals",
    "cloud native architecture patterns",
    "data privacy regulations",
  ];

  const searchSources: SearchSource[] = [
    {
      id: "tech-news",
      name: "Tech News",
      type: "keyword",
      weight: 0.7,
      enabled: true,
    },
    {
      id: "research-papers",
      name: "Research Papers",
      type: "vector",
      weight: 0.9,
      enabled: true,
    },
  ];

  console.log("執行多次聚合以生成監控數據...");

  for (const query of queries) {
    const request: AggregationRequest = {
      query,
      sources: searchSources,
      options: { maxResults: 10 },
    };

    try {
      await aggregator.aggregate(request);
      console.log(`✓ 完成查詢: "${query}"`);
    } catch (error) {
      console.log(`✗ 查詢失敗: "${query}" - ${error}`);
    }

    // 短暫延遲
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 獲取統計信息
  const stats = aggregator.getAggregationStats();
  console.log("\n聚合統計:");
  console.log(stats);

  return stats;
}

/**
 * 錯誤處理和容錯示例
 */
export async function errorHandlingExample() {
  console.log("=== 錯誤處理和容錯示例 ===");

  const aggregator = createSearchAggregationSystem();

  // 模擬有問題的搜索源
  const problematicSources: SearchSource[] = [
    {
      id: "unreliable-source",
      name: "Unreliable Source",
      type: "vector",
      weight: 0.5,
      enabled: true,
    },
    {
      id: "slow-source",
      name: "Slow Source",
      type: "keyword",
      weight: 0.6,
      enabled: true,
    },
    {
      id: "reliable-source",
      name: "Reliable Source",
      type: "hybrid",
      weight: 0.8,
      enabled: true,
    },
  ];

  const request: AggregationRequest = {
    query: "test query for error handling",
    sources: problematicSources,
    options: {
      maxResults: 10,
      timeout: 5000, // 短超時時間
    },
  };

  try {
    console.log("執行可能失敗的聚合...");
    const result = await aggregator.aggregate(request);

    console.log("聚合成功完成 (部分源可能失敗):");
    console.log(`- 結果數: ${result.results.length}`);
    console.log(`- 使用的源: ${result.metadata.sourcesUsed.join(", ")}`);

    return result;
  } catch (error) {
    console.log("聚合完全失敗:", error);
    throw error;
  }
}

/**
 * 運行所有示例
 */
export async function runAllExamples() {
  console.log("🚀 開始運行 PocketFlow 搜索聚合系統示例\n");

  try {
    // 基本示例
    await basicAggregationExample();
    console.log("\n" + "=".repeat(50) + "\n");

    // 高性能示例
    await highPerformanceAggregationExample();
    console.log("\n" + "=".repeat(50) + "\n");

    // 個性化示例
    await personalizedAggregationExample();
    console.log("\n" + "=".repeat(50) + "\n");

    // 質量優先示例
    await qualityFocusedAggregationExample();
    console.log("\n" + "=".repeat(50) + "\n");

    // 監控示例
    await monitoringExample();
    console.log("\n" + "=".repeat(50) + "\n");

    // 錯誤處理示例
    await errorHandlingExample();

    console.log("\n✅ 所有示例運行完成！");
  } catch (error) {
    console.error("\n❌ 示例運行失敗:", error);
  }
}

// 如果直接運行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}
