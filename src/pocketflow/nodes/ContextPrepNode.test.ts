import { ContextPrepNode } from "./ContextPrepNode";
import { ChatSharedState } from "../types";
import { ChatMessage } from "@/sharedState";

describe("ContextPrepNode", () => {
  let node: ContextPrepNode;
  let shared: ChatSharedState;

  beforeEach(() => {
    node = new ContextPrepNode();
    shared = {
      userMessage: {
        message: "測試訊息",
        sender: "user",
        isVisible: true,
        timestamp: {
          fileName: "20240101_100000",
          display: "2024/01/01 10:00:00",
          epoch: 1704085200000,
        },
      } as ChatMessage,
      chatHistory: [],
      isProcessing: true,
      debug: false,
      toolCalls: [],
      toolOutputs: [],
      mcpToolCalls: [],
      sources: [],
    };
  });

  describe("prepareData", () => {
    it("應該準備基本的聊天數據", async () => {
      const result = await node["prepareData"](shared);

      expect(result).toEqual({
        userMessage: "測試訊息",
        toolOutputs: [],
        localSearchResult: undefined,
        chatHistory: [],
        cleanedUserMessage: "測試訊息",
      });
    });

    it("應該識別本地搜索結果", async () => {
      shared.toolOutputs = [
        {
          tool: "localSearch",
          output: JSON.stringify([{ title: "測試文檔", content: "測試內容" }]),
        },
        { tool: "webSearch", output: "網路搜索結果" },
      ];

      const result = await node["prepareData"](shared);

      expect(result.localSearchResult).toBeDefined();
      expect(result.localSearchResult.tool).toBe("localSearch");
    });

    it("如果沒有用戶訊息應該拋出錯誤", async () => {
      shared.userMessage = undefined;

      await expect(node["prepareData"](shared)).rejects.toThrow("缺少用戶訊息");
    });
  });

  describe("exec", () => {
    it("應該處理沒有本地搜索結果的情況", async () => {
      const prepData = {
        toolOutputs: [{ tool: "getCurrentTime", output: "2024-01-01" }],
        localSearchResult: undefined,
        chatHistory: [],
        cleanedUserMessage: "測試問題",
        userMessage: { message: "測試問題" },
      };

      const result = await node.exec(prepData);

      expect(result.finalMessage).toContain("測試問題");
      expect(result.messageContent).toHaveLength(1);
      expect(result.messageContent[0].type).toBe("text");
      expect(result.sources).toEqual([]);
    });

    it("應該處理有本地搜索結果的情況", async () => {
      const documents = [
        { title: "測試文檔", content: "測試內容", includeInContext: true, score: 0.9 },
      ];

      const prepData = {
        toolOutputs: [{ tool: "getCurrentTime", output: "2024-01-01" }],
        localSearchResult: { tool: "localSearch", output: JSON.stringify(documents) },
        chatHistory: [["之前的問題", "之前的回答"]],
        cleanedUserMessage: "測試問題",
        userMessage: { message: "測試問題" },
        toolCalls: [],
      };

      const result = await node.exec(prepData);

      expect(result.finalMessage).toContain("Context:");
      expect(result.sources).toHaveLength(1);
      expect(result.sources![0].title).toBe("測試文檔");
    });
  });

  describe("processResult", () => {
    it("應該更新共享狀態", async () => {
      const execRes = {
        finalMessage: "最終訊息",
        messageContent: [{ type: "text", text: "測試文字" }],
        systemMessage: "系統訊息",
        chatHistory: [],
        sources: [{ title: "測試", score: 0.9 }],
      };

      await node["processResult"](shared, {}, execRes);

      expect(shared.sources).toEqual([{ title: "測試", score: 0.9 }]);
      expect((shared as any).finalMessage).toBe("最終訊息");
      expect((shared as any).systemMessage).toBe("系統訊息");
    });
  });

  describe("getNextAction", () => {
    it("應該返回正確的下一個動作", () => {
      const action = node["getNextAction"](shared, {}, {});
      expect(action).toBe("llm_generation");
    });
  });

  describe("prepareEnhancedUserMessage", () => {
    it("應該增強用戶訊息與工具輸出", () => {
      const toolOutputs = [
        { tool: "webSearch", output: "搜索結果" },
        { tool: "getCurrentTime", output: "2024-01-01" },
      ];

      const result = node["prepareEnhancedUserMessage"]("測試問題", toolOutputs);

      expect(result).toContain("測試問題");
      expect(result).toContain("# Additional context:");
      expect(result).toContain("<webSearch>");
      expect(result).toContain("搜索結果");
      expect(result).toContain("<getCurrentTime>");
      expect(result).toContain("2024-01-01");
    });

    it("沒有工具輸出時應該返回原始訊息", () => {
      const result = node["prepareEnhancedUserMessage"]("測試問題", []);
      expect(result).toBe("測試問題");
    });
  });

  describe("getSources", () => {
    it("應該從文檔中提取來源", () => {
      const documents = [
        { title: "文檔1", score: 0.9 },
        { title: "文檔2", score: 0.8 },
        { title: "文檔1", score: 0.7 }, // 重複文檔，應該保留較高分數的
      ];

      const result = node["getSources"](documents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ title: "文檔1", score: 0.9, isReranked: false });
      expect(result[1]).toEqual({ title: "文檔2", score: 0.8, isReranked: false });
    });

    it("應該處理無效文檔", () => {
      const documents = [
        { title: "有效文檔", score: 0.9 },
        { title: null, score: 0.8 }, // 無效文檔
        { title: "另一個有效文檔" }, // 沒有分數
      ];

      const result = node["getSources"](documents);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("有效文檔");
    });
  });

  describe("extractEmbeddedImages", () => {
    it("應該提取嵌入的圖像", async () => {
      const content = "這是一些文字 ![[image1.png]] 和更多文字 ![[folder/image2.jpg]] 結束";

      const result = await node["extractEmbeddedImages"](content);

      expect(result).toEqual(["image1.png", "folder/image2.jpg"]);
    });

    it("沒有圖像時應該返回空陣列", async () => {
      const content = "這是純文字內容，沒有圖像";

      const result = await node["extractEmbeddedImages"](content);

      expect(result).toEqual([]);
    });
  });
});
