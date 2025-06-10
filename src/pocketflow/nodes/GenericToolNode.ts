import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import { ToolManager } from "@/tools/toolManager";
import { logInfo, logError } from "@/logger";

/**
 * 通用工具節點
 * 處理單個工具的執行，適用於各種類型的工具
 */
export class GenericToolNode extends ChatBaseNode {
  private tool: any;
  private toolArgs: any;

  constructor(
    tool: any,
    toolArgs: any = {},
    stepName?: string,
    maxRetries: number = 2,
    wait: number = 500
  ) {
    super(stepName || `工具執行: ${tool?.name || "Unknown"}`, maxRetries, wait);
    this.tool = tool;
    this.toolArgs = toolArgs;
  }

  /**
   * 準備工具執行參數
   */
  protected async prepareData(shared: ChatSharedState): Promise<any> {
    if (!this.tool) {
      throw new Error("工具未定義");
    }

    // 合併傳入的參數和共享狀態中的參數
    const finalArgs = { ...this.toolArgs };

    // 如果工具需要用戶消息，從共享狀態中提取
    if (this.tool.name === "getCurrentTime" || this.tool.name === "getTimeRangeMs") {
      finalArgs.userMessage = shared.userMessage?.message || "";
    }

    // 如果工具需要聊天歷史，從共享狀態中提取
    if (this.tool.name === "webSearch") {
      finalArgs.chatHistory = this.formatChatHistory(shared.chatHistory || []);
    }

    if (shared.debug) {
      logInfo(`準備執行工具: ${this.tool.name}`, finalArgs);
    }

    return finalArgs;
  }

  /**
   * 執行工具
   */
  async exec(toolArgs: any): Promise<any> {
    try {
      const result = await ToolManager.callTool(this.tool, toolArgs);

      if (result === null || result === undefined) {
        logInfo(`工具 ${this.tool.name} 返回空結果`);
        return null;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`工具 ${this.tool.name} 執行失敗: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 處理工具執行結果
   */
  protected async processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: any
  ): Promise<void> {
    // 將結果添加到工具輸出中
    if (!shared.toolOutputs) {
      shared.toolOutputs = [];
    }

    shared.toolOutputs.push({
      tool: this.tool.name,
      output: execRes,
    });

    // 根據工具類型進行特殊處理
    await this.handleSpecificToolResult(shared, execRes);

    if (shared.debug) {
      logInfo(`工具 ${this.tool.name} 執行完成`);
    }
  }

  /**
   * 決定下一步行動
   */
  protected getNextAction(shared: ChatSharedState, prepRes: any, execRes: any): string | undefined {
    // 根據工具類型和結果決定下一步
    if (execRes === null || execRes === undefined) {
      return "tool_no_result";
    }

    // 特定工具的路由邏輯
    switch (this.tool.name) {
      case "localSearch":
        try {
          const documents = JSON.parse(execRes);
          return documents && documents.length > 0 ? "local_search_success" : "local_search_empty";
        } catch {
          return "local_search_error";
        }

      case "webSearch":
        return execRes && execRes.trim().length > 0 ? "web_search_success" : "web_search_empty";

      case "getCurrentTime":
      case "getTimeRangeMs":
        return "time_tool_success";

      case "getFileTree":
        return "file_tree_success";

      default:
        return "tool_success";
    }
  }

  /**
   * 處理特定工具的結果
   */
  private async handleSpecificToolResult(shared: ChatSharedState, execRes: any): Promise<void> {
    switch (this.tool.name) {
      case "localSearch":
        try {
          const documents = JSON.parse(execRes);
          shared.localSearchResults = documents;
          shared.retrievedDocuments = documents;

          if (documents && Array.isArray(documents)) {
            shared.sources = this.extractSourcesFromDocuments(documents);
          }
        } catch (error) {
          logError("處理本地搜索結果失敗:", error);
        }
        break;

      case "webSearch": {
        shared.webSearchResult = execRes;
        const sources = this.extractSourcesFromWebResult(execRes);
        if (sources.length > 0) {
          shared.sources = [...(shared.sources || []), ...sources];
        }
        break;
      }

      case "getCurrentTime":
      case "getTimeRangeMs":
        if (!shared.context) {
          shared.context = {};
        }
        shared.context.timeExpression = execRes;
        break;
    }
  }

  /**
   * 從文檔中提取來源信息
   */
  private extractSourcesFromDocuments(documents: any[]): { title: string; score: number }[] {
    if (!documents || !Array.isArray(documents)) {
      return [];
    }

    const uniqueDocs = new Map<string, any>();

    for (const doc of documents) {
      if (!doc.title || (!doc?.score && !doc?.rerank_score)) {
        continue;
      }

      const currentDoc = uniqueDocs.get(doc.title);
      const isReranked = doc && "rerank_score" in doc;
      const docScore = isReranked ? doc.rerank_score : doc.score;

      if (!currentDoc || docScore > (currentDoc.score ?? 0)) {
        uniqueDocs.set(doc.title, {
          title: doc.title,
          score: docScore,
          isReranked: isReranked,
        });
      }
    }

    return Array.from(uniqueDocs.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  /**
   * 從網頁搜索結果中提取來源信息
   */
  private extractSourcesFromWebResult(result: string): { title: string; score: number }[] {
    const sources: { title: string; score: number }[] = [];

    const sourceRegex = /- \[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let index = 1;

    while ((match = sourceRegex.exec(result)) !== null) {
      sources.push({
        title: match[1],
        score: 1.0 - index * 0.1,
      });
      index++;
    }

    return sources;
  }

  /**
   * 格式化聊天歷史
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
   * 錯誤處理回退
   */
  async execFallback(toolArgs: any, error: Error): Promise<any> {
    logError(`工具 ${this.tool.name} 最終執行失敗: ${error.message}`);

    // 根據工具類型返回適當的回退值
    switch (this.tool.name) {
      case "localSearch":
        return JSON.stringify([]);
      case "webSearch":
        return `網頁搜索暫時無法使用: ${error.message}`;
      case "getCurrentTime":
        return new Date().toISOString();
      case "getFileTree":
        return JSON.stringify({ error: "無法讀取檔案樹" });
      default:
        return null;
    }
  }
}
