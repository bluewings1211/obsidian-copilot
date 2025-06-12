/**
 * PocketFlow.js Search Aggregation System - Multi-Source Result Merger
 * 多源結果合併器：合併和去重來自不同源的相似結果
 */

import {
  NormalizedSearchResult,
  CoreAggregationConfig,
  DeduplicationInfo,
  SearchSource,
} from "../types";

export interface MergeStrategy {
  id: string;
  name: string;
  description: string;
  merge: (results: NormalizedSearchResult[]) => Promise<NormalizedSearchResult[]>;
}

export interface SimilarityMeasure {
  id: string;
  name: string;
  calculate: (result1: NormalizedSearchResult, result2: NormalizedSearchResult) => number;
}

export interface MergeOptions {
  similarityThreshold: number;
  maxCandidatesPerGroup: number;
  preserveSourceDiversity: boolean;
  weightByQuality: boolean;
}

/**
 * 多源結果合併器
 * 負責識別和合併來自不同搜索源的相似結果
 */
export class MultiSourceResultMerger {
  private mergeStrategies: Map<string, MergeStrategy> = new Map();
  private similarityMeasures: Map<string, SimilarityMeasure> = new Map();
  private defaultMergeOptions: MergeOptions;

  constructor(private config: CoreAggregationConfig) {
    this.defaultMergeOptions = {
      similarityThreshold: 0.8,
      maxCandidatesPerGroup: 5,
      preserveSourceDiversity: true,
      weightByQuality: true,
    };

    this.initializeDefaultStrategies();
    this.initializeSimilarityMeasures();
  }

  /**
   * 合併搜索結果
   */
  async merge(
    results: NormalizedSearchResult[],
    options?: Partial<MergeOptions>
  ): Promise<NormalizedSearchResult[]> {
    if (results.length <= 1) {
      return results;
    }

    const mergeOptions = { ...this.defaultMergeOptions, ...options };

    // 1. 根據相似性分組結果
    const groups = await this.groupSimilarResults(results, mergeOptions);

    // 2. 合併每個組中的結果
    const mergedResults: NormalizedSearchResult[] = [];

    for (const group of groups) {
      if (group.length === 1) {
        // 單個結果，直接添加
        mergedResults.push(group[0]);
      } else {
        // 多個相似結果，進行合併
        const mergedResult = await this.mergeGroup(group, mergeOptions);
        mergedResults.push(mergedResult);
      }
    }

    // 3. 按分數排序
    return this.sortMergedResults(mergedResults);
  }

  /**
   * 根據相似性分組結果
   */
  private async groupSimilarResults(
    results: NormalizedSearchResult[],
    options: MergeOptions
  ): Promise<NormalizedSearchResult[][]> {
    const groups: NormalizedSearchResult[][] = [];
    const processed = new Set<string>();

    for (const result of results) {
      if (processed.has(result.id)) {
        continue;
      }

      const group = [result];
      processed.add(result.id);

      // 尋找相似的結果
      for (const candidate of results) {
        if (processed.has(candidate.id)) {
          continue;
        }

        const similarity = await this.calculateSimilarity(result, candidate);

        if (similarity >= options.similarityThreshold) {
          group.push(candidate);
          processed.add(candidate.id);

          // 限制每組的最大候選數
          if (group.length >= options.maxCandidatesPerGroup) {
            break;
          }
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * 計算兩個結果的相似性
   */
  private async calculateSimilarity(
    result1: NormalizedSearchResult,
    result2: NormalizedSearchResult
  ): Promise<number> {
    const measures = ["content-similarity", "title-similarity", "semantic-similarity"];

    let totalSimilarity = 0;
    let validMeasures = 0;

    for (const measureId of measures) {
      const measure = this.similarityMeasures.get(measureId);
      if (measure) {
        const similarity = measure.calculate(result1, result2);
        totalSimilarity += similarity;
        validMeasures++;
      }
    }

    return validMeasures > 0 ? totalSimilarity / validMeasures : 0;
  }

  /**
   * 合併組中的結果
   */
  private async mergeGroup(
    group: NormalizedSearchResult[],
    options: MergeOptions
  ): Promise<NormalizedSearchResult> {
    // 選擇最佳結果作為基礎
    const baseResult = this.selectBestResult(group, options);

    // 合併所有源
    const allSources = this.mergeSources(group);

    // 合併分數
    const mergedScores = this.mergeScores(group, options);

    // 合併內容（選擇最佳內容或組合）
    const mergedContent = this.mergeContent(group, baseResult);

    // 合併元數據
    const mergedMetadata = this.mergeMetadata(group);

    // 生成去重信息
    const deduplicationInfo = this.generateDeduplicationInfo(group);

    return {
      ...baseResult,
      sources: allSources,
      content: mergedContent.content,
      title: mergedContent.title,
      normalizedScore: mergedScores.normalizedScore,
      originalScores: mergedScores.originalScores,
      relevanceScore: mergedScores.relevanceScore,
      qualityScore: mergedScores.qualityScore,
      personalizedScore: mergedScores.personalizedScore,
      metadata: {
        ...mergedMetadata,
        merged: true,
        originalCount: group.length,
        mergedAt: Date.now(),
      },
      aggregationInfo: {
        ...baseResult.aggregationInfo,
        totalSources: allSources.length,
        deduplicationInfo,
      },
    };
  }

  /**
   * 選擇最佳結果作為基礎
   */
  private selectBestResult(
    group: NormalizedSearchResult[],
    options: MergeOptions
  ): NormalizedSearchResult {
    if (options.weightByQuality) {
      // 基於質量分數選擇
      return group.reduce((best, current) =>
        current.qualityScore > best.qualityScore ? current : best
      );
    } else {
      // 基於標準化分數選擇
      return group.reduce((best, current) =>
        current.normalizedScore > best.normalizedScore ? current : best
      );
    }
  }

  /**
   * 合併源信息
   */
  private mergeSources(group: NormalizedSearchResult[]): SearchSource[] {
    const sourceMap = new Map<string, SearchSource>();

    for (const result of group) {
      for (const source of result.sources) {
        if (!sourceMap.has(source.id)) {
          sourceMap.set(source.id, source);
        }
      }
    }

    return Array.from(sourceMap.values());
  }

  /**
   * 合併分數
   */
  private mergeScores(group: NormalizedSearchResult[], options: MergeOptions) {
    const weights = options.weightByQuality ? group.map((r) => r.qualityScore) : group.map(() => 1);

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // 加權平均標準化分數
    const normalizedScore =
      group.reduce((sum, result, index) => sum + result.normalizedScore * weights[index], 0) /
      totalWeight;

    // 加權平均相關性分數
    const relevanceScore =
      group.reduce((sum, result, index) => sum + result.relevanceScore * weights[index], 0) /
      totalWeight;

    // 取最高質量分數
    const qualityScore = Math.max(...group.map((r) => r.qualityScore));

    // 合併個性化分數（如果存在）
    const personalizedScores = group
      .map((r) => r.personalizedScore)
      .filter((s) => s !== undefined) as number[];

    const personalizedScore =
      personalizedScores.length > 0
        ? personalizedScores.reduce((sum, score, index) => sum + score * weights[index], 0) /
          totalWeight
        : undefined;

    // 合併原始分數
    const originalScores: Record<string, number> = {};
    for (const result of group) {
      Object.assign(originalScores, result.originalScores);
    }

    return {
      normalizedScore,
      relevanceScore,
      qualityScore,
      personalizedScore,
      originalScores,
    };
  }

  /**
   * 合併內容
   */
  private mergeContent(group: NormalizedSearchResult[], baseResult: NormalizedSearchResult) {
    // 簡單策略：使用質量最高的結果的內容
    // 未來可以實現更複雜的內容合併邏輯

    const bestContent = group.reduce((best, current) =>
      current.qualityScore > best.qualityScore ? current : best
    );

    return {
      content: bestContent.content,
      title: bestContent.title || baseResult.title,
    };
  }

  /**
   * 合併元數據
   */
  private mergeMetadata(group: NormalizedSearchResult[]): Record<string, any> {
    const mergedMetadata: Record<string, any> = {};

    // 合併所有元數據
    for (const result of group) {
      Object.assign(mergedMetadata, result.metadata);
    }

    // 添加合併特定的元數據
    mergedMetadata.sourceIds = group.flatMap((r) => r.sources.map((s) => s.id));
    mergedMetadata.originalIds = group.map((r) => r.id);
    mergedMetadata.mergeTimestamp = Date.now();

    return mergedMetadata;
  }

  /**
   * 生成去重信息
   */
  private generateDeduplicationInfo(group: NormalizedSearchResult[]): DeduplicationInfo {
    return {
      duplicateCount: group.length - 1,
      similarityThreshold: this.defaultMergeOptions.similarityThreshold,
      mergedSources: group.flatMap((r) => r.sources.map((s) => s.id)),
      confidence: 0.8, // 基於相似性閾值的信心度
    };
  }

  /**
   * 排序合併後的結果
   */
  private sortMergedResults(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
    return results.sort((a, b) => {
      // 主要按標準化分數排序
      if (b.normalizedScore !== a.normalizedScore) {
        return b.normalizedScore - a.normalizedScore;
      }

      // 次要按質量分數排序
      if (b.qualityScore !== a.qualityScore) {
        return b.qualityScore - a.qualityScore;
      }

      // 最後按源數量排序（更多源的結果優先）
      return b.sources.length - a.sources.length;
    });
  }

  /**
   * 初始化默認合併策略
   */
  private initializeDefaultStrategies(): void {
    // 基於相似性的合併策略
    this.mergeStrategies.set("similarity-based", {
      id: "similarity-based",
      name: "Similarity-Based Merger",
      description: "基於內容相似性合併結果",
      merge: async (results: NormalizedSearchResult[]) => {
        return await this.merge(results);
      },
    });

    // 基於質量的合併策略
    this.mergeStrategies.set("quality-based", {
      id: "quality-based",
      name: "Quality-Based Merger",
      description: "基於質量分數合併結果",
      merge: async (results: NormalizedSearchResult[]) => {
        return await this.merge(results, { weightByQuality: true });
      },
    });
  }

  /**
   * 初始化相似性度量
   */
  private initializeSimilarityMeasures(): void {
    // 內容相似性度量
    this.similarityMeasures.set("content-similarity", {
      id: "content-similarity",
      name: "Content Similarity",
      calculate: (result1, result2) => {
        return this.calculateTextSimilarity(result1.content, result2.content);
      },
    });

    // 標題相似性度量
    this.similarityMeasures.set("title-similarity", {
      id: "title-similarity",
      name: "Title Similarity",
      calculate: (result1, result2) => {
        if (!result1.title || !result2.title) return 0;
        return this.calculateTextSimilarity(result1.title, result2.title);
      },
    });

    // 語義相似性度量（簡化版）
    this.similarityMeasures.set("semantic-similarity", {
      id: "semantic-similarity",
      name: "Semantic Similarity",
      calculate: (result1, result2) => {
        // 簡化的語義相似性計算
        // 實際應用中可以使用更複雜的 NLP 技術
        const keywords1 = this.extractKeywords(result1.content);
        const keywords2 = this.extractKeywords(result2.content);

        return this.calculateJaccardSimilarity(keywords1, keywords2);
      },
    });
  }

  /**
   * 計算文本相似性（簡化版）
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    return this.calculateJaccardSimilarity(words1, words2);
  }

  /**
   * 計算 Jaccard 相似性
   */
  private calculateJaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * 提取關鍵詞（簡化版）
   */
  private extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
    ]);

    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word))
    );
  }

  /**
   * 註冊自定義合併策略
   */
  registerMergeStrategy(strategy: MergeStrategy): void {
    this.mergeStrategies.set(strategy.id, strategy);
  }

  /**
   * 註冊自定義相似性度量
   */
  registerSimilarityMeasure(measure: SimilarityMeasure): void {
    this.similarityMeasures.set(measure.id, measure);
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      mergeStrategies: this.mergeStrategies.size,
      similarityMeasures: this.similarityMeasures.size,
      defaultSimilarityThreshold: this.defaultMergeOptions.similarityThreshold,
    };
  }

  /**
   * 更新默認合併選項
   */
  updateDefaultOptions(options: Partial<MergeOptions>): void {
    this.defaultMergeOptions = { ...this.defaultMergeOptions, ...options };
  }
}
