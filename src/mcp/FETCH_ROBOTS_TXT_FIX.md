# MCP Server Fetch: 配置 --ignore-robots-txt 參數

## 問題描述

根據 https://pypi.org/project/mcp-server-fetch/ 的官方文檔，mcp-server-fetch 應該支援 `--ignore-robots-txt` 參數來忽略 robots.txt 檔案，但目前測試時該參數似乎無效。

## 解決方案

### 1. 確認正確的配置方式

根據官方文檔，`--ignore-robots-txt` 參數需要添加到 MCP 伺服器配置的 `args` 陣列中。

### 2. 正確的配置示例

#### 使用 uvx 配置

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
  },
  "capabilities": ["tools"],
  "timeout": 10000,
  "retryAttempts": 3,
  "retryDelay": 1000
}
```

#### 使用 pip 安裝後配置

```json
{
  "name": "fetch",
  "description": "Web content fetching with robots.txt ignored",
  "enabled": true,
  "transport": "stdio",
  "connection": {
    "command": "python",
    "args": ["-m", "mcp_server_fetch", "--ignore-robots-txt"],
    "env": {},
    "cwd": ""
  },
  "capabilities": ["tools"],
  "timeout": 10000,
  "retryAttempts": 3,
  "retryDelay": 1000
}
```

#### 使用 Docker 配置

```json
{
  "name": "fetch",
  "description": "Web content fetching with robots.txt ignored",
  "enabled": true,
  "transport": "stdio",
  "connection": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "mcp/fetch", "--ignore-robots-txt"],
    "env": {},
    "cwd": ""
  },
  "capabilities": ["tools"],
  "timeout": 10000,
  "retryAttempts": 3,
  "retryDelay": 1000
}
```

### 3. 在 Obsidian Copilot 中的配置步驟

1. **開啟 MCP 設定**

   - 進入 Obsidian Copilot 設定
   - 找到「MCP 整合」區段
   - 確保「啟用 MCP 整合」已開啟

2. **新增或編輯 Fetch 伺服器**

   - 點擊「新增伺服器」或編輯現有的 fetch 伺服器
   - 填入以下資訊：
     - **伺服器名稱**: `fetch`
     - **描述**: `Web content fetching with robots.txt ignored`
     - **啟用伺服器**: ✅ 已啟用
     - **傳輸類型**: `Stdio (標準輸入輸出)`

3. **配置連接設定**

   - **指令**: `uvx` (或 `python` 如果使用 pip 安裝)
   - **參數**:
     - 第一個參數: `mcp-server-fetch` (或 `-m` 如果使用 python)
     - 第二個參數: `--ignore-robots-txt` (如果使用 python，第二個參數是 `mcp_server_fetch`，第三個參數才是 `--ignore-robots-txt`)
   - **工作目錄**: 留空
   - **環境變數**: 留空

4. **功能需求**

   - 新增: `tools`

5. **進階設定**
   - 保持預設值即可

### 4. 其他可用參數

除了 `--ignore-robots-txt`，mcp-server-fetch 還支援以下參數：

- `--user-agent=YourUserAgent`: 自訂 User-Agent
- `--proxy-url=http://proxy:port`: 使用代理伺服器

#### 完整參數配置示例

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

### 5. 驗證配置

配置完成後，可以通過以下方式驗證：

1. **檢查伺服器狀態**

   - 在 MCP 設定中查看伺服器狀態是否為「已連接」

2. **測試 fetch 工具**

   - 在聊天中使用 fetch 工具存取被 robots.txt 限制的網站
   - 檢查是否能成功獲取內容

3. **查看除錯日誌**
   - 開啟 MCP 的「除錯模式」
   - 查看日誌中是否有相關錯誤訊息

### 6. 常見問題排解

#### 問題：參數無效

- **解決方案**: 確保參數位於 `args` 陣列中，而非其他配置欄位

#### 問題：伺服器連接失敗

- **解決方案**:
  - 確認 uvx 或 python 指令可用
  - 檢查網路連線
  - 查看錯誤日誌

#### 問題：robots.txt 仍然被遵守

- **解決方案**:
  - 確認參數拼寫正確: `--ignore-robots-txt`
  - 檢查是否使用了正確的 mcp-server-fetch 版本
  - 嘗試重新啟動 MCP 伺服器

### 7. 備註

- robots.txt 的預設行為：伺服器預設會在模型發起的請求（透過工具）時遵守 robots.txt，但在使用者發起的請求（透過提示）時不會遵守
- `--ignore-robots-txt` 參數會完全停用 robots.txt 的檢查
- 使用此參數時請遵守網站的使用條款和道德準則

## 總結

要讓 mcp-server-fetch 忽略 robots.txt，關鍵是在 MCP 伺服器配置的 `args` 陣列中正確添加 `--ignore-robots-txt` 參數。最常見的錯誤是將參數放在錯誤的位置或拼寫錯誤。
