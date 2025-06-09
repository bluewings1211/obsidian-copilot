# MCP UI 統一化改進

## 問題描述

在原始實現中，存在兩個分離的 MCP 狀態顯示組件：

1. **`McpServerStatus`** - 顯示在聊天界面頂部，顯示 MCP 服務器連接狀態
2. **`McpToolDisplay`** - 顯示在每個消息中，顯示具體的工具調用結果

這造成了用戶困惑，因為：

- 界面上會出現兩個相似但功能不同的 MCP 狀態欄
- 用戶需要在不同位置查看 MCP 相關信息
- 視覺上缺乏統一性

## 解決方案

創建了一個統一的 `UnifiedMcpStatus` 組件，能夠根據上下文智能顯示不同類型的 MCP 信息。

### 新組件特性

#### 1. 動態顯示模式

```typescript
interface UnifiedMcpStatusProps {
  className?: string;
  toolCalls?: McpToolCall[]; // 如果提供，顯示工具調用模式
  showServerStatus?: boolean; // 是否顯示服務器狀態（默認 true）
}
```

#### 2. 智能內容切換

- **服務器狀態模式**：當沒有 `toolCalls` 時，顯示 MCP 服務器連接狀態
- **工具調用模式**：當提供 `toolCalls` 時，顯示具體的工具執行結果
- **混合模式**：可以同時顯示服務器狀態和工具調用（如果需要）

#### 3. 統一的視覺設計

- 一致的圖標和色彩系統
- 統一的摺疊/展開行為
- 相同的狀態徽章設計

## 實現細節

### 1. Chat 組件集成

```typescript
// 在聊天界面頂部顯示服務器狀態
<UnifiedMcpStatus className="mx-4 mt-2" showServerStatus={true} />
```

### 2. ChatSingleMessage 組件集成

```typescript
// 在消息中顯示工具調用（如果有）
{!isEditing && message.mcpToolCalls && message.mcpToolCalls.length > 0 && (
  <UnifiedMcpStatus
    toolCalls={message.mcpToolCalls}
    showServerStatus={false}
    className="my-2"
  />
)}
```

### 3. 狀態指示器統一

```typescript
// 服務器狀態徽章
{connectedCount > 0 && (
  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
    <Wifi className="w-3 h-3 mr-1" />
    {connectedCount}
  </Badge>
)}

// 工具調用狀態徽章
{successCount > 0 && (
  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
    成功: {successCount}
  </Badge>
)}
```

## 用戶體驗改進

### 1. 統一的界面語言

- 所有 MCP 相關元素使用一致的圖標和文字
- 統一的狀態顏色編碼（綠色=成功/連接，藍色=進行中，紅色=錯誤）

### 2. 上下文感知

- 在聊天頂部：顯示整體 MCP 系統狀態
- 在消息中：只顯示該消息相關的工具調用
- 避免重複和冗餘信息

### 3. 改進的交互性

- 統一的摺疊/展開邏輯
- 一致的工具提示和幫助信息
- 統一的複製到剪貼板功能

## 向後兼容性

### 1. 漸進式遷移

- 原有的 `McpServerStatus` 和 `McpToolDisplay` 組件仍然存在
- 可以根據需要逐步遷移到新組件
- 不會破壞現有的功能

### 2. API 兼容性

```typescript
// 舊的使用方式仍然有效
import McpServerStatus from "@/components/chat-components/McpServerStatus";
import { McpToolDisplay } from "@/components/chat-components/McpToolDisplay";

// 新的統一方式
import { UnifiedMcpStatus } from "@/components/chat-components/UnifiedMcpStatus";
```

## 代碼結構改進

### 1. 減少代碼重複

- 共享的工具調用渲染邏輯
- 統一的狀態計算函數
- 公共的樣式和圖標定義

### 2. 更好的維護性

- 單一組件負責所有 MCP UI 邏輯
- 集中式的狀態管理
- 統一的錯誤處理

### 3. 可擴展性

```typescript
// 未來可以輕易添加新的顯示模式
interface UnifiedMcpStatusProps {
  // ... 現有屬性
  mode?: "server" | "tools" | "combined" | "minimal";
  customActions?: Array<{
    label: string;
    icon: React.ComponentType;
    action: () => void;
  }>;
}
```

## 使用指南

### 1. 基本用法

#### 服務器狀態顯示

```typescript
<UnifiedMcpStatus
  showServerStatus={true}
  className="my-4"
/>
```

#### 工具調用顯示

```typescript
<UnifiedMcpStatus
  toolCalls={message.mcpToolCalls}
  showServerStatus={false}
/>
```

#### 混合顯示

```typescript
<UnifiedMcpStatus
  toolCalls={message.mcpToolCalls}
  showServerStatus={true}
/>
```

### 2. 自定義樣式

```typescript
<UnifiedMcpStatus
  className="border-2 border-blue-500 rounded-lg p-4"
  // ... 其他屬性
/>
```

### 3. 條件顯示

```typescript
{hasToolCalls && (
  <UnifiedMcpStatus
    toolCalls={toolCalls}
    showServerStatus={shouldShowServers}
  />
)}
```

## 測試建議

### 1. 功能測試

- [ ] 服務器連接狀態正確顯示
- [ ] 工具調用結果正確渲染
- [ ] 摺疊/展開功能正常
- [ ] 複製功能工作正常

### 2. 視覺測試

- [ ] 在不同主題下的顯示效果
- [ ] 響應式布局在不同屏幕尺寸下的表現
- [ ] 動畫和過渡效果的流暢性

### 3. 集成測試

- [ ] 與現有聊天界面的集成
- [ ] 與 MCP 服務器的通信
- [ ] 錯誤狀態的處理

## 未來改進方向

### 1. 短期目標

- 添加更多的工具調用統計信息
- 支持工具調用的重試功能
- 改進錯誤消息的顯示

### 2. 長期目標

- 支持工具調用的可視化圖表
- 添加 MCP 服務器性能監控
- 實現工具調用的歷史記錄

### 3. 可能的擴展

- 支持自定義主題和顏色
- 添加鍵盤快捷鍵支持
- 實現工具調用的分組和過濾

## 結論

通過統一 MCP UI 組件，我們實現了：

1. **更好的用戶體驗**：消除了界面上的混亂和重複
2. **更清晰的信息架構**：每種信息在合適的上下文中顯示
3. **更好的代碼質量**：減少重複，提高維護性
4. **更強的可擴展性**：為未來的功能增強奠定基礎

這個改進顯著提升了 Obsidian Copilot 中 MCP 功能的可用性和專業性。
