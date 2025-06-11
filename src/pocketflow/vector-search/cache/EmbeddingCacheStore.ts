/**
 * 嵌入向量緩存儲存
 */

import { EventEmitter } from "events";
import { EmbeddingCacheEntry, CacheConfig, VectorCacheStrategy } from "../types";

export class EmbeddingCacheStore extends EventEmitter {
  private config: CacheConfig;
  private cache: Map<string, EmbeddingCacheEntry> = new Map();
  private accessOrder: string[] = []; // For LRU
  private accessFrequency: Map<string, number> = new Map(); // For LFU
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(config: CacheConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化嵌入緩存
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
   * 獲取嵌入向量
   */
  async get(text: string, embeddingModel?: string): Promise<number[] | null> {
    if (!this.config.enableEmbeddingCache) {
      return null;
    }

    const cacheKey = this.generateCacheKey(text, embeddingModel);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.emit("embedding_cache_miss", { text: text.substring(0, 50) });
      return null;
    }

    // 檢查 TTL
    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      this.emit("embedding_cache_expired", { cacheKey });
      return null;
    }

    // 更新訪問統計
    this.updateAccessStats(cacheKey, entry);

    this.emit("embedding_cache_hit", {
      text: text.substring(0, 50),
      vectorLength: entry.embedding.length,
    });

    return [...entry.embedding]; // 返回副本
  }

  /**
   * 設置嵌入向量
   */
  async set(text: string, embedding: number[], embeddingModel: string = "default"): Promise<void> {
    if (!this.config.enableEmbeddingCache || embedding.length === 0) {
      return;
    }

    const cacheKey = this.generateCacheKey(text, embeddingModel);
    const now = Date.now();

    // 創建緩存條目
    const entry: EmbeddingCacheEntry = {
      textHash: cacheKey,
      text: text.length > 1000 ? text.substring(0, 1000) + "..." : text, // 限制存儲的文本長度
      embedding: [...embedding], // 存儲副本
      embeddingModel,
      timestamp: now,
      accessCount: 1,
      ttl: this.config.defaultTTL || 7 * 24 * 60 * 60 * 1000, // 7 days default for embeddings
    };

    // 檢查緩存大小限制
    await this.ensureCapacity();

    // 存儲緩存
    this.cache.set(cacheKey, entry);
    this.updateAccessOrder(cacheKey);

    this.emit("embedding_cache_set", {
      text: text.substring(0, 50),
      vectorLength: embedding.length,
      embeddingModel,
      cacheSize: this.cache.size,
    });
  }

  /**
   * 生成緩存鍵
   */
  private generateCacheKey(text: string, embeddingModel?: string): string {
    const normalizedText = this.normalizeText(text);
    const keyData = {
      text: normalizedText,
      model: embeddingModel || "default",
    };
    return this.hashString(JSON.stringify(keyData));
  }

  /**
   * 標準化文本
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ") // 多個空格合併為一個
      .replace(/[^\w\s]/g, ""); // 移除標點符號
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
   * 檢查條目是否過期
   */
  private isExpired(entry: EmbeddingCacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * 更新訪問統計
   */
  private updateAccessStats(cacheKey: string, entry: EmbeddingCacheEntry): void {
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

    this.emit("embedding_cache_evicted", {
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
  private calculateEvictionScore(key: string, entry: EmbeddingCacheEntry): number {
    const now = Date.now();
    const age = now - entry.timestamp;
    const frequency = this.accessFrequency.get(key) || 1;

    // 嵌入向量的清理策略：
    // 1. 文本長度 - 長文本的嵌入可能更有價值
    // 2. 訪問頻率 - 經常使用的嵌入應該保留
    // 3. 年齡 - 較舊的嵌入可以清理

    const textLengthScore = Math.min(entry.text.length / 1000, 1); // 標準化到 0-1
    const frequencyScore = Math.log(frequency + 1);
    const ageScore = 1 / (1 + age / entry.ttl);

    return textLengthScore * 0.3 + frequencyScore * 0.4 + ageScore * 0.3;
  }

  /**
   * 批量獲取嵌入向量
   */
  async getBatch(texts: string[], embeddingModel?: string): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    for (const text of texts) {
      const embedding = await this.get(text, embeddingModel);
      if (embedding) {
        results.set(text, embedding);
      }
    }

    return results;
  }

  /**
   * 批量設置嵌入向量
   */
  async setBatch(
    embeddings: Map<string, number[]>,
    embeddingModel: string = "default"
  ): Promise<void> {
    for (const [text, embedding] of embeddings.entries()) {
      await this.set(text, embedding, embeddingModel);
    }
  }

  /**
   * 根據模型清理緩存
   */
  async clearByModel(embeddingModel: string): Promise<number> {
    const keysToRemove: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.embeddingModel === embeddingModel) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.accessFrequency.delete(key);
    }

    this.emit("embedding_cache_cleared_by_model", {
      embeddingModel,
      clearedCount: keysToRemove.length,
    });

    return keysToRemove.length;
  }

  /**
   * 啟動清理調度器
   */
  private startCleanupScheduler(): void {
    const interval = 15 * 60 * 1000; // 15 minutes

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
      this.emit("embedding_scheduled_cleanup", {
        expiredCount: expiredKeys.length,
        cacheSize: this.cache.size,
      });
    }
  }

  /**
   * 獲取緩存統計
   */
  getEmbeddingCacheStats(): {
    size: number;
    maxSize: number;
    modelDistribution: Record<string, number>;
    averageVectorSize: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const modelDistribution: Record<string, number> = {};
    let totalVectorSize = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;

    for (const entry of this.cache.values()) {
      modelDistribution[entry.embeddingModel] = (modelDistribution[entry.embeddingModel] || 0) + 1;

      totalVectorSize += entry.embedding.length;
      oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp);
      newestTimestamp = Math.max(newestTimestamp, entry.timestamp);
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      modelDistribution,
      averageVectorSize: this.cache.size > 0 ? totalVectorSize / this.cache.size : 0,
      oldestEntry: this.cache.size > 0 ? oldestTimestamp : 0,
      newestEntry: this.cache.size > 0 ? newestTimestamp : 0,
    };
  }

  /**
   * 預熱緩存
   */
  async warmup(commonTexts: string[], embeddingModel?: string): Promise<void> {
    this.emit("cache_warmup_started", { textCount: commonTexts.length });

    // 這裡可以實現預熱邏輯，但需要實際的嵌入生成器
    // 暫時只是發送事件
    this.emit("cache_warmup_completed", { textCount: commonTexts.length });
  }

  /**
   * 清除所有緩存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.accessFrequency.clear();

    this.emit("embedding_cache_cleared");
  }

  /**
   * 關閉嵌入緩存
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
