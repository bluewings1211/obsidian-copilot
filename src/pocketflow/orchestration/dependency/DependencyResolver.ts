/**
 * 依賴關係解析器
 *
 * 分析和解析工具鏈中步驟間的依賴關係：
 * - 構建依賴圖
 * - 檢測循環依賴
 * - 計算執行層級
 * - 優化依賴結構
 */

import { ChainDefinition, StepDefinition } from "../core/ChainDefinition";
import { DependencyNode } from "../core/ExecutionPlan";
import { createLogger } from "../../utils/logger";

/**
 * 依賴關係類型
 */
export type DependencyType =
  | "data" // 數據依賴
  | "control" // 控制依賴
  | "resource" // 資源依賴
  | "temporal"; // 時序依賴

/**
 * 依賴關係
 */
export interface Dependency {
  /** 依賴類型 */
  type: DependencyType;
  /** 源步驟 ID */
  fromStepId: string;
  /** 目標步驟 ID */
  toStepId: string;
  /** 依賴描述 */
  description?: string;
  /** 是否為強依賴 */
  isStrong: boolean;
  /** 條件依賴 */
  condition?: string;
  /** 權重（用於優化） */
  weight?: number;
}

/**
 * 循環依賴信息
 */
export interface CyclicDependency {
  /** 循環中的步驟 ID 列表 */
  stepIds: string[];
  /** 循環路徑描述 */
  path: string;
  /** 循環類型 */
  type: "direct" | "indirect";
  /** 建議的解決方案 */
  suggestions: string[];
}

/**
 * 依賴分析結果
 */
export interface DependencyAnalysis {
  /** 依賴圖 */
  dependencyGraph: Map<string, DependencyNode>;
  /** 所有依賴關係 */
  dependencies: Dependency[];
  /** 檢測到的循環依賴 */
  cyclicDependencies: CyclicDependency[];
  /** 根節點（無依賴的步驟） */
  rootNodes: string[];
  /** 葉節點（無後續步驟的步驟） */
  leafNodes: string[];
  /** 最大深度 */
  maxDepth: number;
  /** 統計信息 */
  statistics: {
    totalSteps: number;
    totalDependencies: number;
    strongDependencies: number;
    weakDependencies: number;
    averageFanOut: number;
    averageFanIn: number;
  };
}

/**
 * 依賴解析器配置
 */
export interface DependencyResolverConfig {
  /** 檢測循環依賴 */
  detectCycles: boolean;
  /** 自動解決循環依賴 */
  autoResolveCycles: boolean;
  /** 優化依賴結構 */
  optimizeDependencies: boolean;
  /** 最大依賴深度 */
  maxDepth: number;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 依賴關係解析器
 */
export class DependencyResolver {
  private config: DependencyResolverConfig;
  private logger = createLogger("DependencyResolver");

  constructor(config: Partial<DependencyResolverConfig> = {}) {
    this.config = {
      detectCycles: true,
      autoResolveCycles: false,
      optimizeDependencies: true,
      maxDepth: 20,
      debug: false,
      ...config,
    };
  }

  /**
   * 解析工具鏈的依賴關係
   */
  async resolve(chainDefinition: ChainDefinition): Promise<Map<string, DependencyNode>> {
    this.logger.debug(`開始解析依賴關係: ${chainDefinition.name}`);

    try {
      // 1. 分析依賴關係
      const analysis = await this.analyzeDependencies(chainDefinition);

      // 2. 檢測循環依賴
      if (this.config.detectCycles && analysis.cyclicDependencies.length > 0) {
        this.logger.warn(`檢測到 ${analysis.cyclicDependencies.length} 個循環依賴`);

        if (this.config.autoResolveCycles) {
          await this.resolveCyclicDependencies(analysis);
        } else {
          const cycleDescriptions = analysis.cyclicDependencies.map((cycle) => cycle.path);
          throw new Error(`檢測到循環依賴: ${cycleDescriptions.join(", ")}`);
        }
      }

      // 3. 優化依賴結構
      if (this.config.optimizeDependencies) {
        await this.optimizeDependencies(analysis);
      }

      // 4. 驗證結果
      this.validateDependencyGraph(analysis.dependencyGraph);

      this.logger.debug("依賴關係解析完成", {
        totalSteps: analysis.statistics.totalSteps,
        totalDependencies: analysis.statistics.totalDependencies,
        maxDepth: analysis.maxDepth,
      });

      return analysis.dependencyGraph;
    } catch (error) {
      this.logger.error("依賴關係解析失敗", error);
      throw error;
    }
  }

  /**
   * 分析依賴關係
   */
  private async analyzeDependencies(chainDefinition: ChainDefinition): Promise<DependencyAnalysis> {
    const steps = chainDefinition.steps;

    // 創建依賴圖節點
    const dependencyGraph = new Map<string, DependencyNode>();

    // 初始化節點
    for (const step of steps) {
      const node: DependencyNode = {
        stepId: step.id,
        step,
        dependencies: [],
        dependents: [],
        level: 0,
        isOnCriticalPath: false,
      };
      dependencyGraph.set(step.id, node);
    }

    // 分析依賴關係
    const dependencies: Dependency[] = [];

    for (const step of steps) {
      const node = dependencyGraph.get(step.id)!;

      // 1. 顯式依賴（從步驟定義中的 dependencies 字段）
      for (const depId of step.dependencies) {
        const depNode = dependencyGraph.get(depId);
        if (depNode) {
          node.dependencies.push(depNode);
          depNode.dependents.push(node);

          dependencies.push({
            type: "control",
            fromStepId: depId,
            toStepId: step.id,
            isStrong: true,
            description: `${step.id} 依賴於 ${depId}`,
          });
        }
      }

      // 2. 數據流依賴（從數據流定義中推導）
      if (chainDefinition.dataFlows) {
        for (const dataFlow of chainDefinition.dataFlows) {
          if (dataFlow.toStepId === step.id) {
            const sourceNode = dependencyGraph.get(dataFlow.fromStepId);
            if (sourceNode && !node.dependencies.includes(sourceNode)) {
              node.dependencies.push(sourceNode);
              sourceNode.dependents.push(node);

              dependencies.push({
                type: "data",
                fromStepId: dataFlow.fromStepId,
                toStepId: step.id,
                isStrong: true,
                description: `${step.id} 需要 ${dataFlow.fromStepId} 的數據`,
              });
            }
          }
        }
      }

      // 3. 資源依賴（相同 MCP 服務器或工具）
      for (const otherStep of steps) {
        if (otherStep.id !== step.id && this.hasResourceConflict(step, otherStep)) {
          const otherNode = dependencyGraph.get(otherStep.id);
          if (otherNode && !node.dependencies.includes(otherNode)) {
            dependencies.push({
              type: "resource",
              fromStepId: otherStep.id,
              toStepId: step.id,
              isStrong: false,
              description: `${step.id} 與 ${otherStep.id} 有資源衝突`,
            });
          }
        }
      }
    }

    // 計算執行層級
    this.calculateExecutionLevels(dependencyGraph);

    // 檢測循環依賴
    const cyclicDependencies = this.config.detectCycles
      ? this.detectCyclicDependencies(dependencyGraph)
      : [];

    // 計算統計信息
    const statistics = this.calculateStatistics(dependencyGraph, dependencies);

    // 找出根節點和葉節點
    const rootNodes = Array.from(dependencyGraph.values())
      .filter((node) => node.dependencies.length === 0)
      .map((node) => node.stepId);

    const leafNodes = Array.from(dependencyGraph.values())
      .filter((node) => node.dependents.length === 0)
      .map((node) => node.stepId);

    const maxDepth = Math.max(...Array.from(dependencyGraph.values()).map((node) => node.level));

    return {
      dependencyGraph,
      dependencies,
      cyclicDependencies,
      rootNodes,
      leafNodes,
      maxDepth,
      statistics,
    };
  }

  /**
   * 計算執行層級
   */
  private calculateExecutionLevels(dependencyGraph: Map<string, DependencyNode>): void {
    const visited = new Set<string>();

    const calculateLevel = (node: DependencyNode): number => {
      if (visited.has(node.stepId)) {
        return node.level;
      }

      visited.add(node.stepId);

      if (node.dependencies.length === 0) {
        node.level = 0;
        return 0;
      }

      let maxLevel = 0;
      for (const dependency of node.dependencies) {
        const depLevel = calculateLevel(dependency);
        maxLevel = Math.max(maxLevel, depLevel + 1);
      }

      node.level = maxLevel;
      return maxLevel;
    };

    for (const node of dependencyGraph.values()) {
      if (!visited.has(node.stepId)) {
        calculateLevel(node);
      }
    }
  }

  /**
   * 檢測循環依賴
   */
  private detectCyclicDependencies(
    dependencyGraph: Map<string, DependencyNode>
  ): CyclicDependency[] {
    const cycles: CyclicDependency[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const detectCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) {
        // 找到循環
        const cycleStart = path.indexOf(nodeId);
        const cycleSteps = path.slice(cycleStart);
        cycleSteps.push(nodeId); // 完成循環

        cycles.push({
          stepIds: cycleSteps,
          path: cycleSteps.join(" → "),
          type: cycleSteps.length === 2 ? "direct" : "indirect",
          suggestions: this.generateCycleResolutionSuggestions(cycleSteps),
        });

        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visiting.add(nodeId);
      path.push(nodeId);

      const node = dependencyGraph.get(nodeId);
      if (node) {
        for (const dependency of node.dependencies) {
          if (detectCycle(dependency.stepId)) {
            return true;
          }
        }
      }

      visiting.delete(nodeId);
      path.pop();
      visited.add(nodeId);

      return false;
    };

    for (const nodeId of dependencyGraph.keys()) {
      if (!visited.has(nodeId)) {
        detectCycle(nodeId);
      }
    }

    return cycles;
  }

  /**
   * 生成循環依賴解決建議
   */
  private generateCycleResolutionSuggestions(cycleSteps: string[]): string[] {
    const suggestions: string[] = [];

    if (cycleSteps.length === 2) {
      suggestions.push(`考慮將 ${cycleSteps[0]} 和 ${cycleSteps[1]} 合併為一個步驟`);
      suggestions.push(`檢查是否可以移除其中一個依賴關係`);
    } else {
      suggestions.push(`考慮引入中間緩存步驟來打破循環`);
      suggestions.push(`檢查是否可以重新組織步驟順序`);
      suggestions.push(`考慮將循環中的某個步驟拆分為多個子步驟`);
    }

    return suggestions;
  }

  /**
   * 解決循環依賴
   */
  private async resolveCyclicDependencies(analysis: DependencyAnalysis): Promise<void> {
    this.logger.info(`嘗試自動解決 ${analysis.cyclicDependencies.length} 個循環依賴`);

    for (const cycle of analysis.cyclicDependencies) {
      try {
        await this.resolveSingleCycle(cycle, analysis);
        this.logger.info(`成功解決循環依賴: ${cycle.path}`);
      } catch (error) {
        this.logger.warn(`無法自動解決循環依賴: ${cycle.path}`, error);
        throw new Error(`無法解決循環依賴: ${cycle.path}`);
      }
    }
  }

  /**
   * 解決單個循環依賴
   */
  private async resolveSingleCycle(
    cycle: CyclicDependency,
    analysis: DependencyAnalysis
  ): Promise<void> {
    // 簡單策略：移除循環中權重最小的依賴
    const dependencyGraph = analysis.dependencyGraph;

    // 找到循環中的最弱依賴
    let weakestDep: { from: string; to: string; weight: number } | null = null;

    for (let i = 0; i < cycle.stepIds.length - 1; i++) {
      const fromId = cycle.stepIds[i];
      const toId = cycle.stepIds[i + 1];

      const dependency = analysis.dependencies.find(
        (dep) => dep.fromStepId === fromId && dep.toStepId === toId
      );

      if (dependency && !dependency.isStrong) {
        const weight = dependency.weight || 1;
        if (!weakestDep || weight < weakestDep.weight) {
          weakestDep = { from: fromId, to: toId, weight };
        }
      }
    }

    if (weakestDep) {
      // 移除依賴關係
      const fromNode = dependencyGraph.get(weakestDep.from);
      const toNode = dependencyGraph.get(weakestDep.to);

      if (fromNode && toNode) {
        fromNode.dependents = fromNode.dependents.filter((n) => n.stepId !== toNode.stepId);
        toNode.dependencies = toNode.dependencies.filter((n) => n.stepId !== fromNode.stepId);

        // 從依賴列表中移除
        const depIndex = analysis.dependencies.findIndex(
          (dep) => dep.fromStepId === weakestDep!.from && dep.toStepId === weakestDep!.to
        );
        if (depIndex >= 0) {
          analysis.dependencies.splice(depIndex, 1);
        }
      }
    } else {
      throw new Error(`無法找到可移除的弱依賴來解決循環: ${cycle.path}`);
    }
  }

  /**
   * 優化依賴結構
   */
  private async optimizeDependencies(analysis: DependencyAnalysis): Promise<void> {
    this.logger.debug("開始優化依賴結構");

    // 1. 移除冗餘依賴
    this.removeRedundantDependencies(analysis);

    // 2. 優化資源依賴
    this.optimizeResourceDependencies(analysis);

    // 3. 重新計算層級
    this.calculateExecutionLevels(analysis.dependencyGraph);

    this.logger.debug("依賴結構優化完成");
  }

  /**
   * 移除冗餘依賴
   */
  private removeRedundantDependencies(analysis: DependencyAnalysis): void {
    const dependencyGraph = analysis.dependencyGraph;

    for (const node of dependencyGraph.values()) {
      // 檢查傳遞依賴
      const indirectDeps = new Set<string>();

      // 收集間接依賴
      for (const directDep of node.dependencies) {
        this.collectTransitiveDependencies(directDep, indirectDeps);
      }

      // 移除冗餘的直接依賴
      node.dependencies = node.dependencies.filter((dep) => {
        return !indirectDeps.has(dep.stepId);
      });
    }
  }

  /**
   * 收集傳遞依賴
   */
  private collectTransitiveDependencies(node: DependencyNode, collected: Set<string>): void {
    for (const dep of node.dependencies) {
      if (!collected.has(dep.stepId)) {
        collected.add(dep.stepId);
        this.collectTransitiveDependencies(dep, collected);
      }
    }
  }

  /**
   * 優化資源依賴
   */
  private optimizeResourceDependencies(analysis: DependencyAnalysis): void {
    // 將資源依賴轉換為更鬆散的約束
    const resourceDeps = analysis.dependencies.filter((dep) => dep.type === "resource");

    for (const dep of resourceDeps) {
      dep.isStrong = false;
      dep.weight = 0.1; // 低權重
    }
  }

  /**
   * 檢查是否有資源衝突
   */
  private hasResourceConflict(step1: StepDefinition, step2: StepDefinition): boolean {
    // 檢查 MCP 服務器衝突
    if (step1.type === "mcp_tool" && step2.type === "mcp_tool") {
      return step1.config.mcpServerId === step2.config.mcpServerId;
    }

    // 檢查工具名稱衝突
    if (step1.config.toolName && step2.config.toolName) {
      return step1.config.toolName === step2.config.toolName;
    }

    return false;
  }

  /**
   * 計算統計信息
   */
  private calculateStatistics(
    dependencyGraph: Map<string, DependencyNode>,
    dependencies: Dependency[]
  ) {
    const totalSteps = dependencyGraph.size;
    const totalDependencies = dependencies.length;
    const strongDependencies = dependencies.filter((dep) => dep.isStrong).length;
    const weakDependencies = totalDependencies - strongDependencies;

    let totalFanOut = 0;
    let totalFanIn = 0;

    for (const node of dependencyGraph.values()) {
      totalFanOut += node.dependents.length;
      totalFanIn += node.dependencies.length;
    }

    return {
      totalSteps,
      totalDependencies,
      strongDependencies,
      weakDependencies,
      averageFanOut: totalFanOut / totalSteps,
      averageFanIn: totalFanIn / totalSteps,
    };
  }

  /**
   * 驗證依賴圖
   */
  private validateDependencyGraph(dependencyGraph: Map<string, DependencyNode>): void {
    // 檢查最大深度
    const maxLevel = Math.max(...Array.from(dependencyGraph.values()).map((node) => node.level));
    if (maxLevel > this.config.maxDepth) {
      throw new Error(`依賴深度 ${maxLevel} 超過最大限制 ${this.config.maxDepth}`);
    }

    // 檢查是否有孤立節點
    const isolatedNodes = Array.from(dependencyGraph.values()).filter(
      (node) => node.dependencies.length === 0 && node.dependents.length === 0
    );

    if (isolatedNodes.length > 0) {
      this.logger.warn(`發現 ${isolatedNodes.length} 個孤立節點`, {
        isolatedNodes: isolatedNodes.map((node) => node.stepId),
      });
    }

    this.logger.debug("依賴圖驗證通過");
  }
}
