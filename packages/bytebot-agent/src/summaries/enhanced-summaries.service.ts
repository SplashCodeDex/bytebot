import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SummariesService } from './summaries.service';

export interface SummaryStrategy {
  type: 'extractive' | 'abstractive' | 'hierarchical' | 'progressive';
  config: {
    maxLength?: number;
    compressionRatio?: number;
    preserveKeyActions?: boolean;
    maintainContext?: boolean;
  };
}

export interface SummaryMetrics {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  keyActionsPreserved: number;
  contextRetention: number;
}

@Injectable()
export class EnhancedSummariesService {
  private readonly logger = new Logger(EnhancedSummariesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summariesService: SummariesService,
  ) {}

  /**
   * Create optimized summary using advanced strategies
   */
  async createOptimizedSummary(
    taskId: string,
    content: string,
    strategy: SummaryStrategy = { type: 'progressive', config: {} },
  ): Promise<{ summary: any; metrics: SummaryMetrics }> {
    const originalTokens = this.estimateTokens(content);

    let compressedContent: string;
    let keyActionsPreserved = 0;

    switch (strategy.type) {
      case 'extractive':
        compressedContent = await this.extractiveSummary(
          content,
          strategy.config,
        );
        break;
      case 'abstractive':
        compressedContent = await this.abstractiveSummary(
          content,
          strategy.config,
        );
        break;
      case 'hierarchical':
        compressedContent = await this.hierarchicalSummary(
          content,
          strategy.config,
        );
        break;
      case 'progressive':
        const result = await this.progressiveSummary(content, strategy.config);
        compressedContent = result.summary;
        keyActionsPreserved = result.actionsPreserved;
        break;
      default:
        compressedContent = content;
    }

    const compressedTokens = this.estimateTokens(compressedContent);
    const compressionRatio =
      originalTokens > 0 ? compressedTokens / originalTokens : 1;

    const summary = await this.summariesService.create({
      content: compressedContent,
      taskId,
    });

    const metrics: SummaryMetrics = {
      originalTokens,
      compressedTokens,
      compressionRatio,
      keyActionsPreserved,
      contextRetention: this.calculateContextRetention(
        content,
        compressedContent,
      ),
    };

    this.logger.log(
      `Created optimized summary for task ${taskId}: ${Math.round((1 - compressionRatio) * 100)}% compression`,
    );

    return { summary, metrics };
  }

  /**
   * Progressive summarization strategy - maintains context while compressing
   */
  private async progressiveSummary(
    content: string,
    config: any,
  ): Promise<{ summary: string; actionsPreserved: number }> {
    const sections = this.parseContentSections(content);
    const importantSections: string[] = [];
    let actionsPreserved = 0;

    for (const section of sections) {
      if (this.isImportantSection(section)) {
        if (this.containsActions(section)) {
          actionsPreserved++;
        }
        importantSections.push(this.compressSection(section, config));
      }
    }

    const summary = importantSections.join('\n\n');
    return { summary, actionsPreserved };
  }

  /**
   * Hierarchical summarization - creates multi-level summaries
   */
  private async hierarchicalSummary(
    content: string,
    config: any,
  ): Promise<string> {
    const paragraphs = content.split('\n\n');
    const compressed: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim().length > 100) {
        compressed.push(this.compressParagraph(paragraph, config));
      } else {
        compressed.push(paragraph);
      }
    }

    return compressed.join('\n');
  }

  /**
   * Extractive summarization - extracts key sentences
   */
  private async extractiveSummary(
    content: string,
    config: any,
  ): Promise<string> {
    const sentences = content
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 10);
    const scored = sentences.map((sentence) => ({
      sentence: sentence.trim(),
      score: this.scoreSentenceImportance(sentence),
    }));

    scored.sort((a, b) => b.score - a.score);

    const maxSentences = config.maxLength
      ? Math.floor(config.maxLength / 50)
      : Math.ceil(sentences.length * 0.3);
    const selected = scored.slice(0, maxSentences).map((item) => item.sentence);

    return selected.join('. ') + '.';
  }

  /**
   * Abstractive summarization - generates new summary text
   */
  private async abstractiveSummary(
    content: string,
    config: any,
  ): Promise<string> {
    // This would integrate with an AI service for abstractive summarization
    // For now, return a simplified version
    const keyPoints = this.extractKeyPoints(content);
    return `Summary: ${keyPoints.join('; ')}.`;
  }

  /**
   * Clean up old summaries to prevent database bloat
   */
  async cleanupOldSummaries(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.summary.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} old summaries older than ${olderThanDays} days`,
    );
    return result.count;
  }

  /**
   * Compress existing summaries when they get too large
   */
  async compressExistingSummaries(taskId: string): Promise<void> {
    const summaries = await this.prisma.summary.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });

    if (summaries.length <= 5) return; // Keep recent summaries as-is

    // Compress older summaries
    const oldSummaries = summaries.slice(5);
    const combinedContent = oldSummaries.map((s) => s.content).join('\n\n');

    const { summary: compressedSummary } = await this.createOptimizedSummary(
      taskId,
      combinedContent,
      { type: 'progressive', config: { compressionRatio: 0.3 } },
    );

    // Delete old summaries and keep the compressed one
    await this.prisma.summary.deleteMany({
      where: {
        id: { in: oldSummaries.map((s) => s.id) },
      },
    });

    this.logger.log(
      `Compressed ${oldSummaries.length} summaries for task ${taskId}`,
    );
  }

  private parseContentSections(content: string): string[] {
    // Split content into logical sections
    return content
      .split(/\n\s*\n/)
      .filter((section) => section.trim().length > 0);
  }

  private isImportantSection(section: string): boolean {
    const importantKeywords = [
      'error',
      'failed',
      'success',
      'completed',
      'action',
      'result',
      'click',
      'type',
      'scroll',
      'screenshot',
      'found',
      'created',
    ];

    const lowerSection = section.toLowerCase();
    return importantKeywords.some((keyword) => lowerSection.includes(keyword));
  }

  private containsActions(section: string): boolean {
    const actionKeywords = [
      'click',
      'type',
      'scroll',
      'screenshot',
      'key',
      'mouse',
    ];
    const lowerSection = section.toLowerCase();
    return actionKeywords.some((keyword) => lowerSection.includes(keyword));
  }

  private compressSection(section: string, config: any): string {
    // Simple compression - remove verbose descriptions
    return section
      .replace(/\s+/g, ' ')
      .replace(/\b(I am|I will|I'm going to|Let me)\b/gi, '')
      .replace(/\b(successfully|currently|now)\b/gi, '')
      .trim();
  }

  private compressParagraph(paragraph: string, config: any): string {
    const sentences = paragraph.split(/[.!?]+/);
    const important = sentences.filter(
      (s) => this.scoreSentenceImportance(s) > 0.5,
    );
    return important.join('. ').trim() + '.';
  }

  private scoreSentenceImportance(sentence: string): number {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Action words
    if (
      /\b(click|type|scroll|screenshot|found|error|success|completed)\b/.test(
        lower,
      )
    ) {
      score += 0.3;
    }

    // Numbers and specific values
    if (/\d+/.test(sentence)) {
      score += 0.2;
    }

    // Error or result indicators
    if (/\b(error|failed|success|result|outcome)\b/.test(lower)) {
      score += 0.4;
    }

    // Length penalty for very long sentences
    if (sentence.length > 200) {
      score -= 0.1;
    }

    return Math.min(score, 1.0);
  }

  private extractKeyPoints(content: string): string[] {
    const sections = this.parseContentSections(content);
    const keyPoints: string[] = [];

    for (const section of sections) {
      const sentences = section.split(/[.!?]+/);
      const important = sentences.find(
        (s) => this.scoreSentenceImportance(s) > 0.7,
      );
      if (important) {
        keyPoints.push(important.trim());
      }
    }

    return keyPoints.slice(0, 5); // Limit to 5 key points
  }

  private calculateContextRetention(
    original: string,
    compressed: string,
  ): number {
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const compressedWords = new Set(compressed.toLowerCase().split(/\s+/));

    const retainedWords = Array.from(originalWords).filter((word) =>
      compressedWords.has(word),
    );
    return originalWords.size > 0
      ? retainedWords.length / originalWords.size
      : 1;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get summarization statistics
   */
  async getSummarizationStats(taskId?: string) {
    const where = taskId ? { taskId } : {};

    const summaries = await this.prisma.summary.findMany({
      where,
      select: {
        content: true,
        createdAt: true,
        taskId: true,
      },
    });

    const totalSummaries = summaries.length;
    const totalTokens = summaries.reduce(
      (sum, s) => sum + this.estimateTokens(s.content),
      0,
    );
    const averageTokens = totalSummaries > 0 ? totalTokens / totalSummaries : 0;

    return {
      totalSummaries,
      totalTokens,
      averageTokens,
      oldestSummary: summaries.length > 0 ? summaries[0].createdAt : null,
      newestSummary:
        summaries.length > 0 ? summaries[summaries.length - 1].createdAt : null,
    };
  }
}
