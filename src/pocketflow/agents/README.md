# PocketFlow 智能工具選擇代理

## 概述

ToolSelectionAgent 是 PocketFlow.js 階段 2 的核心組件，提供基於上下文的智能工具選擇能力，超越了現有的簡單規則匹配機制。

## 架構設計

### 核心組件

```
ToolSelectionAgent
├── analyzers/           # 分析組件
│   ├── SemanticAnalyzer        # 語義分析器
│   ├── ContextEvaluator        # 上下文評估器
│   ├── PerformanceTracker      # 性能追蹤器
│   └── CandidateRanker         # 候選工具排序器
└── learners/            # 學習組件
    ├── UsagePatternLearner     # 使用模式學習器
    ├── FeedbackCollector       # 反饋收集器
    └── PreferenceAdapter       # 偏好適配器
```

### 工作流程

1. **語義分析** - 分析查詢與工具的語義相似度
2. **上下文評估** - 考慮聊天歷史和用戶行為
3. **性能分析** - 根據工具歷史性能評分
4. **偏好學習** - 適應用戶偏好和使用模式
5. **候選排序** - 智能排序並選擇最佳工具
6. **反饋學習** - 收集使用反饋並持續優化

## 主要特性

### 🧠 智能選擇算法

- **多維度評分**：語義匹配、上下文相關性、性能評估、用戶偏好
- **動態權重調整**：根據情況自動調整各維度權重
- **信心度評估**：為每個工具選擇提供信心分數

### 📊 性能追蹤

- **成功率統計**：追蹤工具執行成功率
- **響應時間分析**：監控工具響應性能
- **可靠性評估**：基於歷史數據評估工具可靠性
- **趨勢分析**：識別性能變化趨勢

### 🎯 自適應學習

- **使用模式識別**：學習用戶的工具使用模式
- **偏好適配**：根據用戶反饋調整工具偏好
- **上下文關聯**：學習特定上下文下的最佳工具選擇
- **時間模式**：識別時間相關的使用偏好

### 🔄 反饋機制

- **實時反饋收集**：收集工具使用成功率和用戶滿意度
- **錯誤類型分析**：分類和分析常見錯誤
- **改進建議**：基於反饋數據提供改進建議

## 使用方法

### 基本使用

```typescript
import { ToolSelectionAgent } from "./ToolSelectionAgent";

// 創建代理實例
const agent = new ToolSelectionAgent({
  maxCandidates: 5,
  minConfidenceThreshold: 0.3,
  enableLearning: true,
  enablePerformanceTracking: true,
});

// 選擇工具
const result = await agent.selectTools(query, availableTools, sharedState);

// 獲取推薦
console.log("推薦工具:", result.primaryTool?.name);
console.log("信心度:", result.confidence);
console.log("選擇原因:", result.selectionReason);
```

### 集成到 IntentAnalysisNode

```typescript
import { EnhancedIntentAnalysisNode } from "./integration-example";

// 創建增強版意圖分析節點
const enhancedNode = new EnhancedIntentAnalysisNode(vault, 1, 0, {
  semanticWeight: 0.4,
  contextWeight: 0.3,
  performanceWeight: 0.2,
  preferenceWeight: 0.1,
});

// 執行增強的意圖分析
const result = await enhancedNode.exec("搜索關於 AI 的筆記");
```

### 工廠模式創建

```typescript
import { ToolSelectionAgentFactory } from "./integration-example";

// 生產環境配置
const productionAgent = ToolSelectionAgentFactory.createProduction();

// 開發環境配置
const devAgent = ToolSelectionAgentFactory.createDevelopment();

// 自定義配置
const customAgent = ToolSelectionAgentFactory.createCustom({
  maxCandidates: 3,
  semanticWeight: 0.5,
});
```

## 配置選項

### ToolSelectionConfig

```typescript
interface ToolSelectionConfig {
  maxCandidates: number; // 最大候選工具數量
  minConfidenceThreshold: number; // 最低信心度閾值
  enableLearning: boolean; // 啟用學習功能
  enablePerformanceTracking: boolean; // 啟用性能追蹤
  semanticWeight: number; // 語義權重
  contextWeight: number; // 上下文權重
  performanceWeight: number; // 性能權重
  preferenceWeight: number; // 偏好權重
}
```

### 推薦配置

#### 生產環境

```typescript
{
  maxCandidates: 3,
  minConfidenceThreshold: 0.4,
  enableLearning: true,
  enablePerformanceTracking: true,
  semanticWeight: 0.4,
  contextWeight: 0.3,
  performanceWeight: 0.2,
  preferenceWeight: 0.1,
}
```

#### 開發環境

```typescript
{
  maxCandidates: 10,
  minConfidenceThreshold: 0.1,
  enableLearning: false,
  enablePerformanceTracking: false,
  semanticWeight: 0.25,
  contextWeight: 0.25,
  performanceWeight: 0.25,
  preferenceWeight: 0.25,
}
```

## API 參考

### ToolSelectionAgent

#### 主要方法

- `selectTools(query, tools, shared)` - 選擇最佳工具
- `recordFeedback(toolName, success, duration, satisfaction)` - 記錄反饋
- `getToolStatistics()` - 獲取統計信息
- `updateConfig(config)` - 更新配置
- `resetLearningData()` - 重置學習數據

#### 返回結果

```typescript
interface ToolSelectionResult {
  primaryTool?: ToolCandidate; // 主要推薦工具
  alternatives: ToolCandidate[]; // 替代選項
  selectionReason: string; // 選擇原因
  confidence: number; // 信心度
  suggestedAction: string; // 建議動作
  metadata: {
    analysisTime: number; // 分析時間
    considereredTools: number; // 考慮的工具數量
    selectionStrategy: string; // 選擇策略
  };
}
```

### 分析組件

#### SemanticAnalyzer

- 語義相似度分析
- 關鍵詞映射匹配
- 工具描述匹配

#### ContextEvaluator

- 聊天歷史分析
- 用戶行為模式評估
- 時間上下文考量

#### PerformanceTracker

- 成功率追蹤
- 響應時間統計
- 可靠性評估

#### CandidateRanker

- 多策略排序
- 多樣性保證
- 動態策略選擇

### 學習組件

#### UsagePatternLearner

- 使用模式識別
- 序列分析
- 時間模式學習

#### FeedbackCollector

- 反饋數據收集
- 統計分析
- 趨勢識別

#### PreferenceAdapter

- 用戶偏好學習
- 規則生成
- 動態適配

## 性能指標

### 目標性能

- **選擇決策時間**: < 100ms
- **準確率**: > 85%
- **用戶滿意度**: > 4.0/5.0
- **系統可用性**: > 99.5%

### 監控指標

- 平均選擇時間
- 工具選擇準確率
- 用戶滿意度評分
- 系統錯誤率
- 學習收斂速度

## 測試

### 運行測試

```bash
# 運行所有測試
npm test src/pocketflow/agents/

# 運行特定測試
npm test src/pocketflow/agents/ToolSelectionAgent.test.ts

# 運行集成測試
npm test src/pocketflow/agents/integration-example.ts
```

### 測試覆蓋範圍

- ✅ 單元測試
- ✅ 集成測試
- ✅ 性能測試
- ✅ 錯誤處理測試
- ✅ 邊界條件測試

## 部署指南

### 生產部署

1. **配置優化**

   ```typescript
   const agent = ToolSelectionAgentFactory.createProduction();
   ```

2. **性能監控**

   ```typescript
   // 定期檢查統計信息
   const stats = await agent.getToolStatistics();
   console.log("性能統計:", stats);
   ```

3. **數據備份**
   ```typescript
   // 導出學習數據
   const data = await agent.exportData();
   // 保存到持久化存儲
   ```

### 監控和維護

- 監控選擇性能和準確率
- 定期分析用戶反饋
- 更新和優化算法
- 清理過期數據

## 故障排除

### 常見問題

1. **選擇速度慢**

   - 減少 `maxCandidates`
   - 提高 `minConfidenceThreshold`
   - 禁用不必要的學習功能

2. **選擇不准確**

   - 調整權重配置
   - 收集更多用戶反饋
   - 檢查工具描述質量

3. **內存使用過高**
   - 限制歷史記錄大小
   - 定期清理過期數據
   - 優化緩存策略

### 調試工具

```typescript
// 啟用調試模式
const shared = { debug: true };
const result = await agent.selectTools(query, tools, shared);

// 查看詳細統計
const stats = await agent.getToolStatistics();
console.log(JSON.stringify(stats, null, 2));
```

## 未來改進

### 短期目標

- [ ] 添加更多語義分析算法
- [ ] 優化性能追蹤機制
- [ ] 增強錯誤處理

### 長期目標

- [ ] 支援多語言工具描述
- [ ] 整合機器學習模型
- [ ] 分布式學習架構
- [ ] 實時協作學習

## 貢獻指南

1. Fork 項目
2. 創建功能分支
3. 實現功能並添加測試
4. 提交 Pull Request
5. 通過代碼審查

## 許可證

MIT License - 詳見 LICENSE 文件

## 聯繫方式

如有問題或建議，請創建 Issue 或聯繫開發團隊。
