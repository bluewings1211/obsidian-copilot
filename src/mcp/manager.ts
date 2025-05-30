/**
 * Model Context Protocol (MCP) Manager Implementation
 *
 * This file implements the MCPManager class, which manages multiple MCP server
 * connections and provides a unified interface for accessing tools and resources
 * across all connected servers. It handles server lifecycle, connection pooling,
 * and provides aggregated access to MCP capabilities.
 */

import { EventEmitter } from "events";
import type {
  McpServerConfig,
  McpIntegrationSettings,
  Tool,
  Resource,
  Prompt,
  CallToolParams,
  CallToolResult,
  ReadResourceParams,
  ReadResourceResult,
  GetPromptParams,
  GetPromptResult,
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
  InitializeResult,
  LogLevel,
  McpToolContext,
  McpResourceContext,
} from "./types";

import { McpClient, McpClientOptions, McpClientState } from "./client";
import { DEFAULTS, LOG_LEVELS } from "./constants";
import { safeStringify } from "./utils";

/**
 * Server status information
 */
export interface ServerStatus {
  readonly id: string;
  readonly name: string;
  readonly state: McpClientState;
  readonly serverInfo: InitializeResult | null;
  readonly lastError: Error | null;
  readonly connectedAt: Date | null;
  readonly toolCount: number;
  readonly resourceCount: number;
  readonly promptCount: number;
}

/**
 * Aggregated tool information with server context
 */
export interface AggregatedTool extends Tool {
  readonly serverId: string;
  readonly serverName: string;
}

/**
 * Aggregated resource information with server context
 */
export interface AggregatedResource extends Resource {
  readonly serverId: string;
  readonly serverName: string;
}

/**
 * Aggregated prompt information with server context
 */
export interface AggregatedPrompt extends Prompt {
  readonly serverId: string;
  readonly serverName: string;
}

/**
 * MCP Manager events
 */
export interface McpManagerEvents {
  /** Server connection state changed */
  serverStateChange: (serverId: string, state: McpClientState) => void;
  /** Server connected successfully */
  serverConnected: (serverId: string, serverInfo: InitializeResult) => void;
  /** Server disconnected */
  serverDisconnected: (serverId: string) => void;
  /** Server error occurred */
  serverError: (serverId: string, error: Error) => void;
  /** Tools list updated */
  toolsUpdated: (tools: AggregatedTool[]) => void;
  /** Resources list updated */
  resourcesUpdated: (resources: AggregatedResource[]) => void;
  /** Prompts list updated */
  promptsUpdated: (prompts: AggregatedPrompt[]) => void;
  /** Debug log message */
  debug: (message: string, data?: unknown) => void;
}

/**
 * MCP Manager configuration options
 */
export interface McpManagerOptions {
  /** Global timeout for operations */
  globalTimeout?: number;
  /** Maximum concurrent connections */
  maxConcurrentConnections?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Log level for internal logging */
  logLevel?: LogLevel;
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Cache tools and resources */
  enableCaching?: boolean;
  /** Cache refresh interval in milliseconds */
  cacheRefreshInterval?: number;
}

/**
 * Server client wrapper
 */
interface ServerClient {
  readonly config: McpServerConfig;
  readonly client: McpClient;
  lastError: Error | null;
  connectedAt: Date | null;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  lastToolsUpdate: Date | null;
  lastResourcesUpdate: Date | null;
  lastPromptsUpdate: Date | null;
}

/**
 * MCP Manager implementation
 */
export class McpManager extends EventEmitter {
  private settings: McpIntegrationSettings;
  private options: Required<McpManagerOptions>;
  private servers = new Map<string, ServerClient>();
  private cacheTimer: NodeJS.Timeout | null = null;
  private isStarted = false;

  constructor(settings: McpIntegrationSettings, options: McpManagerOptions = {}) {
    super();
    this.settings = settings;
    this.options = {
      globalTimeout: options.globalTimeout || DEFAULTS.REQUEST_TIMEOUT,
      maxConcurrentConnections:
        options.maxConcurrentConnections || DEFAULTS.MAX_CONCURRENT_CONNECTIONS,
      debug: options.debug || settings.debugMode,
      logLevel: options.logLevel || (settings.logLevel as LogLevel) || LOG_LEVELS.INFO,
      autoReconnect: options.autoReconnect ?? true,
      enableCaching: options.enableCaching ?? true,
      cacheRefreshInterval: options.cacheRefreshInterval || 300000, // 5 minutes
    };
  }

  // ==============================================================================
  // Public API - Lifecycle Management
  // ==============================================================================

  /**
   * Start the MCP manager and connect to all enabled servers
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      this.log("debug", "Manager already started");
      return;
    }

    this.log("info", "Starting MCP Manager", {
      serverCount: this.settings.servers.filter((s) => s.enabled).length,
      options: this.options,
    });

    this.isStarted = true;

    // Connect to all enabled servers
    const enabledServers = this.settings.servers.filter((server) => server.enabled);
    const connectionPromises = enabledServers.map((serverConfig) =>
      this.addServer(serverConfig).catch((error) => {
        this.log("error", `Failed to add server ${serverConfig.name}`, error);
        return null;
      })
    );

    await Promise.allSettled(connectionPromises);

    // Start cache refresh timer if caching is enabled
    if (this.options.enableCaching && this.options.cacheRefreshInterval > 0) {
      this.startCacheRefresh();
    }

    this.log("info", "MCP Manager started successfully", {
      connectedServers: Array.from(this.servers.values()).filter((s) => s.client.isConnected())
        .length,
      totalServers: this.servers.size,
    });
  }

  /**
   * Stop the MCP manager and disconnect from all servers
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.log("info", "Stopping MCP Manager");

    this.isStarted = false;

    // Stop cache refresh timer
    if (this.cacheTimer) {
      clearInterval(this.cacheTimer);
      this.cacheTimer = null;
    }

    // Disconnect from all servers
    const disconnectionPromises = Array.from(this.servers.values()).map((serverClient) =>
      this.removeServer(serverClient.config.id).catch((error) => {
        this.log("error", `Failed to remove server ${serverClient.config.name}`, error);
      })
    );

    await Promise.allSettled(disconnectionPromises);

    this.log("info", "MCP Manager stopped");
  }

  /**
   * Update settings and restart with new configuration
   */
  public async updateSettings(newSettings: McpIntegrationSettings): Promise<void> {
    this.log("info", "Updating MCP Manager settings");

    const wasStarted = this.isStarted;

    if (wasStarted) {
      await this.stop();
    }

    this.settings = newSettings;

    if (wasStarted && this.settings.enabled) {
      await this.start();
    }
  }

  // ==============================================================================
  // Public API - Server Management
  // ==============================================================================

  /**
   * Add a new MCP server
   */
  public async addServer(config: McpServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      throw new Error(`Server with id ${config.id} already exists`);
    }

    if (this.servers.size >= this.options.maxConcurrentConnections) {
      throw new Error(
        `Maximum concurrent connections (${this.options.maxConcurrentConnections}) reached`
      );
    }

    this.log("info", `Adding MCP server: ${config.name}`, { config });

    const clientOptions: McpClientOptions = {
      requestTimeout: config.timeout || this.options.globalTimeout,
      retryAttempts: config.retryAttempts || DEFAULTS.RETRY_ATTEMPTS,
      retryDelay: config.retryDelay || DEFAULTS.RETRY_DELAY,
      debug: this.options.debug,
      logLevel: this.options.logLevel,
    };

    const client = new McpClient(config, clientOptions);
    const serverClient: ServerClient = {
      config,
      client,
      lastError: null,
      connectedAt: null,
      tools: [],
      resources: [],
      prompts: [],
      lastToolsUpdate: null,
      lastResourcesUpdate: null,
      lastPromptsUpdate: null,
    };

    // Set up event handlers
    this.setupServerEventHandlers(serverClient);

    // Store the server client
    this.servers.set(config.id, serverClient);

    // Connect if enabled
    if (config.enabled) {
      try {
        await client.connect();
      } catch (error) {
        this.log("error", `Failed to connect to server ${config.name}`, error);
        throw error;
      }
    }
  }

  /**
   * Remove an MCP server
   */
  public async removeServer(serverId: string): Promise<void> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient) {
      this.log("debug", `Server ${serverId} not found for removal`);
      return;
    }

    this.log("info", `Removing MCP server: ${serverClient.config.name}`);

    // Disconnect the client
    try {
      await serverClient.client.disconnect();
    } catch (error) {
      this.log("error", `Error disconnecting server ${serverClient.config.name}`, error);
    }

    // Remove from servers map
    this.servers.delete(serverId);

    // Emit disconnection event
    this.emit("serverDisconnected", serverId);

    // Refresh aggregated lists
    await this.refreshAggregatedData();
  }

  /**
   * Get status of all servers
   */
  public getServerStatuses(): ServerStatus[] {
    return Array.from(this.servers.values()).map((serverClient) => ({
      id: serverClient.config.id,
      name: serverClient.config.name,
      state: serverClient.client.getState(),
      serverInfo: serverClient.client.getServerInfo(),
      lastError: serverClient.lastError,
      connectedAt: serverClient.connectedAt,
      toolCount: serverClient.tools.length,
      resourceCount: serverClient.resources.length,
      promptCount: serverClient.prompts.length,
    }));
  }

  /**
   * Get status of a specific server
   */
  public getServerStatus(serverId: string): ServerStatus | null {
    const serverClient = this.servers.get(serverId);
    if (!serverClient) {
      return null;
    }

    return {
      id: serverClient.config.id,
      name: serverClient.config.name,
      state: serverClient.client.getState(),
      serverInfo: serverClient.client.getServerInfo(),
      lastError: serverClient.lastError,
      connectedAt: serverClient.connectedAt,
      toolCount: serverClient.tools.length,
      resourceCount: serverClient.resources.length,
      promptCount: serverClient.prompts.length,
    };
  }

  // ==============================================================================
  // Public API - Tools Management
  // ==============================================================================

  /**
   * Get all available tools from all connected servers
   */
  public async getTools(): Promise<AggregatedTool[]> {
    const tools: AggregatedTool[] = [];

    for (const serverClient of this.servers.values()) {
      if (serverClient.client.isConnected()) {
        for (const tool of serverClient.tools) {
          tools.push({
            ...tool,
            serverId: serverClient.config.id,
            serverName: serverClient.config.name,
          });
        }
      }
    }

    return tools;
  }

  /**
   * Get a specific tool by name and server
   */
  public async getTool(serverId: string, toolName: string): Promise<AggregatedTool | null> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient || !serverClient.client.isConnected()) {
      return null;
    }

    const tool = serverClient.tools.find((t) => t.name === toolName);
    if (!tool) {
      return null;
    }

    return {
      ...tool,
      serverId: serverClient.config.id,
      serverName: serverClient.config.name,
    };
  }

  /**
   * Call a tool on a specific server
   */
  public async callTool(
    serverId: string,
    params: CallToolParams,
    context?: Partial<McpToolContext>
  ): Promise<CallToolResult> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (!serverClient.client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    this.log("debug", `Calling tool ${params.name} on server ${serverId}`, { params, context });

    try {
      const result = await serverClient.client.callTool(params);
      this.log("debug", `Tool ${params.name} completed successfully`, { result });
      return result;
    } catch (error) {
      this.log("error", `Tool ${params.name} failed on server ${serverId}`, error);
      throw error;
    }
  }

  // ==============================================================================
  // Public API - Resources Management
  // ==============================================================================

  /**
   * Get all available resources from all connected servers
   */
  public async getResources(): Promise<AggregatedResource[]> {
    const resources: AggregatedResource[] = [];

    for (const serverClient of this.servers.values()) {
      if (serverClient.client.isConnected()) {
        for (const resource of serverClient.resources) {
          resources.push({
            ...resource,
            serverId: serverClient.config.id,
            serverName: serverClient.config.name,
          });
        }
      }
    }

    return resources;
  }

  /**
   * Get a specific resource by URI and server
   */
  public async getResource(serverId: string, uri: string): Promise<AggregatedResource | null> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient || !serverClient.client.isConnected()) {
      return null;
    }

    const resource = serverClient.resources.find((r) => r.uri === uri);
    if (!resource) {
      return null;
    }

    return {
      ...resource,
      serverId: serverClient.config.id,
      serverName: serverClient.config.name,
    };
  }

  /**
   * Read a resource from a specific server
   */
  public async readResource(
    serverId: string,
    params: ReadResourceParams,
    context?: Partial<McpResourceContext>
  ): Promise<ReadResourceResult> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (!serverClient.client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    this.log("debug", `Reading resource ${params.uri} from server ${serverId}`, {
      params,
      context,
    });

    try {
      const result = await serverClient.client.readResource(params);
      this.log("debug", `Resource ${params.uri} read successfully`, { result });
      return result;
    } catch (error) {
      this.log("error", `Failed to read resource ${params.uri} from server ${serverId}`, error);
      throw error;
    }
  }

  // ==============================================================================
  // Public API - Prompts Management
  // ==============================================================================

  /**
   * Get all available prompts from all connected servers
   */
  public async getPrompts(): Promise<AggregatedPrompt[]> {
    const prompts: AggregatedPrompt[] = [];

    for (const serverClient of this.servers.values()) {
      if (serverClient.client.isConnected()) {
        for (const prompt of serverClient.prompts) {
          prompts.push({
            ...prompt,
            serverId: serverClient.config.id,
            serverName: serverClient.config.name,
          });
        }
      }
    }

    return prompts;
  }

  /**
   * Get a specific prompt by name and server
   */
  public async getPrompt(serverId: string, promptName: string): Promise<AggregatedPrompt | null> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient || !serverClient.client.isConnected()) {
      return null;
    }

    const prompt = serverClient.prompts.find((p) => p.name === promptName);
    if (!prompt) {
      return null;
    }

    return {
      ...prompt,
      serverId: serverClient.config.id,
      serverName: serverClient.config.name,
    };
  }

  /**
   * Execute a prompt on a specific server
   */
  public async executePrompt(serverId: string, params: GetPromptParams): Promise<GetPromptResult> {
    const serverClient = this.servers.get(serverId);
    if (!serverClient) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (!serverClient.client.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    this.log("debug", `Executing prompt ${params.name} on server ${serverId}`, { params });

    try {
      const result = await serverClient.client.getPrompt(params);
      this.log("debug", `Prompt ${params.name} executed successfully`, { result });
      return result;
    } catch (error) {
      this.log("error", `Failed to execute prompt ${params.name} on server ${serverId}`, error);
      throw error;
    }
  }

  // ==============================================================================
  // Private Methods - Event Handling
  // ==============================================================================

  /**
   * Set up event handlers for a server client
   */
  private setupServerEventHandlers(serverClient: ServerClient): void {
    const { client, config } = serverClient;

    client.on("stateChange", (state: McpClientState) => {
      this.log("debug", `Server ${config.name} state changed to ${state}`);
      this.emit("serverStateChange", config.id, state);
    });

    client.on("connected", (serverInfo: InitializeResult) => {
      this.log("info", `Server ${config.name} connected successfully`, serverInfo);
      serverClient.connectedAt = new Date();
      serverClient.lastError = null;
      this.emit("serverConnected", config.id, serverInfo);

      // Refresh tools, resources, and prompts
      this.refreshServerData(serverClient).catch((error) => {
        this.log("error", `Failed to refresh data for server ${config.name}`, error);
      });
    });

    client.on("disconnected", () => {
      this.log("info", `Server ${config.name} disconnected`);
      serverClient.connectedAt = null;
      this.emit("serverDisconnected", config.id);

      // Clear cached data
      serverClient.tools = [];
      serverClient.resources = [];
      serverClient.prompts = [];

      // Refresh aggregated data
      this.refreshAggregatedData().catch((error) => {
        this.log("error", "Failed to refresh aggregated data after disconnection", error);
      });
    });

    client.on("error", (error: Error) => {
      this.log("error", `Server ${config.name} error`, error);
      serverClient.lastError = error;
      this.emit("serverError", config.id, error);
    });

    client.on("notification", (method: string, params?: Record<string, unknown>) => {
      this.handleServerNotification(serverClient, method, params);
    });

    if (this.options.debug) {
      client.on("debug", (message: string, data?: unknown) => {
        this.emit("debug", `[${config.name}] ${message}`, data);
      });
    }
  }

  /**
   * Handle notifications from a server
   */
  private handleServerNotification(
    serverClient: ServerClient,
    method: string,
    params?: Record<string, unknown>
  ): void {
    this.log("debug", `Received notification from ${serverClient.config.name}: ${method}`, params);

    switch (method) {
      case "notifications/tools/list_changed":
        this.refreshServerTools(serverClient).catch((error) => {
          this.log("error", `Failed to refresh tools for ${serverClient.config.name}`, error);
        });
        break;

      case "notifications/resources/list_changed":
        this.refreshServerResources(serverClient).catch((error) => {
          this.log("error", `Failed to refresh resources for ${serverClient.config.name}`, error);
        });
        break;

      case "notifications/prompts/list_changed":
        this.refreshServerPrompts(serverClient).catch((error) => {
          this.log("error", `Failed to refresh prompts for ${serverClient.config.name}`, error);
        });
        break;

      case "notifications/resources/updated":
        // Resource content updated, we might want to invalidate caches
        this.log("debug", `Resource updated on ${serverClient.config.name}`, params);
        break;

      default:
        this.log(
          "debug",
          `Unhandled notification from ${serverClient.config.name}: ${method}`,
          params
        );
    }
  }

  // ==============================================================================
  // Private Methods - Data Management
  // ==============================================================================

  /**
   * Refresh all data for a server
   */
  private async refreshServerData(serverClient: ServerClient): Promise<void> {
    await Promise.all([
      this.refreshServerTools(serverClient),
      this.refreshServerResources(serverClient),
      this.refreshServerPrompts(serverClient),
    ]);
  }

  /**
   * Refresh tools for a server
   */
  private async refreshServerTools(serverClient: ServerClient): Promise<void> {
    if (!serverClient.client.isConnected()) {
      return;
    }

    try {
      const result: ListToolsResult = await serverClient.client.listTools();
      serverClient.tools = result.tools;
      serverClient.lastToolsUpdate = new Date();

      this.log("debug", `Refreshed ${result.tools.length} tools for ${serverClient.config.name}`);

      // Emit aggregated tools update
      const aggregatedTools = await this.getTools();
      this.emit("toolsUpdated", aggregatedTools);
    } catch (error) {
      // Check if this is a "Method not found" error (server doesn't support tools)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Method not found") && errorMessage.includes("tools/list")) {
        this.log("debug", `Server ${serverClient.config.name} does not support tools`);
        // Set empty tools array and mark as updated
        serverClient.tools = [];
        serverClient.lastToolsUpdate = new Date();

        // Still emit aggregated tools update
        const aggregatedTools = await this.getTools();
        this.emit("toolsUpdated", aggregatedTools);
      } else {
        this.log("error", `Failed to refresh tools for ${serverClient.config.name}`, error);
      }
    }
  }

  /**
   * Refresh resources for a server
   */
  private async refreshServerResources(serverClient: ServerClient): Promise<void> {
    if (!serverClient.client.isConnected()) {
      return;
    }

    try {
      const result: ListResourcesResult = await serverClient.client.listResources();
      serverClient.resources = result.resources;
      serverClient.lastResourcesUpdate = new Date();

      this.log(
        "debug",
        `Refreshed ${result.resources.length} resources for ${serverClient.config.name}`
      );

      // Emit aggregated resources update
      const aggregatedResources = await this.getResources();
      this.emit("resourcesUpdated", aggregatedResources);
    } catch (error) {
      // Check if this is a "Method not found" error (server doesn't support resources)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Method not found") && errorMessage.includes("resources/list")) {
        this.log("debug", `Server ${serverClient.config.name} does not support resources`);
        // Set empty resources array and mark as updated
        serverClient.resources = [];
        serverClient.lastResourcesUpdate = new Date();

        // Still emit aggregated resources update
        const aggregatedResources = await this.getResources();
        this.emit("resourcesUpdated", aggregatedResources);
      } else {
        this.log("error", `Failed to refresh resources for ${serverClient.config.name}`, error);
      }
    }
  }

  /**
   * Refresh prompts for a server
   */
  private async refreshServerPrompts(serverClient: ServerClient): Promise<void> {
    if (!serverClient.client.isConnected()) {
      return;
    }

    try {
      const result: ListPromptsResult = await serverClient.client.listPrompts();
      serverClient.prompts = result.prompts;
      serverClient.lastPromptsUpdate = new Date();

      this.log(
        "debug",
        `Refreshed ${result.prompts.length} prompts for ${serverClient.config.name}`
      );

      // Emit aggregated prompts update
      const aggregatedPrompts = await this.getPrompts();
      this.emit("promptsUpdated", aggregatedPrompts);
    } catch (error) {
      // Check if this is a "Method not found" error (server doesn't support prompts)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Method not found") && errorMessage.includes("prompts/list")) {
        this.log("debug", `Server ${serverClient.config.name} does not support prompts`);
        // Set empty prompts array and mark as updated
        serverClient.prompts = [];
        serverClient.lastPromptsUpdate = new Date();

        // Still emit aggregated prompts update
        const aggregatedPrompts = await this.getPrompts();
        this.emit("promptsUpdated", aggregatedPrompts);
      } else {
        this.log("error", `Failed to refresh prompts for ${serverClient.config.name}`, error);
      }
    }
  }

  /**
   * Refresh all aggregated data
   */
  private async refreshAggregatedData(): Promise<void> {
    const [tools, resources, prompts] = await Promise.all([
      this.getTools(),
      this.getResources(),
      this.getPrompts(),
    ]);

    this.emit("toolsUpdated", tools);
    this.emit("resourcesUpdated", resources);
    this.emit("promptsUpdated", prompts);
  }

  /**
   * Start cache refresh timer
   */
  private startCacheRefresh(): void {
    if (this.cacheTimer) {
      clearInterval(this.cacheTimer);
    }

    this.cacheTimer = setInterval(async () => {
      this.log("debug", "Performing scheduled cache refresh");

      for (const serverClient of this.servers.values()) {
        if (serverClient.client.isConnected()) {
          await this.refreshServerData(serverClient).catch((error) => {
            this.log("error", `Cache refresh failed for ${serverClient.config.name}`, error);
          });
        }
      }
    }, this.options.cacheRefreshInterval);
  }

  /**
   * Internal logging
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (this.options.debug) {
      this.emit("debug", `[MCPManager] ${message}`, data);
    }

    // Only log at or above configured level
    const levelPriority = Object.values(LOG_LEVELS).indexOf(level);
    const configuredPriority = Object.values(LOG_LEVELS).indexOf(this.options.logLevel);

    if (levelPriority >= configuredPriority) {
      const logData = data ? ` ${safeStringify(data)}` : "";
      console.log(`[MCPManager] ${message}${logData}`);
    }
  }

  // ==============================================================================
  // EventEmitter overrides for type safety
  // ==============================================================================

  public on<K extends keyof McpManagerEvents>(event: K, listener: McpManagerEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof McpManagerEvents>(
    event: K,
    ...args: Parameters<McpManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  public off<K extends keyof McpManagerEvents>(event: K, listener: McpManagerEvents[K]): this {
    return super.off(event, listener);
  }

  public once<K extends keyof McpManagerEvents>(event: K, listener: McpManagerEvents[K]): this {
    return super.once(event, listener);
  }
}
