/**
 * 工具鏈組合器
 *
 * 動態組合多個工具鏈：
 * - 順序組合
 * - 並行組合
 * - 條件組合
 * - 嵌套組合
 */

import { ChainDefinition, ChainDefinitionBuilder, StepDefinition } from "../core/ChainDefinition";
import { createLogger } from "../../utils/logger";

/**
 * 組合策略
 */
export type CompositionStrategy =
  | "sequential" // 順序執行
  | "parallel" // 並行執行
  | "conditional" // 條件執行
  | "nested" // 嵌套執行
  | "pipeline" // 流水線執行
  | "branch" // 分支執行
  | "merge"; // 合併執行

/**
 * 組合配置
 */
export interface CompositionConfig {
  /** 組合策略 */
  strategy: CompositionStrategy;
  /** 條件表達式（用於條件組合） */
  conditions?: Record<string, any>;
  /** 並行配置 */
  parallelConfig?: {
    maxConcurrency?: number;
    failFast?: boolean;
  };
  /** 數據流配置 */
  dataFlowConfig?: {
    enableAutoFlow?: boolean;
    intermediateResults?: boolean;
  };
  /** 錯誤處理 */
  errorHandling?: {
    strategy: "abort" | "continue" | "fallback";
    fallbackChain?: string;
  };
}

/**
 * 組合結果
 */
export interface CompositionResult {
  /** 組合後的工具鏈 */
  composedChain: ChainDefinition;
  /** 組合元數據 */
  metadata: {
    originalChains: string[];
    strategy: CompositionStrategy;
    compositionTime: number;
    totalSteps: number;
    estimatedDuration?: number;
  };
  /** 組合警告 */
  warnings: string[];
}

/**
 * 工具鏈組合器配置
 */
export interface ChainComposerConfig {
  /** 自動解決衝突 */
  autoResolveConflicts: boolean;
  /** 優化組合結果 */
  optimizeComposition: boolean;
  /** 最大組合深度 */
  maxCompositionDepth: number;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 工具鏈組合器
 */
export class ChainComposer {
  private config: ChainComposerConfig;
  private logger = createLogger("ChainComposer");
  private chainRegistry = new Map<string, ChainDefinition>();

  constructor(config: Partial<ChainComposerConfig> = {}) {
    this.config = {
      autoResolveConflicts: true,
      optimizeComposition: true,
      maxCompositionDepth: 10,
      debug: false,
      ...config,
    };
  }

  /**
   * 註冊工具鏈
   */
  registerChain(chain: ChainDefinition): void {
    this.chainRegistry.set(chain.id, chain);
    this.logger.debug(`註冊工具鏈: ${chain.name}`, { chainId: chain.id });
  }

  /**
   * 組合工具鏈
   */
  async compose(
    chainIds: string[],
    strategy: CompositionStrategy,
    conditions: Record<string, any> = {},
    config: Partial<CompositionConfig> = {}
  ): Promise<ChainDefinition> {
    const startTime = Date.now();
    this.logger.info(`開始組合工具鏈`, { chainIds, strategy });

    try {
      // 1. 驗證輸入
      const chains = this.validateAndGetChains(chainIds);

      // 2. 創建組合配置
      const compositionConfig: CompositionConfig = {
        strategy,
        conditions,
        ...config,
      };

      // 3. 執行組合
      const result = await this.executeComposition(chains, compositionConfig);

      // 4. 優化組合結果
      if (this.config.optimizeComposition) {
        await this.optimizeComposition(result);
      }

      // 5. 驗證組合結果
      this.validateCompositionResult(result);

      const compositionTime = Date.now() - startTime;
      result.metadata.compositionTime = compositionTime;

      this.logger.info(`工具鏈組合完成`, {
        composedChainId: result.composedChain.id,
        totalSteps: result.metadata.totalSteps,
        compositionTime,
      });

      return result.composedChain;
    } catch (error) {
      this.logger.error("工具鏈組合失敗", error);
      throw error;
    }
  }

  /**
   * 快速組合 - 使用默認設置
   */
  async quickCompose(
    chainIds: string[],
    strategy: CompositionStrategy = "sequential"
  ): Promise<ChainDefinition> {
    return this.compose(chainIds, strategy);
  }

  /**
   * 流水線組合 - 將工具鏈連接成流水線
   */
  async composePipeline(
    chainIds: string[],
    enableAutoDataFlow: boolean = true
  ): Promise<ChainDefinition> {
    return this.compose(
      chainIds,
      "pipeline",
      {},
      {
        dataFlowConfig: {
          enableAutoFlow: enableAutoDataFlow,
          intermediateResults: true,
        },
      }
    );
  }

  /**
   * 並行組合 - 並行執行多個工具鏈
   */
  async composeParallel(
    chainIds: string[],
    maxConcurrency?: number,
    failFast: boolean = false
  ): Promise<ChainDefinition> {
    return this.compose(
      chainIds,
      "parallel",
      {},
      {
        parallelConfig: {
          maxConcurrency,
          failFast,
        },
      }
    );
  }

  /**
   * 條件組合 - 基於條件選擇執行的工具鏈
   */
  async composeConditional(
    chainIds: string[],
    conditions: Record<string, any>
  ): Promise<ChainDefinition> {
    return this.compose(chainIds, "conditional", conditions);
  }

  /**
   * 驗證並獲取工具鏈
   */
  private validateAndGetChains(chainIds: string[]): ChainDefinition[] {
    if (chainIds.length === 0) {
      throw new Error("必須提供至少一個工具鏈 ID");
    }

    const chains: ChainDefinition[] = [];
    for (const chainId of chainIds) {
      const chain = this.chainRegistry.get(chainId);
      if (!chain) {
        throw new Error(`找不到工具鏈: ${chainId}`);
      }
      chains.push(chain);
    }

    return chains;
  }

  /**
   * 執行組合
   */
  private async executeComposition(
    chains: ChainDefinition[],
    config: CompositionConfig
  ): Promise<CompositionResult> {
    const warnings: string[] = [];
    let composedChain: ChainDefinition;

    switch (config.strategy) {
      case "sequential":
        composedChain = await this.composeSequential(chains, warnings);
        break;
      case "parallel":
        composedChain = await this.composeParallelExecution(chains, config, warnings);
        break;
      case "conditional":
        composedChain = await this.composeConditionalExecution(chains, config, warnings);
        break;
      case "pipeline":
        composedChain = await this.composePipelineExecution(chains, config, warnings);
        break;
      case "branch":
        composedChain = await this.composeBranch(chains, config, warnings);
        break;
      case "merge":
        composedChain = await this.composeMerge(chains, config, warnings);
        break;
      case "nested":
        composedChain = await this.composeNested(chains, config, warnings);
        break;
      default:
        throw new Error(`不支援的組合策略: ${config.strategy}`);
    }

    return {
      composedChain,
      metadata: {
        originalChains: chains.map((c) => c.id),
        strategy: config.strategy,
        compositionTime: 0, // 將在調用者中設置
        totalSteps: composedChain.steps.length,
        estimatedDuration: this.estimateComposedChainDuration(composedChain),
      },
      warnings,
    };
  }

  /**
   * 順序組合
   */
  private async composeSequential(
    chains: ChainDefinition[],
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行順序組合");

    const builder = new ChainDefinitionBuilder();
    const composedId = `sequential_${chains.map((c) => c.id).join("_")}_${Date.now()}`;

    builder.setBasicInfo(
      composedId,
      `Sequential Composition: ${chains.map((c) => c.name).join(" → ")}`,
      "1.0.0",
      "順序執行的組合工具鏈"
    );

    // 合併所有步驟
    const allSteps: StepDefinition[] = [];
    const stepIdMapping = new Map<string, string>();

    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      const prefix = `chain${i}_`;

      for (const step of chain.steps) {
        const newStepId = `${prefix}${step.id}`;
        stepIdMapping.set(`${chain.id}.${step.id}`, newStepId);

        const newStep: StepDefinition = {
          ...step,
          id: newStepId,
          dependencies: step.dependencies.map((depId) => `${prefix}${depId}`),
        };

        // 添加與前一個鏈的連接
        if (i > 0) {
          const prevChain = chains[i - 1];
          const prevChainLastSteps = this.getChainOutputSteps(prevChain);
          newStep.dependencies.push(
            ...prevChainLastSteps.map((stepId) => `chain${i - 1}_${stepId}`)
          );
        }

        allSteps.push(newStep);
      }
    }

    // 添加步驟到構建器
    allSteps.forEach((step) => builder.addStep(step));

    // 合併數據流
    this.mergeDataFlows(chains, builder, stepIdMapping);

    // 合併配置
    this.mergeConfigurations(chains, builder);

    return builder.build();
  }

  /**
   * 並行組合
   */
  private async composeParallelExecution(
    chains: ChainDefinition[],
    config: CompositionConfig,
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行並行組合");

    const builder = new ChainDefinitionBuilder();
    const composedId = `parallel_${chains.map((c) => c.id).join("_")}_${Date.now()}`;

    builder.setBasicInfo(
      composedId,
      `Parallel Composition: ${chains.map((c) => c.name).join(" ∥ ")}`,
      "1.0.0",
      "並行執行的組合工具鏈"
    );

    // 創建並行包裝步驟
    const parallelStep: StepDefinition = {
      id: "parallel_wrapper",
      name: "並行執行包裝器",
      type: "parallel",
      inputs: [],
      outputs: [
        {
          name: "results",
          type: "array",
          description: "所有並行鏈的結果",
        },
      ],
      dependencies: [],
      config: {
        parameters: {
          chains: chains.map((c) => c.id),
          maxConcurrency: config.parallelConfig?.maxConcurrency,
          failFast: config.parallelConfig?.failFast,
        },
      },
      parallel: {
        maxConcurrency: config.parallelConfig?.maxConcurrency,
      },
    };

    builder.addStep(parallelStep);

    // 添加原始鏈的步驟（作為子步驟）
    const stepIdMapping = new Map<string, string>();

    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      const prefix = `chain${i}_`;

      for (const step of chain.steps) {
        const newStepId = `${prefix}${step.id}`;
        stepIdMapping.set(`${chain.id}.${step.id}`, newStepId);

        const newStep: StepDefinition = {
          ...step,
          id: newStepId,
          dependencies: step.dependencies.map((depId) => `${prefix}${depId}`),
        };

        builder.addStep(newStep);
      }
    }

    return builder.build();
  }

  /**
   * 條件組合
   */
  private async composeConditionalExecution(
    chains: ChainDefinition[],
    config: CompositionConfig,
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行條件組合");

    const builder = new ChainDefinitionBuilder();
    const composedId = `conditional_${chains.map((c) => c.id).join("_")}_${Date.now()}`;

    builder.setBasicInfo(
      composedId,
      `Conditional Composition: ${chains.map((c) => c.name).join(" | ")}`,
      "1.0.0",
      "條件執行的組合工具鏈"
    );

    // 創建條件分支步驟
    const conditionStep: StepDefinition = {
      id: "condition_evaluator",
      name: "條件評估器",
      type: "condition",
      inputs: [
        {
          name: "context",
          type: "object",
          required: true,
        },
      ],
      outputs: [
        {
          name: "selectedChain",
          type: "text",
          description: "選中的工具鏈 ID",
        },
      ],
      dependencies: [],
      config: {
        parameters: {
          conditions: config.conditions,
          chains: chains.map((c) => c.id),
        },
      },
    };

    builder.addStep(conditionStep);

    // 為每個鏈創建條件步驟
    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      const prefix = `chain${i}_`;

      for (const step of chain.steps) {
        const newStep: StepDefinition = {
          ...step,
          id: `${prefix}${step.id}`,
          dependencies: [
            ...step.dependencies.map((depId) => `${prefix}${depId}`),
            "condition_evaluator", // 依賴條件評估
          ],
          condition: {
            id: `condition_${chain.id}`,
            left: { type: "output", value: "condition_evaluator.selectedChain" },
            operator: "equals",
            right: { type: "constant", value: chain.id },
          },
        };

        builder.addStep(newStep);
      }
    }

    return builder.build();
  }

  /**
   * 流水線組合
   */
  private async composePipelineExecution(
    chains: ChainDefinition[],
    config: CompositionConfig,
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行流水線組合");

    // 流水線是特殊的順序組合，帶有自動數據流
    const sequentialChain = await this.composeSequential(chains, warnings);

    // 如果啟用自動數據流，添加數據流定義
    if (config.dataFlowConfig?.enableAutoFlow) {
      this.addAutoDataFlows(sequentialChain, chains);
    }

    return sequentialChain;
  }

  /**
   * 分支組合
   */
  private async composeBranch(
    chains: ChainDefinition[],
    config: CompositionConfig,
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行分支組合");

    const builder = new ChainDefinitionBuilder();
    const composedId = `branch_${chains.map((c) => c.id).join("_")}_${Date.now()}`;

    builder.setBasicInfo(
      composedId,
      `Branch Composition: ${chains.map((c) => c.name).join(" ⟸ ")}`,
      "1.0.0",
      "分支執行的組合工具鏈"
    );

    // 創建分支控制步驟
    const branchStep: StepDefinition = {
      id: "branch_controller",
      name: "分支控制器",
      type: "custom",
      inputs: [
        {
          name: "input",
          type: "any",
          required: true,
        },
      ],
      outputs: chains.map((chain, index) => ({
        name: `branch_${index}_input`,
        type: "any",
        description: `分支 ${index} 的輸入`,
      })),
      dependencies: [],
      config: {
        parameters: {
          branchStrategy: "broadcast", // 廣播到所有分支
        },
      },
    };

    builder.addStep(branchStep);

    // 添加每個分支
    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      const prefix = `branch${i}_`;

      for (const step of chain.steps) {
        const newStep: StepDefinition = {
          ...step,
          id: `${prefix}${step.id}`,
          dependencies: [...step.dependencies.map((depId) => `${prefix}${depId}`)],
        };

        // 第一個步驟依賴分支控制器
        if (this.isChainInputStep(step, chain)) {
          newStep.dependencies.push("branch_controller");
        }

        builder.addStep(newStep);
      }
    }

    return builder.build();
  }

  /**
   * 合併組合
   */
  private async composeMerge(
    chains: ChainDefinition[],
    config: CompositionConfig,
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行合併組合");

    const builder = new ChainDefinitionBuilder();
    const composedId = `merge_${chains.map((c) => c.id).join("_")}_${Date.now()}`;

    builder.setBasicInfo(
      composedId,
      `Merge Composition: ${chains.map((c) => c.name).join(" ⟹ ")}`,
      "1.0.0",
      "合併執行的組合工具鏈"
    );

    // 添加所有鏈的步驟
    const allOutputSteps: string[] = [];

    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      const prefix = `chain${i}_`;

      for (const step of chain.steps) {
        const newStep: StepDefinition = {
          ...step,
          id: `${prefix}${step.id}`,
          dependencies: step.dependencies.map((depId) => `${prefix}${depId}`),
        };

        builder.addStep(newStep);

        // 收集輸出步驟
        if (this.isChainOutputStep(step, chain)) {
          allOutputSteps.push(newStep.id);
        }
      }
    }

    // 創建合併步驟
    const mergeStep: StepDefinition = {
      id: "merge_results",
      name: "結果合併器",
      type: "aggregation",
      inputs: allOutputSteps.map((stepId) => ({
        name: stepId,
        type: "any",
        required: true,
        source: { stepId, outputName: "result" },
      })),
      outputs: [
        {
          name: "merged_result",
          type: "object",
          description: "合併後的結果",
        },
      ],
      dependencies: allOutputSteps,
      config: {
        parameters: {
          aggregationType: "merge",
        },
      },
    };

    builder.addStep(mergeStep);

    return builder.build();
  }

  /**
   * 嵌套組合
   */
  private async composeNested(
    chains: ChainDefinition[],
    config: CompositionConfig,
    warnings: string[]
  ): Promise<ChainDefinition> {
    this.logger.debug("執行嵌套組合");

    if (chains.length < 2) {
      throw new Error("嵌套組合需要至少兩個工具鏈");
    }

    const outerChain = chains[0];
    const innerChains = chains.slice(1);

    const builder = new ChainDefinitionBuilder();
    const composedId = `nested_${chains.map((c) => c.id).join("_")}_${Date.now()}`;

    builder.setBasicInfo(
      composedId,
      `Nested Composition: ${outerChain.name} { ${innerChains.map((c) => c.name).join(", ")} }`,
      "1.0.0",
      "嵌套執行的組合工具鏈"
    );

    // 添加外層鏈的步驟
    for (const step of outerChain.steps) {
      builder.addStep(step);
    }

    // 在適當位置插入內層鏈
    for (let i = 0; i < innerChains.length; i++) {
      const innerChain = innerChains[i];
      const prefix = `inner${i}_`;

      for (const step of innerChain.steps) {
        const newStep: StepDefinition = {
          ...step,
          id: `${prefix}${step.id}`,
          dependencies: step.dependencies.map((depId) => `${prefix}${depId}`),
        };

        builder.addStep(newStep);
      }
    }

    return builder.build();
  }

  /**
   * 合併數據流
   */
  private mergeDataFlows(
    chains: ChainDefinition[],
    builder: ChainDefinitionBuilder,
    stepIdMapping: Map<string, string>
  ): void {
    for (const chain of chains) {
      if (chain.dataFlows) {
        for (const flow of chain.dataFlows) {
          const fromStepId = stepIdMapping.get(`${chain.id}.${flow.fromStepId}`) || flow.fromStepId;
          const toStepId = stepIdMapping.get(`${chain.id}.${flow.toStepId}`) || flow.toStepId;

          builder.addDataFlow({
            ...flow,
            fromStepId,
            toStepId,
          });
        }
      }
    }
  }

  /**
   * 合併配置
   */
  private mergeConfigurations(chains: ChainDefinition[], builder: ChainDefinitionBuilder): void {
    const mergedConfig = {
      defaultTimeout: Math.max(...chains.map((c) => c.config.defaultTimeout || 30000)),
      maxConcurrency: Math.max(...chains.map((c) => c.config.maxConcurrency || 5)),
      enableCaching: chains.some((c) => c.config.enableCaching),
    };

    builder.setConfig(mergedConfig);
  }

  /**
   * 添加自動數據流
   */
  private addAutoDataFlows(
    composedChain: ChainDefinition,
    originalChains: ChainDefinition[]
  ): void {
    // 簡化實現：連接相鄰鏈的輸出和輸入
    for (let i = 0; i < originalChains.length - 1; i++) {
      const currentChain = originalChains[i];
      const nextChain = originalChains[i + 1];

      const currentOutputSteps = this.getChainOutputSteps(currentChain);
      const nextInputSteps = this.getChainInputSteps(nextChain);

      // 添加數據流連接
      for (const outputStep of currentOutputSteps) {
        for (const inputStep of nextInputSteps) {
          composedChain.dataFlows.push({
            fromStepId: `chain${i}_${outputStep}`,
            fromOutput: "result",
            toStepId: `chain${i + 1}_${inputStep}`,
            toInput: "input",
          });
        }
      }
    }
  }

  /**
   * 獲取鏈的輸出步驟
   */
  private getChainOutputSteps(chain: ChainDefinition): string[] {
    return chain.steps.filter((step) => this.isChainOutputStep(step, chain)).map((step) => step.id);
  }

  /**
   * 獲取鏈的輸入步驟
   */
  private getChainInputSteps(chain: ChainDefinition): string[] {
    return chain.steps.filter((step) => this.isChainInputStep(step, chain)).map((step) => step.id);
  }

  /**
   * 檢查是否為鏈的輸出步驟
   */
  private isChainOutputStep(step: StepDefinition, chain: ChainDefinition): boolean {
    // 沒有其他步驟依賴此步驟
    return !chain.steps.some((otherStep) => otherStep.dependencies.includes(step.id));
  }

  /**
   * 檢查是否為鏈的輸入步驟
   */
  private isChainInputStep(step: StepDefinition, chain: ChainDefinition): boolean {
    // 沒有依賴其他步驟
    return step.dependencies.length === 0;
  }

  /**
   * 優化組合結果
   */
  private async optimizeComposition(result: CompositionResult): Promise<void> {
    this.logger.debug("開始優化組合結果");

    // 1. 移除重複步驟
    this.removeDuplicateSteps(result.composedChain);

    // 2. 優化依賴關係
    this.optimizeDependencies(result.composedChain);

    // 3. 合併相似步驟
    this.mergeSimilarSteps(result.composedChain);

    this.logger.debug("組合結果優化完成");
  }

  /**
   * 移除重複步驟
   */
  private removeDuplicateSteps(chain: ChainDefinition): void {
    const uniqueSteps = new Map<string, StepDefinition>();
    const stepMapping = new Map<string, string>();

    for (const step of chain.steps) {
      const signature = this.generateStepSignature(step);

      if (uniqueSteps.has(signature)) {
        const existingStep = uniqueSteps.get(signature)!;
        stepMapping.set(step.id, existingStep.id);
      } else {
        uniqueSteps.set(signature, step);
        stepMapping.set(step.id, step.id);
      }
    }

    // 更新步驟列表
    chain.steps = Array.from(uniqueSteps.values());

    // 更新依賴關係
    for (const step of chain.steps) {
      step.dependencies = step.dependencies.map((depId) => stepMapping.get(depId) || depId);
    }
  }

  /**
   * 生成步驟簽名
   */
  private generateStepSignature(step: StepDefinition): string {
    return `${step.type}:${step.config.toolName || ""}:${JSON.stringify(step.config.parameters || {})}`;
  }

  /**
   * 優化依賴關係
   */
  private optimizeDependencies(chain: ChainDefinition): void {
    // 移除冗餘依賴
    for (const step of chain.steps) {
      const directDeps = new Set(step.dependencies);
      const indirectDeps = new Set<string>();

      // 收集間接依賴
      for (const depId of step.dependencies) {
        this.collectIndirectDependencies(depId, chain, indirectDeps);
      }

      // 移除間接依賴
      step.dependencies = step.dependencies.filter(
        (depId) => !indirectDeps.has(depId) || directDeps.has(depId)
      );
    }
  }

  /**
   * 收集間接依賴
   */
  private collectIndirectDependencies(
    stepId: string,
    chain: ChainDefinition,
    collected: Set<string>
  ): void {
    const step = chain.steps.find((s) => s.id === stepId);
    if (!step) return;

    for (const depId of step.dependencies) {
      if (!collected.has(depId)) {
        collected.add(depId);
        this.collectIndirectDependencies(depId, chain, collected);
      }
    }
  }

  /**
   * 合併相似步驟
   */
  private mergeSimilarSteps(chain: ChainDefinition): void {
    // 查找可以合併的相似步驟
    const mergeGroups = new Map<string, StepDefinition[]>();

    for (const step of chain.steps) {
      if (step.type === "data_transform") {
        const key = `transform_${step.config.transformFunction}`;
        if (!mergeGroups.has(key)) {
          mergeGroups.set(key, []);
        }
        mergeGroups.get(key)!.push(step);
      }
    }

    // 執行合併
    for (const [, steps] of mergeGroups.entries()) {
      if (steps.length > 1) {
        this.mergeTransformSteps(steps, chain);
      }
    }
  }

  /**
   * 合併轉換步驟
   */
  private mergeTransformSteps(steps: StepDefinition[], chain: ChainDefinition): void {
    if (steps.length <= 1) return;

    // 創建合併後的步驟
    const mergedStep: StepDefinition = {
      ...steps[0],
      id: `merged_${steps.map((s) => s.id).join("_")}`,
      name: `合併轉換: ${steps.map((s) => s.name).join(", ")}`,
      config: {
        ...steps[0].config,
        parameters: {
          ...steps[0].config.parameters,
          batchInputs: steps.map((s) => s.id),
        },
      },
    };

    // 移除原始步驟
    chain.steps = chain.steps.filter((step) => !steps.includes(step));

    // 添加合併步驟
    chain.steps.push(mergedStep);

    // 更新依賴關係
    this.updateDependenciesAfterMerge(steps, mergedStep, chain);
  }

  /**
   * 更新合併後的依賴關係
   */
  private updateDependenciesAfterMerge(
    originalSteps: StepDefinition[],
    mergedStep: StepDefinition,
    chain: ChainDefinition
  ): void {
    const originalStepIds = new Set(originalSteps.map((s) => s.id));

    for (const step of chain.steps) {
      step.dependencies = step.dependencies.map((depId) => {
        if (originalStepIds.has(depId)) {
          return mergedStep.id;
        }
        return depId;
      });

      // 去重
      step.dependencies = [...new Set(step.dependencies)];
    }
  }

  /**
   * 驗證組合結果
   */
  private validateCompositionResult(result: CompositionResult): void {
    const chain = result.composedChain;

    // 檢查步驟 ID 唯一性
    const stepIds = new Set<string>();
    for (const step of chain.steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`重複的步驟 ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // 檢查依賴關係有效性
    for (const step of chain.steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          throw new Error(`步驟 ${step.id} 依賴不存在的步驟 ${depId}`);
        }
      }
    }

    this.logger.debug("組合結果驗證通過");
  }

  /**
   * 估算組合鏈執行時間
   */
  private estimateComposedChainDuration(chain: ChainDefinition): number {
    // 簡化實現：基於步驟數量和類型估算
    let totalDuration = 0;

    for (const step of chain.steps) {
      const baseDuration = this.getStepBaseDuration(step.type);
      totalDuration += baseDuration;
    }

    return totalDuration;
  }

  /**
   * 獲取步驟基礎執行時間
   */
  private getStepBaseDuration(stepType: string): number {
    const durations: Record<string, number> = {
      tool_call: 2000,
      mcp_tool: 3000,
      llm_generation: 5000,
      data_transform: 500,
      condition: 100,
      parallel: 2000,
      aggregation: 800,
      custom: 2000,
    };

    return durations[stepType] || 2000;
  }
}
