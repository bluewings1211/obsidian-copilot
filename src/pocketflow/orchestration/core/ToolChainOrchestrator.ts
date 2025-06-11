/**
 * 工具鏈編排器
 *
 * 核心編排器，管理整個工具鏈的生命週期：
 * - 工具鏈定義解析
 * - 執行計劃生成
 * - 依賴關係管理
 * - 數據流協調
 * - 動態適應和優化
 */

import { EventEmitter } from "events";
import { ChainDefinition } from "./ChainDefinition";
import { ExecutionPlan } from "./ExecutionPlan";
import { DataFlowManager } from "./DataFlowManager";
import { DependencyResolver } from "../dependency/DependencyResolver";
import { ChainComposer } from "../composition/ChainComposer";
import { TemplateManager } from "../composition/TemplateManager";
import { ConditionalExecutor } from "../composition/ConditionalExecutor";
import { LoopManager } from "../composition/LoopManager";
import { ToolSelectionAgent } from "../../agents/ToolSelectionAgent";
import { EnhancedMcpManager } from "../../mcp-enhanced/EnhancedMcpManager";
import { createLogger, createPerformanceLogger } from "../../utils/logger";
import { ChatSharedState } from "../../types";

/**
 * 編排器配置
 */
export interface OrchestratorConfig {
  /** 最大並行度 */
  maxConcurrency: number;
  /** 默認超時時間 */
  defaultTimeout: number;
  /** 啟用動態優化 */
  enableDynamicOptimization: boolean;
  /** 啟用錯誤恢復 */
  enableErrorRecovery: boolean;
  /** 啟用性能監控 */
  enablePerformanceMonitoring: boolean;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 執行上下文
 */
export interface ExecutionContext {
  /** 執行 ID */
  executionId: string;
  /** 開始時間 */
  startTime: Date;
  /** 共享狀態 */
  sharedState: ChatSharedState;
  /** 元數據 */
  metadata: Record<string, any>;
  /** 中止控制器 */
  abortController: AbortController;
}

/**
 * 執行結果
 */
export interface OrchestrationResult {
  /** 是否成功 */
  success: boolean;
  /** 執行 ID */
  executionId: string;
  /** 執行時間 */
  executionTime: number;
  /** 結果數據 */
  result?: any;
  /** 錯誤信息 */
  error?: Error;
  /** 執行統計 */
  statistics: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    toolsUsed: string[];
    dataTransferred: number;
  };
  /** 性能指標 */
  performance: {
    averageStepTime: number;
    criticalPathTime: number;
    parallelizationRatio: number;
  };
}

/**
 * 編排器事件
 */
export interface OrchestratorEvents {
  // 執行事件
  executionStarted: (context: ExecutionContext, plan: ExecutionPlan) => void;
  executionCompleted: (result: OrchestrationResult) => void;
  executionFailed: (error: Error, context: ExecutionContext) => void;

  // 步驟事件
  stepStarted: (stepId: string, context: ExecutionContext) => void;
  stepCompleted: (stepId: string, result: any, context: ExecutionContext) => void;
  stepFailed: (stepId: string, error: Error, context: ExecutionContext) => void;

  // 優化事件
  planOptimized: (originalPlan: ExecutionPlan, optimizedPlan: ExecutionPlan) => void;

  // 數據流事件
  dataFlowStarted: (fromStep: string, toStep: string, data: any) => void;
  dataFlowCompleted: (fromStep: string, toStep: string) => void;
}

/**
 * 工具鏈編排器
 */
export class ToolChainOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private logger = createLogger("ToolChainOrchestrator");

  // 核心組件
  private dependencyResolver: DependencyResolver;
  private dataFlowManager: DataFlowManager;
  private chainComposer: ChainComposer;
  private templateManager: TemplateManager;
  private conditionalExecutor: ConditionalExecutor;
  private loopManager: LoopManager;

  // 外部依賴
  private toolSelectionAgent: ToolSelectionAgent;
  private mcpManager: EnhancedMcpManager;

  // 執行狀態
  private activeExecutions = new Map<string, ExecutionContext>();
  private executionHistory: OrchestrationResult[] = [];

  constructor(
    config: Partial<OrchestratorConfig> = {},
    toolSelectionAgent: ToolSelectionAgent,
    mcpManager: EnhancedMcpManager
  ) {
    super();

    this.config = {
      maxConcurrency: 5,
      defaultTimeout: 30000,
      enableDynamicOptimization: true,
      enableErrorRecovery: true,
      enablePerformanceMonitoring: true,
      debug: false,
      ...config,
    };

    this.toolSelectionAgent = toolSelectionAgent;
    this.mcpManager = mcpManager;

    this.initializeComponents();
  }

  /**
   * 執行工具鏈
   */
  async executeChain(
    chainDefinition: ChainDefinition,
    sharedState: ChatSharedState,
    options: {
      executionId?: string;
      enableOptimization?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<OrchestrationResult> {
    const executionId = options.executionId || this.generateExecutionId();
    const performanceLogger = createPerformanceLogger(`Orchestration.${executionId}`);

    this.logger.info(`開始執行工具鏈: ${chainDefinition.name}`, { executionId });

    // 創建執行上下文
    const context: ExecutionContext = {
      executionId,
      startTime: new Date(),
      sharedState,
      metadata: options.metadata || {},
      abortController: new AbortController(),
    };

    this.activeExecutions.set(executionId, context);

    try {
      // 1. 驗證鏈定義
      performanceLogger.checkpoint("驗證鏈定義");
      this.validateChainDefinition(chainDefinition);

      // 2. 解析依賴關係
      performanceLogger.checkpoint("解析依賴關係");
      const dependencyGraph = await this.dependencyResolver.resolve(chainDefinition);

      // 3. 生成執行計劃
      performanceLogger.checkpoint("生成執行計劃");
      let executionPlan = new ExecutionPlan(dependencyGraph, chainDefinition);

      // 4. 動態優化（如果啟用）
      if (this.config.enableDynamicOptimization && options.enableOptimization !== false) {
        performanceLogger.checkpoint("優化執行計劃");
        const optimizedPlan = await this.optimizeExecutionPlan(executionPlan, context);
        if (optimizedPlan) {
          this.emit("planOptimized", executionPlan, optimizedPlan);
          executionPlan = optimizedPlan;
        }
      }

      // 5. 執行計劃
      this.emit("executionStarted", context, executionPlan);
      performanceLogger.checkpoint("開始執行計劃");

      const result = await this.executePlan(executionPlan, context);

      // 6. 完成執行
      const executionTime = Date.now() - context.startTime.getTime();
      const orchestrationResult: OrchestrationResult = {
        success: true,
        executionId,
        executionTime,
        result,
        statistics: await this.collectStatistics(executionPlan, context),
        performance: await this.collectPerformanceMetrics(executionPlan, context),
      };

      this.executionHistory.push(orchestrationResult);
      this.emit("executionCompleted", orchestrationResult);

      performanceLogger.end(`工具鏈執行完成: ${chainDefinition.name}`);
      this.logger.info(`工具鏈執行成功`, { executionId, executionTime });

      return orchestrationResult;
    } catch (error) {
      const executionTime = Date.now() - context.startTime.getTime();
      const orchestrationResult: OrchestrationResult = {
        success: false,
        executionId,
        executionTime,
        error: error as Error,
        statistics: await this.collectStatistics(undefined, context),
        performance: await this.collectPerformanceMetrics(undefined, context),
      };

      this.executionHistory.push(orchestrationResult);
      this.emit("executionFailed", error as Error, context);

      this.logger.error(`工具鏈執行失敗`, error, { executionId });
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * 從模板創建並執行工具鏈
   */
  async executeFromTemplate(
    templateName: string,
    parameters: Record<string, any>,
    sharedState: ChatSharedState,
    options: {
      executionId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<OrchestrationResult> {
    this.logger.info(`從模板執行工具鏈: ${templateName}`, parameters);

    // 從模板創建鏈定義
    const chainDefinition = await this.templateManager.instantiateTemplate(
      templateName,
      parameters
    );

    return this.executeChain(chainDefinition, sharedState, {
      ...options,
      metadata: {
        ...options.metadata,
        templateName,
        templateParameters: parameters,
      },
    });
  }

  /**
   * 組合多個工具鏈
   */
  async composeAndExecute(
    chainNames: string[],
    compositionStrategy: "sequential" | "parallel" | "conditional",
    sharedState: ChatSharedState,
    options: {
      executionId?: string;
      conditions?: Record<string, any>;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<OrchestrationResult> {
    this.logger.info(`組合執行工具鏈`, {
      chains: chainNames,
      strategy: compositionStrategy,
    });

    // 組合工具鏈
    const composedChain = await this.chainComposer.compose(
      chainNames,
      compositionStrategy,
      options.conditions || {}
    );

    return this.executeChain(composedChain, sharedState, {
      ...options,
      metadata: {
        ...options.metadata,
        compositionStrategy,
        originalChains: chainNames,
      },
    });
  }

  /**
   * 中止執行
   */
  async abortExecution(executionId: string): Promise<void> {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      throw new Error(`執行 ${executionId} 不存在或已完成`);
    }

    this.logger.info(`中止執行: ${executionId}`);
    context.abortController.abort();

    // 等待清理完成
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.activeExecutions.delete(executionId);
  }

  /**
   * 獲取執行狀態
   */
  getExecutionStatus(executionId?: string) {
    if (executionId) {
      const context = this.activeExecutions.get(executionId);
      return context
        ? {
            executionId: context.executionId,
            startTime: context.startTime,
            isActive: true,
            metadata: context.metadata,
          }
        : null;
    }

    return {
      activeExecutions: Array.from(this.activeExecutions.values()).map((context) => ({
        executionId: context.executionId,
        startTime: context.startTime,
        metadata: context.metadata,
      })),
      completedExecutions: this.executionHistory.length,
      successRate: this.calculateSuccessRate(),
    };
  }

  /**
   * 清理執行歷史
   */
  clearHistory(): void {
    this.executionHistory = [];
    this.logger.info("執行歷史已清理");
  }

  /**
   * 初始化組件
   */
  private initializeComponents(): void {
    this.dependencyResolver = new DependencyResolver(this.config);
    this.dataFlowManager = new DataFlowManager(this.config);
    this.chainComposer = new ChainComposer(this.config);
    this.templateManager = new TemplateManager(this.config);
    this.conditionalExecutor = new ConditionalExecutor(this.config);
    this.loopManager = new LoopManager(this.config);

    // 設置數據流事件
    this.dataFlowManager.on("dataTransfer", (from, to, data) => {
      this.emit("dataFlowStarted", from, to, data);
    });

    this.dataFlowManager.on("transferComplete", (from, to) => {
      this.emit("dataFlowCompleted", from, to);
    });
  }

  /**
   * 驗證鏈定義
   */
  private validateChainDefinition(definition: ChainDefinition): void {
    if (!definition.name) {
      throw new Error("工具鏈名稱不能為空");
    }

    if (!definition.steps || definition.steps.length === 0) {
      throw new Error("工具鏈必須包含至少一個步驟");
    }

    // 驗證步驟定義
    for (const step of definition.steps) {
      if (!step.id) {
        throw new Error("步驟 ID 不能為空");
      }
      if (!step.type) {
        throw new Error(`步驟 ${step.id} 的類型不能為空`);
      }
    }

    this.logger.debug(`工具鏈定義驗證通過: ${definition.name}`);
  }

  /**
   * 優化執行計劃
   */
  private async optimizeExecutionPlan(
    plan: ExecutionPlan,
    context: ExecutionContext
  ): Promise<ExecutionPlan | null> {
    try {
      // 這裡可以實現各種優化策略：
      // 1. 並行化分析
      // 2. 資源分配優化
      // 3. 緩存策略
      // 4. 工具選擇優化

      this.logger.debug("執行計劃優化完成", { executionId: context.executionId });
      return null; // 暫時返回 null，表示無優化
    } catch (error) {
      this.logger.warn("執行計劃優化失敗", error);
      return null;
    }
  }

  /**
   * 執行計劃
   */
  private async executePlan(plan: ExecutionPlan, context: ExecutionContext): Promise<any> {
    // 這裡將實現具體的執行邏輯
    // 包括步驟調度、數據流管理、錯誤處理等
    this.logger.debug("開始執行計劃", { executionId: context.executionId });

    // 暫時返回空對象，具體實現將在後續完成
    return {};
  }

  /**
   * 收集統計信息
   */
  private async collectStatistics(plan: ExecutionPlan | undefined, context: ExecutionContext) {
    return {
      totalSteps: plan?.getSteps().length || 0,
      successfulSteps: 0,
      failedSteps: 0,
      toolsUsed: [],
      dataTransferred: 0,
    };
  }

  /**
   * 收集性能指標
   */
  private async collectPerformanceMetrics(
    plan: ExecutionPlan | undefined,
    context: ExecutionContext
  ) {
    return {
      averageStepTime: 0,
      criticalPathTime: 0,
      parallelizationRatio: 0,
    };
  }

  /**
   * 生成執行 ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 計算成功率
   */
  private calculateSuccessRate(): number {
    if (this.executionHistory.length === 0) return 0;
    const successful = this.executionHistory.filter((h) => h.success).length;
    return successful / this.executionHistory.length;
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof OrchestratorEvents>(event: K, listener: OrchestratorEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof OrchestratorEvents>(
    event: K,
    ...args: Parameters<OrchestratorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
