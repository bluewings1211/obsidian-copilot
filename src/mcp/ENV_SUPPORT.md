# MCP 環境變數支援

## 概述

Obsidian Copilot 的 MCP (Model Context Protocol) 整合現在支援為 MCP 伺服器設定環境變數。這個功能讓您可以安全地傳遞 API 金鑰和其他敏感配置給 MCP 伺服器。

## 功能

- ✅ 支援在 MCP 伺服器設定中新增環境變數
- ✅ 自動偵測敏感資料（包含 'key', 'secret', 'token' 的變數名稱）並以密碼格式顯示
- ✅ 支援動態新增和移除環境變數
- ✅ 與現有的 stdio transport 完全整合

## 使用方法

### 1. 透過設定介面

1. 開啟 Obsidian Copilot 設定
2. 導航到 "MCP 設定" 頁面
3. 新增或編輯一個 MCP 伺服器
4. 選擇 "Stdio" 作為傳輸類型
5. 在 "環境變數" 區段：
   - 點擊 "新增環境變數" 按鈕
   - 輸入變數名稱（例如：`BRAVE_API_KEY`）
   - 輸入變數值（例如：`BSAfCA2JnI3giomIbZl7TcRS6jupGGG`）
   - 重複以上步驟新增更多環境變數

### 2. 範例配置

```typescript
const mcpServerConfig: McpServerConfig = {
  id: "brave-search",
  name: "Brave Search MCP Server",
  enabled: true,
  transport: "stdio",
  connection: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: {
      BRAVE_API_KEY: "BSAfCA2JnI3giomIbZl7TcRS6jupGGG",
      NODE_ENV: "production",
      DEBUG: "false",
    },
    cwd: "",
  },
};
```

## 常見使用案例

### Brave Search MCP 伺服器

```bash
# 伺服器指令
npx -y @modelcontextprotocol/server-brave-search

# 所需環境變數
BRAVE_API_KEY=您的_Brave_Search_API_金鑰
```

### OpenRouter MCP 伺服器

```bash
# 伺服器指令
npx -y @openrouter/mcp-server

# 所需環境變數
OPENROUTER_API_KEY=您的_OpenRouter_API_金鑰
```

### 自訂 MCP 伺服器

```bash
# 伺服器指令
python /path/to/your/mcp_server.py

# 所需環境變數
API_KEY=您的_API_金鑰
SERVER_PORT=3000
LOG_LEVEL=info
```

## 安全性注意事項

1. **敏感資料保護**: 包含 'key', 'secret', 'token' 的環境變數會自動以密碼格式顯示
2. **本地儲存**: 環境變數會被儲存在 Obsidian 的設定檔中
3. **傳輸安全**: 環境變數只會傳遞給本地的 MCP 伺服器程序

## 技術實作

- 環境變數透過 Node.js 的 `spawn` 函數的 `env` 選項傳遞給子程序
- 現有的系統環境變數會被保留，自訂環境變數會覆蓋同名的系統變數
- 支援動態更新，無需重啟 Obsidian

## 故障排除

### 環境變數未生效

1. 檢查變數名稱是否正確（區分大小寫）
2. 確認 MCP 伺服器是否正確讀取環境變數
3. 檢查 MCP 伺服器的文檔以確認所需的環境變數

### 伺服器啟動失敗

1. 檢查指令和參數是否正確
2. 確認所有必需的環境變數都已設定
3. 查看 Obsidian 的開發者工具控制台以獲取錯誤訊息

## 更新日誌

- **2025-01-06**: 新增環境變數支援功能
- **2025-01-06**: 新增敏感資料自動偵測和保護
- **2025-01-06**: 新增動態環境變數管理 UI
