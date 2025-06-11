/**
 * 向量數據分片管理器
 */

import { EventEmitter } from "events";
import { VectorShard, DistributedConfig, VectorDocument } from "../types";

export class VectorShardManager extends EventEmitter {
  private config: DistributedConfig;
  private shards: Map<string, VectorShard> = new Map();
  private shardDocuments: Map<string, VectorDocument[]> = new Map();
  private isInitialized: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: DistributedConfig) {
    super();
    this.config = config;
  }

  /**
   * 初始化分片管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 創建默認分片
      await this.createDefaultShards();

      // 啟動健康檢查
      this.startHealthCheck();

      this.isInitialized = true;
      this.emit("initialized");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * 創建默認分片
   */
  private async createDefaultShards(): Promise<void> {
    const defaultShard: VectorShard = {
      id: "default",
      name: "Default Shard",
      documentCount: 0,
      vectorDimension: 1536, // OpenAI embedding dimension
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      metadata: {},
      isActive: true,
      loadFactor: 0.0,
    };

    this.shards.set("default", defaultShard);
    this.shardDocuments.set("default", []);

    this.emit("shard_created", { shardId: "default" });
  }

  /**
   * 創建新分片
   */
  async createShard(
    name: string,
    vectorDimension: number,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const shardId = this.generateShardId();

    const shard: VectorShard = {
      id: shardId,
      name,
      documentCount: 0,
      vectorDimension,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      metadata,
      isActive: true,
      loadFactor: 0.0,
    };

    this.shards.set(shardId, shard);
    this.shardDocuments.set(shardId, []);

    this.emit("shard_created", { shardId });
    return shardId;
  }

  /**
   * 獲取所有活躍分片
   */
  getActiveShards(): VectorShard[] {
    return Array.from(this.shards.values()).filter((shard) => shard.isActive);
  }

  /**
   * 獲取特定分片
   */
  getShard(shardId: string): VectorShard | null {
    return this.shards.get(shardId) || null;
  }

  /**
   * 獲取分片文檔
   */
  getShardDocuments(shardId: string): VectorDocument[] {
    return this.shardDocuments.get(shardId) || [];
  }

  /**
   * 添加文檔到分片
   */
  async addDocumentToShard(shardId: string, document: VectorDocument): Promise<void> {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard ${shardId} not found`);
    }

    if (!shard.isActive) {
      throw new Error(`Shard ${shardId} is not active`);
    }

    // 驗證向量維度
    if (document.vector.length !== shard.vectorDimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${shard.vectorDimension}, got ${document.vector.length}`
      );
    }

    const documents = this.shardDocuments.get(shardId) || [];
    documents.push(document);
    this.shardDocuments.set(shardId, documents);

    // 更新分片統計
    shard.documentCount = documents.length;
    shard.lastUpdated = Date.now();
    shard.loadFactor = this.calculateLoadFactor(shard);

    this.emit("document_added", { shardId, documentId: document.id });
  }

  /**
   * 從分片移除文檔
   */
  async removeDocumentFromShard(shardId: string, documentId: string): Promise<boolean> {
    const documents = this.shardDocuments.get(shardId);
    if (!documents) {
      return false;
    }

    const initialLength = documents.length;
    const filteredDocuments = documents.filter((doc) => doc.id !== documentId);

    if (filteredDocuments.length === initialLength) {
      return false; // 文檔不存在
    }

    this.shardDocuments.set(shardId, filteredDocuments);

    // 更新分片統計
    const shard = this.shards.get(shardId);
    if (shard) {
      shard.documentCount = filteredDocuments.length;
      shard.lastUpdated = Date.now();
      shard.loadFactor = this.calculateLoadFactor(shard);
    }

    this.emit("document_removed", { shardId, documentId });
    return true;
  }

  /**
   * 選擇最佳分片進行查詢
   */
  selectShardsForQuery(
    maxShards: number = this.config.maxShardsPerQuery,
    preferredShards?: string[]
  ): VectorShard[] {
    const activeShards = this.getActiveShards();

    // 如果指定了偏好分片，優先使用
    if (preferredShards && preferredShards.length > 0) {
      const preferred = preferredShards
        .map((id) => this.shards.get(id))
        .filter((shard): shard is VectorShard => shard !== undefined && shard.isActive)
        .slice(0, maxShards);

      if (preferred.length > 0) {
        return preferred;
      }
    }

    // 根據負載因子和文檔數量選擇分片
    const sortedShards = activeShards
      .sort((a, b) => {
        // 優先選擇負載較低但有文檔的分片
        if (a.documentCount === 0 && b.documentCount > 0) return 1;
        if (b.documentCount === 0 && a.documentCount > 0) return -1;

        return a.loadFactor - b.loadFactor;
      })
      .slice(0, maxShards);

    return sortedShards;
  }

  /**
   * 計算分片負載因子
   */
  private calculateLoadFactor(shard: VectorShard): number {
    // 基於文檔數量的簡單負載計算
    const maxDocumentsPerShard = 10000; // 可配置
    return Math.min(shard.documentCount / maxDocumentsPerShard, 1.0);
  }

  /**
   * 重新平衡分片
   */
  async rebalanceShards(): Promise<void> {
    const activeShards = this.getActiveShards();
    if (activeShards.length <= 1) {
      return; // 無需重新平衡
    }

    this.emit("rebalancing_started");

    try {
      // 計算總文檔數和目標平均值
      const totalDocuments = activeShards.reduce((sum, shard) => sum + shard.documentCount, 0);
      const targetPerShard = Math.floor(totalDocuments / activeShards.length);

      // 找出過載和欠載的分片
      const overloadedShards = activeShards.filter(
        (shard) => shard.documentCount > targetPerShard * 1.2
      );
      const underloadedShards = activeShards.filter(
        (shard) => shard.documentCount < targetPerShard * 0.8
      );

      // 執行文檔遷移
      for (const overloaded of overloadedShards) {
        const documentsToMove = overloaded.documentCount - targetPerShard;
        const documents = this.shardDocuments.get(overloaded.id) || [];

        for (let i = 0; i < documentsToMove && underloadedShards.length > 0; i++) {
          const document = documents.pop();
          if (!document) break;

          const targetShard = underloadedShards[0];
          await this.addDocumentToShard(targetShard.id, document);

          // 更新源分片
          overloaded.documentCount--;
          overloaded.loadFactor = this.calculateLoadFactor(overloaded);

          // 檢查目標分片是否已滿
          if (targetShard.documentCount >= targetPerShard) {
            underloadedShards.shift();
          }
        }
      }

      this.emit("rebalancing_completed");
    } catch (error) {
      this.emit("rebalancing_failed", { error });
      throw error;
    }
  }

  /**
   * 獲取分片健康狀態
   */
  getShardHealth(shardId: string): {
    isHealthy: boolean;
    issues: string[];
    metrics: Record<string, number>;
  } {
    const shard = this.shards.get(shardId);
    if (!shard) {
      return {
        isHealthy: false,
        issues: ["Shard not found"],
        metrics: {},
      };
    }

    const issues: string[] = [];
    const metrics = {
      documentCount: shard.documentCount,
      loadFactor: shard.loadFactor,
      lastUpdated: shard.lastUpdated,
    };

    // 檢查分片狀態
    if (!shard.isActive) {
      issues.push("Shard is inactive");
    }

    if (shard.loadFactor > 0.9) {
      issues.push("High load factor");
    }

    if (Date.now() - shard.lastUpdated > 24 * 60 * 60 * 1000) {
      issues.push("Shard not updated recently");
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      metrics,
    };
  }

  /**
   * 啟動健康檢查
   */
  private startHealthCheck(): void {
    const interval = this.config.healthCheckInterval || 60000; // 1 minute

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, interval);
  }

  /**
   * 執行健康檢查
   */
  private performHealthCheck(): void {
    const activeShards = this.getActiveShards();
    const unhealthyShards: string[] = [];

    for (const shard of activeShards) {
      const health = this.getShardHealth(shard.id);
      if (!health.isHealthy) {
        unhealthyShards.push(shard.id);
        this.emit("shard_unhealthy", {
          shardId: shard.id,
          issues: health.issues,
        });
      }
    }

    this.emit("health_check_completed", {
      totalShards: activeShards.length,
      unhealthyShards: unhealthyShards.length,
    });
  }

  /**
   * 停用分片
   */
  async deactivateShard(shardId: string): Promise<void> {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard ${shardId} not found`);
    }

    shard.isActive = false;
    shard.lastUpdated = Date.now();

    this.emit("shard_deactivated", { shardId });
  }

  /**
   * 啟用分片
   */
  async activateShard(shardId: string): Promise<void> {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard ${shardId} not found`);
    }

    shard.isActive = true;
    shard.lastUpdated = Date.now();

    this.emit("shard_activated", { shardId });
  }

  /**
   * 獲取分片統計
   */
  getShardStatistics(): {
    totalShards: number;
    activeShards: number;
    totalDocuments: number;
    averageLoadFactor: number;
    shardDetails: Array<{
      id: string;
      documentCount: number;
      loadFactor: number;
      isActive: boolean;
    }>;
  } {
    const allShards = Array.from(this.shards.values());
    const activeShards = allShards.filter((shard) => shard.isActive);
    const totalDocuments = activeShards.reduce((sum, shard) => sum + shard.documentCount, 0);
    const averageLoadFactor =
      activeShards.length > 0
        ? activeShards.reduce((sum, shard) => sum + shard.loadFactor, 0) / activeShards.length
        : 0;

    return {
      totalShards: allShards.length,
      activeShards: activeShards.length,
      totalDocuments,
      averageLoadFactor,
      shardDetails: allShards.map((shard) => ({
        id: shard.id,
        documentCount: shard.documentCount,
        loadFactor: shard.loadFactor,
        isActive: shard.isActive,
      })),
    };
  }

  /**
   * 生成分片 ID
   */
  private generateShardId(): string {
    return `shard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 關閉分片管理器
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.shards.clear();
    this.shardDocuments.clear();
    this.isInitialized = false;

    this.emit("shutdown");
  }
}
