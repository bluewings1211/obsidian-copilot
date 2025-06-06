# MCP 工具參數解析問題修復

## 問題描述

在測試 MCP 工具時發現兩個主要問題：

1. **Brave Search 錯誤**: 在測試 `mcp_brave_brave_web_search` 時出現 "Invalid arguments for brave_web_search" 錯誤
2. **參數解析問題**: 使用聊天輸入如 `@mcp_sequential_thinking_sequentialthinking 請以終端使用者來思考如何提高電信資安` 時，控制台顯示傳遞的參數為空 `{}`

## 根本原因分析

### 問題 1: 參數驗證和傳遞

- 參數清理不足: 原始參數可能包含 `undefined`、`function` 或其他無法序列化的值
- 錯誤處理不夠詳細: 原始錯誤訊息不提供足夠的調試資訊
- 參數格式驗證: JSON-RPC 傳輸要求參數必須是可序列化的純物件

### 問題 2: 意圖分析器參數解析缺失 **[主要問題]**

在 `intentAnalyzer.ts` 的 `processMcpToolCalls` 方法中，MCP 工具調用時總是使用空的參數：

```typescript
// For now, call with empty args - this could be enhanced to parse args from message
processedToolCalls.push({
  tool,
  args: {}, // 這裡總是傳遞空物件！
});
```

這導致無論用戶輸入什麼內容，MCP 工具都收不到任何參數。

## 修復方案

### 1. **[主要修復]** 實現 MCP 工具參數解析 (`intentAnalyzer.ts`)

新增 `extractMcpToolArguments` 方法來從聊天訊息中提取參數：

```typescript
private static extractMcpToolArguments(originalMessage: string, toolMention: string, tool: any): any {
  // 獲取工具提及後的內容
  const toolIndex = originalMessage.indexOf(toolMention);
  const contentAfterTool = originalMessage.substring(toolIndex + toolMention.length).trim();

  if (!contentAfterTool) {
    return {};
  }

  const inputSchema = tool.inputSchema;
  const args: any = {};

  if (inputSchema && inputSchema.properties) {
    const properties = inputSchema.properties;

    // 根據 schema 處理常見參數模式
    for (const [propName, propSchema] of Object.entries(properties)) {
      const prop = propSchema as any;

      // 對於 'query'、'prompt' 等字串參數，使用剩餘內容
      if ((propName === 'query' || propName === 'prompt' || propName === 'question' || propName === 'text') && prop.type === 'string') {
        args[propName] = contentAfterTool;
      }

      // 對於數字參數，嘗試提取數字
      else if ((propName === 'count' || propName === 'limit') && prop.type === 'number') {
        const numberMatch = contentAfterTool.match(/\b(\d+)\b/);
        if (numberMatch) {
          args[propName] = parseInt(numberMatch[1], 10);
        }
      }

      // 對於布林參數，檢查關鍵字
      else if (prop.type === 'boolean') {
        const lowerContent = contentAfterTool.toLowerCase();
        if (lowerContent.includes('true') || lowerContent.includes('yes')) {
          args[propName] = true;
        } else if (lowerContent.includes('false') || lowerContent.includes('no')) {
          args[propName] = false;
        }
      }
    }
  }

  return args;
}
```

### 2. 參數清理機制 (`tool-adapter.ts`)

新增 `sanitizeArguments` 方法來清理和驗證參數：

```typescript
private sanitizeArguments(args: any): any {
  if (!args || typeof args !== 'object') {
    return {};
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(args)) {
    // 跳過 undefined 和 function 值
    if (value === undefined || typeof value === 'function') {
      continue;
    }

    // 處理基本類型和嵌套物件
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null ? this.sanitizeArguments(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = this.sanitizeArguments(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
```

### 3. 增強錯誤處理

在 `callMcpTool` 方法中加入更詳細的錯誤訊息，包含實際傳遞的參數資訊。

### 4. 增強調試日誌

在多個關鍵點加入詳細的參數追踪日誌，便於問題診斷。

## 測試驗證

### 調試工具

創建了 `brave-search-debug.ts` 來診斷問題：

```typescript
// 在控制台中運行
debugBraveSearch();
```

### 修復測試

創建了 `test-brave-fix.ts` 來驗證修復：

```typescript
// 測試基本功能
testBraveSearchFix();

// 測試錯誤處理
testBraveSearchErrorCases();

// 綜合測試
runComprehensiveBraveTest();
```

## 使用方法

### 1. 在聊天中使用 MCP 工具

現在您可以直接在聊天中使用 MCP 工具，參數會自動從訊息中解析：

```
@mcp_sequential_thinking_sequentialthinking 請以終端使用者來思考如何提高電信資安

@mcp_brave_brave_web_search TypeScript best practices

@mcp_brave_brave_web_search Node.js tutorials 5
```

### 2. 程式化調用

```typescript
// 基本搜尋
await adapter.callTool("mcp_brave_brave_web_search", {
  query: "TypeScript programming",
});

// 帶參數的搜尋
await adapter.callTool("mcp_brave_brave_web_search", {
  query: "Node.js best practices",
  count: 5,
  offset: 0,
});
```

### 3. 測試和調試

```typescript
// 測試參數解析
testArgumentParsing();

// 測試特定工具
testSpecificToolParsing(
  "mcp_sequential_thinking_sequentialthinking",
  "@mcp_sequential_thinking_sequentialthinking 測試問題"
);

// 測試完整流程
testFullToolCallFlow("@mcp_brave_brave_web_search TypeScript debugging");

// 原有的調試工具
debugBraveSearch();
runComprehensiveBraveTest();
```

## 預期效果

修復後應該：

1. ✅ 成功執行 Brave search 查詢
2. ✅ 返回格式化的搜尋結果
3. ✅ 提供詳細的錯誤訊息（如果出錯）
4. ✅ 正確處理各種參數組合
5. ✅ 在控制台提供詳細的調試資訊

## 常見問題排除

### Q: 仍然看到 "Invalid arguments" 錯誤

A: 檢查參數是否符合 Brave search API 的要求：

- `query` (必需): 搜尋字串
- `count` (可選): 結果數量 (1-20)
- `offset` (可選): 分頁偏移 (0-9)

### Q: 工具無法找到

A: 確認：

- MCP 整合已啟用
- Brave search 伺服器已連接
- 工具適配器已初始化

### Q: 結果格式異常

A: 檢查 `formatToolResult` 方法是否正確處理 Brave search 的回應格式

## 相關檔案

### 主要修復檔案

- `src/LLMProviders/intentAnalyzer.ts` - **[核心修復]** 實現 MCP 工具參數解析
- `src/mcp/tool-adapter.ts` - 參數清理和錯誤處理邏輯
- `src/mcp/manager.ts` - 增強的調試日誌

### 測試和調試工具

- `src/mcp/test-argument-parsing.ts` - **[新增]** 參數解析測試腳本
- `src/mcp/brave-search-debug.ts` - 原有的調試工具
- `src/mcp/test-brave-fix.ts` - 原有的測試腳本

### 文檔

- `src/mcp/BRAVE_SEARCH_FIX.md` - 這個修復文檔

### 相關核心檔案

- `src/LLMProviders/chainRunner.ts` - 工具調用執行邏輯
- `src/components/Chat.tsx` - 聊天處理流程
- `src/mcp/tool-call-tracker.ts` - MCP 工具調用追踪
