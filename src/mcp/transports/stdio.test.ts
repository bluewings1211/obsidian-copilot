/**
 * STDIO Transport Unit Tests
 */

import { EventEmitter } from "events";
import { ChildProcess, spawn } from "child_process";
import { StdioTransport } from "./stdio";
import type { StdioTransportConfig } from "../types";

// Mock child_process
jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe("StdioTransport", () => {
  let transport: StdioTransport;
  let mockChildProcess: jest.Mocked<ChildProcess>;
  let mockConfig: StdioTransportConfig;

  beforeEach(() => {
    mockConfig = {
      command: "test-command",
      args: ["--test"],
      env: { TEST_ENV: "value" },
      cwd: "/test/dir",
    };

    // Create mock child process
    mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdin = {
      write: jest.fn((data, callback) => {
        if (callback) callback();
        return true;
      }),
      end: jest.fn(),
      destroy: jest.fn(),
    } as any;
    mockChildProcess.stdout = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter() as any;
    mockChildProcess.kill = jest.fn();

    // Define readonly properties
    Object.defineProperty(mockChildProcess, "killed", {
      value: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(mockChildProcess, "pid", {
      value: 12345,
      writable: true,
      configurable: true,
    });

    // Mock spawn to return our mock child process
    mockSpawn.mockReturnValue(mockChildProcess);

    transport = new StdioTransport(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with correct state", () => {
      expect(transport.state).toBe("disconnected");
    });
  });

  describe("Connection Management", () => {
    it("should start successfully", async () => {
      const startPromise = transport.start();

      // Simulate successful process start
      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      expect(transport.state).toBe("connected");
      expect(mockSpawn).toHaveBeenCalledWith(mockConfig.command, mockConfig.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...mockConfig.env },
        cwd: mockConfig.cwd,
      });
    });

    it("should handle spawn errors", async () => {
      const startPromise = transport.start();

      // Simulate spawn error
      process.nextTick(() => {
        const error = new Error("Spawn failed");
        mockChildProcess.emit("error", error);
      });

      await expect(startPromise).rejects.toThrow("Spawn failed");
      expect(transport.state).toBe("disconnected");
    });

    it("should handle process exit during startup", async () => {
      const startPromise = transport.start();

      // Simulate process exit during startup
      process.nextTick(() => {
        mockChildProcess.emit("exit", 1);
      });

      await expect(startPromise).rejects.toThrow("Process exited during startup with code 1");
      expect(transport.state).toBe("disconnected");
    });

    it("should handle process exit after connected", async () => {
      const onCloseSpy = jest.fn();
      const onErrorSpy = jest.fn();
      transport.onclose = onCloseSpy;
      transport.onerror = onErrorSpy;

      const startPromise = transport.start();

      // Complete startup
      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      // Simulate process exit with error code
      mockChildProcess.emit("exit", 1, null);

      expect(onErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "MCP server exited with code 1",
        })
      );
      expect(onCloseSpy).toHaveBeenCalled();
      expect(transport.state).toBe("disconnected");
    });

    it("should handle process termination by signal", async () => {
      const onErrorSpy = jest.fn();
      transport.onerror = onErrorSpy;

      const startPromise = transport.start();

      // Complete startup
      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      // Simulate process killed by signal
      mockChildProcess.emit("exit", null, "SIGTERM");

      expect(onErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "MCP server terminated by signal SIGTERM",
        })
      );
    });

    it("should close successfully", async () => {
      const startPromise = transport.start();

      // Complete startup
      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      const closePromise = transport.close();

      // Simulate process exit after kill
      process.nextTick(() => {
        mockChildProcess.emit("exit", 0, null);
      });

      await closePromise;

      expect(mockChildProcess.kill).toHaveBeenCalledWith("SIGTERM");
      expect(transport.state).toBe("disconnected");
    });

    it("should force kill if process doesn't exit gracefully", async () => {
      jest.useFakeTimers();

      const startPromise = transport.start();

      // Complete startup
      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      const closePromise = transport.close();

      // Don't simulate exit, let timeout happen
      jest.advanceTimersByTime(6000); // More than 5 second timeout

      await closePromise;

      expect(mockChildProcess.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockChildProcess.kill).toHaveBeenCalledWith("SIGKILL");

      jest.useRealTimers();
    });
  });

  describe("Message Handling", () => {
    beforeEach(async () => {
      const startPromise = transport.start();

      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;
    });

    it("should send messages correctly", async () => {
      const message = {
        jsonrpc: "2.0" as const,
        id: "1",
        method: "test",
      };

      await transport.send(message);

      expect(mockChildProcess.stdin!.write).toHaveBeenCalledWith(
        JSON.stringify(message) + "\n",
        expect.any(Function)
      );
    });

    it("should handle send errors when not connected", async () => {
      await transport.close();

      const message = {
        jsonrpc: "2.0" as const,
        id: "1",
        method: "test",
      };

      await expect(transport.send(message)).rejects.toThrow("Transport not connected");
    });

    it("should process incoming messages", () => {
      const onMessageSpy = jest.fn();
      transport.onmessage = onMessageSpy;

      const message = { jsonrpc: "2.0", id: "1", result: {} };
      const messageStr = JSON.stringify(message);

      // Simulate stdout data
      mockChildProcess.stdout!.emit("data", Buffer.from(messageStr + "\n"));

      expect(onMessageSpy).toHaveBeenCalledWith(message);
    });

    it("should handle partial messages", () => {
      const onMessageSpy = jest.fn();
      transport.onmessage = onMessageSpy;

      const message = { jsonrpc: "2.0", id: "1", result: {} };
      const messageStr = JSON.stringify(message);

      // Send message in parts
      mockChildProcess.stdout!.emit("data", Buffer.from(messageStr.slice(0, 10)));
      expect(onMessageSpy).not.toHaveBeenCalled();

      mockChildProcess.stdout!.emit("data", Buffer.from(messageStr.slice(10) + "\n"));
      expect(onMessageSpy).toHaveBeenCalledWith(message);
    });

    it("should handle multiple messages in one chunk", () => {
      const onMessageSpy = jest.fn();
      transport.onmessage = onMessageSpy;

      const message1 = { jsonrpc: "2.0", id: "1", result: {} };
      const message2 = { jsonrpc: "2.0", id: "2", result: {} };

      const data = JSON.stringify(message1) + "\n" + JSON.stringify(message2) + "\n";

      mockChildProcess.stdout!.emit("data", Buffer.from(data));

      expect(onMessageSpy).toHaveBeenCalledTimes(2);
      expect(onMessageSpy).toHaveBeenCalledWith(message1);
      expect(onMessageSpy).toHaveBeenCalledWith(message2);
    });

    it("should handle invalid JSON gracefully", () => {
      const onErrorSpy = jest.fn();
      transport.onerror = onErrorSpy;

      // Send invalid JSON
      mockChildProcess.stdout!.emit("data", Buffer.from("invalid json\n"));

      expect(onErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Failed to parse message"),
        })
      );
    });

    it("should handle invalid JSON-RPC message", () => {
      const onErrorSpy = jest.fn();
      transport.onerror = onErrorSpy;

      // Send valid JSON but invalid JSON-RPC
      const invalidMessage = { version: "1.0", method: "test" };
      mockChildProcess.stdout!.emit("data", Buffer.from(JSON.stringify(invalidMessage) + "\n"));

      expect(onErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Invalid JSON-RPC message"),
        })
      );
    });

    it("should handle stderr output", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const errorMessage = "Error from process";
      mockChildProcess.stderr!.emit("data", Buffer.from(errorMessage));

      expect(consoleSpy).toHaveBeenCalledWith(`[MCP Server] ${errorMessage}`);

      consoleSpy.mockRestore();
    });
  });

  describe("Error Handling", () => {
    it("should handle process errors", async () => {
      const onErrorSpy = jest.fn();
      transport.onerror = onErrorSpy;

      const startPromise = transport.start();

      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      const error = new Error("Process error");
      mockChildProcess.emit("error", error);

      expect(onErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Process error"),
        })
      );
      expect(transport.state).toBe("disconnected");
    });

    it("should prevent multiple starts", async () => {
      const startPromise1 = transport.start();

      // Try to start again before first start completes
      await expect(transport.start()).rejects.toThrow("Transport already started");

      // Complete first start
      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise1;
    });

    it("should handle startup timeout", async () => {
      jest.useFakeTimers();

      const startPromise = transport.start();

      // Don't emit spawn event, let timeout happen
      jest.advanceTimersByTime(11000); // More than 10 second timeout

      await expect(startPromise).rejects.toThrow("Process startup timeout");

      jest.useRealTimers();
    });
  });

  describe("Configuration Variations", () => {
    it("should work with minimal config", async () => {
      const minimalConfig: StdioTransportConfig = {
        command: "echo",
      };

      const minimalTransport = new StdioTransport(minimalConfig);

      const startPromise = minimalTransport.start();

      process.nextTick(() => {
        const latestCall = mockSpawn.mock.results[mockSpawn.mock.results.length - 1];
        const mockProcess = latestCall.value as typeof mockChildProcess;
        mockProcess.emit("spawn");
      });

      await startPromise;

      expect(mockSpawn).toHaveBeenCalledWith("echo", [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
        cwd: undefined,
      });

      await minimalTransport.close();
    });

    it("should merge environment variables correctly", async () => {
      const configWithEnv: StdioTransportConfig = {
        command: "test",
        env: { CUSTOM_VAR: "value", PATH: "/custom/path" },
      };

      const envTransport = new StdioTransport(configWithEnv);

      const startPromise = envTransport.start();

      process.nextTick(() => {
        const latestCall = mockSpawn.mock.results[mockSpawn.mock.results.length - 1];
        const mockProcess = latestCall.value as typeof mockChildProcess;
        mockProcess.emit("spawn");
      });

      await startPromise;

      expect(mockSpawn).toHaveBeenCalledWith("test", [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CUSTOM_VAR: "value", PATH: "/custom/path" },
        cwd: undefined,
      });

      await envTransport.close();
    });
  });

  describe("Edge Cases", () => {
    it("should handle close when already disconnected", async () => {
      // Should not throw
      await transport.close();
      expect(transport.state).toBe("disconnected");
    });

    it("should handle empty stdout data", async () => {
      const startPromise = transport.start();

      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      const onMessageSpy = jest.fn();
      transport.onmessage = onMessageSpy;

      // Send empty data and whitespace
      mockChildProcess.stdout!.emit("data", Buffer.from(""));
      mockChildProcess.stdout!.emit("data", Buffer.from("   \n  \n"));

      expect(onMessageSpy).not.toHaveBeenCalled();
    });

    it("should handle send error callback", async () => {
      const startPromise = transport.start();

      process.nextTick(() => {
        mockChildProcess.emit("spawn");
      });

      await startPromise;

      // Mock write to call callback with error
      const writeError = new Error("Write failed");
      (mockChildProcess.stdin!.write as jest.Mock).mockImplementation((data, callback) => {
        if (callback) callback(writeError);
        return false;
      });

      const message = {
        jsonrpc: "2.0" as const,
        id: "1",
        method: "test",
      };

      await expect(transport.send(message)).rejects.toThrow("Failed to send message: Write failed");
    });
  });
});
