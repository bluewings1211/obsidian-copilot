/**
 * PocketFlow 工具鏈編排和組合系統
 *
 * 完整的工具鏈編排解決方案，包括：
 * - 核心編排組件
 * - 依賴管理系統
 * - 動態組合機制
 * - 數據流處理
 */

// 核心編排組件
export { ToolChainOrchestrator } from "./core/ToolChainOrchestrator";
export type {
  OrchestratorConfig,
  ExecutionContext,
  OrchestrationResult,
  OrchestratorEvents,
} from "./core/ToolChainOrchestrator";

export {
  ChainDefinitionBuilder,
  type ChainDefinition,
  type StepDefinition,
  type DataFlowDefinition,
  type StepType,
  type DataType,
  type ConditionDefinition,
  type LoopDefinition,
  type ErrorHandlingStrategy,
} from "./core/ChainDefinition";

export { ExecutionPlan } from "./core/ExecutionPlan";
export type {
  ExecutionPhase,
  CriticalPath,
  OptimizationSuggestion,
  DependencyNode,
} from "./core/ExecutionPlan";

export { DataFlowManager } from "./core/DataFlowManager";
export type {
  DataFlowContext,
  DataTransformer,
  DataValidator,
  DataAggregator,
  ValidationResult,
  DataFlowEvents,
} from "./core/DataFlowManager";

// 依賴管理系統
export { DependencyResolver } from "./dependency/DependencyResolver";
export type {
  Dependency,
  DependencyType,
  CyclicDependency,
  DependencyAnalysis,
  DependencyResolverConfig,
} from "./dependency/DependencyResolver";

// 動態組合機制
export { ChainComposer } from "./composition/ChainComposer";
export type {
  CompositionStrategy,
  CompositionConfig,
  CompositionResult,
  ChainComposerConfig,
} from "./composition/ChainComposer";

export { TemplateManager } from "./composition/TemplateManager";
export type {
  ChainTemplate,
  TemplateParameter,
  TemplateInstantiationResult,
  TemplateManagerConfig,
} from "./composition/TemplateManager";

export { ConditionalExecutor } from "./composition/ConditionalExecutor";
export type {
  ConditionResult,
  ConditionContext,
  ConditionFunction,
  ConditionalExecutorConfig,
} from "./composition/ConditionalExecutor";

export { LoopManager } from "./composition/LoopManager";
export type {
  LoopResult,
  IterationResult,
  LoopContext,
  LoopExecutor,
  LoopManagerConfig,
} from "./composition/LoopManager";

// 數據流處理
export { DataPipeline } from "./dataflow/DataPipeline";
export type {
  PipelineStage,
  PipelineConfig,
  PipelineStats,
  PipelineEvents,
} from "./dataflow/DataPipeline";

/**
 * 創建完整的工具鏈編排系統
 */
/* 暫時註釋，解決編譯問題
export function createOrchestrationSystem(config: {
  orchestrator?: Partial<OrchestratorConfig>;
  chainComposer?: Partial<ChainComposerConfig>;
  templateManager?: Partial<TemplateManagerConfig>;
  dependencyResolver?: Partial<DependencyResolverConfig>;
  toolSelectionAgent: import("../agents/ToolSelectionAgent").ToolSelectionAgent;
  mcpManager: import("../mcp-enhanced/EnhancedMcpManager").EnhancedMcpManager;
}) {
  // 函數實現...
}

export type OrchestrationSystem = ReturnType<typeof createOrchestrationSystem>;
*/

/**
 * 預定義的工具鏈模板類別
 */
export const PREDEFINED_TEMPLATE_CATEGORIES = {
  RESEARCH: "research",
  CONTENT: "content",
  ANALYSIS: "analysis",
  AUTOMATION: "automation",
  WORKFLOW: "workflow",
  INTEGRATION: "integration",
} as const;

/**
 * 常用的組合策略
 */
export const COMPOSITION_STRATEGIES = {
  SEQUENTIAL: "sequential",
  PARALLEL: "parallel",
  CONDITIONAL: "conditional",
  PIPELINE: "pipeline",
  BRANCH: "branch",
  MERGE: "merge",
  NESTED: "nested",
} as const;

/**
 * 預定義的錯誤處理策略
 */
export const ERROR_HANDLING_STRATEGIES = {
  IGNORE: "ignore",
  RETRY: "retry",
  FALLBACK: "fallback",
  ABORT: "abort",
  CUSTOM: "custom",
} as const;
