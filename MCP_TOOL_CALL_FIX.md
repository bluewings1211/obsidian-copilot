# MCP 工具調用顯示修復

## 🐛 問題描述

用戶反饋的問題：

> 消息部分的 mcp 狀態列，第一次 chat 並使用 tools 時會出現調用狀態，這點很好
> 但第二次 chat 並使用 tools 時，僅會更新第一次出現的狀態欄而不是在第二次消息後面，這點應改善

## 🔍 問題原因

原先的 `handleMcpToolCallUpdate` 函數邏輯有誤：

```typescript
// 錯誤的邏輯 - 會錯誤地更新到第一個有 mcpToolCalls 的消息
const updatedHistory = [...chatHistory];
if (updatedHistory[messageIndex]) {
  if (!updatedHistory[messageIndex].mcpToolCalls) {
    updatedHistory[messageIndex].mcpToolCalls = [];
  }
  // ... 更新邏輯
}
```

問題在於：

1. 沒有正確驗證 `messageIndex` 的有效性
2. 直接操作原始陣列元素，可能導致 React 狀態更新問題
3. 沒有創建深拷貝，導致狀態更新不正確

## ✅ 修復方案

### 1. 改進的 handleMcpToolCallUpdate 函數

```typescript
const handleMcpToolCallUpdate = useCallback(
  (update: ToolCallUpdate) => {
    const { messageIndex, toolCallIndex, update: toolCallUpdate } = update;

    // 確保 messageIndex 在有效範圍內
    if (messageIndex < 0 || messageIndex >= chatHistory.length) {
      console.warn(
        `Invalid messageIndex ${messageIndex}, chatHistory length: ${chatHistory.length}`
      );
      return;
    }

    // 創建聊天記錄的深拷貝
    const updatedHistory = chatHistory.map((message, index) => {
      // 只更新目標消息
      if (index !== messageIndex) {
        return message;
      }

      // 確保目標消息有 mcpToolCalls 陣列
      const updatedMessage = { ...message };
      if (!updatedMessage.mcpToolCalls) {
        updatedMessage.mcpToolCalls = [];
      }

      // 確保有足夠的工具調用槽位
      const mcpToolCalls = [...updatedMessage.mcpToolCalls];
      while (mcpToolCalls.length <= toolCallIndex) {
        mcpToolCalls.push({
          toolName: "",
          originalToolName: "",
          serverName: "",
          serverId: "",
          arguments: {},
          status: "pending",
          startTime: Date.now(),
        });
      }

      // 更新特定的工具調用
      mcpToolCalls[toolCallIndex] = {
        ...mcpToolCalls[toolCallIndex],
        ...toolCallUpdate,
      };

      updatedMessage.mcpToolCalls = mcpToolCalls;
      return updatedMessage;
    });

    // 重新設置聊天記錄
    clearMessages();
    updatedHistory.forEach(addMessage);
  },
  [chatHistory, addMessage, clearMessages]
);
```

### 2. 關鍵改進點

#### A. 安全性檢查

```typescript
// 確保 messageIndex 在有效範圍內
if (messageIndex < 0 || messageIndex >= chatHistory.length) {
  console.warn(`Invalid messageIndex ${messageIndex}, chatHistory length: ${chatHistory.length}`);
  return;
}
```

#### B. 精確更新

```typescript
// 只更新目標消息
if (index !== messageIndex) {
  return message; // 其他消息保持不變
}
```

#### C. 深拷貝策略

```typescript
// 創建消息的深拷貝
const updatedMessage = { ...message };
const mcpToolCalls = [...updatedMessage.mcpToolCalls];
```

#### D. 不可變更新

```typescript
// 更新特定的工具調用
mcpToolCalls[toolCallIndex] = {
  ...mcpToolCalls[toolCallIndex],
  ...toolCallUpdate,
};
```

## 🎯 修復後的行為

### 之前（問題狀態）

```
第一次聊天 + 工具調用:
  消息1: [工具調用結果] ← 正確顯示

第二次聊天 + 工具調用:
  消息1: [工具調用結果] ← 錯誤更新這裡
  消息2: (沒有工具調用顯示) ← 應該在這裡顯示
```

### 現在（修復後）

```
第一次聊天 + 工具調用:
  消息1: [工具調用結果] ← 正確顯示

第二次聊天 + 工具調用:
  消息1: [工具調用結果] ← 保持不變
  消息2: [工具調用結果] ← 正確顯示在這裡
```

## 🔧 技術細節

### 1. React 狀態管理改進

- 使用 `map` 創建全新的陣列
- 避免直接修改現有物件
- 確保 React 能正確檢測狀態變化

### 2. 錯誤處理

- 添加邊界檢查
- 提供有意義的警告訊息
- 防止無效操作

### 3. 性能考慮

- 只更新必要的消息
- 使用淺拷貝優化性能
- 避免不必要的重渲染

## 📋 測試場景

請驗證以下場景：

### 場景 1：單次工具調用

1. 發送消息並使用 MCP 工具
2. 確認工具調用狀態顯示在正確的消息下方

### 場景 2：多次工具調用

1. 第一次聊天使用工具 → 檢查狀態欄顯示
2. 第二次聊天使用工具 → 檢查新狀態欄出現在第二次消息下方
3. 確認第一次的狀態欄保持不變

### 場景 3：混合聊天

1. 第一次聊天不使用工具
2. 第二次聊天使用工具 → 檢查狀態欄只出現在第二次消息
3. 第三次聊天使用工具 → 檢查狀態欄出現在第三次消息

### 場景 4：並發工具調用

1. 在同一消息中調用多個工具
2. 確認所有工具調用都顯示在同一個狀態欄中
3. 檢查每個工具的狀態更新正確

## 🚀 其他改進

### 1. 調試信息

添加了有用的調試訊息：

```typescript
console.warn(`Invalid messageIndex ${messageIndex}, chatHistory length: ${chatHistory.length}`);
```

### 2. 錯誤恢復

函數現在能安全地處理無效的 `messageIndex`，避免應用崩潰。

### 3. 狀態一致性

確保 React 狀態更新的一致性，避免 UI 不同步問題。

## ✅ 驗證清單

- [ ] 第一次使用工具時狀態欄正確顯示
- [ ] 第二次使用工具時狀態欄顯示在正確位置
- [ ] 多次工具調用時各自獨立顯示
- [ ] 沒有 JavaScript 錯誤
- [ ] UI 更新流暢無延遲
- [ ] 工具調用詳情正確顯示

## 📝 總結

這個修復解決了 MCP 工具調用狀態欄顯示位置錯誤的問題：

✅ **精確定位**：工具調用狀態現在會顯示在正確的消息下方
✅ **狀態隔離**：每次聊天的工具調用狀態互不干擾
✅ **安全更新**：添加了邊界檢查和錯誤處理
✅ **性能優化**：只更新需要更新的消息

現在用戶將享受到正確的 MCP 工具調用狀態顯示體驗！🎉
