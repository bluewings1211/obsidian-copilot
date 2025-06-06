/**
 * MCP Tool Adapter
 *
 * 這個模組負責將 MCP 工具適配到現有的工具系統中，
 * 使 MCP 工具能夠與現有的 Obsidian Copilot 工具無縫整合。
 */

import type { McpManager, AggregatedTool } from "./manager";
import type { CallToolResult } from "./types";
import { safeStringify } from "./utils";

/**
 * MCP 工具包裝器，實現與現有工具系統相容的接口
 */
export interface McpToolWrapper {
  /** 工具名稱，包含伺服器前綴以避免衝突 */
  readonly name: string;
  /** 工具描述 */
  readonly description: string;
  /** 原始 MCP 工具名稱 */
  readonly mcpToolName: string;
  /** 伺服器 ID */
  readonly serverId: string;
  /** 伺服器名稱 */
  readonly serverName: string;
  /** 工具參數 schema */
  readonly inputSchema: any;
  /** 調用工具的方法 */
  call(args: any): Promise<any>;
}

/**
 * MCP 工具適配器選項
 */
export interface McpToolAdapterOptions {
  /** 是否啟用調試日誌 */
  debug?: boolean;
  /** 工具調用超時時間（毫秒） */
  timeout?: number;
  /** 工具名稱前綴格式，預設為 "mcp_{serverName}_{toolName}" */
  nameFormat?: (serverName: string, toolName: string) => string;
}

/**
 * MCP 工具適配器
 *
 * 負責：
 * 1. 將 MCP 工具包裝成與現有工具系統相容的格式
 * 2. 處理工具名稱衝突（通過前綴）
 * 3. 提供統一的錯誤處理
 * 4. 管理工具調用的超時和重試
 */
export class McpToolAdapter {
  private mcpManager: McpManager;
  private options: Required<McpToolAdapterOptions>;
  private toolCache = new Map<string, McpToolWrapper>();
  private lastRefresh = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(mcpManager: McpManager, options: McpToolAdapterOptions = {}) {
    this.mcpManager = mcpManager;
    this.options = {
      debug: options.debug ?? false,
      timeout: options.timeout ?? 30000,
      nameFormat: options.nameFormat ?? this.defaultNameFormat,
    };

    // 監聽 MCP Manager 的工具更新事件
    this.mcpManager.on("toolsUpdated", (tools: AggregatedTool[]) => {
      this.refreshToolCache(tools);
    });

    // 監聽伺服器連接事件
    this.mcpManager.on("serverConnected", () => {
      this.invalidateCache();
    });

    // 監聽伺服器斷線事件
    this.mcpManager.on("serverDisconnected", () => {
      this.invalidateCache();
    });
  }

  // ==============================================================================
  // Public API
  // ==============================================================================

  /**
   * 獲取所有可用的 MCP 工具包裝器
   */
  public async getTools(): Promise<McpToolWrapper[]> {
    await this.ensureCacheIsValid();
    return Array.from(this.toolCache.values());
  }

  /**
   * 根據名稱獲取特定的 MCP 工具包裝器
   */
  public async getTool(name: string): Promise<McpToolWrapper | null> {
    await this.ensureCacheIsValid();
    return this.toolCache.get(name) || null;
  }

  /**
   * 獲取工具名稱的描述（用於現有的 getToolDescription 函數）
   */
  public async getToolDescription(toolName: string): Promise<string> {
    const tool = await this.getTool(toolName);
    return tool?.description || "";
  }

  /**
   * 檢查是否為 MCP 工具
   */
  public isMcpTool(toolName: string): boolean {
    return toolName.startsWith("mcp_");
  }

  /**
   * 調用 MCP 工具（用於 ToolManager.callTool）
   */
  public async callTool(toolName: string, args: any): Promise<any> {
    const tool = await this.getTool(toolName);
    if (!tool) {
      throw new Error(`MCP tool '${toolName}' not found`);
    }

    this.log(`Calling MCP tool: ${toolName}`, { args });

    try {
      const result = await tool.call(args);
      this.log(`MCP tool '${toolName}' completed successfully`, { result });
      return result;
    } catch (error) {
      this.log(`MCP tool '${toolName}' failed`, { error });
      throw error;
    }
  }

  /**
   * 刷新工具快取
   */
  public async refreshTools(): Promise<void> {
    this.invalidateCache();
    await this.ensureCacheIsValid();
  }

  // ==============================================================================
  // Private Methods
  // ==============================================================================

  /**
   * 預設的工具名稱格式化函數
   */
  private defaultNameFormat(serverName: string, toolName: string): string {
    // 清理伺服器名稱，移除特殊字符
    const cleanServerName = serverName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    return `mcp_${cleanServerName}_${toolName}`;
  }

  /**
   * 確保快取是有效的
   */
  private async ensureCacheIsValid(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh > this.CACHE_TTL || this.toolCache.size === 0) {
      await this.rebuildCache();
    }
  }

  /**
   * 重建工具快取
   */
  private async rebuildCache(): Promise<void> {
    try {
      const mcpTools = await this.mcpManager.getTools();
      this.refreshToolCache(mcpTools);
    } catch (error) {
      console.error("Failed to rebuild MCP tool cache:", error);
    }
  }

  /**
   * 刷新工具快取
   */
  private refreshToolCache(tools: AggregatedTool[]): void {
    this.log(`Refreshing MCP tool cache with ${tools.length} tools`);

    this.toolCache.clear();

    for (const tool of tools) {
      const wrapper = this.createToolWrapper(tool);
      this.toolCache.set(wrapper.name, wrapper);
    }

    this.lastRefresh = Date.now();
    this.log(`MCP tool cache refreshed, ${this.toolCache.size} tools available`);
  }

  /**
   * 創建工具包裝器
   */
  private createToolWrapper(tool: AggregatedTool): McpToolWrapper {
    const wrappedName = this.options.nameFormat(tool.serverName, tool.name);

    return {
      name: wrappedName,
      description: tool.description || `MCP tool from ${tool.serverName}`,
      mcpToolName: tool.name,
      serverId: tool.serverId,
      serverName: tool.serverName,
      inputSchema: tool.inputSchema,
      call: async (args: any) => {
        return this.callMcpTool(tool.serverId, tool.name, args);
      },
    };
  }

  /**
   * 調用 MCP 工具
   */
  private async callMcpTool(serverId: string, toolName: string, args: any): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`MCP tool '${toolName}' timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });

    // 確保參數格式正確
    const sanitizedArgs = this.sanitizeArguments(args);

    this.log(`Calling MCP tool ${toolName} with sanitized arguments`, sanitizedArgs);

    const callPromise = this.mcpManager.callTool(serverId, {
      name: toolName,
      arguments: sanitizedArgs,
    });

    try {
      const result = (await Promise.race([callPromise, timeoutPromise])) as CallToolResult;
      return this.formatToolResult(result);
    } catch (error) {
      // 提供更詳細的錯誤資訊
      this.log(`MCP tool ${toolName} failed with error:`, error);
      if (error instanceof Error) {
        // 檢查是否為參數驗證錯誤
        if (error.message.includes("Invalid arguments")) {
          throw new Error(
            `Invalid arguments for ${toolName}: ${error.message}. Arguments provided: ${JSON.stringify(sanitizedArgs)}`
          );
        }
        throw new Error(`MCP tool error: ${error.message}`);
      }
      throw new Error(`MCP tool error: ${String(error)}`);
    }
  }

  /**
   * 格式化工具結果
   */
  private formatToolResult(result: CallToolResult): any {
    if (!result.content || result.content.length === 0) {
      return null;
    }

    // 如果只有一個內容項，直接返回其值
    if (result.content.length === 1) {
      const content = result.content[0];
      if (content.type === "text") {
        return content.text;
      } else if (content.type === "resource") {
        return {
          type: "resource",
          resource: content.resource,
        };
      } else if (content.type === "image") {
        return {
          type: "image",
          data: content.data,
          mimeType: content.mimeType,
        };
      }
    }

    // 多個內容項，返回結構化結果
    return {
      isError: result.isError || false,
      content: result.content.map((item) => {
        if (item.type === "text") {
          return {
            type: "text",
            text: item.text,
          };
        } else if (item.type === "resource") {
          return {
            type: "resource",
            resource: item.resource,
          };
        } else if (item.type === "image") {
          return {
            type: "image",
            data: item.data,
            mimeType: item.mimeType,
          };
        }
        return item;
      }),
    };
  }

  /**
   * 清理和驗證參數
   */
  private sanitizeArguments(args: any): any {
    if (!args || typeof args !== "object") {
      return {};
    }

    // 創建一個乾淨的參數物件
    const sanitized: any = {};

    for (const [key, value] of Object.entries(args)) {
      // 跳過 undefined 和 function 值
      if (value === undefined || typeof value === "function") {
        continue;
      }

      // 處理 null 值
      if (value === null) {
        sanitized[key] = null;
        continue;
      }

      // 處理基本類型
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        sanitized[key] = value;
        continue;
      }

      // 處理陣列
      if (Array.isArray(value)) {
        sanitized[key] = value.map((item) => {
          if (typeof item === "object" && item !== null) {
            return this.sanitizeArguments(item);
          }
          return item;
        });
        continue;
      }

      // 處理嵌套物件
      if (typeof value === "object") {
        sanitized[key] = this.sanitizeArguments(value);
        continue;
      }
    }

    return sanitized;
  }

  /**
   * 使快取無效
   */
  private invalidateCache(): void {
    this.lastRefresh = 0;
    this.log("MCP tool cache invalidated");
  }

  /**
   * 記錄日誌
   */
  private log(message: string, data?: any): void {
    if (this.options.debug) {
      const logData = data ? ` ${safeStringify(data)}` : "";
      console.log(`[McpToolAdapter] ${message}${logData}`);
    }
  }
}

/**
 * MCP 工具適配器管理器
 *
 * 提供靜態方法來整合到現有的工具系統
 */
export class McpToolAdapterManager {
  private static instance: McpToolAdapter | null = null;

  /**
   * 初始化 MCP 工具適配器
   */
  public static initialize(mcpManager: McpManager, options?: McpToolAdapterOptions): void {
    if (this.instance) {
      throw new Error("MCP Tool Adapter already initialized");
    }
    this.instance = new McpToolAdapter(mcpManager, options);
  }

  /**
   * 獲取 MCP 工具適配器實例
   */
  public static getInstance(): McpToolAdapter {
    if (!this.instance) {
      throw new Error("MCP Tool Adapter not initialized. Call initialize() first.");
    }
    return this.instance;
  }

  /**
   * 銷毀 MCP 工具適配器
   */
  public static destroy(): void {
    this.instance = null;
  }

  /**
   * 檢查是否已初始化
   */
  public static isInitialized(): boolean {
    return this.instance !== null;
  }
}
