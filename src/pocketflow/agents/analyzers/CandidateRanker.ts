import { ToolCandidate, ToolSelectionConfig } from "../ToolSelectionAgent";
import { logInfo, logError } from "@/logger";

/**
 * 排序策略介面
 */
export interface RankingStrategy {
  name: string;
  description: string;
  rank(candidates: ToolCandidate[]): ToolCandidate[];
}

/**
 * 排序結果介面
 */
export interface RankingResult {
  rankedCandidates: ToolCandidate[];
  strategy: string;
  metadata: {
    originalCount: number;
    finalCount: number;
    averageScore: number;
    averageConfidence: number;
  };
}

/**
 * 候選工具排序器
 *
 * 負責對工具候選項進行智能排序，包括：
 * - 多維度評分排序
 * - 多樣性保證
 * - 信心度過濾
 * - 動態策略選擇
 */
export class CandidateRanker {
  private config: ToolSelectionConfig;
  private strategies: Map<string, RankingStrategy>;

  constructor(config: ToolSelectionConfig) {
    this.config = config;
    this.strategies = new Map();
    this.initializeStrategies();
  }

  /**
   * 初始化排序策略
   */
  private initializeStrategies(): void {
    this.strategies.set("weighted_score", new WeightedScoreStrategy());
    this.strategies.set("confidence_first", new ConfidenceFirstStrategy());
    this.strategies.set("balanced", new BalancedStrategy());
    this.strategies.set("diversity", new DiversityStrategy());
    this.strategies.set("adaptive", new AdaptiveStrategy());
  }

  /**
   * 對候選工具進行排序
   */
  rankCandidates(candidates: ToolCandidate[]): ToolCandidate[] {
    try {
      logInfo(`開始排序 ${candidates.length} 個候選工具`);

      // 1. 基本過濾
      const filteredCandidates = this.filterCandidates(candidates);

      // 2. 選擇排序策略
      const strategy = this.selectStrategy(filteredCandidates);

      // 3. 執行排序
      const rankedCandidates = strategy.rank(filteredCandidates);

      // 4. 後處理
      const finalCandidates = this.postProcess(rankedCandidates);

      logInfo(`排序完成，策略: ${strategy.name}，最終候選數: ${finalCandidates.length}`);
      return finalCandidates;
    } catch (error) {
      logError("候選工具排序失敗:", error);
      return candidates; // 返回原始順序
    }
  }

  /**
   * 過濾候選工具
   */
  private filterCandidates(candidates: ToolCandidate[]): ToolCandidate[] {
    return candidates.filter((candidate) => {
      // 1. 信心度過濾
      if (candidate.confidence < this.config.minConfidenceThreshold) {
        return false;
      }

      // 2. 分數過濾
      if (candidate.score <= 0) {
        return false;
      }

      // 3. 工具有效性檢查
      if (!candidate.tool || !candidate.name) {
        return false;
      }

      return true;
    });
  }

  /**
   * 選擇排序策略
   */
  private selectStrategy(candidates: ToolCandidate[]): RankingStrategy {
    // 根據候選工具的特徵選擇最佳策略
    const candidateCount = candidates.length;
    const avgConfidence = this.calculateAverageConfidence(candidates);
    const scoreVariance = this.calculateScoreVariance(candidates);

    if (candidateCount <= 2) {
      // 候選工具少，使用簡單的加權分數策略
      return this.strategies.get("weighted_score")!;
    } else if (avgConfidence < 0.5) {
      // 整體信心度低，優先考慮信心度
      return this.strategies.get("confidence_first")!;
    } else if (scoreVariance < 0.1) {
      // 分數相近，使用多樣性策略
      return this.strategies.get("diversity")!;
    } else if (candidateCount > 10) {
      // 候選工具多，使用自適應策略
      return this.strategies.get("adaptive")!;
    } else {
      // 默認使用平衡策略
      return this.strategies.get("balanced")!;
    }
  }

  /**
   * 後處理
   */
  private postProcess(candidates: ToolCandidate[]): ToolCandidate[] {
    // 1. 限制數量
    let finalCandidates = candidates.slice(0, this.config.maxCandidates);

    // 2. 確保多樣性
    finalCandidates = this.ensureDiversity(finalCandidates);

    // 3. 重新計算相對分數
    finalCandidates = this.normalizeScores(finalCandidates);

    return finalCandidates;
  }

  /**
   * 確保候選工具的多樣性
   */
  private ensureDiversity(candidates: ToolCandidate[]): ToolCandidate[] {
    const categories = new Set<string>();
    const diverseCandidates: ToolCandidate[] = [];

    // 首先添加不同類別的工具
    for (const candidate of candidates) {
      if (!categories.has(candidate.category)) {
        categories.add(candidate.category);
        diverseCandidates.push(candidate);
      }
    }

    // 然後添加剩餘的高分工具
    const remaining = candidates.filter((c) => !diverseCandidates.includes(c));
    diverseCandidates.push(
      ...remaining.slice(0, this.config.maxCandidates - diverseCandidates.length)
    );

    return diverseCandidates;
  }

  /**
   * 正規化分數
   */
  private normalizeScores(candidates: ToolCandidate[]): ToolCandidate[] {
    if (candidates.length === 0) return candidates;

    const maxScore = Math.max(...candidates.map((c) => c.score));
    const minScore = Math.min(...candidates.map((c) => c.score));
    const scoreRange = maxScore - minScore;

    if (scoreRange === 0) return candidates;

    return candidates.map((candidate) => ({
      ...candidate,
      score: (candidate.score - minScore) / scoreRange,
    }));
  }

  /**
   * 計算平均信心度
   */
  private calculateAverageConfidence(candidates: ToolCandidate[]): number {
    if (candidates.length === 0) return 0;
    const total = candidates.reduce((sum, c) => sum + c.confidence, 0);
    return total / candidates.length;
  }

  /**
   * 計算分數方差
   */
  private calculateScoreVariance(candidates: ToolCandidate[]): number {
    if (candidates.length === 0) return 0;

    const mean = candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length;
    const squaredDiffs = candidates.map((c) => Math.pow(c.score - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / candidates.length;

    return variance;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: ToolSelectionConfig): void {
    this.config = newConfig;
  }

  /**
   * 獲取可用策略
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 使用特定策略排序
   */
  rankWithStrategy(candidates: ToolCandidate[], strategyName: string): ToolCandidate[] {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`未知的排序策略: ${strategyName}`);
    }

    const filteredCandidates = this.filterCandidates(candidates);
    const rankedCandidates = strategy.rank(filteredCandidates);
    return this.postProcess(rankedCandidates);
  }
}

/**
 * 加權分數策略
 */
class WeightedScoreStrategy implements RankingStrategy {
  name = "weighted_score";
  description = "基於加權綜合分數排序";

  rank(candidates: ToolCandidate[]): ToolCandidate[] {
    return candidates.sort((a, b) => b.score - a.score);
  }
}

/**
 * 信心度優先策略
 */
class ConfidenceFirstStrategy implements RankingStrategy {
  name = "confidence_first";
  description = "優先考慮信心度，然後考慮分數";

  rank(candidates: ToolCandidate[]): ToolCandidate[] {
    return candidates.sort((a, b) => {
      // 首先按信心度排序
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }
      // 信心度相近時按分數排序
      return b.score - a.score;
    });
  }
}

/**
 * 平衡策略
 */
class BalancedStrategy implements RankingStrategy {
  name = "balanced";
  description = "平衡考慮分數和信心度";

  rank(candidates: ToolCandidate[]): ToolCandidate[] {
    return candidates.sort((a, b) => {
      // 結合分數和信心度
      const scoreA = a.score * 0.7 + a.confidence * 0.3;
      const scoreB = b.score * 0.7 + b.confidence * 0.3;
      return scoreB - scoreA;
    });
  }
}

/**
 * 多樣性策略
 */
class DiversityStrategy implements RankingStrategy {
  name = "diversity";
  description = "確保候選工具的多樣性";

  rank(candidates: ToolCandidate[]): ToolCandidate[] {
    const result: ToolCandidate[] = [];
    const usedCategories = new Set<string>();
    const remaining = [...candidates].sort((a, b) => b.score - a.score);

    // 第一輪：每個類別選擇最好的工具
    for (const candidate of remaining) {
      if (!usedCategories.has(candidate.category)) {
        result.push(candidate);
        usedCategories.add(candidate.category);
      }
    }

    // 第二輪：按分數添加剩餘工具
    for (const candidate of remaining) {
      if (!result.includes(candidate)) {
        result.push(candidate);
      }
    }

    return result;
  }
}

/**
 * 自適應策略
 */
class AdaptiveStrategy implements RankingStrategy {
  name = "adaptive";
  description = "根據候選工具特徵自適應調整排序";

  rank(candidates: ToolCandidate[]): ToolCandidate[] {
    // 分析候選工具特徵
    const categories = new Set(candidates.map((c) => c.category));
    const avgConfidence = candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;

    return candidates.sort((a, b) => {
      // 動態權重調整
      let scoreWeight = 0.6;
      let confidenceWeight = 0.3;
      let diversityWeight = 0.1;

      // 如果分數差異大，增加分數權重
      if (Math.abs(a.score - b.score) > 0.3) {
        scoreWeight = 0.8;
        confidenceWeight = 0.2;
      }

      // 如果信心度普遍較低，增加信心度權重
      if (avgConfidence < 0.5) {
        confidenceWeight = 0.5;
        scoreWeight = 0.4;
        diversityWeight = 0.1;
      }

      // 如果類別多樣性豐富，增加多樣性權重
      if (categories.size > 3) {
        diversityWeight = 0.2;
        scoreWeight = 0.5;
        confidenceWeight = 0.3;
      }

      // 計算多樣性分數（不同類別的工具得分更高）
      const categoryCountA = candidates.filter((c) => c.category === a.category).length;
      const categoryCountB = candidates.filter((c) => c.category === b.category).length;
      const diversityScoreA = 1 / categoryCountA;
      const diversityScoreB = 1 / categoryCountB;

      // 計算最終分數
      const finalScoreA =
        a.score * scoreWeight + a.confidence * confidenceWeight + diversityScoreA * diversityWeight;

      const finalScoreB =
        b.score * scoreWeight + b.confidence * confidenceWeight + diversityScoreB * diversityWeight;

      return finalScoreB - finalScoreA;
    });
  }
}
