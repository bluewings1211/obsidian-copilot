import { LocalSearchNode } from "./LocalSearchNode";
import { ChatSharedState } from "../types";
import { ToolManager } from "@/tools/toolManager";
import { localSearchTool } from "@/tools/SearchTools";
import { LOADING_MESSAGES } from "@/constants";

// Mock dependencies
jest.mock("@/tools/toolManager");
jest.mock("@/tools/SearchTools");
jest.mock("@/logger");
jest.mock("@/constants", () => ({
  LOADING_MESSAGES: {
    DEFAULT: "處理中...",
    READING_FILES: "讀取檔案中...",
  },
}));

const mockToolManager = ToolManager as jest.Mocked<typeof ToolManager>;

describe("LocalSearchNode", () => {
  let node: LocalSearchNode;
  let mockShared: ChatSharedState;

  beforeEach(() => {
    node = new LocalSearchNode();
    mockShared = {
      userMessage: {
        message: "搜尋機器學習相關筆記",
        sender: "user",
        timestamp: "2024-01-01T00:00:00.000Z" as any,
        isVisible: true,
      },
      intentAnalysisResult: {
        toolCalls: [],
        detectedTools: [],
        salientTerms: ["機器學習", "AI"],
        suggestedAction: "local_search",
      },
      debug: true,
      updateLoadingMessage: jest.fn(),
    };

    // Reset mocks
    jest.clearAllMocks();
    mockToolManager.callTool.mockResolvedValue(
      JSON.stringify([
        {
          title: "機器學習基礎",
          content: "機器學習是一種人工智能技術...",
          path: "notes/ml-basics.md",
          score: 0.95,
          includeInContext: true,
        },
        {
          title: "深度學習入門",
          content: "深度學習是機器學習的一個分支...",
          path: "notes/deep-learning.md",
          score: 0.87,
          includeInContext: true,
        },
      ])
    );
  });

  describe("prep", () => {
    it("should prepare search parameters correctly", async () => {
      const result = await node.prep(mockShared);

      expect(result).toEqual({
        query: "搜尋機器學習相關筆記",
        salientTerms: ["機器學習", "AI"],
        timeRange: undefined,
      });

      expect(mockShared.updateLoadingMessage).toHaveBeenCalledWith(LOADING_MESSAGES.READING_FILES);
      expect(mockShared.currentStep).toBe("本地搜索");
    });

    it("should handle missing user message", async () => {
      mockShared.userMessage = undefined;

      await expect(node.prep(mockShared)).rejects.toThrow("缺少用戶消息");
    });

    it("should handle missing intent analysis result", async () => {
      mockShared.intentAnalysisResult = undefined;

      const result = await node.prep(mockShared);

      expect(result.salientTerms).toEqual([]);
      expect(result.timeRange).toBeUndefined();
    });

    it("should abort when shouldAbort is true", async () => {
      mockShared.shouldAbort = true;

      await expect(node.prep(mockShared)).rejects.toThrow("處理已中止");
    });
  });

  describe("exec", () => {
    it("should execute local search successfully", async () => {
      const searchParams = {
        query: "機器學習",
        salientTerms: ["機器學習", "AI"],
        timeRange: undefined,
      };

      const result = await node.exec(searchParams);

      expect(mockToolManager.callTool).toHaveBeenCalledWith(localSearchTool, searchParams);
      expect(result).toEqual(expect.stringContaining("機器學習基礎"));
    });

    it("should handle search failure", async () => {
      const error = new Error("Search failed");
      mockToolManager.callTool.mockRejectedValue(error);

      const searchParams = {
        query: "機器學習",
        salientTerms: [],
        timeRange: undefined,
      };

      await expect(node.exec(searchParams)).rejects.toThrow("Search failed");
    });
  });

  describe("post", () => {
    it("should process search results correctly", async () => {
      const searchResult = JSON.stringify([
        {
          title: "機器學習基礎",
          content: "內容...",
          score: 0.95,
          rerank_score: 0.92,
        },
        {
          title: "深度學習入門",
          content: "內容...",
          score: 0.87,
        },
      ]);

      const action = await node.post(mockShared, {}, searchResult);

      expect(mockShared.localSearchResults).toHaveLength(2);
      expect(mockShared.retrievedDocuments).toHaveLength(2);
      expect(mockShared.sources).toHaveLength(2);
      expect(mockShared.sources![0].title).toBe("機器學習基礎");
      expect(mockShared.sources![0].score).toBe(0.92); // rerank_score 優先
      expect(mockShared.updateLoadingMessage).toHaveBeenCalledWith(LOADING_MESSAGES.DEFAULT);
      expect(action).toBe("local_search_success");
    });

    it("should handle invalid JSON result", async () => {
      const invalidResult = "invalid json";

      const action = await node.post(mockShared, {}, invalidResult);

      expect(mockShared.localSearchResults).toEqual([]);
      expect(mockShared.sources).toEqual([]);
      expect(action).toBe("local_search_empty");
    });

    it("should return undefined when shouldAbort is true", async () => {
      mockShared.shouldAbort = true;

      const action = await node.post(mockShared, {}, "");

      expect(action).toBeUndefined();
    });
  });

  describe("execFallback", () => {
    it("should return empty array on failure", async () => {
      const error = new Error("Final failure");
      const result = await node.execFallback({}, error);

      expect(result).toBe(JSON.stringify([]));
    });
  });
});
