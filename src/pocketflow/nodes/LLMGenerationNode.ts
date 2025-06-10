import { ChatBaseNode } from "../nodes";
import { ChatSharedState } from "../types";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ModelCapability, AI_SENDER } from "@/constants";
import { formatDateTime } from "@/utils";
import { logInfo } from "@/logger";
import { MessageContent } from "@/imageProcessing/imageProcessor";

/**
 * ThinkBlockStreamer 類別
 * 處理 O-series 模型的推理內容串流
 */
class ThinkBlockStreamer {
  private hasOpenThinkBlock = false;
  private fullResponse = "";

  constructor(private updateCurrentAiMessage: (message: string) => void) {}

  processChunk(chunk: any) {
    this.fullResponse += chunk.content;

    if (chunk.additional_kwargs?.reasoning_content) {
      // 如果沒有開啟的思考區塊，添加一個
      if (!this.hasOpenThinkBlock) {
        this.fullResponse += "\n<think>";
        this.hasOpenThinkBlock = true;
      }
      // 添加新的推理內容
      this.fullResponse += chunk.additional_kwargs.reasoning_content;
    } else if (this.hasOpenThinkBlock) {
      // 如果有開啟的思考區塊但沒有更多推理內容，關閉它
      this.fullResponse += "</think>";
      this.hasOpenThinkBlock = false;
    }

    this.updateCurrentAiMessage(this.fullResponse);
  }

  close() {
    // 確保在結束時關閉任何開啟的思考區塊
    if (this.hasOpenThinkBlock) {
      this.fullResponse += "</think>";
      this.updateCurrentAiMessage(this.fullResponse);
    }
    return this.fullResponse;
  }
}

/**
 * LLM 生成節點
 * 負責調用 LLM 生成回應，支援多模態內容和串流處理
 */
export class LLMGenerationNode extends ChatBaseNode {
  constructor() {
    super("LLM 生成", 1, 0);
  }

  /**
   * 準備數據 - 從共享狀態獲取處理好的上下文
   */
  protected async prepareData(shared: ChatSharedState): Promise<{
    finalMessage: string;
    messageContent: MessageContent[];
    systemMessage: string;
    chatHistory: any[];
    chatModel?: BaseChatModel;
  }> {
    if (!shared.userMessage) {
      throw new Error("缺少用戶訊息");
    }

    // 從共享狀態獲取上下文準備節點的結果
    const finalMessage = (shared as any).finalMessage || shared.userMessage.message;
    const messageContent = (shared as any).messageContent || [{ type: "text", text: finalMessage }];
    const systemMessage = (shared as any).systemMessage || "";
    const chatHistory = (shared as any).chatHistory || [];

    return {
      finalMessage,
      messageContent,
      systemMessage,
      chatHistory,
    };
  }

  /**
   * 執行 LLM 生成
   */
  async exec(prepData: any): Promise<string> {
    const { messageContent, systemMessage, chatHistory } = prepData;

    // 準備訊息陣列
    const messages = this.prepareMessages(systemMessage, chatHistory, messageContent);

    logInfo("==== 最終發送給 AI 的請求 ====", messages);

    // 創建串流處理器
    const streamer = new ThinkBlockStreamer(() => {});

    // 模擬 LLM 調用（實際使用時會整合真正的 ChatModelManager）
    try {
      // 這裡應該調用真正的 LLM，暫時使用模擬回應
      await this.callLLM(messages, streamer);
    } catch (error) {
      throw new Error(`LLM 調用失敗: ${error instanceof Error ? error.message : String(error)}`);
    }

    return streamer.close();
  }

  /**
   * 處理結果 - 更新記憶體和添加訊息
   */
  protected async processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: string
  ): Promise<void> {
    if (!execRes || this.shouldAbort(shared)) {
      return;
    }

    shared.aiResponse = execRes;

    // 保存到記憶體（實際使用時會整合 MemoryManager）
    if (shared.userMessage) {
      // await memoryManager.saveContext(
      //   { input: shared.userMessage.message },
      //   { output: execRes }
      // );
    }

    // 添加 AI 訊息
    if (shared.addMessage) {
      shared.addMessage({
        message: execRes,
        sender: AI_SENDER,
        isVisible: true,
        timestamp: formatDateTime(new Date()),
        sources: shared.sources,
        mcpToolCalls: shared.mcpToolCalls,
      });
    }

    // 清空當前 AI 訊息
    if (shared.updateCurrentAiMessage) {
      shared.updateCurrentAiMessage("");
    }

    if (shared.debug) {
      logInfo("LLM 生成完成，回應長度:", execRes.length);
    }
  }

  /**
   * 獲取下一個動作
   */
  protected getNextAction(shared: ChatSharedState, prepRes: any, execRes: any): string | undefined {
    return undefined; // 流程結束
  }

  /**
   * 準備發送給 LLM 的訊息
   */
  private prepareMessages(
    systemMessage: string,
    chatHistory: any[],
    messageContent: MessageContent[]
  ): any[] {
    const messages: any[] = [];

    // 添加系統訊息（如果有）
    if (systemMessage) {
      // 模擬獲取聊天模型來決定角色
      const role = "system"; // 實際使用時: getMessageRole(chatModel)

      messages.push({
        role,
        content: `${systemMessage}\nIMPORTANT: Maintain consistency with previous responses in the conversation. If you've provided information about a person or topic before, use that same information in follow-up questions.`,
      });
    }

    // 添加聊天歷史
    for (const [human, ai] of chatHistory) {
      messages.push({ role: "user", content: human });
      messages.push({ role: "assistant", content: ai });
    }

    // 添加當前用戶訊息
    messages.push({
      role: "user",
      content: messageContent,
    });

    return messages;
  }

  /**
   * 調用 LLM（模擬實現）
   */
  private async callLLM(messages: any[], streamer: ThinkBlockStreamer): Promise<string> {
    // 模擬串流回應
    const response =
      "這是一個模擬的 LLM 回應。在實際實現中，這裡會調用真正的 ChatModelManager 來獲取 LLM 回應。";

    // 模擬分塊處理
    const chunks = response.split("。");
    for (const chunk of chunks) {
      // 模擬串流塊
      streamer.processChunk({ content: chunk + "。" });

      // 模擬延遲
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return response;
  }

  /**
   * 檢查模型能力
   */
  private hasCapability(model: BaseChatModel, capability: ModelCapability): boolean {
    // 實際使用時會整合 ChatModelManager
    return false;
  }

  /**
   * 檢查是否為多模態模型
   */
  private isMultimodalModel(model: BaseChatModel): boolean {
    return this.hasCapability(model, ModelCapability.VISION);
  }
}
