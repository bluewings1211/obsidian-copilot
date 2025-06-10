# PocketFlow.js 工具執行節點整合指南

本文檔說明如何使用新的工具執行節點來優化 Obsidian Copilot 的工具執行流程，實現平行處理和更好的錯誤處理。

## 概述

新的工具執行系統包含以下核心組件：

- **ToolExecutionBatchNode**: 批量工具執行節點，支援平行處理
- **LocalSearchNode**: 專門的本地搜索節點
- **WebSearchNode**: 專門的網頁搜索節點
- **McpToolsNode**: MCP 工具批量處理節點
- **GenericToolNode**: 通用工具處理節點

## 核心優勢

### 1. 平行處理

- 多個工具可以同時執行，提升性能
- 特別適合 I/O 密集型操作（搜索、API 調用等）
- 支援獨立工具間的並發執行

### 2. 統一錯誤處理

- 每個節點都有內建的重試機制
- 優雅的錯誤回退處理
- 詳細的錯誤記錄和追蹤

### 3. MCP 工具整合

- 完整的 MCP 工具調用記錄
- 狀態追蹤和效能監控
- 與現有 MCP 系統無縫整合

### 4. 載入狀態管理

- 智能載入訊息更新
- 基於工具類型的狀態顯示
- 更好的用戶體驗

## 使用方式

### 基本設置

```typescript
import {
  ToolExecutionBatchNode,
  LocalSearchNode,
  WebSearchNode,
  McpToolsNode,
  ChatFlow,
} from "@/pocketflow/nodes";

// 創建工具執行節點
const toolExecutionNode = new ToolExecutionBatchNode(3, 1000); // 最大重試3次，等待1秒

// 創建流程
const flow = new ChatFlow(toolExecutionNode, "ToolExecution");
```

### 與現有系統整合

#### 1. 替換 CopilotPlusChainRunner.executeToolCalls()

**舊方式（串行執行）:**

```typescript
// 在 CopilotPlusChainRunner 中
private async executeToolCalls(toolCalls: any[], debug: boolean) {
  const toolOutputs = [];
  const mcpToolCalls: McpToolCall[] = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    // 串行執行每個工具...
  }

  return { toolOutputs, mcpToolCalls };
}
```

**新方式（平行執行）:**

```typescript
// 使用 ToolExecutionBatchNode
const toolExecutionNode = new ToolExecutionBatchNode();
const flow = new ChatFlow(toolExecutionNode);

// 設置工具調用到共享狀態
const shared: ChatSharedState = {
  toolCalls: toolCalls,
  debug: debug,
  updateLoadingMessage: updateLoadingMessage,
  // ... 其他參數
};

await flow.run(shared);

// 結果在 shared.toolOutputs 和 shared.mcpToolCalls 中
```

#### 2. 整合到現有聊天流程

```typescript
import { IntentAnalysisNode, ToolExecutionBatchNode } from "@/pocketflow/nodes";

// 創建完整的聊天流程
const intentNode = new IntentAnalysisNode();
const toolExecutionNode = new ToolExecutionBatchNode();

// 連接節點
intentNode.on("tools_detected", toolExecutionNode);
intentNode.on("no_tools" /* 其他處理節點 */);

// 工具執行完成後的路由
toolExecutionNode.on("default" /* 後續處理節點 */);

const chatFlow = new ChatFlow(intentNode, "ChatWithToolExecution");
```

### 專門節點使用

#### LocalSearchNode

```typescript
const localSearchNode = new LocalSearchNode(2, 500);

// 設置路由
localSearchNode.on("local_search_success", nextNode);
localSearchNode.on("local_search_empty", fallbackNode);
```

#### WebSearchNode

```typescript
const webSearchNode = new WebSearchNode(2, 1000);

// 設置路由
webSearchNode.on("web_search_success", nextNode);
webSearchNode.on("web_search_empty", fallbackNode);
```

#### McpToolsNode

```typescript
const mcpToolsNode = new McpToolsNode(2, 500);

// 設置路由
mcpToolsNode.on("mcp_tools_success", nextNode);
mcpToolsNode.on("mcp_tools_error", errorHandlerNode);
mcpToolsNode.on("mcp_tools_empty", fallbackNode);
```

## 配置選項

### 重試機制

```typescript
// 設置重試次數和等待時間
const toolNode = new ToolExecutionBatchNode(
  5, // maxRetries: 最大重試次數
  2000 // wait: 重試間隔（毫秒）
);
```

### 調試模式

```typescript
const shared: ChatSharedState = {
  debug: true, // 啟用調試日誌
  // ... 其他參數
};
```

### 載入訊息客製化

```typescript
const shared: ChatSharedState = {
  updateLoadingMessage: (message: string) => {
    // 自定義載入訊息處理
    console.log("Loading:", message);
  },
  // ... 其他參數
};
```

## 性能優化

### 1. 平行執行優化

工具執行節點會自動識別可以平行執行的工具：

- 本地搜索和網頁搜索可以同時進行
- 多個 MCP 工具可以並發調用
- 時間工具和檔案樹工具可以平行處理

### 2. 記憶體使用優化

```typescript
// 大型結果的處理
const shared: ChatSharedState = {
  toolOutputs: [], // 會自動管理記憶體
  sources: [], // 自動去重和排序
};
```

### 3. 網路請求優化

- 自動重試機制減少網路錯誤
- 適當的等待時間避免 API 限制
- 批量 MCP 工具調用減少延遲

## 錯誤處理

### 1. 工具執行錯誤

```typescript
// 自動錯誤處理和記錄
const result = await toolNode.exec(task);

if (!result.success) {
  console.error("工具執行失敗:", result.error);
  // 錯誤已自動記錄到 MCP 工具調用中
}
```

### 2. 網路錯誤處理

```typescript
// WebSearchNode 的自動回退
async execFallback(searchParams: any, error: Error): Promise<string> {
  if (error.message.includes("API key")) {
    return "網頁搜索功能需要設定 API 金鑰。";
  }
  return `網頁搜索暫時無法使用: ${error.message}`;
}
```

### 3. MCP 工具錯誤追蹤

```typescript
// 完整的 MCP 工具調用記錄
const mcpToolCall: McpToolCall = {
  toolName: "example_tool",
  status: "error",
  error: "詳細錯誤訊息",
  duration: 1500,
  // ... 其他追蹤信息
};
```

## 測試

### 單元測試

```typescript
import { ToolExecutionBatchNode } from "@/pocketflow/nodes";

describe("ToolExecutionBatchNode", () => {
  it("should execute tools in parallel", async () => {
    const node = new ToolExecutionBatchNode();
    // ... 測試邏輯
  });
});
```

### 性能測試

```typescript
// 比較串行 vs 平行執行性能
const batchStart = performance.now();
await batchNode.run(shared);
const batchTime = performance.now() - batchStart;

console.log(`平行執行時間: ${batchTime.toFixed(2)}ms`);
```

## 遷移指南

### 從舊系統遷移

1. **識別現有工具調用邏輯**

   - 找到 `executeToolCalls` 方法
   - 分析工具類型和參數

2. **選擇適當的節點**

   - 批量執行 → `ToolExecutionBatchNode`
   - 本地搜索 → `LocalSearchNode`
   - 網頁搜索 → `WebSearchNode`
   - MCP 工具 → `McpToolsNode`

3. **更新流程結構**

   - 創建 PocketFlow 流程
   - 設置節點連接和路由
   - 測試和優化

4. **驗證功能**
   - 確保所有工具正常執行
   - 驗證 MCP 工具調用記錄
   - 測試錯誤處理機制

## 常見問題

### Q: 如何處理工具執行超時？

A: 在節點構造函數中設置適當的 `wait` 參數，並在 `execFallback` 中處理超時情況。

### Q: 平行執行是否會影響 API 限制？

A: 是的，需要注意 API 速率限制。可以透過調整 `wait` 參數或實現自定義的節流機制。

### Q: 如何監控工具執行性能？

A: 每個工具執行結果都包含 `duration` 字段，可以用於性能監控和優化。

### Q: 是否支援條件性工具執行？

A: 是的，可以在 `prep` 方法中根據條件過濾工具調用，或使用不同的節點路由。

## 範例專案

完整的範例請參考：

- `src/pocketflow/examples/tool-execution-example.ts`
- `src/pocketflow/nodes/ToolExecutionBatchNode.test.ts`

這些範例展示了各種使用場景和最佳實踐。
