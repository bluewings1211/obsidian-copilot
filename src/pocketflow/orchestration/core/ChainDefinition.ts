/**
 * 工具鏈定義
 *
 * 定義工具鏈的結構、步驟、依賴關係和配置：
 * - 步驟定義和參數
 * - 依賴關係聲明
 * - 數據流定義
 * - 條件和循環邏輯
 * - 錯誤處理策略
 */

/**
 * 步驟類型
 */
export type StepType =
  | "tool_call" // 工具調用
  | "mcp_tool" // MCP 工具
  | "llm_generation" // LLM 生成
  | "data_transform" // 數據轉換
  | "condition" // 條件判斷
  | "loop" // 循環執行
  | "parallel" // 並行執行
  | "sequential" // 順序執行
  | "aggregation" // 數據聚合
  | "validation" // 數據驗證
  | "custom"; // 自定義步驟

/**
 * 數據類型
 */
export type DataType =
  | "text"
  | "json"
  | "array"
  | "object"
  | "number"
  | "boolean"
  | "file"
  | "image"
  | "any";

/**
 * 條件操作符
 */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "exists"
  | "not_exists"
  | "custom";

/**
 * 步驟輸入定義
 */
export interface StepInput {
  /** 輸入名稱 */
  name: string;
  /** 數據類型 */
  type: DataType;
  /** 是否必需 */
  required: boolean;
  /** 默認值 */
  defaultValue?: any;
  /** 數據源（來自哪個步驟的輸出） */
  source?: {
    stepId: string;
    outputName: string;
  };
  /** 數據轉換函數 */
  transformer?: string;
  /** 驗證規則 */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    customValidator?: string;
  };
}

/**
 * 步驟輸出定義
 */
export interface StepOutput {
  /** 輸出名稱 */
  name: string;
  /** 數據類型 */
  type: DataType;
  /** 描述 */
  description?: string;
  /** 是否緩存 */
  cacheable?: boolean;
  /** 緩存 TTL（秒） */
  cacheTtl?: number;
}

/**
 * 條件定義
 */
export interface ConditionDefinition {
  /** 條件 ID */
  id: string;
  /** 左操作數 */
  left: {
    type: "input" | "output" | "constant" | "variable";
    value: string;
  };
  /** 操作符 */
  operator: ConditionOperator;
  /** 右操作數 */
  right: {
    type: "input" | "output" | "constant" | "variable";
    value: any;
  };
  /** 自定義條件函數 */
  customFunction?: string;
}

/**
 * 循環定義
 */
export interface LoopDefinition {
  /** 循環類型 */
  type: "for" | "while" | "foreach";
  /** 循環條件或範圍 */
  condition?: ConditionDefinition;
  /** 迭代數據源 */
  iterable?: {
    stepId: string;
    outputName: string;
  };
  /** 最大迭代次數 */
  maxIterations?: number;
  /** 循環變量名 */
  variable?: string;
}

/**
 * 錯誤處理策略
 */
export interface ErrorHandlingStrategy {
  /** 策略類型 */
  type: "ignore" | "retry" | "fallback" | "abort" | "custom";
  /** 重試次數 */
  retryCount?: number;
  /** 重試延遲（毫秒） */
  retryDelay?: number;
  /** 回退步驟 ID */
  fallbackStepId?: string;
  /** 自定義錯誤處理函數 */
  customHandler?: string;
  /** 錯誤類型過濾器 */
  errorFilter?: string[];
}

/**
 * 步驟定義
 */
export interface StepDefinition {
  /** 步驟 ID */
  id: string;
  /** 步驟名稱 */
  name: string;
  /** 步驟類型 */
  type: StepType;
  /** 描述 */
  description?: string;

  /** 輸入定義 */
  inputs: StepInput[];
  /** 輸出定義 */
  outputs: StepOutput[];

  /** 步驟配置 */
  config: {
    /** 工具名稱（對於工具調用類型） */
    toolName?: string;
    /** MCP 服務器 ID（對於 MCP 工具類型） */
    mcpServerId?: string;
    /** LLM 提示（對於 LLM 生成類型） */
    prompt?: string;
    /** 轉換函數（對於數據轉換類型） */
    transformFunction?: string;
    /** 自定義參數 */
    parameters?: Record<string, any>;
  };

  /** 依賴步驟 ID 列表 */
  dependencies: string[];

  /** 條件執行 */
  condition?: ConditionDefinition;

  /** 循環執行 */
  loop?: LoopDefinition;

  /** 並行執行配置 */
  parallel?: {
    /** 最大並行度 */
    maxConcurrency?: number;
    /** 分批大小 */
    batchSize?: number;
  };

  /** 超時時間（毫秒） */
  timeout?: number;

  /** 錯誤處理 */
  errorHandling?: ErrorHandlingStrategy;

  /** 是否可選（失敗時繼續執行） */
  optional?: boolean;

  /** 元數據 */
  metadata?: Record<string, any>;
}

/**
 * 數據流定義
 */
export interface DataFlowDefinition {
  /** 源步驟 ID */
  fromStepId: string;
  /** 源輸出名稱 */
  fromOutput: string;
  /** 目標步驟 ID */
  toStepId: string;
  /** 目標輸入名稱 */
  toInput: string;
  /** 數據轉換器 */
  transformer?: string;
  /** 條件過濾器 */
  condition?: ConditionDefinition;
}

/**
 * 工具鏈定義
 */
export interface ChainDefinition {
  /** 工具鏈 ID */
  id: string;
  /** 工具鏈名稱 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;

  /** 步驟列表 */
  steps: StepDefinition[];

  /** 數據流定義 */
  dataFlows: DataFlowDefinition[];

  /** 全局配置 */
  config: {
    /** 默認超時時間 */
    defaultTimeout?: number;
    /** 最大並行度 */
    maxConcurrency?: number;
    /** 啟用緩存 */
    enableCaching?: boolean;
    /** 錯誤處理策略 */
    defaultErrorHandling?: ErrorHandlingStrategy;
  };

  /** 輸入參數定義 */
  inputs: Array<{
    name: string;
    type: DataType;
    required: boolean;
    defaultValue?: any;
    description?: string;
  }>;

  /** 輸出定義 */
  outputs: Array<{
    name: string;
    type: DataType;
    description?: string;
    source: {
      stepId: string;
      outputName: string;
    };
  }>;

  /** 標籤 */
  tags?: string[];

  /** 創建時間 */
  createdAt?: Date;
  /** 更新時間 */
  updatedAt?: Date;
  /** 創建者 */
  author?: string;

  /** 元數據 */
  metadata?: Record<string, any>;
}

/**
 * 工具鏈定義構建器
 */
export class ChainDefinitionBuilder {
  private definition: Partial<ChainDefinition> = {
    steps: [],
    dataFlows: [],
    inputs: [],
    outputs: [],
    config: {},
  };

  /**
   * 設置基本信息
   */
  setBasicInfo(id: string, name: string, version: string, description?: string): this {
    this.definition.id = id;
    this.definition.name = name;
    this.definition.version = version;
    this.definition.description = description;
    this.definition.createdAt = new Date();
    return this;
  }

  /**
   * 添加步驟
   */
  addStep(step: StepDefinition): this {
    this.definition.steps!.push(step);
    return this;
  }

  /**
   * 添加數據流
   */
  addDataFlow(flow: DataFlowDefinition): this {
    this.definition.dataFlows!.push(flow);
    return this;
  }

  /**
   * 添加輸入參數
   */
  addInput(name: string, type: DataType, required: boolean = true, defaultValue?: any): this {
    this.definition.inputs!.push({
      name,
      type,
      required,
      defaultValue,
    });
    return this;
  }

  /**
   * 添加輸出
   */
  addOutput(name: string, type: DataType, stepId: string, outputName: string): this {
    this.definition.outputs!.push({
      name,
      type,
      source: { stepId, outputName },
    });
    return this;
  }

  /**
   * 設置配置
   */
  setConfig(config: ChainDefinition["config"]): this {
    this.definition.config = { ...this.definition.config, ...config };
    return this;
  }

  /**
   * 添加標籤
   */
  addTags(...tags: string[]): this {
    this.definition.tags = [...(this.definition.tags || []), ...tags];
    return this;
  }

  /**
   * 構建定義
   */
  build(): ChainDefinition {
    if (!this.definition.id || !this.definition.name || !this.definition.version) {
      throw new Error("工具鏈定義缺少必需的基本信息");
    }

    return this.definition as ChainDefinition;
  }

  /**
   * 從 JSON 加載
   */
  static fromJSON(json: string): ChainDefinition {
    const data = JSON.parse(json);

    // 轉換日期字段
    if (data.createdAt) data.createdAt = new Date(data.createdAt);
    if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);

    return data as ChainDefinition;
  }

  /**
   * 轉換為 JSON
   */
  static toJSON(definition: ChainDefinition): string {
    return JSON.stringify(definition, null, 2);
  }

  /**
   * 驗證定義
   */
  static validate(definition: ChainDefinition): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 驗證基本信息
    if (!definition.id) errors.push("工具鏈 ID 不能為空");
    if (!definition.name) errors.push("工具鏈名稱不能為空");
    if (!definition.version) errors.push("工具鏈版本不能為空");

    // 驗證步驟
    if (!definition.steps || definition.steps.length === 0) {
      errors.push("工具鏈必須包含至少一個步驟");
    } else {
      const stepIds = new Set<string>();
      for (const step of definition.steps) {
        if (!step.id) {
          errors.push("步驟 ID 不能為空");
        } else if (stepIds.has(step.id)) {
          errors.push(`重複的步驟 ID: ${step.id}`);
        } else {
          stepIds.add(step.id);
        }

        if (!step.type) {
          errors.push(`步驟 ${step.id} 的類型不能為空`);
        }

        // 驗證依賴關係
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId)) {
            errors.push(`步驟 ${step.id} 依賴的步驟 ${depId} 不存在`);
          }
        }
      }
    }

    // 驗證數據流
    if (definition.dataFlows) {
      const stepIds = new Set(definition.steps.map((s) => s.id));
      for (const flow of definition.dataFlows) {
        if (!stepIds.has(flow.fromStepId)) {
          errors.push(`數據流源步驟 ${flow.fromStepId} 不存在`);
        }
        if (!stepIds.has(flow.toStepId)) {
          errors.push(`數據流目標步驟 ${flow.toStepId} 不存在`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
