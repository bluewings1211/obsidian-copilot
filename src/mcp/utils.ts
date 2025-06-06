/**
 * Model Context Protocol (MCP) Utility Functions
 *
 * This file contains utility functions for working with MCP types,
 * validation, and common operations.
 */

import type {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  McpVersion,
  Tool,
  Resource,
  Prompt,
  McpServerConfig,
  TransportState,
  LogLevel,
} from "./types";

import {
  JSONRPC_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  MCP_METHODS,
  MCP_NOTIFICATIONS,
  LIMITS,
  LOG_LEVELS,
  TRANSPORT_TYPES,
} from "./constants";

// ==============================================================================
// Type Guards
// ==============================================================================

/**
 * Check if a value is a valid JSON-RPC message
 */
export function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "jsonrpc" in value &&
    (value as any).jsonrpc === JSONRPC_VERSION
  );
}

/**
 * Check if a message is a JSON-RPC request
 */
export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return "id" in message && "method" in message;
}

/**
 * Check if a message is a JSON-RPC response
 */
export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return "id" in message && ("result" in message || "error" in message);
}

/**
 * Check if a message is a JSON-RPC notification
 */
export function isJsonRpcNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return "method" in message && !("id" in message);
}

/**
 * Check if a string is a valid MCP version
 */
export function isMcpVersion(version: string): version is McpVersion {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(version as McpVersion);
}

/**
 * Check if a string is a valid log level
 */
export function isLogLevel(level: string): level is LogLevel {
  return Object.values(LOG_LEVELS).includes(level as LogLevel);
}

/**
 * Check if a transport state is valid
 */
export function isValidTransportState(state: string): state is TransportState {
  return ["disconnected", "connecting", "connected", "disconnecting"].includes(state);
}

// ==============================================================================
// Validation Functions
// ==============================================================================

/**
 * Validate a tool definition
 */
export function validateTool(tool: unknown): tool is Tool {
  if (typeof tool !== "object" || tool === null) {
    return false;
  }

  const t = tool as any;

  return (
    typeof t.name === "string" &&
    t.name.length > 0 &&
    t.name.length <= LIMITS.MAX_TOOL_NAME_LENGTH &&
    typeof t.inputSchema === "object" &&
    t.inputSchema !== null &&
    (t.description === undefined || typeof t.description === "string")
  );
}

/**
 * Validate a resource definition
 */
export function validateResource(resource: unknown): resource is Resource {
  if (typeof resource !== "object" || resource === null) {
    return false;
  }

  const r = resource as any;

  return (
    typeof r.uri === "string" &&
    r.uri.length > 0 &&
    r.uri.length <= LIMITS.MAX_RESOURCE_URI_LENGTH &&
    typeof r.name === "string" &&
    r.name.length > 0 &&
    (r.description === undefined || typeof r.description === "string") &&
    (r.mimeType === undefined || typeof r.mimeType === "string")
  );
}

/**
 * Validate a prompt definition
 */
export function validatePrompt(prompt: unknown): prompt is Prompt {
  if (typeof prompt !== "object" || prompt === null) {
    return false;
  }

  const p = prompt as any;

  return (
    typeof p.name === "string" &&
    p.name.length > 0 &&
    p.name.length <= LIMITS.MAX_PROMPT_NAME_LENGTH &&
    (p.description === undefined || typeof p.description === "string") &&
    (p.arguments === undefined || Array.isArray(p.arguments))
  );
}

/**
 * Validate MCP server configuration
 */
export function validateServerConfig(config: unknown): config is McpServerConfig {
  if (typeof config !== "object" || config === null) {
    return false;
  }

  const c = config as any;

  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.name === "string" &&
    c.name.length > 0 &&
    typeof c.enabled === "boolean" &&
    Object.values(TRANSPORT_TYPES).includes(c.transport) &&
    typeof c.connection === "object" &&
    c.connection !== null &&
    (c.description === undefined || typeof c.description === "string") &&
    (c.capabilities === undefined || Array.isArray(c.capabilities)) &&
    (c.timeout === undefined || typeof c.timeout === "number") &&
    (c.retryAttempts === undefined || typeof c.retryAttempts === "number") &&
    (c.retryDelay === undefined || typeof c.retryDelay === "number")
  );
}

// ==============================================================================
// URI Utilities
// ==============================================================================

/**
 * Parse a URI into its components
 */
export function parseUri(uri: string): {
  scheme: string;
  host?: string;
  path: string;
  query?: Record<string, string>;
  fragment?: string;
} {
  try {
    const url = new URL(uri);
    const query: Record<string, string> = {};

    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    return {
      scheme: url.protocol.slice(0, -1), // Remove trailing ':'
      host: url.hostname || undefined,
      path: url.pathname,
      query: Object.keys(query).length > 0 ? query : undefined,
      fragment: url.hash ? url.hash.slice(1) : undefined, // Remove leading '#'
    };
  } catch {
    // Fallback for non-standard URIs
    const colonIndex = uri.indexOf(":");
    if (colonIndex === -1) {
      return { scheme: "", path: uri };
    }

    const scheme = uri.slice(0, colonIndex);
    const rest = uri.slice(colonIndex + 1);

    return { scheme, path: rest };
  }
}

/**
 * Build a URI from components
 */
export function buildUri(components: {
  scheme: string;
  host?: string;
  path: string;
  query?: Record<string, string>;
  fragment?: string;
}): string {
  let uri = `${components.scheme}:`;

  if (components.host) {
    uri += `//${components.host}`;
  }

  uri += components.path;

  if (components.query && Object.keys(components.query).length > 0) {
    const params = new URLSearchParams(components.query);
    uri += `?${params.toString()}`;
  }

  if (components.fragment) {
    uri += `#${components.fragment}`;
  }

  return uri;
}

/**
 * Check if a URI is valid
 */
export function isValidUri(uri: string): boolean {
  try {
    new URL(uri);
    return true;
  } catch {
    // Check for basic scheme:path format
    return /^[a-z][a-z0-9+.-]*:/i.test(uri);
  }
}

// ==============================================================================
// Message Utilities
// ==============================================================================

/**
 * Create a JSON-RPC request message
 */
export function createRequest(
  id: string | number,
  method: string,
  params?: Record<string, unknown>
): JsonRpcRequest {
  // Debug logging for parameter tracking
  console.log(`[createRequest] Creating request with:`, {
    id,
    method,
    params,
    hasParams: !!params,
    paramsKeys: params ? Object.keys(params) : [],
  });

  const request = {
    jsonrpc: JSONRPC_VERSION,
    id,
    method,
    ...(params && { params }),
  };

  console.log(`[createRequest] Final request object:`, request);
  return request;
}

/**
 * Create a JSON-RPC response message
 */
export function createResponse(
  id: string | number | null,
  result?: unknown,
  error?: { code: number; message: string; data?: unknown }
): JsonRpcResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    ...(result !== undefined && { result }),
    ...(error && { error }),
  };
}

/**
 * Create a JSON-RPC notification message
 */
export function createNotification(
  method: string,
  params?: Record<string, unknown>
): JsonRpcNotification {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    ...(params && { params }),
  };
}

/**
 * Extract method name from a JSON-RPC message
 */
export function getMethodName(message: JsonRpcMessage): string | null {
  if ("method" in message && typeof message.method === "string") {
    return message.method;
  }
  return null;
}

/**
 * Check if a method is an MCP request method
 */
export function isMcpRequestMethod(method: string): boolean {
  return Object.values(MCP_METHODS).includes(method as any);
}

/**
 * Check if a method is an MCP notification method
 */
export function isMcpNotificationMethod(method: string): boolean {
  return Object.values(MCP_NOTIFICATIONS).includes(method as any);
}

// ==============================================================================
// Error Utilities
// ==============================================================================

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return createResponse(id, undefined, { code, message, data });
}

/**
 * Extract error information from a response
 */
export function extractError(response: JsonRpcResponse): {
  code: number;
  message: string;
  data?: unknown;
} | null {
  return response.error || null;
}

// ==============================================================================
// Content Utilities
// ==============================================================================

/**
 * Sanitize text content for safe display
 */
export function sanitizeText(text: string, maxLength?: number): string {
  // eslint-disable-next-line no-control-regex
  let sanitized = text.replace(/[\x00-\x1F\x7F]/g, ""); // Remove control characters

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength - 3) + "...";
  }

  return sanitized;
}

/**
 * Validate base64 encoded data
 */
export function isValidBase64(data: string): boolean {
  try {
    return btoa(atob(data)) === data;
  } catch {
    return false;
  }
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const mimeMap: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    csv: "text/csv",
  };

  return mimeMap[ext || ""] || "application/octet-stream";
}

// ==============================================================================
// Debugging Utilities
// ==============================================================================

/**
 * Create a safe string representation of an object for logging
 */
export function safeStringify(obj: unknown, maxDepth = 3): string {
  const seen = new WeakSet();

  function replacer(key: string, value: unknown, depth = 0): unknown {
    if (depth > maxDepth) {
      return "[Max Depth Exceeded]";
    }

    if (value === null || typeof value !== "object") {
      return value;
    }

    if (seen.has(value as object)) {
      return "[Circular Reference]";
    }

    seen.add(value as object);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    return value;
  }

  try {
    return JSON.stringify(obj, (key, value) => replacer(key, value), 2);
  } catch {
    return "[Unstringifiable Object]";
  }
}

/**
 * Truncate a string for display purposes
 */
export function truncateString(str: string, maxLength = 100): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

// ==============================================================================
// Performance Utilities
// ==============================================================================

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;

  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let inThrottle: boolean;

  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
}

/**
 * Create a timeout promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = "Operation timed out"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
