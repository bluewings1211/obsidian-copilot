import { useCallback, useEffect, useState } from "react";
import { FormattedDateTime } from "./utils";
import { TFile } from "obsidian";

export interface ChatMessage {
  message: string;
  originalMessage?: string;
  sender: string;
  timestamp: FormattedDateTime | null;
  isVisible: boolean;
  sources?: { title: string; score: number }[];
  content?: any[];
  context?: {
    notes: TFile[];
    urls: string[];
  };
  isErrorMessage?: boolean;
  mcpToolCalls?: McpToolCall[];
}

/**
 * MCP 工具調用資訊
 */
export interface McpToolCall {
  /** 工具名稱（包含伺服器前綴） */
  toolName: string;
  /** 原始 MCP 工具名稱 */
  originalToolName: string;
  /** 伺服器名稱 */
  serverName: string;
  /** 伺服器 ID */
  serverId: string;
  /** 工具參數 */
  arguments: any;
  /** 調用狀態 */
  status: "pending" | "success" | "error";
  /** 開始時間 */
  startTime: number;
  /** 結束時間 */
  endTime?: number;
  /** 工具結果 */
  result?: any;
  /** 錯誤訊息 */
  error?: string;
  /** 執行時間（毫秒） */
  duration?: number;
}

class SharedState {
  chatHistory: ChatMessage[] = [];

  addMessage(message: ChatMessage): void {
    this.chatHistory.push(message);
  }

  getMessages(): ChatMessage[] {
    return this.chatHistory;
  }

  clearChatHistory(): void {
    this.chatHistory = [];
  }
}

export function useSharedState(
  sharedState: SharedState
): [ChatMessage[], (message: ChatMessage) => void, () => void] {
  // Initializes the local chatHistory state with the current
  // sharedState chatHistory using the useState hook
  // setChatHistory is used to update the *local* state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(sharedState.getMessages());

  // The useEffect hook ensures that the local state is synchronized
  // with the shared state when the component is mounted.
  // [] is the dependency array. The effect will only run if one of
  // the dependencies has changed since the last render.
  // When there are no dependencies, the effect will only run once,
  // *right after the initial render* (similar to componentDidMount in class components).
  useEffect(() => {
    setChatHistory(sharedState.getMessages());
  }, [sharedState]);

  const addMessage = useCallback(
    (message: ChatMessage) => {
      sharedState.addMessage(message);
      setChatHistory([...sharedState.getMessages()]);
    },
    [sharedState]
  );

  const clearMessages = useCallback(() => {
    sharedState.clearChatHistory();
    setChatHistory([]);
  }, [sharedState]);

  return [chatHistory, addMessage, clearMessages];
}

export default SharedState;
