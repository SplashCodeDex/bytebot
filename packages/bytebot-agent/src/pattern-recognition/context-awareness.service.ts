import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContextAwarenessData,
  IntentionPrediction,
  EnvironmentState,
  HistoricalContext,
  LearningSession,
  UserInteractionSequence,
  AutomationSuggestion,
} from './pattern.types';

@Injectable()
export class ContextAwarenessService {
  private readonly logger = new Logger(ContextAwarenessService.name);
  private readonly currentContext = new Map<string, ContextAwarenessData>();
  private readonly intentionModels = new Map<string, any>();

  constructor(private readonly prisma: PrismaService) {
    this.initializeIntentionModels();
  }

  async updateContext(
    userId: string,
    applicationName: string,
    windowTitle: string,
    activeWorkflowId?: string,
  ): Promise<ContextAwarenessData> {
    const context: ContextAwarenessData = {
      currentApplication: applicationName,
      activeWorkflow: activeWorkflowId,
      userIntentions: await this.predictUserIntentions(
        userId,
        applicationName,
        windowTitle,
      ),
      environmentState: await this.getEnvironmentState(),
      historicalContext: await this.getHistoricalContext(
        userId,
        applicationName,
      ),
    };

    this.currentContext.set(userId, context);
    return context;
  }

  async getContextualSuggestions(
    userId: string,
  ): Promise<AutomationSuggestion[]> {
    const context = this.currentContext.get(userId);
    if (!context) {
      return [];
    }

    const suggestions: AutomationSuggestion[] = [];

    // Intention-based suggestions
    for (const intention of context.userIntentions) {
      if (intention.confidence > 0.7) {
        const intentionSuggestions =
          await this.generateIntentionBasedSuggestions(intention, context);
        suggestions.push(...intentionSuggestions);
      }
    }

    // Historical pattern suggestions
    const historicalSuggestions =
      await this.generateHistoricalSuggestions(context);
    suggestions.push(...historicalSuggestions);

    // Environment-aware suggestions
    const environmentSuggestions =
      await this.generateEnvironmentAwareSuggestions(context);
    suggestions.push(...environmentSuggestions);

    // Smart workflow recommendations
    const workflowSuggestions = await this.suggestOptimalWorkflows(context);
    suggestions.push(...workflowSuggestions);

    return this.rankAndFilterSuggestions(suggestions);
  }

  async predictNextActions(
    userId: string,
    currentActions: string[],
  ): Promise<{ action: string; confidence: number; reasoning: string[] }[]> {
    const context = this.currentContext.get(userId);
    if (!context) {
      return [];
    }

    const predictions: {
      action: string;
      confidence: number;
      reasoning: string[];
    }[] = [];

    // Analyze similar historical sequences
    const similarSequences = await this.findSimilarSequences(
      userId,
      currentActions,
    );

    for (const sequence of similarSequences) {
      const nextActions = this.extractNextActions(
        sequence,
        currentActions.length,
      );

      for (const action of nextActions) {
        const existing = predictions.find((p) => p.action === action.action);
        if (existing) {
          existing.confidence = Math.max(
            existing.confidence,
            action.confidence,
          );
          existing.reasoning.push(...action.reasoning);
        } else {
          predictions.push(action);
        }
      }
    }

    // Intention-based predictions
    for (const intention of context.userIntentions) {
      const intentionActions = await this.predictActionsFromIntention(
        intention,
        currentActions,
      );
      predictions.push(...intentionActions);
    }

    return predictions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  async adaptToUserBehavior(
    userId: string,
    feedback: 'accepted' | 'rejected' | 'modified',
    suggestion: AutomationSuggestion,
    userModifications?: any,
  ): Promise<void> {
    // Update user preference model
    await this.updateUserPreferences(
      userId,
      feedback,
      suggestion,
      userModifications,
    );

    // Adjust intention prediction models
    await this.adjustIntentionModel(userId, feedback, suggestion);

    // Learn from user modifications
    if (feedback === 'modified' && userModifications) {
      await this.learnFromModifications(userId, suggestion, userModifications);
    }

    this.logger.debug(
      `Adapted to user ${userId} behavior: ${feedback} for suggestion ${suggestion.id}`,
    );
  }

  async getPersonalizedInsights(userId: string): Promise<any> {
    const context = this.currentContext.get(userId);
    const userPreferences = await this.getUserPreferences(userId);
    const productivityMetrics = await this.calculateProductivityMetrics(userId);

    return {
      currentContext: context,
      preferences: userPreferences,
      productivity: productivityMetrics,
      opportunities: await this.identifyPersonalizedOpportunities(userId),
      recommendations: await this.generatePersonalizedRecommendations(userId),
      insights: await this.generateBehavioralInsights(userId),
    };
  }

  async optimizeWorkflowTiming(
    userId: string,
    workflowId: string,
  ): Promise<{
    recommendedTime: Date;
    confidence: number;
    reasoning: string[];
  }> {
    const userPatterns = await this.getUserTimePatterns(userId);
    const workflowHistory = await this.getWorkflowExecutionHistory(workflowId);
    const environmentState = await this.getEnvironmentState();

    // Analyze optimal execution times
    const timeAnalysis = this.analyzeOptimalTimes(
      userPatterns,
      workflowHistory,
      environmentState,
    );

    return {
      recommendedTime: timeAnalysis.optimalTime,
      confidence: timeAnalysis.confidence,
      reasoning: [
        `User is most productive at ${timeAnalysis.peakProductivityHour}:00`,
        `Workflow succeeds ${timeAnalysis.successRate}% of the time during this period`,
        `System load is typically ${timeAnalysis.systemLoad} during this time`,
      ],
    };
  }

  private async predictUserIntentions(
    userId: string,
    applicationName: string,
    windowTitle: string,
  ): Promise<IntentionPrediction[]> {
    const intentions: IntentionPrediction[] = [];

    // Application-specific intention detection
    const appIntentions = await this.detectApplicationIntentions(
      applicationName,
      windowTitle,
    );
    intentions.push(...appIntentions);

    // Historical pattern-based intentions
    const historicalIntentions = await this.detectHistoricalIntentions(
      userId,
      applicationName,
    );
    intentions.push(...historicalIntentions);

    // Time-based intentions
    const timeBasedIntentions = await this.detectTimeBasedIntentions(userId);
    intentions.push(...timeBasedIntentions);

    return intentions.sort((a, b) => b.confidence - a.confidence);
  }

  private async getEnvironmentState(): Promise<EnvironmentState> {
    const now = new Date();

    return {
      timeOfDay: this.getTimeOfDay(now),
      dayOfWeek: now
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toLowerCase(),
      systemLoad: await this.getSystemLoad(),
      networkQuality: await this.assessNetworkQuality(),
      concurrentTasks: await this.getConcurrentTaskCount(),
    };
  }

  private async getHistoricalContext(
    userId: string,
    applicationName: string,
  ): Promise<HistoricalContext> {
    const [
      similarSessions,
      frequentPatterns,
      commonErrors,
      performanceBaselines,
    ] = await Promise.all([
      this.getSimilarSessions(userId, applicationName),
      this.getFrequentPatterns(userId, applicationName),
      this.getCommonErrors(userId, applicationName),
      this.getPerformanceBaselines(applicationName),
    ]);

    return {
      similarSessions,
      frequentPatterns,
      commonErrors,
      performanceBaselines,
    };
  }

  private async generateIntentionBasedSuggestions(
    intention: IntentionPrediction,
    context: ContextAwarenessData,
  ): Promise<AutomationSuggestion[]> {
    const suggestions: AutomationSuggestion[] = [];

    switch (intention.intention) {
      case 'data_entry':
        suggestions.push({
          id: this.generateId(),
          type: 'workflow_creation',
          title: 'Automate Data Entry Process',
          description:
            'Create a workflow to automate repetitive data entry tasks',
          confidence: intention.confidence,
          impact: 'high',
          effort: 'medium',
          category: 'data_automation',
          actions: [
            {
              type: 'create_workflow',
              description: 'Set up automated data entry workflow',
              parameters: { intention: intention.intention },
              automatable: true,
            },
          ],
          benefits: [
            'Faster data entry',
            'Reduced errors',
            'Consistent formatting',
          ],
          risks: ['Data validation needed', 'Source format changes'],
        });
        break;

      case 'report_generation':
        suggestions.push({
          id: this.generateId(),
          type: 'workflow_creation',
          title: 'Automate Report Generation',
          description: 'Create automated reporting workflow',
          confidence: intention.confidence,
          impact: 'high',
          effort: 'medium',
          category: 'reporting',
          actions: [
            {
              type: 'create_workflow',
              description: 'Set up automated report generation',
              parameters: { intention: intention.intention },
              automatable: true,
            },
          ],
          benefits: [
            'Scheduled reports',
            'Consistent formatting',
            'Time savings',
          ],
          risks: ['Data source dependencies', 'Format requirements'],
        });
        break;
    }

    return suggestions;
  }

  private async generateHistoricalSuggestions(
    context: ContextAwarenessData,
  ): Promise<AutomationSuggestion[]> {
    const suggestions: AutomationSuggestion[] = [];

    // Analyze frequent patterns for automation opportunities
    for (const pattern of context.historicalContext.frequentPatterns) {
      if (pattern.confidence > 0.8) {
        suggestions.push({
          id: this.generateId(),
          type: 'pattern_learning',
          title: `Automate Frequent ${pattern.type} Pattern`,
          description: `This pattern occurs frequently and could be automated`,
          confidence: pattern.confidence,
          impact: 'medium',
          effort: 'low',
          category: 'pattern_automation',
          actions: [
            {
              type: 'add_pattern',
              description: 'Add this pattern to automation library',
              parameters: { pattern },
              automatable: true,
            },
          ],
          benefits: [
            'Reuse existing patterns',
            'Quick setup',
            'Proven reliability',
          ],
          risks: ['Pattern changes over time'],
        });
      }
    }

    return suggestions;
  }

  private async generateEnvironmentAwareSuggestions(
    context: ContextAwarenessData,
  ): Promise<AutomationSuggestion[]> {
    const suggestions: AutomationSuggestion[] = [];

    // Suggest optimizations based on current environment
    if (context.environmentState.systemLoad > 0.8) {
      suggestions.push({
        id: this.generateId(),
        type: 'optimization',
        title: 'Optimize for High System Load',
        description:
          'System load is high, consider scheduling intensive tasks for later',
        confidence: 0.9,
        impact: 'medium',
        effort: 'low',
        category: 'performance',
        actions: [
          {
            type: 'add_validation',
            description: 'Add system load checks to workflows',
            parameters: { maxLoad: 0.8 },
            automatable: true,
          },
        ],
        benefits: ['Better performance', 'Reduced system impact'],
        risks: ['Delayed execution'],
      });
    }

    if (context.environmentState.networkQuality === 'poor') {
      suggestions.push({
        id: this.generateId(),
        type: 'optimization',
        title: 'Adapt to Poor Network',
        description:
          'Network quality is poor, consider offline-capable workflows',
        confidence: 0.8,
        impact: 'medium',
        effort: 'medium',
        category: 'reliability',
        actions: [
          {
            type: 'add_validation',
            description: 'Add network quality checks and retry logic',
            parameters: { minQuality: 'fair' },
            automatable: true,
          },
        ],
        benefits: ['Better reliability', 'Graceful degradation'],
        risks: ['Increased complexity'],
      });
    }

    return suggestions;
  }

  private async suggestOptimalWorkflows(
    context: ContextAwarenessData,
  ): Promise<AutomationSuggestion[]> {
    const suggestions: AutomationSuggestion[] = [];

    // Suggest workflows based on current application and intentions
    const optimalWorkflows = await this.findOptimalWorkflows(
      context.currentApplication,
      context.userIntentions,
      context.environmentState,
    );

    for (const workflow of optimalWorkflows) {
      suggestions.push({
        id: this.generateId(),
        type: 'workflow_creation',
        title: `Use Optimized ${workflow.name} Workflow`,
        description: `This workflow is optimized for your current context`,
        confidence: workflow.matchScore,
        impact: workflow.impact,
        effort: 'low',
        category: 'workflow_optimization',
        actions: [
          {
            type: 'create_workflow',
            description: 'Apply optimized workflow template',
            parameters: { workflowTemplate: workflow },
            automatable: true,
          },
        ],
        benefits: workflow.benefits,
        risks: workflow.risks,
      });
    }

    return suggestions;
  }

  private rankAndFilterSuggestions(
    suggestions: AutomationSuggestion[],
  ): AutomationSuggestion[] {
    // Remove duplicates
    const unique = suggestions.filter(
      (suggestion, index, self) =>
        index === self.findIndex((s) => s.title === suggestion.title),
    );

    // Sort by relevance score (combination of confidence and impact)
    return unique
      .map((s) => ({
        ...s,
        relevanceScore: this.calculateRelevanceScore(s),
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10); // Top 10 suggestions
  }

  private calculateRelevanceScore(suggestion: AutomationSuggestion): number {
    const confidenceWeight = 0.4;
    const impactWeight = 0.3;
    const effortWeight = 0.3;

    const impactScore =
      suggestion.impact === 'high'
        ? 1
        : suggestion.impact === 'medium'
          ? 0.6
          : 0.3;
    const effortScore =
      suggestion.effort === 'low'
        ? 1
        : suggestion.effort === 'medium'
          ? 0.6
          : 0.3;

    return (
      suggestion.confidence * confidenceWeight +
      impactScore * impactWeight +
      effortScore * effortWeight
    );
  }

  private async detectApplicationIntentions(
    applicationName: string,
    windowTitle: string,
  ): Promise<IntentionPrediction[]> {
    const intentions: IntentionPrediction[] = [];

    // Rule-based intention detection
    const lowerTitle = windowTitle.toLowerCase();

    if (lowerTitle.includes('email') || lowerTitle.includes('inbox')) {
      intentions.push({
        intention: 'email_management',
        confidence: 0.8,
        evidence: ['Window title contains email keywords'],
        suggestedNextSteps: [
          'Check for repetitive email actions',
          'Suggest email templates',
        ],
      });
    }

    if (lowerTitle.includes('excel') || lowerTitle.includes('spreadsheet')) {
      intentions.push({
        intention: 'data_entry',
        confidence: 0.9,
        evidence: ['Working with spreadsheet application'],
        suggestedNextSteps: [
          'Monitor for data entry patterns',
          'Suggest automation workflows',
        ],
      });
    }

    return intentions;
  }

  private async detectHistoricalIntentions(
    userId: string,
    applicationName: string,
  ): Promise<IntentionPrediction[]> {
    // Analyze user's historical behavior in this application
    return [];
  }

  private async detectTimeBasedIntentions(
    userId: string,
  ): Promise<IntentionPrediction[]> {
    const now = new Date();
    const hour = now.getHours();
    const intentions: IntentionPrediction[] = [];

    // Morning intentions (8-12)
    if (hour >= 8 && hour < 12) {
      intentions.push({
        intention: 'morning_routine',
        confidence: 0.7,
        evidence: ['Morning hours - typical for email and planning tasks'],
        suggestedNextSteps: [
          'Check email automation',
          'Daily planning workflows',
        ],
      });
    }

    // Afternoon intentions (13-17)
    if (hour >= 13 && hour < 17) {
      intentions.push({
        intention: 'productive_work',
        confidence: 0.8,
        evidence: ['Afternoon hours - peak productivity time'],
        suggestedNextSteps: [
          'Focus on complex automation tasks',
          'Data processing workflows',
        ],
      });
    }

    return intentions;
  }

  private getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private async getSystemLoad(): Promise<number> {
    // In a real implementation, this would check actual system metrics
    return Math.random() * 0.8; // Mock value
  }

  private async assessNetworkQuality(): Promise<
    'poor' | 'fair' | 'good' | 'excellent'
  > {
    // Mock network quality assessment
    const qualities: ('poor' | 'fair' | 'good' | 'excellent')[] = [
      'poor',
      'fair',
      'good',
      'excellent',
    ];
    return qualities[Math.floor(Math.random() * qualities.length)];
  }

  private async getConcurrentTaskCount(): Promise<number> {
    // Mock concurrent task count
    return Math.floor(Math.random() * 5);
  }

  // Additional helper methods would be implemented here...
  private async initializeIntentionModels(): Promise<void> {
    this.logger.debug('Initializing intention prediction models');
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Placeholder implementations for other methods
  private async findSimilarSequences(
    userId: string,
    currentActions: string[],
  ): Promise<any[]> {
    return [];
  }
  private async updateUserPreferences(
    userId: string,
    feedback: string,
    suggestion: any,
    modifications?: any,
  ): Promise<void> {}
  private async adjustIntentionModel(
    userId: string,
    feedback: string,
    suggestion: any,
  ): Promise<void> {}
  private async learnFromModifications(
    userId: string,
    suggestion: any,
    modifications: any,
  ): Promise<void> {}
  private async getUserPreferences(userId: string): Promise<any> {
    return {};
  }
  private async calculateProductivityMetrics(userId: string): Promise<any> {
    return {};
  }
  private async identifyPersonalizedOpportunities(
    userId: string,
  ): Promise<any[]> {
    return [];
  }
  private async generatePersonalizedRecommendations(
    userId: string,
  ): Promise<any[]> {
    return [];
  }
  private async generateBehavioralInsights(userId: string): Promise<any[]> {
    return [];
  }
  private async getUserTimePatterns(userId: string): Promise<any> {
    return {};
  }
  private async getWorkflowExecutionHistory(
    workflowId: string,
  ): Promise<any[]> {
    return [];
  }
  private analyzeOptimalTimes(
    userPatterns: any,
    workflowHistory: any[],
    environmentState: any,
  ): any {
    return {};
  }
  private async getSimilarSessions(
    userId: string,
    applicationName: string,
  ): Promise<any[]> {
    return [];
  }
  private async getFrequentPatterns(
    userId: string,
    applicationName: string,
  ): Promise<any[]> {
    return [];
  }
  private async getCommonErrors(
    userId: string,
    applicationName: string,
  ): Promise<any[]> {
    return [];
  }
  private async getPerformanceBaselines(
    applicationName: string,
  ): Promise<any[]> {
    return [];
  }
  private async findOptimalWorkflows(
    applicationName: string,
    intentions: any[],
    environmentState: any,
  ): Promise<any[]> {
    return [];
  }
  private extractNextActions(sequence: any, currentLength: number): any[] {
    return [];
  }
  private async predictActionsFromIntention(
    intention: any,
    currentActions: string[],
  ): Promise<any[]> {
    return [];
  }
}
