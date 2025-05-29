/**
 * Model Context Protocol (MCP) Type Definitions
 *
 * This file contains TypeScript interface definitions for the Model Context Protocol,
 * covering all core MCP concepts including JSON-RPC messaging, transports, resources,
 * tools, prompts, and server capabilities.
 *
 * Based on the official MCP specification and TypeScript SDK.
 */

// ==============================================================================
// JSON-RPC 2.0 Base Types
// ==============================================================================

/**
 * JSON-RPC 2.0 message ID type
 */
export type JsonRpcId = string | number | null;

/**
 * Base JSON-RPC 2.0 message structure
 */
export interface JsonRpcMessage {
  readonly jsonrpc: "2.0";
}

/**
 * JSON-RPC 2.0 request message
 */
export interface JsonRpcRequest extends JsonRpcMessage {
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response message
 */
export interface JsonRpcResponse extends JsonRpcMessage {
  readonly id: JsonRpcId;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 notification message (no response expected)
 */
export interface JsonRpcNotification extends JsonRpcMessage {
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 error object
 */
export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

// ==============================================================================
// MCP Protocol Core Types
// ==============================================================================

/**
 * MCP protocol version
 */
export type McpVersion = "2024-11-05" | "2025-03-26";

/**
 * Client information provided during initialization
 */
export interface ClientInfo {
  readonly name: string;
  readonly version: string;
}

/**
 * Server information provided during initialization
 */
export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

/**
 * MCP initialization request parameters
 */
export interface InitializeParams {
  readonly protocolVersion: McpVersion;
  readonly clientInfo: ClientInfo;
  readonly capabilities: ClientCapabilities;
}

/**
 * MCP initialization response
 */
export interface InitializeResult {
  readonly protocolVersion: McpVersion;
  readonly serverInfo: ServerInfo;
  readonly capabilities: ServerCapabilities;
}

// ==============================================================================
// Capabilities
// ==============================================================================

/**
 * Client capabilities declaration
 */
export interface ClientCapabilities {
  readonly experimental?: Record<string, unknown>;
  readonly sampling?: SamplingCapabilities;
  readonly roots?: RootsCapabilities;
}

/**
 * Server capabilities declaration
 */
export interface ServerCapabilities {
  readonly experimental?: Record<string, unknown>;
  readonly logging?: LoggingCapabilities;
  readonly prompts?: PromptsCapabilities;
  readonly resources?: ResourcesCapabilities;
  readonly tools?: ToolsCapabilities;
  readonly sampling?: SamplingCapabilities;
}

/**
 * Sampling capabilities for AI model interaction
 */
export interface SamplingCapabilities {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Roots capabilities for workspace access
 */
export interface RootsCapabilities {
  readonly listChanged?: boolean;
}

/**
 * Logging capabilities
 */
export interface LoggingCapabilities {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Prompts capabilities
 */
export interface PromptsCapabilities {
  readonly listChanged?: boolean;
}

/**
 * Resources capabilities
 */
export interface ResourcesCapabilities {
  readonly subscribe?: boolean;
  readonly listChanged?: boolean;
}

/**
 * Tools capabilities
 */
export interface ToolsCapabilities {
  readonly listChanged?: boolean;
}

// ==============================================================================
// Resources
// ==============================================================================

/**
 * Resource identifier and metadata
 */
export interface Resource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}

/**
 * Resource template for dynamic resource generation
 */
export interface ResourceTemplate {
  readonly uriTemplate: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}

/**
 * Resource content with data
 */
export interface ResourceContent {
  readonly uri: string;
  readonly mimeType?: string;
  readonly text?: string;
  readonly blob?: string; // base64 encoded binary data
}

/**
 * Parameters for listing resources
 */
export interface ListResourcesParams {
  readonly cursor?: string;
}

/**
 * Response for listing resources
 */
export interface ListResourcesResult {
  readonly resources: Resource[];
  readonly nextCursor?: string;
}

/**
 * Parameters for reading a resource
 */
export interface ReadResourceParams {
  readonly uri: string;
}

/**
 * Response for reading a resource
 */
export interface ReadResourceResult {
  readonly contents: ResourceContent[];
}

/**
 * Parameters for subscribing to resource changes
 */
export interface SubscribeParams {
  readonly uri: string;
}

/**
 * Parameters for unsubscribing from resource changes
 */
export interface UnsubscribeParams {
  readonly uri: string;
}

// ==============================================================================
// Tools
// ==============================================================================

/**
 * Tool definition
 */
export interface Tool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: JsonSchema;
}

/**
 * JSON Schema definition for tool parameters
 */
export interface JsonSchema {
  readonly type: string;
  readonly properties?: Record<string, JsonSchemaProperty>;
  readonly required?: string[];
  readonly additionalProperties?: boolean;
  readonly [key: string]: unknown;
}

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  readonly type: string;
  readonly description?: string;
  readonly enum?: unknown[];
  readonly items?: JsonSchemaProperty;
  readonly properties?: Record<string, JsonSchemaProperty>;
  readonly [key: string]: unknown;
}

/**
 * Parameters for listing tools
 */
export interface ListToolsParams {
  readonly cursor?: string;
}

/**
 * Response for listing tools
 */
export interface ListToolsResult {
  readonly tools: Tool[];
  readonly nextCursor?: string;
}

/**
 * Parameters for calling a tool
 */
export interface CallToolParams {
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

/**
 * Content types for tool responses
 */
export type ToolContent = TextContent | ImageContent | EmbeddedResource;

/**
 * Text content in tool response
 */
export interface TextContent {
  readonly type: "text";
  readonly text: string;
}

/**
 * Image content in tool response
 */
export interface ImageContent {
  readonly type: "image";
  readonly data: string; // base64 encoded
  readonly mimeType: string;
}

/**
 * Embedded resource in tool response
 */
export interface EmbeddedResource {
  readonly type: "resource";
  readonly resource: ResourceContent;
}

/**
 * Response from tool execution
 */
export interface CallToolResult {
  readonly content: ToolContent[];
  readonly isError?: boolean;
}

// ==============================================================================
// Prompts
// ==============================================================================

/**
 * Prompt definition
 */
export interface Prompt {
  readonly name: string;
  readonly description?: string;
  readonly arguments?: PromptArgument[];
}

/**
 * Prompt argument definition
 */
export interface PromptArgument {
  readonly name: string;
  readonly description?: string;
  readonly required?: boolean;
}

/**
 * Parameters for listing prompts
 */
export interface ListPromptsParams {
  readonly cursor?: string;
}

/**
 * Response for listing prompts
 */
export interface ListPromptsResult {
  readonly prompts: Prompt[];
  readonly nextCursor?: string;
}

/**
 * Parameters for getting a prompt
 */
export interface GetPromptParams {
  readonly name: string;
  readonly arguments?: Record<string, string>;
}

/**
 * Message content types
 */
export type MessageContent = TextMessageContent | ImageMessageContent;

/**
 * Text message content
 */
export interface TextMessageContent {
  readonly type: "text";
  readonly text: string;
}

/**
 * Image message content
 */
export interface ImageMessageContent {
  readonly type: "image";
  readonly data: string; // base64 encoded
  readonly mimeType: string;
}

/**
 * Message in a prompt
 */
export interface PromptMessage {
  readonly role: "user" | "assistant" | "system";
  readonly content: MessageContent;
}

/**
 * Response from getting a prompt
 */
export interface GetPromptResult {
  readonly description?: string;
  readonly messages: PromptMessage[];
}

// ==============================================================================
// Sampling (AI Model Interaction)
// ==============================================================================

/**
 * Model preferences for sampling
 */
export interface ModelPreferences {
  readonly hints?: ModelHint[];
  readonly costPriority?: number; // 0-1
  readonly speedPriority?: number; // 0-1
  readonly intelligencePriority?: number; // 0-1
}

/**
 * Model hint for sampling
 */
export interface ModelHint {
  readonly name?: string;
}

/**
 * Sampling message for AI interaction
 */
export interface SamplingMessage {
  readonly role: "user" | "assistant";
  readonly content: MessageContent;
}

/**
 * Parameters for creating a sampling message
 */
export interface CreateMessageParams {
  readonly messages: SamplingMessage[];
  readonly modelPreferences?: ModelPreferences;
  readonly systemPrompt?: string;
  readonly includeContext?: "none" | "thisServer" | "allServers";
  readonly temperature?: number;
  readonly maxTokens: number;
  readonly stopSequences?: string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Response from creating a sampling message
 */
export interface CreateMessageResult {
  readonly role: "assistant";
  readonly content: MessageContent;
  readonly model: string;
  readonly stopReason?: "endTurn" | "stopSequence" | "maxTokens";
}

// ==============================================================================
// Logging
// ==============================================================================

/**
 * Log levels
 */
export type LogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

/**
 * Parameters for logging a message
 */
export interface LoggingMessageParams {
  readonly level: LogLevel;
  readonly data?: unknown;
  readonly logger?: string;
}

// ==============================================================================
// Roots (Workspace Access)
// ==============================================================================

/**
 * Root definition for workspace access
 */
export interface Root {
  readonly uri: string;
  readonly name: string;
}

/**
 * Response for listing roots
 */
export interface ListRootsResult {
  readonly roots: Root[];
}

// ==============================================================================
// Notifications
// ==============================================================================

/**
 * Notification for resource list changes
 */
export interface ResourceListChangedNotification {
  readonly method: "notifications/resources/list_changed";
}

/**
 * Notification for tool list changes
 */
export interface ToolListChangedNotification {
  readonly method: "notifications/tools/list_changed";
}

/**
 * Notification for prompt list changes
 */
export interface PromptListChangedNotification {
  readonly method: "notifications/prompts/list_changed";
}

/**
 * Notification for root list changes
 */
export interface RootListChangedNotification {
  readonly method: "notifications/roots/list_changed";
}

/**
 * Resource update notification parameters
 */
export interface ResourceUpdatedParams {
  readonly uri: string;
}

/**
 * Notification for resource updates
 */
export interface ResourceUpdatedNotification {
  readonly method: "notifications/resources/updated";
  readonly params: ResourceUpdatedParams;
}

// ==============================================================================
// Transport Layer Types
// ==============================================================================

/**
 * Transport connection state
 */
export type TransportState = "disconnected" | "connecting" | "connected" | "disconnecting";

/**
 * Transport interface for MCP communication
 */
export interface Transport {
  readonly state: TransportState;

  start(): Promise<void>;
  send(message: JsonRpcMessage): Promise<void>;
  close(): Promise<void>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JsonRpcMessage) => void;
}

/**
 * STDIO transport configuration
 */
export interface StdioTransportConfig {
  readonly command: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  readonly cwd?: string;
}

/**
 * SSE transport configuration
 */
export interface SseTransportConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
}

// ==============================================================================
// Error Types
// ==============================================================================

/**
 * MCP specific error codes
 */
export enum McpErrorCode {
  // Standard JSON-RPC errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // MCP specific errors
  InvalidSession = -32000,
  ResourceNotFound = -32001,
  ToolNotFound = -32002,
  PromptNotFound = -32003,
  CapabilityNotSupported = -32004,
}

/**
 * MCP error class
 */
export class McpError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "McpError";
  }

  toJsonRpcError(): JsonRpcError {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

// ==============================================================================
// Request/Response Method Types
// ==============================================================================

/**
 * MCP method names for requests
 */
export type McpRequestMethod =
  | "initialize"
  | "notifications/initialized"
  | "ping"
  | "resources/list"
  | "resources/read"
  | "resources/subscribe"
  | "resources/unsubscribe"
  | "tools/list"
  | "tools/call"
  | "prompts/list"
  | "prompts/get"
  | "sampling/createMessage"
  | "logging/setLevel"
  | "roots/list";

/**
 * MCP notification method names
 */
export type McpNotificationMethod =
  | "notifications/cancelled"
  | "notifications/progress"
  | "notifications/resources/list_changed"
  | "notifications/resources/updated"
  | "notifications/tools/list_changed"
  | "notifications/prompts/list_changed"
  | "notifications/roots/list_changed";

// ==============================================================================
// Configuration Types for Obsidian Integration
// ==============================================================================

/**
 * MCP server configuration for Obsidian settings
 */
export interface McpServerConfig {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly transport: "stdio" | "sse" | "http";
  readonly connection: StdioTransportConfig | SseTransportConfig | HttpTransportConfig;
  readonly capabilities?: string[]; // List of required capabilities
  readonly timeout?: number; // Connection timeout in milliseconds
  readonly retryAttempts?: number;
  readonly retryDelay?: number; // Delay between retry attempts in milliseconds
}

/**
 * MCP integration settings for Obsidian Copilot
 */
export interface McpIntegrationSettings {
  readonly enabled: boolean;
  readonly servers: McpServerConfig[];
  readonly globalTimeout: number;
  readonly maxConcurrentConnections: number;
  readonly debugMode: boolean;
  readonly logLevel: LogLevel;
}

/**
 * MCP tool usage context for Obsidian
 */
export interface McpToolContext {
  readonly serverId: string;
  readonly tool: Tool;
  readonly vault?: string; // Obsidian vault name
  readonly activeFile?: string; // Current active file path
  readonly selectedText?: string; // Currently selected text
}

/**
 * MCP resource context for Obsidian
 */
export interface McpResourceContext {
  readonly serverId: string;
  readonly resource: Resource;
  readonly vault?: string;
  readonly requestedBy?: string; // Context of what requested this resource
}
