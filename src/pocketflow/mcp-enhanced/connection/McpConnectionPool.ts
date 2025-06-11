/**
 * MCP 連接池管理器
 *
 * 提供企業級的 MCP 連接管理功能：
 * - 連接池和復用
 * - 負載均衡
 * - 自動重連
 * - 健康檢查
 */

import { EventEmitter } from "events";
import { McpClient } from "@/mcp/client";
import type { McpServerConfig, CallToolParams, CallToolResult } from "@/mcp/types";
import { logError, logDebug } from "@/pocketflow/utils/logger";

/**
 * 連接池統計信息
 */
export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  failedConnections: number;
  totalRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  poolUtilization: number; // 0-100%
}

/**
 * 連接實例包裝器
 */
interface PooledConnection {
  readonly id: string;
  readonly client: McpClient;
  readonly config: McpServerConfig;
  lastUsed: Date;
  isActive: boolean;
  requestCount: number;
  failureCount: number;
  totalResponseTime: number;
  createdAt: Date;
  lastHealthCheck: Date;
  healthStatus: "healthy" | "degraded" | "unhealthy";
}

/**
 * 連接池配置選項
 */
export interface ConnectionPoolOptions {
  /** 每個服務器的最大連接數 */
  maxConnectionsPerServer?: number;
  /** 總最大連接數 */
  maxTotalConnections?: number;
  /** 連接空閒超時時間（毫秒） */
  idleTimeout?: number;
  /** 健康檢查間隔（毫秒） */
  healthCheckInterval?: number;
  /** 連接重試次數 */
  maxRetries?: number;
  /** 重試延遲（毫秒） */
  retryDelay?: number;
  /** 啟用負載均衡 */
  enableLoadBalancing?: boolean;
  /** 負載均衡策略 */
  loadBalancingStrategy?: "round-robin" | "least-connections" | "response-time";
  /** 啟用調試日誌 */
  debug?: boolean;
}

/**
 * 連接池事件
 */
export interface ConnectionPoolEvents {
  connectionCreated: (connectionId: string, serverId: string) => void;
  connectionDestroyed: (connectionId: string, serverId: string) => void;
  connectionFailed: (connectionId: string, serverId: string, error: Error) => void;
  connectionRecovered: (connectionId: string, serverId: string) => void;
  poolStatsUpdated: (stats: ConnectionPoolStats) => void;
  loadBalancingUpdate: (serverId: string, weight: number) => void;
}

/**
 * MCP 連接池管理器
 */
export class McpConnectionPool extends EventEmitter {
  private options: Required<ConnectionPoolOptions>;
  private connections = new Map<string, PooledConnection[]>(); // serverId -> connections
  private roundRobinIndex = new Map<string, number>(); // serverId -> index
  private isStarted = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats: ConnectionPoolStats;

  constructor(options: ConnectionPoolOptions = {}) {
    super();

    this.options = {
      maxConnectionsPerServer: options.maxConnectionsPerServer || 3,
      maxTotalConnections: options.maxTotalConnections || 20,
      idleTimeout: options.idleTimeout || 300000, // 5 minutes
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      enableLoadBalancing: options.enableLoadBalancing ?? true,
      loadBalancingStrategy: options.loadBalancingStrategy || "least-connections",
      debug: options.debug ?? false,
    };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      failedConnections: 0,
      totalRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      poolUtilization: 0,
    };
  }

  /**
   * 啟動連接池
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.log("啟動 MCP 連接池", { options: this.options });
    this.isStarted = true;

    // 啟動健康檢查
    this.startHealthCheck();

    // 啟動清理定時器
    this.startCleanup();
  }

  /**
   * 停止連接池
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.log("停止 MCP 連接池");
    this.isStarted = false;

    // 停止定時器
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 關閉所有連接
    const closePromises: Promise<void>[] = [];
    for (const connections of this.connections.values()) {
      for (const conn of connections) {
        closePromises.push(this.destroyConnection(conn));
      }
    }

    await Promise.allSettled(closePromises);
    this.connections.clear();
    this.roundRobinIndex.clear();
  }

  /**
   * 獲取或創建連接
   */
  public async getConnection(config: McpServerConfig): Promise<PooledConnection> {
    if (!this.isStarted) {
      throw new Error("連接池未啟動");
    }

    const serverId = config.id;
    const connections = this.connections.get(serverId) || [];

    // 使用負載均衡選擇連接
    if (this.options.enableLoadBalancing && connections.length > 0) {
      const conn = this.selectConnectionByStrategy(connections);
      if (conn && conn.healthStatus !== "unhealthy") {
        conn.lastUsed = new Date();
        conn.isActive = true;
        return conn;
      }
    }

    // 檢查是否可以創建新連接
    if (connections.length >= this.options.maxConnectionsPerServer) {
      // 嘗試復用最少使用的連接
      const leastUsedConn = connections
        .filter((c) => c.healthStatus !== "unhealthy")
        .sort((a, b) => a.requestCount - b.requestCount)[0];

      if (leastUsedConn) {
        leastUsedConn.lastUsed = new Date();
        leastUsedConn.isActive = true;
        return leastUsedConn;
      }

      throw new Error(`達到服務器 ${serverId} 的最大連接數限制`);
    }

    if (this.stats.totalConnections >= this.options.maxTotalConnections) {
      throw new Error("達到連接池最大連接數限制");
    }

    // 創建新連接
    const conn = await this.createConnection(config);
    connections.push(conn);
    this.connections.set(serverId, connections);

    return conn;
  }

  /**
   * 執行工具調用（帶連接池管理）
   */
  public async callTool(config: McpServerConfig, params: CallToolParams): Promise<CallToolResult> {
    const startTime = Date.now();
    let connection: PooledConnection | null = null;

    try {
      connection = await this.getConnection(config);
      connection.requestCount++;
      this.stats.totalRequests++;

      const result = await connection.client.callTool(params);

      const responseTime = Date.now() - startTime;
      connection.totalResponseTime += responseTime;
      this.updateAverageResponseTime(responseTime);

      return result;
    } catch (error) {
      this.stats.failedRequests++;
      if (connection) {
        connection.failureCount++;
        this.updateConnectionHealth(connection);
      }

      this.logError("工具調用失敗", error, {
        serverId: config.id,
        toolName: params.name,
      });
      throw error;
    } finally {
      if (connection) {
        connection.isActive = false;
        connection.lastUsed = new Date();
      }
      this.updateStats();
    }
  }

  /**
   * 獲取連接池統計
   */
  public getStats(): ConnectionPoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * 獲取服務器連接狀態
   */
  public getServerConnections(serverId: string): PooledConnection[] {
    return [...(this.connections.get(serverId) || [])];
  }

  /**
   * 強制清理空閒連接
   */
  public async cleanup(): Promise<void> {
    const now = new Date();
    const connectionsToClose: PooledConnection[] = [];

    for (const [serverId, connections] of this.connections.entries()) {
      const validConnections: PooledConnection[] = [];

      for (const conn of connections) {
        const idleTime = now.getTime() - conn.lastUsed.getTime();

        if (idleTime > this.options.idleTimeout && !conn.isActive) {
          connectionsToClose.push(conn);
        } else {
          validConnections.push(conn);
        }
      }

      this.connections.set(serverId, validConnections);
    }

    // 關閉空閒連接
    for (const conn of connectionsToClose) {
      await this.destroyConnection(conn);
    }

    if (connectionsToClose.length > 0) {
      this.log(`清理了 ${connectionsToClose.length} 個空閒連接`);
    }
  }

  /**
   * 創建新連接
   */
  private async createConnection(config: McpServerConfig): Promise<PooledConnection> {
    const connectionId = `${config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.log(`創建連接 ${connectionId} 到服務器 ${config.name}`);

    const client = new McpClient(config, {
      requestTimeout: config.timeout || 30000,
      retryAttempts: this.options.maxRetries,
      retryDelay: this.options.retryDelay,
      debug: this.options.debug,
    });

    await client.connect();

    const connection: PooledConnection = {
      id: connectionId,
      client,
      config,
      lastUsed: new Date(),
      isActive: false,
      requestCount: 0,
      failureCount: 0,
      totalResponseTime: 0,
      createdAt: new Date(),
      lastHealthCheck: new Date(),
      healthStatus: "healthy",
    };

    this.setupConnectionEventHandlers(connection);
    this.stats.totalConnections++;

    this.emit("connectionCreated", connectionId, config.id);
    return connection;
  }

  /**
   * 銷毀連接
   */
  private async destroyConnection(connection: PooledConnection): Promise<void> {
    try {
      await connection.client.disconnect();
      this.stats.totalConnections--;
      this.emit("connectionDestroyed", connection.id, connection.config.id);
    } catch (error) {
      this.logError(`銷毀連接失敗 ${connection.id}`, error);
    }
  }

  /**
   * 設置連接事件處理器
   */
  private setupConnectionEventHandlers(connection: PooledConnection): void {
    connection.client.on("error", (error: Error) => {
      connection.failureCount++;
      this.updateConnectionHealth(connection);
      this.emit("connectionFailed", connection.id, connection.config.id, error);
    });

    connection.client.on("disconnected", () => {
      connection.healthStatus = "unhealthy";
    });

    connection.client.on("connected", () => {
      if (connection.healthStatus === "unhealthy") {
        connection.healthStatus = "healthy";
        connection.failureCount = 0;
        this.emit("connectionRecovered", connection.id, connection.config.id);
      }
    });
  }

  /**
   * 根據策略選擇連接
   */
  private selectConnectionByStrategy(connections: PooledConnection[]): PooledConnection | null {
    const healthyConnections = connections.filter((c) => c.healthStatus !== "unhealthy");

    if (healthyConnections.length === 0) {
      return null;
    }

    switch (this.options.loadBalancingStrategy) {
      case "round-robin":
        return this.selectRoundRobin(healthyConnections);

      case "least-connections":
        return this.selectLeastConnections(healthyConnections);

      case "response-time":
        return this.selectByResponseTime(healthyConnections);

      default:
        return healthyConnections[0];
    }
  }

  /**
   * 輪詢選擇
   */
  private selectRoundRobin(connections: PooledConnection[]): PooledConnection {
    const serverId = connections[0].config.id;
    const currentIndex = this.roundRobinIndex.get(serverId) || 0;
    const nextIndex = (currentIndex + 1) % connections.length;
    this.roundRobinIndex.set(serverId, nextIndex);
    return connections[currentIndex];
  }

  /**
   * 最少連接選擇
   */
  private selectLeastConnections(connections: PooledConnection[]): PooledConnection {
    return connections.reduce((min, conn) => (conn.requestCount < min.requestCount ? conn : min));
  }

  /**
   * 響應時間選擇
   */
  private selectByResponseTime(connections: PooledConnection[]): PooledConnection {
    return connections.reduce((fastest, conn) => {
      const avgResponseTime =
        conn.requestCount > 0 ? conn.totalResponseTime / conn.requestCount : 0;
      const fastestAvgTime =
        fastest.requestCount > 0 ? fastest.totalResponseTime / fastest.requestCount : 0;

      return avgResponseTime < fastestAvgTime ? conn : fastest;
    });
  }

  /**
   * 更新連接健康狀態
   */
  private updateConnectionHealth(connection: PooledConnection): void {
    const failureRate =
      connection.requestCount > 0 ? connection.failureCount / connection.requestCount : 0;

    if (failureRate >= 0.5) {
      connection.healthStatus = "unhealthy";
    } else if (failureRate >= 0.2) {
      connection.healthStatus = "degraded";
    } else {
      connection.healthStatus = "healthy";
    }
  }

  /**
   * 更新平均響應時間
   */
  private updateAverageResponseTime(responseTime: number): void {
    if (this.stats.totalRequests === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) /
        this.stats.totalRequests;
    }
  }

  /**
   * 更新統計信息
   */
  private updateStats(): void {
    let activeConnections = 0;
    let idleConnections = 0;
    let failedConnections = 0;

    for (const connections of this.connections.values()) {
      for (const conn of connections) {
        if (conn.isActive) {
          activeConnections++;
        } else if (conn.healthStatus === "unhealthy") {
          failedConnections++;
        } else {
          idleConnections++;
        }
      }
    }

    this.stats.activeConnections = activeConnections;
    this.stats.idleConnections = idleConnections;
    this.stats.failedConnections = failedConnections;
    this.stats.poolUtilization =
      this.stats.totalConnections > 0 ? (activeConnections / this.stats.totalConnections) * 100 : 0;

    this.emit("poolStatsUpdated", this.stats);
  }

  /**
   * 啟動健康檢查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  /**
   * 啟動清理定時器
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanup();
    }, this.options.idleTimeout / 2);
  }

  /**
   * 執行健康檢查
   */
  private async performHealthCheck(): Promise<void> {
    for (const connections of this.connections.values()) {
      for (const conn of connections) {
        try {
          if (conn.client.isConnected()) {
            // 執行簡單的 ping 檢查
            await conn.client.ping();
            conn.lastHealthCheck = new Date();

            if (conn.healthStatus === "unhealthy") {
              conn.healthStatus = "healthy";
              this.emit("connectionRecovered", conn.id, conn.config.id);
            }
          } else {
            conn.healthStatus = "unhealthy";
          }
        } catch (error) {
          conn.healthStatus = "unhealthy";
          this.emit("connectionFailed", conn.id, conn.config.id, error as Error);
        }
      }
    }
  }

  /**
   * 日誌記錄
   */
  private log(message: string, data?: any): void {
    if (this.options.debug) {
      logDebug(`[McpConnectionPool] ${message}`, data);
    }
  }

  /**
   * 錯誤日誌記錄
   */
  private logError(message: string, error: any, data?: any): void {
    logError(`[McpConnectionPool] ${message}`, error, data);
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof ConnectionPoolEvents>(
    event: K,
    listener: ConnectionPoolEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof ConnectionPoolEvents>(
    event: K,
    ...args: Parameters<ConnectionPoolEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
