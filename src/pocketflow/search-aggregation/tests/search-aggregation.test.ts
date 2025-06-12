/**
 * PocketFlow.js Search Aggregation System - Tests
 * 搜索聚合系統測試
 */

import {
  createSearchAggregationSystem,
  createDefaultConfig,
  SearchSource,
  AggregationRequest,
} from "../index";

describe("PocketFlow Search Aggregation System", () => {
  describe("基本功能測試", () => {
    test("應該能創建搜索聚合系統", () => {
      const aggregator = createSearchAggregationSystem();
      expect(aggregator).toBeDefined();
    });

    test("應該能創建默認配置", () => {
      const config = createDefaultConfig();
      expect(config).toBeDefined();
      expect(config.core).toBeDefined();
      expect(config.ranking).toBeDefined();
      expect(config.personalization).toBeDefined();
      expect(config.quality).toBeDefined();
      expect(config.monitoring).toBeDefined();
    });

    test("應該能執行基本聚合", async () => {
      const aggregator = createSearchAggregationSystem();

      const searchSources: SearchSource[] = [
        {
          id: "test-source",
          name: "Test Source",
          type: "keyword",
          weight: 0.8,
          enabled: true,
        },
      ];

      const request: AggregationRequest = {
        query: "test query",
        sources: searchSources,
        options: {
          maxResults: 5,
          enablePersonalization: false,
          enableQualityFilter: false,
          enableRanking: false,
        },
      };

      const result = await aggregator.aggregate(request);

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metrics).toBeDefined();
    });
  });

  describe("配置測試", () => {
    test("應該能驗證有效配置", () => {
      const config = createDefaultConfig();
      // 在實際應用中會有驗證邏輯
      expect(config.core.maxResults).toBeGreaterThan(0);
      expect(config.core.aggregationTimeout).toBeGreaterThan(0);
    });

    test("應該能處理無效查詢", async () => {
      const aggregator = createSearchAggregationSystem();

      const request: AggregationRequest = {
        query: "", // 空查詢
        sources: [],
        options: {},
      };

      await expect(aggregator.aggregate(request)).rejects.toThrow();
    });
  });

  describe("性能測試", () => {
    test("應該在合理時間內完成聚合", async () => {
      const aggregator = createSearchAggregationSystem();

      const searchSources: SearchSource[] = [
        {
          id: "perf-test-source",
          name: "Performance Test Source",
          type: "vector",
          weight: 0.9,
          enabled: true,
        },
      ];

      const request: AggregationRequest = {
        query: "performance test query",
        sources: searchSources,
        options: {
          maxResults: 10,
          timeout: 5000,
        },
      };

      const startTime = Date.now();
      const result = await aggregator.aggregate(request);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000); // 10秒內完成
      expect(result).toBeDefined();
    });
  });

  describe("錯誤處理測試", () => {
    test("應該處理聚合超時", async () => {
      const aggregator = createSearchAggregationSystem();

      const searchSources: SearchSource[] = [
        {
          id: "slow-source",
          name: "Slow Source",
          type: "keyword",
          weight: 0.5,
          enabled: true,
        },
      ];

      const request: AggregationRequest = {
        query: "timeout test query",
        sources: searchSources,
        options: {
          timeout: 100, // 很短的超時時間
        },
      };

      // 即使超時，也應該返回部分結果而不是拋出錯誤
      const result = await aggregator.aggregate(request);
      expect(result).toBeDefined();
    });

    test("應該處理空結果", async () => {
      const aggregator = createSearchAggregationSystem();

      const searchSources: SearchSource[] = [
        {
          id: "empty-source",
          name: "Empty Source",
          type: "vector",
          weight: 0.7,
          enabled: true,
        },
      ];

      const request: AggregationRequest = {
        query: "empty results query",
        sources: searchSources,
        options: {
          maxResults: 10,
        },
      };

      const result = await aggregator.aggregate(request);
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe("質量控制測試", () => {
    test("應該過濾低質量結果", async () => {
      const aggregator = createSearchAggregationSystem();

      const searchSources: SearchSource[] = [
        {
          id: "quality-test-source",
          name: "Quality Test Source",
          type: "hybrid",
          weight: 0.8,
          enabled: true,
        },
      ];

      const request: AggregationRequest = {
        query: "quality test query",
        sources: searchSources,
        options: {
          enableQualityFilter: true,
          maxResults: 20,
        },
      };

      const result = await aggregator.aggregate(request);

      // 檢查結果質量
      if (result.results.length > 0) {
        const avgQuality =
          result.results.reduce((sum, r) => sum + r.qualityScore, 0) / result.results.length;
        expect(avgQuality).toBeGreaterThan(0); // 至少有基本質量
      }
    });
  });

  describe("統計和監控測試", () => {
    test("應該提供聚合統計", async () => {
      const aggregator = createSearchAggregationSystem();

      // 執行幾次聚合
      for (let i = 0; i < 3; i++) {
        const request: AggregationRequest = {
          query: `test query ${i}`,
          sources: [
            {
              id: `source-${i}`,
              name: `Source ${i}`,
              type: "keyword",
              weight: 0.7,
              enabled: true,
            },
          ],
          options: { maxResults: 5 },
        };

        await aggregator.aggregate(request);
      }

      const stats = aggregator.getAggregationStats();
      expect(stats).toBeDefined();
    });
  });
});
