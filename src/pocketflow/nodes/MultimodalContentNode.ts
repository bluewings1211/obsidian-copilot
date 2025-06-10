import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import {
  ImageContent,
  MessageContent,
  ImageProcessingResult,
} from "@/imageProcessing/imageProcessor";
import { getSettings } from "@/settings/model";
import { logInfo } from "@/logger";

/**
 * 多模態內容處理節點
 * 專門處理圖像和其他多模態內容的預處理
 */
export class MultimodalContentNode extends ChatBaseNode {
  constructor() {
    super("多模態內容處理", 1, 0);
  }

  /**
   * 準備數據 - 收集需要處理的多模態內容
   */
  protected async prepareData(shared: ChatSharedState): Promise<{
    userMessage: any;
    textContent: string;
    settings: any;
  }> {
    if (!shared.userMessage) {
      throw new Error("缺少用戶訊息");
    }

    const settings = getSettings();
    const textContent = shared.userMessage.message;

    return {
      userMessage: shared.userMessage,
      textContent,
      settings,
    };
  }

  /**
   * 執行多模態內容處理
   */
  async exec(prepData: any): Promise<{
    processedContent: MessageContent[];
    failureMessages: string[];
    successfulImages: ImageContent[];
  }> {
    const { userMessage, textContent, settings } = prepData;

    const failureMessages: string[] = [];
    const successfulImages: ImageContent[] = [];

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

    // 構建最終的訊息內容
    let finalText = textContent;
    if (failureMessages.length > 0) {
      finalText = `${textContent}\n\nNote: \n${failureMessages.join("\n")}\n`;
    }

    const processedContent: MessageContent[] = [
      {
        type: "text",
        text: finalText,
      },
    ];

    // 添加成功處理的圖像
    if (successfulImages.length > 0) {
      processedContent.push(...successfulImages);
    }

    return {
      processedContent,
      failureMessages,
      successfulImages,
    };
  }

  /**
   * 處理結果 - 將處理好的多模態內容存儲到共享狀態
   */
  protected async processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: any
  ): Promise<void> {
    const { processedContent, failureMessages, successfulImages } = execRes;

    // 更新共享狀態
    shared.imageContent = successfulImages;
    shared.processedImages = successfulImages;

    // 存儲處理後的內容到共享狀態
    (shared as any).processedContent = processedContent;
    (shared as any).imageFailures = failureMessages;

    if (shared.debug) {
      logInfo("多模態內容處理完成:", {
        imageCount: successfulImages.length,
        failureCount: failureMessages.length,
        hasText: processedContent.some((content: any) => content.type === "text"),
      });
    }
  }

  /**
   * 獲取下一個動作
   */
  protected getNextAction(shared: ChatSharedState, prepRes: any, execRes: any): string | undefined {
    return "context_prep";
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
   * 處理圖像 URLs（模擬實現）
   */
  private async processImageUrls(urls: string[]): Promise<ImageProcessingResult> {
    const failedImages: string[] = [];

    // 模擬圖像處理（實際使用時會整合 Vault 實例）
    const successfulImages: ImageContent[] = [];

    for (const url of urls) {
      try {
        // 模擬圖像處理邏輯
        if (this.isValidImageUrl(url)) {
          successfulImages.push({
            type: "image_url",
            image_url: {
              url: url, // 實際使用時會轉換為 base64
            },
          });
        } else {
          failedImages.push(url);
        }
      } catch {
        failedImages.push(url);
      }
    }

    const failureDescriptions = failedImages.map((url) => `Image read failed for: ${url}`);

    // 顯示失敗圖像通知（實際使用時會使用 ImageBatchProcessor）
    if (failedImages.length > 0) {
      logInfo(`Failed to process images: ${failedImages.join(", ")}`);
    }

    return {
      successfulImages,
      failureDescriptions,
    };
  }

  /**
   * 處理聊天輸入圖像（模擬實現）
   */
  private async processChatInputImages(content: MessageContent[]): Promise<ImageProcessingResult> {
    const failedImages: string[] = [];

    // 過濾出圖像項目
    const imageItems = content.filter(
      (item): item is ImageContent => item.type === "image_url" && !!item.image_url?.url
    );

    const successfulImages: ImageContent[] = [];

    for (const item of imageItems) {
      try {
        // 模擬圖像處理
        successfulImages.push({
          type: "image_url",
          image_url: {
            url: item.image_url.url, // 實際使用時會轉換為 base64
          },
        });
      } catch {
        failedImages.push(item.image_url.url);
      }
    }

    const failureDescriptions = failedImages.map((url) => `Image read failed for: ${url}`);

    return {
      successfulImages,
      failureDescriptions,
    };
  }

  /**
   * 檢查是否為有效的圖像 URL
   */
  private isValidImageUrl(url: string): boolean {
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    const lowerUrl = url.toLowerCase();

    // 檢查是否有圖像副檔名
    const hasImageExtension = imageExtensions.some((ext) => lowerUrl.includes(ext));

    // 檢查是否為有效的 URL 格式
    try {
      new URL(url);
      return hasImageExtension;
    } catch {
      // 可能是本地檔案路徑
      return hasImageExtension;
    }
  }

  /**
   * 檢查模型是否支援視覺功能
   */
  private supportsVision(model: any): boolean {
    // 實際使用時會整合 ChatModelManager 的能力檢查
    // const modelName = model.modelName || model.model || "";
    // return this.hasCapability(model, ModelCapability.VISION);
    return true; // 暫時返回 true
  }

  /**
   * 根據模型能力調整內容
   */
  private adjustContentForModel(content: MessageContent[], model: any): MessageContent[] {
    if (!this.supportsVision(model)) {
      // 如果模型不支援視覺，只保留文字內容
      return content.filter((item) => item.type === "text");
    }

    return content;
  }
}
