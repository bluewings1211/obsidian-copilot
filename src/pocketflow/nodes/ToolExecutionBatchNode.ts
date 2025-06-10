import { ChatBatchNode } from "../nodes";
import { ChatSharedState } from "../types";
import { ToolManager } from "@/tools/toolManager";
import { McpToolCall } from "@/sharedState";
import { LOADING_MESSAGES } from "@/constants";
import { logInfo, logError } from "@/logger";

/**
 * 工具執行結果介面
 */
export interface ToolExecutionResult {
  toolName: string;
  output: any;
  success: boolean;
  error?: string;
  duration: number;
  isMcpTool: boolean;
  mcpToolCall?: McpToolCall;
}

/**
 * 工具執行任務介面
 */
export interface ToolExecutionTask {
  toolCall: any;
  index: number;
}

/**
 * 工具執行批次處理節點
 * 支援平行處理多個工具調用，包括本地搜索、網頁搜索和 MCP 工具
 */
export class ToolExecutionBatchNode extends ChatBatchNode {
  constructor(maxRetries: number = 3, wait: number = 1000) {
    super("工具執行", maxRetries, wait);
  }

  /**
   * 準備工具執行任務
   */
  async prep(shared: ChatSharedState): Promise<ToolExecutionTask[]> {
    this.updateCurrentStep(shared);

    if (this.shouldAbort(shared)) {
      return [];
    }

    const toolCalls = shared.toolCalls || [];
    if (toolCalls.length === 0) {
      if (shared.debug) {
        logInfo("沒有工具需要執行");
      }
      return [];
    }

    // 創建執行任務列表
    const tasks: ToolExecutionTask[] = toolCalls.map((toolCall, index) => ({
      toolCall,
      index,
    }));

    if (shared.debug) {
      logInfo(`準備執行 ${tasks.length} 個工具`);
    }

    return tasks;
  }

  /**
   * 執行單個工具
   */
  async exec(task: ToolExecutionTask): Promise<ToolExecutionResult> {
    const { toolCall } = task;
    const startTime = Date.now();

    // 檢查是否為 MCP 工具
    const isMcpTool = ToolManager.isMcpTool(toolCall.tool);

    let mcpToolCall: McpToolCall | undefined;

    // 為 MCP 工具創建追蹤記錄
    if (isMcpTool) {
      mcpToolCall = {
        toolName: toolCall.tool.name,
        originalToolName: toolCall.tool.mcpToolName || toolCall.tool.name,
        serverName: toolCall.tool.serverName || "unknown",
        serverId: toolCall.tool.serverId || "unknown",
        arguments: toolCall.args || {},
        status: "pending",
        startTime,
      };
    }

    try {
      // 執行工具
      const output = await ToolManager.callTool(toolCall.tool, toolCall.args);
      const duration = Date.now() - startTime;

      // 更新 MCP 工具調用狀態
      if (mcpToolCall) {
        mcpToolCall.status = "success";
        mcpToolCall.result = output;
        mcpToolCall.endTime = Date.now();
        mcpToolCall.duration = duration;
      }

      return {
        toolName: toolCall.tool.name,
        output,
        success: true,
        duration,
        isMcpTool,
        mcpToolCall,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 更新 MCP 工具調用錯誤狀態
      if (mcpToolCall) {
        mcpToolCall.status = "error";
        mcpToolCall.error = errorMessage;
        mcpToolCall.endTime = Date.now();
        mcpToolCall.duration = duration;
      }

      logError(`工具 ${toolCall.tool.name} 執行失敗: ${errorMessage}`);

      return {
        toolName: toolCall.tool.name,
        output: null,
        success: false,
        error: errorMessage,
        duration,
        isMcpTool,
        mcpToolCall,
      };
    }
  }

  /**
   * 處理所有工具執行結果
   */
  async post(
    shared: ChatSharedState,
    tasks: ToolExecutionTask[],
    results: ToolExecutionResult[]
  ): Promise<string | undefined> {
    if (this.shouldAbort(shared)) {
      return undefined;
    }

    // 處理執行結果
    const toolOutputs: any[] = [];
    const mcpToolCalls: McpToolCall[] = [];

    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.success) {
        successCount++;
        toolOutputs.push({
          tool: result.toolName,
          output: result.output,
        });
      } else {
        errorCount++;
        // 即使失敗也添加到輸出中，保持與原始邏輯一致
        toolOutputs.push({
          tool: result.toolName,
          output: result.output,
        });
      }

      // 收集 MCP 工具調用記錄
      if (result.mcpToolCall) {
        mcpToolCalls.push(result.mcpToolCall);
      }
    }

    // 更新共享狀態
    shared.toolOutputs = toolOutputs;
    shared.mcpToolCalls = mcpToolCalls;

    if (shared.debug) {
      logInfo(`工具執行完成: ${successCount} 成功, ${errorCount} 失敗`);
      logInfo("工具輸出:", toolOutputs);
      if (mcpToolCalls.length > 0) {
        logInfo("MCP 工具調用記錄:", mcpToolCalls);
      }
    }

    // 重置載入訊息
    shared.updateLoadingMessage?.(LOADING_MESSAGES.DEFAULT);

    return "default";
  }

  /**
   * 更新載入訊息基於工具類型
   */
  protected updateLoadingMessageForTool(toolName: string, shared: ChatSharedState): void {
    const { updateLoadingMessage } = shared;
    if (!updateLoadingMessage) return;

    switch (toolName) {
      case "localSearch":
        updateLoadingMessage(LOADING_MESSAGES.READING_FILES);
        break;
      case "webSearch":
        updateLoadingMessage(LOADING_MESSAGES.SEARCHING_WEB);
        break;
      case "getFileTree":
        updateLoadingMessage(LOADING_MESSAGES.READING_FILE_TREE);
        break;
      default: {
        // 檢查是否為 MCP 工具
        const toolCall = shared.toolCalls?.find((tc) => tc.tool.name === toolName);
        if (toolCall && ToolManager.isMcpTool(toolCall.tool)) {
          updateLoadingMessage(`執行 MCP 工具: ${toolCall.tool.originalToolName || toolName}`);
        }
        break;
      }
    }
  }

  /**
   * 錯誤處理回退
   */
  async execFallback(task: ToolExecutionTask, error: Error): Promise<ToolExecutionResult> {
    const { toolCall } = task;
    const errorMessage = error.message || "工具執行失敗";

    logError(`工具 ${toolCall.tool.name} 最終執行失敗: ${errorMessage}`);

    return {
      toolName: toolCall.tool.name,
      output: null,
      success: false,
      error: errorMessage,
      duration: 0,
      isMcpTool: ToolManager.isMcpTool(toolCall.tool),
    };
  }
}
