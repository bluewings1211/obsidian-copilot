/**
 * MCP 結果緩存管理器
 *
 * 提供智能結果緩存和失效管理功能：
 * - 多層緩存策略
 * - 智能失效機制
 * - 緩存預熱
 * - 統計和監控
 */

import { EventEmitter } from "events";
import type { CallToolParams, CallToolResult } from "@/mcp/types";
import { createLogger } from "@/pocketflow/utils/logger";

/**
 * 緩存條目
 */
interface CacheEntry {
  key: string;
  value: CallToolResult;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  ttl: number; // 生存時間（毫秒）
  size: number; // 估算大小（字節）
  metadata: {
    serverId: string;
    toolName: string;
    parametersHash: string;
    version: number;
  };
}

/**
 * 緩存統計
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number; // 字節
  hitCount: number;
  missCount: number;
  hitRate: number; // 0-1
  evictionCount: number;
  averageAccessTime: number; // 毫秒
  memoryUsage: number; // 字節
  maxMemoryUsage: number; // 字節
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

/**
 * 緩存策略
 */
export type CacheStrategy = "lru" | "lfu" | "ttl" | "fifo" | "adaptive";

/**
 * 失效策略
 */
export interface InvalidationStrategy {
  /** 基於時間的失效 */
  timeBasedTtl?: number; // 毫秒
  /** 基於訪問模式的失效 */
  accessBasedTtl?: {
    idleTime: number; // 空閒時間（毫秒）
    maxAge: number; // 最大存活時間（毫秒）
  };
  /** 基於版本的失效 */
  versionBased?: boolean;
  /** 自定義失效規則 */
  customRules?: Array<{
    condition: (entry: CacheEntry) => boolean;
    action: "invalidate" | "refresh" | "extend";
  }>;
}

/**
 * 緩存配置
 */
export interface CacheConfig {
  /** 緩存策略 */
  strategy?: CacheStrategy;
  /** 最大緩存條目數 */
  maxEntries?: number;
  /** 最大內存使用量（字節） */
  maxMemoryUsage?: number;
  /** 默認 TTL（毫秒） */
  defaultTtl?: number;
  /** 失效策略 */
  invalidationStrategy?: InvalidationStrategy;
  /** 清理間隔（毫秒） */
  cleanupInterval?: number;
  /** 啟用統計 */
  enableStats?: boolean;
  /** 啟用預熱 */
  enableWarmup?: boolean;
  /** 預熱策略 */
  warmupStrategy?: {
    preloadPatterns?: string[]; // 預加載的工具名稱模式
    preloadCount?: number; // 預加載數量
  };
  /** 調試模式 */
  debug?: boolean;
}

/**
 * 緩存事件
 */
export interface CacheEvents {
  hit: (key: string, entry: CacheEntry) => void;
  miss: (key: string, params: CallToolParams) => void;
  set: (key: string, entry: CacheEntry) => void;
  evicted: (key: string, entry: CacheEntry, reason: string) => void;
  invalidated: (key: string, reason: string) => void;
  statsUpdated: (stats: CacheStats) => void;
  memoryLimitExceeded: (current: number, limit: number) => void;
  warmupCompleted: (entriesLoaded: number) => void;
}

/**
 * 訪問模式統計
 */
interface AccessPattern {
  toolName: string;
  frequency: number;
  averageInterval: number; // 平均訪問間隔（毫秒）
  lastAccess: Date;
  trending: "up" | "down" | "stable";
}

/**
 * MCP 結果緩存管理器
 */
export class McpResultCache extends EventEmitter {
  private config: Required<CacheConfig>;
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = []; // LRU order
  private accessFrequency = new Map<string, number>(); // LFU tracking
  private accessPatterns = new Map<string, AccessPattern>();
  private stats: CacheStats;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private logger = createLogger("McpResultCache");

  constructor(config: CacheConfig = {}) {
    super();

    this.config = {
      strategy: config.strategy || "adaptive",
      maxEntries: config.maxEntries || 1000,
      maxMemoryUsage: config.maxMemoryUsage || 100 * 1024 * 1024, // 100MB
      defaultTtl: config.defaultTtl || 300000, // 5 minutes
      invalidationStrategy: config.invalidationStrategy || { timeBasedTtl: 300000 },
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      enableStats: config.enableStats ?? true,
      enableWarmup: config.enableWarmup ?? false,
      warmupStrategy: config.warmupStrategy || {},
      debug: config.debug ?? false,
    };

    this.stats = this.createEmptyStats();
  }

  /**
   * 啟動緩存管理器
   */
  public start(): void {
    this.logger.info("啟動 MCP 結果緩存管理器", { config: this.config });

    // 啟動清理定時器
    this.startCleanup();

    // 執行預熱
    if (this.config.enableWarmup) {
      this.performWarmup();
    }
  }

  /**
   * 停止緩存管理器
   */
  public stop(): void {
    this.logger.info("停止 MCP 結果緩存管理器");

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 獲取緩存結果
   */
  public get(serverId: string, params: CallToolParams): CallToolResult | null {
    const key = this.generateKey(serverId, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.missCount++;
      this.emit("miss", key, params);
      this.updateStats();
      return null;
    }

    // 檢查是否過期
    if (this.isExpired(entry)) {
      this.invalidate(key, "過期");
      this.stats.missCount++;
      this.emit("miss", key, params);
      this.updateStats();
      return null;
    }

    // 更新訪問統計
    entry.lastAccessedAt = new Date();
    entry.accessCount++;
    this.updateAccessOrder(key);
    this.updateAccessFrequency(key);
    this.updateAccessPattern(params.name);

    this.stats.hitCount++;
    this.emit("hit", key, entry);
    this.updateStats();

    return entry.value;
  }

  /**
   * 設置緩存結果
   */
  public set(
    serverId: string,
    params: CallToolParams,
    result: CallToolResult,
    customTtl?: number
  ): void {
    const key = this.generateKey(serverId, params);
    const ttl = customTtl || this.config.defaultTtl;
    const size = this.estimateSize(result);

    const entry: CacheEntry = {
      key,
      value: result,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 1,
      ttl,
      size,
      metadata: {
        serverId,
        toolName: params.name,
        parametersHash: this.hashParams(params.arguments || {}),
        version: 1,
      },
    };

    // 檢查內存限制
    if (this.stats.totalSize + size > this.config.maxMemoryUsage) {
      this.emit("memoryLimitExceeded", this.stats.totalSize + size, this.config.maxMemoryUsage);
      this.evictToMakeSpace(size);
    }

    // 檢查條目數限制
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldestEntry();
    }

    // 如果已存在，先移除舊的
    if (this.cache.has(key)) {
      this.remove(key);
    }

    // 添加新條目
    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.updateAccessFrequency(key);
    this.updateAccessPattern(params.name);

    this.stats.totalEntries = this.cache.size;
    this.stats.totalSize += size;

    this.emit("set", key, entry);
    this.updateStats();
  }

  /**
   * 失效特定緩存
   */
  public invalidate(key: string, reason: string = "手動失效"): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.remove(key);
    this.emit("invalidated", key, reason);
    return true;
  }

  /**
   * 按工具名稱失效緩存
   */
  public invalidateByTool(toolName: string, reason: string = "工具失效"): number {
    let invalidatedCount = 0;
    const keysToInvalidate: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.metadata.toolName === toolName) {
        keysToInvalidate.push(key);
      }
    }

    for (const key of keysToInvalidate) {
      if (this.invalidate(key, reason)) {
        invalidatedCount++;
      }
    }

    this.logger.info(`失效 ${invalidatedCount} 個 ${toolName} 工具的緩存條目`, { reason });
    return invalidatedCount;
  }

  /**
   * 按服務器失效緩存
   */
  public invalidateByServer(serverId: string, reason: string = "服務器失效"): number {
    let invalidatedCount = 0;
    const keysToInvalidate: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.metadata.serverId === serverId) {
        keysToInvalidate.push(key);
      }
    }

    for (const key of keysToInvalidate) {
      if (this.invalidate(key, reason)) {
        invalidatedCount++;
      }
    }

    this.logger.info(`失效 ${invalidatedCount} 個服務器 ${serverId} 的緩存條目`, { reason });
    return invalidatedCount;
  }

  /**
   * 清空所有緩存
   */
  public clear(): void {
    const entryCount = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    this.accessFrequency.clear();

    this.stats.totalEntries = 0;
    this.stats.totalSize = 0;

    this.logger.info(`清空所有緩存，共 ${entryCount} 個條目`);
    this.updateStats();
  }

  /**
   * 獲取緩存統計
   */
  public getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * 獲取訪問模式統計
   */
  public getAccessPatterns(): AccessPattern[] {
    return Array.from(this.accessPatterns.values()).map((p) => ({ ...p }));
  }

  /**
   * 預熱緩存
   */
  public async performWarmup(): Promise<void> {
    this.logger.info("開始緩存預熱");

    // 這裡可以實現預熱邏輯，例如：
    // 1. 從歷史數據加載常用查詢
    // 2. 預執行常見工具調用
    // 3. 從持久化存儲恢復緩存

    this.emit("warmupCompleted", 0);
  }

  /**
   * 生成緩存鍵
   */
  private generateKey(serverId: string, params: CallToolParams): string {
    const paramsHash = this.hashParams(params.arguments || {});
    return `${serverId}:${params.name}:${paramsHash}`;
  }

  /**
   * 哈希參數
   */
  private hashParams(params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (sorted, key) => {
          sorted[key] = params[key];
          return sorted;
        },
        {} as Record<string, unknown>
      );

    return this.simpleHash(JSON.stringify(sortedParams));
  }

  /**
   * 簡單哈希函數
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為32位整數
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 估算結果大小
   */
  private estimateSize(result: CallToolResult): number {
    try {
      return new Blob([JSON.stringify(result)]).size;
    } catch {
      // 備用估算方法
      return JSON.stringify(result).length * 2; // 假設每字符2字節
    }
  }

  /**
   * 檢查條目是否過期
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const createdTime = entry.createdAt.getTime();
    const lastAccessTime = entry.lastAccessedAt.getTime();

    // 基於時間的TTL檢查
    if (entry.ttl > 0 && now - createdTime > entry.ttl) {
      return true;
    }

    // 基於訪問模式的檢查
    const { accessBasedTtl } = this.config.invalidationStrategy;
    if (accessBasedTtl) {
      if (now - lastAccessTime > accessBasedTtl.idleTime) {
        return true;
      }
      if (now - createdTime > accessBasedTtl.maxAge) {
        return true;
      }
    }

    // 自定義規則檢查
    const { customRules } = this.config.invalidationStrategy;
    if (customRules) {
      for (const rule of customRules) {
        if (rule.condition(entry) && rule.action === "invalidate") {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 移除條目
   */
  private remove(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.totalSize -= entry.size;
      this.stats.totalEntries = this.cache.size;

      // 從訪問順序中移除
      const index = this.accessOrder.indexOf(key);
      if (index !== -1) {
        this.accessOrder.splice(index, 1);
      }

      this.accessFrequency.delete(key);
    }
  }

  /**
   * 驅逐條目以釋放空間
   */
  private evictToMakeSpace(requiredSize: number): void {
    let freedSize = 0;
    const entriesEvicted: string[] = [];

    while (freedSize < requiredSize && this.cache.size > 0) {
      const keyToEvict = this.selectEvictionCandidate();
      if (!keyToEvict) break;

      const entry = this.cache.get(keyToEvict);
      if (entry) {
        freedSize += entry.size;
        entriesEvicted.push(keyToEvict);
        this.remove(keyToEvict);
        this.emit("evicted", keyToEvict, entry, "內存不足");
        this.stats.evictionCount++;
      }
    }

    this.logger.debug(`驅逐 ${entriesEvicted.length} 個條目，釋放 ${freedSize} 字節空間`);
  }

  /**
   * 驅逐最舊的條目
   */
  private evictOldestEntry(): void {
    const keyToEvict = this.selectEvictionCandidate();
    if (keyToEvict) {
      const entry = this.cache.get(keyToEvict);
      if (entry) {
        this.remove(keyToEvict);
        this.emit("evicted", keyToEvict, entry, "達到最大條目數");
        this.stats.evictionCount++;
      }
    }
  }

  /**
   * 選擇驅逐候選者
   */
  private selectEvictionCandidate(): string | null {
    if (this.cache.size === 0) {
      return null;
    }

    switch (this.config.strategy) {
      case "lru":
        return this.accessOrder[0] || null;

      case "lfu":
        return this.selectLfuCandidate();

      case "ttl":
        return this.selectTtlCandidate();

      case "fifo":
        return this.selectFifoCandidate();

      case "adaptive":
        return this.selectAdaptiveCandidate();

      default:
        return this.accessOrder[0] || null;
    }
  }

  /**
   * 選擇 LFU 候選者
   */
  private selectLfuCandidate(): string | null {
    let minFrequency = Infinity;
    let candidate: string | null = null;

    for (const [key, frequency] of this.accessFrequency.entries()) {
      if (frequency < minFrequency) {
        minFrequency = frequency;
        candidate = key;
      }
    }

    return candidate;
  }

  /**
   * 選擇 TTL 候選者
   */
  private selectTtlCandidate(): string | null {
    let oldestTime = Infinity;
    let candidate: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      const remainingTtl = entry.ttl - (Date.now() - entry.createdAt.getTime());
      if (remainingTtl < oldestTime) {
        oldestTime = remainingTtl;
        candidate = key;
      }
    }

    return candidate;
  }

  /**
   * 選擇 FIFO 候選者
   */
  private selectFifoCandidate(): string | null {
    let oldestTime = Infinity;
    let candidate: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      const createdTime = entry.createdAt.getTime();
      if (createdTime < oldestTime) {
        oldestTime = createdTime;
        candidate = key;
      }
    }

    return candidate;
  }

  /**
   * 選擇自適應候選者
   */
  private selectAdaptiveCandidate(): string | null {
    // 結合多種策略的自適應算法
    const candidates = new Map<string, number>();

    for (const [key, entry] of this.cache.entries()) {
      let score = 0;

      // LRU 分數（越舊分數越高）
      const lruIndex = this.accessOrder.indexOf(key);
      const lruScore = lruIndex / this.accessOrder.length;

      // LFU 分數（頻率越低分數越高）
      const frequency = this.accessFrequency.get(key) || 0;
      const maxFrequency = Math.max(...this.accessFrequency.values());
      const lfuScore = maxFrequency > 0 ? 1 - frequency / maxFrequency : 1;

      // TTL 分數（剩餘時間越少分數越高）
      const remainingTtl = entry.ttl - (Date.now() - entry.createdAt.getTime());
      const ttlScore = Math.max(0, 1 - remainingTtl / entry.ttl);

      // 大小分數（越大分數越高）
      const avgSize = this.stats.totalSize / this.cache.size;
      const sizeScore = entry.size / avgSize;

      // 加權計算總分
      score = lruScore * 0.3 + lfuScore * 0.3 + ttlScore * 0.2 + sizeScore * 0.2;
      candidates.set(key, score);
    }

    // 選擇分數最高的候選者
    let maxScore = -1;
    let candidate: string | null = null;

    for (const [key, score] of candidates.entries()) {
      if (score > maxScore) {
        maxScore = score;
        candidate = key;
      }
    }

    return candidate;
  }

  /**
   * 更新訪問順序
   */
  private updateAccessOrder(key: string): void {
    // 移除現有位置
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }

    // 添加到末尾（最近訪問）
    this.accessOrder.push(key);
  }

  /**
   * 更新訪問頻率
   */
  private updateAccessFrequency(key: string): void {
    const current = this.accessFrequency.get(key) || 0;
    this.accessFrequency.set(key, current + 1);
  }

  /**
   * 更新訪問模式
   */
  private updateAccessPattern(toolName: string): void {
    const now = new Date();
    const pattern = this.accessPatterns.get(toolName);

    if (pattern) {
      const interval = now.getTime() - pattern.lastAccess.getTime();
      pattern.frequency++;
      pattern.averageInterval = (pattern.averageInterval + interval) / 2;
      pattern.lastAccess = now;

      // 簡單的趨勢分析
      if (interval < pattern.averageInterval * 0.8) {
        pattern.trending = "up";
      } else if (interval > pattern.averageInterval * 1.2) {
        pattern.trending = "down";
      } else {
        pattern.trending = "stable";
      }
    } else {
      this.accessPatterns.set(toolName, {
        toolName,
        frequency: 1,
        averageInterval: 0,
        lastAccess: now,
        trending: "stable",
      });
    }
  }

  /**
   * 啟動清理定時器
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 執行清理
   */
  private performCleanup(): void {
    const keysToRemove: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToRemove.push(key);
      }
    }

    let removedCount = 0;
    for (const key of keysToRemove) {
      if (this.invalidate(key, "清理過期條目")) {
        removedCount++;
      }
    }

    if (removedCount > 0 && this.config.debug) {
      this.logger.debug(`清理了 ${removedCount} 個過期緩存條目`);
    }

    this.updateStats();
  }

  /**
   * 更新統計信息
   */
  private updateStats(): void {
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = totalRequests > 0 ? this.stats.hitCount / totalRequests : 0;

    // 計算最舊和最新條目時間
    let oldestTime: Date | null = null;
    let newestTime: Date | null = null;

    for (const entry of this.cache.values()) {
      if (!oldestTime || entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
      }
      if (!newestTime || entry.createdAt > newestTime) {
        newestTime = entry.createdAt;
      }
    }

    this.stats.oldestEntry = oldestTime;
    this.stats.newestEntry = newestTime;
    this.stats.memoryUsage = this.stats.totalSize;

    if (this.config.enableStats) {
      this.emit("statsUpdated", this.stats);
    }
  }

  /**
   * 創建空統計對象
   */
  private createEmptyStats(): CacheStats {
    return {
      totalEntries: 0,
      totalSize: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      evictionCount: 0,
      averageAccessTime: 0,
      memoryUsage: 0,
      maxMemoryUsage: this.config.maxMemoryUsage,
      oldestEntry: null,
      newestEntry: null,
    };
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof CacheEvents>(event: K, listener: CacheEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof CacheEvents>(event: K, ...args: Parameters<CacheEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}
