# MCP 設置和使用指南

## 問題診斷

根據您的反饋"更新後反而無法正常使用 mcp server"，這通常是因為配置問題導致的。讓我提供一個完整的解決方案。

## 第一步：正確配置 MCP Integration

### 1. 啟用 MCP Integration

在 Obsidian Copilot 設置中：

- 找到 **"MCP Integration"** 部分
- 啟用 **"Enable MCP Integration"** 選項
- 啟用 **"Debug Mode"** (用於調試)

### 2. 配置 MCP Server (以 fetch 為例)

在 MCP Integration 設置中添加一個新的 server：

```json
{
  "id": "fetch-server-001",
  "name": "Fetch Tools",
  "enabled": true,
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-fetch"],
  "transport": "stdio",
  "environment": {},
  "timeout": 30000,
  "retryAttempts": 3,
  "retryDelay": 1000
}
```

### 3. 完整的設置示例

如果您需要手動編輯設置文件，MCP 配置應該如下所示：

```json
{
  "mcpIntegration": {
    "enabled": true,
    "debugMode": true,
    "logLevel": "debug",
    "globalTimeout": 30000,
    "maxConcurrentConnections": 5,
    "servers": [
      {
        "id": "fetch-server-001",
        "name": "Fetch Tools",
        "enabled": true,
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-fetch"],
        "transport": "stdio",
        "environment": {},
        "timeout": 30000,
        "retryAttempts": 3,
        "retryDelay": 1000
      }
    ]
  }
}
```

## 第二步：驗證 MCP Server 狀態

配置完成後，在聊天界面頂部應該會看到：

```
🔌 MCP 服務器 (1 個已連接，2 個工具)
```

點擊可以展開查看詳細狀態：

- ✅ Fetch Tools - 已連接 (2 個工具)
  - mcp_fetch_tools_fetch
  - mcp_fetch_tools_post

## 第三步：在聊天中使用 MCP 工具

### 方法 1：直接使用工具名稱

```
請使用 fetch 工具幫我獲取 https://api.github.com/users/octocat 的信息
```

### 方法 2：使用完整的 MCP 工具名稱

```
@mcp_fetch_tools_fetch https://api.github.com/users/octocat
```

### 方法 3：在對話中自然地請求網頁內容

```
幫我取得 https://httpbin.org/json 的 JSON 數據並分析其內容
```

## 第四步：調試 MCP 問題

### 檢查控制台日誌

1. 啟用 Debug Mode
2. 打開瀏覽器開發者工具 (F12)
3. 查看 Console 標籤
4. 尋找 `[MCPManager]` 或 `[McpClient]` 開頭的日誌

### 常見錯誤和解決方案

#### 1. "MCP integration is not available"

**原因**: MCP Integration 未正確啟用
**解決**: 確認設置中 `enabled: true` 並重啟 Obsidian

#### 2. "Server not connected"

**原因**: MCP server 連接失敗
**解決**:

- 檢查 command 和 args 是否正確
- 確保相關的 npm 包已安裝
- 檢查網絡連接

#### 3. "Tool not found"

**原因**: 工具名稱錯誤或 server 未提供該工具
**解決**:

- 檢查 MCP 服務器狀態欄位中的可用工具列表
- 使用正確的工具名稱格式

### 手動測試 MCP 連接

可以在終端中手動測試 MCP server：

```bash
# 測試 fetch server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx -y @modelcontextprotocol/server-fetch
```

## 第五步：完整的使用示例

### 示例 1：獲取 API 數據

```
用戶: 請幫我獲取 https://jsonplaceholder.typicode.com/posts/1 的內容

系統會自動：
1. 識別需要使用 fetch 工具
2. 調用 mcp_fetch_tools_fetch
3. 返回 JSON 數據並進行分析
```

### 示例 2：多步驟操作

```
用戶: 先獲取 https://httpbin.org/uuid 的 UUID，然後用這個 UUID 發送 POST 請求到 https://httpbin.org/post

系統會自動：
1. 使用 fetch 工具獲取 UUID
2. 解析響應中的 UUID
3. 使用 post 工具發送包含 UUID 的 POST 請求
```

## 故障排除檢查清單

- [ ] MCP Integration 已啟用
- [ ] 至少配置了一個 MCP server
- [ ] MCP server 的 enabled 選項已勾選
- [ ] Debug Mode 已啟用（用於調試）
- [ ] 重新啟動了 Obsidian
- [ ] 查看了瀏覽器控制台的錯誤日誌
- [ ] MCP 服務器狀態欄位顯示"已連接"
- [ ] 嘗試了不同的工具調用方式

## 進階配置

### 添加多個 MCP Servers

```json
{
  "servers": [
    {
      "id": "fetch-server",
      "name": "Fetch Tools",
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    },
    {
      "id": "filesystem-server",
      "name": "File System",
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
    },
    {
      "id": "memory-server",
      "name": "Memory KV",
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  ]
}
```

### 環境變量配置

某些 MCP servers 可能需要環境變量：

```json
{
  "id": "github-server",
  "name": "GitHub Tools",
  "enabled": true,
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "environment": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
  }
}
```

## 總結

按照以上步驟配置後，您應該能夠：

1. 看到 MCP 服務器狀態欄位
2. 成功連接到 MCP servers
3. 在聊天中自然地使用 MCP 工具（如 fetch）
4. 通過調試日誌排除問題

如果仍有問題，請檢查瀏覽器控制台的詳細錯誤日誌，並確保相關的 npm 包可以正常運行。
