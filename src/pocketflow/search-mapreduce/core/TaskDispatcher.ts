/**
 * 任務分發器 - 負責管理和並行執行搜索任務
 */

import { EventEmitter } from "events";
import { SearchMapReduceConfig, SearchTask, SearchTaskResult } from "../types";
import { SearchStrategyRegistry } from "../strategies/SearchStrategyRegistry";

export class TaskDispatcher extends EventEmitter {
  private maxConcurrentTasks: number;
  private activeTasks: Map<string, Promise<SearchTaskResult>> = new Map();
  private taskQueue: SearchTask[] = [];
  private strategyRegistry: SearchStrategyRegistry;
  private isProcessing: boolean = false;

  constructor(private config: SearchMapReduceConfig) {
    super();
    this.maxConcurrentTasks = config.maxConcurrentTasks;
    this.strategyRegistry = new SearchStrategyRegistry();
  }

  /**
   * 初始化分發器
   */
  async initialize(): Promise<void> {
    await this.strategyRegistry.initialize();
  }

  /**
   * 分發並執行任務
   */
  async dispatchTasks(tasks: SearchTask[]): Promise<SearchTaskResult[]> {
    // 將任務添加到隊列
    this.taskQueue.push(...tasks);

    // 開始處理任務
    if (!this.isProcessing) {
      this.startProcessing();
    }

    // 等待所有任務完成
    const results = await this.waitForAllTasks(tasks);

    return results;
  }

  /**
   * 開始處理任務隊列
   */
  private startProcessing(): void {
    this.isProcessing = true;
    this.processNextTasks();
  }

  /**
   * 處理下一批任務
   */
  private async processNextTasks(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const task = this.getNextTask();
      if (task) {
        await this.executeTask(task);
      }
    }

    // 如果還有任務在執行，等待其中一個完成再繼續
    if (this.activeTasks.size >= this.maxConcurrentTasks && this.taskQueue.length > 0) {
      await Promise.race(this.activeTasks.values());
      this.processNextTasks();
    }

    // 所有任務都已分發
    if (this.taskQueue.length === 0 && this.activeTasks.size === 0) {
      this.isProcessing = false;
    }
  }

  /**
   * 獲取下一個要執行的任務
   */
  private getNextTask(): SearchTask | null {
    // 尋找沒有未完成依賴的任務
    for (let i = 0; i < this.taskQueue.length; i++) {
      const task = this.taskQueue[i];

      if (this.areDependenciesSatisfied(task)) {
        // 移除並返回任務
        this.taskQueue.splice(i, 1);
        return task;
      }
    }

    // 如果沒有可執行的任務，檢查是否有死鎖
    if (this.taskQueue.length > 0 && this.activeTasks.size === 0) {
      // 死鎖情況：強制執行優先級最高的任務
      this.taskQueue.sort((a, b) => b.priority - a.priority);
      return this.taskQueue.shift() || null;
    }

    return null;
  }

  /**
   * 檢查任務依賴是否已滿足
   */
  private areDependenciesSatisfied(task: SearchTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    // 檢查所有依賴是否都已完成
    return task.dependencies.every((dep) => !this.isTaskActive(dep) && !this.isTaskInQueue(dep));
  }

  /**
   * 檢查任務是否正在執行
   */
  private isTaskActive(strategy: string): boolean {
    for (const [taskId] of this.activeTasks) {
      // 這裡需要更好的方式來匹配策略，暫時使用 taskId 包含策略名稱
      if (taskId.includes(strategy)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 檢查任務是否在隊列中
   */
  private isTaskInQueue(strategy: string): boolean {
    return this.taskQueue.some((task) => task.strategy === strategy);
  }

  /**
   * 執行單個任務
   */
  private async executeTask(task: SearchTask): Promise<void> {
    const taskPromise = this.runTask(task);
    this.activeTasks.set(task.id, taskPromise);

    try {
      const result = await taskPromise;
      this.emit("taskCompleted", result);
    } catch (error) {
      const errorResult: SearchTaskResult = {
        taskId: task.id,
        strategy: task.strategy,
        results: [],
        executionTime: 0,
        success: false,
        error: error as Error,
        metadata: task.metadata,
      };
      this.emit("taskFailed", errorResult);
    } finally {
      this.activeTasks.delete(task.id);

      // 繼續處理下一批任務
      if (this.isProcessing) {
        this.processNextTasks();
      }
    }
  }

  /**
   * 運行單個任務
   */
  private async runTask(task: SearchTask): Promise<SearchTaskResult> {
    const startTime = Date.now();

    try {
      // 獲取對應的搜索策略
      const strategy = await this.strategyRegistry.getStrategy(task.strategy);

      if (!strategy) {
        throw new Error(`Strategy not found: ${task.strategy}`);
      }

      // 驗證上下文
      if (!strategy.validateContext(task.context)) {
        throw new Error(`Invalid context for strategy: ${task.strategy}`);
      }

      // 設置超時
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task timeout: ${task.strategy}`));
        }, task.timeout || this.config.taskTimeout);
      });

      // 執行搜索策略
      const searchPromise = strategy.search(task.context);
      const results = await Promise.race([searchPromise, timeoutPromise]);

      const executionTime = Date.now() - startTime;

      return {
        taskId: task.id,
        strategy: task.strategy,
        results,
        executionTime,
        success: true,
        metadata: {
          ...task.metadata,
          strategyCapabilities: strategy.getCapabilities(),
          actualExecutionTime: executionTime,
          estimatedExecutionTime: strategy.estimateExecutionTime(task.context),
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // 檢查是否需要重試
      const shouldRetry = this.shouldRetryTask(task, error as Error);

      if (shouldRetry && (task.retryCount || 0) > 0) {
        // 減少重試次數並重新排隊
        const retryTask = {
          ...task,
          retryCount: (task.retryCount || 0) - 1,
          metadata: {
            ...task.metadata,
            retryAttempt: ((task.metadata?.retryAttempt as number) || 0) + 1,
            lastError: (error as Error).message,
          },
        };

        // 添加延遲後重新排隊
        setTimeout(() => {
          this.taskQueue.unshift(retryTask);
          if (this.isProcessing) {
            this.processNextTasks();
          }
        }, this.calculateRetryDelay(retryTask));

        throw error; // 仍然拋出錯誤，讓調用者知道這次嘗試失敗了
      }

      return {
        taskId: task.id,
        strategy: task.strategy,
        results: [],
        executionTime,
        success: false,
        error: error as Error,
        metadata: task.metadata,
      };
    }
  }

  /**
   * 判斷是否應該重試任務
   */
  private shouldRetryTask(task: SearchTask, error: Error): boolean {
    // 某些類型的錯誤不應該重試
    const nonRetryableErrors = ["Invalid context", "Strategy not found", "Task timeout"];

    return !nonRetryableErrors.some((errorType) => error.message.includes(errorType));
  }

  /**
   * 計算重試延遲
   */
  private calculateRetryDelay(task: SearchTask): number {
    const baseDelay = 1000; // 1秒基礎延遲
    const retryAttempt = (task.metadata?.retryAttempt as number) || 0;

    // 指數退避
    return baseDelay * Math.pow(2, retryAttempt);
  }

  /**
   * 等待所有任務完成
   */
  private async waitForAllTasks(tasks: SearchTask[]): Promise<SearchTaskResult[]> {
    const results: SearchTaskResult[] = [];
    const taskIds = new Set(tasks.map((task) => task.id));

    return new Promise((resolve, reject) => {
      const checkCompletion = () => {
        // 檢查是否所有任務都已完成
        const completedTasks = results.filter((result) => taskIds.has(result.taskId));

        if (completedTasks.length === tasks.length) {
          resolve(results);
        }
      };

      // 監聽任務完成事件
      const onTaskCompleted = (result: SearchTaskResult) => {
        if (taskIds.has(result.taskId)) {
          results.push(result);
          checkCompletion();
        }
      };

      const onTaskFailed = (result: SearchTaskResult) => {
        if (taskIds.has(result.taskId)) {
          results.push(result);
          checkCompletion();
        }
      };

      this.on("taskCompleted", onTaskCompleted);
      this.on("taskFailed", onTaskFailed);

      // 設置總體超時
      const timeout = setTimeout(() => {
        this.off("taskCompleted", onTaskCompleted);
        this.off("taskFailed", onTaskFailed);
        reject(new Error("Overall task execution timeout"));
      }, this.config.taskTimeout * tasks.length);

      // 清理函數
      const cleanup = () => {
        clearTimeout(timeout);
        this.off("taskCompleted", onTaskCompleted);
        this.off("taskFailed", onTaskFailed);
      };

      // 當解析或拒絕時清理監聽器
      resolve = ((originalResolve) => {
        return (value: SearchTaskResult[]) => {
          cleanup();
          originalResolve(value);
        };
      })(resolve);

      reject = ((originalReject) => {
        return (reason: any) => {
          cleanup();
          originalReject(reason);
        };
      })(reject);
    });
  }

  /**
   * 獲取當前狀態
   */
  getStatus(): {
    activeTasks: number;
    queuedTasks: number;
    isProcessing: boolean;
  } {
    return {
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * 取消所有待處理的任務
   */
  cancelPendingTasks(): void {
    this.taskQueue = [];
  }

  /**
   * 等待所有活躍任務完成
   */
  async waitForActiveTasks(): Promise<void> {
    await Promise.allSettled(this.activeTasks.values());
  }

  /**
   * 關閉分發器
   */
  async shutdown(): Promise<void> {
    this.isProcessing = false;
    this.cancelPendingTasks();
    await this.waitForActiveTasks();
    this.removeAllListeners();
  }
}
