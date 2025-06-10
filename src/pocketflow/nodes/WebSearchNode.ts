import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import { webSearchTool } from "@/tools/SearchTools";
import { ToolManager } from "@/tools/toolManager";
import { LOADING_MESSAGES } from "@/constants";
import { logInfo, logError } from "@/logger";

/**
 * 網頁搜索節點
 * 專門處理網路搜索功能
 */
export class WebSearchNode extends ChatBaseNode {
  constructor(maxRetries: number = 2, wait: number = 1000) {
    super("網頁搜索", maxRetries, wait);
  }

  /**
   * 準備搜索參數
   */
  protected async prepareData(shared: ChatSharedState): Promise<any> {
    const { userMessage, chatHistory } = shared;

    if (!userMessage) {
      throw new Error("缺少用戶消息");
    }

    // 更新載入狀態
    shared.updateLoadingMessage?.(LOADING_MESSAGES.SEARCHING_WEB);

    // 準備搜索參數
    const searchParams = {
      query: userMessage.message,
      chatHistory: this.formatChatHistory(chatHistory || []),
    };

    if (shared.debug) {
      logInfo("網頁搜索參數:", searchParams);
    }

    return searchParams;
  }

  /**
   * 執行網頁搜索
   */
  async exec(searchParams: any): Promise<string> {
    try {
      const result = await ToolManager.callTool(webSearchTool, searchParams);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`網頁搜索失敗: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 處理搜索結果
   */
  protected async processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: string
  ): Promise<void> {
    // 網頁搜索的結果通常是格式化的文本，包含搜索結果和來源
    shared.webSearchResult = execRes;

    // 提取來源信息（如果結果中包含）
    const sources = this.extractSourcesFromResult(execRes);
    if (sources.length > 0) {
      shared.sources = [...(shared.sources || []), ...sources];
    }

    if (shared.debug) {
      logInfo("網頁搜索完成，結果長度:", execRes?.length || 0);
    }

    // 重置載入訊息
    shared.updateLoadingMessage?.(LOADING_MESSAGES.DEFAULT);
  }

  /**
   * 決定下一步行動
   */
  protected getNextAction(
    shared: ChatSharedState,
    prepRes: any,
    execRes: string
  ): string | undefined {
    const hasResults = execRes && execRes.trim().length > 0;

    if (hasResults) {
      return "web_search_success";
    } else {
      return "web_search_empty";
    }
  }

  /**
   * 格式化聊天歷史為工具所需的格式
   */
  private formatChatHistory(chatHistory: any[]): [string, string][] {
    const formatted: [string, string][] = [];

    for (let i = 0; i < chatHistory.length - 1; i += 2) {
      const userMsg = chatHistory[i];
      const aiMsg = chatHistory[i + 1];

      if (userMsg && aiMsg) {
        formatted.push([
          typeof userMsg === "string" ? userMsg : userMsg.message || "",
          typeof aiMsg === "string" ? aiMsg : aiMsg.message || "",
        ]);
      }
    }

    return formatted;
  }

  /**
   * 從搜索結果中提取來源信息
   */
  private extractSourcesFromResult(result: string): { title: string; score: number }[] {
    const sources: { title: string; score: number }[] = [];

    // 尋找 Markdown 格式的來源連結
    const sourceRegex = /- \[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let index = 1;

    while ((match = sourceRegex.exec(result)) !== null) {
      sources.push({
        title: match[1],
        score: 1.0 - index * 0.1, // 給予遞減的分數
      });
      index++;
    }

    return sources;
  }

  /**
   * 錯誤處理回退
   */
  async execFallback(searchParams: any, error: Error): Promise<string> {
    logError(`網頁搜索最終失敗: ${error.message}`);

    // 返回錯誤訊息給用戶
    if (error.message.includes("API key")) {
      return "網頁搜索功能需要設定 API 金鑰。請在設定中添加 Brave Search API 金鑰。";
    }

    return `網頁搜索暫時無法使用: ${error.message}`;
  }
}
