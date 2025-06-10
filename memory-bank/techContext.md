# Tech Context

This document provides an overview of the technologies and tools used in the Cline project.

[2025-06-10 01:54:09] - ## PocketFlow.js 整合技術規格

### 目標架構

```
現有複雜系統：
ChainManager -> ChainRunner -> 複雜條件判斷 -> 各種工具調用 -> LLM生成

優化後 PocketFlow 架構：
IntentAnalysisNode -> [ToolExecutionBatchNode | DirectLLMNode | McpAgentNode] -> ContextPrepNode -> LLMGenerationNode
```

### 核心組件重構對照

| 現有組件        | PocketFlow 對應        | 優化效果               |
| --------------- | ---------------------- | ---------------------- |
| ChainManager    | Flow + Node 組合       | 職責分離，可視化流程   |
| ChainRunner     | 特定功能 Node          | 單一職責，易於測試     |
| IntentAnalyzer  | IntentAnalysisNode     | 清晰的意圖->行動映射   |
| ToolManager     | ToolExecutionBatchNode | 批量處理，平行執行     |
| McpManager      | McpAgentNode           | 智能代理，統一接口     |
| HybridRetriever | SearchMapReduceFlow    | MapReduce 模式，可擴展 |

### 技術依賴

- PocketFlow.js: 核心流程管理框架
- 保持現有：LangChain, Obsidian API, MCP 協議
- 新增：Mermaid 圖表可視化

### 實施優先級

1. **P0**: 核心聊天流程 Node 化
2. **P1**: 工具執行批量化
3. **P2**: 搜索系統 MapReduce
4. **P3**: MCP 系統代理化
5. **P4**: 可觀測性和調試
