/**
 * ChatFlow 整合測試
 *
 * 測試完整的聊天流程功能，包括節點整合、流程執行和與現有系統的兼容性。
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ChatFlow, createDefaultChatFlow, createSimpleChatFlow } from "../flows/ChatFlow";
import {
  PocketFlowChainRunner,
  SimplePocketFlowChainRunner,
} from "../integration/PocketFlowChainRunner";
import { FlowVisualizer, PerformanceMonitor, DebugVisualizer } from "../visualization/FlowDiagrams";
import { ChatSharedState } from "../types";
import { ChatMessage } from "@/sharedState";

// Mock dependencies
const mockVault = {
  getRoot: () => ({ path: "/" }),
  adapter: { path: { join: (...args: string[]) => args.join("/") } },
};

const mockChainManager = {
  memoryManager: {
    getMemory: () => ({
      loadMemoryVariables: async () => ({ history: [] }),
      saveContext: async () => {},
    }),
  },
  chatModelManager: {
    getChatModel: () => ({ modelName: "test-model" }),
  },
};

describe("ChatFlow 整合測試", () => {
  let chatFlow: ChatFlow;
  let mockUpdateCurrentAiMessage: jest.MockedFunction<any>;
  let mockAddMessage: jest.MockedFunction<any>;
  let mockUpdateLoading: jest.MockedFunction<any>;
  let mockUpdateLoadingMessage: jest.MockedFunction<any>;

  beforeEach(() => {
    // 重置所有 mock
    jest.clearAllMocks();

    // 設置 mock 函數
    mockUpdateCurrentAiMessage = jest.fn();
    mockAddMessage = jest.fn();
    mockUpdateLoading = jest.fn();
    mockUpdateLoadingMessage = jest.fn();

    // 創建 ChatFlow 實例
    chatFlow = createDefaultChatFlow(mockVault);

    // 重置可視化數據
    FlowVisualizer.resetAllData();
  });

  afterEach(() => {
    // 清理
    FlowVisualizer.resetAllData();
  });

  describe("基本流程測試", () => {
    it("應該成功創建 ChatFlow 實例", () => {
      expect(chatFlow).toBeDefined();
      expect(chatFlow.getConfig()).toBeDefined();
      expect(chatFlow.getStats().totalNodes).toBe(5);
    });

    it("應該正確驗證流程", () => {
      const validation = chatFlow.validateFlow();
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it("應該正確生成 Mermaid 圖表", () => {
      const diagram = chatFlow.generateMermaidDiagram();
      expect(diagram).toContain("graph TD");
      expect(diagram).toContain("IntentAnalysisNode");
      expect(diagram).toContain("LLMGenerationNode");
    });
  });

  describe("流程執行測試", () => {
    it("應該處理簡單的用戶訊息", async () => {
      const userMessage: ChatMessage = {
        message: "Hello, how are you?",
        sender: "User",
        isVisible: true,
        timestamp: "2024-01-01T00:00:00.000Z" as any,
      };

      const shared: ChatSharedState = {
        userMessage,
        chatHistory: [],
        isProcessing: false,
        debug: false,
        abortController: new AbortController(),
        updateCurrentAiMessage: mockUpdateCurrentAiMessage,
        addMessage: mockAddMessage,
        updateLoading: mockUpdateLoading,
        updateLoadingMessage: mockUpdateLoadingMessage,
      };

      // 測試會在模擬節點中完成，不會實際調用真實服務
      const result = await chatFlow.execute(shared);

      expect(result).toBeDefined();
      expect(shared.isProcessing).toBe(false);
      expect(shared.currentStep).toBe("completed");
    });

    it("應該處理包含工具調用的訊息", async () => {
      const userMessage: ChatMessage = {
        message: "@vault search for notes about testing",
        sender: "User",
        isVisible: true,
        timestamp: "2024-01-01T00:00:00.000Z" as any,
      };

      const shared: ChatSharedState = {
        userMessage,
        chatHistory: [],
        isProcessing: false,
        debug: true,
        abortController: new AbortController(),
        updateCurrentAiMessage: mockUpdateCurrentAiMessage,
        addMessage: mockAddMessage,
        updateLoading: mockUpdateLoading,
        updateLoadingMessage: mockUpdateLoadingMessage,
      };

      const result = await chatFlow.execute(shared);

      expect(result).toBeDefined();
      expect(mockUpdateLoadingMessage).toHaveBeenCalled();
    });

    it("應該正確處理錯誤情況", async () => {
      const userMessage: ChatMessage = {
        message: "",
        sender: "User",
        isVisible: true,
        timestamp: "2024-01-01T00:00:00.000Z" as any,
      };

      const shared: ChatSharedState = {
        userMessage,
        chatHistory: [],
        isProcessing: false,
        debug: false,
        abortController: new AbortController(),
        updateCurrentAiMessage: mockUpdateCurrentAiMessage,
        addMessage: mockAddMessage,
        updateLoading: mockUpdateLoading,
        updateLoadingMessage: mockUpdateLoadingMessage,
      };

      await expect(chatFlow.execute(shared)).rejects.toThrow();
      expect(shared.isProcessing).toBe(false);
      expect(shared.error).toBeDefined();
    });
  });

  describe("配置管理測試", () => {
    it("應該正確更新配置", () => {
      const originalConfig = chatFlow.getConfig();

      chatFlow.updateConfig({
        enableDebug: true,
        maxRetries: 5,
      });

      const updatedConfig = chatFlow.getConfig();
      expect(updatedConfig.enableDebug).toBe(true);
      expect(updatedConfig.maxRetries).toBe(5);
      expect(updatedConfig.enableLocalSearch).toBe(originalConfig.enableLocalSearch);
    });

    it("應該正確獲取統計信息", () => {
      const stats = chatFlow.getStats();

      expect(stats.totalNodes).toBe(5);
      expect(stats.enabledFeatures).toContain("localSearch");
      expect(stats.enabledFeatures).toContain("webSearch");
      expect(stats.enabledFeatures).toContain("mcpTools");
    });
  });

  describe("工廠函數測試", () => {
    it("應該創建簡化版 ChatFlow", () => {
      const simpleChatFlow = createSimpleChatFlow(mockVault);
      const config = simpleChatFlow.getConfig();

      expect(config.enableLocalSearch).toBe(false);
      expect(config.enableWebSearch).toBe(false);
      expect(config.enableMcpTools).toBe(false);
      expect(config.maxRetries).toBe(1);
    });

    it("應該創建自定義配置的 ChatFlow", () => {
      const customChatFlow = createDefaultChatFlow(mockVault, {
        enableDebug: true,
        maxRetries: 10,
      });

      const config = customChatFlow.getConfig();
      expect(config.enableDebug).toBe(true);
      expect(config.maxRetries).toBe(10);
    });
  });
});

describe("PocketFlowChainRunner 整合測試", () => {
  let chainRunner: PocketFlowChainRunner;
  let simpleChainRunner: SimplePocketFlowChainRunner;

  beforeEach(() => {
    chainRunner = new PocketFlowChainRunner(mockChainManager as any, mockVault as any);
    simpleChainRunner = new SimplePocketFlowChainRunner(mockChainManager as any, mockVault as any);
  });

  describe("ChainRunner 介面兼容性", () => {
    it("應該實現 ChainRunner 介面", () => {
      expect(chainRunner.run).toBeDefined();
      expect(typeof chainRunner.run).toBe("function");
    });

    it("應該處理 run 方法調用", async () => {
      const userMessage: ChatMessage = {
        message: "Test message",
        sender: "User",
        isVisible: true,
        timestamp: "2024-01-01T00:00:00.000Z" as any,
      };

      const abortController = new AbortController();
      const updateCurrentAiMessage = jest.fn();
      const addMessage = jest.fn();

      const result = await chainRunner.run(
        userMessage,
        abortController,
        updateCurrentAiMessage,
        addMessage,
        { debug: false }
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("應該正確處理錯誤", async () => {
      const userMessage: ChatMessage = {
        message: "",
        sender: "User",
        isVisible: true,
        timestamp: "2024-01-01T00:00:00.000Z" as any,
      };

      const abortController = new AbortController();
      const updateCurrentAiMessage = jest.fn();
      const addMessage = jest.fn();

      const result = await chainRunner.run(
        userMessage,
        abortController,
        updateCurrentAiMessage,
        addMessage,
        { debug: true }
      );

      expect(result).toBe("");
      expect(addMessage).toHaveBeenCalled();
    });
  });

  describe("簡化版 ChainRunner", () => {
    it("應該創建簡化版實例", () => {
      expect(simpleChainRunner).toBeDefined();
      expect(simpleChainRunner.run).toBeDefined();
    });

    it("應該執行簡化流程", async () => {
      const userMessage: ChatMessage = {
        message: "Simple test",
        sender: "User",
        isVisible: true,
        timestamp: "2024-01-01T00:00:00.000Z" as any,
      };

      const result = await simpleChainRunner.run(
        userMessage,
        new AbortController(),
        jest.fn(),
        jest.fn(),
        { debug: false }
      );

      expect(result).toBeDefined();
    });
  });

  describe("配置管理", () => {
    it("應該支援配置更新", () => {
      expect(() => {
        chainRunner.updateConfig({
          enableDebug: true,
          enableLocalSearch: false,
        });
      }).not.toThrow();
    });

    it("應該提供統計信息", () => {
      const stats = chainRunner.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalNodes).toBe(5);
    });

    it("應該支援流程驗證", () => {
      const validation = chainRunner.validate();
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });
});

describe("可視化工具測試", () => {
  let testChatFlow: ChatFlow;

  beforeEach(() => {
    testChatFlow = createDefaultChatFlow(mockVault);
    FlowVisualizer.resetAllData();
  });

  describe("流程圖生成", () => {
    it("應該生成完整報告", () => {
      const report = FlowVisualizer.generateCompleteReport(testChatFlow);

      expect(report.basicDiagram).toContain("graph TD");
      expect(report.detailedDiagram).toContain("配置");
      expect(report.healthReport).toBeDefined();
      expect(report.healthReport.overall).toMatch(/healthy|warning|critical/);
    });
  });

  describe("性能監控", () => {
    it("應該記錄和導出性能指標", () => {
      PerformanceMonitor.recordMetric("testNode", 100);
      PerformanceMonitor.recordMetric("testNode", 200);

      const metrics = PerformanceMonitor.exportMetrics();
      expect(metrics.testNode).toBeDefined();
      expect(metrics.testNode.averageTime).toBe(150);
      expect(metrics.testNode.executionTime).toHaveLength(2);
    });

    it("應該生成性能報告", () => {
      PerformanceMonitor.recordMetric("node1", 100);
      PerformanceMonitor.recordMetric("node2", 200);

      const report = PerformanceMonitor.generatePerformanceReport();
      expect(report).toContain("node1");
      expect(report).toContain("node2");
      expect(report).toContain("平均");
    });
  });

  describe("調試工具", () => {
    it("應該記錄和導出調試日誌", () => {
      DebugVisualizer.log("testNode", "start", { test: true });
      DebugVisualizer.log("testNode", "end", { result: "success" });

      const logs = DebugVisualizer.exportLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].nodeId).toBe("testNode");
      expect(logs[0].action).toBe("start");
    });

    it("應該生成調試時間線", () => {
      DebugVisualizer.log("node1", "execute", {});
      DebugVisualizer.log("node2", "execute", {});

      const timeline = DebugVisualizer.generateDebugTimeline();
      expect(timeline).toContain("graph TD");
      expect(timeline).toContain("node1");
      expect(timeline).toContain("node2");
    });
  });

  describe("數據導出和重置", () => {
    it("應該導出所有數據", () => {
      PerformanceMonitor.recordMetric("test", 100);
      DebugVisualizer.log("test", "action", {});

      const data = FlowVisualizer.exportAllData();
      expect(data.performanceMetrics).toBeDefined();
      expect(data.debugLogs).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it("應該重置所有數據", () => {
      PerformanceMonitor.recordMetric("test", 100);
      DebugVisualizer.log("test", "action", {});

      FlowVisualizer.resetAllData();

      const metrics = PerformanceMonitor.exportMetrics();
      const logs = DebugVisualizer.exportLogs();

      expect(Object.keys(metrics)).toHaveLength(0);
      expect(logs).toHaveLength(0);
    });
  });
});

describe("端到端整合測試", () => {
  it("應該完整執行聊天流程並生成報告", async () => {
    const chatFlow = createDefaultChatFlow(mockVault, { enableDebug: true });

    // 記錄性能開始
    const startTime = Date.now();

    const userMessage: ChatMessage = {
      message: "Tell me about the weather",
      sender: "User",
      isVisible: true,
      timestamp: "2024-01-01T00:00:00.000Z" as any,
    };

    const shared: ChatSharedState = {
      userMessage,
      chatHistory: [],
      isProcessing: false,
      debug: true,
      abortController: new AbortController(),
      updateCurrentAiMessage: jest.fn(),
      addMessage: jest.fn(),
      updateLoading: jest.fn(),
      updateLoadingMessage: jest.fn(),
    };

    // 執行流程
    const result = await chatFlow.execute(shared);

    // 記錄性能結束
    const endTime = Date.now();
    PerformanceMonitor.recordMetric("fullFlow", endTime - startTime);

    // 生成完整報告
    const report = FlowVisualizer.generateCompleteReport(chatFlow);

    expect(result).toBeDefined();
    expect(report.healthReport.overall).toBeDefined();
    expect(shared.isProcessing).toBe(false);
    expect(shared.currentStep).toBe("completed");
  });
});
