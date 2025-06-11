import { ToolSelectionAgent, ToolSelectionConfig } from "./ToolSelectionAgent";
import { ChatSharedState } from "../types";

describe("ToolSelectionAgent", () => {
  let agent: ToolSelectionAgent;
  let mockTools: any[];
  let mockShared: ChatSharedState;

  beforeEach(() => {
    const config: Partial<ToolSelectionConfig> = {
      maxCandidates: 3,
      minConfidenceThreshold: 0.2,
      enableLearning: false, // 測試時禁用學習以避免副作用
      enablePerformanceTracking: false,
    };

    agent = new ToolSelectionAgent(config);

    mockTools = [
      {
        name: "localSearch",
        description: "搜索本地筆記和文檔",
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
      },
      {
        name: "webSearch",
        description: "搜索網路資訊",
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
      },
      {
        name: "getCurrentTime",
        description: "獲取當前時間",
        inputSchema: {
          properties: {},
        },
      },
      {
        name: "mcp_brave_search",
        description: "使用 Brave 搜索引擎",
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
      },
    ];

    mockShared = {
      userMessage: {
        message: "測試查詢",
        timestamp: new Date().toISOString() as any,
        sender: "user",
        isVisible: true,
      },
      chatHistory: [],
      debug: false,
    };
  });

  describe("selectTools", () => {
    it("應該成功選擇工具", async () => {
      const query = "搜索關於 AI 的筆記";

      const result = await agent.selectTools(query, mockTools, mockShared);

      expect(result).toBeDefined();
      expect(result.alternatives).toBeInstanceOf(Array);
      expect(result.suggestedAction).toBeDefined();
      expect(result.metadata.analysisTime).toBeGreaterThan(0);
      expect(result.metadata.considereredTools).toBe(mockTools.length);
    });

    it("應該根據查詢內容選擇相關工具", async () => {
      const localQuery = "查找我的筆記中關於 JavaScript 的內容";

      const result = await agent.selectTools(localQuery, mockTools, mockShared);

      // 應該偏好本地搜索工具
      if (result.primaryTool) {
        expect(result.primaryTool.name).toContain("search");
        expect(result.suggestedAction).toMatch(/local_search|tool_execution/);
      }
    });

    it("應該處理網路搜索查詢", async () => {
      const webQuery = "搜索最新的 AI 技術發展";

      const result = await agent.selectTools(webQuery, mockTools, mockShared);

      expect(result).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
    });

    it("應該處理時間相關查詢", async () => {
      const timeQuery = "現在是幾點？";

      const result = await agent.selectTools(timeQuery, mockTools, mockShared);

      expect(result).toBeDefined();
      // 時間查詢應該有相應的工具推薦
    });

    it("應該限制候選工具數量", async () => {
      const query = "通用搜索查詢";

      const result = await agent.selectTools(query, mockTools, mockShared);

      expect(result.alternatives.length).toBeLessThanOrEqual(3); // maxCandidates
    });

    it("應該在沒有合適工具時回退", async () => {
      const emptyTools: any[] = [];
      const query = "任意查詢";

      const result = await agent.selectTools(query, emptyTools, mockShared);

      expect(result.suggestedAction).toBe("direct_llm");
      expect(result.primaryTool).toBeUndefined();
    });
  });

  describe("recordFeedback", () => {
    it("應該記錄工具反饋", async () => {
      await expect(agent.recordFeedback("localSearch", true, 1000, 5)).resolves.toBeUndefined();
    });

    it("應該處理失敗的工具使用", async () => {
      await expect(agent.recordFeedback("webSearch", false, 5000, 2)).resolves.toBeUndefined();
    });
  });

  describe("getToolStatistics", () => {
    it("應該返回工具統計信息", async () => {
      const stats = await agent.getToolStatistics();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe("object");
    });
  });

  describe("updateConfig", () => {
    it("應該更新配置", () => {
      const newConfig: Partial<ToolSelectionConfig> = {
        maxCandidates: 5,
        minConfidenceThreshold: 0.5,
      };

      expect(() => agent.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe("resetLearningData", () => {
    it("應該重置學習數據", async () => {
      await expect(agent.resetLearningData()).resolves.toBeUndefined();
    });
  });

  describe("工具分類測試", () => {
    it("應該正確分類搜索工具", async () => {
      const searchQuery = "尋找資料";

      const result = await agent.selectTools(searchQuery, mockTools, mockShared);

      if (result.primaryTool) {
        expect(["search", "general"]).toContain(result.primaryTool.category);
      }
    });

    it("應該正確分類時間工具", async () => {
      const timeTools = mockTools.filter((tool) => tool.name.includes("Time"));
      const timeQuery = "時間";

      const result = await agent.selectTools(timeQuery, timeTools, mockShared);

      if (result.primaryTool) {
        expect(["time", "general"]).toContain(result.primaryTool.category);
      }
    });
  });

  describe("置信度測試", () => {
    it("應該為相關查詢返回高置信度", async () => {
      const specificQuery = "搜索筆記中的 JavaScript 教程";

      const result = await agent.selectTools(specificQuery, mockTools, mockShared);

      if (result.primaryTool) {
        expect(result.confidence).toBeGreaterThanOrEqual(0.2);
      }
    });

    it("應該過濾低置信度的候選項", async () => {
      const vagueQuery = "嗯";

      const result = await agent.selectTools(vagueQuery, mockTools, mockShared);

      // 所有返回的候選項都應該滿足最低置信度要求
      result.alternatives.forEach((candidate) => {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0.2);
      });
    });
  });

  describe("錯誤處理", () => {
    it("應該處理無效工具列表", async () => {
      const invalidTools = [null, undefined, {}];
      const query = "測試查詢";

      const result = await agent.selectTools(query, invalidTools as any[], mockShared);

      expect(result).toBeDefined();
      expect(result.metadata.selectionStrategy).toBe("fallback");
    });

    it("應該處理空查詢", async () => {
      const emptyQuery = "";

      const result = await agent.selectTools(emptyQuery, mockTools, mockShared);

      expect(result).toBeDefined();
      expect(result.suggestedAction).toBeDefined();
    });
  });

  describe("性能測試", () => {
    it("應該在合理時間內完成選擇", async () => {
      const query = "性能測試查詢";
      const startTime = Date.now();

      const result = await agent.selectTools(query, mockTools, mockShared);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // 應該在1秒內完成
      expect(result.metadata.analysisTime).toBeLessThan(1000);
    });

    it("應該處理大量工具", async () => {
      const manyTools = Array.from({ length: 50 }, (_, i) => ({
        name: `tool_${i}`,
        description: `工具 ${i} 的描述`,
        inputSchema: { properties: {} },
      }));

      const query = "大量工具測試";

      const result = await agent.selectTools(query, manyTools, mockShared);

      expect(result).toBeDefined();
      expect(result.alternatives.length).toBeLessThanOrEqual(3);
    });
  });
});

// 集成測試
describe("ToolSelectionAgent Integration", () => {
  let agent: ToolSelectionAgent;

  beforeEach(() => {
    const config: Partial<ToolSelectionConfig> = {
      enableLearning: true,
      enablePerformanceTracking: true,
      maxCandidates: 5,
    };

    agent = new ToolSelectionAgent(config);
  });

  it("應該支持完整的學習流程", async () => {
    const tools = [
      {
        name: "testTool",
        description: "測試工具",
        inputSchema: { properties: { query: { type: "string" } } },
      },
    ];

    const shared: ChatSharedState = {
      userMessage: {
        message: "測試查詢",
        timestamp: new Date().toISOString() as any,
        sender: "user",
        isVisible: true,
      },
      chatHistory: [],
      debug: true,
    };

    // 1. 選擇工具
    const result = await agent.selectTools("測試查詢", tools, shared);
    expect(result).toBeDefined();

    // 2. 記錄反饋
    if (result.primaryTool) {
      await agent.recordFeedback(result.primaryTool.name, true, 500, 4);
    }

    // 3. 獲取統計信息
    const stats = await agent.getToolStatistics();
    expect(stats).toBeDefined();

    // 4. 重置學習數據
    await agent.resetLearningData();
  });
});
