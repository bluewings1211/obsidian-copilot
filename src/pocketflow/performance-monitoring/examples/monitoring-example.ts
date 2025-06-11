import { createPerformanceMonitoring } from "../index";

/**
 * PocketFlow.js 性能監控系統使用示例
 * 展示如何使用完整的性能監控和分析系統
 */

async function performanceMonitoringExample() {
  console.log("🚀 啟動 PocketFlow.js 性能監控系統示例...\n");

  // 1. 創建性能監控系統
  const monitoring = createPerformanceMonitoring({
    enabled: true,
    collectInterval: 5000, // 5秒收集間隔
    retentionPeriod: 24 * 60 * 60 * 1000, // 24小時數據保留
    alertThresholds: {
      "system.cpu.usage": { warning: 70, critical: 90 },
      "system.memory.usage": { warning: 80, critical: 95 },
      "tool.execution.time": { warning: 5000, critical: 10000 },
    },
    enableRealTimeAnalysis: true,
    enableTrendAnalysis: true,
    maxMetricsInMemory: 1000,
    enableAutoOptimization: false,
  });

  try {
    // 2. 啟動監控系統
    console.log("📊 啟動監控系統...");
    await monitoring.start();
    console.log("✅ 監控系統已啟動\n");

    // 3. 模擬一些性能指標數據
    console.log("📈 模擬性能數據...");
    await simulateMetrics(monitoring);

    // 4. 等待一段時間讓系統分析數據
    console.log("⏳ 等待數據分析...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 5. 獲取系統健康狀態
    console.log("🏥 檢查系統健康狀態...");
    const health = await monitoring.manager.getSystemHealth();
    console.log(`系統整體狀態: ${health.overall}`);
    console.log(`活躍告警數量: ${health.summary.activeAlerts}`);
    console.log(`系統負載: ${health.summary.systemLoad.toFixed(1)}%\n`);

    // 6. 生成性能分析報告
    console.log("📋 生成性能分析報告...");
    const report = monitoring.analyzer.generateSystemReport();
    console.log(`總體性能分數: ${report.overallScore.toFixed(1)}/100`);
    console.log(`檢測到的瓶頸: ${report.bottlenecks.length}個`);
    console.log(`生成的洞察: ${report.insights.length}個\n`);

    // 7. 分析使用模式
    console.log("🔍 分析使用模式...");
    const patterns = monitoring.patternAnalyzer.analyzeUsagePatterns();
    console.log(`檢測到的模式: ${patterns.patterns.length}個`);
    console.log(`負載模式: ${patterns.loadPatterns.length}個組件`);
    console.log(`異常檢測: ${patterns.anomalies.length}個\n`);

    // 8. 生成預測分析
    console.log("🔮 生成預測分析...");
    const predictions = await monitoring.predictive.generatePredictions();
    console.log(`生成預測: ${predictions.length}個`);

    const alertPredictions = await monitoring.predictive.detectFutureAlerts();
    console.log(`未來告警預測: ${alertPredictions.length}個\n`);

    // 9. 獲取優化建議
    console.log("⚙️ 生成優化建議...");
    const optimizationReport = monitoring.optimizer.generateOptimizationReport();
    console.log(`總建議數: ${optimizationReport.summary.totalRecommendations}個`);
    console.log(`高優先級項目: ${optimizationReport.summary.highPriorityItems}個`);
    console.log(`快速改進項目: ${optimizationReport.quickWins.length}個`);
    console.log(
      `預估性能提升: ${optimizationReport.summary.estimatedPerformanceGain.toFixed(1)}%\n`
    );

    // 10. 展示一些具體的建議
    if (optimizationReport.quickWins.length > 0) {
      console.log("🚀 快速改進建議:");
      optimizationReport.quickWins.slice(0, 3).forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.title}`);
        console.log(`   描述: ${rec.description}`);
        console.log(`   預期效果: ${rec.expectedOutcome}`);
        console.log(`   實施工作量: ${rec.implementation.effort}\n`);
      });
    }

    // 11. 展示自動優化規則
    console.log("🤖 自動優化狀態:");
    console.log(`已執行: ${optimizationReport.autoOptimizations.executed}次`);
    console.log(`待執行規則: ${optimizationReport.autoOptimizations.pending}個`);
    console.log(`總規則數: ${optimizationReport.autoOptimizations.rules.length}個\n`);

    // 12. 導出數據示例
    console.log("📤 導出監控數據...");
    const metricsJson = await monitoring.manager.generateReport({
      timeRange: {
        start: Date.now() - 60000, // 最近1分鐘
        end: Date.now(),
      },
      includeMetrics: true,
      includeAlerts: true,
      includeTrends: true,
    });
    console.log(`導出數據包含 ${metricsJson.metrics?.length || 0} 個指標\n`);
  } catch (error) {
    console.error("❌ 監控系統錯誤:", error);
  } finally {
    // 13. 清理和停止
    console.log("🛑 停止監控系統...");
    await monitoring.stop();
    console.log("✅ 監控系統已停止");
  }
}

async function simulateMetrics(monitoring: any) {
  const metrics = [
    // 系統指標
    { name: "system.cpu.usage", value: 65, type: "gauge" as const, unit: "percent" },
    { name: "system.memory.usage", value: 78, type: "gauge" as const, unit: "percent" },
    {
      name: "system.memory.heap.used",
      value: 256 * 1024 * 1024,
      type: "gauge" as const,
      unit: "bytes",
    },

    // 工具執行指標
    { name: "tool.execution.time", value: 1500, type: "histogram" as const, unit: "ms" },
    { name: "tool.success.rate", value: 95, type: "gauge" as const, unit: "percent" },
    { name: "tool.error.rate", value: 2, type: "gauge" as const, unit: "percent" },

    // MCP 指標
    { name: "mcp.connection.count", value: 5, type: "gauge" as const, unit: "count" },
    { name: "mcp.request.latency", value: 250, type: "histogram" as const, unit: "ms" },

    // 編排指標
    { name: "orchestration.chain.duration", value: 3200, type: "histogram" as const, unit: "ms" },
    { name: "orchestration.step.count", value: 8, type: "counter" as const, unit: "count" },
  ];

  // 模擬隨時間變化的指標
  for (let i = 0; i < 20; i++) {
    for (const baseMetric of metrics) {
      // 添加一些隨機變化
      const variation = (Math.random() - 0.5) * 0.2; // ±10% 變化
      const value = baseMetric.value * (1 + variation);

      await monitoring.manager.recordMetric({
        ...baseMetric,
        value: Math.max(0, value),
        timestamp: Date.now(),
      });
    }

    // 每次間隔 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// 事件處理示例
function setupEventHandlers(monitoring: any) {
  monitoring.manager.on("alert", (alert: any) => {
    console.log(`🚨 告警: ${alert.message} (嚴重程度: ${alert.severity})`);
  });

  monitoring.analyzer.on("bottlenecksDetected", (bottlenecks: any[]) => {
    console.log(`🔍 檢測到 ${bottlenecks.length} 個性能瓶頸`);
  });

  monitoring.optimizer.on("criticalRecommendations", (recommendations: any[]) => {
    console.log(`⚠️ 產生 ${recommendations.length} 個關鍵優化建議`);
  });

  monitoring.predictive.on("alertsDetected", (alerts: any[]) => {
    console.log(`🔮 預測到 ${alerts.length} 個未來問題`);
  });
}

// 運行示例
if (require.main === module) {
  performanceMonitoringExample().catch(console.error);
}

export { performanceMonitoringExample, setupEventHandlers };
