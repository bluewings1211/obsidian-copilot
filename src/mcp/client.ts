/**
 * Model Context Protocol (MCP) Client Implementation
 *
 * This file implements the MCPClient class, which handles communication
 * with MCP servers using various transport protocols (stdio, SSE).
 * It provides a unified interface for managing server connections,
 * handling protocol initialization, and executing MCP operations.
 */

import { EventEmitter } from "events";
import type {
  JsonRpcMessage,
  JsonRpcResponse,
  JsonRpcId,
  Transport,
  InitializeParams,
  InitializeResult,
  ClientInfo,
  ClientCapabilities,
  McpServerConfig,
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
  CallToolParams,
  CallToolResult,
  ReadResourceParams,
  ReadResourceResult,
  GetPromptParams,
  GetPromptResult,
  McpVersion,
  LogLevel,
} from "./types";

import {
  createRequest,
  createNotification,
  isJsonRpcMessage,
  isJsonRpcResponse,
  withTimeout,
  safeStringify,
} from "./utils";

import {
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_CLIENT_INFO,
  MCP_METHODS,
  MCP_NOTIFICATIONS,
  DEFAULTS,
  LOG_LEVELS,
} from "./constants";

import { StdioTransport, SseTransport } from "./transports";

/**
 * MCP Client configuration options
 */
export interface McpClientOptions {
  /** Client information to send during initialization */
  clientInfo?: ClientInfo;
  /** MCP protocol version to use */
  protocolVersion?: McpVersion;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Maximum number of retry attempts */
  retryAttempts?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Log level for internal logging */
  logLevel?: LogLevel;
}

/**
 * MCP Client connection state
 */
export type McpClientState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

/**
 * MCP Client events
 */
export interface McpClientEvents {
  /** Connection state changed */
  stateChange: (state: McpClientState) => void;
  /** Connection established and initialized */
  connected: (serverInfo: InitializeResult) => void;
  /** Connection lost */
  disconnected: () => void;
  /** Error occurred */
  error: (error: Error) => void;
  /** Notification received from server */
  notification: (method: string, params?: Record<string, unknown>) => void;
  /** Debug log message */
  debug: (message: string, data?: unknown) => void;
}

/**
 * Pending request tracking
 */
interface PendingRequest {
  id: JsonRpcId;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  method: string;
}

/**
 * MCP Client implementation
 */
export class McpClient extends EventEmitter {
  private config: McpServerConfig;
  private options: Required<McpClientOptions>;
  private transport: Transport | null = null;
  private state: McpClientState = "disconnected";
  private pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private requestIdCounter = 0;
  private serverInfo: InitializeResult | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  constructor(config: McpServerConfig, options: McpClientOptions = {}) {
    super();
    this.config = config;
    this.options = {
      clientInfo: options.clientInfo || DEFAULT_CLIENT_INFO,
      protocolVersion: options.protocolVersion || DEFAULT_PROTOCOL_VERSION,
      requestTimeout: options.requestTimeout || DEFAULTS.REQUEST_TIMEOUT,
      connectionTimeout: options.connectionTimeout || DEFAULTS.CONNECTION_TIMEOUT,
      retryAttempts: options.retryAttempts || DEFAULTS.RETRY_ATTEMPTS,
      retryDelay: options.retryDelay || DEFAULTS.RETRY_DELAY,
      debug: options.debug || false,
      logLevel: options.logLevel || LOG_LEVELS.INFO,
    };
  }

  // ==============================================================================
  // Public API
  // ==============================================================================

  /**
   * Get current connection state
   */
  public getState(): McpClientState {
    return this.state;
  }

  /**
   * Check if client is connected
   */
  public isConnected(): boolean {
    return this.state === "connected";
  }

  /**
   * Get server information (available after successful connection)
   */
  public getServerInfo(): InitializeResult | null {
    return this.serverInfo;
  }

  /**
   * Connect to MCP server
   */
  public async connect(): Promise<void> {
    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    this.setState("connecting");
    this.log("debug", "Connecting to MCP server", { config: this.config });

    try {
      // Create transport based on configuration
      this.transport = this.createTransport();

      // Set up transport event handlers
      this.setupTransportHandlers();

      // Start transport with timeout
      await withTimeout(
        this.transport.start(),
        this.options.connectionTimeout,
        "Connection timeout"
      );

      // Perform MCP initialization handshake
      await this.initialize();

      this.setState("connected");
      this.reconnectAttempts = 0;
      this.emit("connected", this.serverInfo!);
      this.log("info", "Successfully connected to MCP server");
    } catch (error) {
      this.setState("error");
      const errorMessage = error instanceof Error ? error.message : String(error);
      const clientError = new Error(`Failed to connect to MCP server: ${errorMessage}`);
      this.log("error", "Connection failed", { error: clientError });
      this.emit("error", clientError);

      // Clean up
      if (this.transport) {
        try {
          await this.transport.close();
        } catch (closeError) {
          this.log("debug", "Error closing transport after connection failure", closeError);
        }
        this.transport = null;
      }

      throw clientError;
    }
  }

  /**
   * Disconnect from MCP server
   */
  public async disconnect(): Promise<void> {
    if (this.state === "disconnected" || this.state === "disconnecting") {
      return;
    }

    this.setState("disconnecting");
    this.log("debug", "Disconnecting from MCP server");

    // Cancel all pending requests
    this.cancelAllPendingRequests("Client disconnecting");

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close transport
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        this.log("debug", "Error closing transport", error);
      }
      this.transport = null;
    }

    this.setState("disconnected");
    this.serverInfo = null;
    this.emit("disconnected");
    this.log("info", "Disconnected from MCP server");
  }

  /**
   * List available tools from server
   */
  public async listTools(cursor?: string): Promise<ListToolsResult> {
    this.ensureConnected();
    return this.sendRequest(MCP_METHODS.TOOLS_LIST, { cursor });
  }

  /**
   * Call a tool on the server
   */
  public async callTool(params: CallToolParams): Promise<CallToolResult> {
    this.ensureConnected();
    return this.sendRequest(MCP_METHODS.TOOLS_CALL, params as unknown as Record<string, unknown>);
  }

  /**
   * List available resources from server
   */
  public async listResources(cursor?: string): Promise<ListResourcesResult> {
    this.ensureConnected();
    return this.sendRequest(MCP_METHODS.RESOURCES_LIST, { cursor });
  }

  /**
   * Read a resource from the server
   */
  public async readResource(params: ReadResourceParams): Promise<ReadResourceResult> {
    this.ensureConnected();
    return this.sendRequest(
      MCP_METHODS.RESOURCES_READ,
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * List available prompts from server
   */
  public async listPrompts(cursor?: string): Promise<ListPromptsResult> {
    this.ensureConnected();
    return this.sendRequest(MCP_METHODS.PROMPTS_LIST, { cursor });
  }

  /**
   * Get a prompt from the server
   */
  public async getPrompt(params: GetPromptParams): Promise<GetPromptResult> {
    this.ensureConnected();
    return this.sendRequest(MCP_METHODS.PROMPTS_GET, params as unknown as Record<string, unknown>);
  }

  /**
   * Send a ping to the server
   */
  public async ping(): Promise<void> {
    this.ensureConnected();
    await this.sendRequest(MCP_METHODS.PING);
  }

  // ==============================================================================
  // Private Methods
  // ==============================================================================

  /**
   * Create transport instance based on configuration
   */
  private createTransport(): Transport {
    switch (this.config.transport) {
      case "stdio":
        return new StdioTransport(this.config.connection as any);
      case "sse":
        return new SseTransport(this.config.connection as any);
      default:
        throw new Error(`Unsupported transport type: ${this.config.transport}`);
    }
  }

  /**
   * Set up transport event handlers
   */
  private setupTransportHandlers(): void {
    if (!this.transport) return;

    this.transport.onmessage = (message: JsonRpcMessage) => {
      this.handleMessage(message);
    };

    this.transport.onerror = (error: Error) => {
      this.log("error", "Transport error", error);
      this.handleTransportError(error);
    };

    this.transport.onclose = () => {
      this.log("debug", "Transport closed");
      this.handleTransportClose();
    };
  }

  /**
   * Perform MCP initialization handshake
   */
  private async initialize(): Promise<void> {
    const initParams: InitializeParams = {
      protocolVersion: this.options.protocolVersion,
      clientInfo: this.options.clientInfo,
      capabilities: this.getClientCapabilities(),
    };

    this.log("debug", "Sending initialize request", initParams);

    const result = await this.sendRequest(
      MCP_METHODS.INITIALIZE,
      initParams as unknown as Record<string, unknown>
    );
    this.serverInfo = result as InitializeResult;

    // Send initialized notification
    await this.sendNotification(MCP_NOTIFICATIONS.INITIALIZED);

    this.log("debug", "Initialization complete", this.serverInfo);
  }

  /**
   * Get client capabilities
   */
  private getClientCapabilities(): ClientCapabilities {
    return {
      roots: {
        listChanged: true,
      },
      sampling: {},
    };
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<any> {
    if (!this.transport) {
      throw new Error("Not connected to server");
    }

    const id = this.generateRequestId();
    const request = createRequest(id, method, params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.options.requestTimeout);

      this.pendingRequests.set(id, {
        id,
        resolve,
        reject,
        timeout,
        method,
      });

      this.transport!.send(request).catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      });

      this.log("debug", `Sent request: ${method}`, { id, params });
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.transport) {
      throw new Error("Not connected to server");
    }

    const notification = createNotification(method, params);
    await this.transport.send(notification);
    this.log("debug", `Sent notification: ${method}`, params);
  }

  /**
   * Handle incoming messages from transport
   */
  private handleMessage(message: JsonRpcMessage): void {
    this.log("debug", "Received message", message);

    if (!isJsonRpcMessage(message)) {
      this.log("error", "Invalid JSON-RPC message received", message);
      return;
    }

    if (isJsonRpcResponse(message)) {
      this.handleResponse(message);
    } else if ("method" in message && !("id" in message)) {
      // Notification
      const notification = message as any;
      this.handleNotification(notification.method as string, notification.params);
    } else {
      this.log("error", "Unexpected message type", message);
    }
  }

  /**
   * Handle JSON-RPC response
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.log("debug", "Received response for unknown request", response);
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      const error = new Error(`${pending.method} failed: ${response.error.message}`);
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle JSON-RPC notification
   */
  private handleNotification(method: string, params?: Record<string, unknown>): void {
    this.log("debug", `Received notification: ${method}`, params);
    this.emit("notification", method, params);
  }

  /**
   * Handle transport errors
   */
  private handleTransportError(error: Error): void {
    this.setState("error");
    this.emit("error", error);

    // Cancel pending requests
    this.cancelAllPendingRequests("Transport error");

    // Attempt reconnection if enabled
    this.scheduleReconnect();
  }

  /**
   * Handle transport close
   */
  private handleTransportClose(): void {
    if (this.state === "disconnecting") {
      // Expected disconnection
      return;
    }

    this.setState("disconnected");
    this.emit("disconnected");

    // Cancel pending requests
    this.cancelAllPendingRequests("Connection lost");

    // Attempt reconnection if enabled
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.retryAttempts) {
      this.log("error", "Maximum reconnection attempts reached");
      return;
    }

    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    const delay = this.options.retryDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.log("info", `Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.log("debug", "Reconnection attempt failed", error);
        // Will schedule another attempt if within retry limits
      }
    }, delay);
  }

  /**
   * Cancel all pending requests
   */
  private cancelAllPendingRequests(reason: string): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    });
    this.pendingRequests.clear();
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${this.options.clientInfo.name}-${++this.requestIdCounter}`;
  }

  /**
   * Set client state and emit event
   */
  private setState(state: McpClientState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit("stateChange", state);
      this.log("debug", `State changed to: ${state}`);
    }
  }

  /**
   * Ensure client is connected, throw error if not
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error("Not connected to MCP server");
    }
  }

  /**
   * Internal logging
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (this.options.debug) {
      this.emit("debug", `[${level.toUpperCase()}] ${message}`, data);
    }

    // Only log at or above configured level
    const levelPriority = Object.values(LOG_LEVELS).indexOf(level);
    const configuredPriority = Object.values(LOG_LEVELS).indexOf(this.options.logLevel);

    if (levelPriority >= configuredPriority) {
      const logData = data ? ` ${safeStringify(data)}` : "";
      console.log(`[MCPClient:${this.config.name}] ${message}${logData}`);
    }
  }

  // ==============================================================================
  // EventEmitter overrides for type safety
  // ==============================================================================

  public on<K extends keyof McpClientEvents>(event: K, listener: McpClientEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof McpClientEvents>(
    event: K,
    ...args: Parameters<McpClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  public off<K extends keyof McpClientEvents>(event: K, listener: McpClientEvents[K]): this {
    return super.off(event, listener);
  }

  public once<K extends keyof McpClientEvents>(event: K, listener: McpClientEvents[K]): this {
    return super.once(event, listener);
  }
}
