/**
 * Test suite for MCP environment variable support
 */

import { StdioTransport } from "./transports/stdio";
import type { StdioTransportConfig } from "./types";

describe("MCP Environment Variable Support", () => {
  test("should create StdioTransport with environment variables", () => {
    const config: StdioTransportConfig = {
      command: "echo",
      args: ["test"],
      env: {
        BRAVE_API_KEY: "BSAfCA2JnI3giomIbZl7TcRS6jupGGG",
        CUSTOM_VAR: "test_value",
        NODE_ENV: "development",
      },
      cwd: "/tmp",
    };

    const transport = new StdioTransport(config);

    expect(transport).toBeDefined();
    expect(transport.state).toBe("disconnected");
  });

  test("should handle empty environment variables", () => {
    const config: StdioTransportConfig = {
      command: "echo",
      args: ["test"],
      env: {},
      cwd: "/tmp",
    };

    const transport = new StdioTransport(config);

    expect(transport).toBeDefined();
    expect(transport.state).toBe("disconnected");
  });

  test("should handle undefined environment variables", () => {
    const config: StdioTransportConfig = {
      command: "echo",
      args: ["test"],
      cwd: "/tmp",
    };

    const transport = new StdioTransport(config);

    expect(transport).toBeDefined();
    expect(transport.state).toBe("disconnected");
  });

  test("should support API key environment variables", () => {
    const config: StdioTransportConfig = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      env: {
        BRAVE_API_KEY: "BSAfCA2JnI3giomIbZl7TcRS6jupGGG",
      },
      cwd: "/tmp",
    };

    const transport = new StdioTransport(config);

    expect(transport).toBeDefined();
    expect(transport.state).toBe("disconnected");
  });
});
