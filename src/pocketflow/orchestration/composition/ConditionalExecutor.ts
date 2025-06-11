/**
 * 條件執行器
 *
 * 實現工具鏈中的條件執行邏輯：
 * - 條件表達式評估
 * - 動態分支選擇
 * - 複雜條件組合
 * - 條件執行監控
 */

import { ConditionDefinition, ConditionOperator } from "../core/ChainDefinition";
import { createLogger } from "../../utils/logger";

/**
 * 條件執行結果
 */
export interface ConditionResult {
  /** 條件是否滿足 */
  satisfied: boolean;
  /** 評估值 */
  evaluatedValue?: any;
  /** 執行時間 */
  executionTime: number;
  /** 評估細節 */
  details: {
    leftValue: any;
    operator: ConditionOperator;
    rightValue: any;
    expression?: string;
  };
}

/**
 * 條件上下文
 */
export interface ConditionContext {
  /** 步驟結果 */
  stepResults: Map<string, any>;
  /** 共享變量 */
  variables: Map<string, any>;
  /** 執行 ID */
  executionId: string;
  /** 當前時間 */
  timestamp: number;
}

/**
 * 條件函數註冊項
 */
export interface ConditionFunction {
  /** 函數名稱 */
  name: string;
  /** 函數實現 */
  fn: (context: ConditionContext, ...args: any[]) => Promise<boolean>;
  /** 參數描述 */
  parameters: Array<{
    name: string;
    type: string;
    description: string;
  }>;
}

/**
 * 條件執行器配置
 */
export interface ConditionalExecutorConfig {
  /** 啟用表達式緩存 */
  enableCaching: boolean;
  /** 緩存大小 */
  cacheSize: number;
  /** 執行超時時間 */
  executionTimeout: number;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 條件執行器
 */
export class ConditionalExecutor {
  private config: ConditionalExecutorConfig;
  private logger = createLogger("ConditionalExecutor");

  // 註冊的條件函數
  private conditionFunctions = new Map<string, ConditionFunction>();

  // 條件評估緩存
  private evaluationCache = new Map<string, ConditionResult>();

  constructor(config: Partial<ConditionalExecutorConfig> = {}) {
    this.config = {
      enableCaching: true,
      cacheSize: 1000,
      executionTimeout: 5000,
      debug: false,
      ...config,
    };

    this.initializeBuiltinFunctions();
  }

  /**
   * 評估條件
   */
  async evaluateCondition(
    condition: ConditionDefinition,
    context: ConditionContext
  ): Promise<ConditionResult> {
    const startTime = Date.now();

    this.logger.debug(`評估條件: ${condition.id}`);

    try {
      // 檢查緩存
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(condition, context);
        const cached = this.evaluationCache.get(cacheKey);
        if (cached) {
          this.logger.debug(`使用緩存結果: ${condition.id}`);
          return cached;
        }
      }

      // 評估條件
      const result = await this.performEvaluation(condition, context);

      // 緩存結果
      if (this.config.enableCaching && result.executionTime < 1000) {
        const cacheKey = this.generateCacheKey(condition, context);
        this.evaluationCache.set(cacheKey, result);

        // 清理緩存
        if (this.evaluationCache.size > this.config.cacheSize) {
          this.cleanupCache();
        }
      }

      this.logger.debug(`條件評估完成: ${condition.id}`, {
        satisfied: result.satisfied,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`條件評估失敗: ${condition.id}`, error);

      return {
        satisfied: false,
        executionTime,
        details: {
          leftValue: null,
          operator: condition.operator,
          rightValue: null,
          expression: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * 批量評估條件
   */
  async evaluateConditions(
    conditions: ConditionDefinition[],
    context: ConditionContext
  ): Promise<Map<string, ConditionResult>> {
    this.logger.debug(`批量評估 ${conditions.length} 個條件`);

    const results = new Map<string, ConditionResult>();

    // 並行評估
    const evaluationPromises = conditions.map(async (condition) => {
      const result = await this.evaluateCondition(condition, context);
      return { conditionId: condition.id, result };
    });

    const evaluationResults = await Promise.all(evaluationPromises);

    for (const { conditionId, result } of evaluationResults) {
      results.set(conditionId, result);
    }

    this.logger.debug("批量條件評估完成", {
      total: conditions.length,
      satisfied: Array.from(results.values()).filter((r) => r.satisfied).length,
    });

    return results;
  }

  /**
   * 註冊條件函數
   */
  registerConditionFunction(conditionFunction: ConditionFunction): void {
    this.conditionFunctions.set(conditionFunction.name, conditionFunction);
    this.logger.debug(`註冊條件函數: ${conditionFunction.name}`);
  }

  /**
   * 獲取可用的條件函數
   */
  getAvailableFunctions(): ConditionFunction[] {
    return Array.from(this.conditionFunctions.values());
  }

  /**
   * 清理緩存
   */
  clearCache(): void {
    this.evaluationCache.clear();
    this.logger.debug("條件評估緩存已清理");
  }

  /**
   * 執行條件評估
   */
  private async performEvaluation(
    condition: ConditionDefinition,
    context: ConditionContext
  ): Promise<ConditionResult> {
    const startTime = Date.now();

    // 1. 解析左操作數
    const leftValue = await this.resolveValue(condition.left, context);

    // 2. 解析右操作數
    const rightValue = await this.resolveValue(condition.right, context);

    // 3. 執行比較
    let satisfied: boolean;

    if (condition.customFunction) {
      // 使用自定義函數
      satisfied = await this.executeCustomFunction(
        condition.customFunction,
        context,
        leftValue,
        rightValue
      );
    } else {
      // 使用內建操作符
      satisfied = this.executeOperator(condition.operator, leftValue, rightValue);
    }

    const executionTime = Date.now() - startTime;

    return {
      satisfied,
      evaluatedValue: satisfied,
      executionTime,
      details: {
        leftValue,
        operator: condition.operator,
        rightValue,
        expression: condition.customFunction,
      },
    };
  }

  /**
   * 解析值
   */
  private async resolveValue(
    valueDefinition: { type: string; value: any },
    context: ConditionContext
  ): Promise<any> {
    switch (valueDefinition.type) {
      case "constant":
        return valueDefinition.value;

      case "variable":
        return context.variables.get(valueDefinition.value);

      case "input":
        // 從步驟輸入中獲取
        return this.getInputValue(valueDefinition.value, context);

      case "output":
        // 從步驟輸出中獲取
        return this.getOutputValue(valueDefinition.value, context);

      default:
        throw new Error(`不支援的值類型: ${valueDefinition.type}`);
    }
  }

  /**
   * 獲取輸入值
   */
  private getInputValue(path: string, context: ConditionContext): any {
    // 解析路徑，例如 "stepId.inputName"
    const parts = path.split(".");
    if (parts.length !== 2) {
      throw new Error(`無效的輸入路徑: ${path}`);
    }

    const [stepId, inputName] = parts;
    const stepResult = context.stepResults.get(stepId);

    if (!stepResult) {
      return undefined;
    }

    return stepResult[inputName];
  }

  /**
   * 獲取輸出值
   */
  private getOutputValue(path: string, context: ConditionContext): any {
    // 解析路徑，例如 "stepId.outputName"
    const parts = path.split(".");
    if (parts.length !== 2) {
      throw new Error(`無效的輸出路徑: ${path}`);
    }

    const [stepId, outputName] = parts;
    const stepResult = context.stepResults.get(stepId);

    if (!stepResult) {
      return undefined;
    }

    return stepResult[outputName];
  }

  /**
   * 執行操作符
   */
  private executeOperator(operator: ConditionOperator, leftValue: any, rightValue: any): boolean {
    switch (operator) {
      case "equals":
        return leftValue === rightValue;

      case "not_equals":
        return leftValue !== rightValue;

      case "greater_than":
        return Number(leftValue) > Number(rightValue);

      case "less_than":
        return Number(leftValue) < Number(rightValue);

      case "contains":
        if (typeof leftValue === "string") {
          return leftValue.includes(String(rightValue));
        }
        if (Array.isArray(leftValue)) {
          return leftValue.includes(rightValue);
        }
        return false;

      case "starts_with":
        return String(leftValue).startsWith(String(rightValue));

      case "ends_with":
        return String(leftValue).endsWith(String(rightValue));

      case "exists":
        return leftValue !== undefined && leftValue !== null;

      case "not_exists":
        return leftValue === undefined || leftValue === null;

      default:
        throw new Error(`不支援的操作符: ${operator}`);
    }
  }

  /**
   * 執行自定義函數
   */
  private async executeCustomFunction(
    functionName: string,
    context: ConditionContext,
    leftValue: any,
    rightValue: any
  ): Promise<boolean> {
    const conditionFunction = this.conditionFunctions.get(functionName);

    if (!conditionFunction) {
      throw new Error(`找不到自定義條件函數: ${functionName}`);
    }

    try {
      return await conditionFunction.fn(context, leftValue, rightValue);
    } catch (error) {
      this.logger.error(`自定義條件函數執行失敗: ${functionName}`, error);
      throw error;
    }
  }

  /**
   * 初始化內建函數
   */
  private initializeBuiltinFunctions(): void {
    this.logger.debug("初始化內建條件函數");

    // 正則表達式匹配
    this.registerConditionFunction({
      name: "regex_match",
      fn: async (context, value, pattern) => {
        const regex = new RegExp(pattern);
        return regex.test(String(value));
      },
      parameters: [
        { name: "value", type: "string", description: "要測試的值" },
        { name: "pattern", type: "string", description: "正則表達式模式" },
      ],
    });

    // 數值範圍檢查
    this.registerConditionFunction({
      name: "in_range",
      fn: async (context, value, min, max) => {
        const num = Number(value);
        return num >= min && num <= max;
      },
      parameters: [
        { name: "value", type: "number", description: "要檢查的數值" },
        { name: "min", type: "number", description: "最小值" },
        { name: "max", type: "number", description: "最大值" },
      ],
    });

    // 數組長度檢查
    this.registerConditionFunction({
      name: "array_length",
      fn: async (context, array, length) => {
        return Array.isArray(array) && array.length === length;
      },
      parameters: [
        { name: "array", type: "array", description: "要檢查的數組" },
        { name: "length", type: "number", description: "期望的長度" },
      ],
    });

    // 物件屬性存在檢查
    this.registerConditionFunction({
      name: "has_property",
      fn: async (context, obj, property) => {
        return typeof obj === "object" && obj !== null && property in obj;
      },
      parameters: [
        { name: "obj", type: "object", description: "要檢查的物件" },
        { name: "property", type: "string", description: "屬性名稱" },
      ],
    });

    // 時間範圍檢查
    this.registerConditionFunction({
      name: "time_between",
      fn: async (context, time, startTime, endTime) => {
        const timestamp = new Date(time).getTime();
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        return timestamp >= start && timestamp <= end;
      },
      parameters: [
        { name: "time", type: "string", description: "要檢查的時間" },
        { name: "startTime", type: "string", description: "開始時間" },
        { name: "endTime", type: "string", description: "結束時間" },
      ],
    });

    // 複雜條件組合
    this.registerConditionFunction({
      name: "and",
      fn: async (context, ...conditions) => {
        for (const condition of conditions) {
          if (!condition) {
            return false;
          }
        }
        return true;
      },
      parameters: [{ name: "conditions", type: "array", description: "要組合的條件列表" }],
    });

    this.registerConditionFunction({
      name: "or",
      fn: async (context, ...conditions) => {
        for (const condition of conditions) {
          if (condition) {
            return true;
          }
        }
        return false;
      },
      parameters: [{ name: "conditions", type: "array", description: "要組合的條件列表" }],
    });

    // 步驟成功狀態檢查
    this.registerConditionFunction({
      name: "step_succeeded",
      fn: async (context, stepId) => {
        const stepResult = context.stepResults.get(stepId);
        return stepResult && stepResult.success !== false;
      },
      parameters: [{ name: "stepId", type: "string", description: "要檢查的步驟 ID" }],
    });

    // 執行時間檢查
    this.registerConditionFunction({
      name: "execution_time_less_than",
      fn: async (context, stepId, maxTime) => {
        const stepResult = context.stepResults.get(stepId);
        if (!stepResult || !stepResult.executionTime) {
          return false;
        }
        return stepResult.executionTime < maxTime;
      },
      parameters: [
        { name: "stepId", type: "string", description: "要檢查的步驟 ID" },
        { name: "maxTime", type: "number", description: "最大執行時間（毫秒）" },
      ],
    });

    this.logger.debug("內建條件函數初始化完成");
  }

  /**
   * 生成緩存鍵
   */
  private generateCacheKey(condition: ConditionDefinition, context: ConditionContext): string {
    // 簡化的緩存鍵生成，實際應該考慮更多因素
    const key = {
      conditionId: condition.id,
      operator: condition.operator,
      customFunction: condition.customFunction,
      timestamp: Math.floor(context.timestamp / 60000), // 分鐘級別緩存
    };

    return JSON.stringify(key);
  }

  /**
   * 清理緩存
   */
  private cleanupCache(): void {
    // 簡單的 LRU 清理策略：刪除一半的緩存
    const entries = Array.from(this.evaluationCache.entries());
    const toDelete = entries.slice(0, Math.floor(entries.length / 2));

    for (const [key] of toDelete) {
      this.evaluationCache.delete(key);
    }

    this.logger.debug(`清理了 ${toDelete.length} 個緩存條目`);
  }
}
