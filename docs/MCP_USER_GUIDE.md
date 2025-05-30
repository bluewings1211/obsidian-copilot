# Model Context Protocol (MCP) 使用者指南

> 🚀 **全新功能**：Obsidian Copilot 現在支援 Model Context Protocol (MCP)，大幅擴展您的 AI 助手功能！

## 目錄

- [什麼是 MCP？](#什麼是-mcp)
- [快速開始](#快速開始)
- [安裝和設定](#安裝和設定)
- [支援的 MCP 伺服器](#支援的-mcp-伺服器)
- [設定說明](#設定說明)
- [使用範例](#使用範例)
- [故障排除](#故障排除)
- [高級設定](#高級設定)
- [開發者資源](#開發者資源)

## 什麼是 MCP？

Model Context Protocol (MCP) 是一個開放標準，允許 AI 應用程式安全地連接到外部資料來源和工具。透過 MCP 整合，Obsidian Copilot 可以：

- 🔗 **連接外部服務**：檔案系統、資料庫、API、雲端服務等
- 🛠️ **使用專門工具**：程式碼執行、資料分析、網路搜尋等
- 📚 **存取豐富資源**：文件、圖片、結構化資料等
- 🧩 **擴展功能**：透過社群開發的 MCP 伺服器

## 快速開始

### 第一步：啟用 MCP 整合

1. 開啟 Obsidian Copilot 設定頁面
2. 切換到 **MCP 設定** 分頁
3. 開啟「**啟用 MCP 整合**」開關

### 第二步：新增您的第一個 MCP 伺服器

1. 點擊「**新增伺服器**」按鈕
2. 選擇一個 MCP 伺服器類型（建議從檔案系統伺服器開始）
3. 填寫必要的設定資訊
4. 點擊「**儲存**」

### 第三步：開始使用

啟用 MCP 伺服器後，您就可以在 Copilot 聊天中使用新的工具和功能了！

## 安裝和設定

### 前置需求

根據您想使用的 MCP 伺服器類型，您可能需要安裝：

- **Node.js** (推薦 v18 或更新版本)
- **Python** (推薦 v3.8 或更新版本)
- **npm** 或其他包管理器

### 常見 MCP 伺服器安裝

#### 1. 檔案系統伺服器

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

#### 2. 記憶庫伺服器

```bash
npm install -g @upstash/context7-mcp
```

#### 3. SQLite 資料庫伺服器

```bash
npm install -g @modelcontextprotocol/server-sqlite
```

#### 4. GitHub 整合伺服器

```bash
npm install -g @modelcontextprotocol/server-github
```

## 支援的 MCP 伺服器

### 📁 檔案系統伺服器

- **功能**：讀取、寫入、搜尋本地檔案
- **適用場景**：文件管理、程式碼分析、內容處理
- **安裝**：`npm install -g @modelcontextprotocol/server-filesystem`

### 🗃️ 記憶庫伺服器

- **功能**：持久化對話上下文、專案記憶
- **適用場景**：長期專案跟蹤、上下文保持
- **安裝**：`npm install -g @upstash/context7-mcp`

### 🗄️ SQLite 資料庫伺服器

- **功能**：資料庫查詢、資料分析、結構化資料操作
- **適用場景**：資料分析、報表生成、資料管理
- **安裝**：`npm install -g @modelcontextprotocol/server-sqlite`

### 🐙 GitHub 伺服器

- **功能**：程式碼倉庫操作、議題管理、PR 分析
- **適用場景**：程式碼審查、專案管理、開發協作
- **安裝**：`npm install -g @modelcontextprotocol/server-github`

### 🌤️ 天氣伺服器

- **功能**：獲取天氣資訊、預報查詢
- **適用場景**：旅行規劃、日常決策
- **安裝**：`npm install -g @modelcontextprotocol/server-weather`

## 設定說明

### 基本設定

在 Copilot 設定的 MCP 分頁中，您可以設定：

#### 全域設定

- **全域超時時間**：MCP 操作的預設超時時間（1-30秒）
- **最大並發連接數**：同時連接的 MCP 伺服器數量（1-10個）
- **除錯模式**：啟用詳細的除錯日誌
- **日誌級別**：控制日誌的詳細程度

#### 伺服器設定

每個 MCP 伺服器都可以獨立設定：

- **名稱**：伺服器的顯示名稱
- **描述**：伺服器功能說明
- **傳輸協議**：Stdio、SSE 或 HTTP
- **連接資訊**：執行命令、URL 等
- **啟用狀態**：開啟或關閉特定伺服器

### 傳輸協議選擇

#### Stdio（推薦）

- **適用於**：本地安裝的 MCP 伺服器
- **優點**：簡單、安全、效能好
- **設定**：只需指定執行命令和參數

#### SSE (Server-Sent Events)

- **適用於**：遠端 MCP 伺服器
- **優點**：支援即時更新、雙向通訊
- **設定**：需要提供伺服器 URL

#### HTTP

- **適用於**：基於 REST API 的服務
- **優點**：標準協議、廣泛支援
- **設定**：需要提供 API 端點和認證資訊

## 使用範例

### 範例 1：檔案操作

```
使用者：請幫我分析 /Users/username/Documents/report.txt 檔案的內容

Copilot：我來幫您分析該檔案的內容。
[使用檔案系統 MCP 伺服器讀取檔案]
檔案內容包含了...
```

### 範例 2：資料庫查詢

```
使用者：查詢銷售資料庫中本月的總銷售額

Copilot：我來查詢銷售資料庫的資料。
[使用 SQLite MCP 伺服器執行查詢]
根據資料庫查詢結果，本月總銷售額為...
```

### 範例 3：GitHub 整合

```
使用者：檢查我的專案倉庫中是否有未解決的高優先級議題

Copilot：我來檢查您的 GitHub 倉庫。
[使用 GitHub MCP 伺服器查詢議題]
發現以下高優先級議題...
```

## 故障排除

### 常見問題

#### Q: MCP 伺服器無法連接

**A:** 檢查以下項目：

1. 確認 MCP 伺服器已正確安裝
2. 驗證執行命令和參數正確
3. 檢查系統環境變數（如 NODE_PATH、PYTHON_PATH）
4. 查看 Obsidian 開發者控制台的錯誤訊息

#### Q: 工具調用失敗

**A:** 可能的解決方案：

1. 檢查工具參數是否正確
2. 確認 MCP 伺服器權限設定
3. 增加超時時間設定
4. 啟用除錯模式查看詳細錯誤

#### Q: 效能問題

**A:** 最佳化建議：

1. 減少同時啟用的 MCP 伺服器數量
2. 調整全域超時時間
3. 關閉不必要的除錯日誌
4. 確保 MCP 伺服器版本是最新的

### 除錯技巧

#### 1. 啟用除錯模式

在 MCP 設定中開啟除錯模式，可以看到詳細的連接和操作日誌。

#### 2. 檢查開發者控制台

- Mac：`Cmd + Option + I`
- Windows：`Ctrl + Shift + I`

#### 3. 測試 MCP 伺服器

使用內建的測試功能驗證 MCP 伺服器：

```javascript
// 在開發者控制台中執行
runMcpIntegrationTest();
```

## 高級設定

### 自訂 MCP 伺服器

如果您想建立自己的 MCP 伺服器，可以參考：

1. [MCP 官方規格](https://spec.modelcontextprotocol.io/)
2. [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
3. [Python SDK](https://github.com/modelcontextprotocol/python-sdk)

### 環境變數設定

某些 MCP 伺服器可能需要環境變數：

```bash
# GitHub 伺服器
export GITHUB_PERSONAL_ACCESS_TOKEN="your_token_here"

# OpenAI 伺服器
export OPENAI_API_KEY="your_api_key_here"
```

### 效能調整

#### 連接池管理

系統會自動管理 MCP 連接池，但您可以調整：

- 最大並發連接數
- 連接超時時間
- 重試次數和間隔

#### 快取策略

- 工具列表會被快取以提高效能
- 資源清單定期更新
- 可在設定中調整快取更新頻率

## 安全考量

### 權限控制

- MCP 伺服器只能存取明確授權的資源
- 檔案系統存取受限於設定的目錄
- 敏感操作需要使用者確認

### 資料隱私

- 所有 MCP 通訊都在本地進行
- 不會向雲端服務傳送未授權的資料
- 可在設定中檢視和控制資料流向

## 開發者資源

### API 文件

完整的 MCP 整合 API 文件可在 `src/mcp/README.md` 中找到。

### 測試工具

```javascript
// 測試特定伺服器
testMcpServer("server_id");

// 執行完整整合測試
runMcpIntegrationTest();

// 測試真實伺服器環境
runRealMcpServerTests();
```

### 開發範例

查看 `src/mcp/` 目錄中的範例程式碼，了解如何：

- 建立自訂 MCP 客戶端
- 實作新的傳輸協議
- 擴展工具系統

## 社群和支援

### 獲取幫助

- [GitHub Issues](https://github.com/logancyang/obsidian-copilot/issues)
- [社群討論](https://github.com/logancyang/obsidian-copilot/discussions)
- [Discord 頻道](https://discord.gg/obsidian-copilot)

### 貢獻

歡迎為 MCP 整合做出貢獻：

- 回報錯誤和問題
- 提出功能建議
- 分享 MCP 伺服器設定
- 改進文件

### 相關連結

- [MCP 官方網站](https://modelcontextprotocol.io/)
- [MCP 伺服器生態系統](https://github.com/modelcontextprotocol/servers)
- [Obsidian Copilot 官網](https://obsidiancopilot.com)

---

**📝 注意**：MCP 整合功能還在持續開發中。如果您遇到任何問題或有改進建議，請在 GitHub 上提出 issue 或參與討論。我們歡迎您的回饋！
