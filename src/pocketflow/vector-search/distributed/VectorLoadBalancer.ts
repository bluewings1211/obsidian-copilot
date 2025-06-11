/**
 * 向量查詢負載均衡器
 */

import { EventEmitter } from "events";
import {
  VectorShard,
  VectorLoadBalancingConfig,
  LoadBalancingStrategy,
  VectorSearchFilters,
} from "../types";

export class VectorLoadBalancer extends EventEmitter {
  private config: VectorLoadBalancingConfig;
  private shardMetrics: Map<string, ShardMetrics> = new Map();
  private roundRobinIndex: number = 0;
  private isInitialized: boolean = false;

  constructor(config: VectorLoadBalancingConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化負載均衡器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 選擇分片進行查詢
   */
  selectShards(
    maxShards: number,
    preferredShards?: string[],
    filters?: VectorSearchFilters
  ): VectorShard[] {
    if (!this.isInitialized) {
      throw new Error("VectorLoadBalancer not initialized");
    }

    // 如果有偏好分片，優先使用
    if (preferredShards && preferredShards.length > 0) {
      const preferred = this.getShardsByIds(preferredShards)
        .filter((shard) => shard.isActive)
        .slice(0, maxShards);

      if (preferred.length > 0) {
        this.recordShardSelection(preferred.map((s) => s.id));
        return preferred;
      }
    }

    // 根據負載均衡策略選擇分片
    const availableShards = this.getAvailableShards();
    const selectedShards = this.selectByStrategy(availableShards, maxShards, filters);

    this.recordShardSelection(selectedShards.map((s) => s.id));
    return selectedShards;
  }

  /**
   * 根據策略選擇分片
   */
  private selectByStrategy(
    availableShards: VectorShard[],
    maxShards: number,
    filters?: VectorSearchFilters
  ): VectorShard[] {
    switch (this.config.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(availableShards, maxShards);

      case LoadBalancingStrategy.LEAST_LOADED:
        return this.selectLeastLoaded(availableShards, maxShards);

      case LoadBalancingStrategy.RANDOM:
        return this.selectRandom(availableShards, maxShards);

      case LoadBalancingStrategy.WEIGHTED:
        return this.selectWeighted(availableShards, maxShards);

      case LoadBalancingStrategy.ADAPTIVE:
        return this.selectAdaptive(availableShards, maxShards, filters);

      default:
        return this.selectLeastLoaded(availableShards, maxShards);
    }
  }

  /**
   * 輪詢選擇
   */
  private selectRoundRobin(shards: VectorShard[], maxShards: number): VectorShard[] {
    const selected: VectorShard[] = [];

    for (let i = 0; i < maxShards && i < shards.length; i++) {
      const index = (this.roundRobinIndex + i) % shards.length;
      selected.push(shards[index]);
    }

    this.roundRobinIndex = (this.roundRobinIndex + maxShards) % shards.length;
    return selected;
  }

  /**
   * 最少負載選擇
   */
  private selectLeastLoaded(shards: VectorShard[], maxShards: number): VectorShard[] {
    // 按負載因子排序
    const sortedShards = [...shards].sort((a, b) => {
      const loadA = this.getShardLoad(a.id);
      const loadB = this.getShardLoad(b.id);
      return loadA - loadB;
    });

    return sortedShards.slice(0, maxShards);
  }

  /**
   * 隨機選擇
   */
  private selectRandom(shards: VectorShard[], maxShards: number): VectorShard[] {
    const shuffled = [...shards].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, maxShards);
  }

  /**
   * 加權選擇
   */
  private selectWeighted(shards: VectorShard[], maxShards: number): VectorShard[] {
    // 基於文檔數量和性能指標計算權重
    const weighted = shards.map((shard) => ({
      shard,
      weight: this.calculateShardWeight(shard),
    }));

    // 按權重排序
    weighted.sort((a, b) => b.weight - a.weight);

    return weighted.slice(0, maxShards).map((w) => w.shard);
  }

  /**
   * 自適應選擇
   */
  private selectAdaptive(
    shards: VectorShard[],
    maxShards: number,
    filters?: VectorSearchFilters
  ): VectorShard[] {
    // 基於歷史性能和當前負載的自適應選擇
    const adaptive = shards.map((shard) => ({
      shard,
      score: this.calculateAdaptiveScore(shard, filters),
    }));

    adaptive.sort((a, b) => b.score - a.score);
    return adaptive.slice(0, maxShards).map((a) => a.shard);
  }

  /**
   * 計算分片權重
   */
  private calculateShardWeight(shard: VectorShard): number {
    const metrics = this.shardMetrics.get(shard.id);

    let weight = 1.0;

    // 基於文檔數量
    if (shard.documentCount > 0) {
      weight += Math.log(shard.documentCount) * 0.1;
    }

    // 基於負載因子（負載越低權重越高）
    weight += (1 - shard.loadFactor) * 0.5;

    // 基於歷史性能
    if (metrics) {
      weight += (1 - metrics.averageResponseTime / 1000) * 0.3; // 響應時間越短權重越高
      weight += metrics.successRate * 0.2; // 成功率越高權重越高
    }

    return Math.max(0, weight);
  }

  /**
   * 計算自適應分數
   */
  private calculateAdaptiveScore(shard: VectorShard, filters?: VectorSearchFilters): number {
    let score = this.calculateShardWeight(shard);

    // 基於查詢類型調整
    if (filters) {
      // 如果有時間範圍過濾，偏好較新的分片
      if (filters.timeRange) {
        const ageScore = Math.max(
          0,
          1 - (Date.now() - shard.lastUpdated) / (7 * 24 * 60 * 60 * 1000)
        );
        score += ageScore * 0.2;
      }

      // 如果需要大量結果，偏好文檔數多的分片
      if (filters.maxResults && filters.maxResults > 50) {
        const documentScore = Math.min(1, shard.documentCount / 1000);
        score += documentScore * 0.3;
      }
    }

    return score;
  }

  /**
   * 獲取分片負載
   */
  private getShardLoad(shardId: string): number {
    const metrics = this.shardMetrics.get(shardId);
    if (!metrics) {
      return 0;
    }

    return (
      metrics.currentQueries * 0.4 +
      (metrics.averageResponseTime / 1000) * 0.3 +
      (1 - metrics.successRate) * 0.3
    );
  }

  /**
   * 獲取可用分片
   */
  private getAvailableShards(): VectorShard[] {
    // 這裡應該從 ShardManager 獲取，暫時返回空數組
    // 在實際實現中需要注入 ShardManager 的引用
    return [];
  }

  /**
   * 根據 ID 獲取分片
   */
  private getShardsByIds(shardIds: string[]): VectorShard[] {
    // 這裡應該從 ShardManager 獲取，暫時返回空數組
    // 在實際實現中需要注入 ShardManager 的引用
    return [];
  }

  /**
   * 記錄分片選擇
   */
  private recordShardSelection(shardIds: string[]): void {
    this.emit("shards_selected", { shardIds, timestamp: Date.now() });

    // 更新分片使用統計
    shardIds.forEach((shardId) => {
      const metrics = this.shardMetrics.get(shardId) || this.createDefaultMetrics();
      metrics.totalSelections++;
      metrics.lastSelected = Date.now();
      this.shardMetrics.set(shardId, metrics);
    });
  }

  /**
   * 更新分片指標
   */
  updateShardMetrics(shardId: string, metrics: Partial<ShardMetrics>): void {
    const current = this.shardMetrics.get(shardId) || this.createDefaultMetrics();

    Object.assign(current, metrics);
    this.shardMetrics.set(shardId, current);

    this.emit("shard_metrics_updated", { shardId, metrics });
  }

  /**
   * 記錄查詢開始
   */
  recordQueryStart(shardId: string): void {
    const metrics = this.shardMetrics.get(shardId) || this.createDefaultMetrics();
    metrics.currentQueries++;
    metrics.totalQueries++;
    this.shardMetrics.set(shardId, metrics);
  }

  /**
   * 記錄查詢完成
   */
  recordQueryComplete(shardId: string, responseTime: number, success: boolean): void {
    const metrics = this.shardMetrics.get(shardId) || this.createDefaultMetrics();

    metrics.currentQueries = Math.max(0, metrics.currentQueries - 1);

    // 更新平均響應時間
    metrics.averageResponseTime =
      (metrics.averageResponseTime * (metrics.completedQueries || 1) + responseTime) /
      ((metrics.completedQueries || 1) + 1);

    metrics.completedQueries = (metrics.completedQueries || 0) + 1;

    if (success) {
      metrics.successfulQueries = (metrics.successfulQueries || 0) + 1;
    } else {
      metrics.failedQueries = (metrics.failedQueries || 0) + 1;
    }

    // 更新成功率
    metrics.successRate = metrics.successfulQueries / metrics.completedQueries;

    this.shardMetrics.set(shardId, metrics);

    this.emit("query_completed", {
      shardId,
      responseTime,
      success,
      metrics,
    });
  }

  /**
   * 檢查分片健康狀態
   */
  checkShardHealth(shardId: string): boolean {
    const metrics = this.shardMetrics.get(shardId);
    if (!metrics) {
      return true; // 新分片視為健康
    }

    // 健康檢查條件
    const isHealthy =
      metrics.successRate >= 0.9 && // 成功率 >= 90%
      metrics.averageResponseTime <= this.config.loadThreshold && // 響應時間合理
      metrics.currentQueries <= 10; // 當前查詢數不過多

    return isHealthy;
  }

  /**
   * 獲取負載均衡統計
   */
  getLoadBalancingStats(): {
    totalSelections: number;
    shardDistribution: Record<string, number>;
    averageResponseTime: number;
    overallSuccessRate: number;
    currentLoad: Record<string, number>;
  } {
    let totalSelections = 0;
    let totalResponseTime = 0;
    let totalQueries = 0;
    let totalSuccessful = 0;

    const shardDistribution: Record<string, number> = {};
    const currentLoad: Record<string, number> = {};

    this.shardMetrics.forEach((metrics, shardId) => {
      totalSelections += metrics.totalSelections;
      totalResponseTime += metrics.averageResponseTime * (metrics.completedQueries || 1);
      totalQueries += metrics.completedQueries || 0;
      totalSuccessful += metrics.successfulQueries || 0;

      shardDistribution[shardId] = metrics.totalSelections;
      currentLoad[shardId] = this.getShardLoad(shardId);
    });

    return {
      totalSelections,
      shardDistribution,
      averageResponseTime: totalQueries > 0 ? totalResponseTime / totalQueries : 0,
      overallSuccessRate: totalQueries > 0 ? totalSuccessful / totalQueries : 1,
      currentLoad,
    };
  }

  /**
   * 重置分片指標
   */
  resetShardMetrics(shardId?: string): void {
    if (shardId) {
      this.shardMetrics.delete(shardId);
    } else {
      this.shardMetrics.clear();
    }

    this.emit("metrics_reset", { shardId });
  }

  /**
   * 創建默認指標
   */
  private createDefaultMetrics(): ShardMetrics {
    return {
      totalSelections: 0,
      totalQueries: 0,
      completedQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      currentQueries: 0,
      averageResponseTime: 0,
      successRate: 1,
      lastSelected: Date.now(),
    };
  }

  /**
   * 關閉負載均衡器
   */
  async shutdown(): Promise<void> {
    this.shardMetrics.clear();
    this.isInitialized = false;
    this.emit("shutdown");
  }
}

/**
 * 分片指標接口
 */
interface ShardMetrics {
  totalSelections: number;
  totalQueries: number;
  completedQueries: number;
  successfulQueries: number;
  failedQueries: number;
  currentQueries: number;
  averageResponseTime: number;
  successRate: number;
  lastSelected: number;
}
