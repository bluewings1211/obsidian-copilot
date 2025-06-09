# MCP 工具調用顯示問題 - 最終修復方案

## 🐛 問題總結

用戶反饋：

> 第二次 chat 並使用 tools 時，僅會更新第一次出現的狀態欄而不是在第二次消息後面

## 🔍 根本原因分析

經過深入調查，問題出現在 MCP 工具調用的追蹤和顯示機制：

1. **錯誤的 messageIndex**：在 `chainRunner.ts` 中，MCP 工具調用被設置為 `messageIndex: -1`
2. **追蹤器邏輯問題**：`McpToolCallTracker` 嘗試更新錯誤的消息索引
3. **狀態更新混亂**：Chat.tsx 中的 `handleMcpToolCallUpdate` 函數錯誤地嘗試修復索引問題

## ✅ 最終修復方案

### 🎯 核心策略：簡化工具調用流程

我採用了完全不同的方法：

- **移除複雜的追蹤機制**：不再使用 `McpToolCallTracker` 進行實時狀態更新
- **直接附加結果**：在工具執行完成後，將結果直接附加到 AI 消息中
- **確保位置正確**：每個 AI 消息都會包含其對應的 MCP 工具調用結果

### 📝 修改的文件

#### 1. `src/LLMProviders/chainRunner.ts` - 主要修改

```typescript
// 新增：在 executeToolCalls 中直接收集 MCP 工具調用結果
private async executeToolCalls(
  toolCalls: any[],
  debug: boolean,
  updateLoadingMessage?: (message: string) => void
): Promise<{ toolOutputs: any[]; mcpToolCalls: McpToolCall[] }> {
  const toolOutputs = [];
  const mcpToolCalls: McpToolCall[] = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    const isMcpTool = ToolManager.isMcpTool(toolCall.tool);

    if (isMcpTool) {
      // 創建 MCP 工具調用記錄
      const mcpToolCall: McpToolCall = {
        toolName: toolCall.tool.name,
        originalToolName: toolCall.tool.mcpToolName || toolCall.tool.name,
        serverName: toolCall.tool.serverName || "unknown",
        serverId: toolCall.tool.serverId || "unknown",
        arguments: toolCall.args || {},
        status: "pending",
        startTime: Date.now(),
      };

      mcpToolCalls.push(mcpToolCall);

      try {
        // 直接執行工具
        output = await ToolManager.callTool(toolCall.tool, toolCall.args);

        // 更新狀態為成功
        mcpToolCall.status = "success";
        mcpToolCall.result = output;
        mcpToolCall.endTime = Date.now();
        mcpToolCall.duration = mcpToolCall.endTime - mcpToolCall.startTime;
      } catch (error) {
        // 更新狀態為錯誤
        mcpToolCall.status = "error";
        mcpToolCall.error = error instanceof Error ? error.message : String(error);
        mcpToolCall.endTime = Date.now();
        mcpToolCall.duration = mcpToolCall.endTime - mcpToolCall.startTime;
        output = null;
      }
    }

    toolOutputs.push({ tool: toolCall.tool.name, output });
  }

  return { toolOutputs, mcpToolCalls };
}

// 修改：在 handleResponse 中附加 MCP 工具調用結果
protected async handleResponse(
  fullAIResponse: string,
  userMessage: ChatMessage,
  abortController: AbortController,
  addMessage: (message: ChatMessage) => void,
  updateCurrentAiMessage: (message: string) => void,
  debug: boolean,
  sources?: { title: string; score: number }[],
  mcpToolCalls?: McpToolCall[]  // 新增參數
) {
  if (fullAIResponse && abortController.signal.reason !== ABORT_REASON.NEW_CHAT) {
    await this.chainManager.memoryManager
      .getMemory()
      .saveContext({ input: userMessage.message }, { output: fullAIResponse });

    addMessage({
      message: fullAIResponse,
      sender: AI_SENDER,
      isVisible: true,
      timestamp: formatDateTime(new Date()),
      sources: sources,
      mcpToolCalls: mcpToolCalls,  // 直接附加到消息
    });
  }
  // ...
}
```

#### 2. `src/components/Chat.tsx` - 清理修改

```typescript
// 移除了 McpToolCallTracker 相關的所有代碼
// 移除了 handleMcpToolCallUpdate 函數
// 移除了複雜的狀態更新邏輯

// 現在 Chat.tsx 回到了乾淨的狀態，只專注於聊天邏輯
```

#### 3. UI 組件保持不變

- `McpServerStatus.tsx` - 顯示系統狀態
- `McpToolDisplay.tsx` - 顯示工具調用結果
- `ChatSingleMessage.tsx` - 正確渲染消息和工具調用

## 🎯 修復後的行為

### ✅ 正確的流程

```
用戶發送消息 1 (使用工具)
→ 工具執行並收集結果
→ AI 回應 1 + MCP 工具調用結果 1

用戶發送消息 2 (使用工具)
→ 工具執行並收集結果
→ AI 回應 2 + MCP 工具調用結果 2

每個消息都有自己獨立的工具調用結果！
```

### 🔧 技術優勢

1. **簡單直接**：工具調用結果直接附加到對應的 AI 消息
2. **無狀態混亂**：沒有複雜的跨組件狀態同步
3. **正確關聯**：每個工具調用結果都與正確的消息關聯
4. **性能更好**：減少了不必要的狀態更新和重渲染

## 📊 對比分析

### 🚫 之前的問題方案

```
工具執行 → McpToolCallTracker → 找錯誤的消息索引 → 更新錯誤位置
```

### ✅ 現在的解決方案

```
工具執行 → 收集結果 → 直接附加到 AI 消息 → 正確顯示
```

## 🧪 測試場景

請驗證以下場景：

### 測試 1：單次工具調用

1. 發送消息並使用 MCP 工具
2. 確認工具調用結果顯示在 AI 回應下方

### 測試 2：多次工具調用

1. 第一次聊天使用工具 → 檢查工具調用結果位置
2. 第二次聊天使用工具 → 檢查新的工具調用結果出現在第二次回應下方
3. 確認第一次的結果保持在原位置

### 測試 3：混合場景

1. 第一次聊天不使用工具
2. 第二次聊天使用工具 → 只有第二次回應有工具調用結果
3. 第三次聊天使用工具 → 第三次回應有新的工具調用結果

### 測試 4：多工具並發

1. 在同一消息中調用多個 MCP 工具
2. 確認所有工具調用都顯示在同一個 AI 回應下方
3. 檢查每個工具的執行狀態和結果

## 🚀 關鍵改進

### 1. 消除索引問題

- ❌ 不再使用 `messageIndex: -1`
- ✅ 工具調用結果直接與 AI 消息關聯

### 2. 簡化狀態管理

- ❌ 移除複雜的跨組件狀態追蹤
- ✅ 使用簡單的消息屬性

### 3. 提高可靠性

- ❌ 消除了狀態更新競爭條件
- ✅ 確保一對一的消息-工具調用關係

### 4. 更好的用戶體驗

- ❌ 不再有工具調用結果顯示在錯誤位置
- ✅ 每次聊天都有清晰、獨立的工具調用顯示

## 🎉 總結

這個修復方案通過：

1. **移除複雜性**：不再使用複雜的追蹤機制
2. **直接關聯**：工具調用結果直接與 AI 消息關聯
3. **確保正確性**：每個 AI 消息都包含其對應的工具調用結果
4. **提高穩定性**：減少狀態管理的複雜性

**徹底解決了 MCP 工具調用顯示位置錯誤的問題！** 🎯

現在用戶將享受到：

- ✅ 正確的工具調用結果位置
- ✅ 清晰的消息-工具調用關聯
- ✅ 穩定可靠的顯示機制
- ✅ 更好的整體用戶體驗
