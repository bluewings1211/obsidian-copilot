import { EventEmitter } from "events";
import { PerformanceMetric } from "../core/PerformanceMonitoringManager";
import { TrendData } from "../core/TrendAnalysisEngine";
import { UsagePattern } from "./UsagePatternAnalyzer";

export interface PredictionModel {
  id: string;
  name: string;
  type: "linear" | "polynomial" | "exponential" | "seasonal" | "hybrid";
  targetMetric: string;
  accuracy: number; // 0-1
  confidence: number; // 0-1
  trainedOn: number; // 數據點數量
  lastTrained: number;
  parameters: Record<string, number>;
  validationScore: number;
}

export interface Prediction {
  id: string;
  model: string;
  metric: string;
  timestamp: number; // 預測的時間點
  predictedValue: number;
  confidence: number;
  range: { min: number; max: number };
  factors: Array<{
    name: string;
    impact: number; // -1 to 1
    description: string;
  }>;
  generatedAt: number;
}

export interface AlertPrediction {
  id: string;
  type: "threshold_breach" | "performance_degradation" | "resource_exhaustion" | "anomaly";
  severity: "low" | "medium" | "high" | "critical";
  metric: string;
  predictedTime: number;
  confidence: number;
  description: string;
  recommendations: string[];
  preventionActions: Array<{
    action: string;
    urgency: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
    impact: string;
  }>;
}

export interface CapacityForecast {
  component: string;
  resource: "cpu" | "memory" | "storage" | "network" | "connections";
  currentUsage: number;
  currentCapacity: number;
  utilizationRate: number; // % per time unit
  projectedExhaustion: number | null; // timestamp
  recommendedAction: "monitor" | "plan_scaling" | "immediate_scaling" | "optimize";
  projectedUsage: Array<{
    timestamp: number;
    usage: number;
    confidence: number;
  }>;
}

export class PredictiveAnalytics extends EventEmitter {
  private models: Map<string, PredictionModel> = new Map();
  private predictions: Map<string, Prediction> = new Map();
  private alertPredictions: Map<string, AlertPrediction> = new Map();
  private capacityForecasts: Map<string, CapacityForecast> = new Map();
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private trends: Map<string, TrendData> = new Map();
  private patterns: Map<string, UsagePattern> = new Map();

  private analysisInterval?: NodeJS.Timeout;
  private isRunning = false;

  private readonly modelUpdateInterval = 3600000; // 1小時
  private readonly predictionHorizon = 24 * 60 * 60 * 1000; // 24小時預測
  private readonly minTrainingData = 50; // 最少訓練數據點

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // 啟動定期模型更新和預測
    this.analysisInterval = setInterval(() => {
      this.performPredictiveAnalysis();
    }, this.modelUpdateInterval);

    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = undefined;
    }

    this.emit("stopped");
  }

  addMetrics(metrics: PerformanceMetric[]): void {
    for (const metric of metrics) {
      if (!this.metrics.has(metric.name)) {
        this.metrics.set(metric.name, []);
      }

      const metricArray = this.metrics.get(metric.name)!;
      metricArray.push(metric);

      // 保持最近7天的數據
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const filteredMetrics = metricArray.filter((m) => m.timestamp >= weekAgo);
      this.metrics.set(metric.name, filteredMetrics);
    }
  }

  addTrends(trends: TrendData[]): void {
    for (const trend of trends) {
      this.trends.set(trend.metric, trend);
    }
  }

  addPatterns(patterns: UsagePattern[]): void {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  async trainModel(
    metricName: string,
    modelType: PredictionModel["type"] = "linear"
  ): Promise<PredictionModel | null> {
    const metricData = this.metrics.get(metricName);
    if (!metricData || metricData.length < this.minTrainingData) {
      return null;
    }

    const modelId = `${modelType}_${metricName}_${Date.now()}`;

    let model: PredictionModel;

    switch (modelType) {
      case "linear":
        model = this.trainLinearModel(modelId, metricName, metricData);
        break;
      case "polynomial":
        model = this.trainPolynomialModel(modelId, metricName, metricData);
        break;
      case "exponential":
        model = this.trainExponentialModel(modelId, metricName, metricData);
        break;
      case "seasonal":
        model = this.trainSeasonalModel(modelId, metricName, metricData);
        break;
      case "hybrid":
        model = this.trainHybridModel(modelId, metricName, metricData);
        break;
      default:
        return null;
    }

    this.models.set(modelId, model);
    this.emit("modelTrained", model);

    return model;
  }

  async generatePredictions(timeHorizon: number = this.predictionHorizon): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    const now = Date.now();

    for (const [, model] of this.models.entries()) {
      const prediction = await this.generatePrediction(model, now + timeHorizon);
      if (prediction) {
        predictions.push(prediction);
        this.predictions.set(prediction.id, prediction);
      }
    }

    this.emit("predictionsGenerated", predictions);
    return predictions;
  }

  async detectFutureAlerts(): Promise<AlertPrediction[]> {
    const alerts: AlertPrediction[] = [];

    // 基於預測檢測潛在問題
    for (const prediction of this.predictions.values()) {
      const alertsForPrediction = this.analyzeThresholdBreaches(prediction);
      alerts.push(...alertsForPrediction);
    }

    // 基於趨勢檢測潛在問題
    for (const trend of this.trends.values()) {
      const alertsForTrend = this.analyzeTrendAlerts(trend);
      alerts.push(...alertsForTrend);
    }

    // 基於資源使用檢測容量問題
    const capacityAlerts = this.analyzeCapacityAlerts();
    alerts.push(...capacityAlerts);

    // 存儲警報預測
    for (const alert of alerts) {
      this.alertPredictions.set(alert.id, alert);
    }

    this.emit("alertsDetected", alerts);
    return alerts;
  }

  async generateCapacityForecasts(): Promise<CapacityForecast[]> {
    const forecasts: CapacityForecast[] = [];

    // 分析各種資源的容量預測
    const resourceMetrics = {
      cpu: ["system.cpu.usage", "process.cpu.usage"],
      memory: ["system.memory.usage", "process.memory.usage"],
      storage: ["disk.usage", "storage.usage"],
      network: ["network.throughput", "bandwidth.usage"],
      connections: ["connection.count", "pool.usage"],
    };

    for (const [resource, metricNames] of Object.entries(resourceMetrics)) {
      for (const metricName of metricNames) {
        const forecast = this.generateCapacityForecast(resource as any, metricName);
        if (forecast) {
          forecasts.push(forecast);
          this.capacityForecasts.set(`${resource}_${metricName}`, forecast);
        }
      }
    }

    this.emit("capacityForecastsGenerated", forecasts);
    return forecasts;
  }

  getPredictionsForMetric(metricName: string): Prediction[] {
    return Array.from(this.predictions.values()).filter((p) => p.metric === metricName);
  }

  getModel(modelId: string): PredictionModel | null {
    return this.models.get(modelId) || null;
  }

  getModelsForMetric(metricName: string): PredictionModel[] {
    return Array.from(this.models.values()).filter((m) => m.targetMetric === metricName);
  }

  private async performPredictiveAnalysis(): Promise<void> {
    try {
      // 更新模型
      await this.updateModels();

      // 生成預測
      const predictions = await this.generatePredictions();

      // 檢測未來警報
      const alerts = await this.detectFutureAlerts();

      // 生成容量預測
      const forecasts = await this.generateCapacityForecasts();

      this.emit("analysisComplete", {
        predictions: predictions.length,
        alerts: alerts.length,
        forecasts: forecasts.length,
        models: this.models.size,
      });
    } catch (error) {
      this.emit("analysisError", error);
    }
  }

  private async updateModels(): Promise<void> {
    const now = Date.now();

    for (const [modelId, model] of this.models.entries()) {
      // 如果模型超過24小時未更新，重新訓練
      if (now - model.lastTrained > 24 * 60 * 60 * 1000) {
        const updatedModel = await this.trainModel(model.targetMetric, model.type);
        if (updatedModel) {
          this.models.set(modelId, updatedModel);
        }
      }
    }

    // 為新的指標創建模型
    for (const metricName of this.metrics.keys()) {
      const existingModels = this.getModelsForMetric(metricName);
      if (existingModels.length === 0) {
        await this.trainModel(metricName, "linear");
      }
    }
  }

  private trainLinearModel(
    modelId: string,
    metricName: string,
    data: PerformanceMetric[]
  ): PredictionModel {
    const x = data.map((_, i) => i);
    const y = data.map((m) => m.value);

    const { slope, intercept, rSquared } = this.linearRegression(x, y);

    return {
      id: modelId,
      name: `線性回歸模型 - ${metricName}`,
      type: "linear",
      targetMetric: metricName,
      accuracy: rSquared,
      confidence: Math.min(1, rSquared * 1.2),
      trainedOn: data.length,
      lastTrained: Date.now(),
      parameters: { slope, intercept },
      validationScore: this.validateModel("linear", data, { slope, intercept }),
    };
  }

  private trainPolynomialModel(
    modelId: string,
    metricName: string,
    data: PerformanceMetric[]
  ): PredictionModel {
    const x = data.map((_, i) => i);
    const y = data.map((m) => m.value);

    // 二次多項式回歸
    const { a, b, c, rSquared } = this.polynomialRegression(x, y, 2);

    return {
      id: modelId,
      name: `多項式回歸模型 - ${metricName}`,
      type: "polynomial",
      targetMetric: metricName,
      accuracy: rSquared,
      confidence: Math.min(1, rSquared * 1.1),
      trainedOn: data.length,
      lastTrained: Date.now(),
      parameters: { a, b, c },
      validationScore: this.validateModel("polynomial", data, { a, b, c }),
    };
  }

  private trainExponentialModel(
    modelId: string,
    metricName: string,
    data: PerformanceMetric[]
  ): PredictionModel {
    const x = data.map((_, i) => i);
    const y = data.map((m) => Math.log(Math.max(0.001, m.value))); // 避免log(0)

    const { slope, intercept, rSquared } = this.linearRegression(x, y);

    return {
      id: modelId,
      name: `指數回歸模型 - ${metricName}`,
      type: "exponential",
      targetMetric: metricName,
      accuracy: rSquared,
      confidence: Math.min(1, rSquared),
      trainedOn: data.length,
      lastTrained: Date.now(),
      parameters: { a: Math.exp(intercept), b: slope },
      validationScore: this.validateModel("exponential", data, {
        a: Math.exp(intercept),
        b: slope,
      }),
    };
  }

  private trainSeasonalModel(
    modelId: string,
    metricName: string,
    data: PerformanceMetric[]
  ): PredictionModel {
    // 簡化的季節性模型，基於小時模式
    const hourlyStats: Record<number, number[]> = {};

    for (const metric of data) {
      const hour = new Date(metric.timestamp).getHours();
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = [];
      }
      hourlyStats[hour].push(metric.value);
    }

    const hourlyAverages: Record<number, number> = {};
    for (const [hour, values] of Object.entries(hourlyStats)) {
      hourlyAverages[parseInt(hour)] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    const overallAverage =
      Object.values(hourlyAverages).reduce((sum, val) => sum + val, 0) /
      Object.values(hourlyAverages).length;
    const variance =
      Object.values(hourlyAverages).reduce(
        (sum, val) => sum + Math.pow(val - overallAverage, 2),
        0
      ) / Object.values(hourlyAverages).length;

    return {
      id: modelId,
      name: `季節性模型 - ${metricName}`,
      type: "seasonal",
      targetMetric: metricName,
      accuracy: Math.min(1, variance / overallAverage),
      confidence: 0.7,
      trainedOn: data.length,
      lastTrained: Date.now(),
      parameters: { ...hourlyAverages, baseline: overallAverage },
      validationScore: 0.7,
    };
  }

  private trainHybridModel(
    modelId: string,
    metricName: string,
    data: PerformanceMetric[]
  ): PredictionModel {
    // 結合線性趨勢和季節性的混合模型
    const linearModel = this.trainLinearModel(`${modelId}_linear`, metricName, data);
    const seasonalModel = this.trainSeasonalModel(`${modelId}_seasonal`, metricName, data);

    const combinedAccuracy = (linearModel.accuracy + seasonalModel.accuracy) / 2;

    return {
      id: modelId,
      name: `混合模型 - ${metricName}`,
      type: "hybrid",
      targetMetric: metricName,
      accuracy: combinedAccuracy,
      confidence: Math.min(1, combinedAccuracy * 1.1),
      trainedOn: data.length,
      lastTrained: Date.now(),
      parameters: {
        ...linearModel.parameters,
        ...seasonalModel.parameters,
        linear_weight: 0.6,
        seasonal_weight: 0.4,
      },
      validationScore: (linearModel.validationScore + seasonalModel.validationScore) / 2,
    };
  }

  private async generatePrediction(
    model: PredictionModel,
    targetTime: number
  ): Promise<Prediction | null> {
    const metricData = this.metrics.get(model.targetMetric);
    if (!metricData) return null;

    const currentTime = Date.now();
    const timeStepsAhead = Math.floor((targetTime - currentTime) / 60000); // 分鐘為單位

    let predictedValue: number;
    let confidence = model.confidence;

    switch (model.type) {
      case "linear":
        predictedValue = model.parameters.slope * timeStepsAhead + model.parameters.intercept;
        break;
      case "polynomial":
        predictedValue =
          model.parameters.a * Math.pow(timeStepsAhead, 2) +
          model.parameters.b * timeStepsAhead +
          model.parameters.c;
        break;
      case "exponential":
        predictedValue = model.parameters.a * Math.exp(model.parameters.b * timeStepsAhead);
        break;
      case "seasonal": {
        const targetHour = new Date(targetTime).getHours();
        predictedValue = model.parameters[targetHour] || model.parameters.baseline;
        break;
      }
      case "hybrid": {
        const linearPred = model.parameters.slope * timeStepsAhead + model.parameters.intercept;
        const targetHourHybrid = new Date(targetTime).getHours();
        const seasonalPred = model.parameters[targetHourHybrid] || model.parameters.baseline;
        predictedValue =
          linearPred * model.parameters.linear_weight +
          seasonalPred * model.parameters.seasonal_weight;
        break;
      }
      default:
        return null;
    }

    // 置信度隨時間衰減
    const timeDecay = Math.exp(-timeStepsAhead / 1440); // 24小時衰減
    confidence *= timeDecay;

    // 計算預測範圍
    const errorMargin = predictedValue * (1 - confidence) * 2;
    const range = {
      min: Math.max(0, predictedValue - errorMargin),
      max: predictedValue + errorMargin,
    };

    // 分析影響因素
    const factors = this.analyzePredictionFactors(model.targetMetric, predictedValue);

    return {
      id: `pred_${model.id}_${targetTime}`,
      model: model.id,
      metric: model.targetMetric,
      timestamp: targetTime,
      predictedValue,
      confidence,
      range,
      factors,
      generatedAt: currentTime,
    };
  }

  private analyzePredictionFactors(
    metricName: string,
    predictedValue: number
  ): Array<{
    name: string;
    impact: number;
    description: string;
  }> {
    const factors: Array<{ name: string; impact: number; description: string }> = [];

    // 基於趨勢分析影響因素
    const trend = this.trends.get(metricName);
    if (trend) {
      factors.push({
        name: "當前趨勢",
        impact:
          trend.direction === "increasing" ? 0.5 : trend.direction === "decreasing" ? -0.5 : 0,
        description: `指標呈現${trend.direction === "increasing" ? "上升" : trend.direction === "decreasing" ? "下降" : "穩定"}趨勢`,
      });
    }

    // 基於模式分析影響因素
    for (const pattern of this.patterns.values()) {
      if (pattern.metrics.includes(metricName)) {
        let impact = 0;

        if (pattern.type === "temporal" && pattern.characteristics.peak_hours) {
          const currentHour = new Date().getHours();
          const isPeakHour = pattern.characteristics.peak_hours.includes(currentHour);
          impact = isPeakHour ? 0.3 : -0.2;
        }

        factors.push({
          name: pattern.name,
          impact,
          description: pattern.description,
        });
      }
    }

    // 季節性因素
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) {
      factors.push({
        name: "工作時間",
        impact: 0.2,
        description: "工作時間通常有較高的系統使用率",
      });
    } else if (hour >= 22 || hour <= 6) {
      factors.push({
        name: "夜間時段",
        impact: -0.3,
        description: "夜間時段通常系統使用率較低",
      });
    }

    return factors;
  }

  private analyzeThresholdBreaches(prediction: Prediction): AlertPrediction[] {
    const alerts: AlertPrediction[] = [];

    // 基於常見閾值檢測
    const thresholds = {
      "system.cpu.usage": { warning: 70, critical: 90 },
      "system.memory.usage": { warning: 80, critical: 95 },
      "tool.execution.time": { warning: 5000, critical: 10000 },
      "error.rate": { warning: 5, critical: 10 },
    };

    const threshold = thresholds[prediction.metric as keyof typeof thresholds];
    if (!threshold) return alerts;

    if (prediction.predictedValue > threshold.critical) {
      alerts.push({
        id: `alert_critical_${prediction.id}`,
        type: "threshold_breach",
        severity: "critical",
        metric: prediction.metric,
        predictedTime: prediction.timestamp,
        confidence: prediction.confidence,
        description: `預測${prediction.metric}將超過關鍵閾值(${threshold.critical})`,
        recommendations: ["立即檢查系統狀態", "準備擴展資源", "啟動應急預案"],
        preventionActions: [
          {
            action: "增加系統容量",
            urgency: "high",
            effort: "high",
            impact: "防止系統過載",
          },
        ],
      });
    } else if (prediction.predictedValue > threshold.warning) {
      alerts.push({
        id: `alert_warning_${prediction.id}`,
        type: "threshold_breach",
        severity: "medium",
        metric: prediction.metric,
        predictedTime: prediction.timestamp,
        confidence: prediction.confidence,
        description: `預測${prediction.metric}將超過警告閾值(${threshold.warning})`,
        recommendations: ["監控系統狀態", "計劃資源擴展", "檢查性能優化機會"],
        preventionActions: [
          {
            action: "預防性優化",
            urgency: "medium",
            effort: "medium",
            impact: "避免達到關鍵閾值",
          },
        ],
      });
    }

    return alerts;
  }

  private analyzeTrendAlerts(trend: TrendData): AlertPrediction[] {
    const alerts: AlertPrediction[] = [];

    if (trend.severity === "critical" && trend.direction !== "stable") {
      alerts.push({
        id: `trend_alert_${trend.metric}_${Date.now()}`,
        type: "performance_degradation",
        severity: "high",
        metric: trend.metric,
        predictedTime: Date.now() + trend.duration,
        confidence: trend.confidence,
        description: `${trend.metric}的${trend.direction === "increasing" ? "上升" : "下降"}趨勢可能導致性能問題`,
        recommendations: ["分析趨勢根本原因", "實施預防措施", "調整監控閾值"],
        preventionActions: [
          {
            action: "趨勢干預",
            urgency: "high",
            effort: "medium",
            impact: "阻止趨勢惡化",
          },
        ],
      });
    }

    return alerts;
  }

  private analyzeCapacityAlerts(): AlertPrediction[] {
    const alerts: AlertPrediction[] = [];

    for (const forecast of this.capacityForecasts.values()) {
      if (
        forecast.projectedExhaustion &&
        forecast.projectedExhaustion < Date.now() + 24 * 60 * 60 * 1000
      ) {
        alerts.push({
          id: `capacity_alert_${forecast.component}_${forecast.resource}`,
          type: "resource_exhaustion",
          severity: "critical",
          metric: `${forecast.component}.${forecast.resource}`,
          predictedTime: forecast.projectedExhaustion,
          confidence: 0.8,
          description: `${forecast.component}的${forecast.resource}資源預計將在24小時內耗盡`,
          recommendations: ["立即擴展資源", "實施資源限制", "優化資源使用"],
          preventionActions: [
            {
              action: "緊急擴容",
              urgency: "high",
              effort: "high",
              impact: "避免資源耗盡",
            },
          ],
        });
      }
    }

    return alerts;
  }

  private generateCapacityForecast(
    resource: CapacityForecast["resource"],
    metricName: string
  ): CapacityForecast | null {
    const metricData = this.metrics.get(metricName);
    if (!metricData || metricData.length < 10) return null;

    const currentValue = metricData[metricData.length - 1].value;
    const component = metricName.split(".")[0];

    // 計算使用率變化趨勢
    const trend = this.trends.get(metricName);
    const utilizationRate = trend ? trend.changeRate / 100 : 0; // 每時間單位的變化率

    // 假設容量（實際實現中應該從配置或監控中獲取）
    const assumedCapacity = this.getAssumedCapacity(resource, currentValue);

    // 預測未來使用情況
    const projectedUsage: Array<{ timestamp: number; usage: number; confidence: number }> = [];
    const now = Date.now();

    for (let i = 1; i <= 24; i++) {
      // 預測未來24小時
      const timestamp = now + i * 60 * 60 * 1000;
      const usage = Math.max(0, currentValue + utilizationRate * i);
      const confidence = Math.max(0.1, 1 - i * 0.02); // 置信度隨時間衰減

      projectedUsage.push({ timestamp, usage, confidence });
    }

    // 計算預計耗盡時間
    let projectedExhaustion: number | null = null;
    if (utilizationRate > 0) {
      const hoursToExhaustion = (assumedCapacity - currentValue) / utilizationRate;
      if (hoursToExhaustion > 0 && hoursToExhaustion < 168) {
        // 1週內
        projectedExhaustion = now + hoursToExhaustion * 60 * 60 * 1000;
      }
    }

    // 決定建議行動
    let recommendedAction: CapacityForecast["recommendedAction"] = "monitor";
    if (projectedExhaustion && projectedExhaustion < now + 24 * 60 * 60 * 1000) {
      recommendedAction = "immediate_scaling";
    } else if (projectedExhaustion && projectedExhaustion < now + 72 * 60 * 60 * 1000) {
      recommendedAction = "plan_scaling";
    } else if (currentValue / assumedCapacity > 0.8) {
      recommendedAction = "optimize";
    }

    return {
      component,
      resource,
      currentUsage: currentValue,
      currentCapacity: assumedCapacity,
      utilizationRate,
      projectedExhaustion,
      recommendedAction,
      projectedUsage,
    };
  }

  private getAssumedCapacity(resource: CapacityForecast["resource"], currentUsage: number): number {
    // 簡化的容量估算，實際實現中應該從系統配置獲取
    switch (resource) {
      case "cpu":
        return 100; // CPU 百分比
      case "memory":
        return 100; // 內存百分比
      case "storage":
        return Math.max(currentUsage * 2, 1000); // GB
      case "network":
        return Math.max(currentUsage * 2, 1000); // Mbps
      case "connections":
        return Math.max(currentUsage * 2, 1000); // 連接數
      default:
        return currentUsage * 2;
    }
  }

  // 數學輔助方法
  private linearRegression(
    x: number[],
    y: number[]
  ): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (y[i] - meanY);
      denominator += Math.pow(x[i] - meanX, 2);
    }

    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = meanY - slope * meanX;

    // 計算 R²
    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < n; i++) {
      const predicted = slope * x[i] + intercept;
      ssRes += Math.pow(y[i] - predicted, 2);
      ssTot += Math.pow(y[i] - meanY, 2);
    }

    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, intercept, rSquared: Math.max(0, rSquared) };
  }

  private polynomialRegression(
    x: number[],
    y: number[],
    degree: number
  ): { a: number; b: number; c: number; rSquared: number } {
    // 簡化的二次多項式回歸
    const n = x.length;

    // 構建設計矩陣 [1, x, x²]
    const X: number[][] = [];
    for (let i = 0; i < n; i++) {
      X.push([1, x[i], Math.pow(x[i], degree)]);
    }

    // 使用正規方程求解：(X'X)⁻¹X'y
    // 簡化實現，假設degree=2
    // 注意：這是簡化版本，未使用所有計算的統計量

    // 求解線性方程組（簡化版本）
    const a = 0; // 簡化，實際需要矩陣運算
    const b = this.linearRegression(x, y).slope;
    const c = this.linearRegression(x, y).intercept;

    // 計算 R²
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;
    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < n; i++) {
      const predicted = a * Math.pow(x[i], 2) + b * x[i] + c;
      ssRes += Math.pow(y[i] - predicted, 2);
      ssTot += Math.pow(y[i] - meanY, 2);
    }

    const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

    return { a, b, c, rSquared };
  }

  private validateModel(
    type: string,
    data: PerformanceMetric[],
    parameters: Record<string, number>
  ): number {
    // 使用後20%的數據作為驗證集
    const splitIndex = Math.floor(data.length * 0.8);
    const validationData = data.slice(splitIndex);

    if (validationData.length === 0) return 0;

    let totalError = 0;

    for (let i = 0; i < validationData.length; i++) {
      const actualValue = validationData[i].value;
      let predictedValue: number;

      switch (type) {
        case "linear":
          predictedValue = parameters.slope * (splitIndex + i) + parameters.intercept;
          break;
        case "polynomial":
          predictedValue =
            parameters.a * Math.pow(splitIndex + i, 2) +
            parameters.b * (splitIndex + i) +
            parameters.c;
          break;
        case "exponential":
          predictedValue = parameters.a * Math.exp(parameters.b * (splitIndex + i));
          break;
        default:
          predictedValue = actualValue;
      }

      const error = Math.abs(actualValue - predictedValue) / Math.max(actualValue, 1);
      totalError += error;
    }

    const avgError = totalError / validationData.length;
    return Math.max(0, 1 - avgError); // 轉換為準確度分數
  }
}
