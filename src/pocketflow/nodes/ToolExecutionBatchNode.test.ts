import {
  ToolExecutionBatchNode,
  ToolExecutionTask,
  ToolExecutionResult,
} from "./ToolExecutionBatchNode";
import { ChatSharedState } from "../types";
import { ToolManager } from "@/tools/toolManager";
import { LOADING_MESSAGES } from "@/constants";

// Mock dependencies
jest.mock("@/tools/toolManager");
jest.mock("@/logger");
jest.mock("@/constants", () => ({
  LOADING_MESSAGES: {
    DEFAULT: "處理中...",
    READING_FILES: "讀取檔案中...",
    SEARCHING_WEB: "搜索網路中...",
    READING_FILE_TREE: "讀取檔案樹中...",
  },
}));

const mockToolManager = ToolManager as jest.Mocked<typeof ToolManager>;

describe("ToolExecutionBatchNode", () => {
  let node: ToolExecutionBatchNode;
  let mockShared: ChatSharedState;

  beforeEach(() => {
    node = new ToolExecutionBatchNode();
    mockShared = {
      toolCalls: [],
      toolOutputs: [],
      mcpToolCalls: [],
      debug: true,
      updateLoadingMessage: jest.fn(),
    };

    // Reset mocks
    jest.clearAllMocks();
    mockToolManager.isMcpTool.mockReturnValue(false);
    mockToolManager.callTool.mockResolvedValue("mock result");
  });

  describe("prep", () => {
    it("should return empty array when no tool calls", async () => {
      const result = await node.prep(mockShared);
      expect(result).toEqual([]);
    });

    it("should create tasks for each tool call", async () => {
      mockShared.toolCalls = [
        { tool: { name: "tool1" }, args: { arg1: "value1" } },
        { tool: { name: "tool2" }, args: { arg2: "value2" } },
      ];

      const result = await node.prep(mockShared);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        toolCall: mockShared.toolCalls[0],
        index: 0,
      });
      expect(result[1]).toEqual({
        toolCall: mockShared.toolCalls[1],
        index: 1,
      });
    });

    it("should return empty array when shouldAbort is true", async () => {
      mockShared.shouldAbort = true;
      mockShared.toolCalls = [{ tool: { name: "tool1" }, args: {} }];

      const result = await node.prep(mockShared);
      expect(result).toEqual([]);
    });
  });

  describe("exec", () => {
    it("should execute regular tool successfully", async () => {
      const task: ToolExecutionTask = {
        toolCall: { tool: { name: "localSearch" }, args: { query: "test" } },
        index: 0,
      };

      mockToolManager.isMcpTool.mockReturnValue(false);
      mockToolManager.callTool.mockResolvedValue("search result");

      const result = await node.exec(task);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe("localSearch");
      expect(result.output).toBe("search result");
      expect(result.isMcpTool).toBe(false);
      expect(result.mcpToolCall).toBeUndefined();
    });

    it("should execute MCP tool successfully", async () => {
      const task: ToolExecutionTask = {
        toolCall: {
          tool: {
            name: "mcp_tool",
            mcpToolName: "original_tool",
            serverName: "test_server",
            serverId: "server_123",
          },
          args: { param: "value" },
        },
        index: 0,
      };

      mockToolManager.isMcpTool.mockReturnValue(true);
      mockToolManager.callTool.mockResolvedValue("mcp result");

      const result = await node.exec(task);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe("mcp_tool");
      expect(result.output).toBe("mcp result");
      expect(result.isMcpTool).toBe(true);
      expect(result.mcpToolCall).toBeDefined();
      expect(result.mcpToolCall?.status).toBe("success");
      expect(result.mcpToolCall?.originalToolName).toBe("original_tool");
    });

    it("should handle tool execution error", async () => {
      const task: ToolExecutionTask = {
        toolCall: { tool: { name: "failing_tool" }, args: {} },
        index: 0,
      };

      const error = new Error("Tool execution failed");
      mockToolManager.callTool.mockRejectedValue(error);

      const result = await node.exec(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Tool execution failed");
      expect(result.output).toBeNull();
    });

    it("should handle MCP tool execution error", async () => {
      const task: ToolExecutionTask = {
        toolCall: {
          tool: {
            name: "failing_mcp_tool",
            mcpToolName: "original_failing_tool",
            serverName: "test_server",
            serverId: "server_123",
          },
          args: {},
        },
        index: 0,
      };

      mockToolManager.isMcpTool.mockReturnValue(true);
      const error = new Error("MCP tool failed");
      mockToolManager.callTool.mockRejectedValue(error);

      const result = await node.exec(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe("MCP tool failed");
      expect(result.mcpToolCall?.status).toBe("error");
      expect(result.mcpToolCall?.error).toBe("MCP tool failed");
    });
  });

  describe("post", () => {
    it("should process successful results", async () => {
      const tasks: ToolExecutionTask[] = [
        { toolCall: { tool: { name: "tool1" } }, index: 0 },
        { toolCall: { tool: { name: "tool2" } }, index: 1 },
      ];

      const results: ToolExecutionResult[] = [
        {
          toolName: "tool1",
          output: "result1",
          success: true,
          duration: 100,
          isMcpTool: false,
        },
        {
          toolName: "tool2",
          output: "result2",
          success: true,
          duration: 200,
          isMcpTool: false,
        },
      ];

      const action = await node.post(mockShared, tasks, results);

      expect(action).toBe("default");
      expect(mockShared.toolOutputs).toHaveLength(2);
      expect(mockShared.toolOutputs![0]).toEqual({ tool: "tool1", output: "result1" });
      expect(mockShared.toolOutputs![1]).toEqual({ tool: "tool2", output: "result2" });
      expect(mockShared.updateLoadingMessage).toHaveBeenCalledWith(LOADING_MESSAGES.DEFAULT);
    });

    it("should handle mixed success and failure results", async () => {
      const tasks: ToolExecutionTask[] = [
        { toolCall: { tool: { name: "tool1" } }, index: 0 },
        { toolCall: { tool: { name: "tool2" } }, index: 1 },
      ];

      const mcpToolCall = {
        toolName: "tool2",
        originalToolName: "original_tool2",
        serverName: "test_server",
        serverId: "server_123",
        arguments: {},
        status: "error" as const,
        error: "Tool failed",
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 100,
      };

      const results: ToolExecutionResult[] = [
        {
          toolName: "tool1",
          output: "result1",
          success: true,
          duration: 100,
          isMcpTool: false,
        },
        {
          toolName: "tool2",
          output: null,
          success: false,
          error: "Tool failed",
          duration: 50,
          isMcpTool: true,
          mcpToolCall,
        },
      ];

      const action = await node.post(mockShared, tasks, results);

      expect(action).toBe("default");
      expect(mockShared.toolOutputs).toHaveLength(2);
      expect(mockShared.mcpToolCalls).toHaveLength(1);
      expect(mockShared.mcpToolCalls![0]).toBe(mcpToolCall);
    });

    it("should return undefined when shouldAbort is true", async () => {
      mockShared.shouldAbort = true;

      const action = await node.post(mockShared, [], []);
      expect(action).toBeUndefined();
    });
  });

  describe("execFallback", () => {
    it("should return error result", async () => {
      const task: ToolExecutionTask = {
        toolCall: { tool: { name: "failing_tool" } },
        index: 0,
      };
      const error = new Error("Final failure");

      const result = await node.execFallback(task, error);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Final failure");
      expect(result.toolName).toBe("failing_tool");
    });
  });
});
