# Product Context

This document provides an overview of the product's purpose, target audience, and core features.

## 產品背景

[2025-05-29 07:13:06] - # Obsidian Copilot Plugin 專案分析

## 專案概覽

Obsidian Copilot 是一個 AI 助手插件，為 Obsidian 提供聊天介面、工具整合和智能搜尋功能。

## 當前架構

- **主要語言**: TypeScript/JavaScript
- **框架**: 基於 Obsidian Plugin API
- **AI 整合**: 支援多種 LLM 提供者 (OpenAI, Anthropic, Ollama 等)
- **前端**: React + Tailwind CSS
- **工具系統**: 現有 @vault, @web, @youtube, @pomodoro 工具
- **搜尋系統**: 向量搜尋 + 混合檢索

## 當前工具架構

- [`ToolManager`](src/tools/toolManager.ts:1) - 工具管理和調用
- [`ChainManager`](src/LLMProviders/chainManager.ts:1) - LLM 鏈管理
- [`FileParserManager`](src/tools/FileParserManager.ts:1) - 檔案解析
- 專用工具檔案: SearchTools, YoutubeTools 等

## MCP 整合需求

需要讓 Obsidian 插件能夠:

1. 連接到 MCP servers
2. 動態發現和使用 MCP 工具
3. 管理 MCP 資源和提示
4. 提供 MCP 設定介面

## AG-UI 整合分析

[2025-06-09 00:13:00] - # AG-UI 整合分析

## AG-UI 工具概覽

AG-UI (Agent-User Interaction Protocol) 是一個專門用於將 AI Agents 整合到前端應用的標準化協議，提供：

- **標準化 Agent 協議**: 統一的事件流通訊 (RUN_STARTED, TEXT_MESSAGE_CONTENT, TOOL_CALL_START 等)
- **Real-time 狀態同步**: 使用 useCoAgent hook 實現前後端雙向狀態同步
- **Human-in-the-loop 工具系統**: 前端定義工具，Agent 可調用實現互動確認
- **事件驅動架構**: 基於 RxJS Observable 的流式互動
- **多種 Agent 支援**: HttpAgent, AbstractAgent，支援 OpenAI, LangGraph 等

## 與現有 MCP 系統的差異

- **MCP**: 專注於工具和資源的標準化，提供統一的工具調用接口
- **AG-UI**: 專注於前端整合和使用者互動，提供豐富的 Agent-Frontend 通訊
- **互補性**: MCP 處理工具層，AG-UI 處理互動層，可以協同工作

## 建議的整合架構

```
Obsidian Frontend (React + AG-UI)
    ↓ (AG-UI Protocol)
ObsidianAgentWrapper (AG-UI AbstractAgent)
    ↓ (ChainManager API)
ChainManager (現有 LLM 管理)
    ↓ (MCP Protocol)
MCP Tools & Resources
```
