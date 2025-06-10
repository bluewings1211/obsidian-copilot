import { ChatFlow } from "../nodes";
import { ContextPrepNode, LLMGenerationNode, MultimodalContentNode } from "../nodes/index";
import { ChatSharedState } from "../types";
import { ChatMessage } from "@/sharedState";
import { logInfo } from "@/logger";

/**
 * 上下文準備和 LLM 生成流程示例
 * 展示如何使用新的 ContextPrepNode 和 LLMGenerationNode
 */

async function runContextLLMGenerationExample() {
  logInfo("=== 開始上下文準備和 LLM 生成流程示例 ===");

  // 創建節點
  const multimodalNode = new MultimodalContentNode();
  const contextPrepNode = new ContextPrepNode();
  const llmGenerationNode = new LLMGenerationNode();

  // 連接節點
  multimodalNode.on("context_prep", contextPrepNode);
  contextPrepNode.on("llm_generation", llmGenerationNode);

  // 創建流程
  const chatFlow = new ChatFlow(multimodalNode, "上下文和LLM生成流程");

  // 模擬用戶訊息
  const userMessage: ChatMessage = {
    message: "請分析這個項目的架構並提供改進建議。參考以下圖片：",
    sender: "user",
    isVisible: true,
    timestamp: {
      fileName: "20240110_100000",
      display: "2024/01/10 10:00:00",
      epoch: 1704862800000,
    },
    context: {
      notes: [],
      urls: ["https://example.com/architecture-diagram.png"],
    },
    content: [
      {
        type: "text",
        text: "請分析這個項目的架構",
      },
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        },
      },
    ],
  };

  // 模擬工具輸出 - 實際使用時會從之前的節點獲得
  logInfo("工具輸出將從之前的 ToolExecutionBatchNode 獲得");

  // 運行流程
  try {
    const result = await chatFlow.runChat(
      userMessage,
      (message: string) => {
        logInfo("AI 回應更新:", message.substring(0, 100) + "...");
      },
      (message: ChatMessage) => {
        logInfo("添加訊息:", {
          sender: message.sender,
          length: message.message.length,
          hasSources: !!message.sources?.length,
          hasToolCalls: !!message.mcpToolCalls?.length,
        });
      },
      {
        debug: true,
        updateLoading: (loading: boolean) => {
          logInfo("加載狀態:", loading);
        },
        updateLoadingMessage: (message: string) => {
          logInfo("加載訊息:", message);
        },
      }
    );

    logInfo("=== 流程完成 ===");
    logInfo("最終結果:", result.substring(0, 200) + "...");
  } catch (error) {
    console.error("流程執行失敗:", error);
  }
}

/**
 * 模擬完整的聊天流程，包含意圖分析、工具執行、上下文準備和 LLM 生成
 */
async function runCompleteChainExample() {
  logInfo("=== 開始完整聊天鏈示例 ===");

  // 這裡可以整合之前的 IntentAnalysisNode 和 ToolExecutionBatchNode
  const contextPrepNode = new ContextPrepNode();
  const llmGenerationNode = new LLMGenerationNode();

  // 連接節點
  contextPrepNode.on("llm_generation", llmGenerationNode);

  // 創建流程
  const chatFlow = new ChatFlow(contextPrepNode, "完整聊天流程");

  // 模擬複雜的用戶查詢
  const userMessage: ChatMessage = {
    message: "@localSearch 查找關於性能優化的文檔 @webSearch React 最佳實踐",
    originalMessage: "@localSearch 查找關於性能優化的文檔 @webSearch React 最佳實踐",
    sender: "user",
    isVisible: true,
    timestamp: {
      fileName: "20240110_101500",
      display: "2024/01/10 10:15:00",
      epoch: 1704863700000,
    },
  };

  // 模擬從之前步驟獲得的工具輸出
  const mockSharedState: Partial<ChatSharedState> = {
    userMessage,
    toolOutputs: [
      {
        tool: "localSearch",
        output: JSON.stringify([
          {
            title: "性能優化指南",
            content: "React 性能優化包括：使用 React.memo、useCallback、useMemo 等優化渲染性能。",
            includeInContext: true,
            score: 0.92,
          },
        ]),
      },
      {
        tool: "webSearch",
        output: "React 最佳實踐：組件設計原則、狀態管理、性能優化技巧等。",
      },
    ],
    mcpToolCalls: [],
    sources: [],
    debug: true,
  };

  try {
    // 手動設置共享狀態來模擬之前步驟的結果
    const shared: ChatSharedState = {
      ...mockSharedState,
      chatHistory: [],
      isProcessing: true,
      toolCalls: [],
      mcpToolCalls: [],
      sources: [],
    } as ChatSharedState;

    await chatFlow.run(shared);

    logInfo("=== 完整鏈示例完成 ===");
    logInfo("AI 回應:", shared.aiResponse?.substring(0, 200) + "...");
  } catch (error) {
    console.error("完整鏈執行失敗:", error);
  }
}

/**
 * 測試多模態內容處理
 */
async function testMultimodalContent() {
  logInfo("=== 測試多模態內容處理 ===");

  const multimodalNode = new MultimodalContentNode();

  const userMessage: ChatMessage = {
    message: "請分析這些圖片並提供總結 ![[diagram.png]] 這是架構圖",
    sender: "user",
    isVisible: true,
    timestamp: {
      fileName: "20240110_102000",
      display: "2024/01/10 10:20:00",
      epoch: 1704864000000,
    },
    context: {
      notes: [],
      urls: ["https://example.com/image1.jpg", "https://example.com/image2.png"],
    },
    content: [
      {
        type: "text",
        text: "請分析這些圖片",
      },
      {
        type: "image_url",
        image_url: {
          url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
        },
      },
    ],
  };

  const shared: ChatSharedState = {
    userMessage,
    chatHistory: [],
    isProcessing: true,
    debug: true,
    toolCalls: [],
    toolOutputs: [],
    mcpToolCalls: [],
    sources: [],
  };

  try {
    await multimodalNode.run(shared);

    logInfo("多模態處理完成");
    logInfo("處理的圖像數量:", shared.imageContent?.length || 0);
    logInfo("處理後的內容項目:", (shared as any).processedContent?.length || 0);
  } catch (error) {
    console.error("多模態處理失敗:", error);
  }
}

// 導出示例函數
export { runContextLLMGenerationExample, runCompleteChainExample, testMultimodalContent };

// 如果直接運行此文件，執行示例
if (require.main === module) {
  Promise.all([
    runContextLLMGenerationExample(),
    runCompleteChainExample(),
    testMultimodalContent(),
  ]).catch(console.error);
}
