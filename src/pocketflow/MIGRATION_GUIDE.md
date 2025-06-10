# PocketFlow 遷移指南

本指南將協助您從現有的 ChainRunner 系統遷移到 PocketFlow 架構。

## 目錄

1. [遷移概述](#遷移概述)
2. [前置條件](#前置條件)
3. [遷移階段](#遷移階段)
4. [實用遷移步驟](#實用遷移步驟)
5. [兼容性考慮](#兼容性考慮)
6. [測試策略](#測試策略)
7. [故障排除](#故障排除)
8. [最佳實踐](#最佳實踐)

## 遷移概述

PocketFlow 是新一代的聊天流程處理架構，提供：

- **模塊化設計**: 每個功能模塊作為獨立節點
- **動態路由**: 基於意圖分析的智能路由
- **並行處理**: 工具調用和任務的並行執行
- **可視化監控**: 完整的流程監控和調試工具
- **向後兼容**: 保持與現有 ChainRunner 介面的兼容性

### 主要優勢

- 🚀 **性能提升**: 並行處理和優化的執行路徑
- 🔧 **可維護性**: 模塊化設計便於維護和擴展
- 📊 **可觀測性**: 詳細的性能監控和調試工具
- 🔄 **靈活性**: 動態路由和可配置的流程
- 🛡️ **穩定性**: 強化的錯誤處理和恢復機制

## 前置條件

### 系統要求

- Node.js 16+
- TypeScript 4.5+
- 現有的 ChainManager 實例
- Obsidian Vault 實例

### 依賴檢查

使用 `PocketFlowMigrationHelper` 檢查系統是否準備好遷移：

```typescript
import { PocketFlowMigrationHelper } from "@/pocketflow/integration/PocketFlowChainRunner";

const migrationCheck = PocketFlowMigrationHelper.canMigrate(chainManager);

if (migrationCheck.canMigrate) {
  console.log("✅ 系統準備就緒，可以開始遷移");
} else {
  console.log("❌ 需要解決以下問題：");
  migrationCheck.issues.forEach((issue) => console.log(`  - ${issue}`));
}
```

## 遷移階段

### 階段 1: 基礎設施準備 (1-2 天)

**目標**: 設置 PocketFlow 基礎設施

**步驟**:

1. 安裝 PocketFlow 模塊
2. 驗證節點功能
3. 設置測試環境

```typescript
// 1. 創建測試 ChatFlow
import { createDefaultChatFlow } from "@/pocketflow/flows/ChatFlow";

const testFlow = createDefaultChatFlow(vault, {
  enableDebug: true,
  maxRetries: 1,
});

// 2. 驗證流程
const validation = testFlow.validateFlow();
console.log("流程驗證:", validation);
```

### 階段 2: 並行運行 (1 週)

**目標**: 在現有系統旁邊運行 PocketFlow

**步驟**:

1. 配置 PocketFlowChainRunner
2. 進行 A/B 測試
3. 收集性能數據

```typescript
// 創建 PocketFlow ChainRunner
import { PocketFlowChainRunnerFactory } from "@/pocketflow/integration/PocketFlowChainRunner";

const pocketFlowRunner = PocketFlowChainRunnerFactory.createFull(chainManager, vault);

// 與現有 ChainRunner 並行測試
const testMessage = {
  message: "Test message",
  sender: "User",
  isVisible: true,
  timestamp: new Date().toISOString(),
};

// 現有系統
const oldResult = await existingChainRunner.run(
  testMessage,
  abortController,
  updateMessage,
  addMessage,
  options
);

// PocketFlow 系統
const newResult = await pocketFlowRunner.run(
  testMessage,
  abortController,
  updateMessage,
  addMessage,
  options
);

// 比較結果
console.log("結果比較:", { oldResult, newResult });
```

### 階段 3: 逐步替換 (2-3 週)

**目標**: 逐步替換現有功能

**步驟**:

1. 替換基本聊天功能
2. 遷移工具調用功能
3. 遷移多模態功能

```typescript
// 漸進式替換策略
class HybridChainRunner implements ChainRunner {
  constructor(
    private oldRunner: ChainRunner,
    private newRunner: PocketFlowChainRunner,
    private migrationConfig: MigrationConfig
  ) {}

  async run(userMessage: ChatMessage, ...args: any[]): Promise<string> {
    const shouldUsePocketFlow = this.shouldUsePocketFlow(userMessage);

    if (shouldUsePocketFlow) {
      return await this.newRunner.run(userMessage, ...args);
    } else {
      return await this.oldRunner.run(userMessage, ...args);
    }
  }

  private shouldUsePocketFlow(message: ChatMessage): boolean {
    // 根據配置決定使用哪個系統
    return this.migrationConfig.enabledFeatures.includes("basic_chat");
  }
}
```

### 階段 4: 完全遷移 (1 週)

**目標**: 完全切換到 PocketFlow

**步驟**:

1. 移除舊的 ChainRunner
2. 優化性能
3. 完整測試

## 實用遷移步驟

### 1. 安裝和配置

```typescript
// 在你的主要模塊中
import { ChatFlow, createDefaultChatFlow, PocketFlowChainRunner } from "@/pocketflow";

// 創建 PocketFlow 實例
const chatFlow = createDefaultChatFlow(vault, {
  enableDebug: process.env.NODE_ENV === "development",
  enableLocalSearch: true,
  enableWebSearch: true,
  enableMcpTools: true,
  maxRetries: 3,
  timeout: 30000,
});

// 創建橋接器
const pocketFlowRunner = new PocketFlowChainRunner(chainManager, vault);
```

### 2. 配置替換

```typescript
// 舊的配置方式
const chainRunner = new CopilotPlusChainRunner(chainManager);

// 新的配置方式
const pocketFlowRunner = new PocketFlowChainRunner(chainManager, vault);

// 配置更新
pocketFlowRunner.updateConfig({
  enableDebug: true,
  enableLocalSearch: true,
  enableWebSearch: false, // 可以選擇性啟用功能
});
```

### 3. 錯誤處理遷移

```typescript
// 舊的錯誤處理
try {
  const result = await chainRunner.run(
    message,
    abortController,
    updateMessage,
    addMessage,
    options
  );
} catch (error) {
  console.error("Chain execution failed:", error);
}

// 新的錯誤處理 (自動處理)
const result = await pocketFlowRunner.run(
  message,
  abortController,
  updateMessage,
  addMessage,
  options
);
// PocketFlow 內建了更好的錯誤處理和恢復機制
```

### 4. 監控和調試

```typescript
import { FlowVisualizer, PerformanceMonitor } from "@/pocketflow/visualization/FlowDiagrams";

// 執行前啟用監控
PerformanceMonitor.recordMetric("execution_start", Date.now());

// 執行流程
const result = await pocketFlowRunner.run(
  message,
  abortController,
  updateMessage,
  addMessage,
  options
);

// 執行後記錄性能
PerformanceMonitor.recordMetric("execution_end", Date.now());

// 生成報告
const report = FlowVisualizer.generateCompleteReport(chatFlow);
console.log("執行報告:", report);
```

## 兼容性考慮

### API 兼容性

PocketFlow 保持與現有 ChainRunner 介面的 100% 兼容性：

```typescript
// 兩者具有相同的介面
interface ChainRunner {
  run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    options: RunOptions
  ): Promise<string>;
}

// 可以直接替換
const runner: ChainRunner = new PocketFlowChainRunner(chainManager, vault);
```

### 數據格式兼容性

```typescript
// ChatMessage 格式保持不變
const message: ChatMessage = {
  message: "Hello",
  sender: "User",
  isVisible: true,
  timestamp: formatDateTime(new Date()),
};

// 回調函數格式保持不變
const updateMessage = (msg: string) => {
  /* 處理邏輯 */
};
const addMessage = (msg: ChatMessage) => {
  /* 處理邏輯 */
};
```

### 設定遷移

```typescript
// 現有設定可以直接使用
const settings = getSettings();

// PocketFlow 會自動讀取現有設定
const chatFlow = createDefaultChatFlow(vault, {
  enableLocalSearch: settings.enableLocalSearch,
  enableWebSearch: settings.enableWebSearch,
  enableMcpTools: settings.mcpIntegration.enabled,
});
```

## 測試策略

### 1. 單元測試

```typescript
import { describe, it, expect } from "@jest/globals";
import { createDefaultChatFlow } from "@/pocketflow/flows/ChatFlow";

describe("PocketFlow 遷移測試", () => {
  it("應該與現有系統產生相同結果", async () => {
    const testMessage = createTestMessage();

    const oldResult = await oldChainRunner.run(testMessage /* ... */);
    const newResult = await pocketFlowRunner.run(testMessage /* ... */);

    expect(normalizeResult(newResult)).toBe(normalizeResult(oldResult));
  });
});
```

### 2. 整合測試

```typescript
// 完整流程測試
describe("端到端測試", () => {
  it("應該處理複雜的聊天場景", async () => {
    const scenarios = [
      { message: "@vault search notes", expectedFeatures: ["localSearch"] },
      { message: "@web search news", expectedFeatures: ["webSearch"] },
      { message: "simple question", expectedFeatures: ["directLLM"] },
    ];

    for (const scenario of scenarios) {
      const result = await pocketFlowRunner.run(createMessage(scenario.message) /* ... */);
      expect(result).toBeDefined();
    }
  });
});
```

### 3. 性能測試

```typescript
import { PerformanceMonitor } from "@/pocketflow/visualization/FlowDiagrams";

describe("性能測試", () => {
  it("PocketFlow 應該不慢於現有系統", async () => {
    const testMessage = createTestMessage();

    // 測試舊系統
    const oldStart = Date.now();
    await oldChainRunner.run(testMessage /* ... */);
    const oldDuration = Date.now() - oldStart;

    // 測試新系統
    const newStart = Date.now();
    await pocketFlowRunner.run(testMessage /* ... */);
    const newDuration = Date.now() - newStart;

    expect(newDuration).toBeLessThanOrEqual(oldDuration * 1.2); // 允許 20% 的性能差異
  });
});
```

## 故障排除

### 常見問題

#### 1. 節點初始化失敗

**症狀**: `IntentAnalysisNode not initialized` 錯誤

**解決方案**:

```typescript
// 確保 Vault 實例正確傳遞
const vault = this.app.vault; // 從 Obsidian 應用獲取
const chatFlow = createDefaultChatFlow(vault, config);

// 驗證初始化
const validation = chatFlow.validateFlow();
if (!validation.isValid) {
  console.error("初始化失敗:", validation.issues);
}
```

#### 2. 性能問題

**症狀**: 執行時間過長

**解決方案**:

```typescript
// 檢查配置
const stats = chatFlow.getStats();
console.log("啟用功能:", stats.enabledFeatures);

// 減少不必要的功能
chatFlow.updateConfig({
  enableWebSearch: false, // 如果不需要網頁搜索
  maxRetries: 1, // 減少重試次數
});

// 監控性能
const report = FlowVisualizer.generateCompleteReport(chatFlow);
console.log("性能報告:", report.performanceChart);
```

#### 3. 兼容性問題

**症狀**: 與現有代碼不兼容

**解決方案**:

```typescript
// 使用漸進式遷移
class CompatibilityWrapper implements ChainRunner {
  constructor(private pocketFlowRunner: PocketFlowChainRunner) {}

  async run(userMessage: ChatMessage, ...args: any[]): Promise<string> {
    try {
      return await this.pocketFlowRunner.run(userMessage, ...args);
    } catch (error) {
      console.error("PocketFlow 執行失敗，回退到兼容模式:", error);
      // 可以在這裡添加回退邏輯
      throw error;
    }
  }
}
```

### 調試工具

```typescript
import { DebugVisualizer, FlowAnalyzer } from "@/pocketflow/visualization/FlowDiagrams";

// 啟用調試模式
const chatFlow = createDefaultChatFlow(vault, { enableDebug: true });

// 執行並記錄調試信息
const result = await chatFlow.execute(sharedState);

// 查看調試時間線
const timeline = DebugVisualizer.generateDebugTimeline();
console.log("執行時間線:", timeline);

// 分析瓶頸
const analysis = FlowAnalyzer.analyzeBottlenecks(chatFlow);
console.log("瓶頸分析:", analysis);
```

## 最佳實踐

### 1. 配置管理

```typescript
// 使用環境特定的配置
const createChatFlowForEnvironment = (vault: Vault, env: string) => {
  const baseConfig = {
    enableLocalSearch: true,
    enableWebSearch: true,
    enableMcpTools: true,
  };

  const envConfigs = {
    development: {
      ...baseConfig,
      enableDebug: true,
      maxRetries: 1,
      timeout: 10000,
    },
    production: {
      ...baseConfig,
      enableDebug: false,
      maxRetries: 3,
      timeout: 30000,
    },
    testing: {
      ...baseConfig,
      enableDebug: true,
      maxRetries: 1,
      timeout: 5000,
    },
  };

  return createDefaultChatFlow(vault, envConfigs[env] || envConfigs.production);
};
```

### 2. 錯誤處理

```typescript
// 實現自定義錯誤處理
class RobustPocketFlowRunner extends PocketFlowChainRunner {
  async run(userMessage: ChatMessage, ...args: any[]): Promise<string> {
    try {
      return await super.run(userMessage, ...args);
    } catch (error) {
      // 記錄錯誤
      DebugVisualizer.log("error", "execution_failed", { error: error.message });

      // 嘗試恢復
      if (this.canRecover(error)) {
        return await this.performRecovery(userMessage, ...args);
      }

      throw error;
    }
  }

  private canRecover(error: any): boolean {
    // 判斷是否可以恢復
    return error.message.includes("timeout") || error.message.includes("network");
  }

  private async performRecovery(userMessage: ChatMessage, ...args: any[]): Promise<string> {
    // 執行恢復邏輯，例如使用簡化模式
    const simpleRunner = new SimplePocketFlowChainRunner(this.chainManager, this.vault);
    return await simpleRunner.run(userMessage, ...args);
  }
}
```

### 3. 性能優化

```typescript
// 實現性能監控和優化
class OptimizedPocketFlowRunner extends PocketFlowChainRunner {
  private performanceThreshold = 5000; // 5 秒

  async run(userMessage: ChatMessage, ...args: any[]): Promise<string> {
    const startTime = Date.now();

    const result = await super.run(userMessage, ...args);

    const duration = Date.now() - startTime;
    PerformanceMonitor.recordMetric("total_execution", duration);

    if (duration > this.performanceThreshold) {
      console.warn(`執行時間過長: ${duration}ms`);
      this.optimizeForNextRun();
    }

    return result;
  }

  private optimizeForNextRun(): void {
    // 動態優化配置
    this.updateConfig({
      maxRetries: Math.max(1, this.getConfig().maxRetries - 1),
      timeout: Math.max(10000, this.getConfig().timeout - 5000),
    });
  }
}
```

### 4. 監控和觀測

```typescript
// 設置完整的監控
class MonitoredChatFlow extends ChatFlow {
  async execute(shared: ChatSharedState): Promise<string> {
    const executionId = this.generateExecutionId();

    try {
      DebugVisualizer.log("flow", "execution_start", { executionId });

      const result = await super.execute(shared);

      DebugVisualizer.log("flow", "execution_success", {
        executionId,
        resultLength: result.length,
      });

      return result;
    } catch (error) {
      DebugVisualizer.log("flow", "execution_error", { executionId, error: error.message });
      throw error;
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## 總結

遷移到 PocketFlow 將為您的聊天系統帶來顯著的改進：

- ✅ **更好的性能**: 並行處理和優化的執行路徑
- ✅ **更強的可維護性**: 模塊化設計
- ✅ **完整的可觀測性**: 詳細的監控和調試工具
- ✅ **向後兼容**: 無縫替換現有系統

按照本指南的階段性方法，您可以安全地遷移到 PocketFlow，同時最小化風險和中斷。

如果在遷移過程中遇到問題，請參考故障排除部分或查看 PocketFlow 的詳細文檔。
