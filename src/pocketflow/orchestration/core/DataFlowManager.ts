/**
 * 數據流管理器
 *
 * 管理工具鏈中步驟間的數據流：
 * - 數據傳遞和轉換
 * - 數據驗證和類型檢查
 * - 數據緩存和優化
 * - 流水線處理
 */

import { EventEmitter } from "events";
import { DataFlowDefinition, DataType } from "./ChainDefinition";
import { createLogger } from "../../utils/logger";

/**
 * 數據流上下文
 */
export interface DataFlowContext {
  /** 執行 ID */
  executionId: string;
  /** 步驟執行結果 */
  stepResults: Map<string, any>;
  /** 共享變量 */
  variables: Map<string, any>;
  /** 中間數據緩存 */
  intermediateCache: Map<string, any>;
  /** 數據流統計 */
  statistics: {
    totalTransfers: number;
    successfulTransfers: number;
    failedTransfers: number;
    totalDataSize: number;
  };
}

/**
 * 數據轉換器介面
 */
export interface DataTransformer {
  /** 轉換器名稱 */
  name: string;
  /** 轉換函數 */
  transform: (data: any, context: DataFlowContext) => Promise<any>;
  /** 支援的輸入類型 */
  supportedInputTypes: DataType[];
  /** 輸出類型 */
  outputType: DataType;
}

/**
 * 數據驗證器介面
 */
export interface DataValidator {
  /** 驗證器名稱 */
  name: string;
  /** 驗證函數 */
  validate: (data: any, expectedType: DataType) => Promise<ValidationResult>;
  /** 支援的數據類型 */
  supportedTypes: DataType[];
}

/**
 * 驗證結果
 */
export interface ValidationResult {
  /** 是否通過驗證 */
  isValid: boolean;
  /** 錯誤信息 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
  /** 建議的修復方案 */
  suggestions: string[];
}

/**
 * 數據聚合器介面
 */
export interface DataAggregator {
  /** 聚合器名稱 */
  name: string;
  /** 聚合函數 */
  aggregate: (dataArray: any[], aggregationType: string) => Promise<any>;
  /** 支援的聚合類型 */
  supportedAggregationTypes: string[];
}

/**
 * 數據流事件
 */
export interface DataFlowEvents {
  // 數據傳遞事件
  dataTransfer: (fromStep: string, toStep: string, data: any) => void;
  transferComplete: (fromStep: string, toStep: string) => void;
  transferFailed: (fromStep: string, toStep: string, error: Error) => void;

  // 數據轉換事件
  transformationStarted: (transformerName: string, data: any) => void;
  transformationCompleted: (transformerName: string, result: any) => void;
  transformationFailed: (transformerName: string, error: Error) => void;

  // 數據驗證事件
  validationStarted: (validatorName: string, data: any) => void;
  validationCompleted: (validatorName: string, result: ValidationResult) => void;
  validationFailed: (validatorName: string, error: Error) => void;

  // 數據聚合事件
  aggregationStarted: (aggregatorName: string, dataArray: any[]) => void;
  aggregationCompleted: (aggregatorName: string, result: any) => void;
  aggregationFailed: (aggregatorName: string, error: Error) => void;
}

/**
 * 數據流管理器配置
 */
export interface DataFlowManagerConfig {
  /** 啟用數據緩存 */
  enableCaching: boolean;
  /** 緩存大小限制（MB） */
  maxCacheSize: number;
  /** 啟用數據壓縮 */
  enableCompression: boolean;
  /** 數據驗證級別 */
  validationLevel: "none" | "basic" | "strict";
  /** 調試模式 */
  debug: boolean;
}

/**
 * 數據流管理器
 */
export class DataFlowManager extends EventEmitter {
  private config: DataFlowManagerConfig;
  private logger = createLogger("DataFlowManager");

  // 註冊的組件
  private transformers = new Map<string, DataTransformer>();
  private validators = new Map<string, DataValidator>();
  private aggregators = new Map<string, DataAggregator>();

  // 內建轉換器
  private builtinTransformers: DataTransformer[] = [];

  // 內建驗證器
  private builtinValidators: DataValidator[] = [];

  // 內建聚合器
  private builtinAggregators: DataAggregator[] = [];

  constructor(config: Partial<DataFlowManagerConfig> = {}) {
    super();

    this.config = {
      enableCaching: true,
      maxCacheSize: 100, // 100MB
      enableCompression: false,
      validationLevel: "basic",
      debug: false,
      ...config,
    };

    this.initializeBuiltinComponents();
    this.registerBuiltinComponents();
  }

  /**
   * 處理數據流
   */
  async processDataFlow(dataFlows: DataFlowDefinition[], context: DataFlowContext): Promise<void> {
    this.logger.debug("開始處理數據流", {
      flowCount: dataFlows.length,
      executionId: context.executionId,
    });

    for (const flow of dataFlows) {
      try {
        await this.processDataFlowStep(flow, context);
        context.statistics.successfulTransfers++;
      } catch (error) {
        this.logger.error(`數據流處理失敗: ${flow.fromStepId} -> ${flow.toStepId}`, error);
        context.statistics.failedTransfers++;
        this.emit("transferFailed", flow.fromStepId, flow.toStepId, error as Error);
        throw error;
      }
    }

    this.logger.debug("數據流處理完成", {
      statistics: context.statistics,
    });
  }

  /**
   * 處理單個數據流步驟
   */
  private async processDataFlowStep(
    flow: DataFlowDefinition,
    context: DataFlowContext
  ): Promise<void> {
    // 1. 獲取源數據
    const sourceData = this.getSourceData(flow, context);

    // 2. 條件檢查
    if (flow.condition && !(await this.evaluateCondition(flow.condition, sourceData, context))) {
      this.logger.debug(`數據流條件不滿足，跳過: ${flow.fromStepId} -> ${flow.toStepId}`);
      return;
    }

    // 3. 數據轉換
    let transformedData = sourceData;
    if (flow.transformer) {
      transformedData = await this.transformData(flow.transformer, sourceData, context);
    }

    // 4. 數據驗證
    if (this.config.validationLevel !== "none") {
      await this.validateData(transformedData, "any", context);
    }

    // 5. 數據傳遞
    this.setTargetData(flow, transformedData, context);

    // 6. 更新統計
    context.statistics.totalTransfers++;
    context.statistics.totalDataSize += this.calculateDataSize(transformedData);

    // 7. 發送事件
    this.emit("dataTransfer", flow.fromStepId, flow.toStepId, transformedData);
    this.emit("transferComplete", flow.fromStepId, flow.toStepId);

    this.logger.debug(`數據流處理成功: ${flow.fromStepId} -> ${flow.toStepId}`);
  }

  /**
   * 獲取源數據
   */
  private getSourceData(flow: DataFlowDefinition, context: DataFlowContext): any {
    const stepResult = context.stepResults.get(flow.fromStepId);
    if (!stepResult) {
      throw new Error(`源步驟 ${flow.fromStepId} 的結果不存在`);
    }

    // 如果指定了輸出名稱，提取特定字段
    if (flow.fromOutput && typeof stepResult === "object" && stepResult !== null) {
      if (!(flow.fromOutput in stepResult)) {
        throw new Error(`源步驟 ${flow.fromStepId} 沒有輸出 ${flow.fromOutput}`);
      }
      return stepResult[flow.fromOutput];
    }

    return stepResult;
  }

  /**
   * 設置目標數據
   */
  private setTargetData(flow: DataFlowDefinition, data: any, context: DataFlowContext): void {
    const targetStepId = flow.toStepId;

    // 如果目標步驟還沒有輸入數據，創建一個對象
    if (!context.stepResults.has(targetStepId)) {
      context.stepResults.set(targetStepId, {});
    }

    const targetData = context.stepResults.get(targetStepId);

    // 設置特定輸入字段
    if (flow.toInput && typeof targetData === "object" && targetData !== null) {
      targetData[flow.toInput] = data;
    } else {
      // 直接替換整個輸入
      context.stepResults.set(targetStepId, data);
    }
  }

  /**
   * 數據轉換
   */
  async transformData(transformerName: string, data: any, context: DataFlowContext): Promise<any> {
    const transformer = this.transformers.get(transformerName);
    if (!transformer) {
      throw new Error(`找不到數據轉換器: ${transformerName}`);
    }

    this.emit("transformationStarted", transformerName, data);

    try {
      const result = await transformer.transform(data, context);
      this.emit("transformationCompleted", transformerName, result);
      return result;
    } catch (error) {
      this.emit("transformationFailed", transformerName, error as Error);
      throw error;
    }
  }

  /**
   * 數據驗證
   */
  async validateData(
    data: any,
    expectedType: DataType,
    context: DataFlowContext
  ): Promise<ValidationResult> {
    // 選擇合適的驗證器
    const validator = this.selectValidator(expectedType);
    if (!validator) {
      return {
        isValid: true,
        errors: [],
        warnings: [`沒有找到適合類型 ${expectedType} 的驗證器`],
        suggestions: [],
      };
    }

    this.emit("validationStarted", validator.name, data);

    try {
      const result = await validator.validate(data, expectedType);
      this.emit("validationCompleted", validator.name, result);

      if (!result.isValid && this.config.validationLevel === "strict") {
        throw new Error(`數據驗證失敗: ${result.errors.join(", ")}`);
      }

      return result;
    } catch (error) {
      this.emit("validationFailed", validator.name, error as Error);
      throw error;
    }
  }

  /**
   * 數據聚合
   */
  async aggregateData(
    aggregatorName: string,
    dataArray: any[],
    aggregationType: string,
    context: DataFlowContext
  ): Promise<any> {
    const aggregator = this.aggregators.get(aggregatorName);
    if (!aggregator) {
      throw new Error(`找不到數據聚合器: ${aggregatorName}`);
    }

    if (!aggregator.supportedAggregationTypes.includes(aggregationType)) {
      throw new Error(`聚合器 ${aggregatorName} 不支援聚合類型 ${aggregationType}`);
    }

    this.emit("aggregationStarted", aggregatorName, dataArray);

    try {
      const result = await aggregator.aggregate(dataArray, aggregationType);
      this.emit("aggregationCompleted", aggregatorName, result);
      return result;
    } catch (error) {
      this.emit("aggregationFailed", aggregatorName, error as Error);
      throw error;
    }
  }

  /**
   * 註冊數據轉換器
   */
  registerTransformer(transformer: DataTransformer): void {
    this.transformers.set(transformer.name, transformer);
    this.logger.debug(`註冊數據轉換器: ${transformer.name}`);
  }

  /**
   * 註冊數據驗證器
   */
  registerValidator(validator: DataValidator): void {
    this.validators.set(validator.name, validator);
    this.logger.debug(`註冊數據驗證器: ${validator.name}`);
  }

  /**
   * 註冊數據聚合器
   */
  registerAggregator(aggregator: DataAggregator): void {
    this.aggregators.set(aggregator.name, aggregator);
    this.logger.debug(`註冊數據聚合器: ${aggregator.name}`);
  }

  /**
   * 創建數據流上下文
   */
  createContext(executionId: string): DataFlowContext {
    return {
      executionId,
      stepResults: new Map(),
      variables: new Map(),
      intermediateCache: new Map(),
      statistics: {
        totalTransfers: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
        totalDataSize: 0,
      },
    };
  }

  /**
   * 清理上下文
   */
  cleanupContext(context: DataFlowContext): void {
    context.stepResults.clear();
    context.variables.clear();
    context.intermediateCache.clear();
  }

  /**
   * 初始化內建組件
   */
  private initializeBuiltinComponents(): void {
    // 內建轉換器
    this.builtinTransformers = [
      {
        name: "json_parse",
        transform: async (data: any) => {
          if (typeof data === "string") {
            return JSON.parse(data);
          }
          return data;
        },
        supportedInputTypes: ["text"],
        outputType: "json",
      },
      {
        name: "json_stringify",
        transform: async (data: any) => {
          return JSON.stringify(data, null, 2);
        },
        supportedInputTypes: ["json", "object", "array"],
        outputType: "text",
      },
      {
        name: "array_join",
        transform: async (data: any) => {
          if (Array.isArray(data)) {
            return data.join(", ");
          }
          return String(data);
        },
        supportedInputTypes: ["array"],
        outputType: "text",
      },
      {
        name: "text_split",
        transform: async (data: any, context: DataFlowContext) => {
          const separator = context.variables.get("separator") || ",";
          if (typeof data === "string") {
            return data.split(separator).map((s) => s.trim());
          }
          return [data];
        },
        supportedInputTypes: ["text"],
        outputType: "array",
      },
    ];

    // 內建驗證器
    this.builtinValidators = [
      {
        name: "basic_validator",
        validate: async (data: any, expectedType: DataType) => {
          const errors: string[] = [];
          const warnings: string[] = [];
          const suggestions: string[] = [];

          switch (expectedType) {
            case "text":
              if (typeof data !== "string") {
                errors.push(`期望文本類型，但得到 ${typeof data}`);
              }
              break;
            case "number":
              if (typeof data !== "number") {
                errors.push(`期望數字類型，但得到 ${typeof data}`);
              }
              break;
            case "boolean":
              if (typeof data !== "boolean") {
                errors.push(`期望布林類型，但得到 ${typeof data}`);
              }
              break;
            case "array":
              if (!Array.isArray(data)) {
                errors.push(`期望陣列類型，但得到 ${typeof data}`);
              }
              break;
            case "object":
              if (typeof data !== "object" || data === null || Array.isArray(data)) {
                errors.push(`期望物件類型，但得到 ${typeof data}`);
              }
              break;
            case "json":
              try {
                if (typeof data === "string") {
                  JSON.parse(data);
                } else if (typeof data !== "object") {
                  errors.push("JSON 數據應該是字符串或物件");
                }
              } catch {
                errors.push("無效的 JSON 格式");
              }
              break;
          }

          return {
            isValid: errors.length === 0,
            errors,
            warnings,
            suggestions,
          };
        },
        supportedTypes: ["text", "number", "boolean", "array", "object", "json", "any"],
      },
    ];

    // 內建聚合器
    this.builtinAggregators = [
      {
        name: "basic_aggregator",
        aggregate: async (dataArray: any[], aggregationType: string) => {
          switch (aggregationType) {
            case "concat":
              return dataArray.join("");
            case "merge":
              return Object.assign({}, ...dataArray);
            case "sum":
              return dataArray.reduce((sum, item) => sum + (Number(item) || 0), 0);
            case "count":
              return dataArray.length;
            case "first":
              return dataArray[0];
            case "last":
              return dataArray[dataArray.length - 1];
            case "unique":
              return [...new Set(dataArray)];
            default:
              throw new Error(`不支援的聚合類型: ${aggregationType}`);
          }
        },
        supportedAggregationTypes: ["concat", "merge", "sum", "count", "first", "last", "unique"],
      },
    ];
  }

  /**
   * 註冊內建組件
   */
  private registerBuiltinComponents(): void {
    this.builtinTransformers.forEach((transformer) => {
      this.registerTransformer(transformer);
    });

    this.builtinValidators.forEach((validator) => {
      this.registerValidator(validator);
    });

    this.builtinAggregators.forEach((aggregator) => {
      this.registerAggregator(aggregator);
    });
  }

  /**
   * 評估條件
   */
  private async evaluateCondition(
    condition: any,
    data: any,
    context: DataFlowContext
  ): Promise<boolean> {
    // 這裡應該實現條件評估邏輯
    // 目前簡單返回 true
    return true;
  }

  /**
   * 選擇驗證器
   */
  private selectValidator(expectedType: DataType): DataValidator | null {
    for (const validator of this.validators.values()) {
      if (
        validator.supportedTypes.includes(expectedType) ||
        validator.supportedTypes.includes("any")
      ) {
        return validator;
      }
    }
    return null;
  }

  /**
   * 計算數據大小
   */
  private calculateDataSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 0;
    }
  }

  // EventEmitter 類型安全重載
  public on<K extends keyof DataFlowEvents>(event: K, listener: DataFlowEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof DataFlowEvents>(
    event: K,
    ...args: Parameters<DataFlowEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
