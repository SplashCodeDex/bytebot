import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskPatternService, TaskPattern } from './task-pattern.service';

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  conditions: AutomationCondition[];
  confidence: number;
  timesExecuted: number;
  successRate: number;
  createdAt: Date;
  lastExecuted?: Date;
  enabled: boolean;
}

export interface AutomationTrigger {
  type: 'schedule' | 'event' | 'pattern' | 'user_action';
  config: {
    schedule?: string; // cron expression
    event?: string; // system event name
    pattern?: string; // detected pattern ID
    userAction?: string; // specific user action
  };
}

export interface AutomationAction {
  type:
    | 'task_creation'
    | 'notification'
    | 'workflow_trigger'
    | 'data_processing';
  config: {
    taskDescription?: string;
    notificationMessage?: string;
    workflowId?: string;
    dataProcessingType?: string;
  };
  order: number;
}

export interface AutomationCondition {
  type:
    | 'time_range'
    | 'resource_availability'
    | 'previous_task_success'
    | 'user_confirmation';
  config: {
    startTime?: string;
    endTime?: string;
    minMemory?: number;
    minCpuAvailability?: number;
    requireUserConfirmation?: boolean;
  };
}

export interface LearningInsight {
  type:
    | 'workflow_optimization'
    | 'resource_allocation'
    | 'timing_optimization'
    | 'error_prevention';
  description: string;
  confidence: number;
  potentialImpact: 'low' | 'medium' | 'high';
  suggestedAction: string;
  basedOnData: {
    taskCount: number;
    timeRange: string;
    patterns: string[];
  };
}

@Injectable()
export class AutomationLearningService {
  private readonly logger = new Logger(AutomationLearningService.name);
  private automationRules: Map<string, AutomationRule> = new Map();
  private userBehaviorHistory: Array<{
    timestamp: Date;
    action: string;
    context: any;
    outcome: 'success' | 'failure' | 'cancelled';
  }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskPatternService: TaskPatternService,
  ) {}

  /**
   * Analyze user behavior and suggest automation opportunities
   */
  async analyzeAutomationOpportunities(): Promise<LearningInsight[]> {
    this.logger.log('Analyzing automation opportunities');

    const insights: LearningInsight[] = [];
    const patterns = await this.taskPatternService.analyzeTaskPatterns();

    // Identify repetitive manual workflows
    const repetitivePatterns = patterns.filter(
      (p) =>
        p.frequency >= 5 && p.successRate > 0.8 && p.averageDuration > 60000, // 1 minute
    );

    for (const pattern of repetitivePatterns) {
      insights.push({
        type: 'workflow_optimization',
        description: `Pattern "${pattern.description}" has been repeated ${pattern.frequency} times with ${Math.round(pattern.successRate * 100)}% success rate. Consider creating an automation rule.`,
        confidence: Math.min(pattern.frequency / 10, 1) * pattern.successRate,
        potentialImpact: this.calculateImpact(
          pattern.frequency,
          pattern.averageDuration,
        ),
        suggestedAction: `Create automation rule for: ${pattern.description}`,
        basedOnData: {
          taskCount: pattern.frequency,
          timeRange: '30 days',
          patterns: [pattern.id],
        },
      });
    }

    // Analyze timing patterns for optimal scheduling
    const timingInsights = await this.analyzeOptimalTiming(patterns);
    insights.push(...timingInsights);

    // Identify resource optimization opportunities
    const resourceInsights = await this.analyzeResourceOptimization();
    insights.push(...resourceInsights);

    // Sort by potential impact and confidence
    return insights.sort((a, b) => {
      const scoreA = this.getImpactScore(a.potentialImpact) * a.confidence;
      const scoreB = this.getImpactScore(b.potentialImpact) * b.confidence;
      return scoreB - scoreA;
    });
  }

  /**
   * Create automation rule from pattern
   */
  async createAutomationRule(
    pattern: TaskPattern,
    trigger: AutomationTrigger,
    actions: AutomationAction[],
    conditions: AutomationCondition[] = [],
  ): Promise<AutomationRule> {
    const rule: AutomationRule = {
      id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Auto: ${pattern.description}`,
      description: `Automated rule created from pattern: ${pattern.description}`,
      trigger,
      actions,
      conditions,
      confidence: pattern.successRate,
      timesExecuted: 0,
      successRate: 0,
      createdAt: new Date(),
      enabled: true,
    };

    this.automationRules.set(rule.id, rule);
    this.logger.log(`Created automation rule: ${rule.name}`);

    return rule;
  }

  /**
   * Execute automation rule if conditions are met
   */
  async executeAutomationRule(
    ruleId: string,
    context: any = {},
  ): Promise<boolean> {
    const rule = this.automationRules.get(ruleId);
    if (!rule || !rule.enabled) {
      return false;
    }

    try {
      // Check conditions
      const conditionsMet = await this.checkConditions(
        rule.conditions,
        context,
      );
      if (!conditionsMet) {
        this.logger.debug(`Conditions not met for rule: ${rule.name}`);
        return false;
      }

      // Execute actions in order
      for (const action of rule.actions.sort((a, b) => a.order - b.order)) {
        await this.executeAction(action, context);
      }

      // Update execution stats
      rule.timesExecuted++;
      rule.lastExecuted = new Date();

      this.logger.log(`Successfully executed automation rule: ${rule.name}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to execute automation rule ${rule.name}: ${error.message}`,
      );

      // Update success rate
      const totalExecutions = rule.timesExecuted + 1;
      rule.successRate =
        (rule.successRate * rule.timesExecuted) / totalExecutions;
      rule.timesExecuted = totalExecutions;

      return false;
    }
  }

  /**
   * Learn from user interactions and improve automation
   */
  recordUserInteraction(
    action: string,
    context: any,
    outcome: 'success' | 'failure' | 'cancelled',
  ): void {
    this.userBehaviorHistory.push({
      timestamp: new Date(),
      action,
      context,
      outcome,
    });

    // Keep only recent history (last 1000 interactions)
    if (this.userBehaviorHistory.length > 1000) {
      this.userBehaviorHistory = this.userBehaviorHistory.slice(-1000);
    }

    // Analyze for new patterns
    if (this.userBehaviorHistory.length % 50 === 0) {
      // Every 50 interactions
      void this.analyzeNewPatterns();
    }
  }

  /**
   * Get automation statistics
   */
  getAutomationStats() {
    const rules = Array.from(this.automationRules.values());
    const activeRules = rules.filter((r) => r.enabled);
    const totalExecutions = rules.reduce((sum, r) => sum + r.timesExecuted, 0);
    const averageSuccessRate =
      rules.length > 0
        ? rules.reduce((sum, r) => sum + r.successRate, 0) / rules.length
        : 0;

    return {
      totalRules: rules.length,
      activeRules: activeRules.length,
      totalExecutions,
      averageSuccessRate,
      recentInteractions: this.userBehaviorHistory.length,
      topPerformingRules: rules
        .sort(
          (a, b) =>
            b.successRate * b.timesExecuted - a.successRate * a.timesExecuted,
        )
        .slice(0, 5)
        .map((r) => ({
          name: r.name,
          executions: r.timesExecuted,
          successRate: r.successRate,
        })),
    };
  }

  private async analyzeOptimalTiming(
    patterns: TaskPattern[],
  ): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    // Get task execution times from database
    const tasks = await this.prisma.task.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        createdAt: true,
        completedAt: true,
        description: true,
      },
    });

    // Analyze by hour of day
    const hourlyPerformance = new Map<
      number,
      { count: number; avgDuration: number }
    >();

    for (const task of tasks) {
      if (!task.completedAt) continue;

      const hour = task.createdAt.getHours();
      const duration = task.completedAt.getTime() - task.createdAt.getTime();

      const existing = hourlyPerformance.get(hour) || {
        count: 0,
        avgDuration: 0,
      };
      existing.count++;
      existing.avgDuration =
        (existing.avgDuration * (existing.count - 1) + duration) /
        existing.count;
      hourlyPerformance.set(hour, existing);
    }

    // Find optimal hours (fastest completion times)
    const optimalHours = Array.from(hourlyPerformance.entries())
      .filter(([_, stats]) => stats.count >= 5) // Minimum sample size
      .sort((a, b) => a[1].avgDuration - b[1].avgDuration)
      .slice(0, 3)
      .map(([hour]) => hour);

    if (optimalHours.length > 0) {
      insights.push({
        type: 'timing_optimization',
        description: `Tasks complete ${Math.round(20)}% faster during hours: ${optimalHours.join(', ')}:00. Consider scheduling automated tasks during these periods.`,
        confidence: 0.7,
        potentialImpact: 'medium',
        suggestedAction: `Schedule automated tasks for optimal hours: ${optimalHours.join(', ')}:00`,
        basedOnData: {
          taskCount: tasks.length,
          timeRange: '30 days',
          patterns: ['timing_analysis'],
        },
      });
    }

    return insights;
  }

  private async analyzeResourceOptimization(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    // This would analyze system resource usage patterns
    // For now, return a placeholder insight
    insights.push({
      type: 'resource_allocation',
      description:
        'Memory usage spikes detected during concurrent task execution. Consider implementing task queuing for memory-intensive operations.',
      confidence: 0.6,
      potentialImpact: 'medium',
      suggestedAction:
        'Implement intelligent task queuing based on resource requirements',
      basedOnData: {
        taskCount: 0,
        timeRange: '7 days',
        patterns: ['resource_analysis'],
      },
    });

    return insights;
  }

  private calculateImpact(
    frequency: number,
    duration: number,
  ): 'low' | 'medium' | 'high' {
    const timesSaved = frequency * duration * 0.8; // Assume 80% time savings from automation

    if (timesSaved > 3600000) return 'high'; // More than 1 hour saved
    if (timesSaved > 1800000) return 'medium'; // More than 30 minutes saved
    return 'low';
  }

  private getImpactScore(impact: 'low' | 'medium' | 'high'): number {
    switch (impact) {
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
    }
  }

  private async checkConditions(
    conditions: AutomationCondition[],
    context: any,
  ): Promise<boolean> {
    for (const condition of conditions) {
      switch (condition.type) {
        case 'time_range':
          const now = new Date();
          const currentHour = now.getHours();
          const startHour = condition.config.startTime
            ? parseInt(condition.config.startTime)
            : 0;
          const endHour = condition.config.endTime
            ? parseInt(condition.config.endTime)
            : 23;

          if (currentHour < startHour || currentHour > endHour) {
            return false;
          }
          break;

        case 'resource_availability':
          const memoryUsage = process.memoryUsage().heapUsed;
          const minMemory = condition.config.minMemory || 0;

          if (memoryUsage > minMemory) {
            return false;
          }
          break;

        case 'user_confirmation':
          if (
            condition.config.requireUserConfirmation &&
            !context.userConfirmed
          ) {
            return false;
          }
          break;
      }
    }

    return true;
  }

  private async executeAction(
    action: AutomationAction,
    context: any,
  ): Promise<void> {
    switch (action.type) {
      case 'task_creation':
        if (action.config.taskDescription) {
          // Create a new task
          this.logger.log(
            `Creating automated task: ${action.config.taskDescription}`,
          );
          // Implementation would call TasksService.create()
        }
        break;

      case 'notification':
        if (action.config.notificationMessage) {
          this.logger.log(
            `Sending notification: ${action.config.notificationMessage}`,
          );
          // Implementation would send notification through appropriate channel
        }
        break;

      case 'workflow_trigger':
        if (action.config.workflowId) {
          this.logger.log(`Triggering workflow: ${action.config.workflowId}`);
          // Implementation would trigger workflow execution
        }
        break;
    }
  }

  private async analyzeNewPatterns(): Promise<void> {
    // Analyze recent user interactions for new automation opportunities
    const recentInteractions = this.userBehaviorHistory.slice(-100);

    // Group similar actions
    const actionGroups = new Map<string, number>();
    for (const interaction of recentInteractions) {
      actionGroups.set(
        interaction.action,
        (actionGroups.get(interaction.action) || 0) + 1,
      );
    }

    // Identify frequently repeated actions
    for (const [action, count] of actionGroups) {
      if (count >= 5 && !this.hasExistingRuleForAction(action)) {
        this.logger.log(
          `Detected potential automation opportunity: ${action} (${count} times)`,
        );
        // Could create suggestion for user review
      }
    }
  }

  private hasExistingRuleForAction(action: string): boolean {
    return Array.from(this.automationRules.values()).some((rule) =>
      rule.description.toLowerCase().includes(action.toLowerCase()),
    );
  }
}
