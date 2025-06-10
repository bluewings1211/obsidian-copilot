# IntentAnalysisNode 整合指南

## 概述

IntentAnalysisNode 是一個專門用於分析用戶意圖的 PocketFlow 節點，它將原本在 `IntentAnalyzer.analyzeIntent()` 中的複雜邏輯重構為可組合、可測試的 Node 架構。

## 主要功能

### 1. 意圖分析

- **Broca 服務整合**: 使用 BrevilabsClient 進行智能意圖分析
- **@ 命令處理**: 支援 `@vault`、`@web`、`@pomodoro`、`@youtube` 等命令
- **MCP 工具檢測**: 自動檢測和處理 MCP 工具調用
- **智能回退**: 當 Broca 服務不可用時，回退到基本詞彙分析

### 2. 動態路由

基於分析結果返回不同的動作：

- `local_search`: 本地筆記搜索
- `web_search`: 網頁搜索
- `mcp_tools`: MCP 工具執行
- `tool_execution`: 一般工具執行
- `direct_llm`: 直接 LLM 對話

## 與現有 IntentAnalyzer 的對比

### 原始 IntentAnalyzer

```typescript
// 舊的方式 - 單一函數處理所有邏輯
const toolCalls = await IntentAnalyzer.analyzeIntent(userMessage);
// 需要手動處理結果和路由決策
```

### 新的 IntentAnalysisNode

```typescript
// 新的方式 - 可組合的 Node 架構
const intentNode = new IntentAnalysisNode(vault);
const action = await intentNode.run(shared);
// 自動路由決策和清晰的責任分離
```

## 整合步驟

### 1. 更新現有的聊天流程

**步驟 1**: 導入新的節點

```typescript
import { IntentAnalysisNode } from "@/pocketflow";
```

**步驟 2**: 創建意圖分析節點

```typescript
const intentNode = new IntentAnalysisNode(vault);
```

**步驟 3**: 配置路由

```typescript
// 根據意圖分析結果路由到不同的處理節點
intentNode.on("local_search", localSearchNode);
intentNode.on("web_search", webSearchNode);
intentNode.on("mcp_tools", mcpToolsNode);
intentNode.on("direct_llm", directLlmNode);
```

### 2. 替換現有的 IntentAnalyzer 調用

**舊的實現**:

```typescript
// 在 CopilotPlusChainRunner 或類似地方
const toolCalls = await IntentAnalyzer.analyzeIntent(userMessage);
// 手動處理 toolCalls...
```

**新的實現**:

```typescript
// 使用 PocketFlow 架構
const chatFlow = new ChatFlow(intentNode);
const result = await chatFlow.runChat(userMessage, updateCurrentAiMessage, addMessage);
```

### 3. 更新共享狀態

確保 `ChatSharedState` 包含意圖分析結果：

```typescript
interface ChatSharedState {
  // ... 其他屬性
  intentAnalysisResult?: {
    toolCalls: any[];
    detectedTools: string[];
    salientTerms: string[];
    timeRange?: any;
    suggestedAction: string;
  };
}
```

## 配置選項

### 1. 重試設置

```typescript
const intentNode = new IntentAnalysisNode(
  vault,
  3, // maxRetries: 最大重試次數
  1000 // wait: 重試間隔（毫秒）
);
```

### 2. 調試模式

```typescript
const shared: ChatSharedState = {
  // ... 其他屬性
  debug: true, // 啟用詳細日誌
};
```

## 錯誤處理

### 1. Broca 服務不可用

當 Broca 服務無法連接時，IntentAnalysisNode 會自動回退到基本詞彙分析：

```typescript
// 自動回退處理
private extractBasicSalientTerms(message: string): string[] {
  // 提取關鍵詞彙的基本邏輯
}
```

### 2. 異常處理

```typescript
async execFallback(prepRes: unknown, error: Error): Promise<IntentAnalysisResult> {
  // 提供基本的回退結果
  return {
    toolCalls: [],
    detectedTools: [],
    salientTerms: this.extractBasicSalientTerms(message),
    suggestedAction: "direct_llm",
  };
}
```

## 測試

### 1. 單元測試

```bash
npm test -- --testPathPattern=IntentAnalysisNode.test.ts
```

### 2. 整合測試

使用 `examples/intent-analysis-example.ts` 中的示例：

```typescript
import { runExamples } from "@/pocketflow/examples/intent-analysis-example";

// 運行所有示例
await runExamples(vault);
```

## 性能考量

### 1. 工具快取

- MCP 工具會被快取 30 秒
- 自動刷新機制減少重複查詢

### 2. 異步處理

- 所有外部服務調用都是異步的
- 支援超時和重試機制

### 3. 內存使用

- 顯著詞彙限制為 5 個
- 基本清理機制避免內存洩漏

## 遷移檢查清單

- [ ] 導入 IntentAnalysisNode
- [ ] 創建意圖分析節點實例
- [ ] 配置路由決策
- [ ] 更新共享狀態類型
- [ ] 替換現有的 IntentAnalyzer 調用
- [ ] 更新錯誤處理邏輯
- [ ] 運行測試確保功能正常
- [ ] 更新相關文檔

## 向後兼容性

IntentAnalysisNode 設計為與現有 IntentAnalyzer 完全兼容：

- 支援所有現有的 @ 命令
- 保持與 Broca 服務的兼容性
- 支援所有現有的 MCP 工具
- 相同的錯誤處理邏輯

## 未來增強

- [ ] 添加更多智能路由策略
- [ ] 支援自定義意圖分析器
- [ ] 增強 MCP 工具檢測能力
- [ ] 添加意圖分析快取機制
