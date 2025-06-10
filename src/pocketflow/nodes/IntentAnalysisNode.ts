import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import { BrevilabsClient } from "@/LLMProviders/brevilabsClient";
import { ToolManager } from "@/tools/toolManager";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { getSettings } from "@/settings/model";
import { extractChatHistory, extractYoutubeUrl } from "@/utils";
import MemoryManager from "@/LLMProviders/memoryManager";
import { logInfo, logError } from "@/logger";
import { indexTool, localSearchTool, webSearchTool } from "@/tools/SearchTools";
import {
  getCurrentTimeTool,
  getTimeInfoByEpochTool,
  getTimeRangeMsTool,
  pomodoroTool,
  TimeInfo,
} from "@/tools/TimeTools";
import { createGetFileTreeTool } from "@/tools/FileTreeTools";
import { Vault } from "obsidian";
import type { McpToolWrapper } from "@/mcp/tool-adapter";

/**
 * 意圖分析結果介面
 */
export interface IntentAnalysisResult {
  toolCalls: ToolCall[];
  detectedTools: string[];
  salientTerms: string[];
  timeRange?: { startTime: TimeInfo; endTime: TimeInfo };
  suggestedAction: IntentAction;
}

/**
 * 工具調用介面
 */
export interface ToolCall {
  tool: any;
  args: any;
}

/**
 * 意圖動作類型
 */
export type IntentAction =
  | "local_search"
  | "web_search"
  | "mcp_tools"
  | "direct_llm"
  | "tool_execution";

/**
 * 意圖分析 Node
 *
 * 負責分析用戶訊息的意圖，包括：
 * - 使用 Broca 服務進行智能意圖分析
 * - 處理 @ 命令
 * - 檢測 MCP 工具調用
 * - 決定後續的路由動作
 */
export class IntentAnalysisNode extends ChatBaseNode {
  private static tools: any[] = [];
  private static mcpTools: McpToolWrapper[] = [];
  private vault: Vault;

  constructor(vault: Vault, maxRetries: number = 1, wait: number = 0) {
    super("意圖分析", maxRetries, wait);
    this.vault = vault;
    this.initializeTools();
  }

  /**
   * 初始化工具集
   */
  private initializeTools(): void {
    if (IntentAnalysisNode.tools.length === 0) {
      IntentAnalysisNode.tools = [
        getCurrentTimeTool,
        getTimeInfoByEpochTool,
        getTimeRangeMsTool,
        localSearchTool,
        indexTool,
        pomodoroTool,
        webSearchTool,
        createGetFileTreeTool(this.vault.getRoot()),
      ];
    }

    // 刷新 MCP 工具
    this.refreshMcpTools();
  }

  /**
   * 刷新 MCP 工具列表
   */
  private async refreshMcpTools(): Promise<void> {
    try {
      const settings = getSettings();
      if (settings.mcpIntegration.enabled && McpToolAdapterManager.isInitialized()) {
        const adapter = McpToolAdapterManager.getInstance();
        IntentAnalysisNode.mcpTools = await adapter.getTools();
      } else {
        IntentAnalysisNode.mcpTools = [];
      }
    } catch (error) {
      logError("無法刷新 MCP 工具:", error);
      IntentAnalysisNode.mcpTools = [];
    }
  }

  /**
   * 獲取所有可用工具
   */
  private async getAllTools(): Promise<any[]> {
    await this.refreshMcpTools();
    return [...IntentAnalysisNode.tools, ...IntentAnalysisNode.mcpTools];
  }

  /**
   * 準備數據
   */
  protected async prepareData(shared: ChatSharedState): Promise<string> {
    if (!shared.userMessage?.message) {
      throw new Error("用戶訊息不能為空");
    }

    if (shared.debug) {
      logInfo(`分析用戶訊息: ${shared.userMessage.message}`);
    }

    return shared.userMessage.message;
  }

  /**
   * 執行意圖分析
   */
  async exec(originalMessage: string): Promise<IntentAnalysisResult> {
    const processedToolCalls: ToolCall[] = [];
    let timeRange: { startTime: TimeInfo; endTime: TimeInfo } | undefined;
    let salientTerms: string[] = [];
    const detectedTools: string[] = [];

    try {
      // 嘗試使用 Broca 服務進行智能分析
      const brocaResult = await this.performBrocaAnalysis(originalMessage);
      if (brocaResult) {
        processedToolCalls.push(...brocaResult.toolCalls);
        salientTerms = brocaResult.salientTerms;
        timeRange = brocaResult.timeRange;
        detectedTools.push(...brocaResult.detectedTools);
      }
    } catch (brocaError) {
      logError("Broca 服務不可用，回退至基本處理:", brocaError);
      // 提取基本顯著詞彙
      salientTerms = this.extractBasicSalientTerms(originalMessage);
    }

    // 處理 @ 命令
    const atCommandResult = await this.processAtCommands(originalMessage, {
      timeRange,
      salientTerms,
    });
    processedToolCalls.push(...atCommandResult.toolCalls);
    detectedTools.push(...atCommandResult.detectedTools);

    // 處理 MCP 工具調用
    const mcpResult = await this.processMcpToolCalls(originalMessage);
    processedToolCalls.push(...mcpResult.toolCalls);
    detectedTools.push(...mcpResult.detectedTools);

    // 決定建議的動作
    const suggestedAction = this.determineSuggestedAction(detectedTools, processedToolCalls);

    return {
      toolCalls: processedToolCalls,
      detectedTools,
      salientTerms,
      timeRange,
      suggestedAction,
    };
  }

  /**
   * 執行 Broca 分析
   */
  private async performBrocaAnalysis(message: string): Promise<{
    toolCalls: ToolCall[];
    salientTerms: string[];
    timeRange?: { startTime: TimeInfo; endTime: TimeInfo };
    detectedTools: string[];
  } | null> {
    const brocaResponse = await BrevilabsClient.getInstance().broca(message);

    if (!brocaResponse?.response) {
      return null;
    }

    const brocaToolCalls = brocaResponse.response.tool_calls;
    const salientTerms = brocaResponse.response.salience_terms || [];
    const allTools = await this.getAllTools();
    const toolCalls: ToolCall[] = [];
    const detectedTools: string[] = [];
    let timeRange: { startTime: TimeInfo; endTime: TimeInfo } | undefined;

    // 處理 Broca 工具調用
    for (const brocaToolCall of brocaToolCalls) {
      const tool = allTools.find((t) => t.name === brocaToolCall.tool);
      if (tool) {
        const args = brocaToolCall.args || {};
        detectedTools.push(tool.name);

        if (tool.name === "getTimeRangeMs") {
          timeRange = await ToolManager.callTool(tool, args);
        }

        toolCalls.push({ tool, args });
      }
    }

    return {
      toolCalls,
      salientTerms,
      timeRange,
      detectedTools,
    };
  }

  /**
   * 處理 @ 命令
   */
  private async processAtCommands(
    originalMessage: string,
    context: {
      timeRange?: { startTime: TimeInfo; endTime: TimeInfo };
      salientTerms: string[];
    }
  ): Promise<{ toolCalls: ToolCall[]; detectedTools: string[] }> {
    const message = originalMessage.toLowerCase();
    const { timeRange, salientTerms } = context;
    const toolCalls: ToolCall[] = [];
    const detectedTools: string[] = [];

    // 處理 @vault 命令
    if (message.includes("@vault") && (salientTerms.length > 0 || timeRange)) {
      const cleanQuery = await this.removeAtCommands(originalMessage);
      toolCalls.push({
        tool: localSearchTool,
        args: {
          timeRange: timeRange || undefined,
          query: cleanQuery,
          salientTerms,
        },
      });
      detectedTools.push("@vault");
    }

    // 處理 @web 命令
    if (message.includes("@web")) {
      const cleanQuery = await this.removeAtCommands(originalMessage);
      const memory = MemoryManager.getInstance().getMemory();
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = extractChatHistory(memoryVariables);

      toolCalls.push({
        tool: webSearchTool,
        args: {
          query: cleanQuery,
          chatHistory,
        },
      });
      detectedTools.push("@web");
    }

    // 處理 @pomodoro 命令
    if (message.includes("@pomodoro")) {
      const pomodoroMatch = originalMessage.match(/@pomodoro\s+(\S+)/i);
      const interval = pomodoroMatch ? pomodoroMatch[1] : "25min";
      toolCalls.push({
        tool: pomodoroTool,
        args: { interval },
      });
      detectedTools.push("@pomodoro");
    }

    // 處理 @youtube 命令（目前已停用）
    if (message.includes("@youtube")) {
      const youtubeUrl = extractYoutubeUrl(originalMessage);
      if (youtubeUrl) {
        logError("YouTube 轉錄工具目前已停用");
        detectedTools.push("@youtube");
      }
    }

    return { toolCalls, detectedTools };
  }

  /**
   * 處理 MCP 工具調用
   */
  private async processMcpToolCalls(
    originalMessage: string
  ): Promise<{ toolCalls: ToolCall[]; detectedTools: string[] }> {
    const toolCalls: ToolCall[] = [];
    const detectedTools: string[] = [];

    try {
      const settings = getSettings();
      if (!settings.mcpIntegration.enabled || !McpToolAdapterManager.isInitialized()) {
        return { toolCalls, detectedTools };
      }

      const adapter = McpToolAdapterManager.getInstance();
      const mcpTools = await adapter.getTools();

      // 尋找明確的 MCP 工具提及
      const mcpToolMentions = originalMessage.match(/@mcp_\w+_\w+/g) || [];

      for (const mention of mcpToolMentions) {
        const toolName = mention.substring(1); // 移除 @
        const tool = mcpTools.find((t) => t.name === toolName);

        if (tool) {
          const args = this.extractMcpToolArguments(originalMessage, mention, tool);
          toolCalls.push({
            tool,
            args,
          });
          detectedTools.push(toolName);
        }
      }
    } catch (error) {
      logError("無法處理 MCP 工具調用:", error);
    }

    return { toolCalls, detectedTools };
  }

  /**
   * 提取 MCP 工具參數
   */
  private extractMcpToolArguments(originalMessage: string, toolMention: string, tool: any): any {
    const toolIndex = originalMessage.indexOf(toolMention);
    const contentAfterTool = originalMessage.substring(toolIndex + toolMention.length).trim();

    if (!contentAfterTool) {
      return {};
    }

    // 特殊處理 sequential thinking 工具
    if (tool.name && tool.name.includes("sequential") && tool.name.includes("thinking")) {
      return {
        thought: contentAfterTool,
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      };
    }

    const inputSchema = tool.inputSchema;
    const args: any = {};

    if (inputSchema && inputSchema.properties) {
      const properties = inputSchema.properties;

      for (const [propName, propSchema] of Object.entries(properties)) {
        const prop = propSchema as any;

        if (propName === "thought" && prop.type === "string") {
          args[propName] = contentAfterTool;
        } else if (
          (propName === "query" ||
            propName === "prompt" ||
            propName === "question" ||
            propName === "text") &&
          prop.type === "string"
        ) {
          args[propName] = contentAfterTool;
        } else if (
          (propName === "count" ||
            propName === "limit" ||
            propName === "max" ||
            propName === "num") &&
          prop.type === "number"
        ) {
          const numberMatch = contentAfterTool.match(/\b(\d+)\b/);
          if (numberMatch) {
            args[propName] = parseInt(numberMatch[1], 10);
          }
        } else if (propName === "thoughtNumber" && prop.type === "number") {
          args[propName] = 1;
        } else if (propName === "totalThoughts" && prop.type === "number") {
          args[propName] = 3;
        } else if (prop.type === "boolean") {
          const lowerContent = contentAfterTool.toLowerCase();
          if (propName === "nextThoughtNeeded") {
            args[propName] = true;
          } else if (
            lowerContent.includes("true") ||
            lowerContent.includes("yes") ||
            lowerContent.includes("enable")
          ) {
            args[propName] = true;
          } else if (
            lowerContent.includes("false") ||
            lowerContent.includes("no") ||
            lowerContent.includes("disable")
          ) {
            args[propName] = false;
          }
        }
      }

      // 如果沒有找到特定參數但有內容，映射到第一個字符串參數
      if (Object.keys(args).length === 0 && contentAfterTool) {
        const firstStringProp = Object.entries(properties).find(
          ([_, prop]) => (prop as any).type === "string"
        );
        if (firstStringProp) {
          args[firstStringProp[0]] = contentAfterTool;
        }
      }
    } else {
      // 回退：如果沒有 schema，使用常見參數名稱
      args.query = contentAfterTool;
      args.prompt = contentAfterTool;
      args.text = contentAfterTool;
      args.question = contentAfterTool;
    }

    return args;
  }

  /**
   * 決定建議動作
   */
  private determineSuggestedAction(detectedTools: string[], toolCalls: ToolCall[]): IntentAction {
    // 優先級排序的路由決策
    if (
      detectedTools.includes("@vault") ||
      detectedTools.some((tool) => tool.includes("localSearch"))
    ) {
      return "local_search";
    }

    if (
      detectedTools.includes("@web") ||
      detectedTools.some((tool) => tool.includes("webSearch"))
    ) {
      return "web_search";
    }

    if (detectedTools.some((tool) => tool.startsWith("mcp_"))) {
      return "mcp_tools";
    }

    if (toolCalls.length > 0) {
      return "tool_execution";
    }

    return "direct_llm";
  }

  /**
   * 提取基本顯著詞彙
   */
  private extractBasicSalientTerms(message: string): string[] {
    const cleanMessage = message
      .replace(/@\w+/g, "") // 移除 @ 命令
      .replace(/[^\w\s]/g, " ") // 移除標點符號
      .toLowerCase();

    const commonWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "this",
      "that",
      "these",
      "those",
    ]);

    return cleanMessage
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word))
      .slice(0, 5);
  }

  /**
   * 移除 @ 命令
   */
  private async removeAtCommands(message: string): Promise<string> {
    const allToolNames = await this.getAllToolNames();
    return message
      .split(" ")
      .filter((word) => !allToolNames.includes(word.toLowerCase()))
      .join(" ")
      .trim();
  }

  /**
   * 獲取所有工具名稱
   */
  private async getAllToolNames(): Promise<string[]> {
    const baseTools = ["@vault", "@web", "@youtube", "@pomodoro"];

    try {
      const settings = getSettings();
      if (settings.mcpIntegration.enabled && McpToolAdapterManager.isInitialized()) {
        const adapter = McpToolAdapterManager.getInstance();
        const mcpTools = await adapter.getTools();
        const mcpToolNames = mcpTools.map((tool) => `@${tool.name}`);
        baseTools.push(...mcpToolNames);
      }
    } catch (error) {
      logError("無法獲取 MCP 工具名稱:", error);
    }

    return baseTools;
  }

  /**
   * 處理結果
   */
  protected async processResult(
    shared: ChatSharedState,
    prepRes: string,
    execRes: IntentAnalysisResult
  ): Promise<void> {
    // 儲存分析結果到共享狀態
    shared.toolCalls = execRes.toolCalls;
    shared.searchQuery = prepRes;

    if (shared.debug) {
      logInfo(`意圖分析完成:`, {
        detectedTools: execRes.detectedTools,
        suggestedAction: execRes.suggestedAction,
        toolCallsCount: execRes.toolCalls.length,
        salientTerms: execRes.salientTerms,
      });
    }
  }

  /**
   * 獲取下一步動作
   */
  protected getNextAction(
    shared: ChatSharedState,
    prepRes: string,
    execRes: IntentAnalysisResult
  ): string | undefined {
    // 基於分析結果返回相應的路由動作
    return execRes.suggestedAction;
  }

  /**
   * 錯誤回退處理
   */
  async execFallback(prepRes: unknown, error: Error): Promise<IntentAnalysisResult> {
    const message = typeof prepRes === "string" ? prepRes : "";
    logError(`意圖分析失敗，使用回退處理: ${error.message}`);

    // 提供基本的回退結果
    return {
      toolCalls: [],
      detectedTools: [],
      salientTerms: this.extractBasicSalientTerms(message),
      suggestedAction: "direct_llm",
    };
  }
}
