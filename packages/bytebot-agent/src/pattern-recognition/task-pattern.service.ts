import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Task, TaskStatus, Message } from '@prisma/client';

export interface TaskPattern {
  id: string;
  description: string;
  commonActions: string[];
  averageDuration: number;
  successRate: number;
  failureReasons: string[];
  suggestedOptimizations: string[];
  frequency: number;
  lastSeen: Date;
}

export interface TaskSuggestion {
  type: 'automation' | 'workflow' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  estimatedTimeSavings: number;
  basedOnTasks: string[];
}

@Injectable()
export class TaskPatternService {
  private readonly logger = new Logger(TaskPatternService.name);
  private patterns = new Map<string, TaskPattern>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze task patterns and extract insights
   */
  async analyzeTaskPatterns(): Promise<TaskPattern[]> {
    this.logger.log('Starting task pattern analysis');

    // Get completed tasks from the last 30 days
    const tasks = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.COMPLETED,
        completedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
        }
      },
      include: {
        messages: true
      }
    });

    // Group tasks by similar descriptions
    const taskGroups = this.groupSimilarTasks(tasks);
    
    // Analyze each group for patterns
    const patterns: TaskPattern[] = [];
    for (const [patternId, groupTasks] of taskGroups) {
      const pattern = await this.analyzeTaskGroup(patternId, groupTasks);
      patterns.push(pattern);
      this.patterns.set(patternId, pattern);
    }

    this.logger.log(`Identified ${patterns.length} task patterns`);
    return patterns;
  }

  /**
   * Generate suggestions based on identified patterns
   */
  async generateSuggestions(): Promise<TaskSuggestion[]> {
    const patterns = Array.from(this.patterns.values());
    const suggestions: TaskSuggestion[] = [];

    for (const pattern of patterns) {
      // Suggest automation for frequently repeated tasks
      if (pattern.frequency >= 5 && pattern.successRate > 0.8) {
        suggestions.push({
          type: 'automation',
          title: `Automate "${pattern.description}"`,
          description: `This task has been completed ${pattern.frequency} times with ${Math.round(pattern.successRate * 100)}% success rate. Consider creating an automated workflow.`,
          confidence: Math.min(pattern.frequency / 10, 1) * pattern.successRate,
          estimatedTimeSavings: pattern.averageDuration * pattern.frequency * 0.8,
          basedOnTasks: [pattern.id]
        });
      }

      // Suggest optimizations for slow tasks
      if (pattern.averageDuration > 300000 && pattern.successRate < 0.7) { // 5 minutes
        suggestions.push({
          type: 'optimization',
          title: `Optimize "${pattern.description}"`,
          description: `This task takes an average of ${Math.round(pattern.averageDuration / 60000)} minutes with ${Math.round(pattern.successRate * 100)}% success rate. Common issues: ${pattern.failureReasons.slice(0, 2).join(', ')}.`,
          confidence: (1 - pattern.successRate) * Math.min(pattern.frequency / 5, 1),
          estimatedTimeSavings: pattern.averageDuration * 0.3,
          basedOnTasks: [pattern.id]
        });
      }
    }

    // Sort by confidence and potential impact
    return suggestions.sort((a, b) => 
      (b.confidence * b.estimatedTimeSavings) - (a.confidence * a.estimatedTimeSavings)
    ).slice(0, 10);
  }

  /**
   * Record task completion for pattern learning
   */
  async recordTaskCompletion(taskId: string, duration: number, success: boolean, errorReason?: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { messages: true }
    });

    if (!task) return;

    const patternId = this.generatePatternId(task.description);
    const pattern = this.patterns.get(patternId);

    if (pattern) {
      // Update existing pattern
      pattern.frequency++;
      pattern.averageDuration = (pattern.averageDuration + duration) / 2;
      pattern.successRate = (pattern.successRate * (pattern.frequency - 1) + (success ? 1 : 0)) / pattern.frequency;
      pattern.lastSeen = new Date();

      if (!success && errorReason) {
        pattern.failureReasons.push(errorReason);
      }
    } else {
      // Create new pattern
      this.patterns.set(patternId, {
        id: patternId,
        description: task.description,
        commonActions: this.extractCommonActions(task.messages),
        averageDuration: duration,
        successRate: success ? 1 : 0,
        failureReasons: !success && errorReason ? [errorReason] : [],
        suggestedOptimizations: [],
        frequency: 1,
        lastSeen: new Date()
      });
    }
  }

  private groupSimilarTasks(tasks: (Task & { messages: Message[] })[]): Map<string, (Task & { messages: Message[] })[]> {
    const groups = new Map<string, (Task & { messages: Message[] })[]>();

    for (const task of tasks) {
      const patternId = this.generatePatternId(task.description);
      
      if (!groups.has(patternId)) {
        groups.set(patternId, []);
      }
      groups.get(patternId)!.push(task);
    }

    return groups;
  }

  private generatePatternId(description: string): string {
    // Normalize and hash the description to create pattern groups
    const normalized = description
      .toLowerCase()
      .replace(/\d+/g, 'NUMBER') // Replace numbers with placeholder
      .replace(/[^\w\s]/g, '') // Remove special characters
      .split(' ')
      .filter(word => word.length > 2) // Remove short words
      .sort()
      .join('_');

    return normalized || 'generic_task';
  }

  private async analyzeTaskGroup(patternId: string, tasks: (Task & { messages: Message[] })[]): Promise<TaskPattern> {
    const durations = tasks.map(task => {
      if (task.completedAt && task.createdAt) {
        return task.completedAt.getTime() - task.createdAt.getTime();
      }
      return 0;
    }).filter(d => d > 0);

    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const successRate = tasks.length > 0 ? tasks.filter(t => t.status === TaskStatus.COMPLETED).length / tasks.length : 0;

    // Extract common actions from messages
    const allActions: string[] = [];
    for (const task of tasks) {
      allActions.push(...this.extractCommonActions(task.messages));
    }

    const actionFrequency = new Map<string, number>();
    for (const action of allActions) {
      actionFrequency.set(action, (actionFrequency.get(action) || 0) + 1);
    }

    const commonActions = Array.from(actionFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action]) => action);

    return {
      id: patternId,
      description: tasks[0]?.description || patternId,
      commonActions,
      averageDuration,
      successRate,
      failureReasons: this.extractFailureReasons(tasks.filter(t => t.status === 'FAILED')),
      suggestedOptimizations: [],
      frequency: tasks.length,
      lastSeen: new Date(Math.max(...tasks.map(t => t.createdAt.getTime())))
    };
  }

  private extractCommonActions(messages: Message[]): string[] {
    const actions: string[] = [];
    
    for (const message of messages) {
      if (Array.isArray(message.content)) {
        for (const block of message.content as any[]) {
          if (block.type === 'tool_use' && block.name === 'computer') {
            actions.push(block.input?.action || 'unknown');
          }
        }
      }
    }

    return actions;
  }

  private extractFailureReasons(failedTasks: any[]): string[] {
    const reasons = new Set<string>();
    
    for (const task of failedTasks) {
      // Extract error messages from task messages
      if (task.messages) {
        for (const message of task.messages) {
          if (message.role === 'assistant' && message.content) {
            // Look for error indicators in assistant messages
            const content = typeof message.content === 'string' ? message.content : 
              Array.isArray(message.content) ? message.content.map(c => c.text || '').join(' ') : '';
            
            if (content.toLowerCase().includes('error') || 
                content.toLowerCase().includes('failed') ||
                content.toLowerCase().includes('unable')) {
              // Extract common failure patterns
              const errorPatterns = [
                /error[:\s]+([^.!?]+)/i,
                /failed[:\s]+([^.!?]+)/i,
                /unable[:\s]+([^.!?]+)/i,
                /cannot[:\s]+([^.!?]+)/i
              ];
              
              for (const pattern of errorPatterns) {
                const match = content.match(pattern);
                if (match && match[1]) {
                  reasons.add(match[1].trim());
                }
              }
            }
          }
        }
      }
      
      // Also check task error field if it exists
      if (task.error) {
        reasons.add(task.error);
      }
    }
    
    return Array.from(reasons).slice(0, 10); // Limit to top 10 reasons
  }

  /**
   * Get pattern statistics for monitoring
   */
  getPatternStats() {
    const patterns = Array.from(this.patterns.values());
    
    return {
      totalPatterns: patterns.length,
      mostFrequent: patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 5),
      highestSuccessRate: patterns.sort((a, b) => b.successRate - a.successRate).slice(0, 5),
      averageSuccessRate: patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length,
      totalTasksAnalyzed: patterns.reduce((sum, p) => sum + p.frequency, 0)
    };
  }
}