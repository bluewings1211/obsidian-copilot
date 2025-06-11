/**
 * 數據流水線
 *
 * 實現高效的數據流處理管道：
 * - 流式數據處理
 * - 數據變換和過濾
 * - 背壓控制
 * - 錯誤處理和恢復
 */

import { EventEmitter } from "events";
import { DataType } from "../core/ChainDefinition";
import { createLogger } from "../../utils/logger";

/**
 * 管道階段
 */
export interface PipelineStage<TInput = any, TOutput = any> {
  /** 階段名稱 */
  name: string;
  /** 處理函數 */
  process: (input: TInput) => Promise<TOutput>;
  /** 輸入類型 */
  inputType?: DataType;
  /** 輸出類型 */
  outputType?: DataType;
  /** 是否並行處理 */
  parallel?: boolean;
  /** 最大並行度 */
  maxConcurrency?: number;
  /** 錯誤處理策略 */
  errorStrategy?: "skip" | "retry" | "abort";
  /** 重試次數 */
  retryCount?: number;
}

/**
 * 管道配置
 */
export interface PipelineConfig {
  /** 管道名稱 */
  name: string;
  /** 緩衝區大小 */
  bufferSize: number;
  /** 啟用背壓控制 */
  enableBackpressure: boolean;
  /** 背壓閾值 */
  backpressureThreshold: number;
  /** 超時時間 */
  timeout: number;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 管道統計
 */
export interface PipelineStats {
  /** 處理的項目總數 */
  totalProcessed: number;
  /** 成功處理的項目數 */
  successfullyProcessed: number;
  /** 失敗的項目數 */
  failed: number;
  /** 跳過的項目數 */
  skipped: number;
  /** 總處理時間 */
  totalProcessingTime: number;
  /** 平均處理時間 */
  averageProcessingTime: number;
  /** 吞吐量（項目/秒） */
  throughput: number;
  /** 當前緩衝區大小 */
  currentBufferSize: number;
  /** 背壓狀態 */
  backpressureActive: boolean;
}

/**
 * 管道事件
 */
export interface PipelineEvents {
  // 數據事件
  dataReceived: (data: any) => void;
  dataProcessed: (data: any, stageName: string) => void;
  dataEmitted: (data: any) => void;

  // 狀態事件
  stageStarted: (stageName: string) => void;
  stageCompleted: (stageName: string, stats: any) => void;
  stageFailed: (stageName: string, error: Error) => void;

  // 控制事件
  backpressureActivated: (threshold: number, currentSize: number) => void;
  backpressureDeactivated: () => void;
  pipelineStarted: () => void;
  pipelineStopped: () => void;
  pipelineCompleted: () => void;
  pipelineError: (error: Error) => void;
}

/**
 * 數據項目
 */
interface DataItem {
  /** 數據內容 */
  data: any;
  /** 項目 ID */
  id: string;
  /** 時間戳 */
  timestamp: number;
  /** 重試次數 */
  retryCount: number;
  /** 元數據 */
  metadata: Record<string, any>;
}

/**
 * 數據流水線
 */
export class DataPipeline extends EventEmitter {
  private config: PipelineConfig;
  private logger = createLogger("DataPipeline");

  // 管道階段
  private stages: PipelineStage[] = [];

  // 緩衝區
  private buffer: DataItem[] = [];
  private processing = false;
  private backpressureActive = false;

  // 統計信息
  private stats: PipelineStats = {
    totalProcessed: 0,
    successfullyProcessed: 0,
    failed: 0,
    skipped: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    throughput: 0,
    currentBufferSize: 0,
    backpressureActive: false,
  };

  // 控制變量
  private startTime: number = 0;
  private abortController = new AbortController();

  constructor(config: Partial<PipelineConfig>) {
    super();

    this.config = {
      name: "DataPipeline",
      bufferSize: 1000,
      enableBackpressure: true,
      backpressureThreshold: 800,
      timeout: 30000,
      debug: false,
      ...config,
    };
  }

  /**
   * 添加處理階段
   */
  addStage<TInput, TOutput>(stage: PipelineStage<TInput, TOutput>): this {
    this.stages.push(stage);
    this.logger.debug(`添加管道階段: ${stage.name}`);
    return this;
  }

  /**
   * 移除處理階段
   */
  removeStage(stageName: string): this {
    const index = this.stages.findIndex((stage) => stage.name === stageName);
    if (index >= 0) {
      this.stages.splice(index, 1);
      this.logger.debug(`移除管道階段: ${stageName}`);
    }
    return this;
  }

  /**
   * 啟動管道
   */
  async start(): Promise<void> {
    if (this.processing) {
      throw new Error("管道已經在運行中");
    }

    this.logger.info(`啟動數據管道: ${this.config.name}`);

    this.processing = true;
    this.startTime = Date.now();
    this.resetStats();

    this.emit("pipelineStarted");

    // 開始處理循環
    this.processLoop().catch((error) => {
      this.logger.error("管道處理循環錯誤", error);
      this.emit("pipelineError", error);
    });
  }

  /**
   * 停止管道
   */
  async stop(): Promise<void> {
    this.logger.info(`停止數據管道: ${this.config.name}`);

    this.processing = false;
    this.abortController.abort();

    // 等待當前處理完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.emit("pipelineStopped");
  }

  /**
   * 輸入數據
   */
  async input(data: any, metadata: Record<string, any> = {}): Promise<void> {
    if (!this.processing) {
      throw new Error("管道未啟動");
    }

    // 檢查背壓
    if (this.config.enableBackpressure && this.shouldApplyBackpressure()) {
      if (!this.backpressureActive) {
        this.backpressureActive = true;
        this.stats.backpressureActive = true;
        this.emit("backpressureActivated", this.config.backpressureThreshold, this.buffer.length);
      }

      // 等待緩衝區有空間
      await this.waitForBufferSpace();
    }

    // 創建數據項目
    const item: DataItem = {
      data,
      id: this.generateItemId(),
      timestamp: Date.now(),
      retryCount: 0,
      metadata,
    };

    this.buffer.push(item);
    this.stats.currentBufferSize = this.buffer.length;

    this.emit("dataReceived", data);
    this.logger.debug(`接收數據項目: ${item.id}`);
  }

  /**
   * 批量輸入數據
   */
  async inputBatch(dataArray: any[], metadata: Record<string, any> = {}): Promise<void> {
    for (const data of dataArray) {
      await this.input(data, metadata);
    }
  }

  /**
   * 獲取統計信息
   */
  getStats(): PipelineStats {
    // 更新統計信息
    if (this.stats.totalProcessed > 0) {
      this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.totalProcessed;
    }

    const elapsedTime = (Date.now() - this.startTime) / 1000;
    if (elapsedTime > 0) {
      this.stats.throughput = this.stats.totalProcessed / elapsedTime;
    }

    this.stats.currentBufferSize = this.buffer.length;
    this.stats.backpressureActive = this.backpressureActive;

    return { ...this.stats };
  }

  /**
   * 清空緩衝區
   */
  clearBuffer(): void {
    this.buffer = [];
    this.stats.currentBufferSize = 0;
    this.logger.debug("緩衝區已清空");
  }

  /**
   * 等待管道完成
   */
  async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        if (this.buffer.length === 0 && this.processing) {
          this.emit("pipelineCompleted");
          resolve();
        } else {
          setTimeout(checkCompletion, 100);
        }
      };

      checkCompletion();
    });
  }

  /**
   * 處理循環
   */
  private async processLoop(): Promise<void> {
    while (this.processing) {
      if (this.buffer.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      const item = this.buffer.shift();
      if (!item) continue;

      this.stats.currentBufferSize = this.buffer.length;

      // 檢查背壓狀態
      if (this.backpressureActive && this.buffer.length < this.config.backpressureThreshold * 0.5) {
        this.backpressureActive = false;
        this.stats.backpressureActive = false;
        this.emit("backpressureDeactivated");
      }

      try {
        await this.processItem(item);
      } catch (error) {
        this.logger.error(`項目處理失敗: ${item.id}`, error);
        this.stats.failed++;
      }
    }
  }

  /**
   * 處理單個數據項目
   */
  private async processItem(item: DataItem): Promise<void> {
    const startTime = Date.now();

    try {
      let currentData = item.data;

      // 逐階段處理
      for (let i = 0; i < this.stages.length; i++) {
        const stage = this.stages[i];

        this.emit("stageStarted", stage.name);

        try {
          currentData = await this.processStage(stage, currentData, item);
          this.emit("dataProcessed", currentData, stage.name);

          const stageStats = {
            stageName: stage.name,
            processingTime: Date.now() - startTime,
          };
          this.emit("stageCompleted", stage.name, stageStats);
        } catch (error) {
          await this.handleStageError(stage, error, item);
          return; // 停止處理此項目
        }
      }

      // 處理成功
      this.stats.successfullyProcessed++;
      this.stats.totalProcessed++;
      this.stats.totalProcessingTime += Date.now() - startTime;

      this.emit("dataEmitted", currentData);
      this.logger.debug(`項目處理完成: ${item.id}`);
    } catch (error) {
      this.stats.failed++;
      this.stats.totalProcessed++;
      throw error;
    }
  }

  /**
   * 處理單個階段
   */
  private async processStage(stage: PipelineStage, data: any, item: DataItem): Promise<any> {
    if (stage.parallel) {
      // 並行處理（如果數據是數組）
      if (Array.isArray(data)) {
        return this.processStageParallel(stage, data, item);
      }
    }

    // 順序處理
    return await stage.process(data);
  }

  /**
   * 並行處理階段
   */
  private async processStageParallel(
    stage: PipelineStage,
    dataArray: any[],
    item: DataItem
  ): Promise<any[]> {
    const maxConcurrency = stage.maxConcurrency || 5;
    const results: any[] = [];

    for (let i = 0; i < dataArray.length; i += maxConcurrency) {
      const batch = dataArray.slice(i, i + maxConcurrency);
      const batchPromises = batch.map((data) => stage.process(data));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 處理階段錯誤
   */
  private async handleStageError(
    stage: PipelineStage,
    error: Error,
    item: DataItem
  ): Promise<void> {
    this.emit("stageFailed", stage.name, error);

    const errorStrategy = stage.errorStrategy || "skip";

    switch (errorStrategy) {
      case "skip":
        this.stats.skipped++;
        this.stats.totalProcessed++;
        this.logger.warn(`跳過失敗項目: ${item.id}`, error);
        break;

      case "retry":
        if (item.retryCount < (stage.retryCount || 3)) {
          item.retryCount++;
          this.buffer.unshift(item); // 重新加入處理隊列
          this.logger.info(`重試項目: ${item.id}, 重試次數: ${item.retryCount}`);
        } else {
          this.stats.failed++;
          this.stats.totalProcessed++;
          this.logger.error(`項目重試次數超限: ${item.id}`, error);
        }
        break;

      case "abort":
        this.logger.error(`階段 ${stage.name} 失敗，中止管道`, error);
        await this.stop();
        throw error;

      default:
        throw error;
    }
  }

  /**
   * 檢查是否應該應用背壓
   */
  private shouldApplyBackpressure(): boolean {
    return this.buffer.length >= this.config.backpressureThreshold;
  }

  /**
   * 等待緩衝區有空間
   */
  private async waitForBufferSpace(): Promise<void> {
    return new Promise((resolve) => {
      const checkSpace = () => {
        if (!this.shouldApplyBackpressure() || !this.processing) {
          resolve();
        } else {
          setTimeout(checkSpace, 10);
        }
      };

      checkSpace();
    });
  }

  /**
   * 重置統計信息
   */
  private resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      successfullyProcessed: 0,
      failed: 0,
      skipped: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      throughput: 0,
      currentBufferSize: 0,
      backpressureActive: false,
    };
  }

  /**
   * 生成項目 ID
   */
  private generateItemId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof PipelineEvents>(event: K, listener: PipelineEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof PipelineEvents>(
    event: K,
    ...args: Parameters<PipelineEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
