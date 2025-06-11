/**
 * MCP 負載均衡器
 *
 * 提供智能負載均衡和故障轉移功能：
 * - 多種負載均衡算法
 * - 基於權重的分配
 * - 故障自動轉移
 * - 動態權重調整
 */

import { EventEmitter } from "events";
import type { McpServerConfig, CallToolParams, CallToolResult } from "@/mcp/types";
import { McpConnectionPool } from "./McpConnectionPool";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 服務器權重信息
 */
export interface ServerWeight {
  serverId: string;
  serverName: string;
  weight: number;
  currentLoad: number;
  averageResponseTime: number;
  errorRate: number;
  isHealthy: boolean;
  lastUsed: Date;
}

/**
 * 負載均衡策略
 */
export type LoadBalancingStrategy =
  | "round-robin"
  | "weighted-round-robin"
  | "least-connections"
  | "weighted-least-connections"
  | "response-time"
  | "weighted-response-time"
  | "random"
  | "weighted-random"
  | "ip-hash"
  | "consistent-hash";

/**
 * 負載均衡配置
 */
export interface LoadBalancerConfig {
  /** 負載均衡策略 */
  strategy?: LoadBalancingStrategy;
  /** 啟用故障轉移 */
  enableFailover?: boolean;
  /** 最大重試次數 */
  maxRetries?: number;
  /** 重試延遲（毫秒） */
  retryDelay?: number;
  /** 權重更新間隔（毫秒） */
  weightUpdateInterval?: number;
  /** 啟用動態權重調整 */
  enableDynamicWeighting?: boolean;
  /** 健康檢查閾值 */
  healthThreshold?: number;
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 負載均衡統計
 */
export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerServer: Record<string, number>;
  errorRatePerServer: Record<string, number>;
  averageResponseTimePerServer: Record<string, number>;
  currentStrategy: LoadBalancingStrategy;
  activeServers: number;
  healthyServers: number;
}

/**
 * 負載均衡事件
 */
export interface LoadBalancerEvents {
  requestRouted: (serverId: string, toolName: string) => void;
  failoverTriggered: (fromServerId: string, toServerId: string, toolName: string) => void;
  serverWeightUpdated: (serverId: string, newWeight: number, reason: string) => void;
  strategyChanged: (newStrategy: LoadBalancingStrategy, reason: string) => void;
  statsUpdated: (stats: LoadBalancerStats) => void;
  allServersFailed: (toolName: string) => void;
}

/**
 * 服務器選擇結果
 */
interface ServerSelection {
  config: McpServerConfig;
  weight: ServerWeight;
}

/**
 * MCP 負載均衡器
 */
export class McpLoadBalancer extends EventEmitter {
  private config: Required<LoadBalancerConfig>;
  private connectionPool: McpConnectionPool;
  private servers = new Map<string, McpServerConfig>();
  private serverWeights = new Map<string, ServerWeight>();
  private roundRobinIndex = 0;
  private weightUpdateTimer: NodeJS.Timeout | null = null;
  private stats: LoadBalancerStats;
  private logger = createLogger("McpLoadBalancer");

  constructor(connectionPool: McpConnectionPool, config: LoadBalancerConfig = {}) {
    super();

    this.connectionPool = connectionPool;
    this.config = {
      strategy: config.strategy || "weighted-least-connections",
      enableFailover: config.enableFailover ?? true,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      weightUpdateInterval: config.weightUpdateInterval || 30000, // 30 seconds
      enableDynamicWeighting: config.enableDynamicWeighting ?? true,
      healthThreshold: config.healthThreshold || 0.8, // 80%
      debug: config.debug ?? false,
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerServer: {},
      errorRatePerServer: {},
      averageResponseTimePerServer: {},
      currentStrategy: this.config.strategy,
      activeServers: 0,
      healthyServers: 0,
    };

    this.setupConnectionPoolListeners();
  }

  /**
   * 啟動負載均衡器
   */
  public start(): void {
    this.logger.info("啟動 MCP 負載均衡器", { config: this.config });

    if (this.config.enableDynamicWeighting) {
      this.startWeightUpdates();
    }
  }

  /**
   * 停止負載均衡器
   */
  public stop(): void {
    this.logger.info("停止 MCP 負載均衡器");

    if (this.weightUpdateTimer) {
      clearInterval(this.weightUpdateTimer);
      this.weightUpdateTimer = null;
    }
  }

  /**
   * 添加服務器
   */
  public addServer(config: McpServerConfig, initialWeight: number = 100): void {
    this.servers.set(config.id, config);

    const weight: ServerWeight = {
      serverId: config.id,
      serverName: config.name,
      weight: initialWeight,
      currentLoad: 0,
      averageResponseTime: 0,
      errorRate: 0,
      isHealthy: true,
      lastUsed: new Date(),
    };

    this.serverWeights.set(config.id, weight);
    this.updateStats();

    this.logger.info(`添加服務器到負載均衡器: ${config.name}`, {
      serverId: config.id,
      weight: initialWeight,
    });
  }

  /**
   * 移除服務器
   */
  public removeServer(serverId: string): void {
    const config = this.servers.get(serverId);
    if (config) {
      this.servers.delete(serverId);
      this.serverWeights.delete(serverId);
      this.updateStats();

      this.logger.info(`從負載均衡器移除服務器: ${config.name}`, { serverId });
    }
  }

  /**
   * 執行負載均衡的工具調用
   */
  public async callTool(params: CallToolParams): Promise<CallToolResult> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    let lastError: Error | null = null;
    const attemptedServers = new Set<string>();

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const selection = this.selectServer(params, attemptedServers);
        if (!selection) {
          throw new Error("沒有可用的健康服務器");
        }

        attemptedServers.add(selection.config.id);
        this.updateServerLoad(selection.config.id, 1);

        try {
          this.emit("requestRouted", selection.config.id, params.name);

          const result = await this.connectionPool.callTool(selection.config, params);

          const responseTime = Date.now() - startTime;
          this.updateServerStats(selection.config.id, responseTime, true);
          this.updateGlobalStats(responseTime, true);

          return result;
        } finally {
          this.updateServerLoad(selection.config.id, -1);
        }
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries && this.config.enableFailover) {
          this.logger.debug(`工具調用失敗，嘗試故障轉移`, {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            error: lastError.message,
          });

          if (this.config.retryDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
          }

          continue;
        }

        // 記錄失敗統計
        const responseTime = Date.now() - startTime;
        this.updateGlobalStats(responseTime, false);
        break;
      }
    }

    // 所有服務器都失敗
    this.emit("allServersFailed", params.name);
    throw lastError || new Error("所有服務器調用都失敗");
  }

  /**
   * 選擇服務器
   */
  private selectServer(
    params: CallToolParams,
    excludeServers: Set<string>
  ): ServerSelection | null {
    const availableServers = Array.from(this.servers.values())
      .filter((config) => {
        const weight = this.serverWeights.get(config.id);
        return weight && weight.isHealthy && !excludeServers.has(config.id) && config.enabled;
      })
      .map((config) => ({
        config,
        weight: this.serverWeights.get(config.id)!,
      }));

    if (availableServers.length === 0) {
      return null;
    }

    switch (this.config.strategy) {
      case "round-robin":
        return this.selectRoundRobin(availableServers);

      case "weighted-round-robin":
        return this.selectWeightedRoundRobin(availableServers);

      case "least-connections":
        return this.selectLeastConnections(availableServers);

      case "weighted-least-connections":
        return this.selectWeightedLeastConnections(availableServers);

      case "response-time":
        return this.selectByResponseTime(availableServers);

      case "weighted-response-time":
        return this.selectWeightedResponseTime(availableServers);

      case "random":
        return this.selectRandom(availableServers);

      case "weighted-random":
        return this.selectWeightedRandom(availableServers);

      case "ip-hash":
      case "consistent-hash":
        return this.selectByHash(availableServers, params);

      default:
        return availableServers[0];
    }
  }

  /**
   * 輪詢選擇
   */
  private selectRoundRobin(servers: ServerSelection[]): ServerSelection {
    const server = servers[this.roundRobinIndex % servers.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % servers.length;
    return server;
  }

  /**
   * 加權輪詢選擇
   */
  private selectWeightedRoundRobin(servers: ServerSelection[]): ServerSelection {
    const totalWeight = servers.reduce((sum, s) => sum + s.weight.weight, 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const server of servers) {
      currentWeight += server.weight.weight;
      if (random <= currentWeight) {
        return server;
      }
    }

    return servers[0];
  }

  /**
   * 最少連接選擇
   */
  private selectLeastConnections(servers: ServerSelection[]): ServerSelection {
    return servers.reduce((min, server) =>
      server.weight.currentLoad < min.weight.currentLoad ? server : min
    );
  }

  /**
   * 加權最少連接選擇
   */
  private selectWeightedLeastConnections(servers: ServerSelection[]): ServerSelection {
    return servers.reduce((best, server) => {
      const serverScore = server.weight.currentLoad / server.weight.weight;
      const bestScore = best.weight.currentLoad / best.weight.weight;
      return serverScore < bestScore ? server : best;
    });
  }

  /**
   * 響應時間選擇
   */
  private selectByResponseTime(servers: ServerSelection[]): ServerSelection {
    return servers.reduce((fastest, server) =>
      server.weight.averageResponseTime < fastest.weight.averageResponseTime ? server : fastest
    );
  }

  /**
   * 加權響應時間選擇
   */
  private selectWeightedResponseTime(servers: ServerSelection[]): ServerSelection {
    return servers.reduce((best, server) => {
      const serverScore = server.weight.averageResponseTime / server.weight.weight;
      const bestScore = best.weight.averageResponseTime / best.weight.weight;
      return serverScore < bestScore ? server : best;
    });
  }

  /**
   * 隨機選擇
   */
  private selectRandom(servers: ServerSelection[]): ServerSelection {
    const randomIndex = Math.floor(Math.random() * servers.length);
    return servers[randomIndex];
  }

  /**
   * 加權隨機選擇
   */
  private selectWeightedRandom(servers: ServerSelection[]): ServerSelection {
    const totalWeight = servers.reduce((sum, s) => sum + s.weight.weight, 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const server of servers) {
      currentWeight += server.weight.weight;
      if (random <= currentWeight) {
        return server;
      }
    }

    return servers[0];
  }

  /**
   * 哈希選擇
   */
  private selectByHash(servers: ServerSelection[], params: CallToolParams): ServerSelection {
    // 使用工具名稱和參數生成哈希
    const hashInput = `${params.name}:${JSON.stringify(params.arguments || {})}`;
    const hash = this.simpleHash(hashInput);
    const index = hash % servers.length;
    return servers[index];
  }

  /**
   * 簡單哈希函數
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為32位整數
    }
    return Math.abs(hash);
  }

  /**
   * 更新服務器負載
   */
  private updateServerLoad(serverId: string, delta: number): void {
    const weight = this.serverWeights.get(serverId);
    if (weight) {
      weight.currentLoad = Math.max(0, weight.currentLoad + delta);
      weight.lastUsed = new Date();
    }
  }

  /**
   * 更新服務器統計
   */
  private updateServerStats(serverId: string, responseTime: number, success: boolean): void {
    const weight = this.serverWeights.get(serverId);
    if (!weight) return;

    // 更新響應時間
    if (weight.averageResponseTime === 0) {
      weight.averageResponseTime = responseTime;
    } else {
      weight.averageResponseTime = weight.averageResponseTime * 0.8 + responseTime * 0.2;
    }

    // 更新錯誤率
    const currentErrorRate = weight.errorRate;
    if (success) {
      weight.errorRate = currentErrorRate * 0.9; // 降低錯誤率
    } else {
      weight.errorRate = Math.min(1.0, currentErrorRate + 0.1); // 增加錯誤率
    }

    // 更新統計
    if (!this.stats.requestsPerServer[serverId]) {
      this.stats.requestsPerServer[serverId] = 0;
    }
    this.stats.requestsPerServer[serverId]++;

    this.stats.errorRatePerServer[serverId] = weight.errorRate;
    this.stats.averageResponseTimePerServer[serverId] = weight.averageResponseTime;
  }

  /**
   * 更新全局統計
   */
  private updateGlobalStats(responseTime: number, success: boolean): void {
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    // 更新平均響應時間
    if (this.stats.averageResponseTime === 0) {
      this.stats.averageResponseTime = responseTime;
    } else {
      const totalRequests = this.stats.successfulRequests + this.stats.failedRequests;
      this.stats.averageResponseTime =
        (this.stats.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
    }

    this.updateStats();
  }

  /**
   * 更新統計信息
   */
  private updateStats(): void {
    this.stats.activeServers = this.servers.size;
    this.stats.healthyServers = Array.from(this.serverWeights.values()).filter(
      (w) => w.isHealthy
    ).length;

    this.emit("statsUpdated", { ...this.stats });
  }

  /**
   * 啟動權重更新
   */
  private startWeightUpdates(): void {
    this.weightUpdateTimer = setInterval(() => {
      this.updateServerWeights();
    }, this.config.weightUpdateInterval);
  }

  /**
   * 動態更新服務器權重
   */
  private updateServerWeights(): void {
    for (const [serverId, weight] of this.serverWeights.entries()) {
      const oldWeight = weight.weight;
      let newWeight = 100; // 基礎權重

      // 基於響應時間調整權重
      if (weight.averageResponseTime > 0) {
        const responseTimeFactor = Math.max(0.1, 1000 / weight.averageResponseTime);
        newWeight *= responseTimeFactor;
      }

      // 基於錯誤率調整權重
      const errorFactor = Math.max(0.1, 1 - weight.errorRate);
      newWeight *= errorFactor;

      // 基於健康狀態調整權重
      if (!weight.isHealthy) {
        newWeight *= 0.1;
      }

      // 平滑權重變化
      weight.weight = Math.round(weight.weight * 0.7 + newWeight * 0.3);

      if (Math.abs(oldWeight - weight.weight) > 10) {
        const reason = `響應時間: ${weight.averageResponseTime.toFixed(2)}ms, 錯誤率: ${(weight.errorRate * 100).toFixed(1)}%`;
        this.emit("serverWeightUpdated", serverId, weight.weight, reason);

        this.logger.debug(`更新服務器權重: ${weight.serverName}`, {
          serverId,
          oldWeight,
          newWeight: weight.weight,
          reason,
        });
      }
    }
  }

  /**
   * 設置連接池監聽器
   */
  private setupConnectionPoolListeners(): void {
    this.connectionPool.on("poolStatsUpdated", (poolStats) => {
      // 基於連接池統計更新服務器健康狀態
      for (const [serverId, weight] of this.serverWeights.entries()) {
        const serverConnections = this.connectionPool.getServerConnections(serverId);
        const healthyConnections = serverConnections.filter((c) => c.healthStatus === "healthy");

        weight.isHealthy = healthyConnections.length > 0;
      }

      this.updateStats();
    });
  }

  /**
   * 獲取統計信息
   */
  public getStats(): LoadBalancerStats {
    return { ...this.stats };
  }

  /**
   * 獲取服務器權重
   */
  public getServerWeights(): ServerWeight[] {
    return Array.from(this.serverWeights.values()).map((w) => ({ ...w }));
  }

  /**
   * 設置服務器權重
   */
  public setServerWeight(serverId: string, weight: number): void {
    const serverWeight = this.serverWeights.get(serverId);
    if (serverWeight) {
      const oldWeight = serverWeight.weight;
      serverWeight.weight = Math.max(1, weight);

      this.emit("serverWeightUpdated", serverId, weight, "手動設置");
      this.logger.info(`手動設置服務器權重: ${serverWeight.serverName}`, {
        serverId,
        oldWeight,
        newWeight: weight,
      });
    }
  }

  /**
   * 切換負載均衡策略
   */
  public setStrategy(strategy: LoadBalancingStrategy, reason: string = "手動切換"): void {
    const oldStrategy = this.config.strategy;
    this.config.strategy = strategy;
    this.stats.currentStrategy = strategy;

    this.emit("strategyChanged", strategy, reason);
    this.logger.info(`切換負載均衡策略: ${oldStrategy} -> ${strategy}`, { reason });
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof LoadBalancerEvents>(event: K, listener: LoadBalancerEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof LoadBalancerEvents>(
    event: K,
    ...args: Parameters<LoadBalancerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
