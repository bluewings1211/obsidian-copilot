import { Node, Flow, BatchNode } from "pocketflow";
import { ChatSharedState, ChatNodeParams } from "./types";
import { ChatMessage } from "@/sharedState";
import { logInfo, logError } from "@/logger";

/**
 * 聊天基礎 Node 類別
 * 擴展 PocketFlow Node 以支援 Obsidian Copilot 的聊天功能
 */
export abstract class ChatBaseNode extends Node<ChatSharedState, ChatNodeParams> {
  protected stepName: string;

  constructor(stepName: string, maxRetries: number = 1, wait: number = 0) {
    super(maxRetries, wait);
    this.stepName = stepName;
  }

  /**
   * 更新當前處理步驟
   */
  protected updateCurrentStep(shared: ChatSharedState): void {
    shared.currentStep = this.stepName;
    if (shared.debug) {
      logInfo(`==== 步驟: ${this.stepName} ====`);
    }
  }

  /**
   * 檢查是否應該中止處理
   */
  protected shouldAbort(shared: ChatSharedState): boolean {
    return shared.shouldAbort || shared.abortController?.signal.aborted || false;
  }

  /**
   * 處理錯誤的通用方法
   */
  protected handleError(error: any, shared: ChatSharedState): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    shared.error = errorMessage;
    shared.errorMessage = errorMessage;
    logError(`在 ${this.stepName} 步驟中發生錯誤: ${errorMessage}`);
  }

  /**
   * 執行前的準備工作
   */
  async prep(shared: ChatSharedState): Promise<any> {
    this.updateCurrentStep(shared);

    if (this.shouldAbort(shared)) {
      throw new Error("處理已中止");
    }

    return await this.prepareData(shared);
  }

  /**
   * 執行後的處理工作
   */
  async post(shared: ChatSharedState, prepRes: any, execRes: any): Promise<string | undefined> {
    if (this.shouldAbort(shared)) {
      return undefined;
    }

    await this.processResult(shared, prepRes, execRes);
    return this.getNextAction(shared, prepRes, execRes);
  }

  /**
   * 子類別需要實現的方法
   */
  protected abstract prepareData(shared: ChatSharedState): Promise<any>;
  protected abstract processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: any
  ): Promise<void>;
  protected abstract getNextAction(
    shared: ChatSharedState,
    prepRes: any,
    execRes: any
  ): string | undefined;
}

/**
 * 聊天批次處理 Node 類別
 */
export abstract class ChatBatchNode extends BatchNode<ChatSharedState, ChatNodeParams> {
  protected stepName: string;

  constructor(stepName: string, maxRetries: number = 1, wait: number = 0) {
    super(maxRetries, wait);
    this.stepName = stepName;
  }

  protected updateCurrentStep(shared: ChatSharedState): void {
    shared.currentStep = this.stepName;
    if (shared.debug) {
      logInfo(`==== 批次步驟: ${this.stepName} ====`);
    }
  }

  protected shouldAbort(shared: ChatSharedState): boolean {
    return shared.shouldAbort || shared.abortController?.signal.aborted || false;
  }

  protected handleError(error: any, shared: ChatSharedState): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    shared.error = errorMessage;
    shared.errorMessage = errorMessage;
    logError(`在批次步驟 ${this.stepName} 中發生錯誤: ${errorMessage}`);
  }
}

/**
 * 聊天 Flow 類別
 */
export class ChatFlow extends Flow<ChatSharedState, ChatNodeParams> {
  private flowName: string;

  constructor(startNode: Node<ChatSharedState, ChatNodeParams>, flowName: string = "ChatFlow") {
    super(startNode);
    this.flowName = flowName;
  }

  /**
   * 執行前的準備
   */
  async prep(shared: ChatSharedState): Promise<any> {
    if (shared.debug) {
      logInfo(`==== 開始執行 ${this.flowName} ====`);
    }
    return {};
  }

  /**
   * 執行後的處理
   */
  async post(shared: ChatSharedState, prepRes: any, execRes: any): Promise<string | undefined> {
    if (shared.debug) {
      logInfo(`==== 完成執行 ${this.flowName} ====`);
    }
    return undefined;
  }

  /**
   * 運行 Flow 的便利方法
   */
  async runChat(
    userMessage: ChatMessage,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: {
      debug?: boolean;
      abortController?: AbortController;
      updateLoading?: (loading: boolean) => void;
      updateLoadingMessage?: (message: string) => void;
    } = {}
  ): Promise<string> {
    const shared: ChatSharedState = {
      userMessage,
      chatHistory: [],
      isProcessing: true,
      debug: options.debug || false,
      abortController: options.abortController,
      updateCurrentAiMessage,
      addMessage,
      updateLoading: options.updateLoading,
      updateLoadingMessage: options.updateLoadingMessage,
      toolCalls: [],
      toolOutputs: [],
      mcpToolCalls: [],
      sources: [],
    };

    try {
      await this.run(shared);
      return shared.aiResponse || "";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`ChatFlow 執行失敗: ${errorMessage}`);
      shared.errorMessage = errorMessage;
      throw error;
    } finally {
      shared.isProcessing = false;
    }
  }
}
