/**
 * PocketFlow 流程可視化工具
 *
 * 提供流程圖生成、調試可視化和性能監控圖表功能
 */

import { ChatFlow } from "../flows/ChatFlow";

/**
 * 流程圖生成器
 */
export class FlowDiagramGenerator {
  /**
   * 生成基本的 Mermaid 流程圖
   */
  static generateBasicMermaid(flow: ChatFlow): string {
    return `
graph TD
    A[開始] --> B[IntentAnalysisNode<br/>意圖分析]
    
    B -->|local_search| C[ToolExecutionBatchNode<br/>工具執行]
    B -->|web_search| C
    B -->|mcp_tools| C
    B -->|tool_execution| C
    B -->|direct_llm| D[MultimodalContentNode<br/>多模態內容處理]
    
    C -->|default| E[ContextPrepNode<br/>上下文準備]
    D -->|context_prep| E
    
    E -->|llm_generation| F[LLMGenerationNode<br/>LLM 生成]
    
    F --> G[結束]
    
    style A fill:#a8e6cf
    style B fill:#dcedc1
    style C fill:#ffd3a5
    style D fill:#fda085
    style E fill:#b3e5fc
    style F fill:#f8bbd9
    style G fill:#c8e6c9
    
    classDef default fill:#ffffff,stroke:#333,stroke-width:2px,color:#000
`;
  }

  /**
   * 生成詳細的流程圖，包含配置信息
   */
  static generateDetailedMermaid(flow: ChatFlow): string {
    const config = flow.getConfig();
    const stats = flow.getStats();

    let configInfo = "配置:\\n";
    if (config.enableLocalSearch) configInfo += "✓ 本地搜索\\n";
    if (config.enableWebSearch) configInfo += "✓ 網頁搜索\\n";
    if (config.enableMcpTools) configInfo += "✓ MCP 工具\\n";
    if (config.enableDebug) configInfo += "✓ 調試模式\\n";
    configInfo += `重試次數: ${config.maxRetries}\\n`;
    configInfo += `超時: ${config.timeout}ms`;

    return `
graph TD
    subgraph config["流程配置"]
        INFO["${configInfo}"]
    end
    
    subgraph main["主要流程"]
        A[開始] --> B[IntentAnalysisNode<br/>意圖分析]
        
        B -->|本地搜索| C[ToolExecutionBatchNode<br/>工具執行]
        B -->|網頁搜索| C
        B -->|MCP 工具| C
        B -->|工具執行| C
        B -->|直接 LLM| D[MultimodalContentNode<br/>多模態內容處理]
        
        C -->|預設| E[ContextPrepNode<br/>上下文準備]
        D -->|上下文準備| E
        
        E -->|LLM 生成| F[LLMGenerationNode<br/>LLM 生成]
        
        F --> G[結束]
    end
    
    subgraph stats["統計信息"]
        STATS["節點總數: ${stats.totalNodes}\\n啟用功能: ${stats.enabledFeatures.join(", ")}"]
    end
    
    style A fill:#a8e6cf
    style B fill:#dcedc1
    style C fill:#ffd3a5
    style D fill:#fda085
    style E fill:#b3e5fc
    style F fill:#f8bbd9
    style G fill:#c8e6c9
    style INFO fill:#fff2cc
    style STATS fill:#e1d5e7
`;
  }

  /**
   * 生成執行狀態圖
   */
  static generateExecutionStateMermaid(flow: ChatFlow): string {
    const nodeStatuses = flow.getNodeStatuses();

    let statusInfo = "";
    Object.entries(nodeStatuses).forEach(([key, status]) => {
      statusInfo += `${key}: ${status.retryCount}/${status.maxRetries}\\n`;
    });

    return `
graph LR
    subgraph execution["執行狀態"]
        STATUS["${statusInfo}"]
    end
    
    subgraph flow["流程狀態"]
        A[意圖分析] 
        B[多模態處理]
        C[工具執行]
        D[上下文準備]
        E[LLM 生成]
        
        A --> B
        A --> C
        B --> D
        C --> D
        D --> E
    end
    
    style STATUS fill:#fff2cc
`;
  }
}

/**
 * 調試可視化工具
 */
export class DebugVisualizer {
  private static debugLogs: Array<{
    timestamp: string;
    nodeId: string;
    action: string;
    data: any;
  }> = [];

  /**
   * 記錄調試信息
   */
  static log(nodeId: string, action: string, data: any): void {
    this.debugLogs.push({
      timestamp: new Date().toISOString(),
      nodeId,
      action,
      data,
    });
  }

  /**
   * 生成調試時間線
   */
  static generateDebugTimeline(): string {
    let timeline = "執行時間線:\\n";

    this.debugLogs.forEach((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      timeline += `${index + 1}. [${time}] ${log.nodeId} - ${log.action}\\n`;
    });

    return `
graph TD
    A[調試時間線] --> B["${timeline}"]
    
    style A fill:#ffcccb
    style B fill:#fff2cc
`;
  }

  /**
   * 生成錯誤分析圖
   */
  static generateErrorAnalysis(): string {
    const errorLogs = this.debugLogs.filter(
      (log) => log.action.includes("error") || log.action.includes("fail")
    );

    if (errorLogs.length === 0) {
      return `
graph TD
    A[錯誤分析] --> B[無錯誤記錄]
    
    style A fill:#c8e6c9
    style B fill:#a8e6cf
`;
    }

    let errorInfo = "錯誤記錄:\\n";
    errorLogs.forEach((log, index) => {
      errorInfo += `${index + 1}. ${log.nodeId}: ${log.action}\\n`;
    });

    return `
graph TD
    A[錯誤分析] --> B["${errorInfo}"]
    
    style A fill:#ffcccb
    style B fill:#ffd3d3
`;
  }

  /**
   * 清除調試日誌
   */
  static clearLogs(): void {
    this.debugLogs = [];
  }

  /**
   * 導出調試日誌
   */
  static exportLogs(): any[] {
    return [...this.debugLogs];
  }
}

/**
 * 性能監控工具
 */
export class PerformanceMonitor {
  private static metrics: Map<
    string,
    {
      executionTime: number[];
      memoryUsage: number[];
      timestamps: string[];
    }
  > = new Map();

  /**
   * 記錄性能指標
   */
  static recordMetric(nodeId: string, executionTime: number, memoryUsage?: number): void {
    if (!this.metrics.has(nodeId)) {
      this.metrics.set(nodeId, {
        executionTime: [],
        memoryUsage: [],
        timestamps: [],
      });
    }

    const metrics = this.metrics.get(nodeId)!;
    metrics.executionTime.push(executionTime);
    metrics.memoryUsage.push(memoryUsage || 0);
    metrics.timestamps.push(new Date().toISOString());
  }

  /**
   * 生成性能報告
   */
  static generatePerformanceReport(): string {
    let report = "性能報告:\\n";

    this.metrics.forEach((metrics, nodeId) => {
      const avgTime =
        metrics.executionTime.reduce((a, b) => a + b, 0) / metrics.executionTime.length;
      const maxTime = Math.max(...metrics.executionTime);
      const minTime = Math.min(...metrics.executionTime);

      report += `${nodeId}:\\n`;
      report += `  平均: ${avgTime.toFixed(2)}ms\\n`;
      report += `  最大: ${maxTime.toFixed(2)}ms\\n`;
      report += `  最小: ${minTime.toFixed(2)}ms\\n`;
      report += `  執行次數: ${metrics.executionTime.length}\\n\\n`;
    });

    return report;
  }

  /**
   * 生成性能圖表
   */
  static generatePerformanceChart(): string {
    let chartData = "";

    this.metrics.forEach((metrics, nodeId) => {
      const avgTime =
        metrics.executionTime.reduce((a, b) => a + b, 0) / metrics.executionTime.length;
      chartData += `${nodeId}: ${avgTime.toFixed(2)}ms\\n`;
    });

    return `
graph LR
    A[性能指標] --> B["${chartData}"]
    
    style A fill:#e3f2fd
    style B fill:#bbdefb
`;
  }

  /**
   * 清除性能數據
   */
  static clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * 導出性能數據
   */
  static exportMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    this.metrics.forEach((metrics, nodeId) => {
      result[nodeId] = {
        ...metrics,
        averageTime:
          metrics.executionTime.reduce((a, b) => a + b, 0) / metrics.executionTime.length,
        maxTime: Math.max(...metrics.executionTime),
        minTime: Math.min(...metrics.executionTime),
      };
    });
    return result;
  }
}

/**
 * 流程分析器
 */
export class FlowAnalyzer {
  /**
   * 分析流程瓶頸
   */
  static analyzeBottlenecks(flow: ChatFlow): {
    bottlenecks: string[];
    recommendations: string[];
  } {
    const config = flow.getConfig();
    const stats = flow.getStats();
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    // 檢查配置問題
    if (config.maxRetries && config.maxRetries > 5) {
      bottlenecks.push("重試次數過高可能影響性能");
      recommendations.push("考慮降低 maxRetries 到 3-5 次");
    }

    if (config.timeout && config.timeout > 60000) {
      bottlenecks.push("超時設定過長可能導致用戶等待");
      recommendations.push("考慮將 timeout 設定為 30 秒以下");
    }

    // 檢查功能啟用情況
    if (stats.enabledFeatures.length > 3) {
      bottlenecks.push("啟用功能過多可能影響執行效率");
      recommendations.push("根據使用場景選擇性啟用功能");
    }

    if (bottlenecks.length === 0) {
      recommendations.push("流程配置良好，無明顯瓶頸");
    }

    return { bottlenecks, recommendations };
  }

  /**
   * 生成優化建議
   */
  static generateOptimizationSuggestions(flow: ChatFlow): string[] {
    const analysis = this.analyzeBottlenecks(flow);
    const performanceData = PerformanceMonitor.exportMetrics();
    const suggestions: string[] = [];

    // 基於瓶頸分析的建議
    suggestions.push(...analysis.recommendations);

    // 基於性能數據的建議
    Object.entries(performanceData).forEach(([nodeId, metrics]) => {
      if ((metrics as any).averageTime > 5000) {
        suggestions.push(`${nodeId} 執行時間較長，考慮優化算法或增加快取`);
      }
    });

    return suggestions;
  }

  /**
   * 生成流程健康報告
   */
  static generateHealthReport(flow: ChatFlow): {
    overall: "healthy" | "warning" | "critical";
    score: number;
    issues: string[];
    suggestions: string[];
  } {
    const validation = flow.validateFlow();
    const analysis = this.analyzeBottlenecks(flow);
    const performanceData = PerformanceMonitor.exportMetrics();

    let score = 100;
    const issues: string[] = [];

    // 檢查流程有效性
    if (!validation.isValid) {
      score -= 30;
      issues.push(...validation.issues);
    }

    // 檢查瓶頸
    if (analysis.bottlenecks.length > 0) {
      score -= analysis.bottlenecks.length * 10;
      issues.push(...analysis.bottlenecks);
    }

    // 檢查性能
    const avgExecutionTimes = Object.values(performanceData).map(
      (metrics: any) => metrics.averageTime
    );
    const maxAvgTime = Math.max(...avgExecutionTimes, 0);
    if (maxAvgTime > 10000) {
      score -= 20;
      issues.push("存在執行時間過長的節點");
    }

    let overall: "healthy" | "warning" | "critical";
    if (score >= 80) overall = "healthy";
    else if (score >= 60) overall = "warning";
    else overall = "critical";

    return {
      overall,
      score: Math.max(0, score),
      issues,
      suggestions: this.generateOptimizationSuggestions(flow),
    };
  }
}

/**
 * 可視化工具整合器
 */
export class FlowVisualizer {
  /**
   * 生成完整的流程報告
   */
  static generateCompleteReport(flow: ChatFlow): {
    basicDiagram: string;
    detailedDiagram: string;
    executionState: string;
    debugTimeline: string;
    performanceChart: string;
    healthReport: any;
  } {
    return {
      basicDiagram: FlowDiagramGenerator.generateBasicMermaid(flow),
      detailedDiagram: FlowDiagramGenerator.generateDetailedMermaid(flow),
      executionState: FlowDiagramGenerator.generateExecutionStateMermaid(flow),
      debugTimeline: DebugVisualizer.generateDebugTimeline(),
      performanceChart: PerformanceMonitor.generatePerformanceChart(),
      healthReport: FlowAnalyzer.generateHealthReport(flow),
    };
  }

  /**
   * 導出所有數據
   */
  static exportAllData(): {
    debugLogs: any[];
    performanceMetrics: Record<string, any>;
    timestamp: string;
  } {
    return {
      debugLogs: DebugVisualizer.exportLogs(),
      performanceMetrics: PerformanceMonitor.exportMetrics(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 重置所有數據
   */
  static resetAllData(): void {
    DebugVisualizer.clearLogs();
    PerformanceMonitor.clearMetrics();
  }
}
