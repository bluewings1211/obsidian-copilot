/**
 * 工具鏈模板管理器
 *
 * 管理預定義的工具鏈模板：
 * - 模板創建和存儲
 * - 參數化模板
 * - 模板實例化
 * - 模板版本管理
 */

import { ChainDefinition, ChainDefinitionBuilder } from "../core/ChainDefinition";
import { createLogger } from "../../utils/logger";

/**
 * 模板參數定義
 */
export interface TemplateParameter {
  /** 參數名稱 */
  name: string;
  /** 參數類型 */
  type: "string" | "number" | "boolean" | "array" | "object";
  /** 是否必需 */
  required: boolean;
  /** 默認值 */
  defaultValue?: any;
  /** 描述 */
  description?: string;
  /** 驗證規則 */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    allowedValues?: any[];
  };
}

/**
 * 工具鏈模板
 */
export interface ChainTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名稱 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 類別 */
  category: string;
  /** 標籤 */
  tags: string[];

  /** 參數定義 */
  parameters: TemplateParameter[];

  /** 模板定義（包含占位符） */
  template: Partial<ChainDefinition>;

  /** 使用範例 */
  examples?: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;

  /** 創建時間 */
  createdAt: Date;
  /** 更新時間 */
  updatedAt: Date;
  /** 作者 */
  author?: string;

  /** 元數據 */
  metadata?: Record<string, any>;
}

/**
 * 模板實例化結果
 */
export interface TemplateInstantiationResult {
  /** 實例化的工具鏈 */
  chain: ChainDefinition;
  /** 使用的參數 */
  parameters: Record<string, any>;
  /** 實例化時間 */
  instantiationTime: number;
  /** 警告信息 */
  warnings: string[];
}

/**
 * 模板管理器配置
 */
export interface TemplateManagerConfig {
  /** 自動保存模板 */
  autoSave: boolean;
  /** 模板存儲路徑 */
  storagePath?: string;
  /** 啟用版本控制 */
  enableVersioning: boolean;
  /** 最大模板數量 */
  maxTemplates: number;
  /** 調試模式 */
  debug: boolean;
}

/**
 * 工具鏈模板管理器
 */
export class TemplateManager {
  private config: TemplateManagerConfig;
  private logger = createLogger("TemplateManager");
  private templates = new Map<string, ChainTemplate>();
  private templateVersions = new Map<string, ChainTemplate[]>();

  constructor(config: Partial<TemplateManagerConfig> = {}) {
    this.config = {
      autoSave: true,
      enableVersioning: true,
      maxTemplates: 1000,
      debug: false,
      ...config,
    };

    this.initializeBuiltinTemplates();
  }

  /**
   * 創建模板
   */
  async createTemplate(
    templateData: Omit<ChainTemplate, "id" | "createdAt" | "updatedAt">
  ): Promise<ChainTemplate> {
    this.logger.info(`創建模板: ${templateData.name}`);

    const template: ChainTemplate = {
      ...templateData,
      id: this.generateTemplateId(templateData.name),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 驗證模板
    this.validateTemplate(template);

    // 存儲模板
    this.templates.set(template.id, template);

    // 版本管理
    if (this.config.enableVersioning) {
      this.addToVersionHistory(template);
    }

    // 自動保存
    if (this.config.autoSave) {
      await this.saveTemplate(template);
    }

    this.logger.info(`模板創建成功: ${template.id}`);
    return template;
  }

  /**
   * 更新模板
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<ChainTemplate>
  ): Promise<ChainTemplate> {
    const existingTemplate = this.templates.get(templateId);
    if (!existingTemplate) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    this.logger.info(`更新模板: ${templateId}`);

    const updatedTemplate: ChainTemplate = {
      ...existingTemplate,
      ...updates,
      updatedAt: new Date(),
    };

    // 驗證更新後的模板
    this.validateTemplate(updatedTemplate);

    // 版本管理
    if (this.config.enableVersioning) {
      this.addToVersionHistory(updatedTemplate);
    }

    // 更新存儲
    this.templates.set(templateId, updatedTemplate);

    // 自動保存
    if (this.config.autoSave) {
      await this.saveTemplate(updatedTemplate);
    }

    this.logger.info(`模板更新成功: ${templateId}`);
    return updatedTemplate;
  }

  /**
   * 刪除模板
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    this.logger.info(`刪除模板: ${templateId}`);

    this.templates.delete(templateId);
    this.templateVersions.delete(templateId);

    this.logger.info(`模板刪除成功: ${templateId}`);
  }

  /**
   * 獲取模板
   */
  getTemplate(templateId: string): ChainTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * 列出所有模板
   */
  listTemplates(filter?: {
    category?: string;
    tags?: string[];
    searchTerm?: string;
  }): ChainTemplate[] {
    let templates = Array.from(this.templates.values());

    if (filter) {
      if (filter.category) {
        templates = templates.filter((t) => t.category === filter.category);
      }

      if (filter.tags && filter.tags.length > 0) {
        templates = templates.filter((t) => filter.tags!.some((tag) => t.tags.includes(tag)));
      }

      if (filter.searchTerm) {
        const searchTerm = filter.searchTerm.toLowerCase();
        templates = templates.filter(
          (t) =>
            t.name.toLowerCase().includes(searchTerm) ||
            (t.description && t.description.toLowerCase().includes(searchTerm))
        );
      }
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 實例化模板
   */
  async instantiateTemplate(
    templateId: string,
    parameters: Record<string, any>
  ): Promise<ChainDefinition> {
    const startTime = Date.now();
    this.logger.info(`實例化模板: ${templateId}`, { parameters });

    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    try {
      // 1. 驗證參數
      const validatedParameters = this.validateParameters(template, parameters);

      // 2. 執行模板替換
      const instantiatedChain = await this.performTemplateSubstitution(
        template,
        validatedParameters
      );

      // 3. 後處理
      this.postProcessInstantiatedChain(instantiatedChain);

      const instantiationTime = Date.now() - startTime;
      this.logger.info(`模板實例化成功: ${templateId}`, {
        chainId: instantiatedChain.id,
        instantiationTime,
      });

      return instantiatedChain;
    } catch (error) {
      this.logger.error(`模板實例化失敗: ${templateId}`, error);
      throw error;
    }
  }

  /**
   * 獲取模板版本歷史
   */
  getTemplateVersions(templateId: string): ChainTemplate[] {
    return this.templateVersions.get(templateId) || [];
  }

  /**
   * 導出模板
   */
  exportTemplate(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    return JSON.stringify(template, null, 2);
  }

  /**
   * 導入模板
   */
  async importTemplate(templateJson: string): Promise<ChainTemplate> {
    try {
      const templateData = JSON.parse(templateJson);

      // 轉換日期字段
      if (templateData.createdAt) {
        templateData.createdAt = new Date(templateData.createdAt);
      }
      if (templateData.updatedAt) {
        templateData.updatedAt = new Date(templateData.updatedAt);
      }

      // 生成新的 ID 以避免衝突
      const newId = this.generateTemplateId(templateData.name);
      templateData.id = newId;

      return await this.createTemplate(templateData);
    } catch (error) {
      this.logger.error("模板導入失敗", error);
      throw new Error("無效的模板格式");
    }
  }

  /**
   * 克隆模板
   */
  async cloneTemplate(
    templateId: string,
    newName: string,
    modifications?: Partial<ChainTemplate>
  ): Promise<ChainTemplate> {
    const originalTemplate = this.templates.get(templateId);
    if (!originalTemplate) {
      throw new Error(`找不到模板: ${templateId}`);
    }

    const clonedTemplate = {
      ...originalTemplate,
      name: newName,
      ...modifications,
    };

    // 移除 ID，讓 createTemplate 生成新的
    delete (clonedTemplate as any).id;
    delete (clonedTemplate as any).createdAt;
    delete (clonedTemplate as any).updatedAt;

    return await this.createTemplate(clonedTemplate);
  }

  /**
   * 初始化內建模板
   */
  private initializeBuiltinTemplates(): void {
    this.logger.debug("初始化內建模板");

    // 1. 研究流程模板
    this.createBuiltinTemplate({
      name: "研究流程",
      version: "1.0.0",
      category: "research",
      description: "搜索 → 分析 → 總結 → 驗證的研究流程",
      tags: ["research", "analysis", "workflow"],
      parameters: [
        {
          name: "query",
          type: "string",
          required: true,
          description: "研究查詢關鍵詞",
        },
        {
          name: "sources",
          type: "array",
          required: false,
          defaultValue: ["web", "local"],
          description: "數據源列表",
        },
        {
          name: "depth",
          type: "string",
          required: false,
          defaultValue: "medium",
          description: "研究深度",
          validation: {
            allowedValues: ["shallow", "medium", "deep"],
          },
        },
      ],
      template: {
        name: "{{name}}_research_{{timestamp}}",
        description: "基於 {{query}} 的研究流程",
        steps: [
          {
            id: "search_step",
            name: "搜索步驟",
            type: "tool_call",
            config: {
              toolName: "{{sources.includes('web') ? 'web_search' : 'local_search'}}",
              parameters: {
                query: "{{query}}",
                depth: "{{depth}}",
              },
            },
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: "analyze_step",
            name: "分析步驟",
            type: "llm_generation",
            config: {
              prompt: "分析以下搜索結果並提取關鍵信息：{{search_step.result}}",
            },
            inputs: [],
            outputs: [],
            dependencies: ["search_step"],
          },
          {
            id: "summarize_step",
            name: "總結步驟",
            type: "llm_generation",
            config: {
              prompt: "總結研究發現：{{analyze_step.result}}",
            },
            inputs: [],
            outputs: [],
            dependencies: ["analyze_step"],
          },
        ],
      },
    });

    // 2. 內容創建模板
    this.createBuiltinTemplate({
      name: "內容創建",
      version: "1.0.0",
      category: "content",
      description: "收集資料 → 處理 → 生成 → 優化的內容創建流程",
      tags: ["content", "generation", "workflow"],
      parameters: [
        {
          name: "topic",
          type: "string",
          required: true,
          description: "內容主題",
        },
        {
          name: "type",
          type: "string",
          required: false,
          defaultValue: "article",
          description: "內容類型",
          validation: {
            allowedValues: ["article", "blog", "report", "summary"],
          },
        },
        {
          name: "length",
          type: "number",
          required: false,
          defaultValue: 1000,
          description: "目標字數",
          validation: {
            min: 100,
            max: 10000,
          },
        },
      ],
      template: {
        name: "{{name}}_content_{{timestamp}}",
        description: "關於 {{topic}} 的 {{type}} 創建流程",
        steps: [
          {
            id: "research_step",
            name: "資料收集",
            type: "tool_call",
            config: {
              toolName: "web_search",
              parameters: {
                query: "{{topic}}",
              },
            },
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: "outline_step",
            name: "大綱生成",
            type: "llm_generation",
            config: {
              prompt: "為 {{topic}} 創建 {{type}} 大綱，目標字數 {{length}}",
            },
            inputs: [],
            outputs: [],
            dependencies: ["research_step"],
          },
          {
            id: "content_step",
            name: "內容生成",
            type: "llm_generation",
            config: {
              prompt: "基於大綱創建內容：{{outline_step.result}}",
            },
            inputs: [],
            outputs: [],
            dependencies: ["outline_step"],
          },
          {
            id: "optimize_step",
            name: "內容優化",
            type: "llm_generation",
            config: {
              prompt: "優化以下內容的結構和表達：{{content_step.result}}",
            },
            inputs: [],
            outputs: [],
            dependencies: ["content_step"],
          },
        ],
      },
    });

    this.logger.debug("內建模板初始化完成");
  }

  /**
   * 創建內建模板
   */
  private createBuiltinTemplate(
    templateData: Omit<ChainTemplate, "id" | "createdAt" | "updatedAt">
  ): void {
    const template: ChainTemplate = {
      ...templateData,
      id: this.generateTemplateId(templateData.name),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(template.id, template);
  }

  /**
   * 驗證模板
   */
  private validateTemplate(template: ChainTemplate): void {
    if (!template.name) {
      throw new Error("模板名稱不能為空");
    }

    if (!template.category) {
      throw new Error("模板類別不能為空");
    }

    if (!template.parameters || !Array.isArray(template.parameters)) {
      throw new Error("模板參數定義無效");
    }

    // 驗證參數定義
    for (const param of template.parameters) {
      if (!param.name) {
        throw new Error("參數名稱不能為空");
      }
      if (!param.type) {
        throw new Error(`參數 ${param.name} 的類型不能為空`);
      }
    }

    // 驗證模板定義
    if (!template.template) {
      throw new Error("模板定義不能為空");
    }

    this.logger.debug(`模板驗證通過: ${template.name}`);
  }

  /**
   * 驗證參數
   */
  private validateParameters(
    template: ChainTemplate,
    parameters: Record<string, any>
  ): Record<string, any> {
    const validatedParams: Record<string, any> = {};

    for (const paramDef of template.parameters) {
      const value = parameters[paramDef.name];

      // 檢查必需參數
      if (paramDef.required && (value === undefined || value === null)) {
        throw new Error(`缺少必需參數: ${paramDef.name}`);
      }

      // 使用默認值
      const finalValue = value !== undefined ? value : paramDef.defaultValue;

      // 類型檢查
      if (finalValue !== undefined) {
        this.validateParameterType(paramDef, finalValue);
        this.validateParameterConstraints(paramDef, finalValue);
      }

      validatedParams[paramDef.name] = finalValue;
    }

    // 添加內建變量
    validatedParams.timestamp = Date.now();
    validatedParams.date = new Date().toISOString().split("T")[0];
    validatedParams.name = template.name;

    return validatedParams;
  }

  /**
   * 驗證參數類型
   */
  private validateParameterType(paramDef: TemplateParameter, value: any): void {
    const actualType = Array.isArray(value) ? "array" : typeof value;

    if (actualType !== paramDef.type) {
      throw new Error(`參數 ${paramDef.name} 類型錯誤，期望 ${paramDef.type}，實際 ${actualType}`);
    }
  }

  /**
   * 驗證參數約束
   */
  private validateParameterConstraints(paramDef: TemplateParameter, value: any): void {
    if (!paramDef.validation) return;

    const validation = paramDef.validation;

    // 數值範圍檢查
    if (typeof value === "number") {
      if (validation.min !== undefined && value < validation.min) {
        throw new Error(`參數 ${paramDef.name} 的值 ${value} 小於最小值 ${validation.min}`);
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new Error(`參數 ${paramDef.name} 的值 ${value} 大於最大值 ${validation.max}`);
      }
    }

    // 字符串模式檢查
    if (typeof value === "string" && validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        throw new Error(`參數 ${paramDef.name} 的值不匹配模式 ${validation.pattern}`);
      }
    }

    // 允許值檢查
    if (validation.allowedValues && !validation.allowedValues.includes(value)) {
      throw new Error(
        `參數 ${paramDef.name} 的值 ${value} 不在允許的值列表中: ${validation.allowedValues.join(", ")}`
      );
    }
  }

  /**
   * 執行模板替換
   */
  private async performTemplateSubstitution(
    template: ChainTemplate,
    parameters: Record<string, any>
  ): Promise<ChainDefinition> {
    // 將模板轉換為字符串，進行變量替換，然後轉換回對象
    const templateString = JSON.stringify(template.template);
    const substitutedString = this.substituteVariables(templateString, parameters);
    const substitutedTemplate = JSON.parse(substitutedString);

    // 使用 ChainDefinitionBuilder 構建完整的工具鏈定義
    const builder = new ChainDefinitionBuilder();

    // 設置基本信息
    builder.setBasicInfo(
      this.generateChainId(template.name),
      substitutedTemplate.name || `${template.name} Instance`,
      "1.0.0",
      substitutedTemplate.description || template.description
    );

    // 添加步驟
    if (substitutedTemplate.steps) {
      for (const step of substitutedTemplate.steps) {
        builder.addStep(step);
      }
    }

    // 添加數據流
    if (substitutedTemplate.dataFlows) {
      for (const flow of substitutedTemplate.dataFlows) {
        builder.addDataFlow(flow);
      }
    }

    // 設置配置
    if (substitutedTemplate.config) {
      builder.setConfig(substitutedTemplate.config);
    }

    return builder.build();
  }

  /**
   * 變量替換
   */
  private substituteVariables(template: string, parameters: Record<string, any>): string {
    let result = template;

    // 替換簡單變量 {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = parameters[varName];
      return value !== undefined ? JSON.stringify(value) : match;
    });

    // 替換複雜表達式 {{expression}}
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      try {
        // 創建安全的執行上下文
        const context = { ...parameters };
        const value = this.evaluateExpression(expression, context);
        return value !== undefined ? JSON.stringify(value) : match;
      } catch (error) {
        this.logger.warn(`表達式評估失敗: ${expression}`, error);
        return match;
      }
    });

    return result;
  }

  /**
   * 評估表達式
   */
  private evaluateExpression(expression: string, context: Record<string, any>): any {
    // 簡化的表達式評估器
    // 在實際實現中，應該使用更安全的表達式解析器

    // 處理點號訪問
    if (expression.includes(".")) {
      const parts = expression.split(".");
      let value = context;
      for (const part of parts) {
        value = value?.[part];
      }
      return value;
    }

    // 處理數組包含檢查
    if (expression.includes(".includes(")) {
      const match = expression.match(/(\w+)\.includes\(['"]([^'"]+)['"]\)/);
      if (match) {
        const arrayName = match[1];
        const searchValue = match[2];
        const array = context[arrayName];
        return Array.isArray(array) && array.includes(searchValue);
      }
    }

    // 處理三元運算符
    if (expression.includes("?") && expression.includes(":")) {
      const parts = expression.split("?");
      if (parts.length === 2) {
        const condition = parts[0].trim();
        const thenElse = parts[1].split(":");
        if (thenElse.length === 2) {
          const conditionResult = this.evaluateExpression(condition, context);
          const thenValue = thenElse[0].trim().replace(/['"]/g, "");
          const elseValue = thenElse[1].trim().replace(/['"]/g, "");
          return conditionResult ? thenValue : elseValue;
        }
      }
    }

    return context[expression];
  }

  /**
   * 後處理實例化的工具鏈
   */
  private postProcessInstantiatedChain(chain: ChainDefinition): void {
    // 確保所有步驟都有必需的字段
    for (const step of chain.steps) {
      if (!step.inputs) step.inputs = [];
      if (!step.outputs) step.outputs = [];
      if (!step.dependencies) step.dependencies = [];
    }

    // 確保數據流存在
    if (!chain.dataFlows) chain.dataFlows = [];

    // 設置默認配置
    if (!chain.config) {
      chain.config = {
        defaultTimeout: 30000,
        maxConcurrency: 5,
        enableCaching: true,
      };
    }
  }

  /**
   * 添加到版本歷史
   */
  private addToVersionHistory(template: ChainTemplate): void {
    if (!this.templateVersions.has(template.id)) {
      this.templateVersions.set(template.id, []);
    }

    const versions = this.templateVersions.get(template.id)!;
    versions.push({ ...template });

    // 保持最多 10 個版本
    if (versions.length > 10) {
      versions.shift();
    }
  }

  /**
   * 保存模板
   */
  private async saveTemplate(template: ChainTemplate): Promise<void> {
    // 在實際實現中，這裡應該保存到持久化存儲
    this.logger.debug(`保存模板: ${template.id}`);
  }

  /**
   * 生成模板 ID
   */
  private generateTemplateId(name: string): string {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return `template_${sanitized}_${Date.now()}`;
  }

  /**
   * 生成工具鏈 ID
   */
  private generateChainId(templateName: string): string {
    const sanitized = templateName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return `chain_${sanitized}_${Date.now()}`;
  }
}
