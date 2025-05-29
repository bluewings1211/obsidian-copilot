/**
 * MCP Tool Adapter Test Suite
 */

import { McpToolAdapter, McpToolAdapterManager } from "./tool-adapter";
import { McpManager } from "./manager";
import type { AggregatedTool } from "./manager";
import type { CallToolResult } from "./types";

// Mock dependencies
jest.mock("./manager");
jest.mock("./utils", () => ({
  safeStringify: jest.fn((obj) => JSON.stringify(obj)),
}));

describe("McpToolAdapter", () => {
  let mockMcpManager: jest.Mocked<McpManager>;
  let toolAdapter: McpToolAdapter;

  const mockTool: AggregatedTool = {
    name: "test-tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
    serverId: "test-server-id",
    serverName: "Test Server",
  };

  const mockToolResult: CallToolResult = {
    content: [
      {
        type: "text",
        text: "Test result",
      },
    ],
  };

  beforeEach(() => {
    // Create mock MCP manager
    mockMcpManager = {
      getTools: jest.fn(),
      callTool: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
    } as any;

    // Create tool adapter instance
    toolAdapter = new McpToolAdapter(mockMcpManager, { debug: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Tool Discovery", () => {
    it("should get all MCP tools", async () => {
      mockMcpManager.getTools.mockResolvedValue([mockTool]);

      const tools = await toolAdapter.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("mcp_test_server_test-tool");
      expect(tools[0].description).toBe("A test tool");
      expect(tools[0].mcpToolName).toBe("test-tool");
      expect(tools[0].serverId).toBe("test-server-id");
      expect(tools[0].serverName).toBe("Test Server");
    });

    it("should get specific tool by name", async () => {
      mockMcpManager.getTools.mockResolvedValue([mockTool]);

      const tool = await toolAdapter.getTool("mcp_test_server_test-tool");

      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("mcp_test_server_test-tool");
      expect(tool?.mcpToolName).toBe("test-tool");
    });

    it("should return null for non-existent tool", async () => {
      mockMcpManager.getTools.mockResolvedValue([]);

      const tool = await toolAdapter.getTool("non-existent-tool");

      expect(tool).toBeNull();
    });

    it("should get tool description", async () => {
      mockMcpManager.getTools.mockResolvedValue([mockTool]);

      const description = await toolAdapter.getToolDescription("mcp_test_server_test-tool");

      expect(description).toBe("A test tool");
    });

    it("should return empty string for non-existent tool description", async () => {
      mockMcpManager.getTools.mockResolvedValue([]);

      const description = await toolAdapter.getToolDescription("non-existent-tool");

      expect(description).toBe("");
    });
  });

  describe("Tool Identification", () => {
    it("should identify MCP tools correctly", () => {
      expect(toolAdapter.isMcpTool("mcp_server_tool")).toBe(true);
      expect(toolAdapter.isMcpTool("regular_tool")).toBe(false);
      expect(toolAdapter.isMcpTool("@vault")).toBe(false);
    });
  });

  describe("Tool Execution", () => {
    beforeEach(() => {
      mockMcpManager.getTools.mockResolvedValue([mockTool]);
      mockMcpManager.callTool.mockResolvedValue(mockToolResult);
    });

    it("should call MCP tool successfully", async () => {
      const args = { query: "test query" };
      const result = await toolAdapter.callTool("mcp_test_server_test-tool", args);

      expect(result).toBe("Test result");
      expect(mockMcpManager.callTool).toHaveBeenCalledWith("test-server-id", {
        name: "test-tool",
        arguments: args,
      });
    });

    it("should handle tool not found error", async () => {
      mockMcpManager.getTools.mockResolvedValue([]);

      await expect(toolAdapter.callTool("non-existent-tool", {})).rejects.toThrow(
        "MCP tool 'non-existent-tool' not found"
      );
    });

    it("should handle tool execution error", async () => {
      const error = new Error("Tool execution failed");
      mockMcpManager.callTool.mockRejectedValue(error);

      await expect(toolAdapter.callTool("mcp_test_server_test-tool", {})).rejects.toThrow(
        "MCP tool error: Tool execution failed"
      );
    });

    it("should handle timeout", async () => {
      const slowAdapter = new McpToolAdapter(mockMcpManager, { timeout: 100 });
      mockMcpManager.getTools.mockResolvedValue([mockTool]);

      // Mock a slow call
      mockMcpManager.callTool.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200))
      );

      await expect(slowAdapter.callTool("mcp_test_server_test-tool", {})).rejects.toThrow(
        "timed out after 100ms"
      );
    });
  });

  describe("Tool Result Formatting", () => {
    beforeEach(() => {
      mockMcpManager.getTools.mockResolvedValue([mockTool]);
    });

    it("should format single text content", async () => {
      const textResult: CallToolResult = {
        content: [{ type: "text", text: "Simple text" }],
      };
      mockMcpManager.callTool.mockResolvedValue(textResult);

      const result = await toolAdapter.callTool("mcp_test_server_test-tool", {});
      expect(result).toBe("Simple text");
    });

    it("should format single resource content", async () => {
      const resourceResult: CallToolResult = {
        content: [
          {
            type: "resource",
            resource: {
              uri: "test://resource",
              mimeType: "text/plain",
              text: "Resource content",
            },
          },
        ],
      };
      mockMcpManager.callTool.mockResolvedValue(resourceResult);

      const result = await toolAdapter.callTool("mcp_test_server_test-tool", {});
      expect(result).toEqual({
        type: "resource",
        resource: {
          uri: "test://resource",
          mimeType: "text/plain",
          text: "Resource content",
        },
      });
    });

    it("should format multiple content items", async () => {
      const multiResult: CallToolResult = {
        content: [
          { type: "text", text: "Text 1" },
          { type: "text", text: "Text 2" },
        ],
      };
      mockMcpManager.callTool.mockResolvedValue(multiResult);

      const result = await toolAdapter.callTool("mcp_test_server_test-tool", {});
      expect(result).toEqual({
        isError: false,
        content: [
          { type: "text", text: "Text 1" },
          { type: "text", text: "Text 2" },
        ],
      });
    });

    it("should handle empty content", async () => {
      const emptyResult: CallToolResult = {
        content: [],
      };
      mockMcpManager.callTool.mockResolvedValue(emptyResult);

      const result = await toolAdapter.callTool("mcp_test_server_test-tool", {});
      expect(result).toBeNull();
    });
  });

  describe("Cache Management", () => {
    it("should refresh cache when tools are updated", async () => {
      const initialTools = [mockTool];
      const updatedTools = [
        mockTool,
        {
          ...mockTool,
          name: "new-tool",
          serverId: "test-server-id",
          serverName: "Test Server",
        },
      ];

      mockMcpManager.getTools.mockResolvedValueOnce(initialTools);

      // Get initial tools
      let tools = await toolAdapter.getTools();
      expect(tools).toHaveLength(1);

      // Simulate tools update event by calling the adapter's refresh method directly
      mockMcpManager.getTools.mockResolvedValueOnce(updatedTools);
      await toolAdapter.refreshTools();

      // Get updated tools
      tools = await toolAdapter.getTools();
      expect(tools).toHaveLength(2);
    });

    it("should invalidate cache on server events", async () => {
      mockMcpManager.getTools.mockResolvedValue([mockTool]);

      // Get initial tools to populate cache
      await toolAdapter.getTools();

      // Verify that event listeners are set up
      expect(mockMcpManager.on).toHaveBeenCalledWith("serverConnected", expect.any(Function));
      expect(mockMcpManager.on).toHaveBeenCalledWith("toolsUpdated", expect.any(Function));

      // Force cache refresh
      await toolAdapter.refreshTools();
      expect(mockMcpManager.getTools).toHaveBeenCalledTimes(2);
    });
  });

  describe("Custom Name Formatting", () => {
    it("should use custom name format", async () => {
      const customAdapter = new McpToolAdapter(mockMcpManager, {
        nameFormat: (serverName, toolName) => `custom_${serverName}_${toolName}`,
      });

      mockMcpManager.getTools.mockResolvedValue([mockTool]);

      const tools = await customAdapter.getTools();
      expect(tools[0].name).toBe("custom_Test Server_test-tool");
    });
  });
});

describe("McpToolAdapterManager", () => {
  let mockMcpManager: jest.Mocked<McpManager>;

  beforeEach(() => {
    mockMcpManager = {
      getTools: jest.fn(),
      callTool: jest.fn(),
      on: jest.fn(),
    } as any;

    // Reset singleton state
    McpToolAdapterManager.destroy();
  });

  afterEach(() => {
    McpToolAdapterManager.destroy();
  });

  it("should initialize adapter manager", () => {
    McpToolAdapterManager.initialize(mockMcpManager);
    expect(McpToolAdapterManager.isInitialized()).toBe(true);

    const instance = McpToolAdapterManager.getInstance();
    expect(instance).toBeInstanceOf(McpToolAdapter);
  });

  it("should throw error when initializing twice", () => {
    McpToolAdapterManager.initialize(mockMcpManager);

    expect(() => {
      McpToolAdapterManager.initialize(mockMcpManager);
    }).toThrow("MCP Tool Adapter already initialized");
  });

  it("should throw error when getting instance before initialization", () => {
    expect(() => {
      McpToolAdapterManager.getInstance();
    }).toThrow("MCP Tool Adapter not initialized. Call initialize() first.");
  });

  it("should destroy adapter manager", () => {
    McpToolAdapterManager.initialize(mockMcpManager);
    expect(McpToolAdapterManager.isInitialized()).toBe(true);

    McpToolAdapterManager.destroy();
    expect(McpToolAdapterManager.isInitialized()).toBe(false);
  });
});
