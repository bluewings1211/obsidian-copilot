/**
 * 向量搜索錯誤類型定義
 */

import { VectorErrorCode } from "./types";

export class VectorSearchError extends Error {
  public readonly code: VectorErrorCode;
  public readonly component: string;
  public readonly shardId?: string;
  public readonly taskId?: string;
  public readonly retryable: boolean;
  public readonly timestamp: number;
  public readonly context?: any;

  constructor(
    message: string,
    code: VectorErrorCode,
    component: string,
    retryable: boolean = false,
    context?: any,
    shardId?: string,
    taskId?: string
  ) {
    super(message);
    this.name = "VectorSearchError";
    this.code = code;
    this.component = component;
    this.retryable = retryable;
    this.timestamp = Date.now();
    this.context = context;
    this.shardId = shardId;
    this.taskId = taskId;

    // 確保錯誤堆疊正確
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VectorSearchError);
    }
  }

  /**
   * 創建維度不匹配錯誤
   */
  static dimensionMismatch(expected: number, actual: number, component: string): VectorSearchError {
    return new VectorSearchError(
      `Vector dimension mismatch: expected ${expected}, got ${actual}`,
      VectorErrorCode.DIMENSION_MISMATCH,
      component,
      false,
      { expected, actual }
    );
  }

  /**
   * 創建分片不可用錯誤
   */
  static shardUnavailable(shardId: string, component: string): VectorSearchError {
    return new VectorSearchError(
      `Shard ${shardId} is not available`,
      VectorErrorCode.SHARD_UNAVAILABLE,
      component,
      true,
      { shardId },
      shardId
    );
  }

  /**
   * 創建嵌入生成失敗錯誤
   */
  static embeddingGenerationFailed(reason: string, component: string): VectorSearchError {
    return new VectorSearchError(
      `Embedding generation failed: ${reason}`,
      VectorErrorCode.EMBEDDING_GENERATION_FAILED,
      component,
      true,
      { reason }
    );
  }

  /**
   * 創建緩存錯誤
   */
  static cacheError(reason: string, component: string): VectorSearchError {
    return new VectorSearchError(
      `Cache operation failed: ${reason}`,
      VectorErrorCode.CACHE_ERROR,
      component,
      true,
      { reason }
    );
  }

  /**
   * 創建並行執行失敗錯誤
   */
  static parallelExecutionFailed(
    reason: string,
    component: string,
    taskId?: string
  ): VectorSearchError {
    return new VectorSearchError(
      `Parallel execution failed: ${reason}`,
      VectorErrorCode.PARALLEL_EXECUTION_FAILED,
      component,
      true,
      { reason },
      undefined,
      taskId
    );
  }

  /**
   * 判斷是否為可重試錯誤
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * 獲取錯誤詳情
   */
  getDetails(): {
    code: VectorErrorCode;
    component: string;
    retryable: boolean;
    timestamp: number;
    context?: any;
  } {
    return {
      code: this.code,
      component: this.component,
      retryable: this.retryable,
      timestamp: this.timestamp,
      context: this.context,
    };
  }

  /**
   * 轉換為 JSON 格式
   */
  toJSON(): any {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      component: this.component,
      retryable: this.retryable,
      timestamp: this.timestamp,
      context: this.context,
      shardId: this.shardId,
      taskId: this.taskId,
      stack: this.stack,
    };
  }
}
