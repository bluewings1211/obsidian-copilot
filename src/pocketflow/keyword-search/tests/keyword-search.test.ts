/**
 * 關鍵字搜索系統測試
 */

import { createKeywordSearchEngine, getDefaultConfig } from "../index";
import { QueryStrategy, HybridSearchMode } from "../types";

describe("KeywordSearchEngine", () => {
  let searchEngine: any;

  beforeEach(async () => {
    searchEngine = createKeywordSearchEngine(getDefaultConfig());
    await searchEngine.initialize();
  });

  afterEach(async () => {
    if (searchEngine) {
      await searchEngine.shutdown();
    }
  });

  describe("基本搜索功能", () => {
    it("應該能夠執行基本的關鍵字搜索", async () => {
      const result = await searchEngine.search({
        query: "machine learning",
        options: {
          maxResults: 10,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
      expect(result.documents).toBeDefined();
      expect(result.totalFound).toBeGreaterThanOrEqual(0);
      expect(result.searchTime).toBeGreaterThan(0);
      expect(result.strategy).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it("應該能夠處理空查詢", async () => {
      await expect(
        searchEngine.search({
          query: "",
          options: { maxResults: 5 },
        })
      ).rejects.toThrow();
    });

    it("應該能夠限制結果數量", async () => {
      const maxResults = 3;
      const result = await searchEngine.search({
        query: "test query",
        options: {
          maxResults,
          enableParallel: false,
        },
      });

      expect(result.documents.length).toBeLessThanOrEqual(maxResults);
    });
  });

  describe("高級查詢語法", () => {
    it("應該能夠處理布爾查詢", async () => {
      const result = await searchEngine.search({
        query: "machine AND learning",
        options: {
          queryStrategy: QueryStrategy.BOOLEAN_LOGIC,
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
      expect(result.strategy).toContain("boolean");
    });

    it("應該能夠處理短語查詢", async () => {
      const result = await searchEngine.search({
        query: '"machine learning"',
        options: {
          queryStrategy: QueryStrategy.PHRASE_SEARCH,
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
    });

    it("應該能夠處理模糊查詢", async () => {
      const result = await searchEngine.search({
        query: "machne~0.8",
        options: {
          queryStrategy: QueryStrategy.FUZZY_MATCH,
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe("混合搜索", () => {
    it("應該能夠執行並行混合搜索", async () => {
      const result = await searchEngine.search({
        query: "neural networks",
        options: {
          hybridMode: HybridSearchMode.PARALLEL,
          maxResults: 10,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
      expect(result.strategy).toContain("hybrid");
    });

    it("應該能夠執行自適應混合搜索", async () => {
      const result = await searchEngine.search({
        query: "deep learning",
        options: {
          hybridMode: HybridSearchMode.ADAPTIVE,
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe("性能監控", () => {
    it("應該能夠獲取性能指標", async () => {
      // 執行一些搜索來生成指標
      await searchEngine.search({
        query: "test metrics",
        options: { maxResults: 5, enableParallel: false },
      });

      const metrics = await searchEngine.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.searchRequests).toBeGreaterThan(0);
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
    });

    it("應該能夠獲取索引統計", async () => {
      const stats = await searchEngine.getIndexStatistics();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe("object");
    });
  });

  describe("錯誤處理", () => {
    it("應該能夠處理無效的查詢策略", async () => {
      // 這個測試可能需要根據實際實現調整
      const result = await searchEngine.search({
        query: "test",
        options: {
          queryStrategy: "invalid_strategy" as any,
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
    });

    it("應該能夠處理超時", async () => {
      const result = await searchEngine.search({
        query: "test timeout",
        options: {
          timeout: 1, // 很短的超時時間
          maxResults: 5,
          enableParallel: false,
        },
      });

      // 即使超時，也應該返回部分結果或適當的錯誤
      expect(result).toBeDefined();
    });
  });

  describe("並行處理", () => {
    it("應該能夠執行並行搜索", async () => {
      const result = await searchEngine.search({
        query: "parallel search test",
        options: {
          enableParallel: true,
          maxResults: 10,
        },
      });

      expect(result).toBeDefined();
      expect(result.metadata.parallelTasksUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("上下文搜索", () => {
    it("應該能夠使用搜索上下文", async () => {
      const result = await searchEngine.search({
        query: "context test",
        options: { maxResults: 5, enableParallel: false },
        context: {
          userId: "test_user",
          domain: "technology",
          documentTypes: ["md", "txt"],
          previousQueries: ["machine learning", "AI"],
          userPreferences: {
            documentTypes: { md: 0.8, txt: 0.6 },
          },
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe("查詢解析器", () => {
    it("應該能夠解析複雜查詢", async () => {
      const result = await searchEngine.search({
        query: 'title:"machine learning" AND (neural OR network) NOT "deep learning"',
        options: {
          queryStrategy: QueryStrategy.BOOLEAN_LOGIC,
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
    });

    it("應該能夠處理帶權重的查詢", async () => {
      const result = await searchEngine.search({
        query: "machine^2.0 learning^1.5",
        options: {
          maxResults: 5,
          enableParallel: false,
        },
      });

      expect(result).toBeDefined();
    });
  });
});

describe("配置系統", () => {
  it("應該能夠使用自定義配置", async () => {
    const customConfig = {
      ...getDefaultConfig(),
      parallel: {
        ...getDefaultConfig().parallel,
        maxConcurrentTasks: 2,
      },
    };

    const engine = createKeywordSearchEngine(customConfig);
    await engine.initialize();

    const result = await engine.search({
      query: "custom config test",
      options: { maxResults: 5, enableParallel: false },
    });

    expect(result).toBeDefined();

    await engine.shutdown();
  });

  it("應該能夠驗證配置", async () => {
    const config = getDefaultConfig();
    expect(config).toBeDefined();
    expect(config.parallel).toBeDefined();
    expect(config.indexing).toBeDefined();
    expect(config.query).toBeDefined();
    expect(config.hybrid).toBeDefined();
    expect(config.monitoring).toBeDefined();
    expect(config.performance).toBeDefined();
  });
});
