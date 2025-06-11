/**
 * 執行計劃
 *
 * 基於工具鏈定義和依賴圖生成可執行的計劃：
 * - 步驟調度順序
 * - 並行執行組織
 * - 資源分配策略
 * - 優化建議
 */

import { ChainDefinition, StepDefinition } from "./ChainDefinition";
import { createLogger } from "../../utils/logger";

/**
 * 執行階段
 */
export interface ExecutionPhase {
  /** 階段 ID */
  id: string;
  /** 階段名稱 */
  name: string;
  /** 階段中的步驟 */
  steps: StepDefinition[];
  /** 是否並行執行 */
  isParallel: boolean;
  /** 預估執行時間（毫秒） */
  estimatedDuration?: number;
  /** 所需資源 */
  requiredResources?: string[];
}

/**
 * 關鍵路徑信息
 */
export interface CriticalPath {
  /** 路徑上的步驟 ID */
  stepIds: string[];
  /** 總預估時間 */
  totalDuration: number;
  /** 路徑描述 */
  description: string;
}

/**
 * 優化建議
 */
export interface OptimizationSuggestion {
  /** 建議類型 */
  type: "parallelization" | "caching" | "resource_allocation" | "step_ordering";
  /** 建議描述 */
  description: string;
  /** 預期效益 */
  expectedBenefit: {
    timeReduction?: number;
    resourceSaving?: number;
    reliabilityImprovement?: number;
  };
  /** 實施複雜度 */
  complexity: "low" | "medium" | "high";
  /** 相關步驟 */
  affectedSteps: string[];
}

/**
 * 依賴圖節點
 */
export interface DependencyNode {
  /** 步驟 ID */
  stepId: string;
  /** 步驟定義 */
  step: StepDefinition;
  /** 依賴的節點 */
  dependencies: DependencyNode[];
  /** 被依賴的節點 */
  dependents: DependencyNode[];
  /** 執行層級 */
  level: number;
  /** 是否在關鍵路徑上 */
  isOnCriticalPath: boolean;
}

/**
 * 執行計劃
 */
export class ExecutionPlan {
  private logger = createLogger("ExecutionPlan");
  private chainDefinition: ChainDefinition;
  private dependencyGraph: Map<string, DependencyNode>;
  private phases: ExecutionPhase[] = [];
  private criticalPath: CriticalPath | null = null;
  private optimizationSuggestions: OptimizationSuggestion[] = [];

  constructor(dependencyGraph: Map<string, DependencyNode>, chainDefinition: ChainDefinition) {
    this.dependencyGraph = dependencyGraph;
    this.chainDefinition = chainDefinition;

    this.generateExecutionPhases();
    this.identifyCriticalPath();
    this.generateOptimizationSuggestions();
  }

  /**
   * 獲取執行階段
   */
  getPhases(): ExecutionPhase[] {
    return [...this.phases];
  }

  /**
   * 獲取所有步驟
   */
  getSteps(): StepDefinition[] {
    return this.chainDefinition.steps;
  }

  /**
   * 獲取關鍵路徑
   */
  getCriticalPath(): CriticalPath | null {
    return this.criticalPath;
  }

  /**
   * 獲取優化建議
   */
  getOptimizationSuggestions(): OptimizationSuggestion[] {
    return [...this.optimizationSuggestions];
  }

  /**
   * 獲取預估總執行時間
   */
  getEstimatedTotalDuration(): number {
    return this.phases.reduce((total, phase) => {
      return total + (phase.estimatedDuration || 0);
    }, 0);
  }

  /**
   * 獲取最大並行度
   */
  getMaxParallelism(): number {
    return Math.max(...this.phases.map((phase) => (phase.isParallel ? phase.steps.length : 1)));
  }

  /**
   * 檢查步驟是否可以並行執行
   */
  canExecuteInParallel(stepId1: string, stepId2: string): boolean {
    const node1 = this.dependencyGraph.get(stepId1);
    const node2 = this.dependencyGraph.get(stepId2);

    if (!node1 || !node2) return false;

    // 檢查是否有直接或間接依賴關係
    return (
      !this.hasDirectOrIndirectDependency(node1, node2) &&
      !this.hasDirectOrIndirectDependency(node2, node1)
    );
  }

  /**
   * 獲取步驟的前置條件
   */
  getStepPrerequisites(stepId: string): string[] {
    const node = this.dependencyGraph.get(stepId);
    return node ? node.dependencies.map((dep) => dep.stepId) : [];
  }

  /**
   * 獲取步驟的後續步驟
   */
  getStepDependents(stepId: string): string[] {
    const node = this.dependencyGraph.get(stepId);
    return node ? node.dependents.map((dep) => dep.stepId) : [];
  }

  /**
   * 驗證執行計劃
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 檢查是否有循環依賴
    if (this.hasCyclicDependencies()) {
      errors.push("檢測到循環依賴");
    }

    // 檢查所有步驟是否都在某個階段中
    const allStepsInPhases = new Set<string>();
    this.phases.forEach((phase) => {
      phase.steps.forEach((step) => allStepsInPhases.add(step.id));
    });

    const missingSteps = this.chainDefinition.steps.filter(
      (step) => !allStepsInPhases.has(step.id)
    );

    if (missingSteps.length > 0) {
      errors.push(`以下步驟未包含在任何執行階段中: ${missingSteps.map((s) => s.id).join(", ")}`);
    }

    // 檢查依賴關係是否滿足
    for (const phase of this.phases) {
      for (const step of phase.steps) {
        const prerequisites = this.getStepPrerequisites(step.id);
        for (const prerequisite of prerequisites) {
          if (!this.isStepExecutedBefore(prerequisite, step.id)) {
            errors.push(`步驟 ${step.id} 的前置條件 ${prerequisite} 未在之前的階段執行`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 生成執行階段
   */
  private generateExecutionPhases(): void {
    this.logger.debug("開始生成執行階段");

    // 按層級組織步驟
    const stepsByLevel = new Map<number, DependencyNode[]>();

    for (const node of this.dependencyGraph.values()) {
      const level = node.level;
      if (!stepsByLevel.has(level)) {
        stepsByLevel.set(level, []);
      }
      stepsByLevel.get(level)!.push(node);
    }

    // 為每個層級創建執行階段
    const sortedLevels = Array.from(stepsByLevel.keys()).sort((a, b) => a - b);

    for (let i = 0; i < sortedLevels.length; i++) {
      const level = sortedLevels[i];
      const nodes = stepsByLevel.get(level)!;

      const phase: ExecutionPhase = {
        id: `phase_${i + 1}`,
        name: `執行階段 ${i + 1}`,
        steps: nodes.map((node) => node.step),
        isParallel: nodes.length > 1,
        estimatedDuration: this.estimatePhaseDuration(nodes),
        requiredResources: this.identifyRequiredResources(nodes),
      };

      this.phases.push(phase);
    }

    this.logger.debug(`生成了 ${this.phases.length} 個執行階段`);
  }

  /**
   * 識別關鍵路徑
   */
  private identifyCriticalPath(): void {
    this.logger.debug("開始識別關鍵路徑");

    // 使用動態規劃找到最長路徑
    const longestPaths = new Map<string, { duration: number; path: string[] }>();

    // 拓撲排序的節點
    const sortedNodes = this.topologicalSort();

    for (const node of sortedNodes) {
      let maxDuration = 0;
      let bestPath: string[] = [];

      for (const dependency of node.dependencies) {
        const depPath = longestPaths.get(dependency.stepId);
        if (depPath && depPath.duration > maxDuration) {
          maxDuration = depPath.duration;
          bestPath = [...depPath.path];
        }
      }

      const stepDuration = this.estimateStepDuration(node.step);
      longestPaths.set(node.stepId, {
        duration: maxDuration + stepDuration,
        path: [...bestPath, node.stepId],
      });
    }

    // 找到總時間最長的路徑
    let criticalPath: { duration: number; path: string[] } | null = null;
    for (const pathInfo of longestPaths.values()) {
      if (!criticalPath || pathInfo.duration > criticalPath.duration) {
        criticalPath = pathInfo;
      }
    }

    if (criticalPath) {
      this.criticalPath = {
        stepIds: criticalPath.path,
        totalDuration: criticalPath.duration,
        description: `關鍵路徑包含 ${criticalPath.path.length} 個步驟，總時間 ${criticalPath.duration}ms`,
      };

      // 標記關鍵路徑上的節點
      for (const stepId of criticalPath.path) {
        const node = this.dependencyGraph.get(stepId);
        if (node) {
          node.isOnCriticalPath = true;
        }
      }
    }

    this.logger.debug("關鍵路徑識別完成", {
      criticalPath: this.criticalPath?.stepIds,
    });
  }

  /**
   * 生成優化建議
   */
  private generateOptimizationSuggestions(): void {
    this.logger.debug("開始生成優化建議");

    // 並行化建議
    this.generateParallelizationSuggestions();

    // 緩存建議
    this.generateCachingSuggestions();

    // 資源分配建議
    this.generateResourceAllocationSuggestions();

    // 步驟順序優化建議
    this.generateStepOrderingSuggestions();

    this.logger.debug(`生成了 ${this.optimizationSuggestions.length} 個優化建議`);
  }

  /**
   * 生成並行化建議
   */
  private generateParallelizationSuggestions(): void {
    // 查找可以並行執行但目前順序執行的步驟
    for (let i = 0; i < this.phases.length - 1; i++) {
      const currentPhase = this.phases[i];
      const nextPhase = this.phases[i + 1];

      if (
        !currentPhase.isParallel &&
        currentPhase.steps.length === 1 &&
        !nextPhase.isParallel &&
        nextPhase.steps.length === 1
      ) {
        const step1 = currentPhase.steps[0];
        const step2 = nextPhase.steps[0];

        if (this.canExecuteInParallel(step1.id, step2.id)) {
          this.optimizationSuggestions.push({
            type: "parallelization",
            description: `步驟 ${step1.id} 和 ${step2.id} 可以並行執行`,
            expectedBenefit: {
              timeReduction: Math.max(
                this.estimateStepDuration(step1),
                this.estimateStepDuration(step2)
              ),
            },
            complexity: "low",
            affectedSteps: [step1.id, step2.id],
          });
        }
      }
    }
  }

  /**
   * 生成緩存建議
   */
  private generateCachingSuggestions(): void {
    // 查找可能受益於緩存的步驟
    for (const step of this.chainDefinition.steps) {
      if (step.type === "tool_call" || step.type === "mcp_tool") {
        const dependents = this.getStepDependents(step.id);

        if (dependents.length > 1) {
          this.optimizationSuggestions.push({
            type: "caching",
            description: `步驟 ${step.id} 的結果被多個後續步驟使用，建議啟用緩存`,
            expectedBenefit: {
              timeReduction: this.estimateStepDuration(step) * (dependents.length - 1),
            },
            complexity: "low",
            affectedSteps: [step.id, ...dependents],
          });
        }
      }
    }
  }

  /**
   * 生成資源分配建議
   */
  private generateResourceAllocationSuggestions(): void {
    // 分析資源使用模式
    const resourceUsage = new Map<string, string[]>();

    for (const phase of this.phases) {
      if (phase.requiredResources) {
        for (const resource of phase.requiredResources) {
          if (!resourceUsage.has(resource)) {
            resourceUsage.set(resource, []);
          }
          resourceUsage.get(resource)!.push(phase.id);
        }
      }
    }

    // 查找資源衝突
    for (const [resource, phases] of resourceUsage.entries()) {
      if (phases.length > 1) {
        this.optimizationSuggestions.push({
          type: "resource_allocation",
          description: `資源 ${resource} 在多個階段中使用，可能需要優化分配`,
          expectedBenefit: {
            reliabilityImprovement: 0.1,
          },
          complexity: "medium",
          affectedSteps: phases,
        });
      }
    }
  }

  /**
   * 生成步驟順序優化建議
   */
  private generateStepOrderingSuggestions(): void {
    // 查找關鍵路徑上的瓶頸
    if (this.criticalPath) {
      for (const stepId of this.criticalPath.stepIds) {
        const step = this.chainDefinition.steps.find((s) => s.id === stepId);
        if (step && this.estimateStepDuration(step) > 5000) {
          // 超過 5 秒
          this.optimizationSuggestions.push({
            type: "step_ordering",
            description: `關鍵路徑上的步驟 ${stepId} 執行時間較長，建議優化或移到並行分支`,
            expectedBenefit: {
              timeReduction: this.estimateStepDuration(step) * 0.3,
            },
            complexity: "high",
            affectedSteps: [stepId],
          });
        }
      }
    }
  }

  /**
   * 估算階段執行時間
   */
  private estimatePhaseDuration(nodes: DependencyNode[]): number {
    if (nodes.length === 0) return 0;

    if (nodes.length === 1) {
      return this.estimateStepDuration(nodes[0].step);
    }

    // 並行執行，取最長時間
    return Math.max(...nodes.map((node) => this.estimateStepDuration(node.step)));
  }

  /**
   * 估算步驟執行時間
   */
  private estimateStepDuration(step: StepDefinition): number {
    // 基於步驟類型的基礎估算
    const baseDurations: Record<string, number> = {
      tool_call: 2000,
      mcp_tool: 3000,
      llm_generation: 5000,
      data_transform: 500,
      condition: 100,
      loop: 1000,
      parallel: 2000,
      sequential: 1000,
      aggregation: 800,
      validation: 300,
      custom: 2000,
    };

    let duration = baseDurations[step.type] || 2000;

    // 考慮配置的超時時間
    if (step.timeout) {
      duration = Math.min(duration, step.timeout);
    }

    return duration;
  }

  /**
   * 識別所需資源
   */
  private identifyRequiredResources(nodes: DependencyNode[]): string[] {
    const resources = new Set<string>();

    for (const node of nodes) {
      const step = node.step;

      if (step.type === "mcp_tool" && step.config.mcpServerId) {
        resources.add(`mcp_server:${step.config.mcpServerId}`);
      }

      if (step.type === "llm_generation") {
        resources.add("llm_service");
      }

      if (step.parallel?.maxConcurrency) {
        resources.add(`concurrency:${step.parallel.maxConcurrency}`);
      }
    }

    return Array.from(resources);
  }

  /**
   * 拓撲排序
   */
  private topologicalSort(): DependencyNode[] {
    const visited = new Set<string>();
    const result: DependencyNode[] = [];

    const visit = (node: DependencyNode) => {
      if (visited.has(node.stepId)) return;

      visited.add(node.stepId);

      for (const dependency of node.dependencies) {
        visit(dependency);
      }

      result.push(node);
    };

    for (const node of this.dependencyGraph.values()) {
      visit(node);
    }

    return result;
  }

  /**
   * 檢查是否有循環依賴
   */
  private hasCyclicDependencies(): boolean {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visiting.add(nodeId);

      const node = this.dependencyGraph.get(nodeId);
      if (node) {
        for (const dependency of node.dependencies) {
          if (hasCycle(dependency.stepId)) {
            return true;
          }
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);

      return false;
    };

    for (const nodeId of this.dependencyGraph.keys()) {
      if (hasCycle(nodeId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 檢查步驟是否有直接或間接依賴關係
   */
  private hasDirectOrIndirectDependency(node1: DependencyNode, node2: DependencyNode): boolean {
    const visited = new Set<string>();

    const checkDependency = (current: DependencyNode, target: DependencyNode): boolean => {
      if (visited.has(current.stepId)) return false;
      visited.add(current.stepId);

      if (current.stepId === target.stepId) return true;

      for (const dependency of current.dependencies) {
        if (checkDependency(dependency, target)) {
          return true;
        }
      }

      return false;
    };

    return checkDependency(node1, node2);
  }

  /**
   * 檢查步驟是否在指定步驟之前執行
   */
  private isStepExecutedBefore(prerequisiteId: string, stepId: string): boolean {
    const prerequisitePhase = this.phases.findIndex((phase) =>
      phase.steps.some((step) => step.id === prerequisiteId)
    );

    const stepPhase = this.phases.findIndex((phase) =>
      phase.steps.some((step) => step.id === stepId)
    );

    return prerequisitePhase >= 0 && stepPhase >= 0 && prerequisitePhase < stepPhase;
  }
}
