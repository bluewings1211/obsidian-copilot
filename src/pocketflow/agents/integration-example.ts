import { ToolSelectionAgent, ToolSelectionConfig } from "./ToolSelectionAgent";
import {
  IntentAnalysisNode,
  IntentAnalysisResult,
  IntentAction,
} from "../nodes/IntentAnalysisNode";
import { ChatSharedState } from "../types";
import { Vault } from "obsidian";
import { logInfo, logError } from "@/logger";

/**
 * 增強的意圖分析節點
 *
 * 整合了 ToolSelectionAgent 來提供更智能的工具選擇
 */
export class EnhancedIntentAnalysisNode extends IntentAnalysisNode {
  private toolSelectionAgent: ToolSelectionAgent;
  private enableSmartSelection: boolean;

  constructor(
    vault: Vault,
    maxRetries: number = 1,
    wait: number = 0,
    smartSelectionConfig?: Partial<ToolSelectionConfig>
  ) {
    super(vault, maxRetries, wait);

    // 初始化智能工具選擇代理
    const defaultConfig: Partial<ToolSelectionConfig> = {
      maxCandidates: 5,
      minConfidenceThreshold: 0.3,
      enableLearning: true,
      enablePerformanceTracking: true,
      semanticWeight: 0.35,
      contextWeight: 0.3,
      performanceWeight: 0.2,
      preferenceWeight: 0.15,
    };

    this.toolSelectionAgent = new ToolSelectionAgent({
      ...defaultConfig,
      ...smartSelectionConfig,
    });

    this.enableSmartSelection = true;
  }

  /**
   * 增強的意圖分析執行
   */
  async exec(originalMessage: string): Promise<IntentAnalysisResult> {
    try {
      // 1. 執行原有的意圖分析
      const basicResult = await super.exec(originalMessage);

      // 2. 如果啟用智能選擇，使用 ToolSelectionAgent 進行增強
      if (this.enableSmartSelection) {
        const enhancedResult = await this.enhanceWithSmartSelection(originalMessage, basicResult);

        // 3. 記錄工具使用情況（用於學習）
        await this.recordToolUsage(originalMessage, enhancedResult);

        logInfo("使用智能工具選擇代理增強了意圖分析結果");
        return enhancedResult;
      }

      return basicResult;
    } catch (error) {
      logError("增強意圖分析失敗，回退到基本分析:", error);
      return await super.exec(originalMessage);
    }
  }

  /**
   * 使用智能選擇增強結果
   */
  private async enhanceWithSmartSelection(
    query: string,
    basicResult: IntentAnalysisResult
  ): Promise<IntentAnalysisResult> {
    try {
      // 獲取所有可用工具（重新實現以訪問私有方法）
      const availableTools = await this.getPublicAvailableTools();

      // 創建共享狀態上下文
      const mockShared: ChatSharedState = {
        userMessage: {
          message: query,
          timestamp: new Date().toISOString() as any,
          sender: "user",
          isVisible: true,
        },
        searchQuery: query,
        toolCalls: basicResult.toolCalls,
        currentStep: "意圖分析",
        debug: false,
      };

      // 使用智能代理選擇工具
      const smartSelection = await this.toolSelectionAgent.selectTools(
        query,
        availableTools,
        mockShared
      );

      // 合併結果
      const enhancedResult: IntentAnalysisResult = {
        ...basicResult,
        suggestedAction: this.determineEnhancedAction(
          basicResult.suggestedAction,
          smartSelection.suggestedAction
        ) as IntentAction,
      };

      // 如果智能選擇有更好的建議，添加到工具調用中
      if (smartSelection.primaryTool && smartSelection.confidence > 0.6) {
        const smartToolCall = {
          tool: smartSelection.primaryTool.tool,
          args: smartSelection.primaryTool.args || {},
        };

        // 檢查是否已經存在相同的工具調用
        const existingCall = enhancedResult.toolCalls.find(
          (call) => this.getToolName(call.tool) === smartSelection.primaryTool!.name
        );

        if (!existingCall) {
          enhancedResult.toolCalls.push(smartToolCall);
          enhancedResult.detectedTools.push(smartSelection.primaryTool.name);
        }
      }

      return enhancedResult;
    } catch (error) {
      logError("智能選擇增強失敗:", error);
      return basicResult;
    }
  }

  /**
   * 決定增強的動作
   */
  private determineEnhancedAction(basicAction: string, smartAction: string): string {
    // 如果智能選擇建議不同的動作，進行權衡
    if (basicAction !== smartAction) {
      // 優先級：smart action > basic action，除非 basic action 是特定命令
      if (basicAction.includes("@") || basicAction === "mcp_tools") {
        return basicAction; // 保持明確的用戶命令
      }
      return smartAction; // 使用智能建議
    }

    return basicAction;
  }

  /**
   * 記錄工具使用情況
   */
  private async recordToolUsage(query: string, result: IntentAnalysisResult): Promise<void> {
    try {
      // 為每個檢測到的工具記錄使用模式
      for (const toolName of result.detectedTools) {
        // 記錄使用模式（用於學習）
        await this.toolSelectionAgent.recordFeedback(
          toolName,
          true, // 假設成功
          100, // 模擬執行時間
          4 // 模擬滿意度
        );
      }
    } catch (error) {
      logError("記錄工具使用失敗:", error);
    }
  }

  /**
   * 根據名稱分類工具
   */
  private categorizeToolByName(toolName: string): string {
    const name = toolName.toLowerCase();

    if (name.includes("search") || name.includes("find")) {
      return "search";
    }
    if (name.includes("web") || name.includes("internet")) {
      return "web";
    }
    if (name.includes("time") || name.includes("date")) {
      return "time";
    }
    if (name.includes("file") || name.includes("document")) {
      return "file";
    }
    if (name.includes("mcp_")) {
      return "mcp";
    }

    return "general";
  }

  /**
   * 獲取工具名稱
   */
  private getToolName(tool: any): string {
    return tool?.name || tool?.function?.name || "unknown";
  }

  /**
   * 啟用/禁用智能選擇
   */
  setSmartSelectionEnabled(enabled: boolean): void {
    this.enableSmartSelection = enabled;
  }

  /**
   * 獲取智能選擇統計
   */
  async getSmartSelectionStatistics(): Promise<any> {
    return await this.toolSelectionAgent.getToolStatistics();
  }

  /**
   * 更新智能選擇配置
   */
  updateSmartSelectionConfig(config: Partial<ToolSelectionConfig>): void {
    this.toolSelectionAgent.updateConfig(config);
  }

  /**
   * 重置學習數據
   */
  async resetSmartSelectionLearning(): Promise<void> {
    await this.toolSelectionAgent.resetLearningData();
  }

  /**
   * 導出智能選擇數據
   */
  async exportSmartSelectionData(): Promise<any> {
    return await this.toolSelectionAgent.getToolStatistics();
  }

  /**
   * 獲取可用工具（公共方法）
   */
  private async getPublicAvailableTools(): Promise<any[]> {
    // 模擬工具列表，實際使用時可以從父類獲取或重新實現
    return [
      {
        name: "localSearch",
        description: "搜索本地筆記和文檔",
        inputSchema: { properties: { query: { type: "string" } } },
      },
      {
        name: "webSearch",
        description: "搜索網路資訊",
        inputSchema: { properties: { query: { type: "string" } } },
      },
      {
        name: "getCurrentTime",
        description: "獲取當前時間",
        inputSchema: { properties: {} },
      },
      {
        name: "getTimeInfoByEpoch",
        description: "根據時間戳獲取時間信息",
        inputSchema: { properties: { epoch: { type: "number" } } },
      },
      {
        name: "pomodoroTool",
        description: "番茄工作法計時器",
        inputSchema: { properties: { interval: { type: "string" } } },
      },
    ];
  }
}

/**
 * 工具選擇代理工廠
 *
 * 用於創建和配置 ToolSelectionAgent 實例
 */
export class ToolSelectionAgentFactory {
  /**
   * 創建默認配置的代理
   */
  static createDefault(): ToolSelectionAgent {
    return new ToolSelectionAgent({
      maxCandidates: 5,
      minConfidenceThreshold: 0.3,
      enableLearning: true,
      enablePerformanceTracking: true,
    });
  }

  /**
   * 創建高性能配置的代理（適用於生產環境）
   */
  static createProduction(): ToolSelectionAgent {
    return new ToolSelectionAgent({
      maxCandidates: 3,
      minConfidenceThreshold: 0.4,
      enableLearning: true,
      enablePerformanceTracking: true,
      semanticWeight: 0.4,
      contextWeight: 0.3,
      performanceWeight: 0.2,
      preferenceWeight: 0.1,
    });
  }

  /**
   * 創建開發/測試配置的代理
   */
  static createDevelopment(): ToolSelectionAgent {
    return new ToolSelectionAgent({
      maxCandidates: 10,
      minConfidenceThreshold: 0.1,
      enableLearning: false, // 測試時禁用學習
      enablePerformanceTracking: false,
    });
  }

  /**
   * 創建自定義配置的代理
   */
  static createCustom(config: Partial<ToolSelectionConfig>): ToolSelectionAgent {
    return new ToolSelectionAgent(config);
  }
}

/**
 * 使用示例
 */
export async function demonstrateSmartToolSelection(): Promise<void> {
  try {
    logInfo("開始智能工具選擇演示");

    // 1. 創建智能工具選擇代理
    const agent = ToolSelectionAgentFactory.createDefault();

    // 2. 模擬工具列表
    const tools = [
      {
        name: "localSearch",
        description: "搜索本地筆記",
        inputSchema: { properties: { query: { type: "string" } } },
      },
      {
        name: "webSearch",
        description: "搜索網路資訊",
        inputSchema: { properties: { query: { type: "string" } } },
      },
      {
        name: "getCurrentTime",
        description: "獲取當前時間",
        inputSchema: { properties: {} },
      },
    ];

    // 3. 模擬查詢
    const queries = [
      "找找我關於 JavaScript 的筆記",
      "現在幾點了？",
      "搜索最新的 AI 技術趨勢",
      "查找昨天寫的會議記錄",
    ];

    // 4. 測試每個查詢
    for (const query of queries) {
      logInfo(`\n處理查詢: "${query}"`);

      const mockShared: ChatSharedState = {
        userMessage: {
          message: query,
          timestamp: new Date().toISOString() as any,
          sender: "user",
          isVisible: true,
        },
        chatHistory: [],
      };

      // 選擇工具
      const result = await agent.selectTools(query, tools, mockShared);

      logInfo(`推薦工具: ${result.primaryTool?.name || "無"}`);
      logInfo(`信心度: ${(result.confidence * 100).toFixed(1)}%`);
      logInfo(`建議動作: ${result.suggestedAction}`);
      logInfo(`選擇原因: ${result.selectionReason}`);

      // 模擬工具使用反饋
      if (result.primaryTool) {
        await agent.recordFeedback(
          result.primaryTool.name,
          true, // 成功
          Math.random() * 1000 + 100, // 隨機執行時間
          Math.floor(Math.random() * 2) + 4 // 4-5分滿意度
        );
      }
    }

    // 5. 查看統計信息
    const stats = await agent.getToolStatistics();
    logInfo("\n=== 智能工具選擇統計 ===");
    logInfo(JSON.stringify(stats, null, 2));

    logInfo("智能工具選擇演示完成");
  } catch (error) {
    logError("智能工具選擇演示失敗:", error);
  }
}

// 運行演示（僅在直接執行此文件時）
if (require.main === module) {
  demonstrateSmartToolSelection().catch(console.error);
}
