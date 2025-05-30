/**
 * MCP Utils Unit Tests
 */

import {
  isJsonRpcMessage,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcNotification,
  isMcpVersion,
  isLogLevel,
  isValidTransportState,
  validateTool,
  validateResource,
  validatePrompt,
  validateServerConfig,
  parseUri,
  buildUri,
  isValidUri,
  createRequest,
  createResponse,
  createNotification,
  getMethodName,
  isMcpRequestMethod,
  isMcpNotificationMethod,
  createErrorResponse,
  extractError,
  sanitizeText,
  isValidBase64,
  getMimeTypeFromExtension,
  safeStringify,
  truncateString,
  debounce,
  throttle,
  withTimeout,
} from "./utils";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  Tool,
  Resource,
  Prompt,
  McpServerConfig,
} from "./types";

describe("MCP Utils", () => {
  describe("Type Guards", () => {
    describe("isJsonRpcMessage", () => {
      it("should return true for valid JSON-RPC message", () => {
        const validMessage = {
          jsonrpc: "2.0",
          id: "1",
          method: "test",
        };

        expect(isJsonRpcMessage(validMessage)).toBe(true);
      });

      it("should return false for invalid JSON-RPC message", () => {
        expect(isJsonRpcMessage(null)).toBe(false);
        expect(isJsonRpcMessage(undefined)).toBe(false);
        expect(isJsonRpcMessage("string")).toBe(false);
        expect(isJsonRpcMessage({})).toBe(false);
        expect(isJsonRpcMessage({ jsonrpc: "1.0" })).toBe(false);
      });
    });

    describe("isJsonRpcRequest", () => {
      it("should return true for valid request", () => {
        const request: JsonRpcRequest = {
          jsonrpc: "2.0",
          id: "1",
          method: "test",
        };

        expect(isJsonRpcRequest(request)).toBe(true);
      });

      it("should return false for non-request message", () => {
        const response: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: "1",
          result: {},
        };

        expect(isJsonRpcRequest(response)).toBe(false);
      });
    });

    describe("isJsonRpcResponse", () => {
      it("should return true for valid response with result", () => {
        const response: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: "1",
          result: {},
        };

        expect(isJsonRpcResponse(response)).toBe(true);
      });

      it("should return true for valid response with error", () => {
        const response: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: "1",
          error: { code: -1, message: "error" },
        };

        expect(isJsonRpcResponse(response)).toBe(true);
      });

      it("should return false for non-response message", () => {
        const request: JsonRpcRequest = {
          jsonrpc: "2.0",
          id: "1",
          method: "test",
        };

        expect(isJsonRpcResponse(request)).toBe(false);
      });
    });

    describe("isJsonRpcNotification", () => {
      it("should return true for valid notification", () => {
        const notification: JsonRpcNotification = {
          jsonrpc: "2.0",
          method: "notification",
        };

        expect(isJsonRpcNotification(notification)).toBe(true);
      });

      it("should return false for message with id", () => {
        const request: JsonRpcRequest = {
          jsonrpc: "2.0",
          id: "1",
          method: "test",
        };

        expect(isJsonRpcNotification(request)).toBe(false);
      });
    });

    describe("isMcpVersion", () => {
      it("should return true for supported versions", () => {
        expect(isMcpVersion("2024-11-05")).toBe(true);
        expect(isMcpVersion("2025-03-26")).toBe(true);
      });

      it("should return false for unsupported versions", () => {
        expect(isMcpVersion("1.0.0")).toBe(false);
        expect(isMcpVersion("invalid")).toBe(false);
      });
    });

    describe("isLogLevel", () => {
      it("should return true for valid log levels", () => {
        expect(isLogLevel("debug")).toBe(true);
        expect(isLogLevel("info")).toBe(true);
        expect(isLogLevel("error")).toBe(true);
      });

      it("should return false for invalid log levels", () => {
        expect(isLogLevel("invalid")).toBe(false);
        expect(isLogLevel("")).toBe(false);
      });
    });

    describe("isValidTransportState", () => {
      it("should return true for valid states", () => {
        expect(isValidTransportState("disconnected")).toBe(true);
        expect(isValidTransportState("connecting")).toBe(true);
        expect(isValidTransportState("connected")).toBe(true);
        expect(isValidTransportState("disconnecting")).toBe(true);
      });

      it("should return false for invalid states", () => {
        expect(isValidTransportState("invalid")).toBe(false);
        expect(isValidTransportState("")).toBe(false);
      });
    });
  });

  describe("Validation Functions", () => {
    describe("validateTool", () => {
      it("should return true for valid tool", () => {
        const validTool: Tool = {
          name: "test-tool",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: {},
          },
        };

        expect(validateTool(validTool)).toBe(true);
      });

      it("should return false for invalid tool", () => {
        expect(validateTool(null)).toBe(false);
        expect(validateTool({})).toBe(false);
        expect(validateTool({ name: "" })).toBe(false);
        expect(validateTool({ name: "test" })).toBe(false); // Missing inputSchema
      });

      it("should handle optional description", () => {
        const toolWithoutDescription: Tool = {
          name: "test-tool",
          inputSchema: { type: "object" },
        };

        expect(validateTool(toolWithoutDescription)).toBe(true);
      });
    });

    describe("validateResource", () => {
      it("should return true for valid resource", () => {
        const validResource: Resource = {
          uri: "file:///test.txt",
          name: "Test File",
          description: "A test file",
          mimeType: "text/plain",
        };

        expect(validateResource(validResource)).toBe(true);
      });

      it("should return false for invalid resource", () => {
        expect(validateResource(null)).toBe(false);
        expect(validateResource({})).toBe(false);
        expect(validateResource({ uri: "" })).toBe(false);
        expect(validateResource({ uri: "test", name: "" })).toBe(false);
      });

      it("should handle optional fields", () => {
        const minimalResource: Resource = {
          uri: "file:///test.txt",
          name: "Test File",
        };

        expect(validateResource(minimalResource)).toBe(true);
      });
    });

    describe("validatePrompt", () => {
      it("should return true for valid prompt", () => {
        const validPrompt: Prompt = {
          name: "test-prompt",
          description: "A test prompt",
          arguments: [],
        };

        expect(validatePrompt(validPrompt)).toBe(true);
      });

      it("should return false for invalid prompt", () => {
        expect(validatePrompt(null)).toBe(false);
        expect(validatePrompt({})).toBe(false);
        expect(validatePrompt({ name: "" })).toBe(false);
      });

      it("should handle optional fields", () => {
        const minimalPrompt: Prompt = {
          name: "test-prompt",
        };

        expect(validatePrompt(minimalPrompt)).toBe(true);
      });
    });

    describe("validateServerConfig", () => {
      it("should return true for valid server config", () => {
        const validConfig: McpServerConfig = {
          id: "test-server",
          name: "Test Server",
          enabled: true,
          transport: "stdio",
          connection: {
            command: "test",
          },
        };

        expect(validateServerConfig(validConfig)).toBe(true);
      });

      it("should return false for invalid server config", () => {
        expect(validateServerConfig(null)).toBe(false);
        expect(validateServerConfig({})).toBe(false);
        expect(validateServerConfig({ id: "" })).toBe(false);
      });
    });
  });

  describe("URI Utilities", () => {
    describe("parseUri", () => {
      it("should parse standard HTTP URI", () => {
        const uri = "https://example.com:8080/path?query=value#fragment";
        const parsed = parseUri(uri);

        expect(parsed).toEqual({
          scheme: "https",
          host: "example.com",
          path: "/path",
          query: { query: "value" },
          fragment: "fragment",
        });
      });

      it("should parse simple scheme:path URI", () => {
        const uri = "file:///test/path";
        const parsed = parseUri(uri);

        expect(parsed.scheme).toBe("file");
        expect(parsed.path).toBe("/test/path");
      });

      it("should handle malformed URI", () => {
        const uri = "invalid-uri";
        const parsed = parseUri(uri);

        expect(parsed.scheme).toBe("");
        expect(parsed.path).toBe("invalid-uri");
      });
    });

    describe("buildUri", () => {
      it("should build complete URI", () => {
        const components = {
          scheme: "https",
          host: "example.com",
          path: "/path",
          query: { param: "value" },
          fragment: "section",
        };

        const uri = buildUri(components);
        expect(uri).toBe("https://example.com/path?param=value#section");
      });

      it("should build simple scheme:path URI", () => {
        const components = {
          scheme: "file",
          path: "/test/path",
        };

        const uri = buildUri(components);
        expect(uri).toBe("file:/test/path");
      });
    });

    describe("isValidUri", () => {
      it("should return true for valid URIs", () => {
        expect(isValidUri("https://example.com")).toBe(true);
        expect(isValidUri("file:///test/path")).toBe(true);
        expect(isValidUri("custom-scheme:data")).toBe(true);
      });

      it("should return false for invalid URIs", () => {
        expect(isValidUri("not-a-uri")).toBe(false);
        expect(isValidUri("")).toBe(false);
        expect(isValidUri(":/invalid")).toBe(false);
      });
    });
  });

  describe("Message Utilities", () => {
    describe("createRequest", () => {
      it("should create valid JSON-RPC request", () => {
        const request = createRequest("1", "test-method", { param: "value" });

        expect(request).toEqual({
          jsonrpc: "2.0",
          id: "1",
          method: "test-method",
          params: { param: "value" },
        });
      });

      it("should create request without params", () => {
        const request = createRequest("1", "test-method");

        expect(request).toEqual({
          jsonrpc: "2.0",
          id: "1",
          method: "test-method",
        });
      });
    });

    describe("createResponse", () => {
      it("should create success response", () => {
        const response = createResponse("1", { success: true });

        expect(response).toEqual({
          jsonrpc: "2.0",
          id: "1",
          result: { success: true },
        });
      });

      it("should create error response", () => {
        const response = createResponse("1", undefined, {
          code: -1,
          message: "Error",
        });

        expect(response).toEqual({
          jsonrpc: "2.0",
          id: "1",
          error: { code: -1, message: "Error" },
        });
      });
    });

    describe("createNotification", () => {
      it("should create notification with params", () => {
        const notification = createNotification("test-event", { data: "value" });

        expect(notification).toEqual({
          jsonrpc: "2.0",
          method: "test-event",
          params: { data: "value" },
        });
      });

      it("should create notification without params", () => {
        const notification = createNotification("test-event");

        expect(notification).toEqual({
          jsonrpc: "2.0",
          method: "test-event",
        });
      });
    });

    describe("getMethodName", () => {
      it("should extract method from request", () => {
        const message: JsonRpcRequest = {
          jsonrpc: "2.0",
          id: "1",
          method: "test-method",
        };

        expect(getMethodName(message)).toBe("test-method");
      });

      it("should return null for response", () => {
        const message: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: "1",
          result: {},
        };

        expect(getMethodName(message)).toBeNull();
      });
    });

    describe("isMcpRequestMethod", () => {
      it("should return true for MCP request methods", () => {
        expect(isMcpRequestMethod("initialize")).toBe(true);
        expect(isMcpRequestMethod("tools/list")).toBe(true);
        expect(isMcpRequestMethod("tools/call")).toBe(true);
      });

      it("should return false for non-MCP methods", () => {
        expect(isMcpRequestMethod("custom-method")).toBe(false);
        expect(isMcpRequestMethod("")).toBe(false);
      });
    });

    describe("isMcpNotificationMethod", () => {
      it("should return true for MCP notification methods", () => {
        expect(isMcpNotificationMethod("notifications/cancelled")).toBe(true);
      });

      it("should return false for non-MCP notifications", () => {
        expect(isMcpNotificationMethod("custom-notification")).toBe(false);
      });
    });
  });

  describe("Error Utilities", () => {
    describe("createErrorResponse", () => {
      it("should create error response", () => {
        const errorResponse = createErrorResponse("1", -32600, "Invalid Request");

        expect(errorResponse).toEqual({
          jsonrpc: "2.0",
          id: "1",
          error: {
            code: -32600,
            message: "Invalid Request",
          },
        });
      });

      it("should create error response with data", () => {
        const errorResponse = createErrorResponse("1", -32600, "Invalid Request", {
          details: "More info",
        });

        expect(errorResponse.error?.data).toEqual({ details: "More info" });
      });
    });

    describe("extractError", () => {
      it("should extract error from response", () => {
        const response: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: "1",
          error: { code: -1, message: "Test error" },
        };

        const error = extractError(response);
        expect(error).toEqual({ code: -1, message: "Test error" });
      });

      it("should return null for success response", () => {
        const response: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: "1",
          result: {},
        };

        const error = extractError(response);
        expect(error).toBeNull();
      });
    });
  });

  describe("Content Utilities", () => {
    describe("sanitizeText", () => {
      it("should remove control characters", () => {
        const text = "Hello\x00\x1F\x7FWorld";
        const sanitized = sanitizeText(text);

        expect(sanitized).toBe("HelloWorld");
      });

      it("should truncate long text", () => {
        const longText = "a".repeat(200);
        const sanitized = sanitizeText(longText, 50);

        expect(sanitized).toBe("a".repeat(47) + "...");
        expect(sanitized.length).toBe(50);
      });
    });

    describe("isValidBase64", () => {
      it("should return true for valid base64", () => {
        const validBase64 = btoa("Hello World");
        expect(isValidBase64(validBase64)).toBe(true);
      });

      it("should return false for invalid base64", () => {
        expect(isValidBase64("invalid-base64!")).toBe(false);
        expect(isValidBase64("")).toBe(false);
      });
    });

    describe("getMimeTypeFromExtension", () => {
      it("should return correct MIME types", () => {
        expect(getMimeTypeFromExtension("file.txt")).toBe("text/plain");
        expect(getMimeTypeFromExtension("file.json")).toBe("application/json");
        expect(getMimeTypeFromExtension("image.png")).toBe("image/png");
        expect(getMimeTypeFromExtension("doc.pdf")).toBe("application/pdf");
      });

      it("should return default for unknown extensions", () => {
        expect(getMimeTypeFromExtension("file.unknown")).toBe("application/octet-stream");
        expect(getMimeTypeFromExtension("noextension")).toBe("application/octet-stream");
      });
    });
  });

  describe("Debugging Utilities", () => {
    describe("safeStringify", () => {
      it("should stringify simple objects", () => {
        const obj = { name: "test", value: 123 };
        const result = safeStringify(obj);

        expect(result).toContain('"name": "test"');
        expect(result).toContain('"value": 123');
      });

      it("should handle circular references", () => {
        const obj: any = { name: "test" };
        obj.self = obj;

        const result = safeStringify(obj);
        expect(result).toContain("[Circular Reference]");
      });

      it("should handle errors", () => {
        const error = new Error("Test error");
        const result = safeStringify(error);

        expect(result).toContain("Test error");
        expect(result).toContain("Error");
      });

      it("should limit depth", () => {
        const deepObj = { level1: { level2: { level3: { level4: "deep" } } } };
        const result = safeStringify(deepObj, 2);

        expect(result).toContain("[Max Depth Exceeded]");
      });
    });

    describe("truncateString", () => {
      it("should not truncate short strings", () => {
        const short = "Hello";
        expect(truncateString(short, 10)).toBe("Hello");
      });

      it("should truncate long strings", () => {
        const long = "a".repeat(200);
        const truncated = truncateString(long, 50);

        expect(truncated).toBe("a".repeat(47) + "...");
        expect(truncated.length).toBe(50);
      });
    });
  });

  describe("Performance Utilities", () => {
    describe("debounce", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("should debounce function calls", () => {
        const mockFn = jest.fn();
        const debouncedFn = debounce(mockFn, 100);

        debouncedFn("arg1");
        debouncedFn("arg2");
        debouncedFn("arg3");

        expect(mockFn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(100);

        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(mockFn).toHaveBeenCalledWith("arg3");
      });
    });

    describe("throttle", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("should throttle function calls", () => {
        const mockFn = jest.fn();
        const throttledFn = throttle(mockFn, 100);

        throttledFn("arg1");
        throttledFn("arg2");
        throttledFn("arg3");

        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(mockFn).toHaveBeenCalledWith("arg1");

        jest.advanceTimersByTime(100);

        throttledFn("arg4");
        expect(mockFn).toHaveBeenCalledTimes(2);
        expect(mockFn).toHaveBeenCalledWith("arg4");
      });
    });

    describe("withTimeout", () => {
      it("should resolve with promise result", async () => {
        const promise = Promise.resolve("success");
        const result = await withTimeout(promise, 1000);

        expect(result).toBe("success");
      });

      it("should reject on timeout", async () => {
        const slowPromise = new Promise((resolve) => setTimeout(resolve, 2000));

        await expect(withTimeout(slowPromise, 100)).rejects.toThrow("Operation timed out");
      });

      it("should reject with custom timeout message", async () => {
        const slowPromise = new Promise((resolve) => setTimeout(resolve, 2000));

        await expect(withTimeout(slowPromise, 100, "Custom timeout")).rejects.toThrow(
          "Custom timeout"
        );
      });
    });
  });
});
