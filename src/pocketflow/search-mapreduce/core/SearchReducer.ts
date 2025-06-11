/**
 * 搜索結果歸約器 - 負責聚合和初步處理搜索結果
 */

import { AggregationConfig, SearchResult, SearchTaskResult } from "../types";

export class SearchReducer {
  constructor(private config: AggregationConfig) {}

  /**
   * 聚合搜索任務結果
   */
  async aggregateResults(taskResults: SearchTaskResult[]): Promise<SearchResult[]> {
    // 過濾成功的任務結果
    const successfulResults = taskResults.filter((result) => result.success);

    if (successfulResults.length === 0) {
      return [];
    }

    // 合併所有搜索結果
    const allResults: SearchResult[] = [];

    for (const taskResult of successfulResults) {
      const enhancedResults = taskResult.results.map((result) => ({
        ...result,
        metadata: {
          ...result.metadata,
          taskId: taskResult.taskId,
          taskExecutionTime: taskResult.executionTime,
          ...taskResult.metadata,
        },
      }));

      allResults.push(...enhancedResults);
    }

    // 按策略權重調整分數
    const weightedResults = this.applyStrategyWeights(allResults);

    // 初步排序（後續會在 aggregator 中進行更精細的處理）
    const sortedResults = this.sortResults(weightedResults);

    // 限制結果數量
    return sortedResults.slice(0, this.config.maxResults);
  }

  /**
   * 應用策略權重調整分數
   */
  private applyStrategyWeights(results: SearchResult[]): SearchResult[] {
    return results.map((result) => {
      const strategyWeight = this.config.scoringWeights[result.strategy] || 1.0;

      return {
        ...result,
        score: result.score * strategyWeight,
        metadata: {
          ...result.metadata,
          originalScore: result.score,
          strategyWeight,
          weightAdjusted: true,
        },
      };
    });
  }

  /**
   * 對結果進行初步排序
   */
  private sortResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // 主要按分數排序
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // 分數相同時，按相關性分數排序
      if (b.relevanceScore !== undefined && a.relevanceScore !== undefined) {
        return b.relevanceScore - a.relevanceScore;
      }

      // 最後按策略優先級排序
      const strategyOrder = ["hybrid", "vector", "keyword", "rerank"];
      const aIndex = strategyOrder.indexOf(a.strategy);
      const bIndex = strategyOrder.indexOf(b.strategy);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      return 0;
    });
  }

  /**
   * 合併相似結果
   */
  async mergeSimilarResults(results: SearchResult[]): Promise<SearchResult[]> {
    const merged: SearchResult[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      if (processed.has(i)) continue;

      const current = results[i];
      const similar: SearchResult[] = [current];

      // 尋找相似的結果
      for (let j = i + 1; j < results.length; j++) {
        if (processed.has(j)) continue;

        const other = results[j];
        if (this.areSimilar(current, other)) {
          similar.push(other);
          processed.add(j);
        }
      }

      // 如果有相似結果，進行合併
      if (similar.length > 1) {
        const mergedResult = this.mergeResults(similar);
        merged.push(mergedResult);
      } else {
        merged.push(current);
      }

      processed.add(i);
    }

    return merged;
  }

  /**
   * 檢查兩個結果是否相似
   */
  private areSimilar(a: SearchResult, b: SearchResult): boolean {
    // 檢查文檔內容相似性
    const contentSimilarity = this.calculateContentSimilarity(
      a.document.pageContent,
      b.document.pageContent
    );

    if (contentSimilarity > this.config.deduplicationThreshold) {
      return true;
    }

    // 檢查元數據相似性
    if (a.document.metadata.path === b.document.metadata.path) {
      return true;
    }

    // 檢查標題相似性
    if (a.document.metadata.title && b.document.metadata.title) {
      const titleSimilarity = this.calculateStringSimilarity(
        a.document.metadata.title,
        b.document.metadata.title
      );
      if (titleSimilarity > 0.8) {
        return true;
      }
    }

    return false;
  }

  /**
   * 計算內容相似性
   */
  private calculateContentSimilarity(content1: string, content2: string): number {
    // 簡單的 Jaccard 相似性計算
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((word) => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 計算字符串相似性
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    // 使用編輯距離計算相似性
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLength = Math.max(str1.length, str2.length);

    return maxLength === 0 ? 1 : 1 - distance / maxLength;
  }

  /**
   * 計算編輯距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 合併相似結果
   */
  private mergeResults(results: SearchResult[]): SearchResult {
    // 選擇分數最高的作為基礎
    const bestResult = results.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    // 計算合併後的分數（加權平均）
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const averageScore = totalScore / results.length;

    // 合併策略列表
    const strategies = [...new Set(results.map((r) => r.strategy))];

    // 合併元數據
    const mergedMetadata = {
      ...bestResult.metadata,
      mergedFrom: results.map((r) => r.strategy),
      mergedScores: results.map((r) => r.score),
      averageScore,
      resultCount: results.length,
    };

    return {
      ...bestResult,
      score: Math.max(averageScore, bestResult.score), // 使用較高的分數
      strategy: strategies.join("+"),
      metadata: mergedMetadata,
    };
  }

  /**
   * 分析結果分佈
   */
  analyzeResultDistribution(results: SearchResult[]): {
    strategyCounts: Record<string, number>;
    scoreDistribution: {
      min: number;
      max: number;
      average: number;
      median: number;
    };
    qualityMetrics: {
      diversityScore: number;
      coverageScore: number;
    };
  } {
    const strategyCounts: Record<string, number> = {};
    const scores = results.map((r) => r.score);

    // 統計策略分佈
    results.forEach((result) => {
      strategyCounts[result.strategy] = (strategyCounts[result.strategy] || 0) + 1;
    });

    // 計算分數分佈
    const sortedScores = [...scores].sort((a, b) => a - b);
    const scoreDistribution = {
      min: Math.min(...scores),
      max: Math.max(...scores),
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      median: sortedScores[Math.floor(sortedScores.length / 2)],
    };

    // 計算質量指標
    const uniqueStrategies = Object.keys(strategyCounts).length;
    const maxPossibleStrategies = this.getMaxPossibleStrategies();
    const diversityScore = uniqueStrategies / maxPossibleStrategies;

    const uniquePaths = new Set(results.map((r) => r.document.metadata.path)).size;
    const coverageScore = uniquePaths / results.length;

    return {
      strategyCounts,
      scoreDistribution,
      qualityMetrics: {
        diversityScore,
        coverageScore,
      },
    };
  }

  /**
   * 獲取最大可能的策略數量
   */
  private getMaxPossibleStrategies(): number {
    // 返回預期的策略類型數量
    return Object.keys(this.config.scoringWeights).length || 4;
  }

  /**
   * 過濾低質量結果
   */
  filterLowQualityResults(results: SearchResult[]): SearchResult[] {
    const scoreThreshold = this.calculateDynamicThreshold(results);

    return results.filter((result) => {
      // 分數過濾
      if (result.score < scoreThreshold) {
        return false;
      }

      // 內容長度過濾
      if (result.document.pageContent.length < 50) {
        return false;
      }

      // 重複內容過濾
      const duplicateRatio = this.calculateDuplicateContentRatio(result.document.pageContent);
      if (duplicateRatio > 0.8) {
        return false;
      }

      return true;
    });
  }

  /**
   * 計算動態閾值
   */
  private calculateDynamicThreshold(results: SearchResult[]): number {
    if (results.length === 0) return 0;

    const scores = results.map((r) => r.score);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const stdDev = Math.sqrt(
      scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / scores.length
    );

    // 使用平均值減去一個標準差作為閾值
    return Math.max(0, average - stdDev);
  }

  /**
   * 計算重複內容比例
   */
  private calculateDuplicateContentRatio(content: string): number {
    const words = content.split(/\s+/);
    const uniqueWords = new Set(words);

    return 1 - uniqueWords.size / words.length;
  }
}
