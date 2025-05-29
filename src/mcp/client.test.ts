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
        command: "nonexistent-command",
      },
    };

    const invalidClient = new McpClient(invalidConfig);

    await expect(invalidClient.connect()).rejects.toThrow();
    // State might be "error" or "disconnected" depending on timing
    expect(["error", "disconnected"]).toContain(invalidClient.getState());
  }, 10000); // Increase timeout

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
});
