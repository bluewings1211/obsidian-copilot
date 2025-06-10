import { ChatBatchNode } from "../nodes";
import { ChatSharedState } from "../types";
import { ToolManager } from "@/tools/toolManager";
import { McpToolCall } from "@/sharedState";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { getSettings } from "@/settings/model";
import { logInfo, logError } from "@/logger";

/**
 * MCP 工具執行任務介面
 */
export interface McpToolTask {
  toolCall: any;
  index: number;
}

/**
 * MCP 工具執行結果介面
 */
export interface McpToolResult {
  toolName: string;
  originalToolName: string;
  serverName: string;
  output: any;
  success: boolean;
  error?: string;
  duration: number;
  mcpToolCall: McpToolCall;
}

/**
 * MCP 工具批次處理節點
 * 專門處理 MCP 工具的批量執行
 */
export class McpToolsNode extends ChatBatchNode {
  constructor(maxRetries: number = 2, wait: number = 500) {
    super("MCP 工具執行", maxRetries, wait);
  }

  /**
   * 準備 MCP 工具執行任務
   */
  async prep(shared: ChatSharedState): Promise<McpToolTask[]> {
    this.updateCurrentStep(shared);

    if (this.shouldAbort(shared)) {
      return [];
    }

    // 檢查 MCP 整合是否啟用
    const settings = getSettings();
    if (!settings.mcpIntegration.enabled || !McpToolAdapterManager.isInitialized()) {
      if (shared.debug) {
        logInfo("MCP 整合未啟用或未初始化");
      }
      return [];
    }

    // 過濾出 MCP 工具
    const toolCalls = shared.toolCalls || [];
    const mcpToolCalls = toolCalls.filter((toolCall) => ToolManager.isMcpTool(toolCall.tool));

    if (mcpToolCalls.length === 0) {
      if (shared.debug) {
        logInfo("沒有 MCP 工具需要執行");
      }
      return [];
    }

    // 創建執行任務
    const tasks: McpToolTask[] = mcpToolCalls.map((toolCall, index) => ({
      toolCall,
      index,
    }));

    if (shared.debug) {
      logInfo(`準備執行 ${tasks.length} 個 MCP 工具`);
    }

    return tasks;
  }

  /**
   * 執行單個 MCP 工具
   */
  async exec(task: McpToolTask): Promise<McpToolResult> {
    const { toolCall } = task;
    const startTime = Date.now();

    // 創建 MCP 工具調用記錄
    const mcpToolCall: McpToolCall = {
      toolName: toolCall.tool.name,
      originalToolName: toolCall.tool.mcpToolName || toolCall.tool.name,
      serverName: toolCall.tool.serverName || "unknown",
      serverId: toolCall.tool.serverId || "unknown",
      arguments: toolCall.args || {},
      status: "pending",
      startTime,
    };

    // 注意：載入訊息更新需要在外層處理，因為 BatchNode 的 exec 方法無法直接訪問 shared

    try {
      // 執行 MCP 工具
      const output = await ToolManager.callTool(toolCall.tool, toolCall.args);
      const duration = Date.now() - startTime;

      // 更新成功狀態
      mcpToolCall.status = "success";
      mcpToolCall.result = output;
      mcpToolCall.endTime = Date.now();
      mcpToolCall.duration = duration;

      return {
        toolName: toolCall.tool.name,
        originalToolName: mcpToolCall.originalToolName,
        serverName: mcpToolCall.serverName,
        output,
        success: true,
        duration,
        mcpToolCall,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 更新錯誤狀態
      mcpToolCall.status = "error";
      mcpToolCall.error = errorMessage;
      mcpToolCall.endTime = Date.now();
      mcpToolCall.duration = duration;

      logError(`MCP 工具 ${mcpToolCall.originalToolName} 執行失敗: ${errorMessage}`);

      return {
        toolName: toolCall.tool.name,
        originalToolName: mcpToolCall.originalToolName,
        serverName: mcpToolCall.serverName,
        output: null,
        success: false,
        error: errorMessage,
        duration,
        mcpToolCall,
      };
    }
  }

  /**
   * 處理所有 MCP 工具執行結果
   */
  async post(
    shared: ChatSharedState,
    tasks: McpToolTask[],
    results: McpToolResult[]
  ): Promise<string | undefined> {
    if (this.shouldAbort(shared)) {
      return undefined;
    }

    // 收集執行結果
    const mcpToolCalls: McpToolCall[] = [];
    const toolOutputs: any[] = [];

    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      // 收集 MCP 工具調用記錄
      mcpToolCalls.push(result.mcpToolCall);

      // 收集工具輸出
      toolOutputs.push({
        tool: result.toolName,
        output: result.output,
      });

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    // 更新共享狀態
    shared.mcpToolCalls = [...(shared.mcpToolCalls || []), ...mcpToolCalls];
    shared.toolOutputs = [...(shared.toolOutputs || []), ...toolOutputs];

    if (shared.debug) {
      logInfo(`MCP 工具執行完成: ${successCount} 成功, ${errorCount} 失敗`);
      logInfo("MCP 工具調用記錄:", mcpToolCalls);
    }

    // 決定下一步行動
    if (successCount > 0) {
      return "mcp_tools_success";
    } else if (errorCount > 0) {
      return "mcp_tools_error";
    } else {
      return "mcp_tools_empty";
    }
  }

  /**
   * 錯誤處理回退
   */
  async execFallback(task: McpToolTask, error: Error): Promise<McpToolResult> {
    const { toolCall } = task;
    const errorMessage = error.message || "MCP 工具執行失敗";

    logError(`MCP 工具 ${toolCall.tool.name} 最終執行失敗: ${errorMessage}`);

    // 創建失敗的調用記錄
    const mcpToolCall: McpToolCall = {
      toolName: toolCall.tool.name,
      originalToolName: toolCall.tool.mcpToolName || toolCall.tool.name,
      serverName: toolCall.tool.serverName || "unknown",
      serverId: toolCall.tool.serverId || "unknown",
      arguments: toolCall.args || {},
      status: "error",
      error: errorMessage,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 0,
    };

    return {
      toolName: toolCall.tool.name,
      originalToolName: mcpToolCall.originalToolName,
      serverName: mcpToolCall.serverName,
      output: null,
      success: false,
      error: errorMessage,
      duration: 0,
      mcpToolCall,
    };
  }
}
