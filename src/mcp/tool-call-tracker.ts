/**
 * MCP Tool Call Tracker
 *
 * 用於跟蹤 MCP 工具調用的狀態並更新聊天介面
 */

import { McpToolCall } from "@/sharedState";
import { McpToolAdapterManager } from "./tool-adapter";

export interface ToolCallUpdate {
  messageIndex: number;
  toolCallIndex: number;
  update: Partial<McpToolCall>;
}

export type ToolCallUpdateCallback = (update: ToolCallUpdate) => void;

/**
 * MCP 工具調用跟蹤器
 */
export class McpToolCallTracker {
  private static callbacks: Set<ToolCallUpdateCallback> = new Set();
  private static activeCalls: Map<string, McpToolCall> = new Map();

  /**
   * 註冊更新回調函數
   */
  public static addUpdateCallback(callback: ToolCallUpdateCallback): void {
    this.callbacks.add(callback);
  }

  /**
   * 移除更新回調函數
   */
  public static removeUpdateCallback(callback: ToolCallUpdateCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * 開始跟蹤工具調用
   */
  public static startTracking(
    messageIndex: number,
    toolCallIndex: number,
    toolCall: Omit<McpToolCall, "status" | "startTime">
  ): string {
    const id = `${messageIndex}-${toolCallIndex}`;
    const fullToolCall: McpToolCall = {
      ...toolCall,
      status: "pending",
      startTime: Date.now(),
    };

    this.activeCalls.set(id, fullToolCall);

    // 通知所有回調函數
    this.notifyCallbacks({
      messageIndex,
      toolCallIndex,
      update: fullToolCall,
    });

    return id;
  }

  /**
   * 更新工具調用狀態
   */
  public static updateCall(id: string, update: Partial<McpToolCall>): void {
    const existingCall = this.activeCalls.get(id);
    if (!existingCall) {
      console.warn(`Tool call ${id} not found for update`);
      return;
    }

    const updatedCall = { ...existingCall, ...update };
    this.activeCalls.set(id, updatedCall);

    // 解析 ID 以獲取 messageIndex 和 toolCallIndex
    const [messageIndex, toolCallIndex] = id.split("-").map(Number);

    this.notifyCallbacks({
      messageIndex,
      toolCallIndex,
      update: updatedCall,
    });
  }

  /**
   * 完成工具調用（成功）
   */
  public static completeCall(id: string, result: any): void {
    const existingCall = this.activeCalls.get(id);
    if (!existingCall) {
      console.warn(`Tool call ${id} not found for completion`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - existingCall.startTime;

    this.updateCall(id, {
      status: "success",
      result,
      endTime,
      duration,
    });

    // 清理已完成的調用
    setTimeout(() => {
      this.activeCalls.delete(id);
    }, 5000); // 5秒後清理
  }

  /**
   * 標記工具調用失敗
   */
  public static failCall(id: string, error: string): void {
    const existingCall = this.activeCalls.get(id);
    if (!existingCall) {
      console.warn(`Tool call ${id} not found for failure`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - existingCall.startTime;

    this.updateCall(id, {
      status: "error",
      error,
      endTime,
      duration,
    });

    // 清理失敗的調用
    setTimeout(() => {
      this.activeCalls.delete(id);
    }, 10000); // 10秒後清理，讓用戶有時間查看錯誤
  }

  /**
   * 獲取活躍的工具調用
   */
  public static getActiveCalls(): Map<string, McpToolCall> {
    return new Map(this.activeCalls);
  }

  /**
   * 清理所有活躍的工具調用
   */
  public static clearAll(): void {
    this.activeCalls.clear();
  }

  /**
   * 通知所有回調函數
   */
  private static notifyCallbacks(update: ToolCallUpdate): void {
    for (const callback of this.callbacks) {
      try {
        callback(update);
      } catch (error) {
        console.error("Error in tool call update callback:", error);
      }
    }
  }

  /**
   * 創建工具調用包裝器，自動跟蹤執行狀態
   */
  public static createTrackedToolCall(
    messageIndex: number,
    toolCallIndex: number,
    toolCall: Omit<McpToolCall, "status" | "startTime">
  ) {
    const id = this.startTracking(messageIndex, toolCallIndex, toolCall);

    return {
      id,
      execute: async (): Promise<any> => {
        try {
          const adapter = McpToolAdapterManager.getInstance();
          const result = await adapter.callTool(toolCall.toolName, toolCall.arguments);
          this.completeCall(id, result);
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.failCall(id, errorMessage);
          throw error;
        }
      },
    };
  }
}

export default McpToolCallTracker;
