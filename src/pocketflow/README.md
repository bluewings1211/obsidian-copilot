# PocketFlow.js 集成

本模組提供了基於 PocketFlow.js 的聊天處理框架，專為 Obsidian Copilot 設計。

## 架構概述

### 核心組件

1. **ChatSharedState** - 聊天流程中的共享狀態介面
2. **ChatBaseNode** - 聊天處理的基礎 Node 類別
3. **ChatBatchNode** - 批次處理的 Node 類別
4. **ChatFlow** - 聊天流程的 Flow 類別
5. **IntentAnalysisNode** - 意圖分析 Node（新增）

### 文件結構

```
src/pocketflow/
├── index.ts                           # 主要導出文件
├── types.ts                           # 類型定義
├── nodes.ts                           # 基礎 Node 類別
├── config.ts                          # 配置文件
├── README.md                          # 說明文件
├── INTENT_ANALYSIS_INTEGRATION.md    # 意圖分析整合指南
├── nodes/                             # 自定義 Node 實現
│   ├── index.ts                       # Node 導出
│   ├── IntentAnalysisNode.ts          # 意圖分析 Node
│   └── IntentAnalysisNode.test.ts     # 意圖分析測試
└── examples/                          # 使用示例
    └── intent-analysis-example.ts     # 意圖分析示例
```

## 使用方式

### 1. 基本導入

```typescript
import {
  ChatBaseNode,
  ChatFlow,
  ChatSharedState,
  getChatFlowConfig,
  POCKETFLOW_CONSTANTS,
  IntentAnalysisNode, // 新增的意圖分析 Node
  IntentAnalysisResult,
} from "@/pocketflow";
```

### 2. 創建自定義 Node

```typescript
class MyCustomNode extends ChatBaseNode {
  constructor() {
    super("我的自定義步驟", 3, 1000); // 步驟名稱、最大重試次數、等待時間
  }

  protected async prepareData(shared: ChatSharedState): Promise<any> {
    // 準備數據的邏輯
    return shared.userMessage?.message || "";
  }

  protected async exec(data: string): Promise<string> {
    // 執行核心邏輯
    return `處理結果: ${data}`;
  }

  protected async processResult(
    shared: ChatSharedState,
    prepRes: any,
    execRes: any
  ): Promise<void> {
    // 處理結果
    shared.aiResponse = execRes;
  }

  protected getNextAction(shared: ChatSharedState, prepRes: any, execRes: any): string | undefined {
    // 決定下一個動作
    return POCKETFLOW_CONSTANTS.ACTIONS.COMPLETE;
  }
}
```

### 3. 創建聊天流程

```typescript
// 創建 Node
const step1 = new MyCustomNode();
const step2 = new AnotherNode();

// 連接 Node
step1.next(step2);

// 創建 Flow
const chatFlow = new ChatFlow(step1, "我的聊天流程");

// 執行流程
const result = await chatFlow.runChat(userMessage, updateCurrentAiMessage, addMessage, {
  debug: true,
  abortController: new AbortController(),
});
```

## 設計原則

### 1. 分離關注點

- **數據準備** (`prepareData`): 從共享狀態讀取和預處理數據
- **核心執行** (`exec`): 執行主要的業務邏輯
- **結果處理** (`processResult`): 將結果寫回共享狀態

### 2. 錯誤處理

- 每個 Node 都有內建的錯誤處理機制
- 支援重試機制
- 優雅的錯誤恢復

### 3. 狀態管理

- 使用 `ChatSharedState` 進行跨 Node 的數據共享
- 避免 Node 之間的直接依賴
- 支援中止控制

### 4. 可觀測性

- 內建調試支援
- 步驟追蹤
- 效能監控

## 與現有系統的集成

這個架構設計為逐步替換現有的 `ChainManager` 系統：

1. **階段 1**: 建立基礎架構（當前階段）
2. **階段 2**: 創建具體的 Node 實現
3. **階段 3**: 創建完整的聊天流程
4. **階段 4**: 逐步替換現有的 ChainRunner
5. **階段 5**: 清理舊代碼

## 配置

使用 `getChatFlowConfig()` 獲取當前配置，支援以下選項：

- `enableDebug`: 啟用調試模式
- `enableLocalSearch`: 啟用本地搜索
- `enableWebSearch`: 啟用網頁搜索
- `enableMcpTools`: 啟用 MCP 工具
- `maxRetries`: 最大重試次數
- `timeout`: 超時時間

## 已實現的 Node

### IntentAnalysisNode

專門用於分析用戶意圖的 Node，支援：

- Broca 服務整合
- @ 命令處理 (`@vault`, `@web`, `@pomodoro`, `@youtube`)
- MCP 工具檢測
- 智能路由決策

詳細使用方式請參考 [INTENT_ANALYSIS_INTEGRATION.md](./INTENT_ANALYSIS_INTEGRATION.md)

#### 基本用法

```typescript
import { IntentAnalysisNode } from "@/pocketflow";

// 創建意圖分析節點
const intentNode = new IntentAnalysisNode(vault);

// 配置路由
intentNode.on("local_search", localSearchNode);
intentNode.on("web_search", webSearchNode);
intentNode.on("mcp_tools", mcpToolsNode);
intentNode.on("direct_llm", directLlmNode);

// 創建流程
const chatFlow = new ChatFlow(intentNode, "智能聊天流程");
```

## 下一步

1. ✅ ~~實現意圖分析 Node~~ (已完成)
2. 實現工具執行 Node
3. 實現本地搜索 Node
4. 實現 LLM 響應 Node
5. 整合現有的 ChainRunner 功能
