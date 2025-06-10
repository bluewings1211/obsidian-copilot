import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import { getStandaloneQuestion } from "@/chainUtils";
import {
  ImageBatchProcessor,
  ImageContent,
  MessageContent,
  ImageProcessingResult,
} from "@/imageProcessing/imageProcessor";
import { getSettings, getSystemPrompt } from "@/settings/model";
import { MAX_CHARS_FOR_LOCAL_SEARCH_CONTEXT } from "@/constants";
import { logInfo } from "@/logger";

/**
 * 上下文準備節點
 * 負責整合工具輸出、處理多模態內容、準備完整的聊天上下文
 */
export class ContextPrepNode extends ChatBaseNode {
  constructor() {
    super("上下文準備", 1, 0);
  }

  /**
   * 準備數據 - 收集所有需要的上下文信息
   */
  protected async prepareData(shared: ChatSharedState): Promise<{
    userMessage: string;
    toolOutputs: any[];
    localSearchResult?: any;
    chatHistory: any[];
    cleanedUserMessage: string;
  }> {
    if (!shared.userMessage) {
      throw new Error("缺少用戶訊息");
    }

    // 獲取聊天歷史 - 這將在實際使用時從傳入的參數獲取
    // 暫時使用空數組，實際實現時會從 shared state 獲取
    const chatHistory: [string, string][] = [];

    // 獲取工具輸出
    const toolOutputs = shared.toolOutputs || [];

    // 查找本地搜索結果
    const localSearchResult = toolOutputs.find(
      (output) => output.tool === "localSearch" && output.output && output.output.length > 0
    );

    // 獲取清理後的用戶訊息（移除工具命令）
    const cleanedUserMessage = shared.userMessage.originalMessage || shared.userMessage.message;

    return {
      userMessage: shared.userMessage.message,
      toolOutputs,
      localSearchResult,
      chatHistory,
      cleanedUserMessage,
    };
  }

  /**
   * 執行上下文準備
   */
  async exec(prepData: any): Promise<{
    finalMessage: string;
    messageContent: MessageContent[];
    enhancedUserMessage: string;
    systemMessage: string;
    chatHistory: any[];
    sources?: { title: string; score: number }[];
  }> {
    const { toolOutputs, localSearchResult, chatHistory, cleanedUserMessage } = prepData;

    let finalMessage = cleanedUserMessage;
    let sources: { title: string; score: number }[] = [];

    // 處理本地搜索結果
    if (localSearchResult) {
      logInfo("處理本地搜索結果");

      const documents = JSON.parse(localSearchResult.output);

      // 生成獨立問題
      const standaloneQuestion = await getStandaloneQuestion(cleanedUserMessage, chatHistory);
      logInfo("生成的獨立問題:", standaloneQuestion);

      // 準備本地搜索上下文
      const timeExpression = this.getTimeExpression(prepData.toolCalls || []);
      const searchContext = this.prepareLocalSearchResult(documents, timeExpression);

      // 準備增強的用戶訊息
      const currentTimeOutputs = toolOutputs.filter(
        (output: any) => output.tool === "getCurrentTime"
      );
      const enhancedQuestion = this.prepareEnhancedUserMessage(
        standaloneQuestion,
        currentTimeOutputs
      );

      // 獲取 QA 提示
      // 暫時使用簡單的 QA 提示格式，實際使用時會整合 PromptManager
      const qaPrompt = `Context: ${searchContext}\n\nQuestion: ${enhancedQuestion}`;

      finalMessage = qaPrompt;
      sources = this.getSources(documents);
    } else {
      // 沒有本地搜索結果，使用增強的用戶訊息
      finalMessage = this.prepareEnhancedUserMessage(cleanedUserMessage, toolOutputs);
    }

    // 處理多模態內容
    const messageContent = await this.buildMessageContent(finalMessage, prepData.userMessage);

    // 準備系統訊息
    const systemMessage = this.prepareSystemMessage(chatHistory);

    return {
      finalMessage,
      messageContent,
      enhancedUserMessage: finalMessage,
      systemMessage,
      chatHistory,
      sources,
    };
  }

  /**
   * 處理結果 - 將準備好的上下文存儲到共享狀態
   */
  protected async processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: any
  ): Promise<void> {
    const { finalMessage, messageContent, systemMessage, chatHistory, sources } = execRes;

    // 更新共享狀態
    shared.context = {
      ...shared.context,
    };

    // 添加處理後的上下文數據
    (shared as any).finalMessage = finalMessage;
    (shared as any).messageContent = messageContent;
    (shared as any).systemMessage = systemMessage;
    (shared as any).chatHistory = chatHistory;

    if (sources && sources.length > 0) {
      shared.sources = sources;
    }

    if (shared.debug) {
      logInfo("上下文準備完成:", {
        messageLength: finalMessage.length,
        hasImages: messageContent.some((content: any) => content.type === "image_url"),
        sourcesCount: sources?.length || 0,
      });
    }
  }

  /**
   * 獲取下一個動作
   */
  protected getNextAction(shared: ChatSharedState, prepRes: any, execRes: any): string | undefined {
    return "llm_generation";
  }

  /**
   * 構建包含文本和圖像的訊息內容
   */
  private async buildMessageContent(
    textContent: string,
    userMessage: any
  ): Promise<MessageContent[]> {
    const failureMessages: string[] = [];
    const successfulImages: ImageContent[] = [];
    const settings = getSettings();

    // 收集所有圖像源
    const imageSources: { urls: string[]; type: string }[] = [];

    // 檢查上下文 URLs
    const contextUrls = userMessage.context?.urls;
    if (contextUrls && contextUrls.length > 0) {
      imageSources.push({ urls: contextUrls, type: "context" });
    }

    // 處理嵌入圖像（如果設定啟用）
    if (settings.passMarkdownImages) {
      const embeddedImages = await this.extractEmbeddedImages(textContent);
      if (embeddedImages.length > 0) {
        imageSources.push({ urls: embeddedImages, type: "embedded" });
      }
    }

    // 處理所有圖像源
    for (const source of imageSources) {
      const result = await this.processImageUrls(source.urls);
      successfulImages.push(...result.successfulImages);
      failureMessages.push(...result.failureDescriptions);
    }

    // 處理現有的聊天內容圖像
    const existingContent = userMessage.content;
    if (existingContent && existingContent.length > 0) {
      const result = await this.processChatInputImages(existingContent);
      successfulImages.push(...result.successfulImages);
      failureMessages.push(...result.failureDescriptions);
    }

    // 處理圖像失敗的通知
    let finalText = textContent;
    if (failureMessages.length > 0) {
      finalText = `${textContent}\n\nNote: \n${failureMessages.join("\n")}\n`;
    }

    const messageContent: MessageContent[] = [
      {
        type: "text",
        text: finalText,
      },
    ];

    // 添加成功處理的圖像
    if (successfulImages.length > 0) {
      messageContent.push(...successfulImages);
    }

    return messageContent;
  }

  /**
   * 提取嵌入圖像
   */
  private async extractEmbeddedImages(content: string): Promise<string[]> {
    const imageRegex = /!\[\[(.*?\.(png|jpg|jpeg|gif|webp|bmp|svg))\]\]/g;
    const matches = [...content.matchAll(imageRegex)];
    return matches.map((match) => match[1]);
  }

  /**
   * 處理圖像 URLs
   */
  private async processImageUrls(urls: string[]): Promise<ImageProcessingResult> {
    const failedImages: string[] = [];
    // 暫時返回空結果，實際使用時會整合 Vault 實例
    const processedImages: ImageProcessingResult = {
      successfulImages: [],
      failureDescriptions: failedImages,
    };
    ImageBatchProcessor.showFailedImagesNotice(failedImages);
    return processedImages;
  }

  /**
   * 處理聊天輸入圖像
   */
  private async processChatInputImages(content: MessageContent[]): Promise<ImageProcessingResult> {
    const failedImages: string[] = [];
    // 暫時返回空結果，實際使用時會整合 Vault 實例
    const processedImages: ImageProcessingResult = {
      successfulImages: [],
      failureDescriptions: failedImages,
    };
    ImageBatchProcessor.showFailedImagesNotice(failedImages);
    return processedImages;
  }

  /**
   * 準備增強的用戶訊息
   */
  private prepareEnhancedUserMessage(userMessage: string, toolOutputs: any[]): string {
    let context = "";
    if (toolOutputs.length > 0) {
      const validOutputs = toolOutputs.filter((output) => output.output != null);
      if (validOutputs.length > 0) {
        context =
          "\n\n# Additional context:\n\n" +
          validOutputs
            .map(
              (output) =>
                `<${output.tool}>\n${typeof output.output !== "string" ? JSON.stringify(output.output) : output.output}\n</${output.tool}>`
            )
            .join("\n\n");
      }
    }
    return `${userMessage}${context}`;
  }

  /**
   * 獲取時間表達式
   */
  private getTimeExpression(toolCalls: any[]): string {
    const timeRangeCall = toolCalls.find((call) => call.tool.name === "getTimeRangeMs");
    return timeRangeCall ? timeRangeCall.args.timeExpression : "";
  }

  /**
   * 準備本地搜索結果
   */
  private prepareLocalSearchResult(documents: any[], timeExpression: string): string {
    // 過濾包含在上下文中的文檔
    const includedDocs = documents.filter((doc) => doc.includeInContext);

    // 計算總內容長度
    const totalLength = includedDocs.reduce((sum, doc) => sum + doc.content.length, 0);

    // 如果總長度超過閾值，計算截斷比例
    let truncatedDocs = includedDocs;
    if (totalLength > MAX_CHARS_FOR_LOCAL_SEARCH_CONTEXT) {
      const truncationRatio = MAX_CHARS_FOR_LOCAL_SEARCH_CONTEXT / totalLength;
      console.log("截斷文檔以適應上下文長度。截斷比例:", truncationRatio);
      truncatedDocs = includedDocs.map((doc) => ({
        ...doc,
        content: doc.content.slice(0, Math.floor(doc.content.length * truncationRatio)),
      }));
    }

    const formattedDocs = truncatedDocs
      .map((doc: any) => `Note in Vault: ${doc.content}`)
      .join("\n\n");

    return timeExpression
      ? `Local Search Result for ${timeExpression}:\n${formattedDocs}`
      : `Local Search Result:\n${formattedDocs}`;
  }

  /**
   * 獲取來源列表
   */
  private getSources(documents: any[]): { title: string; score: number }[] {
    if (!documents || !Array.isArray(documents)) {
      console.warn("getSources 沒有提供有效的文檔");
      return [];
    }
    return this.sortUniqueDocsByScore(documents);
  }

  /**
   * 按分數排序唯一文檔
   */
  private sortUniqueDocsByScore(documents: any[]): any[] {
    const uniqueDocs = new Map<string, any>();

    // 遍歷所有文檔
    for (const doc of documents) {
      if (!doc.title || (!doc?.score && !doc?.rerank_score)) {
        console.warn("無效的文檔結構:", doc);
        continue;
      }

      const currentDoc = uniqueDocs.get(doc.title);
      const isReranked = doc && "rerank_score" in doc;
      const docScore = isReranked ? doc.rerank_score : doc.score;

      // 如果標題在 map 中不存在，或者新文檔有更高的分數，更新 map
      if (!currentDoc || docScore > (currentDoc.score ?? 0)) {
        uniqueDocs.set(doc.title, {
          title: doc.title,
          score: docScore,
          isReranked: isReranked,
        });
      }
    }

    // 將 map 值轉換回數組並按分數降序排序
    return Array.from(uniqueDocs.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  /**
   * 準備系統訊息
   */
  private prepareSystemMessage(chatHistory: any[]): string {
    let fullSystemMessage = getSystemPrompt();

    // 如果有聊天歷史，添加上下文到系統訊息
    if (chatHistory.length > 0) {
      fullSystemMessage +=
        "\n\nThe following is the relevant conversation history. Use this context to maintain consistency in your responses:";
    }

    return fullSystemMessage;
  }
}
