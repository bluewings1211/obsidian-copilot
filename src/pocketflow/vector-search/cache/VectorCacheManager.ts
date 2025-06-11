/**
 * 向量計算結果緩存管理器
 */

import { EventEmitter } from "events";
import {
  VectorSearchRequest,
  VectorSearchResult,
  VectorCacheEntry,
  VectorCacheStrategy,
  CacheConfig,
} from "../types";

export class VectorCacheManager extends EventEmitter {
  private config: CacheConfig;
  private cache: Map<string, VectorCacheEntry> = new Map();
  private accessOrder: string[] = []; // For LRU
  private accessFrequency: Map<string, number> = new Map(); // For LFU
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(config: CacheConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化緩存管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 啟動定期清理
      this.startCleanupScheduler();

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 獲取緩存結果
   */
  async get(request: VectorSearchRequest): Promise<VectorSearchResult[] | null> {
    if (!this.config.enableQueryCache) {
      return null;
    }

    const cacheKey = this.generateCacheKey(request);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.emit("cache_miss", { cacheKey });
      return null;
    }

    // 檢查 TTL
    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      this.emit("cache_expired", { cacheKey });
      return null;
    }

    // 更新訪問統計
    this.updateAccessStats(cacheKey, entry);

    this.emit("cache_hit", { cacheKey, resultCount: entry.results.length });
    return [...entry.results]; // 返回副本
  }

  /**
   * 設置緩存結果
   */
  async set(request: VectorSearchRequest, results: VectorSearchResult[]): Promise<void> {
    if (!this.config.enableQueryCache || results.length === 0) {
      return;
    }

    const cacheKey = this.generateCacheKey(request);
    const now = Date.now();

    // 創建緩存條目
    const entry: VectorCacheEntry = {
      queryHash: cacheKey,
      queryVector: Array.isArray(request.query) ? request.query : [],
      results: [...results], // 存儲副本
      timestamp: now,
      accessCount: 1,
      ttl: this.config.defaultTTL || 3600000, // 1 hour default
      metadata: {
        originalQuery: typeof request.query === "string" ? request.query : "vector_query",
        searchParams: request,
        resultCount: results.length,
        cacheStrategy: this.config.cacheStrategy,
      },
    };

    // 檢查緩存大小限制
    await this.ensureCapacity();

    // 存儲緩存
    this.cache.set(cacheKey, entry);
    this.updateAccessOrder(cacheKey);

    this.emit("cache_set", {
      cacheKey,
      resultCount: results.length,
      cacheSize: this.cache.size,
    });
  }

  /**
   * 生成緩存鍵
   */
  private generateCacheKey(request: VectorSearchRequest): string {
    const keyComponents = {
      query: Array.isArray(request.query)
        ? this.hashVector(request.query)
        : this.hashString(request.query),
      filters: request.filters || {},
      options: this.sanitizeOptionsForCaching(request.options || {}),
    };

    return this.hashString(JSON.stringify(keyComponents));
  }

  /**
   * 哈希字符串
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * 哈希向量
   */
  private hashVector(vector: number[]): string {
    // 使用簡化的向量哈希，考慮前幾個維度
    const sample = vector.slice(0, Math.min(10, vector.length));
    const rounded = sample.map((v) => Math.round(v * 1000) / 1000);
    return this.hashString(rounded.join(","));
  }

  /**
   * 清理緩存選項（移除不影響結果的選項）
   */
  private sanitizeOptionsForCaching(options: any): any {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { timeout, ...cachingOptions } = options;
    return cachingOptions;
  }

  /**
   * 檢查條目是否過期
   */
  private isExpired(entry: VectorCacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * 更新訪問統計
   */
  private updateAccessStats(cacheKey: string, entry: VectorCacheEntry): void {
    entry.accessCount++;
    this.updateAccessOrder(cacheKey);

    // 更新頻率統計（用於 LFU）
    const frequency = this.accessFrequency.get(cacheKey) || 0;
    this.accessFrequency.set(cacheKey, frequency + 1);
  }

  /**
   * 更新訪問順序（用於 LRU）
   */
  private updateAccessOrder(cacheKey: string): void {
    // 移除舊位置
    this.removeFromAccessOrder(cacheKey);
    // 添加到末尾
    this.accessOrder.push(cacheKey);
  }

  /**
   * 從訪問順序中移除
   */
  private removeFromAccessOrder(cacheKey: string): void {
    const index = this.accessOrder.indexOf(cacheKey);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * 確保緩存容量
   */
  private async ensureCapacity(): Promise<void> {
    if (this.cache.size < this.config.maxCacheSize) {
      return;
    }

    const evictionCount = Math.ceil(this.config.maxCacheSize * 0.1); // 清理 10%
    await this.evictEntries(evictionCount);
  }

  /**
   * 清理緩存條目
   */
  private async evictEntries(count: number): Promise<void> {
    const keysToEvict = this.selectKeysForEviction(count);

    for (const key of keysToEvict) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.accessFrequency.delete(key);
    }

    this.emit("cache_evicted", {
      evictedCount: keysToEvict.length,
      cacheSize: this.cache.size,
    });
  }

  /**
   * 選擇要清理的鍵
   */
  private selectKeysForEviction(count: number): string[] {
    switch (this.config.cacheStrategy) {
      case VectorCacheStrategy.LRU:
        return this.selectLRUKeys(count);

      case VectorCacheStrategy.LFU:
        return this.selectLFUKeys(count);

      case VectorCacheStrategy.TTL:
        return this.selectExpiredKeys(count);

      case VectorCacheStrategy.ADAPTIVE:
        return this.selectAdaptiveKeys(count);

      default:
        return this.selectLRUKeys(count);
    }
  }

  /**
   * 選擇 LRU 鍵
   */
  private selectLRUKeys(count: number): string[] {
    return this.accessOrder.slice(0, count);
  }

  /**
   * 選擇 LFU 鍵
   */
  private selectLFUKeys(count: number): string[] {
    const entries = Array.from(this.accessFrequency.entries());
    entries.sort((a, b) => a[1] - b[1]); // 按頻率升序
    return entries.slice(0, count).map(([key]) => key);
  }

  /**
   * 選擇過期的鍵
   */
  private selectExpiredKeys(count: number): string[] {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
        if (expiredKeys.length >= count) {
          break;
        }
      }
    }

    // 如果過期的不夠，用 LRU 補充
    if (expiredKeys.length < count) {
      const lruKeys = this.selectLRUKeys(count - expiredKeys.length);
      expiredKeys.push(...lruKeys.filter((key) => !expiredKeys.includes(key)));
    }

    return expiredKeys;
  }

  /**
   * 自適應選擇鍵
   */
  private selectAdaptiveKeys(count: number): string[] {
    const candidates: Array<{ key: string; score: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      const score = this.calculateEvictionScore(key, entry);
      candidates.push({ key, score });
    }

    // 按分數排序，分數低的優先清理
    candidates.sort((a, b) => a.score - b.score);
    return candidates.slice(0, count).map((c) => c.key);
  }

  /**
   * 計算清理分數
   */
  private calculateEvictionScore(key: string, entry: VectorCacheEntry): number {
    const now = Date.now();
    const age = now - entry.timestamp;
    const frequency = this.accessFrequency.get(key) || 1;
    const recentness = now - (entry.timestamp + age / 2); // 最近訪問時間估算

    // 綜合分數：年齡越大、頻率越低、最近訪問越久，分數越低
    const ageScore = 1 / (1 + age / entry.ttl);
    const frequencyScore = Math.log(frequency + 1);
    const recencyScore = 1 / (1 + recentness / (24 * 60 * 60 * 1000)); // 24 hours

    return ageScore * 0.3 + frequencyScore * 0.4 + recencyScore * 0.3;
  }

  /**
   * 啟動清理調度器
   */
  private startCleanupScheduler(): void {
    const interval = 5 * 60 * 1000; // 5 minutes

    this.cleanupInterval = setInterval(() => {
      this.performScheduledCleanup();
    }, interval);
  }

  /**
   * 執行定期清理
   */
  private performScheduledCleanup(): void {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.accessFrequency.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.emit("scheduled_cleanup", {
        expiredCount: expiredKeys.length,
        cacheSize: this.cache.size,
      });
    }
  }

  /**
   * 清除所有緩存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.accessFrequency.clear();

    this.emit("cache_cleared");
  }

  /**
   * 獲取緩存統計
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{
      key: string;
      accessCount: number;
      age: number;
      resultCount: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      accessCount: entry.accessCount,
      age: Date.now() - entry.timestamp,
      resultCount: entry.results.length,
    }));

    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: 0, // TODO: 實現命中率統計
      entries,
    };
  }

  /**
   * 獲取緩存條目詳情
   */
  getCacheEntry(cacheKey: string): VectorCacheEntry | null {
    return this.cache.get(cacheKey) || null;
  }

  /**
   * 移除特定緩存條目
   */
  async remove(cacheKey: string): Promise<boolean> {
    const existed = this.cache.has(cacheKey);

    if (existed) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      this.accessFrequency.delete(cacheKey);

      this.emit("cache_removed", { cacheKey });
    }

    return existed;
  }

  /**
   * 關閉緩存管理器
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.clear();
    this.isInitialized = false;

    this.emit("shutdown");
  }
}
