/**
 * 並行文本匹配處理器
 */

import {
  ParallelConfig,
  ParallelSearchTask,
  ParallelSearchResult,
  TaskStatus,
  ParallelTaskError,
} from "../types";

export class ParallelTextMatcher {
  private config: ParallelConfig;
  private workerPool: TextMatchWorker[] = [];
  private taskQueue: ParallelSearchTask[] = [];
  private activeTasks = new Map<string, ParallelSearchTask>();
  private isInitialized = false;
  private isShutdown = false;
  private taskCounter = 0;

  constructor(config: ParallelConfig) {
    this.config = config;
  }

  /**
   * 初始化並行匹配器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化工作池
      await this.initializeWorkerPool();

      // 啟動任務調度器
      this.startTaskScheduler();

      this.isInitialized = true;
    } catch (error) {
      throw new ParallelTaskError("init", `Failed to initialize parallel text matcher: ${error}`);
    }
  }

  /**
   * 執行並行搜索
   */
  async executeParallelSearch(tasks: ParallelSearchTask[]): Promise<ParallelSearchResult[]> {
    if (!this.isInitialized) {
      throw new ParallelTaskError("execute", "Parallel text matcher not initialized");
    }

    if (this.isShutdown) {
      throw new ParallelTaskError("execute", "Parallel text matcher is shutdown");
    }

    // 添加任務到隊列
    this.addTasksToQueue(tasks);

    // 等待所有任務完成
    const results = await this.waitForTaskCompletion(tasks);

    return results;
  }

  /**
   * 初始化工作池
   */
  private async initializeWorkerPool(): Promise<void> {
    const poolSize = this.config.workerPoolSize || 4;

    for (let i = 0; i < poolSize; i++) {
      const worker = new TextMatchWorker(i, {
        timeout: this.config.taskTimeout,
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay,
      });

      await worker.initialize();
      this.workerPool.push(worker);
    }
  }

  /**
   * 啟動任務調度器
   */
  private startTaskScheduler(): void {
    // 定期檢查任務隊列並分配任務
    const scheduleInterval = setInterval(() => {
      if (this.isShutdown) {
        clearInterval(scheduleInterval);
        return;
      }

      this.scheduleNextTasks();
    }, 100); // 每100ms檢查一次
  }

  /**
   * 調度下一批任務
   */
  private scheduleNextTasks(): void {
    const availableWorkers = this.getAvailableWorkers();
    const pendingTasks = this.getPendingTasks();

    // 根據策略分配任務
    for (let i = 0; i < Math.min(availableWorkers.length, pendingTasks.length); i++) {
      const worker = availableWorkers[i];
      const task = this.selectNextTask(pendingTasks);

      if (task) {
        this.assignTaskToWorker(task, worker);
      }
    }
  }

  /**
   * 獲取可用工作者
   */
  private getAvailableWorkers(): TextMatchWorker[] {
    return this.workerPool.filter((worker) => worker.isAvailable());
  }

  /**
   * 獲取待處理任務
   */
  private getPendingTasks(): ParallelSearchTask[] {
    return this.taskQueue.filter((task) => task.status === TaskStatus.PENDING);
  }

  /**
   * 選擇下一個任務
   */
  private selectNextTask(pendingTasks: ParallelSearchTask[]): ParallelSearchTask | null {
    if (pendingTasks.length === 0) {
      return null;
    }

    // 根據配置的策略選擇任務
    switch (this.config.taskPriorityStrategy) {
      case "priority":
        return pendingTasks.reduce((highest, current) =>
          current.priority > highest.priority ? current : highest
        );

      case "shortest_first":
        // 估算任務複雜度，選擇最簡單的
        return pendingTasks.reduce((shortest, current) => {
          const currentComplexity = this.estimateTaskComplexity(current);
          const shortestComplexity = this.estimateTaskComplexity(shortest);
          return currentComplexity < shortestComplexity ? current : shortest;
        });

      case "fifo":
      default:
        return pendingTasks[0];
    }
  }

  /**
   * 估算任務複雜度
   */
  private estimateTaskComplexity(task: ParallelSearchTask): number {
    let complexity = 1;

    // 基於查詢詞數量
    complexity += task.query.terms.length * 0.5;

    // 基於操作符數量
    complexity += task.query.operators.length * 1.5;

    // 基於短語數量
    complexity += task.query.phrases.length * 2;

    // 基於過濾器數量
    complexity += task.query.filters.length * 1;

    return complexity;
  }

  /**
   * 分配任務給工作者
   */
  private assignTaskToWorker(task: ParallelSearchTask, worker: TextMatchWorker): void {
    task.status = TaskStatus.RUNNING;
    task.startTime = Date.now();

    this.activeTasks.set(task.id, task);

    // 移除任務從隊列
    const queueIndex = this.taskQueue.findIndex((t) => t.id === task.id);
    if (queueIndex >= 0) {
      this.taskQueue.splice(queueIndex, 1);
    }

    // 執行任務
    worker
      .executeTask(task)
      .then((result) => this.handleTaskCompletion(task, result))
      .catch((error) => this.handleTaskError(task, error));
  }

  /**
   * 處理任務完成
   */
  private handleTaskCompletion(task: ParallelSearchTask, result: any): void {
    task.status = TaskStatus.COMPLETED;
    this.activeTasks.delete(task.id);

    // 通知任務完成（通過事件或回調）
    this.notifyTaskCompletion(task, result);
  }

  /**
   * 處理任務錯誤
   */
  private handleTaskError(task: ParallelSearchTask, error: any): void {
    console.error(`Task ${task.id} failed:`, error);

    // 檢查是否需要重試
    if (task.retries > 0) {
      task.retries--;
      task.status = TaskStatus.PENDING;

      // 延遲後重新加入隊列
      setTimeout(() => {
        if (!this.isShutdown) {
          this.taskQueue.unshift(task); // 優先處理重試任務
        }
      }, this.config.retryDelay);
    } else {
      task.status = TaskStatus.FAILED;
      this.activeTasks.delete(task.id);

      // 通知任務失敗
      this.notifyTaskFailure(task, error);
    }
  }

  /**
   * 添加任務到隊列
   */
  private addTasksToQueue(tasks: ParallelSearchTask[]): void {
    // 根據優先級插入任務
    tasks.forEach((task) => {
      task.status = TaskStatus.PENDING;

      if (this.config.taskPriorityStrategy === "priority") {
        // 按優先級插入
        let insertIndex = 0;
        while (
          insertIndex < this.taskQueue.length &&
          this.taskQueue[insertIndex].priority >= task.priority
        ) {
          insertIndex++;
        }
        this.taskQueue.splice(insertIndex, 0, task);
      } else {
        // FIFO 或其他策略直接添加到末尾
        this.taskQueue.push(task);
      }
    });
  }

  /**
   * 等待任務完成
   */
  private async waitForTaskCompletion(
    tasks: ParallelSearchTask[]
  ): Promise<ParallelSearchResult[]> {
    const results: ParallelSearchResult[] = [];
    const taskPromises = new Map<
      string,
      {
        resolve: (value: ParallelSearchResult) => void;
        reject: (reason?: any) => void;
      }
    >();

    // 為每個任務創建 Promise
    tasks.forEach((task) => {
      const promise = new Promise<ParallelSearchResult>((resolve, reject) => {
        taskPromises.set(task.id, { resolve, reject });

        // 設置超時
        setTimeout(() => {
          if (taskPromises.has(task.id)) {
            task.status = TaskStatus.TIMEOUT;
            this.activeTasks.delete(task.id);
            reject(new ParallelTaskError(task.id, `Task timed out after ${task.timeout}ms`));
          }
        }, task.timeout);
      });

      results.push(promise as any);
    });

    // 等待所有任務完成或失敗
    const settledResults = await Promise.allSettled(results);

    return settledResults
      .filter(
        (result): result is PromiseFulfilledResult<ParallelSearchResult> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value);
  }

  /**
   * 通知任務完成
   */
  private notifyTaskCompletion(task: ParallelSearchTask, result: any): void {
    // 這裡可以通過事件系統或回調通知任務完成
    // 暫時使用簡單的內部處理
    console.log(`Task ${task.id} completed successfully`);
  }

  /**
   * 通知任務失敗
   */
  private notifyTaskFailure(task: ParallelSearchTask, error: any): void {
    // 這裡可以通過事件系統或回調通知任務失敗
    console.error(`Task ${task.id} failed permanently:`, error);
  }

  /**
   * 獲取當前狀態
   */
  getStatus(): {
    isInitialized: boolean;
    workerCount: number;
    activeWorkers: number;
    queueLength: number;
    activeTasks: number;
  } {
    return {
      isInitialized: this.isInitialized,
      workerCount: this.workerPool.length,
      activeWorkers: this.workerPool.filter((w) => !w.isAvailable()).length,
      queueLength: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
    };
  }

  /**
   * 獲取性能統計
   */
  getPerformanceStats(): {
    totalTasksProcessed: number;
    averageTaskTime: number;
    failureRate: number;
    workerUtilization: number;
  } {
    // 這裡應該從實際的統計數據計算
    // 暫時返回模擬數據
    return {
      totalTasksProcessed: this.taskCounter,
      averageTaskTime: 1500,
      failureRate: 0.02,
      workerUtilization: 0.75,
    };
  }

  /**
   * 關閉並行匹配器
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    // 取消所有待處理任務
    this.taskQueue.forEach((task) => {
      task.status = TaskStatus.CANCELLED;
    });
    this.taskQueue.length = 0; // 清空數組

    // 等待活動任務完成或超時
    const shutdownTimeout = 30000; // 30秒
    const startTime = Date.now();

    while (this.activeTasks.size > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 關閉所有工作者
    await Promise.all(this.workerPool.map((worker) => worker.shutdown()));
    this.workerPool = [];

    this.isInitialized = false;
  }
}

/**
 * 文本匹配工作者
 */
class TextMatchWorker {
  private id: number;
  private config: {
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  private isAvailableFlag = true;
  private currentTask: ParallelSearchTask | null = null;

  constructor(id: number, config: { timeout: number; retryAttempts: number; retryDelay: number }) {
    this.id = id;
    this.config = config;
  }

  async initialize(): Promise<void> {
    // 工作者初始化邏輯
    this.isAvailableFlag = true;
  }

  isAvailable(): boolean {
    return this.isAvailableFlag && this.currentTask === null;
  }

  async executeTask(task: ParallelSearchTask): Promise<ParallelSearchResult> {
    if (!this.isAvailable()) {
      throw new ParallelTaskError(task.id, "Worker is not available");
    }

    this.isAvailableFlag = false;
    this.currentTask = task;

    try {
      // 模擬文本匹配處理
      const result = await this.performTextMatching(task);

      this.currentTask = null;
      this.isAvailableFlag = true;

      return result;
    } catch (error) {
      this.currentTask = null;
      this.isAvailableFlag = true;
      throw error;
    }
  }

  private async performTextMatching(task: ParallelSearchTask): Promise<ParallelSearchResult> {
    const startTime = Date.now();

    // 模擬搜索處理時間
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 500));

    // 模擬搜索結果
    const mockResults = this.generateMockResults(task);

    return {
      taskId: task.id,
      results: mockResults,
      metadata: {
        searchTime: Date.now() - startTime,
        indexName: task.index,
        documentsScanned: mockResults.length * 10,
        termsMatched: task.query.terms.length,
      },
    };
  }

  private generateMockResults(task: ParallelSearchTask): any[] {
    // 生成模擬搜索結果
    const resultCount = Math.floor(Math.random() * 20) + 1;
    const results = [];

    for (let i = 0; i < resultCount; i++) {
      results.push({
        id: `doc_${task.index}_${i}`,
        content: `Mock content for ${task.query.terms.join(" ")}`,
        title: `Mock title ${i}`,
        path: `/mock/path/${i}.md`,
        score: Math.random() * 0.8 + 0.2,
        highlights: [],
        metadata: {
          size: Math.floor(Math.random() * 10000) + 1000,
          mtime: Date.now() - Math.random() * 86400000,
          ctime: Date.now() - Math.random() * 86400000 * 30,
          extension: "md",
          tags: [`tag_${i}`],
          wordCount: Math.floor(Math.random() * 5000) + 100,
        },
      });
    }

    return results;
  }

  async shutdown(): Promise<void> {
    // 等待當前任務完成
    if (this.currentTask) {
      const maxWait = 10000; // 最多等10秒
      const startTime = Date.now();

      while (this.currentTask && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.isAvailableFlag = false;
    this.currentTask = null;
  }
}
