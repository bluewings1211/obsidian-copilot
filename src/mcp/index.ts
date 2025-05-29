/**
 * Model Context Protocol (MCP) Integration for Obsidian Copilot
 *
 * This module provides TypeScript types and interfaces for integrating
 * the Model Context Protocol into Obsidian Copilot.
 */

// Export all core MCP types
export * from "./types";

// Export constants
export * from "./constants";

// Export utility functions
export * from "./utils";

// Export schemas
export * from "./schemas";

// Export client implementation
export { McpClient } from "./client";
export type { McpClientOptions, McpClientState, McpClientEvents } from "./client";

// Export manager implementation
export { McpManager } from "./manager";
export type {
  McpManagerOptions,
  McpManagerEvents,
  ServerStatus,
  AggregatedTool,
  AggregatedResource,
  AggregatedPrompt,
} from "./manager";

// Export tool adapter implementation
export { McpToolAdapter, McpToolAdapterManager } from "./tool-adapter";
export type { McpToolWrapper, McpToolAdapterOptions } from "./tool-adapter";

// Export transports
export * from "./transports";

// Import types needed for constants
import type { McpVersion } from "./types";

// Re-export commonly used types for convenience
export type {
  // Core protocol types
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  McpVersion,

  // Initialization
  ClientInfo,
  ServerInfo,
  InitializeParams,
  InitializeResult,

  // Capabilities
  ClientCapabilities,
  ServerCapabilities,

  // Resources
  Resource,
  ResourceTemplate,
  ResourceContent,
  ListResourcesResult,
  ReadResourceResult,

  // Tools
  Tool,
  ToolContent,
  CallToolParams,
  CallToolResult,
  ListToolsResult,

  // Prompts
  Prompt,
  PromptMessage,
  GetPromptResult,
  ListPromptsResult,

  // Transport
  Transport,
  TransportState,
  StdioTransportConfig,
  SseTransportConfig,
  HttpTransportConfig,

  // Error handling
  McpError,
  McpErrorCode,

  // Obsidian integration
  McpServerConfig,
  McpIntegrationSettings,
  McpToolContext,
  McpResourceContext,
} from "./types";

/**
 * Version information for the MCP integration
 */
export const MCP_INTEGRATION_VERSION = "1.0.0";

/**
 * Supported MCP protocol versions
 */
export const SUPPORTED_MCP_VERSIONS: McpVersion[] = ["2024-11-05", "2025-03-26"];

/**
 * Default MCP protocol version to use
 */
export const DEFAULT_MCP_VERSION: McpVersion = "2025-03-26";
