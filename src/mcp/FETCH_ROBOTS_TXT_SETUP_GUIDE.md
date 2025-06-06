# mcp-server-fetch 忽略 robots.txt 設定指南

## 快速解決方案

如果您的 mcp-server-fetch 無法忽略 robots.txt，問題很可能是 `--ignore-robots-txt` 參數沒有正確配置在 MCP 伺服器的 `args` 陣列中。

## 🔧 正確配置方式

### 方法 1: 使用 uvx (推薦)

在 Obsidian Copilot 的 MCP 設定中：

1. **伺服器名稱**: `fetch`
2. **傳輸類型**: `Stdio (標準輸入輸出)`
3. **指令**: `uvx`
4. **參數**:
   - 第一個參數: `mcp-server-fetch`
   - 第二個參數: `--ignore-robots-txt`

完整的 JSON 配置：

```json
{
  "name": "fetch",
  "description": "Web content fetching with robots.txt ignored",
  "enabled": true,
  "transport": "stdio",
  "connection": {
    "command": "uvx",
    "args": ["mcp-server-fetch", "--ignore-robots-txt"],
    "env": {},
    "cwd": ""
  }
}
```

### 方法 2: 使用 Python

如果您使用 pip 安裝了 mcp-server-fetch：

1. **指令**: `python`
2. **參數**:
   - 第一個參數: `-m`
   - 第二個參數: `mcp_server_fetch`
   - 第三個參數: `--ignore-robots-txt`

```json
{
  "command": "python",
  "args": ["-m", "mcp_server_fetch", "--ignore-robots-txt"]
}
```

### 方法 3: 使用 Docker

1. **指令**: `docker`
2. **參數**:
   - 第一個參數: `run`
   - 第二個參數: `-i`
   - 第三個參數: `--rm`
   - 第四個參數: `mcp/fetch`
   - 第五個參數: `--ignore-robots-txt`

```json
{
  "command": "docker",
  "args": ["run", "-i", "--rm", "mcp/fetch", "--ignore-robots-txt"]
}
```

## ❌ 常見錯誤

### 錯誤 1: 參數名稱不正確

```json
// ❌ 錯誤
"args": ["mcp-server-fetch", "--ignore-robots"]

// ✅ 正確
"args": ["mcp-server-fetch", "--ignore-robots-txt"]
```

### 錯誤 2: 缺少雙破折號

```json
// ❌ 錯誤
"args": ["mcp-server-fetch", "ignore-robots-txt"]

// ✅ 正確
"args": ["mcp-server-fetch", "--ignore-robots-txt"]
```

### 錯誤 3: 參數帶有值

```json
// ❌ 錯誤
"args": ["mcp-server-fetch", "--ignore-robots-txt=true"]

// ✅ 正確
"args": ["mcp-server-fetch", "--ignore-robots-txt"]
```

### 錯誤 4: 參數位置錯誤

```json
// ❌ 錯誤 - 參數不在 args 陣列中
{
  "command": "uvx",
  "args": ["mcp-server-fetch"],
  "ignore-robots-txt": true  // 這樣不會生效
}

// ✅ 正確 - 參數在 args 陣列中
{
  "command": "uvx",
  "args": ["mcp-server-fetch", "--ignore-robots-txt"]
}
```

## 🎯 逐步設定指南

### 步驟 1: 開啟 MCP 設定

1. 打開 Obsidian Copilot 設定
2. 找到「MCP 整合」區段
3. 確保「啟用 MCP 整合」已開啟

### 步驟 2: 新增或編輯 Fetch 伺服器

1. 點擊「新增伺服器」或編輯現有的 fetch 伺服器
2. 填入基本資訊：
   - **伺服器名稱**: `fetch`
   - **描述**: `Web content fetching with robots.txt ignored`
   - **啟用伺服器**: ✅ 已啟用

### 步驟 3: 設定傳輸類型

- 選擇「Stdio (標準輸入輸出)」

### 步驟 4: 配置連接設定

根據您的安裝方式選擇：

**如果使用 uvx：**

- **指令**: `uvx`
- 點擊「新增參數」，輸入: `mcp-server-fetch`
- 再次點擊「新增參數」，輸入: `--ignore-robots-txt`

**如果使用 python：**

- **指令**: `python`
- 新增參數: `-m`
- 新增參數: `mcp_server_fetch`
- 新增參數: `--ignore-robots-txt`

### 步驟 5: 設定功能需求

- 在「功能需求」中新增: `tools`

### 步驟 6: 儲存並測試

1. 點擊「儲存」
2. 檢查伺服器狀態是否為「已連接」
3. 嘗試使用 fetch 工具存取被 robots.txt 限制的網站

## 🔍 驗證設定

### 檢查伺服器狀態

在 MCP 設定中，確認 fetch 伺服器顯示為「已連接」且有綠色狀態指示。

### 測試功能

嘗試在聊天中使用以下指令：

```
請使用 fetch 工具獲取 https://www.google.com/search?q=test 的內容
```

如果配置正確，應該能夠成功獲取內容，即使該 URL 通常被 robots.txt 限制。

## 🛠️ 進階配置

### 添加其他參數

您也可以同時使用其他參數：

```json
{
  "command": "uvx",
  "args": [
    "mcp-server-fetch",
    "--ignore-robots-txt",
    "--user-agent=ObsidianCopilot/1.0",
    "--proxy-url=http://proxy.example.com:8080"
  ]
}
```

### 可用的其他參數：

- `--user-agent=YourUserAgent`: 自訂 User-Agent
- `--proxy-url=http://proxy:port`: 使用代理伺服器

## 🐛 故障排除

### 問題: 伺服器無法連接

**解決方案:**

1. 確認 uvx 或 python 已安裝且可用
2. 檢查 mcp-server-fetch 是否正確安裝
3. 查看 MCP 除錯日誌

### 問題: robots.txt 仍然被遵守

**解決方案:**

1. 確認 `--ignore-robots-txt` 參數拼寫正確
2. 檢查參數是否在 `args` 陣列中
3. 重新啟動 MCP 伺服器
4. 開啟除錯模式查看日誌

### 問題: 工具調用失敗

**解決方案:**

1. 檢查網路連線
2. 確認目標 URL 是否有效
3. 查看錯誤訊息以了解具體原因

## 📝 檢查清單

配置完成後，請確認以下項目：

- [ ] MCP 整合已啟用
- [ ] Fetch 伺服器已新增並啟用
- [ ] 傳輸類型設為 "stdio"
- [ ] 指令正確 (uvx/python/docker)
- [ ] 參數陣列包含正確的項目
- [ ] `--ignore-robots-txt` 參數拼寫正確
- [ ] 伺服器狀態顯示為「已連接」
- [ ] 功能需求包含 "tools"
- [ ] 測試成功獲取被限制的內容

## 🔗 相關資源

- [mcp-server-fetch 官方文檔](https://pypi.org/project/mcp-server-fetch/)
- [Model Context Protocol 規範](https://github.com/modelcontextprotocol/specification)
- [Obsidian Copilot MCP 整合指南](./MCP_TOOLS_USAGE_GUIDE.md)

---

**重要提醒:** 使用 `--ignore-robots-txt` 參數時，請遵守網站的使用條款和相關法律法規。此功能應謹慎使用，僅用於合法和道德的目的。
