import { Injectable, Logger } from '@nestjs/common';
import { TaskPatternService } from './task-pattern.service';

export interface ToolUsageInsight {
  toolName: string;
  insight: string;
  confidence: number;
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
  data: {
    usageCount: number;
    successRate: number;
    averageDuration: number;
    trends: string[];
  };
}

export interface ToolWorkflowPattern {
  pattern: string[];
  frequency: number;
  successRate: number;
  optimization: string;
}

@Injectable()
export class ToolUsageAnalyzerService {
  private readonly logger = new Logger(ToolUsageAnalyzerService.name);
  private toolSequences: Array<{
    taskId: string;
    sequence: string[];
    success: boolean;
    duration: number;
    timestamp: Date;
  }> = [];

  constructor(private readonly taskPatternService: TaskPatternService) {}

  /**
   * Analyze tool usage patterns and generate insights
   */
  async analyzeToolUsagePatterns(): Promise<ToolUsageInsight[]> {
    this.logger.log('Analyzing tool usage patterns');

    const insights: ToolUsageInsight[] = [];
    const toolStats = this.calculateToolStatistics();

    for (const [toolName, stats] of toolStats) {
      const insight = await this.generateToolInsight(toolName, stats);
      if (insight) {
        insights.push(insight);
      }
    }

    return insights.sort((a, b) => b.confidence * this.getImpactScore(b.impact) - a.confidence * this.getImpactScore(a.impact));
  }

  /**
   * Identify common tool workflow patterns
   */
  async identifyWorkflowPatterns(): Promise<ToolWorkflowPattern[]> {
    const patterns: Map<string, { count: number; successes: number; durations: number[] }> = new Map();

    // Analyze sequences of 2-4 tools
    for (const sequence of this.toolSequences) {
      if (sequence.sequence.length < 2) continue;

      for (let length = 2; length <= Math.min(4, sequence.sequence.length); length++) {
        for (let start = 0; start <= sequence.sequence.length - length; start++) {
          const pattern = sequence.sequence.slice(start, start + length);
          const patternKey = pattern.join(' → ');

          if (!patterns.has(patternKey)) {
            patterns.set(patternKey, { count: 0, successes: 0, durations: [] });
          }

          const stats = patterns.get(patternKey)!;
          stats.count++;
          if (sequence.success) stats.successes++;
          stats.durations.push(sequence.duration);
        }
      }
    }

    // Convert to workflow patterns
    const workflowPatterns: ToolWorkflowPattern[] = [];
    
    for (const [patternKey, stats] of patterns) {
      if (stats.count >= 3) { // Minimum frequency threshold
        const successRate = stats.successes / stats.count;
        const optimization = this.generatePatternOptimization(patternKey.split(' → '), stats);

        workflowPatterns.push({
          pattern: patternKey.split(' → '),
          frequency: stats.count,
          successRate,
          optimization
        });
      }
    }

    return workflowPatterns.sort((a, b) => b.frequency * b.successRate - a.frequency * a.successRate);
  }

  /**
   * Record tool sequence for analysis
   */
  recordToolSequence(taskId: string, tools: string[], success: boolean, duration: number): void {
    this.toolSequences.push({
      taskId,
      sequence: tools,
      success,
      duration,
      timestamp: new Date()
    });

    // Keep only recent sequences (last 1000)
    if (this.toolSequences.length > 1000) {
      this.toolSequences = this.toolSequences.slice(-1000);
    }

    this.logger.debug(`Recorded tool sequence for task ${taskId}: ${tools.join(' → ')}`);
  }

  /**
   * Get tool usage recommendations
   */
  async getToolUsageRecommendations(): Promise<string[]> {
    const insights = await this.analyzeToolUsagePatterns();
    const workflowPatterns = await this.identifyWorkflowPatterns();
    
    const recommendations: string[] = [];

    // Recommendations from insights
    const highImpactInsights = insights.filter(i => i.impact === 'high' && i.confidence > 0.7);
    for (const insight of highImpactInsights) {
      recommendations.push(insight.recommendation);
    }

    // Recommendations from workflow patterns
    const efficientPatterns = workflowPatterns.filter(p => p.successRate > 0.8 && p.frequency >= 5);
    for (const pattern of efficientPatterns.slice(0, 3)) {
      recommendations.push(
        `Consider automating the workflow: ${pattern.pattern.join(' → ')} (${Math.round(pattern.successRate * 100)}% success rate, used ${pattern.frequency} times)`
      );
    }

    // General optimization recommendations
    const toolStats = this.calculateToolStatistics();
    const underusedTools = Array.from(toolStats.entries())
      .filter(([_, stats]) => stats.frequency < 5 && stats.successRate > 0.8)
      .map(([toolName]) => toolName);

    if (underusedTools.length > 0) {
      recommendations.push(
        `Consider exploring these underutilized but effective tools: ${underusedTools.slice(0, 3).join(', ')}`
      );
    }

    return recommendations.slice(0, 10);
  }

  /**
   * Export tool usage data for external analysis
   */
  exportToolUsageData() {
    const toolStats = this.calculateToolStatistics();
    const recentSequences = this.toolSequences.slice(-100);

    return {
      toolStatistics: Object.fromEntries(toolStats),
      recentWorkflows: recentSequences.map(seq => ({
        pattern: seq.sequence.join(' → '),
        success: seq.success,
        duration: seq.duration,
        timestamp: seq.timestamp
      })),
      exportTimestamp: new Date(),
      totalSequencesAnalyzed: this.toolSequences.length
    };
  }

  private calculateToolStatistics(): Map<string, {
    frequency: number;
    successRate: number;
    averageDuration: number;
    lastUsed: Date;
  }> {
    const toolStats = new Map();

    for (const sequence of this.toolSequences) {
      for (const tool of sequence.sequence) {
        if (!toolStats.has(tool)) {
          toolStats.set(tool, {
            frequency: 0,
            successes: 0,
            durations: [],
            lastUsed: sequence.timestamp
          });
        }

        const stats = toolStats.get(tool);
        stats.frequency++;
        if (sequence.success) stats.successes++;
        stats.durations.push(sequence.duration / sequence.sequence.length); // Approximate per-tool duration
        if (sequence.timestamp > stats.lastUsed) {
          stats.lastUsed = sequence.timestamp;
        }
      }
    }

    // Convert to final format
    const finalStats = new Map();
    for (const [tool, stats] of toolStats) {
      finalStats.set(tool, {
        frequency: stats.frequency,
        successRate: stats.successes / stats.frequency,
        averageDuration: stats.durations.reduce((sum: number, d: number) => sum + d, 0) / stats.durations.length,
        lastUsed: stats.lastUsed
      });
    }

    return finalStats;
  }

  private async generateToolInsight(toolName: string, stats: any): Promise<ToolUsageInsight | null> {
    if (stats.frequency < 3) return null; // Need minimum usage for insights

    let insight = '';
    let recommendation = '';
    let confidence = 0;
    let impact: 'high' | 'medium' | 'low' = 'low';

    // Success rate analysis
    if (stats.successRate < 0.6) {
      insight = `${toolName} has a low success rate (${Math.round(stats.successRate * 100)}%)`;
      recommendation = `Review and optimize ${toolName} usage patterns or consider alternative tools`;
      confidence = 0.8;
      impact = 'high';
    } else if (stats.successRate > 0.9 && stats.frequency > 10) {
      insight = `${toolName} is highly reliable with ${Math.round(stats.successRate * 100)}% success rate`;
      recommendation = `Consider increasing usage of ${toolName} for similar tasks`;
      confidence = 0.9;
      impact = 'medium';
    }

    // Duration analysis
    const avgDuration = stats.averageDuration;
    if (avgDuration > 60000) { // 1 minute
      insight += insight ? ' and ' : '';
      insight += `takes longer than expected (avg ${Math.round(avgDuration / 1000)}s)`;
      recommendation = `Optimize ${toolName} performance or consider faster alternatives`;
      confidence = Math.max(confidence, 0.7);
      impact = impact === 'high' ? 'high' : 'medium';
    }

    // Usage frequency analysis
    const daysSinceLastUse = (Date.now() - stats.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse > 14 && stats.successRate > 0.8) {
      insight = `${toolName} was effective but hasn't been used recently`;
      recommendation = `Consider reintegrating ${toolName} into current workflows`;
      confidence = 0.6;
      impact = 'low';
    }

    if (!insight) return null;

    const trends = this.calculateToolTrends(toolName);

    return {
      toolName,
      insight,
      confidence,
      recommendation,
      impact,
      data: {
        usageCount: stats.frequency,
        successRate: stats.successRate,
        averageDuration: stats.averageDuration,
        trends
      }
    };
  }

  private calculateToolTrends(toolName: string): string[] {
    const trends: string[] = [];
    
    // Simple trend analysis over time
    const recentUsage = this.toolSequences
      .filter(seq => seq.sequence.includes(toolName))
      .slice(-20);

    if (recentUsage.length < 5) return trends;

    const recentSuccessRate = recentUsage.filter(seq => seq.success).length / recentUsage.length;
    const overallStats = this.calculateToolStatistics().get(toolName);
    
    if (recentSuccessRate > overallStats?.successRate * 1.1) {
      trends.push('improving_success_rate');
    } else if (recentSuccessRate < overallStats?.successRate * 0.9) {
      trends.push('declining_success_rate');
    }

    const recentFrequency = recentUsage.length;
    if (recentFrequency > 10) {
      trends.push('high_recent_usage');
    } else if (recentFrequency < 3) {
      trends.push('low_recent_usage');
    }

    return trends;
  }

  private generatePatternOptimization(pattern: string[], stats: any): string {
    if (stats.count < 5) {
      return 'Insufficient data for optimization';
    }

    const successRate = stats.successes / stats.count;
    const avgDuration = stats.durations.reduce((sum: number, d: number) => sum + d, 0) / stats.durations.length;

    if (successRate < 0.7) {
      return `Low success rate (${Math.round(successRate * 100)}%) - consider alternative tool sequence`;
    }

    if (avgDuration > 120000) { // 2 minutes
      return `Long duration (${Math.round(avgDuration / 1000)}s) - look for shortcuts or tool optimizations`;
    }

    if (successRate > 0.9 && stats.count > 10) {
      return `Highly effective pattern - consider creating automation rule`;
    }

    return 'Pattern performing within normal parameters';
  }

  private getImpactScore(impact: 'high' | 'medium' | 'low'): number {
    switch (impact) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
    }
  }
}