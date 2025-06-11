/**
 * 相關性重排序器 - 基於多種因素重新排序搜索結果
 */

import type { SearchResult, SearchContext, AggregationConfig } from "../types";

export class RelevanceRanker {
  constructor(private config: AggregationConfig) {}

  /**
   * 重新排序結果
   */
  async rerankResults(results: SearchResult[], context: SearchContext): Promise<SearchResult[]> {
    if (results.length === 0) {
      return results;
    }

    // 計算相關性分數
    const scoredResults = results.map((result) => ({
      ...result,
      relevanceScore: this.calculateRelevanceScore(result, context),
    }));

    // 按相關性分數排序
    scoredResults.sort((a, b) => {
      const scoreA = this.combineScores(a.score, a.relevanceScore || 0);
      const scoreB = this.combineScores(b.score, b.relevanceScore || 0);
      return scoreB - scoreA;
    });

    return scoredResults;
  }

  /**
   * 計算相關性分數
   */
  private calculateRelevanceScore(result: SearchResult, context: SearchContext): number {
    let relevanceScore = 0;

    // 1. 查詢匹配度
    const queryMatchScore = this.calculateQueryMatchScore(result, context.query);
    relevanceScore += queryMatchScore * 0.4;

    // 2. 顯著詞匹配度
    if (context.salientTerms && context.salientTerms.length > 0) {
      const salientTermsScore = this.calculateSalientTermsScore(result, context.salientTerms);
      relevanceScore += salientTermsScore * 0.3;
    }

    // 3. 文檔新鮮度
    const freshnessScore = this.calculateFreshnessScore(result);
    relevanceScore += freshnessScore * 0.1;

    // 4. 文檔長度和質量
    const qualityScore = this.calculateQualityScore(result);
    relevanceScore += qualityScore * 0.1;

    // 5. 策略權重
    const strategyScore = this.getStrategyWeight(result.strategy);
    relevanceScore += strategyScore * 0.1;

    return Math.min(1.0, Math.max(0.0, relevanceScore));
  }

  /**
   * 計算查詢匹配分數
   */
  private calculateQueryMatchScore(result: SearchResult, query: string): number {
    const content = result.document.pageContent.toLowerCase();
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2);

    if (queryTerms.length === 0) return 0;

    let matchCount = 0;
    let exactMatchCount = 0;

    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchCount++;

        // 檢查精確匹配（整個詞）
        const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, "i");
        if (wordBoundaryRegex.test(content)) {
          exactMatchCount++;
        }
      }
    }

    const matchRatio = matchCount / queryTerms.length;
    const exactMatchRatio = exactMatchCount / queryTerms.length;

    // 精確匹配權重更高
    return matchRatio * 0.6 + exactMatchRatio * 0.4;
  }

  /**
   * 計算顯著詞匹配分數
   */
  private calculateSalientTermsScore(result: SearchResult, salientTerms: string[]): number {
    const content = result.document.pageContent.toLowerCase();
    let matchCount = 0;

    for (const term of salientTerms) {
      if (content.includes(term.toLowerCase())) {
        matchCount++;
      }
    }

    return matchCount / salientTerms.length;
  }

  /**
   * 計算文檔新鮮度分數
   */
  private calculateFreshnessScore(result: SearchResult): number {
    const now = Date.now();
    const docTime =
      result.document.metadata.lastModified || result.document.metadata.createdTime || now;

    // 計算天數差異
    const daysDiff = (now - docTime) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 1) return 1.0; // 1天內
    if (daysDiff <= 7) return 0.8; // 1週內
    if (daysDiff <= 30) return 0.6; // 1個月內
    if (daysDiff <= 90) return 0.4; // 3個月內
    if (daysDiff <= 365) return 0.2; // 1年內
    return 0.1; // 超過1年
  }

  /**
   * 計算文檔質量分數
   */
  private calculateQualityScore(result: SearchResult): number {
    const content = result.document.pageContent;
    let qualityScore = 0.5; // 基礎分數

    // 1. 內容長度評分
    const length = content.length;
    if (length > 100 && length < 5000) {
      qualityScore += 0.2; // 適中長度
    } else if (length >= 5000) {
      qualityScore += 0.1; // 較長內容
    }

    // 2. 內容結構評分
    const hasHeaders = /#{1,6}\s/.test(content);
    const hasList = /[-*+]\s/.test(content) || /\d+\.\s/.test(content);
    const hasFormatting = /\*\*.*\*\*|\*.*\*|`.*`/.test(content);

    if (hasHeaders) qualityScore += 0.1;
    if (hasList) qualityScore += 0.1;
    if (hasFormatting) qualityScore += 0.1;

    // 3. 詞彙多樣性
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const diversityRatio = uniqueWords.size / words.length;

    if (diversityRatio > 0.6) {
      qualityScore += 0.2;
    } else if (diversityRatio > 0.4) {
      qualityScore += 0.1;
    }

    return Math.min(1.0, qualityScore);
  }

  /**
   * 獲取策略權重
   */
  private getStrategyWeight(strategy: string): number {
    const weights = this.config.scoringWeights || {};
    return weights[strategy] || 0.5;
  }

  /**
   * 組合原始分數和相關性分數
   */
  private combineScores(originalScore: number, relevanceScore: number): number {
    // 加權平均：原始分數權重60%，相關性分數權重40%
    return originalScore * 0.6 + relevanceScore * 0.4;
  }

  /**
   * 多樣性重排序
   */
  async diversityRerank(
    results: SearchResult[],
    diversityWeight: number = 0.3
  ): Promise<SearchResult[]> {
    if (results.length <= 1) return results;

    const rerankedResults: SearchResult[] = [];
    const remaining = [...results];

    // 選擇第一個最高分的結果
    const firstResult = remaining.splice(0, 1)[0];
    rerankedResults.push(firstResult);

    // 依次選擇與已選結果最不相似的結果
    while (remaining.length > 0) {
      let maxDiversityScore = -1;
      let bestIndex = 0;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // 計算與已選結果的平均相似度
        const avgSimilarity = this.calculateAverageSimilarity(candidate, rerankedResults);

        // 多樣性分數 = 原始分數 * (1 - diversityWeight) + (1 - 相似度) * diversityWeight
        const diversityScore =
          candidate.score * (1 - diversityWeight) + (1 - avgSimilarity) * diversityWeight;

        if (diversityScore > maxDiversityScore) {
          maxDiversityScore = diversityScore;
          bestIndex = i;
        }
      }

      rerankedResults.push(remaining.splice(bestIndex, 1)[0]);
    }

    return rerankedResults;
  }

  /**
   * 計算與已選結果的平均相似度
   */
  private calculateAverageSimilarity(
    candidate: SearchResult,
    selectedResults: SearchResult[]
  ): number {
    if (selectedResults.length === 0) return 0;

    let totalSimilarity = 0;
    for (const selected of selectedResults) {
      totalSimilarity += this.calculateContentSimilarity(
        candidate.document.pageContent,
        selected.document.pageContent
      );
    }

    return totalSimilarity / selectedResults.length;
  }

  /**
   * 計算內容相似度
   */
  private calculateContentSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 更新配置
   */
  updateConfig(config: AggregationConfig): void {
    this.config = config;
  }
}
