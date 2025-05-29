/**
 * Model Context Protocol (MCP) Constants
 *
 * This file contains constant values used throughout the MCP integration,
 * including method names, error codes, and default values.
 */

// ==============================================================================
// Protocol Constants
// ==============================================================================

/**
 * JSON-RPC version for MCP
 */
export const JSONRPC_VERSION = "2.0" as const;

/**
 * Default MCP protocol version
 */
export const DEFAULT_PROTOCOL_VERSION = "2025-03-26" as const;

/**
 * Supported MCP protocol versions
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26"] as const;

// ==============================================================================
// Request Method Names
// ==============================================================================

/**
 * MCP request method names
 */
export const MCP_METHODS = {
  // Core protocol
  INITIALIZE: "initialize",
  PING: "ping",

  // Resources
  RESOURCES_LIST: "resources/list",
  RESOURCES_READ: "resources/read",
  RESOURCES_SUBSCRIBE: "resources/subscribe",
  RESOURCES_UNSUBSCRIBE: "resources/unsubscribe",

  // Tools
  TOOLS_LIST: "tools/list",
  TOOLS_CALL: "tools/call",

  // Prompts
  PROMPTS_LIST: "prompts/list",
  PROMPTS_GET: "prompts/get",

  // Sampling
  SAMPLING_CREATE_MESSAGE: "sampling/createMessage",

  // Logging
  LOGGING_SET_LEVEL: "logging/setLevel",

  // Roots
  ROOTS_LIST: "roots/list",
} as const;

// ==============================================================================
// Notification Method Names
// ==============================================================================

/**
 * MCP notification method names
 */
export const MCP_NOTIFICATIONS = {
  // Core protocol
  INITIALIZED: "notifications/initialized",
  CANCELLED: "notifications/cancelled",
  PROGRESS: "notifications/progress",

  // Resource notifications
  RESOURCES_LIST_CHANGED: "notifications/resources/list_changed",
  RESOURCES_UPDATED: "notifications/resources/updated",

  // Tool notifications
  TOOLS_LIST_CHANGED: "notifications/tools/list_changed",

  // Prompt notifications
  PROMPTS_LIST_CHANGED: "notifications/prompts/list_changed",

  // Root notifications
  ROOTS_LIST_CHANGED: "notifications/roots/list_changed",
} as const;

// ==============================================================================
// Error Codes
// ==============================================================================

/**
 * Standard JSON-RPC error codes
 */
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * MCP specific error codes
 */
export const MCP_ERROR_CODES = {
  INVALID_SESSION: -32000,
  RESOURCE_NOT_FOUND: -32001,
  TOOL_NOT_FOUND: -32002,
  PROMPT_NOT_FOUND: -32003,
  CAPABILITY_NOT_SUPPORTED: -32004,
} as const;

// ==============================================================================
// Transport Constants
// ==============================================================================

/**
 * Transport types
 */
export const TRANSPORT_TYPES = {
  STDIO: "stdio",
  SSE: "sse",
  HTTP: "http",
} as const;

/**
 * Transport states
 */
export const TRANSPORT_STATES = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting",
} as const;

// ==============================================================================
// Default Values
// ==============================================================================

/**
 * Default timeouts and limits
 */
export const DEFAULTS = {
  CONNECTION_TIMEOUT: 10000, // 10 seconds
  REQUEST_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  MAX_CONCURRENT_CONNECTIONS: 10,
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1MB
} as const;

/**
 * Default client info
 */
export const DEFAULT_CLIENT_INFO = {
  name: "obsidian-copilot-mcp",
  version: "1.0.0",
} as const;

/**
 * Log levels
 */
export const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  NOTICE: "notice",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
  ALERT: "alert",
  EMERGENCY: "emergency",
} as const;

// ==============================================================================
// Content Types
// ==============================================================================

/**
 * MIME types for common content
 */
export const MIME_TYPES = {
  TEXT_PLAIN: "text/plain",
  TEXT_MARKDOWN: "text/markdown",
  TEXT_HTML: "text/html",
  APPLICATION_JSON: "application/json",
  IMAGE_PNG: "image/png",
  IMAGE_JPEG: "image/jpeg",
  IMAGE_GIF: "image/gif",
  IMAGE_SVG: "image/svg+xml",
} as const;

/**
 * Tool content types
 */
export const TOOL_CONTENT_TYPES = {
  TEXT: "text",
  IMAGE: "image",
  RESOURCE: "resource",
} as const;

/**
 * Message content types
 */
export const MESSAGE_CONTENT_TYPES = {
  TEXT: "text",
  IMAGE: "image",
} as const;

/**
 * Message roles
 */
export const MESSAGE_ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

// ==============================================================================
// Validation Constants
// ==============================================================================

/**
 * Limits for various MCP entities
 */
export const LIMITS = {
  MAX_TOOL_NAME_LENGTH: 100,
  MAX_RESOURCE_URI_LENGTH: 2000,
  MAX_PROMPT_NAME_LENGTH: 100,
  MAX_MESSAGE_TEXT_LENGTH: 100000,
  MAX_ARGUMENTS_SIZE: 10000,
} as const;

/**
 * Required fields for validation
 */
export const REQUIRED_FIELDS = {
  TOOL: ["name", "inputSchema"],
  RESOURCE: ["uri", "name"],
  PROMPT: ["name"],
  CLIENT_INFO: ["name", "version"],
  SERVER_INFO: ["name", "version"],
} as const;

// ==============================================================================
// URI Schemes
// ==============================================================================

/**
 * Common URI schemes used in MCP
 */
export const URI_SCHEMES = {
  FILE: "file",
  HTTP: "http",
  HTTPS: "https",
  OBSIDIAN: "obsidian",
  CUSTOM: "custom",
} as const;

// ==============================================================================
// Obsidian Integration Constants
// ==============================================================================

/**
 * Obsidian Copilot MCP integration specific constants
 */
export const OBSIDIAN_MCP = {
  SETTING_KEY: "mcp_integration",
  DEFAULT_LOG_LEVEL: "info",
  MAX_TOOL_EXECUTION_TIME: 60000, // 60 seconds
  VAULT_URI_PREFIX: "obsidian://vault",
  NOTE_URI_PREFIX: "obsidian://note",
} as const;

/**
 * Default MCP server configurations for common use cases
 */
export const DEFAULT_SERVER_CONFIGS = {
  FILESYSTEM: {
    name: "File System Server",
    description: "Access local file system",
    transport: "stdio" as const,
    capabilities: ["resources", "tools"],
  },
  WEB_SEARCH: {
    name: "Web Search Server",
    description: "Search the web",
    transport: "sse" as const,
    capabilities: ["tools"],
  },
  DATABASE: {
    name: "Database Server",
    description: "Query databases",
    transport: "stdio" as const,
    capabilities: ["resources", "tools"],
  },
} as const;
