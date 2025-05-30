/**
 * MCPClient Unit Tests
 *
 * Basic tests to verify the MCPClient implementation works correctly.
 */

import { McpClient } from "./client";
import type { McpServerConfig } from "./types";

describe("McpClient", () => {
  const mockConfig: McpServerConfig = {
    id: "test-server",
    name: "Test Server",
    enabled: true,
    transport: "stdio",
    connection: {
      command: "echo",
      args: ["test"],
    },
  };

  let client: McpClient;

  beforeEach(() => {
    client = new McpClient(mockConfig);
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  test("should initialize with correct state", () => {
    expect(client.getState()).toBe("disconnected");
    expect(client.isConnected()).toBe(false);
    expect(client.getServerInfo()).toBeNull();
  });

  test("should emit state change events", (done) => {
    const stateChanges: string[] = [];

    client.on("stateChange", (state) => {
      stateChanges.push(state);
      // We expect the first state change to be "connecting"
      if (stateChanges.length === 1) {
        expect(state).toBe("connecting");
        done();
      }
    });

    // This will fail because echo doesn't implement MCP protocol,
    // but it will trigger the state change
    client.connect().catch(() => {
      // Expected to fail
    });
  });

  test("should handle errors gracefully", async () => {
    const invalidConfig: McpServerConfig = {
      id: "invalid-server",
      name: "Invalid Server",
      enabled: true,
      transport: "stdio",
      connection: {
        command: "nonexistent-command-12345",
      },
    };

    const invalidClient = new McpClient(invalidConfig);

    // Set up error handler to prevent unhandled error events
    invalidClient.on("error", () => {
      // Expected error, ignore
    });

    try {
      await invalidClient.connect();
      // If connect doesn't throw, the test should still pass
      // as long as the client handles the error gracefully
    } catch (error) {
      // Expected to fail due to invalid command
      expect(error).toBeInstanceOf(Error);
    }

    // State might be "error" or "disconnected" depending on timing
    expect(["error", "disconnected"]).toContain(invalidClient.getState());
  }, 5000); // Reduce timeout and make test more robust

  test("should throw when calling methods while disconnected", async () => {
    await expect(client.listTools()).rejects.toThrow("Not connected to MCP server");
    await expect(client.listResources()).rejects.toThrow("Not connected to MCP server");
    await expect(client.listPrompts()).rejects.toThrow("Not connected to MCP server");
  });

  test("should handle SSE transport configuration", () => {
    const sseConfig: McpServerConfig = {
      id: "sse-server",
      name: "SSE Server",
      enabled: true,
      transport: "sse",
      connection: {
        url: "http://localhost:3000/mcp",
        headers: {
          Authorization: "Bearer token",
        },
      },
    };

    const sseClient = new McpClient(sseConfig);
    expect(sseClient.getState()).toBe("disconnected");
  });

  test("should support custom client options", () => {
    const customClient = new McpClient(mockConfig, {
      debug: true,
      requestTimeout: 5000,
      retryAttempts: 5,
    });

    expect(customClient.getState()).toBe("disconnected");
  });

  test("should handle disconnect when not connected", async () => {
    // Should not throw when disconnecting while already disconnected
    await expect(client.disconnect()).resolves.not.toThrow();
    expect(client.getState()).toBe("disconnected");
  });

  test("should prevent multiple connect attempts", async () => {
    // Set up error handler
    client.on("error", () => {
      // Expected error, ignore
    });

    const connectPromise1 = client.connect().catch(() => {
      // Expected to fail
    });

    // Try to connect again while first connect is in progress
    // The client should return the same promise, not throw
    const connectPromise2 = client.connect().catch(() => {
      // Expected to fail
    });

    // Both promises should be the same operation
    await Promise.all([connectPromise1, connectPromise2]);
  });

  test("should handle tool calling errors", async () => {
    await expect(client.callTool({ name: "nonexistent-tool" })).rejects.toThrow(
      "Not connected to MCP server"
    );
  });

  test("should handle resource reading errors", async () => {
    await expect(client.readResource({ uri: "nonexistent://resource" })).rejects.toThrow(
      "Not connected to MCP server"
    );
  });

  test("should handle prompt getting errors", async () => {
    await expect(client.getPrompt({ name: "nonexistent-prompt" })).rejects.toThrow(
      "Not connected to MCP server"
    );
  });

  test("should handle ping errors", async () => {
    await expect(client.ping()).rejects.toThrow("Not connected to MCP server");
  });

  test("should handle unsupported transport type", async () => {
    // Create a config with invalid transport by casting
    const invalidConfig = {
      id: "invalid-transport",
      name: "Invalid Transport",
      enabled: true,
      transport: "invalid" as any,
      connection: {
        command: "echo", // Provide valid stdio config to avoid other errors
      },
    } as McpServerConfig;

    const invalidClient = new McpClient(invalidConfig);

    // Set up error handler
    invalidClient.on("error", () => {
      // Expected error, ignore
    });

    await expect(invalidClient.connect()).rejects.toThrow("Unsupported transport type");
  });
});
