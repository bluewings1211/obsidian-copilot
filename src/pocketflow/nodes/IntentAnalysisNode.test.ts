import { IntentAnalysisNode, IntentAnalysisResult } from "./IntentAnalysisNode";
import { ChatSharedState } from "../types";

// Mock all external dependencies
jest.mock("@/LLMProviders/brevilabsClient", () => ({
  BrevilabsClient: {
    getInstance: jest.fn(() => ({
      broca: jest.fn(),
    })),
  },
}));

jest.mock("@/mcp/tool-adapter", () => ({
  McpToolAdapterManager: {
    isInitialized: jest.fn(() => false),
    getInstance: jest.fn(() => ({
      getTools: jest.fn(() => Promise.resolve([])),
    })),
  },
}));

jest.mock("@/settings/model", () => ({
  getSettings: jest.fn(() => ({
    mcpIntegration: { enabled: false },
  })),
}));

jest.mock("@/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("@/utils", () => ({
  extractChatHistory: jest.fn(() => []),
  extractYoutubeUrl: jest.fn(),
}));

jest.mock("@/LLMProviders/memoryManager", () => ({
  default: {
    getInstance: jest.fn(() => ({
      getMemory: jest.fn(() => ({
        loadMemoryVariables: jest.fn(() => Promise.resolve({})),
      })),
    })),
  },
}));

jest.mock("@/tools/toolManager", () => ({
  ToolManager: {
    callTool: jest.fn(),
  },
}));

jest.mock("@/tools/SearchTools", () => ({
  indexTool: { name: "indexTool" },
  localSearchTool: { name: "localSearchTool" },
  webSearchTool: { name: "webSearchTool" },
}));

jest.mock("@/tools/TimeTools", () => ({
  getCurrentTimeTool: { name: "getCurrentTimeTool" },
  getTimeInfoByEpochTool: { name: "getTimeInfoByEpochTool" },
  getTimeRangeMsTool: { name: "getTimeRangeMsTool" },
  pomodoroTool: { name: "pomodoroTool" },
}));

jest.mock("@/tools/FileTreeTools", () => ({
  createGetFileTreeTool: jest.fn(() => ({ name: "getFileTreeTool" })),
}));

// Mock Obsidian Vault
interface MockVault {
  getRoot(): any;
}

// Import the mocked dependencies
import { BrevilabsClient } from "@/LLMProviders/brevilabsClient";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { getSettings } from "@/settings/model";

describe("IntentAnalysisNode", () => {
  let node: IntentAnalysisNode;
  let mockVault: MockVault;
  let mockSharedState: ChatSharedState;

  beforeEach(() => {
    // Mock Vault
    mockVault = {
      getRoot: jest.fn().mockReturnValue({}),
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Mock settings
    (getSettings as jest.Mock).mockReturnValue({
      mcpIntegration: {
        enabled: false,
      },
    });

    // Mock MCP Tool Adapter
    (McpToolAdapterManager.isInitialized as jest.Mock).mockReturnValue(false);

    node = new IntentAnalysisNode(mockVault as any);

    // 設置測試用的共享狀態
    mockSharedState = {
      userMessage: {
        message: "測試訊息",
        sender: "user",
        isVisible: true,
        timestamp: new Date().toISOString(),
      } as any,
      isProcessing: false,
      debug: true,
      toolCalls: [],
      sources: [],
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("prepareData", () => {
    it("應該返回用戶訊息", async () => {
      const result = await node["prepareData"](mockSharedState);
      expect(result).toBe("測試訊息");
    });

    it("當沒有用戶訊息時應該拋出錯誤", async () => {
      mockSharedState.userMessage = undefined;

      await expect(node["prepareData"](mockSharedState)).rejects.toThrow("用戶訊息不能為空");
    });

    it("當用戶訊息為空時應該拋出錯誤", async () => {
      mockSharedState.userMessage!.message = "";

      await expect(node["prepareData"](mockSharedState)).rejects.toThrow("用戶訊息不能為空");
    });
  });

  describe("exec - 基本意圖分析", () => {
    it("應該處理沒有工具調用的簡單訊息", async () => {
      // Mock Broca 服務失敗
      const mockBrocaClient = {
        broca: jest.fn().mockRejectedValue(new Error("Broca 不可用")),
      };
      (BrevilabsClient.getInstance as jest.Mock).mockReturnValue(mockBrocaClient);

      const result = await node.exec("這是一個簡單的問題");

      expect(result).toEqual({
        toolCalls: [],
        detectedTools: [],
        salientTerms: expect.any(Array),
        suggestedAction: "direct_llm",
      });
    });

    it("應該提取基本的顯著詞彙", async () => {
      const mockBrocaClient = {
        broca: jest.fn().mockRejectedValue(new Error("Broca 不可用")),
      };
      (BrevilabsClient.getInstance as jest.Mock).mockReturnValue(mockBrocaClient);

      const result = await node.exec("請幫我搜尋關於機器學習的資料");

      expect(result.salientTerms).toContain("搜尋");
      expect(result.salientTerms).toContain("機器學習");
      expect(result.salientTerms).toContain("資料");
      expect(result.suggestedAction).toBe("direct_llm");
    });
  });

  describe("exec - @ 命令處理", () => {
    beforeEach(() => {
      // Mock Broca 服務失敗，確保測試 @ 命令處理
      const mockBrocaClient = {
        broca: jest.fn().mockRejectedValue(new Error("Broca 不可用")),
      };
      (BrevilabsClient.getInstance as jest.Mock).mockReturnValue(mockBrocaClient);
    });

    it("應該檢測 @vault 命令", async () => {
      const result = await node.exec("@vault 搜尋筆記");

      expect(result.detectedTools).toContain("@vault");
      expect(result.suggestedAction).toBe("local_search");
      expect(result.toolCalls).toHaveLength(1);
    });

    it("應該檢測 @web 命令", async () => {
      // Mock MemoryManager
      const mockMemory = {
        loadMemoryVariables: jest.fn().mockResolvedValue({}),
      };
      const mockMemoryManager = {
        getInstance: jest.fn().mockReturnValue({
          getMemory: jest.fn().mockReturnValue(mockMemory),
        }),
      };
      jest.doMock("@/LLMProviders/memoryManager", () => ({
        default: mockMemoryManager,
      }));

      const result = await node.exec("@web 搜尋最新資訊");

      expect(result.detectedTools).toContain("@web");
      expect(result.suggestedAction).toBe("web_search");
      expect(result.toolCalls).toHaveLength(1);
    });

    it("應該檢測 @pomodoro 命令", async () => {
      const result = await node.exec("@pomodoro 25min");

      expect(result.detectedTools).toContain("@pomodoro");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].args.interval).toBe("25min");
    });

    it("應該處理沒有參數的 @pomodoro 命令", async () => {
      const result = await node.exec("@pomodoro");

      expect(result.detectedTools).toContain("@pomodoro");
      expect(result.toolCalls[0].args.interval).toBe("25min"); // 預設值
    });

    it("應該檢測 @youtube 命令", async () => {
      const result = await node.exec("@youtube https://youtube.com/watch?v=test");

      expect(result.detectedTools).toContain("@youtube");
    });
  });

  describe("exec - MCP 工具處理", () => {
    beforeEach(() => {
      // 啟用 MCP 整合
      (getSettings as jest.Mock).mockReturnValue({
        mcpIntegration: {
          enabled: true,
        },
      });

      (McpToolAdapterManager.isInitialized as jest.Mock).mockReturnValue(true);

      // Mock Broca 服務失敗，確保測試 MCP 工具處理
      const mockBrocaClient = {
        broca: jest.fn().mockRejectedValue(new Error("Broca 不可用")),
      };
      (BrevilabsClient.getInstance as jest.Mock).mockReturnValue(mockBrocaClient);
    });

    it("應該檢測 MCP 工具調用", async () => {
      const mockAdapter = {
        getTools: jest.fn().mockResolvedValue([
          {
            name: "mcp_test_tool",
            inputSchema: {
              properties: {
                query: { type: "string" },
              },
            },
          },
        ]),
      };
      (McpToolAdapterManager.getInstance as jest.Mock).mockReturnValue(mockAdapter);

      const result = await node.exec("@mcp_test_tool 搜尋資料");

      expect(result.detectedTools).toContain("mcp_test_tool");
      expect(result.suggestedAction).toBe("mcp_tools");
      expect(result.toolCalls).toHaveLength(1);
    });

    it("應該處理 sequential thinking 工具", async () => {
      const mockAdapter = {
        getTools: jest.fn().mockResolvedValue([
          {
            name: "mcp_sequential_thinking",
            inputSchema: {
              properties: {
                thought: { type: "string" },
                thoughtNumber: { type: "number" },
                totalThoughts: { type: "number" },
                nextThoughtNeeded: { type: "boolean" },
              },
            },
          },
        ]),
      };
      (McpToolAdapterManager.getInstance as jest.Mock).mockReturnValue(mockAdapter);

      const result = await node.exec("@mcp_sequential_thinking 分析這個問題");

      expect(result.toolCalls[0].args).toEqual({
        thought: "分析這個問題",
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
    });
  });

  describe("exec - Broca 服務整合", () => {
    it("應該使用 Broca 服務進行意圖分析", async () => {
      const mockBrocaClient = {
        broca: jest.fn().mockResolvedValue({
          response: {
            tool_calls: [
              {
                tool: "localSearchTool",
                args: { query: "測試查詢" },
              },
            ],
            salience_terms: ["測試", "查詢"],
          },
        }),
      };
      (BrevilabsClient.getInstance as jest.Mock).mockReturnValue(mockBrocaClient);

      const result = await node.exec("搜尋測試資料");

      expect(mockBrocaClient.broca).toHaveBeenCalledWith("搜尋測試資料");
      expect(result.salientTerms).toEqual(["測試", "查詢"]);
    });

    it("當 Broca 服務失敗時應該回退到基本處理", async () => {
      const mockBrocaClient = {
        broca: jest.fn().mockRejectedValue(new Error("網路錯誤")),
      };
      (BrevilabsClient.getInstance as jest.Mock).mockReturnValue(mockBrocaClient);

      const result = await node.exec("搜尋測試資料");

      expect(result.salientTerms).toBeDefined();
      expect(result.suggestedAction).toBe("direct_llm");
    });
  });

  describe("determineSuggestedAction", () => {
    it("應該優先選擇本地搜索", () => {
      const result = node["determineSuggestedAction"](["@vault"], []);
      expect(result).toBe("local_search");
    });

    it("應該選擇網頁搜索", () => {
      const result = node["determineSuggestedAction"](["@web"], []);
      expect(result).toBe("web_search");
    });

    it("應該選擇 MCP 工具", () => {
      const result = node["determineSuggestedAction"](["mcp_test_tool"], []);
      expect(result).toBe("mcp_tools");
    });

    it("應該選擇工具執行", () => {
      const result = node["determineSuggestedAction"]([], [{ tool: {}, args: {} }]);
      expect(result).toBe("tool_execution");
    });

    it("應該預設為直接 LLM", () => {
      const result = node["determineSuggestedAction"]([], []);
      expect(result).toBe("direct_llm");
    });
  });

  describe("extractBasicSalientTerms", () => {
    it("應該提取有意義的詞彙", () => {
      const result = node["extractBasicSalientTerms"](
        "@vault 請幫我搜尋關於機器學習的深度學習資料"
      );

      expect(result).toContain("搜尋");
      expect(result).toContain("機器學習");
      expect(result).toContain("深度學習");
      expect(result).toContain("資料");
      expect(result).not.toContain("the");
      expect(result).not.toContain("請");
    });

    it("應該限制詞彙數量", () => {
      const longMessage = "請幫我搜尋關於機器學習深度學習神經網路人工智慧自然語言處理的資料";
      const result = node["extractBasicSalientTerms"](longMessage);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe("processResult", () => {
    it("應該更新共享狀態", async () => {
      const mockResult: IntentAnalysisResult = {
        toolCalls: [{ tool: {}, args: {} }],
        detectedTools: ["@vault"],
        salientTerms: ["測試"],
        suggestedAction: "local_search",
      };

      await node["processResult"](mockSharedState, "測試訊息", mockResult);

      expect(mockSharedState.toolCalls).toBe(mockResult.toolCalls);
      expect(mockSharedState.searchQuery).toBe("測試訊息");
    });
  });

  describe("getNextAction", () => {
    it("應該返回建議的動作", () => {
      const mockResult: IntentAnalysisResult = {
        toolCalls: [],
        detectedTools: [],
        salientTerms: [],
        suggestedAction: "local_search",
      };

      const result = node["getNextAction"](mockSharedState, "測試", mockResult);
      expect(result).toBe("local_search");
    });
  });

  describe("execFallback", () => {
    it("應該提供回退結果", async () => {
      const error = new Error("測試錯誤");
      const result = await node.execFallback("測試訊息", error);

      expect(result).toEqual({
        toolCalls: [],
        detectedTools: [],
        salientTerms: expect.any(Array),
        suggestedAction: "direct_llm",
      });
    });

    it("應該處理非字符串的 prepRes", async () => {
      const error = new Error("測試錯誤");
      const result = await node.execFallback({}, error);

      expect(result.suggestedAction).toBe("direct_llm");
      expect(result.salientTerms).toEqual([]);
    });
  });

  describe("錯誤處理", () => {
    it("應該在步驟中止時停止處理", async () => {
      mockSharedState.shouldAbort = true;

      await expect(node["prepareData"](mockSharedState)).rejects.toThrow("處理已中止");
    });

    it("應該在 AbortController 中止時停止處理", async () => {
      const abortController = new AbortController();
      abortController.abort();
      mockSharedState.abortController = abortController;

      await expect(node["prepareData"](mockSharedState)).rejects.toThrow("處理已中止");
    });
  });
});
