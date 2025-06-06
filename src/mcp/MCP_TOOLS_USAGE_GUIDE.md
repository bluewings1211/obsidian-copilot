# MCP 工具使用指南

## 概述

這個指南提供了如何正確使用各種 MCP (Model Context Protocol) 工具的詳細說明，包括參數要求、使用示例和常見問題解決。

## 支援的 MCP 工具

### 1. Brave Web Search (`mcp_brave_brave_web_search`)

**功能**: 網路搜尋功能
**參數要求**:

- `query` (string, 必需): 搜尋查詢字串
- `count` (number, 可選): 結果數量 (預設: 10, 最大: 20)
- `offset` (number, 可選): 分頁偏移 (預設: 0, 最大: 9)

**使用示例**:

```
// 聊天中使用
@mcp_brave_brave_web_search TypeScript best practices

@mcp_brave_brave_web_search Node.js tutorials 5

// 程式化調用
await adapter.callTool('mcp_brave_brave_web_search', {
  query: 'JavaScript frameworks comparison',
  count: 5,
  offset: 0
});
```

### 2. Sequential Thinking (`mcp_sequential_thinking_sequentialthinking`)

**功能**: 結構化順序思考工具
**參數要求**:

- `thought` (string, 必需): 當前思考內容
- `thoughtNumber` (number, 必需): 當前思考編號 (從 1 開始)
- `totalThoughts` (number, 必需): 總思考步驟數
- `nextThoughtNeeded` (boolean, 必需): 是否需要下一個思考步驟

**使用示例**:

```
// 聊天中使用 (自動設定預設參數)
@mcp_sequential_thinking_sequentialthinking 請以電信終端使用者的角度思考如何提升安全性

// 程式化調用 (完整參數)
await adapter.callTool('mcp_sequential_thinking_sequentialthinking', {
  thought: "分析使用者安全需求",
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true
});
```

**多步思考示例**:

```javascript
// 步驟 1
{
  thought: "第一步：分析現狀和問題",
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true
}

// 步驟 2
{
  thought: "第二步：評估可能的解決方案",
  thoughtNumber: 2,
  totalThoughts: 3,
  nextThoughtNeeded: true
}

// 步驟 3 (最後一步)
{
  thought: "第三步：制定實施計劃",
  thoughtNumber: 3,
  totalThoughts: 3,
  nextThoughtNeeded: false
}
```

## 聊天中的使用語法

### 基本語法

```
@工具名稱 參數內容
```

### 支援的工具提及格式

- `@mcp_brave_brave_web_search 搜尋內容`
- `@mcp_sequential_thinking_sequentialthinking 思考內容`

### 參數自動解析規則

1. **文字參數**: 工具名稱後的所有內容會被用作主要文字參數
2. **數字參數**: 系統會自動從內容中提取數字
3. **預設值**: 某些參數會有合理的預設值

## 程式化調用

### 基本調用方式

```typescript
import { McpToolAdapterManager } from "@/mcp/tool-adapter";

const adapter = McpToolAdapterManager.getInstance();

// 調用工具
const result = await adapter.callTool("工具名稱", {
  參數名稱: "參數值",
});
```

### 獲取可用工具

```typescript
const tools = await adapter.getTools();
console.log(
  "可用工具:",
  tools.map((t) => t.name)
);
```

### 檢查工具 Schema

```typescript
const tools = await adapter.getTools();
const tool = tools.find((t) => t.name === "工具名稱");
console.log("工具 Schema:", tool.inputSchema);
```

## 測試和調試

### 控制台測試函數

```javascript
// 測試參數解析
testArgumentParsing();

// 測試特定工具
testSpecificToolParsing(
  "mcp_brave_brave_web_search",
  "@mcp_brave_brave_web_search JavaScript frameworks"
);

// 測試完整流程
testFullToolCallFlow("@mcp_sequential_thinking_sequentialthinking 分析問題");

// 測試 Sequential Thinking
testSequentialThinking();

// 驗證工具 Schema
validateSequentialThinkingSchema();
```

### 調試技巧

1. **檢查控制台日誌**:

   - `[IntentAnalyzer] Extracted args for 工具名稱`
   - `[McpToolAdapter] Calling MCP tool`
   - `[McpManager] callTool received params`

2. **驗證參數格式**:

   ```typescript
   console.log("傳送的參數:", JSON.stringify(args, null, 2));
   ```

3. **檢查工具可用性**:
   ```typescript
   const tools = await adapter.getTools();
   const isAvailable = tools.some((t) => t.name === "工具名稱");
   ```

## 常見問題與解決方案

### 問題 1: "Invalid arguments" 錯誤

**症狀**: 工具回傳 "Invalid arguments for 工具名稱" 錯誤

**可能原因**:

- 缺少必需參數
- 參數類型不正確
- 參數值超出允許範圍

**解決方法**:

1. 檢查工具的 inputSchema
2. 確認所有必需參數都已提供
3. 驗證參數類型和格式

### 問題 2: 參數沒有正確解析

**症狀**: 控制台顯示 `"args": {}`

**可能原因**:

- 工具名稱格式不正確
- 訊息格式不符合解析規則

**解決方法**:

1. 使用正確的工具名稱格式 `@mcp_伺服器_工具名稱`
2. 確保工具名稱後有空格和內容
3. 檢查 intentAnalyzer 的解析邏輯

### 問題 3: Sequential Thinking 特定錯誤

**常見錯誤訊息**:

- "Invalid thoughtNumber: must be a number"
- "Invalid totalThoughts: must be a number"
- "Invalid nextThoughtNeeded: must be a boolean"
- "Invalid thought: must be a string"

**解決方法**:
確保提供所有四個必需參數：

```typescript
{
  thought: "思考內容",
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true
}
```

## 最佳實踐

### 1. 工具選擇

- **Brave Search**: 適用於需要即時網路資訊的查詢
- **Sequential Thinking**: 適用於需要結構化思考的複雜問題

### 2. 參數設計

- 保持參數簡潔明確
- 使用描述性的參數名稱
- 提供合理的預設值

### 3. 錯誤處理

- 總是檢查工具調用的結果
- 實施適當的錯誤恢復機制
- 記錄詳細的錯誤資訊以便調試

### 4. 效能考量

- 避免不必要的重複調用
- 考慮實施結果快取
- 監控工具調用的執行時間

## 開發指南

### 新增新工具支援

1. **更新 intentAnalyzer.ts**:

   ```typescript
   // 在 extractMcpToolArguments 中新增特殊處理邏輯
   if (tool.name === "新工具名稱") {
     return {
       // 工具特定的參數解析邏輯
     };
   }
   ```

2. **建立測試腳本**:

   ```typescript
   // 建立 test-新工具.ts
   export async function test新工具() {
     // 測試邏輯
   }
   ```

3. **更新文檔**:
   - 在此指南中新增工具說明
   - 提供使用示例
   - 記錄已知問題和解決方案

### 調試工具

可以使用以下調試工具來開發和測試 MCP 工具：

- `src/mcp/test-argument-parsing.ts` - 參數解析測試
- `src/mcp/test-sequential-thinking.ts` - Sequential Thinking 專用測試
- `src/mcp/brave-search-debug.ts` - Brave Search 調試
- `src/mcp/test-brave-fix.ts` - 整體修復驗證

## 版本歷史

- **v1.0**: 基礎 MCP 工具支援
- **v1.1**: 修復參數解析問題，新增 Sequential Thinking 支援
- **v1.2**: 完善錯誤處理和調試功能

## 相關資源

- [MCP 官方文檔](https://github.com/modelcontextprotocol)
- [Brave Search API](https://api.search.brave.com/app/documentation)
- [Sequential Thinking GitHub](https://github.com/Doriandarko/mcp-sequential-thinking)
