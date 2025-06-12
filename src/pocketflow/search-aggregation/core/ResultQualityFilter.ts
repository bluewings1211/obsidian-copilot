/**
 * PocketFlow.js Search Aggregation System - Result Quality Filter
 * 結果質量過濾器：過濾低質量和垃圾內容
 */

import {
  NormalizedSearchResult,
  QualityConfig,
  QualityAssessment,
  ContentQuality,
  SourceReliability,
  InformationAccuracy,
  RelevanceConsistency,
  SpamDetection,
} from "../types";

export interface QualityFilter {
  id: string;
  name: string;
  description: string;
  priority: number;
  filter: (result: NormalizedSearchResult) => Promise<boolean>;
}

export interface QualityAnalyzer {
  id: string;
  name: string;
  analyze: (result: NormalizedSearchResult) => Promise<QualityAssessment>;
}

export interface FilteringStats {
  totalProcessed: number;
  passed: number;
  filtered: number;
  filterReasons: Record<string, number>;
  qualityDistribution: {
    high: number;
    medium: number;
    low: number;
    spam: number;
  };
}

/**
 * 結果質量過濾器
 * 負責識別和過濾低質量、重複或垃圾內容
 */
export class ResultQualityFilter {
  private qualityFilters: Map<string, QualityFilter> = new Map();
  private qualityAnalyzers: Map<string, QualityAnalyzer> = new Map();
  private filteringStats: FilteringStats;

  constructor(private config: QualityConfig) {
    this.filteringStats = this.initializeStats();
    this.initializeDefaultFilters();
    this.initializeDefaultAnalyzers();
  }

  /**
   * 過濾搜索結果
   */
  async filter(results: NormalizedSearchResult[]): Promise<NormalizedSearchResult[]> {
    if (!this.config.enableQualityAssessment) {
      return results;
    }

    const filteredResults: NormalizedSearchResult[] = [];
    this.filteringStats.totalProcessed += results.length;

    for (const result of results) {
      try {
        // 1. 質量評估
        const qualityAssessment = await this.assessQuality(result);

        // 2. 垃圾檢測
        const spamDetection = await this.detectSpam(result);

        // 3. 應用過濾器
        const shouldPass = await this.applyFilters(result, qualityAssessment, spamDetection);

        if (shouldPass) {
          // 更新結果的質量信息
          const enhancedResult = this.enhanceResultWithQuality(result, qualityAssessment);
          filteredResults.push(enhancedResult);
          this.filteringStats.passed++;
          this.updateQualityDistribution(qualityAssessment);
        } else {
          this.filteringStats.filtered++;
        }
      } catch (error) {
        console.warn(`質量評估失敗 (ID: ${result.id}):`, error);
        // 默認通過，避免因錯誤丟失結果
        filteredResults.push(result);
        this.filteringStats.passed++;
      }
    }

    return filteredResults;
  }

  /**
   * 評估結果質量
   */
  private async assessQuality(result: NormalizedSearchResult): Promise<QualityAssessment> {
    const contentQuality = await this.assessContentQuality(result);
    const sourceReliability = await this.assessSourceReliability(result);
    const informationAccuracy = await this.assessInformationAccuracy(result);
    const relevanceConsistency = await this.assessRelevanceConsistency(result);

    return {
      contentQuality,
      sourceReliability,
      informationAccuracy,
      relevanceConsistency,
    };
  }

  /**
   * 評估內容質量
   */
  private async assessContentQuality(result: NormalizedSearchResult): Promise<ContentQuality> {
    const content = result.content;
    const title = result.title || "";

    // 長度評估
    const lengthScore = this.assessLength(content);

    // 結構評估
    const structureScore = this.assessStructure(content);

    // 語言質量評估
    const languageScore = this.assessLanguageQuality(content);

    // 格式評估
    const formattingScore = this.assessFormatting(content);

    // 完整性評估
    const completenessScore = this.assessCompleteness(content, title);

    const factors = {
      length: lengthScore,
      structure: structureScore,
      language: languageScore,
      formatting: formattingScore,
      completeness: completenessScore,
    };

    const score =
      Object.values(factors).reduce((sum, s) => sum + s, 0) / Object.keys(factors).length;
    const issues = this.identifyContentIssues(content, factors);

    return {
      score,
      factors,
      issues,
    };
  }

  /**
   * 評估來源可靠性
   */
  private async assessSourceReliability(
    result: NormalizedSearchResult
  ): Promise<SourceReliability> {
    const sources = result.sources;

    // 權威性評估
    const authorityScore = this.calculateAuthorityScore(sources);

    // 時效性評估
    const freshnessScore = this.calculateFreshnessScore(result.timestamp);

    // 引用評估
    const citationsScore = this.assessCitations(result);

    // 一致性評估
    const consistencyScore = sources.length > 1 ? this.assessSourceConsistency(sources) : 0.8;

    const factors = {
      authority: authorityScore,
      freshness: freshnessScore,
      citations: citationsScore,
      consistency: consistencyScore,
    };

    const score =
      Object.values(factors).reduce((sum, s) => sum + s, 0) / Object.keys(factors).length;
    const trustLevel = this.determineTrustLevel(score);

    return {
      score,
      factors,
      trustLevel,
    };
  }

  /**
   * 評估信息準確性
   */
  private async assessInformationAccuracy(
    result: NormalizedSearchResult
  ): Promise<InformationAccuracy> {
    // 簡化的準確性評估
    // 實際應用中可能需要更複雜的事實檢查機制

    const content = result.content;

    // 檢查矛盾陳述
    const contradictions = this.detectContradictions(content);

    // 尋找支持證據
    const supportingEvidence = this.findSupportingEvidence(content);

    // 驗證級別評估
    const verificationLevel = this.assessVerificationLevel(result);

    const score = this.calculateAccuracyScore(
      contradictions,
      supportingEvidence,
      verificationLevel
    );

    return {
      score,
      verificationLevel,
      contradictions,
      supportingEvidence,
    };
  }

  /**
   * 評估相關性一致性
   */
  private async assessRelevanceConsistency(
    result: NormalizedSearchResult
  ): Promise<RelevanceConsistency> {
    // 跨源一致性（如果有多個源）
    const crossSourceAgreement =
      result.sources.length > 1 ? this.calculateCrossSourceAgreement(result) : 0.8;

    // 主題對齊度
    const topicAlignment = this.assessTopicAlignment(result);

    // 上下文適合度
    const contextFit = this.assessContextFit(result);

    const score = (crossSourceAgreement + topicAlignment + contextFit) / 3;

    return {
      score,
      crossSourceAgreement,
      topicAlignment,
      contextFit,
    };
  }

  /**
   * 垃圾檢測
   */
  private async detectSpam(result: NormalizedSearchResult): Promise<SpamDetection> {
    const content = result.content;
    const indicators: string[] = [];
    let spamScore = 0;

    // 重複內容檢測
    if (this.hasExcessiveRepetition(content)) {
      indicators.push("excessive_repetition");
      spamScore += 0.3;
    }

    // 關鍵詞堆疊檢測
    if (this.hasKeywordStuffing(content)) {
      indicators.push("keyword_stuffing");
      spamScore += 0.3;
    }

    // 無意義內容檢測
    if (this.hasNonsensicalContent(content)) {
      indicators.push("nonsensical_content");
      spamScore += 0.4;
    }

    // 過度推廣檢測
    if (this.hasExcessivePromotion(content)) {
      indicators.push("excessive_promotion");
      spamScore += 0.2;
    }

    // 格式異常檢測
    if (this.hasAbnormalFormatting(content)) {
      indicators.push("abnormal_formatting");
      spamScore += 0.1;
    }

    const isSpam = spamScore >= this.config.spamThreshold;
    const confidence = Math.min(spamScore, 1.0);
    const riskLevel = this.determineRiskLevel(spamScore);

    return {
      isSpam,
      confidence,
      indicators,
      riskLevel,
    };
  }

  /**
   * 應用所有過濾器
   */
  private async applyFilters(
    result: NormalizedSearchResult,
    qualityAssessment: QualityAssessment,
    spamDetection: SpamDetection
  ): Promise<boolean> {
    // 垃圾過濾
    if (this.config.enableSpamDetection && spamDetection.isSpam) {
      this.recordFilterReason("spam");
      return false;
    }

    // 質量閾值過濾
    if (qualityAssessment.contentQuality.score < this.config.qualityThresholds.content) {
      this.recordFilterReason("low_content_quality");
      return false;
    }

    if (qualityAssessment.sourceReliability.score < this.config.qualityThresholds.source) {
      this.recordFilterReason("low_source_reliability");
      return false;
    }

    if (qualityAssessment.relevanceConsistency.score < this.config.qualityThresholds.relevance) {
      this.recordFilterReason("low_relevance");
      return false;
    }

    // 整體質量評估
    const overallQuality = this.calculateOverallQuality(qualityAssessment);
    if (overallQuality < this.config.qualityThresholds.overall) {
      this.recordFilterReason("low_overall_quality");
      return false;
    }

    // 應用自定義過濾器
    const customFilters = Array.from(this.qualityFilters.values()).sort(
      (a, b) => b.priority - a.priority
    );

    for (const filter of customFilters) {
      try {
        const shouldPass = await filter.filter(result);
        if (!shouldPass) {
          this.recordFilterReason(filter.id);
          return false;
        }
      } catch (error) {
        console.warn(`過濾器 ${filter.id} 執行失敗:`, error);
      }
    }

    return true;
  }

  /**
   * 增強結果的質量信息
   */
  private enhanceResultWithQuality(
    result: NormalizedSearchResult,
    qualityAssessment: QualityAssessment
  ): NormalizedSearchResult {
    const overallQuality = this.calculateOverallQuality(qualityAssessment);

    return {
      ...result,
      qualityScore: overallQuality,
      metadata: {
        ...result.metadata,
        qualityAssessment,
        qualityEnhancedAt: Date.now(),
      },
    };
  }

  // ==================== 評估輔助方法 ====================

  private assessLength(content: string): number {
    const length = content.length;
    if (length < 50) return 0.2;
    if (length < 100) return 0.5;
    if (length <= 1000) return 1.0;
    if (length <= 2000) return 0.8;
    return 0.6;
  }

  private assessStructure(content: string): number {
    let score = 0.5;

    // 檢查段落結構
    const paragraphs = content.split("\n\n").length;
    if (paragraphs > 1) score += 0.2;

    // 檢查標點符號
    const sentences = content.split(/[.!?]/).length;
    if (sentences > 1) score += 0.2;

    // 檢查大寫字母（標題等）
    if (/[A-Z]/.test(content)) score += 0.1;

    return Math.min(score, 1.0);
  }

  private assessLanguageQuality(content: string): number {
    let score = 0.5;

    // 檢查拼寫錯誤（簡化版）
    const words = content.split(/\s+/);
    const validWords = words.filter((word) => /^[a-zA-Z]+$/.test(word));
    const validRatio = validWords.length / words.length;
    score += validRatio * 0.3;

    // 檢查語法結構（簡化版）
    if (/\b(the|a|an|is|are|was|were)\b/i.test(content)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private assessFormatting(content: string): number {
    let score = 0.5;

    // 檢查混亂的格式
    if (!/[A-Z]{5,}/.test(content)) score += 0.2; // 沒有全大寫單詞
    if (!/!{3,}/.test(content)) score += 0.2; // 沒有過多感嘆號
    if (!/\?{3,}/.test(content)) score += 0.1; // 沒有過多問號

    return Math.min(score, 1.0);
  }

  private assessCompleteness(content: string, title: string): number {
    let score = 0.5;

    if (title && title.trim()) score += 0.2;
    if (content.length > 100) score += 0.2;
    if (/[.!?]$/.test(content.trim())) score += 0.1; // 適當結尾

    return Math.min(score, 1.0);
  }

  private identifyContentIssues(content: string, factors: any): string[] {
    const issues: string[] = [];

    if (factors.length < 0.5) issues.push("content_too_short");
    if (factors.structure < 0.5) issues.push("poor_structure");
    if (factors.language < 0.5) issues.push("language_quality_issues");
    if (factors.formatting < 0.5) issues.push("formatting_problems");
    if (factors.completeness < 0.5) issues.push("incomplete_content");

    return issues;
  }

  private calculateAuthorityScore(sources: any[]): number {
    return sources.reduce((sum, source) => sum + source.weight, 0) / sources.length;
  }

  private calculateFreshnessScore(timestamp: number): number {
    const now = Date.now();
    const ageInDays = (now - timestamp) / (1000 * 60 * 60 * 24);

    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 7) return 0.9;
    if (ageInDays <= 30) return 0.7;
    if (ageInDays <= 90) return 0.5;
    return 0.3;
  }

  private assessCitations(result: NormalizedSearchResult): number {
    // 簡化的引用評估
    const content = result.content;
    const hasUrls = /https?:\/\//.test(content);
    const hasReferences = /\[(.*?)\]|\((.*?)\)/.test(content);

    return (hasUrls ? 0.5 : 0) + (hasReferences ? 0.5 : 0);
  }

  private assessSourceConsistency(sources: any[]): number {
    // 簡化的源一致性評估
    return 0.8; // 預設值
  }

  private determineTrustLevel(score: number): "low" | "medium" | "high" {
    if (score >= 0.8) return "high";
    if (score >= 0.5) return "medium";
    return "low";
  }

  private detectContradictions(content: string): string[] {
    // 簡化的矛盾檢測
    return [];
  }

  private findSupportingEvidence(content: string): string[] {
    // 簡化的證據查找
    return [];
  }

  private assessVerificationLevel(
    result: NormalizedSearchResult
  ): "unverified" | "partial" | "verified" {
    // 簡化的驗證級別評估
    return "partial";
  }

  private calculateAccuracyScore(
    contradictions: string[],
    evidence: string[],
    verificationLevel: string
  ): number {
    let score = 0.5;

    if (contradictions.length === 0) score += 0.2;
    if (evidence.length > 0) score += 0.2;
    if (verificationLevel === "verified") score += 0.1;

    return Math.min(score, 1.0);
  }

  private calculateCrossSourceAgreement(result: NormalizedSearchResult): number {
    // 簡化的跨源一致性計算
    return 0.8;
  }

  private assessTopicAlignment(result: NormalizedSearchResult): number {
    // 簡化的主題對齊評估
    return 0.8;
  }

  private assessContextFit(result: NormalizedSearchResult): number {
    // 簡化的上下文適合度評估
    return 0.8;
  }

  // ==================== 垃圾檢測方法 ====================

  private hasExcessiveRepetition(content: string): boolean {
    const words = content.split(/\s+/);
    const wordCount = new Map<string, number>();

    words.forEach((word) => {
      const normalized = word.toLowerCase();
      wordCount.set(normalized, (wordCount.get(normalized) || 0) + 1);
    });

    // 檢查是否有單詞重複超過 10% 的內容
    const totalWords = words.length;
    for (const count of wordCount.values()) {
      if (count / totalWords > 0.1) return true;
    }

    return false;
  }

  private hasKeywordStuffing(content: string): boolean {
    // 簡化的關鍵詞堆疊檢測
    const keywords = content.match(/\b\w+\b/g) || [];
    const uniqueKeywords = new Set(keywords.map((k) => k.toLowerCase()));

    return keywords.length / uniqueKeywords.size > 3; // 平均每個詞重複超過3次
  }

  private hasNonsensicalContent(content: string): boolean {
    // 檢查隨機字符序列
    return (
      /[a-zA-Z]{20,}/.test(content) || // 超長單詞
      /\d{10,}/.test(content) || // 超長數字
      /[!@#$%^&*()]{5,}/.test(content)
    ); // 過多特殊字符
  }

  private hasExcessivePromotion(content: string): boolean {
    const promotionalWords = ["buy", "sale", "discount", "offer", "deal", "price"];
    const promotionalCount = promotionalWords.reduce((count, word) => {
      return count + (content.toLowerCase().match(new RegExp(word, "g")) || []).length;
    }, 0);

    return promotionalCount > 5;
  }

  private hasAbnormalFormatting(content: string): boolean {
    return (
      /[A-Z]{10,}/.test(content) || // 過多大寫
      /[!]{5,}/.test(content) || // 過多感嘆號
      /[?]{5,}/.test(content)
    ); // 過多問號
  }

  private determineRiskLevel(score: number): "low" | "medium" | "high" {
    if (score >= 0.7) return "high";
    if (score >= 0.3) return "medium";
    return "low";
  }

  private calculateOverallQuality(assessment: QualityAssessment): number {
    return (
      assessment.contentQuality.score * 0.4 +
      assessment.sourceReliability.score * 0.3 +
      assessment.informationAccuracy.score * 0.2 +
      assessment.relevanceConsistency.score * 0.1
    );
  }

  private recordFilterReason(reason: string): void {
    this.filteringStats.filterReasons[reason] =
      (this.filteringStats.filterReasons[reason] || 0) + 1;
  }

  private updateQualityDistribution(assessment: QualityAssessment): void {
    const overallScore = this.calculateOverallQuality(assessment);

    if (overallScore >= 0.8) {
      this.filteringStats.qualityDistribution.high++;
    } else if (overallScore >= 0.5) {
      this.filteringStats.qualityDistribution.medium++;
    } else {
      this.filteringStats.qualityDistribution.low++;
    }
  }

  private initializeStats(): FilteringStats {
    return {
      totalProcessed: 0,
      passed: 0,
      filtered: 0,
      filterReasons: {},
      qualityDistribution: {
        high: 0,
        medium: 0,
        low: 0,
        spam: 0,
      },
    };
  }

  private initializeDefaultFilters(): void {
    // 這裡可以添加默認過濾器
  }

  private initializeDefaultAnalyzers(): void {
    // 這裡可以添加默認分析器
  }

  /**
   * 註冊自定義質量過濾器
   */
  registerFilter(filter: QualityFilter): void {
    this.qualityFilters.set(filter.id, filter);
  }

  /**
   * 註冊自定義質量分析器
   */
  registerAnalyzer(analyzer: QualityAnalyzer): void {
    this.qualityAnalyzers.set(analyzer.id, analyzer);
  }

  /**
   * 獲取過濾統計
   */
  getFilteringStats(): FilteringStats {
    return { ...this.filteringStats };
  }

  /**
   * 重置統計
   */
  resetStats(): void {
    this.filteringStats = this.initializeStats();
  }
}
