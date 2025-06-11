/**
 * 循環管理器
 *
 * 實現工具鏈中的循環執行邏輯：
 * - for 循環
 * - while 循環
 * - foreach 循環
 * - 循環控制和監控
 */

import { LoopDefinition, ConditionDefinition } from "../core/ChainDefinition";
import { ConditionalExecutor, ConditionContext } from "./ConditionalExecutor";
import { createLogger } from "../../utils/logger";

/**
 * 循環執行結果
 */
export interface LoopResult {
  /** 是否成功完成 */
  success: boolean;
  /** 總迭代次數 */
  totalIterations: number;
  /** 成功迭代次數 */
  successfulIterations: number;
  /** 失敗迭代次數 */
  failedIterations: number;
  /** 總執行時間 */
  totalExecutionTime: number;
  /** 平均迭代時間 */
  averageIterationTime: number;
  /** 迭代結果列表 */
  iterationResults: IterationResult[];
  /** 終止原因 */
  terminationReason: "completed" | "condition_false" | "max_iterations" | "error" | "timeout";
  /** 錯誤信息 */
  error?: Error;
}

/**
 * 迭代結果
 */
export interface IterationResult {
  /** 迭代編號 */
  iteration: number;
  /** 迭代值（用於 foreach） */
  value?: any;
  /** 執行時間 */
  executionTime: number;
  /** 是否成功 */
  success: boolean;
  /** 結果數據 */
  result?: any;
  /** 錯誤信息 */
  error?: Error;
}

/**
 * 循環上下文
 */
export interface LoopContext {
  /** 循環變量 */
  loopVariable?: string;
  /** 當前迭代值 */
  currentValue?: any;
  /** 當前迭代編號 */
  currentIteration: number;
  /** 步驟結果 */
  stepResults: Map<string, any>;
  /** 共享變量 */
  variables: Map<string, any>;
  /** 執行 ID */
  executionId: string;
  /** 中止控制器 */
  abortController: AbortController;
}

/**
 * 循環執行器函數
 */
export type LoopExecutor = (context: LoopContext) => Promise<any>;

/**
 * 循環管理器配置
 */
export interface LoopManagerConfig {
  /** 默認最大迭代次數 */
  defaultMaxIterations: number;
  /** 默認超時時間 */
  defaultTimeout: number;
  /** 啟用並行迭代 */
  enableParallelIterations: boolean;
  /** 最大並行度 */
  maxParallelIterations: number;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 循環管理器
 */
export class LoopManager {
  private config: LoopManagerConfig;
  private logger = createLogger("LoopManager");
  private conditionalExecutor: ConditionalExecutor;

  constructor(config: Partial<LoopManagerConfig> = {}) {
    this.config = {
      defaultMaxIterations: 1000,
      defaultTimeout: 300000, // 5 分鐘
      enableParallelIterations: false,
      maxParallelIterations: 5,
      debug: false,
      ...config,
    };

    this.conditionalExecutor = new ConditionalExecutor();
  }

  /**
   * 執行循環
   */
  async executeLoop(
    loopDefinition: LoopDefinition,
    executor: LoopExecutor,
    context: LoopContext
  ): Promise<LoopResult> {
    const startTime = Date.now();
    this.logger.info(`開始執行循環: ${loopDefinition.type}`, {
      executionId: context.executionId,
      maxIterations: loopDefinition.maxIterations,
    });

    const result: LoopResult = {
      success: false,
      totalIterations: 0,
      successfulIterations: 0,
      failedIterations: 0,
      totalExecutionTime: 0,
      averageIterationTime: 0,
      iterationResults: [],
      terminationReason: "completed",
    };

    try {
      switch (loopDefinition.type) {
        case "for":
          await this.executeForLoop(loopDefinition, executor, context, result);
          break;
        case "while":
          await this.executeWhileLoop(loopDefinition, executor, context, result);
          break;
        case "foreach":
          await this.executeForeachLoop(loopDefinition, executor, context, result);
          break;
        default:
          throw new Error(`不支援的循環類型: ${loopDefinition.type}`);
      }

      result.success = true;
      result.totalExecutionTime = Date.now() - startTime;
      result.averageIterationTime =
        result.totalIterations > 0 ? result.totalExecutionTime / result.totalIterations : 0;

      this.logger.info("循環執行完成", {
        executionId: context.executionId,
        totalIterations: result.totalIterations,
        successfulIterations: result.successfulIterations,
        terminationReason: result.terminationReason,
      });
    } catch (error) {
      result.success = false;
      result.error = error as Error;
      result.terminationReason = "error";
      result.totalExecutionTime = Date.now() - startTime;

      this.logger.error("循環執行失敗", error, {
        executionId: context.executionId,
        totalIterations: result.totalIterations,
      });
    }

    return result;
  }

  /**
   * 執行 for 循環
   */
  private async executeForLoop(
    loopDefinition: LoopDefinition,
    executor: LoopExecutor,
    context: LoopContext,
    result: LoopResult
  ): Promise<void> {
    const maxIterations = loopDefinition.maxIterations || this.config.defaultMaxIterations;

    for (let i = 0; i < maxIterations; i++) {
      // 檢查中止信號
      if (context.abortController.signal.aborted) {
        result.terminationReason = "timeout";
        break;
      }

      // 更新循環上下文
      context.currentIteration = i;
      if (loopDefinition.variable) {
        context.variables.set(loopDefinition.variable, i);
      }

      // 執行迭代
      const iterationResult = await this.executeIteration(executor, context, i);
      result.iterationResults.push(iterationResult);
      result.totalIterations++;

      if (iterationResult.success) {
        result.successfulIterations++;
      } else {
        result.failedIterations++;
      }

      // 檢查條件（如果有）
      if (loopDefinition.condition) {
        const conditionSatisfied = await this.evaluateLoopCondition(
          loopDefinition.condition,
          context
        );

        if (!conditionSatisfied) {
          result.terminationReason = "condition_false";
          break;
        }
      }
    }

    if (result.totalIterations >= maxIterations) {
      result.terminationReason = "max_iterations";
    }
  }

  /**
   * 執行 while 循環
   */
  private async executeWhileLoop(
    loopDefinition: LoopDefinition,
    executor: LoopExecutor,
    context: LoopContext,
    result: LoopResult
  ): Promise<void> {
    if (!loopDefinition.condition) {
      throw new Error("while 循環必須有條件");
    }

    const maxIterations = loopDefinition.maxIterations || this.config.defaultMaxIterations;
    let iteration = 0;

    while (iteration < maxIterations) {
      // 檢查中止信號
      if (context.abortController.signal.aborted) {
        result.terminationReason = "timeout";
        break;
      }

      // 評估循環條件
      const conditionSatisfied = await this.evaluateLoopCondition(
        loopDefinition.condition,
        context
      );

      if (!conditionSatisfied) {
        result.terminationReason = "condition_false";
        break;
      }

      // 更新循環上下文
      context.currentIteration = iteration;
      if (loopDefinition.variable) {
        context.variables.set(loopDefinition.variable, iteration);
      }

      // 執行迭代
      const iterationResult = await this.executeIteration(executor, context, iteration);
      result.iterationResults.push(iterationResult);
      result.totalIterations++;

      if (iterationResult.success) {
        result.successfulIterations++;
      } else {
        result.failedIterations++;
      }

      iteration++;
    }

    if (iteration >= maxIterations) {
      result.terminationReason = "max_iterations";
    }
  }

  /**
   * 執行 foreach 循環
   */
  private async executeForeachLoop(
    loopDefinition: LoopDefinition,
    executor: LoopExecutor,
    context: LoopContext,
    result: LoopResult
  ): Promise<void> {
    if (!loopDefinition.iterable) {
      throw new Error("foreach 循環必須有可迭代數據源");
    }

    // 獲取可迭代數據
    const iterableData = await this.getIterableData(loopDefinition.iterable, context);

    if (!Array.isArray(iterableData)) {
      throw new Error("foreach 循環的數據源必須是數組");
    }

    const maxIterations = Math.min(
      iterableData.length,
      loopDefinition.maxIterations || this.config.defaultMaxIterations
    );

    if (this.config.enableParallelIterations && iterableData.length > 1) {
      await this.executeForeachParallel(
        iterableData.slice(0, maxIterations),
        loopDefinition,
        executor,
        context,
        result
      );
    } else {
      await this.executeForeachSequential(
        iterableData.slice(0, maxIterations),
        loopDefinition,
        executor,
        context,
        result
      );
    }
  }

  /**
   * 順序執行 foreach 循環
   */
  private async executeForeachSequential(
    data: any[],
    loopDefinition: LoopDefinition,
    executor: LoopExecutor,
    context: LoopContext,
    result: LoopResult
  ): Promise<void> {
    for (let i = 0; i < data.length; i++) {
      // 檢查中止信號
      if (context.abortController.signal.aborted) {
        result.terminationReason = "timeout";
        break;
      }

      const item = data[i];

      // 更新循環上下文
      context.currentIteration = i;
      context.currentValue = item;
      if (loopDefinition.variable) {
        context.variables.set(loopDefinition.variable, item);
      }

      // 執行迭代
      const iterationResult = await this.executeIteration(executor, context, i, item);
      result.iterationResults.push(iterationResult);
      result.totalIterations++;

      if (iterationResult.success) {
        result.successfulIterations++;
      } else {
        result.failedIterations++;
      }

      // 檢查條件（如果有）
      if (loopDefinition.condition) {
        const conditionSatisfied = await this.evaluateLoopCondition(
          loopDefinition.condition,
          context
        );

        if (!conditionSatisfied) {
          result.terminationReason = "condition_false";
          break;
        }
      }
    }
  }

  /**
   * 並行執行 foreach 循環
   */
  private async executeForeachParallel(
    data: any[],
    loopDefinition: LoopDefinition,
    executor: LoopExecutor,
    context: LoopContext,
    result: LoopResult
  ): Promise<void> {
    const batchSize = this.config.maxParallelIterations;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      // 並行執行批次
      const batchPromises = batch.map(async (item, index) => {
        const iterationIndex = i + index;

        // 創建獨立的上下文副本
        const iterationContext: LoopContext = {
          ...context,
          currentIteration: iterationIndex,
          currentValue: item,
          variables: new Map(context.variables),
        };

        if (loopDefinition.variable) {
          iterationContext.variables.set(loopDefinition.variable, item);
        }

        return this.executeIteration(executor, iterationContext, iterationIndex, item);
      });

      const batchResults = await Promise.all(batchPromises);

      // 合併結果
      for (const iterationResult of batchResults) {
        result.iterationResults.push(iterationResult);
        result.totalIterations++;

        if (iterationResult.success) {
          result.successfulIterations++;
        } else {
          result.failedIterations++;
        }
      }

      // 檢查中止信號
      if (context.abortController.signal.aborted) {
        result.terminationReason = "timeout";
        break;
      }
    }
  }

  /**
   * 執行單次迭代
   */
  private async executeIteration(
    executor: LoopExecutor,
    context: LoopContext,
    iteration: number,
    value?: any
  ): Promise<IterationResult> {
    const startTime = Date.now();

    try {
      const result = await executor(context);

      return {
        iteration,
        value,
        executionTime: Date.now() - startTime,
        success: true,
        result,
      };
    } catch (error) {
      this.logger.warn(`迭代 ${iteration} 執行失敗`, error);

      return {
        iteration,
        value,
        executionTime: Date.now() - startTime,
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * 評估循環條件
   */
  private async evaluateLoopCondition(
    condition: ConditionDefinition,
    context: LoopContext
  ): Promise<boolean> {
    const conditionContext: ConditionContext = {
      stepResults: context.stepResults,
      variables: context.variables,
      executionId: context.executionId,
      timestamp: Date.now(),
    };

    const result = await this.conditionalExecutor.evaluateCondition(condition, conditionContext);

    return result.satisfied;
  }

  /**
   * 獲取可迭代數據
   */
  private async getIterableData(
    iterableDefinition: { stepId: string; outputName: string },
    context: LoopContext
  ): Promise<any[]> {
    const stepResult = context.stepResults.get(iterableDefinition.stepId);

    if (!stepResult) {
      throw new Error(`找不到步驟結果: ${iterableDefinition.stepId}`);
    }

    const data = stepResult[iterableDefinition.outputName];

    if (!Array.isArray(data)) {
      throw new Error(
        `步驟 ${iterableDefinition.stepId} 的輸出 ${iterableDefinition.outputName} 不是數組`
      );
    }

    return data;
  }

  /**
   * 創建循環中止控制器
   */
  createAbortController(timeout?: number): AbortController {
    const controller = new AbortController();

    if (timeout) {
      setTimeout(() => {
        controller.abort();
      }, timeout);
    }

    return controller;
  }

  /**
   * 獲取循環統計信息
   */
  getLoopStatistics(result: LoopResult): {
    successRate: number;
    averageIterationTime: number;
    totalTime: number;
    throughput: number;
  } {
    const successRate =
      result.totalIterations > 0 ? result.successfulIterations / result.totalIterations : 0;

    const throughput =
      result.totalExecutionTime > 0
        ? result.totalIterations / (result.totalExecutionTime / 1000)
        : 0;

    return {
      successRate,
      averageIterationTime: result.averageIterationTime,
      totalTime: result.totalExecutionTime,
      throughput,
    };
  }
}
