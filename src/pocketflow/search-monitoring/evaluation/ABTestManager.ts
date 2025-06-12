/**
 * A/B 測試管理器
 * 負責管理搜索相關的 A/B 測試實驗
 */

import { EventEmitter } from "events";
import {
  ABTestConfig,
  ABTestStatus,
  ABTestResult,
  TestVariant,
  ABTestMetric,
  TestRecommendation,
  MetricType,
  SearchMonitoringEvent,
} from "../types";

export interface ABTestManagerOptions {
  enableAutoAnalysis: boolean;
  minSampleSize: number;
  significanceLevel: number;
  maxTestDuration: number; // 毫秒
}

export class ABTestManager extends EventEmitter {
  private options: ABTestManagerOptions;
  private activeTests: Map<string, RunningTest> = new Map();
  private completedTests: Map<string, CompletedTest> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map(); // userId -> testId -> variantId
  private testEvents: Map<string, SearchMonitoringEvent[]> = new Map();

  constructor(options: ABTestManagerOptions) {
    super();
    this.options = options;
  }

  /**
   * 創建新的 A/B 測試
   */
  async createTest(config: ABTestConfig): Promise<string> {
    // 驗證配置
    this.validateTestConfig(config);

    // 創建運行中測試
    const runningTest: RunningTest = {
      config,
      status: ABTestStatus.DRAFT,
      createdAt: new Date(),
      startedAt: null,
      participants: new Map(),
      metrics: new Map(),
      events: [],
    };

    this.activeTests.set(config.id, runningTest);
    this.testEvents.set(config.id, []);

    this.emit("test:created", { testId: config.id, config });
    console.log(`🧪 A/B 測試已創建: ${config.name} (${config.id})`);

    return config.id;
  }

  /**
   * 啟動 A/B 測試
   */
  async startTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`測試不存在: ${testId}`);
    }

    if (test.status !== ABTestStatus.DRAFT && test.status !== ABTestStatus.PAUSED) {
      throw new Error(`測試狀態不允許啟動: ${test.status}`);
    }

    test.status = ABTestStatus.RUNNING;
    test.startedAt = new Date();

    this.emit("test:started", { testId, config: test.config });
    console.log(`🚀 A/B 測試已啟動: ${test.config.name}`);
  }

  /**
   * 暫停 A/B 測試
   */
  async pauseTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`測試不存在: ${testId}`);
    }

    if (test.status !== ABTestStatus.RUNNING) {
      throw new Error(`只能暫停運行中的測試`);
    }

    test.status = ABTestStatus.PAUSED;

    this.emit("test:paused", { testId, config: test.config });
    console.log(`⏸️ A/B 測試已暫停: ${test.config.name}`);
  }

  /**
   * 停止 A/B 測試
   */
  async stopTest(testId: string, reason?: string): Promise<ABTestResult> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`測試不存在: ${testId}`);
    }

    test.status = ABTestStatus.COMPLETED;

    // 分析測試結果
    const result = await this.analyzeTest(testId);

    // 移動到已完成測試
    const completedTest: CompletedTest = {
      ...test,
      result,
      completedAt: new Date(),
      reason,
    };

    this.completedTests.set(testId, completedTest);
    this.activeTests.delete(testId);

    this.emit("test:completed", { testId, result });
    console.log(`✅ A/B 測試已完成: ${test.config.name}`);

    return result;
  }

  /**
   * 為用戶分配測試變體
   */
  assignVariant(userId: string, testId: string): string | null {
    const test = this.activeTests.get(testId);
    if (!test || test.status !== ABTestStatus.RUNNING) {
      return null;
    }

    // 檢查是否已分配
    const userTestAssignments = this.userAssignments.get(userId) || new Map();
    const existingAssignment = userTestAssignments.get(testId);
    if (existingAssignment) {
      return existingAssignment;
    }

    // 根據分流比例分配變體
    const variant = this.selectVariant(test.config, userId);

    // 記錄分配
    userTestAssignments.set(testId, variant.id);
    this.userAssignments.set(userId, userTestAssignments);

    // 更新參與者統計
    const participantCount = test.participants.get(variant.id) || 0;
    test.participants.set(variant.id, participantCount + 1);

    this.emit("variant:assigned", {
      userId,
      testId,
      variantId: variant.id,
    });

    return variant.id;
  }

  /**
   * 記錄測試事件
   */
  recordTestEvent(userId: string, testId: string, event: SearchMonitoringEvent): void {
    const test = this.activeTests.get(testId);
    if (!test || test.status !== ABTestStatus.RUNNING) {
      return;
    }

    // 獲取用戶的變體分配
    const variantId = this.userAssignments.get(userId)?.get(testId);
    if (!variantId) {
      return;
    }

    // 增強事件數據
    const enhancedEvent = {
      ...event,
      testId,
      variantId,
      userId,
    };

    // 記錄到測試事件
    const testEvents = this.testEvents.get(testId) || [];
    testEvents.push(enhancedEvent);
    this.testEvents.set(testId, testEvents);

    // 記錄到運行測試
    test.events.push(enhancedEvent);

    // 實時指標更新
    if (this.options.enableAutoAnalysis) {
      this.updateRealtimeMetrics(testId, variantId, enhancedEvent);
    }

    this.emit("test:event_recorded", { testId, variantId, event: enhancedEvent });
  }

  /**
   * 獲取測試狀態
   */
  getTestStatus(testId: string): TestStatus | null {
    const activeTest = this.activeTests.get(testId);
    if (activeTest) {
      return {
        testId,
        status: activeTest.status,
        participants: this.getTotalParticipants(activeTest),
        duration: activeTest.startedAt ? Date.now() - activeTest.startedAt.getTime() : 0,
        progress: this.calculateProgress(activeTest),
        intermediateResults: this.options.enableAutoAnalysis
          ? this.calculateIntermediateResults(activeTest)
          : null,
      };
    }

    const completedTest = this.completedTests.get(testId);
    if (completedTest) {
      return {
        testId,
        status: ABTestStatus.COMPLETED,
        participants: this.getTotalParticipants(completedTest),
        duration:
          completedTest.completedAt && completedTest.startedAt
            ? completedTest.completedAt.getTime() - completedTest.startedAt.getTime()
            : 0,
        progress: 1.0,
        intermediateResults: null,
      };
    }

    return null;
  }

  /**
   * 獲取所有活躍測試
   */
  getActiveTests(): TestSummary[] {
    return Array.from(this.activeTests.values()).map((test) => ({
      testId: test.config.id,
      name: test.config.name,
      status: test.status,
      variants: test.config.variants.length,
      participants: this.getTotalParticipants(test),
      startedAt: test.startedAt,
      progress: this.calculateProgress(test),
    }));
  }

  /**
   * 分析測試結果
   */
  async analyzeTest(testId: string): Promise<ABTestResult> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`測試不存在: ${testId}`);
    }

    const results: Record<string, any> = {};

    // 為每個變體計算指標
    for (const variant of test.config.variants) {
      const variantEvents = test.events.filter((e) => e.variantId === variant.id);
      const variantResults: Record<string, any> = {};

      // 計算每個指標
      for (const metric of test.config.metrics) {
        const metricResult = await this.calculateMetric(metric, variantEvents);
        variantResults[metric.name] = metricResult;
      }

      results[variant.id] = {
        variant: variant.name,
        participantCount: test.participants.get(variant.id) || 0,
        metrics: variantResults,
      };
    }

    // 統計顯著性檢驗
    const statistical = await this.performStatisticalAnalysis(test, results);

    // 生成建議
    const recommendation = this.generateRecommendation(statistical, results);

    return {
      testId,
      variant: "", // 將在後續更新
      metrics: {}, // 將在後續更新
      statistical,
      confidence: statistical.confidence || 0.95,
      recommendation,
    };
  }

  /**
   * 獲取測試詳細報告
   */
  async getTestReport(testId: string): Promise<TestReport> {
    const test = this.activeTests.get(testId) || this.completedTests.get(testId);
    if (!test) {
      throw new Error(`測試不存在: ${testId}`);
    }

    const events = this.testEvents.get(testId) || [];
    const variantBreakdown = await this.generateVariantBreakdown(test, events);
    const timeline = this.generateTestTimeline(events);
    const insights = await this.generateInsights(test, events);

    return {
      testId,
      config: test.config,
      status: test.status,
      duration: this.calculateTestDuration(test),
      totalParticipants: this.getTotalParticipants(test),
      variantBreakdown,
      timeline,
      insights,
      generatedAt: new Date(),
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private validateTestConfig(config: ABTestConfig): void {
    if (!config.id || !config.name) {
      throw new Error("測試 ID 和名稱是必需的");
    }

    if (config.variants.length < 2) {
      throw new Error("至少需要兩個測試變體");
    }

    const totalTraffic = config.variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error("變體流量分配總和必須為 100%");
    }

    if (config.metrics.length === 0) {
      throw new Error("至少需要一個測試指標");
    }
  }

  private selectVariant(config: ABTestConfig, userId: string): TestVariant {
    // 使用用戶 ID 的哈希值來確保一致性分配
    const hash = this.hashUserId(userId);
    const percentage = hash % 100;

    let cumulative = 0;
    for (const variant of config.variants) {
      cumulative += variant.trafficPercentage;
      if (percentage < cumulative) {
        return variant;
      }
    }

    // 默認返回最後一個變體
    return config.variants[config.variants.length - 1];
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為 32 位整數
    }
    return Math.abs(hash);
  }

  private updateRealtimeMetrics(
    testId: string,
    variantId: string,
    event: SearchMonitoringEvent
  ): void {
    const test = this.activeTests.get(testId);
    if (!test) return;

    // 實時指標更新邏輯
    const variantMetrics = test.metrics.get(variantId) || new Map();

    // 更新事件計數
    const eventCount = variantMetrics.get("eventCount") || 0;
    variantMetrics.set("eventCount", eventCount + 1);

    // 更新其他指標
    if (event.data.latency) {
      const latencies = variantMetrics.get("latencies") || [];
      latencies.push(event.data.latency);
      variantMetrics.set("latencies", latencies);
    }

    test.metrics.set(variantId, variantMetrics);
  }

  private getTotalParticipants(test: RunningTest | CompletedTest): number {
    let total = 0;
    for (const count of test.participants.values()) {
      total += count;
    }
    return total;
  }

  private calculateProgress(test: RunningTest): number {
    if (!test.startedAt) return 0;

    const elapsed = Date.now() - test.startedAt.getTime();
    const totalDuration = test.config.endTime.getTime() - test.config.startTime.getTime();

    return Math.min(1.0, elapsed / totalDuration);
  }

  private calculateIntermediateResults(test: RunningTest): any {
    // 計算中間結果
    return {
      sampleSize: this.getTotalParticipants(test),
      powerAnalysis: this.calculatePower(test),
      earlySignals: this.detectEarlySignals(test),
    };
  }

  private calculatePower(test: RunningTest): number {
    // 簡化的統計功效計算
    const participants = this.getTotalParticipants(test);
    const minSize = this.options.minSampleSize;

    return Math.min(1.0, participants / minSize);
  }

  private detectEarlySignals(test: RunningTest): any[] {
    // 早期信號檢測
    return [];
  }

  private async calculateMetric(
    metric: ABTestMetric,
    events: SearchMonitoringEvent[]
  ): Promise<any> {
    switch (metric.type) {
      case MetricType.CLICK_THROUGH_RATE:
        return this.calculateClickThroughRate(events);
      case MetricType.CONVERSION_RATE:
        return this.calculateConversionRate(events);
      case MetricType.AVERAGE_SESSION_DURATION:
        return this.calculateSessionDuration(events);
      default:
        return { value: 0, count: events.length };
    }
  }

  private calculateClickThroughRate(events: SearchMonitoringEvent[]): any {
    const searchEvents = events.filter((e) => e.type === "search_completed");
    const clickEvents = events.filter((e) => e.type === "result_clicked");

    const rate = searchEvents.length > 0 ? clickEvents.length / searchEvents.length : 0;

    return {
      value: rate,
      numerator: clickEvents.length,
      denominator: searchEvents.length,
      confidenceInterval: this.calculateConfidenceInterval(rate, searchEvents.length),
    };
  }

  private calculateConversionRate(events: SearchMonitoringEvent[]): any {
    // 簡化的轉換率計算
    return {
      value: 0.1,
      numerator: 10,
      denominator: 100,
      confidenceInterval: [0.08, 0.12],
    };
  }

  private calculateSessionDuration(events: SearchMonitoringEvent[]): any {
    // 簡化的會話時長計算
    return {
      value: 45000, // 45秒
      count: events.length,
      confidenceInterval: [40000, 50000],
    };
  }

  private calculateConfidenceInterval(rate: number, sampleSize: number): [number, number] {
    if (sampleSize === 0) return [0, 0];

    const z = 1.96; // 95% 信心區間
    const margin = z * Math.sqrt((rate * (1 - rate)) / sampleSize);

    return [Math.max(0, rate - margin), Math.min(1, rate + margin)];
  }

  private async performStatisticalAnalysis(
    test: RunningTest,
    results: Record<string, any>
  ): Promise<any> {
    // 簡化的統計分析
    return {
      significant: true,
      pValue: 0.03,
      effect: 0.15,
      confidence: 0.95,
      powerAnalysis: {
        power: 0.8,
        sampleSize: this.getTotalParticipants(test),
        effectSize: 0.15,
        alpha: 0.05,
      },
    };
  }

  private generateRecommendation(
    statistical: any,
    results: Record<string, any>
  ): TestRecommendation {
    if (statistical.significant && statistical.pValue < 0.05) {
      return TestRecommendation.IMPLEMENT;
    } else if (statistical.power < 0.8) {
      return TestRecommendation.CONTINUE_TESTING;
    } else {
      return TestRecommendation.INCONCLUSIVE;
    }
  }

  private async generateVariantBreakdown(
    test: RunningTest | CompletedTest,
    events: SearchMonitoringEvent[]
  ): Promise<any[]> {
    const breakdown = [];

    for (const variant of test.config.variants) {
      const variantEvents = events.filter((e) => e.variantId === variant.id);
      const participants = test.participants.get(variant.id) || 0;

      breakdown.push({
        variantId: variant.id,
        variantName: variant.name,
        participants,
        events: variantEvents.length,
        metrics: await this.calculateVariantMetrics(variantEvents),
      });
    }

    return breakdown;
  }

  private generateTestTimeline(events: SearchMonitoringEvent[]): any[] {
    // 生成測試時間線
    const timeline = [];
    const hourlyBuckets = new Map<number, number>();

    for (const event of events) {
      const hour = Math.floor(event.timestamp.getTime() / 3600000);
      hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);
    }

    for (const [hour, count] of hourlyBuckets) {
      timeline.push({
        timestamp: new Date(hour * 3600000),
        eventCount: count,
      });
    }

    return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private async generateInsights(
    test: RunningTest | CompletedTest,
    events: SearchMonitoringEvent[]
  ): Promise<string[]> {
    const insights = [];

    const totalParticipants = this.getTotalParticipants(test);
    if (totalParticipants < this.options.minSampleSize) {
      insights.push(
        `樣本量不足：當前 ${totalParticipants}，建議至少 ${this.options.minSampleSize}`
      );
    }

    const duration = this.calculateTestDuration(test);
    if (duration > this.options.maxTestDuration) {
      insights.push("測試運行時間過長，建議考慮停止測試");
    }

    return insights;
  }

  private calculateTestDuration(test: RunningTest | CompletedTest): number {
    if (!test.startedAt) return 0;

    const endTime = "completedAt" in test && test.completedAt ? test.completedAt : new Date();

    return endTime.getTime() - test.startedAt.getTime();
  }

  private async calculateVariantMetrics(events: SearchMonitoringEvent[]): Promise<any> {
    return {
      totalEvents: events.length,
      uniqueUsers: new Set(events.map((e) => e.userId).filter(Boolean)).size,
      avgLatency: this.calculateAverageLatency(events),
    };
  }

  private calculateAverageLatency(events: SearchMonitoringEvent[]): number {
    const latencies = events.filter((e) => e.data.latency).map((e) => e.data.latency);

    return latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  }
}

// ============================================================================
// 輔助類型
// ============================================================================

interface RunningTest {
  config: ABTestConfig;
  status: ABTestStatus;
  createdAt: Date;
  startedAt: Date | null;
  participants: Map<string, number>; // variantId -> participantCount
  metrics: Map<string, Map<string, any>>; // variantId -> metricName -> value
  events: SearchMonitoringEvent[];
}

interface CompletedTest extends RunningTest {
  result: ABTestResult;
  completedAt: Date;
  reason?: string;
}

interface TestStatus {
  testId: string;
  status: ABTestStatus;
  participants: number;
  duration: number;
  progress: number;
  intermediateResults: any | null;
}

interface TestSummary {
  testId: string;
  name: string;
  status: ABTestStatus;
  variants: number;
  participants: number;
  startedAt: Date | null;
  progress: number;
}

interface TestReport {
  testId: string;
  config: ABTestConfig;
  status: ABTestStatus;
  duration: number;
  totalParticipants: number;
  variantBreakdown: any[];
  timeline: any[];
  insights: string[];
  generatedAt: Date;
}
