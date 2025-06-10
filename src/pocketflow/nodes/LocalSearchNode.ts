import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import { localSearchTool } from "@/tools/SearchTools";
import { ToolManager } from "@/tools/toolManager";
import { LOADING_MESSAGES } from "@/constants";
import { logInfo, logError } from "@/logger";

/**
 * 本地搜索節點
 * 專門處理 Vault 內的文檔搜索
 */
export class LocalSearchNode extends ChatBaseNode {
  constructor(maxRetries: number = 2, wait: number = 500) {
    super("本地搜索", maxRetries, wait);
  }

  /**
   * 準備搜索參數
   */
  protected async prepareData(shared: ChatSharedState): Promise<any> {
    const { userMessage, intentAnalysisResult } = shared;

    if (!userMessage) {
      throw new Error("缺少用戶消息");
    }

    // 更新載入狀態
    shared.updateLoadingMessage?.(LOADING_MESSAGES.READING_FILES);

    // 從意圖分析結果中提取搜索參數
    const searchQuery = userMessage.message;
    const salientTerms = intentAnalysisResult?.salientTerms || [];
    const timeRange = intentAnalysisResult?.timeRange;

    const searchParams = {
      query: searchQuery,
      salientTerms,
      timeRange,
    };

    if (shared.debug) {
      logInfo("本地搜索參數:", searchParams);
    }

    return searchParams;
  }

  /**
   * 執行本地搜索
   */
  async exec(searchParams: any): Promise<string> {
    try {
      const result = await ToolManager.callTool(localSearchTool, searchParams);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`本地搜索失敗: ${errorMessage}`);
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
    try {
      // 解析搜索結果
      const documents = JSON.parse(execRes);

      // 儲存到共享狀態
      shared.localSearchResults = documents;
      shared.retrievedDocuments = documents;

      // 提取來源信息
      if (documents && Array.isArray(documents)) {
        shared.sources = this.extractSources(documents);
      }

      if (shared.debug) {
        logInfo(`本地搜索返回 ${documents?.length || 0} 個結果`);
      }

      // 重置載入訊息
      shared.updateLoadingMessage?.(LOADING_MESSAGES.DEFAULT);
    } catch (error) {
      logError("處理本地搜索結果失敗:", error);
      shared.localSearchResults = [];
      shared.retrievedDocuments = [];
      shared.sources = [];
    }
  }

  /**
   * 決定下一步行動
   */
  protected getNextAction(
    shared: ChatSharedState,
    prepRes: any,
    execRes: string
  ): string | undefined {
    const hasResults = shared.localSearchResults && shared.localSearchResults.length > 0;

    if (hasResults) {
      return "local_search_success";
    } else {
      return "local_search_empty";
    }
  }

  /**
   * 提取來源信息
   */
  private extractSources(documents: any[]): { title: string; score: number }[] {
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
   * 錯誤處理回退
   */
  async execFallback(searchParams: any, error: Error): Promise<string> {
    logError(`本地搜索最終失敗: ${error.message}`);
    return JSON.stringify([]);
  }
}
