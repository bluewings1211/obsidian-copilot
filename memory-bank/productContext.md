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
