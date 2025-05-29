/**
 * MCPManager Unit Tests
 */

import { EventEmitter } from "events";
import { McpManager } from "./manager";
import { McpClient } from "./client";
import type { McpIntegrationSettings, McpServerConfig, Tool, Resource, Prompt } from "./types";

// Mock the McpClient
jest.mock("./client");

const MockedMcpClient = McpClient as jest.MockedClass<typeof McpClient>;

describe("McpManager", () => {
  let manager: McpManager;
  let mockSettings: McpIntegrationSettings;
  let mockServerConfig: McpServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServerConfig = {
      id: "test-server",
      name: "Test Server",
      description: "Test MCP Server",
      enabled: true,
      transport: "stdio",
      connection: {
        command: "test-command",
        args: ["test-arg"],
      },
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
    };

    mockSettings = {
      enabled: true,
      servers: [mockServerConfig],
      globalTimeout: 30000,
      maxConcurrentConnections: 10,
      debugMode: false,
      logLevel: "info",
    };

    manager = new McpManager(mockSettings);
  });

  afterEach(async () => {
    if (manager) {
      await manager.stop();
    }
  });

  describe("Lifecycle Management", () => {
    it("should start successfully with enabled servers", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      const connectSpy = jest.spyOn(mockClient, "connect").mockResolvedValue();

      await manager.start();

      expect(connectSpy).toHaveBeenCalled();
    });

    it("should stop successfully", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      const disconnectSpy = jest.spyOn(mockClient, "disconnect").mockResolvedValue();

      await manager.start();
      await manager.stop();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it("should handle server connection failures gracefully", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      const connectSpy = jest
        .spyOn(mockClient, "connect")
        .mockRejectedValue(new Error("Connection failed"));

      // Should not throw, but handle gracefully
      await expect(manager.start()).resolves.not.toThrow();

      expect(connectSpy).toHaveBeenCalled();
    });

    it("should update settings and restart", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      jest.spyOn(mockClient, "connect").mockResolvedValue();
      jest.spyOn(mockClient, "disconnect").mockResolvedValue();

      await manager.start();

      const newSettings: McpIntegrationSettings = {
        ...mockSettings,
        globalTimeout: 60000,
      };

      await manager.updateSettings(newSettings);

      // Should have restarted with new settings
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe("Server Management", () => {
    it("should add a new server", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      const connectSpy = jest.spyOn(mockClient, "connect").mockResolvedValue();

      await manager.addServer(mockServerConfig);

      expect(MockedMcpClient).toHaveBeenCalledWith(mockServerConfig, expect.any(Object));
      expect(connectSpy).toHaveBeenCalled();
    });

    it("should not add duplicate servers", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      jest.spyOn(mockClient, "connect").mockResolvedValue();

      await manager.addServer(mockServerConfig);

      await expect(manager.addServer(mockServerConfig)).rejects.toThrow(
        `Server with id ${mockServerConfig.id} already exists`
      );
    });

    it("should remove a server", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      const connectSpy = jest.spyOn(mockClient, "connect").mockResolvedValue();
      const disconnectSpy = jest.spyOn(mockClient, "disconnect").mockResolvedValue();

      await manager.addServer(mockServerConfig);
      await manager.removeServer(mockServerConfig.id);

      expect(connectSpy).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
    });

    it("should get server statuses", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      jest.spyOn(mockClient, "connect").mockResolvedValue();
      jest.spyOn(mockClient, "getState").mockReturnValue("connected");
      jest.spyOn(mockClient, "getServerInfo").mockReturnValue({
        protocolVersion: "2025-03-26",
        serverInfo: { name: "Test Server", version: "1.0.0" },
        capabilities: {},
      });

      await manager.addServer(mockServerConfig);

      const statuses = manager.getServerStatuses();

      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toMatchObject({
        id: mockServerConfig.id,
        name: mockServerConfig.name,
        state: "connected",
      });
    });

    it("should get specific server status", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient as any);

      jest.spyOn(mockClient, "connect").mockResolvedValue();
      jest.spyOn(mockClient, "getState").mockReturnValue("connected");

      await manager.addServer(mockServerConfig);

      const status = manager.getServerStatus(mockServerConfig.id);

      expect(status).not.toBeNull();
      expect(status?.id).toBe(mockServerConfig.id);
    });

    it("should return null for non-existent server status", () => {
      const status = manager.getServerStatus("non-existent");
      expect(status).toBeNull();
    });
  });

  describe("Tools Management", () => {
    let mockClient: any;
    let mockTools: Tool[];

    beforeEach(async () => {
      mockTools = [
        {
          name: "test-tool-1",
          description: "Test tool 1",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "test-tool-2",
          description: "Test tool 2",
          inputSchema: { type: "object", properties: {} },
        },
      ];

      mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient);

      jest.spyOn(mockClient, "connect").mockResolvedValue(undefined);
      jest.spyOn(mockClient, "isConnected").mockReturnValue(true);
      jest.spyOn(mockClient, "listTools").mockResolvedValue({
        tools: mockTools,
      });

      await manager.addServer(mockServerConfig);

      // Simulate server connection and tools loading
      mockClient.emit("connected", {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "Test Server", version: "1.0.0" },
        capabilities: {},
      });

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("should get all tools from connected servers", async () => {
      const tools = await manager.getTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({
        name: "test-tool-1",
        serverId: mockServerConfig.id,
        serverName: mockServerConfig.name,
      });
    });

    it("should get a specific tool", async () => {
      const tool = await manager.getTool(mockServerConfig.id, "test-tool-1");

      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("test-tool-1");
      expect(tool?.serverId).toBe(mockServerConfig.id);
    });

    it("should return null for non-existent tool", async () => {
      const tool = await manager.getTool(mockServerConfig.id, "non-existent");
      expect(tool).toBeNull();
    });

    it("should call a tool successfully", async () => {
      const mockResult = {
        content: [{ type: "text" as const, text: "Tool executed successfully" }],
      };

      jest.spyOn(mockClient, "callTool").mockResolvedValue(mockResult);

      const result = await manager.callTool(mockServerConfig.id, {
        name: "test-tool-1",
        arguments: { input: "test" },
      });

      expect(result).toEqual(mockResult);
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: "test-tool-1",
        arguments: { input: "test" },
      });
    });

    it("should throw error when calling tool on non-existent server", async () => {
      await expect(manager.callTool("non-existent", { name: "test-tool" })).rejects.toThrow(
        "Server non-existent not found"
      );
    });

    it("should throw error when calling tool on disconnected server", async () => {
      jest.spyOn(mockClient, "isConnected").mockReturnValue(false);

      await expect(manager.callTool(mockServerConfig.id, { name: "test-tool" })).rejects.toThrow(
        `Server ${mockServerConfig.id} is not connected`
      );
    });
  });

  describe("Resources Management", () => {
    let mockClient: any;
    let mockResources: Resource[];

    beforeEach(async () => {
      mockResources = [
        {
          uri: "file:///test/resource1.txt",
          name: "Resource 1",
          description: "Test resource 1",
          mimeType: "text/plain",
        },
        {
          uri: "file:///test/resource2.json",
          name: "Resource 2",
          description: "Test resource 2",
          mimeType: "application/json",
        },
      ];

      mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient);

      jest.spyOn(mockClient, "connect").mockResolvedValue(undefined);
      jest.spyOn(mockClient, "isConnected").mockReturnValue(true);
      jest.spyOn(mockClient, "listResources").mockResolvedValue({
        resources: mockResources,
      });

      await manager.addServer(mockServerConfig);

      // Simulate server connection and resources loading
      mockClient.emit("connected", {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "Test Server", version: "1.0.0" },
        capabilities: {},
      });

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("should get all resources from connected servers", async () => {
      const resources = await manager.getResources();

      expect(resources).toHaveLength(2);
      expect(resources[0]).toMatchObject({
        uri: "file:///test/resource1.txt",
        serverId: mockServerConfig.id,
        serverName: mockServerConfig.name,
      });
    });

    it("should get a specific resource", async () => {
      const resource = await manager.getResource(mockServerConfig.id, "file:///test/resource1.txt");

      expect(resource).not.toBeNull();
      expect(resource?.uri).toBe("file:///test/resource1.txt");
      expect(resource?.serverId).toBe(mockServerConfig.id);
    });

    it("should return null for non-existent resource", async () => {
      const resource = await manager.getResource(mockServerConfig.id, "file:///non-existent");
      expect(resource).toBeNull();
    });

    it("should read a resource successfully", async () => {
      const mockResult = {
        contents: [
          {
            uri: "file:///test/resource1.txt",
            mimeType: "text/plain",
            text: "Resource content",
          },
        ],
      };

      jest.spyOn(mockClient, "readResource").mockResolvedValue(mockResult);

      const result = await manager.readResource(mockServerConfig.id, {
        uri: "file:///test/resource1.txt",
      });

      expect(result).toEqual(mockResult);
      expect(mockClient.readResource).toHaveBeenCalledWith({
        uri: "file:///test/resource1.txt",
      });
    });
  });

  describe("Prompts Management", () => {
    let mockClient: any;
    let mockPrompts: Prompt[];

    beforeEach(async () => {
      mockPrompts = [
        {
          name: "test-prompt-1",
          description: "Test prompt 1",
          arguments: [{ name: "input", description: "Input text", required: true }],
        },
        {
          name: "test-prompt-2",
          description: "Test prompt 2",
          arguments: [],
        },
      ];

      mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient);

      jest.spyOn(mockClient, "connect").mockResolvedValue(undefined);
      jest.spyOn(mockClient, "isConnected").mockReturnValue(true);
      jest.spyOn(mockClient, "listPrompts").mockResolvedValue({
        prompts: mockPrompts,
      });

      await manager.addServer(mockServerConfig);

      // Simulate server connection and prompts loading
      mockClient.emit("connected", {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "Test Server", version: "1.0.0" },
        capabilities: {},
      });

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("should get all prompts from connected servers", async () => {
      const prompts = await manager.getPrompts();

      expect(prompts).toHaveLength(2);
      expect(prompts[0]).toMatchObject({
        name: "test-prompt-1",
        serverId: mockServerConfig.id,
        serverName: mockServerConfig.name,
      });
    });

    it("should get a specific prompt", async () => {
      const prompt = await manager.getPrompt(mockServerConfig.id, "test-prompt-1");

      expect(prompt).not.toBeNull();
      expect(prompt?.name).toBe("test-prompt-1");
      expect(prompt?.serverId).toBe(mockServerConfig.id);
    });

    it("should return null for non-existent prompt", async () => {
      const prompt = await manager.getPrompt(mockServerConfig.id, "non-existent");
      expect(prompt).toBeNull();
    });

    it("should execute a prompt successfully", async () => {
      const mockResult = {
        description: "Generated prompt result",
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: "Generated prompt content" },
          },
        ],
      };

      jest.spyOn(mockClient, "getPrompt").mockResolvedValue(mockResult);

      const result = await manager.executePrompt(mockServerConfig.id, {
        name: "test-prompt-1",
        arguments: { input: "test input" },
      });

      expect(result).toEqual(mockResult);
      expect(mockClient.getPrompt).toHaveBeenCalledWith({
        name: "test-prompt-1",
        arguments: { input: "test input" },
      });
    });
  });

  describe("Event Handling", () => {
    it("should emit server state change events", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient);

      jest.spyOn(mockClient, "connect").mockResolvedValue();

      const stateChangeHandler = jest.fn();
      manager.on("serverStateChange", stateChangeHandler);

      await manager.addServer(mockServerConfig);

      // Simulate state change
      mockClient.emit("stateChange", "connected");

      expect(stateChangeHandler).toHaveBeenCalledWith(mockServerConfig.id, "connected");
    });

    it("should emit server connected events", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient);

      jest.spyOn(mockClient, "connect").mockResolvedValue();

      const connectedHandler = jest.fn();
      manager.on("serverConnected", connectedHandler);

      await manager.addServer(mockServerConfig);

      const serverInfo = {
        protocolVersion: "2025-03-26" as const,
        serverInfo: { name: "Test Server", version: "1.0.0" },
        capabilities: {},
      };

      // Simulate connection
      mockClient.emit("connected", serverInfo);

      expect(connectedHandler).toHaveBeenCalledWith(mockServerConfig.id, serverInfo);
    });

    it("should emit server error events", async () => {
      const mockClient = createMockClient();
      MockedMcpClient.mockImplementation(() => mockClient);

      jest.spyOn(mockClient, "connect").mockResolvedValue();

      const errorHandler = jest.fn();
      manager.on("serverError", errorHandler);

      await manager.addServer(mockServerConfig);

      const error = new Error("Test error");

      // Simulate error
      mockClient.emit("error", error);

      expect(errorHandler).toHaveBeenCalledWith(mockServerConfig.id, error);
    });
  });
});

function createMockClient(): jest.Mocked<McpClient> {
  const mockClient = new EventEmitter() as any;

  mockClient.connect = jest.fn().mockResolvedValue(undefined);
  mockClient.disconnect = jest.fn().mockResolvedValue(undefined);
  mockClient.isConnected = jest.fn().mockReturnValue(false);
  mockClient.getState = jest.fn().mockReturnValue("disconnected");
  mockClient.getServerInfo = jest.fn().mockReturnValue(null);
  mockClient.listTools = jest.fn().mockResolvedValue({ tools: [] });
  mockClient.listResources = jest.fn().mockResolvedValue({ resources: [] });
  mockClient.listPrompts = jest.fn().mockResolvedValue({ prompts: [] });
  mockClient.callTool = jest.fn().mockResolvedValue({ content: [] });
  mockClient.readResource = jest.fn().mockResolvedValue({ contents: [] });
  mockClient.getPrompt = jest.fn().mockResolvedValue({ messages: [] });
  mockClient.ping = jest.fn().mockResolvedValue(undefined);

  return mockClient;
}
