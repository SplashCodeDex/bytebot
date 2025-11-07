import { Injectable, Logger } from '@nestjs/common';

export interface ToolUsagePattern {
  toolName: string;
  taskType: string;
  successRate: number;
  averageDuration: number;
  frequency: number;
  contextPatterns: string[];
  lastUsed: Date;
}

export interface ToolRecommendation {
  toolName: string;
  confidence: number;
  reasoning: string;
  expectedDuration: number;
  alternatives: string[];
}

export interface TaskContext {
  description: string;
  taskType: string;
  environment: string;
  userPreferences?: Record<string, any>;
  previousAttempts?: Array<{
    toolName: string;
    success: boolean;
    duration: number;
    error?: string;
  }>;
}

@Injectable()
export class SmartToolSelectorService {
  private readonly logger = new Logger(SmartToolSelectorService.name);
  private toolPatterns: Map<string, ToolUsagePattern> = new Map();
  private availableTools: Map<string, any> = new Map();

  constructor() {
    this.initializeDefaultTools();
  }

  /**
   * Intelligently select the best tool for a given task context
   */
  async selectOptimalTool(context: TaskContext): Promise<ToolRecommendation> {
    this.logger.debug(`Selecting optimal tool for task: ${context.description}`);

    const candidates = this.getCandidateTools(context);
    const scoredCandidates = candidates.map(tool => ({
      tool,
      score: this.scoreToolForContext(tool, context)
    }));

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    const bestTool = scoredCandidates[0];
    
    if (!bestTool || bestTool.score < 0.3) {
      return this.getDefaultRecommendation(context);
    }

    const pattern = this.toolPatterns.get(this.getPatternKey(bestTool.tool, context.taskType));
    
    return {
      toolName: bestTool.tool,
      confidence: bestTool.score,
      reasoning: this.generateRecommendationReasoning(bestTool.tool, context, pattern),
      expectedDuration: pattern?.averageDuration || 30000,
      alternatives: scoredCandidates.slice(1, 4).map(c => c.tool)
    };
  }

  /**
   * Learn from tool usage outcomes
   */
  async recordToolUsage(
    toolName: string,
    context: TaskContext,
    success: boolean,
    duration: number,
    error?: string
  ): Promise<void> {
    const patternKey = this.getPatternKey(toolName, context.taskType);
    let pattern = this.toolPatterns.get(patternKey);

    if (!pattern) {
      pattern = {
        toolName,
        taskType: context.taskType,
        successRate: success ? 1 : 0,
        averageDuration: duration,
        frequency: 1,
        contextPatterns: [this.extractContextPattern(context)],
        lastUsed: new Date()
      };
    } else {
      // Update existing pattern with new data
      const totalUsages = pattern.frequency + 1;
      pattern.successRate = (pattern.successRate * pattern.frequency + (success ? 1 : 0)) / totalUsages;
      pattern.averageDuration = (pattern.averageDuration * pattern.frequency + duration) / totalUsages;
      pattern.frequency = totalUsages;
      pattern.lastUsed = new Date();

      // Add new context pattern if unique
      const contextPattern = this.extractContextPattern(context);
      if (!pattern.contextPatterns.includes(contextPattern)) {
        pattern.contextPatterns.push(contextPattern);
        // Keep only recent patterns
        if (pattern.contextPatterns.length > 10) {
          pattern.contextPatterns = pattern.contextPatterns.slice(-10);
        }
      }
    }

    this.toolPatterns.set(patternKey, pattern);

    if (!success && error) {
      this.logger.warn(`Tool ${toolName} failed for ${context.taskType}: ${error}`);
      await this.analyzeFailurePattern(toolName, context, error);
    }

    this.logger.debug(`Recorded usage for ${toolName}: ${success ? 'success' : 'failure'} in ${duration}ms`);
  }

  /**
   * Get tool usage analytics
   */
  getToolAnalytics() {
    const patterns = Array.from(this.toolPatterns.values());
    
    const topPerformingTools = patterns
      .sort((a, b) => (b.successRate * b.frequency) - (a.successRate * a.frequency))
      .slice(0, 10);

    const mostUsedTools = patterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const recentlyUsedTools = patterns
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, 10);

    return {
      totalPatterns: patterns.length,
      topPerformingTools: topPerformingTools.map(p => ({
        name: p.toolName,
        taskType: p.taskType,
        successRate: p.successRate,
        frequency: p.frequency
      })),
      mostUsedTools: mostUsedTools.map(p => ({
        name: p.toolName,
        taskType: p.taskType,
        frequency: p.frequency,
        avgDuration: p.averageDuration
      })),
      recentlyUsedTools: recentlyUsedTools.map(p => ({
        name: p.toolName,
        taskType: p.taskType,
        lastUsed: p.lastUsed
      })),
      averageSuccessRate: patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length
    };
  }

  /**
   * Get recommendations for improving tool usage
   */
  getToolOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const patterns = Array.from(this.toolPatterns.values());

    // Find underperforming tools
    const underperforming = patterns.filter(p => p.successRate < 0.7 && p.frequency >= 3);
    for (const pattern of underperforming) {
      recommendations.push(
        `Tool "${pattern.toolName}" for ${pattern.taskType} has low success rate (${Math.round(pattern.successRate * 100)}%). Consider alternative tools or additional training.`
      );
    }

    // Find overused tools
    const totalUsage = patterns.reduce((sum, p) => sum + p.frequency, 0);
    const overused = patterns.filter(p => p.frequency / totalUsage > 0.4);
    for (const pattern of overused) {
      recommendations.push(
        `Tool "${pattern.toolName}" is used in ${Math.round(pattern.frequency / totalUsage * 100)}% of cases. Consider diversifying tool usage for better results.`
      );
    }

    // Find slow tools
    const avgDuration = patterns.reduce((sum, p) => sum + p.averageDuration, 0) / patterns.length;
    const slowTools = patterns.filter(p => p.averageDuration > avgDuration * 2);
    for (const pattern of slowTools) {
      recommendations.push(
        `Tool "${pattern.toolName}" is significantly slower than average (${Math.round(pattern.averageDuration / 1000)}s vs ${Math.round(avgDuration / 1000)}s). Consider optimization or alternatives.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Tool usage patterns are optimized. No immediate recommendations.');
    }

    return recommendations;
  }

  private initializeDefaultTools(): void {
    // Initialize with common MCP tools
    this.availableTools.set('computer', {
      name: 'computer',
      description: 'Computer interaction tool for desktop automation',
      capabilities: ['click', 'type', 'screenshot', 'scroll', 'key']
    });
    
    this.availableTools.set('file_manager', {
      name: 'file_manager',
      description: 'File system operations',
      capabilities: ['read', 'write', 'list', 'create', 'delete']
    });

    this.availableTools.set('web_browser', {
      name: 'web_browser',
      description: 'Web browser automation',
      capabilities: ['navigate', 'click', 'form_fill', 'extract']
    });

    this.availableTools.set('code_editor', {
      name: 'code_editor',
      description: 'Code editing and IDE operations',
      capabilities: ['edit', 'search', 'refactor', 'debug']
    });
  }

  private getCandidateTools(context: TaskContext): string[] {
    // Simple keyword-based tool selection - could be enhanced with ML
    const description = context.description.toLowerCase();
    const candidates: string[] = [];

    if (description.includes('click') || description.includes('screenshot') || description.includes('desktop')) {
      candidates.push('computer');
    }

    if (description.includes('file') || description.includes('folder') || description.includes('document')) {
      candidates.push('file_manager');
    }

    if (description.includes('web') || description.includes('browser') || description.includes('website')) {
      candidates.push('web_browser');
    }

    if (description.includes('code') || description.includes('edit') || description.includes('program')) {
      candidates.push('code_editor');
    }

    // If no specific matches, return all tools
    if (candidates.length === 0) {
      return Array.from(this.availableTools.keys());
    }

    return candidates;
  }

  private scoreToolForContext(toolName: string, context: TaskContext): number {
    const pattern = this.toolPatterns.get(this.getPatternKey(toolName, context.taskType));
    
    if (!pattern) {
      return 0.5; // Neutral score for unknown tools
    }

    let score = 0;

    // Success rate factor (0-0.4)
    score += pattern.successRate * 0.4;

    // Frequency factor (0-0.2) - more used tools get slight preference
    score += Math.min(pattern.frequency / 100, 1) * 0.2;

    // Recency factor (0-0.2) - recently used tools get slight preference
    const daysSinceLastUse = (Date.now() - pattern.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, (7 - daysSinceLastUse) / 7) * 0.2;

    // Context pattern matching (0-0.2)
    const contextPattern = this.extractContextPattern(context);
    if (pattern.contextPatterns.includes(contextPattern)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private getPatternKey(toolName: string, taskType: string): string {
    return `${toolName}:${taskType}`;
  }

  private extractContextPattern(context: TaskContext): string {
    // Extract key patterns from context for matching
    const keywords = context.description
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5)
      .sort()
      .join('_');
    
    return `${context.taskType}_${keywords}`;
  }

  private generateRecommendationReasoning(
    toolName: string,
    context: TaskContext,
    pattern?: ToolUsagePattern
  ): string {
    if (!pattern) {
      return `Recommended based on task type "${context.taskType}" and description keywords.`;
    }

    const reasons: string[] = [];

    if (pattern.successRate > 0.8) {
      reasons.push(`high success rate (${Math.round(pattern.successRate * 100)}%)`);
    }

    if (pattern.frequency > 10) {
      reasons.push(`frequently used (${pattern.frequency} times)`);
    }

    if (pattern.averageDuration < 30000) {
      reasons.push(`fast execution (avg ${Math.round(pattern.averageDuration / 1000)}s)`);
    }

    const daysSinceLastUse = (Date.now() - pattern.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse < 7) {
      reasons.push('recently used successfully');
    }

    return reasons.length > 0 
      ? `Recommended due to ${reasons.join(', ')}.`
      : 'Recommended based on historical patterns.';
  }

  private getDefaultRecommendation(context: TaskContext): ToolRecommendation {
    return {
      toolName: 'computer',
      confidence: 0.5,
      reasoning: 'Default computer tool selected - no strong pattern match found.',
      expectedDuration: 30000,
      alternatives: ['file_manager', 'web_browser']
    };
  }

  private async analyzeFailurePattern(toolName: string, context: TaskContext, error: string): Promise<void> {
    // Simple failure pattern analysis - could be enhanced
    this.logger.debug(`Analyzing failure pattern for ${toolName}: ${error}`);
    
    // This could trigger:
    // 1. Alternative tool suggestions
    // 2. User notifications
    // 3. Automatic retries with different tools
    // 4. Learning updates for future recommendations
  }
}