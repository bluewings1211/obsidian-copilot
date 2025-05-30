# MCP Transport Error Fix - npm Funding Messages

## 問題描述

在使用 MCP fetch 服務器時，遇到了以下錯誤：

```
Error processing URL https://kubernetes-csi.github.io/docs/support-fsgroup.html with MCP fetch: Error: Transport error
Failed to parse message: 8 packages are looking for funding
```

## 問題根源

1. **npm Funding 訊息污染**: MCP 服務器在啟動時會輸出 npm funding 訊息到標準輸出
2. **JSON-RPC 解析錯誤**: STDIO transport 嘗試將所有輸出解析為 JSON-RPC 訊息
3. **錯誤處理不當**: 非 JSON 訊息被當作錯誤處理，導致連接失敗

## 修復方案

### 1. 環境變數設置 (`src/mcp/transports/stdio.ts`)

在啟動 MCP 服務器時添加環境變數來禁用 npm 通知：

```typescript
const envVars: Record<string, string> = {
  ...process.env,
  ...this.config.env,
  // Disable npm funding messages and other noise
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
  SUPPRESS_NO_CONFIG_WARNING: "true",
};
```

### 2. 訊息過濾邏輯

改進 `processMessage()` 方法來智能處理非 JSON-RPC 訊息：

```typescript
private processMessage(messageStr: string): void {
  try {
    const message = JSON.parse(messageStr);

    if (isJsonRpcMessage(message)) {
      this.onmessage?.(message);
    } else {
      // Log non-JSON-RPC messages as warnings instead of errors
      console.warn(`[MCP Server] Non-JSON-RPC message: ${messageStr}`);
    }
  } catch {
    // Filter out common non-JSON messages that shouldn't be treated as errors
    const lowerMsg = messageStr.toLowerCase();
    if (
      lowerMsg.includes("packages are looking for funding") ||
      lowerMsg.includes("npm notice") ||
      lowerMsg.includes("npm warn") ||
      lowerMsg.includes("found ") && lowerMsg.includes("vulnerabilities") ||
      lowerMsg.startsWith("added ") ||
      lowerMsg.startsWith("removed ") ||
      lowerMsg.startsWith("changed ") ||
      lowerMsg.startsWith("audited ")
    ) {
      // These are informational messages from npm/package managers, not errors
      console.debug(`[MCP Server] Info: ${messageStr}`);
    } else {
      // Only treat actual JSON parsing failures as errors
      console.warn(`[MCP Server] Failed to parse message: ${messageStr}`);
    }
  }
}
```

## 測試結果

使用修復後的代碼進行測試：

### 環境變數測試

- ✅ NPM_CONFIG_FUND: false
- ✅ NPM_CONFIG_AUDIT: false
- ✅ NPM_CONFIG_UPDATE_NOTIFIER: false
- ✅ SUPPRESS_NO_CONFIG_WARNING: true

### 訊息處理測試

- ✅ 有效 JSON-RPC 訊息: 正常處理
- ✅ npm funding 訊息: 已過濾為 info 級別
- ✅ npm notice 訊息: 已過濾為 info 級別
- ✅ npm 包管理訊息: 已過濾為 info 級別

### 集成測試

- ✅ MCP 服務器成功啟動
- ✅ 沒有收到 funding 錯誤訊息
- ✅ 收到有效的 JSON-RPC 初始化響應
- ✅ 服務器工具列表獲取正常

## 影響範圍

這個修復：

1. **向後兼容**: 不會影響現有的正常 JSON-RPC 通信
2. **錯誤減少**: 消除了由 npm 訊息引起的假錯誤
3. **穩定性提升**: 改善了 MCP 服務器連接的穩定性
4. **調試友好**: 保留了相關訊息的日誌輸出，便於調試

## 相關文件

- `src/mcp/transports/stdio.ts` - 主要修復文件
- `src/mcp/constants.ts` - 常數定義
- `src/mcp/types.ts` - 類型定義

## 後續步驟

1. 監控生產環境中的 MCP 連接穩定性
2. 考慮將類似的過濾邏輯應用到其他 transport 類型
3. 定期更新過濾規則以適應新的包管理器訊息格式
