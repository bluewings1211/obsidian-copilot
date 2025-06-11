/**
 * 分數標準化器 - 處理來自不同策略的分數標準化
 */

import type { SearchResult, AggregationConfig, ScoreNormalizationResult } from "../types";

export class ScoreNormalizer {
  constructor(private config: AggregationConfig) {}

  /**
   * 標準化分數
   */
  async normalizeScores(results: SearchResult[]): Promise<ScoreNormalizationResult> {
    if (results.length === 0) {
      return {
        normalizedResults: [],
        normalizationMethod: "none",
        originalScoreRange: { min: 0, max: 0 },
        normalizedScoreRange: { min: 0, max: 1 },
      };
    }

    const normalizedResults = [...results];
    const scores = results.map((r) => r.score);
    const originalMin = Math.min(...scores);
    const originalMax = Math.max(...scores);

    // 選擇標準化方法
    const method = this.selectNormalizationMethod(scores);

    switch (method) {
      case "minmax":
        this.applyMinMaxNormalization(normalizedResults, originalMin, originalMax);
        break;
      case "zscore":
        this.applyZScoreNormalization(normalizedResults, scores);
        break;
      case "softmax":
        this.applySoftmaxNormalization(normalizedResults);
        break;
      default:
        // 不標準化
        break;
    }

    const normalizedScores = normalizedResults.map((r) => r.score);

    return {
      normalizedResults,
      normalizationMethod: method,
      originalScoreRange: { min: originalMin, max: originalMax },
      normalizedScoreRange: {
        min: Math.min(...normalizedScores),
        max: Math.max(...normalizedScores),
      },
    };
  }

  /**
   * 選擇標準化方法
   */
  private selectNormalizationMethod(scores: number[]): string {
    const range = Math.max(...scores) - Math.min(...scores);
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

    // 根據分數分佈選擇最適合的標準化方法
    if (range > 10) {
      return "minmax"; // 範圍很大時使用 min-max
    } else if (variance > 1) {
      return "zscore"; // 方差較大時使用 z-score
    } else if (scores.length > 10) {
      return "softmax"; // 結果較多時使用 softmax
    }

    return "none";
  }

  /**
   * Min-Max 標準化
   */
  private applyMinMaxNormalization(results: SearchResult[], min: number, max: number): void {
    const range = max - min;
    if (range === 0) return;

    results.forEach((result) => {
      result.score = (result.score - min) / range;
      result.metadata.originalScore = result.score;
    });
  }

  /**
   * Z-Score 標準化
   */
  private applyZScoreNormalization(results: SearchResult[], scores: number[]): void {
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const stdDev = Math.sqrt(
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
    );

    if (stdDev === 0) return;

    results.forEach((result) => {
      const originalScore = result.score;
      result.score = (result.score - mean) / stdDev;
      // 轉換為 0-1 範圍
      result.score = 1 / (1 + Math.exp(-result.score));
      result.metadata.originalScore = originalScore;
    });
  }

  /**
   * Softmax 標準化
   */
  private applySoftmaxNormalization(results: SearchResult[]): void {
    const scores = results.map((r) => r.score);
    const maxScore = Math.max(...scores);

    // 防止數值溢出
    const expScores = scores.map((s) => Math.exp(s - maxScore));
    const sumExpScores = expScores.reduce((sum, s) => sum + s, 0);

    results.forEach((result, index) => {
      const originalScore = result.score;
      result.score = expScores[index] / sumExpScores;
      result.metadata.originalScore = originalScore;
    });
  }

  /**
   * 更新配置
   */
  updateConfig(config: AggregationConfig): void {
    this.config = config;
  }
}
