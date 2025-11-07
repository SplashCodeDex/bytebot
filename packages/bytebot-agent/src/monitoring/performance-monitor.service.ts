import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Task, TaskStatus } from '@prisma/client';

export interface PerformanceMetrics {
  taskId: string;
  duration: number;
  tokenUsage: number;
  iterationCount: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: Date;
}

export interface PerformanceReport {
  averageTaskDuration: number;
  averageTokenUsage: number;
  averageIterations: number;
  taskThroughput: number; // tasks per hour
  bottlenecks: BottleneckReport[];
  recommendations: string[];
}

export interface BottleneckReport {
  type: 'memory' | 'cpu' | 'token_usage' | 'iteration_count';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedTasks: string[];
  suggestedActions: string[];
}

@Injectable()
export class PerformanceMonitorService {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetricsHistory = 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record performance metrics for a task iteration
   */
  recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only recent metrics to prevent memory growth
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Log warnings for concerning metrics
    this.checkForPerformanceIssues(metrics);
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(timeRangeHours: number = 24): Promise<PerformanceReport> {
    const since = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= since);

    if (recentMetrics.length === 0) {
      return {
        averageTaskDuration: 0,
        averageTokenUsage: 0,
        averageIterations: 0,
        taskThroughput: 0,
        bottlenecks: [],
        recommendations: ['No recent performance data available']
      };
    }

    // Calculate averages
    const averageTaskDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const averageTokenUsage = recentMetrics.reduce((sum, m) => sum + m.tokenUsage, 0) / recentMetrics.length;
    const averageIterations = recentMetrics.reduce((sum, m) => sum + m.iterationCount, 0) / recentMetrics.length;
    
    // Calculate throughput (unique tasks per hour)
    const uniqueTasks = new Set(recentMetrics.map(m => m.taskId));
    const taskThroughput = uniqueTasks.size / timeRangeHours;

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(recentMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(recentMetrics, bottlenecks);

    return {
      averageTaskDuration,
      averageTokenUsage,
      averageIterations,
      taskThroughput,
      bottlenecks,
      recommendations
    };
  }

  /**
   * Get real-time performance stats
   */
  getRealTimeStats() {
    const recentMetrics = this.metrics.slice(-10); // Last 10 measurements
    
    if (recentMetrics.length === 0) {
      return null;
    }

    return {
      currentMemoryUsage: recentMetrics[recentMetrics.length - 1]?.memoryUsage || 0,
      currentCpuUsage: recentMetrics[recentMetrics.length - 1]?.cpuUsage || 0,
      averageIterationTime: recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length,
      averageTokensPerIteration: recentMetrics.reduce((sum, m) => sum + m.tokenUsage, 0) / recentMetrics.length,
      activeTasks: new Set(recentMetrics.map(m => m.taskId)).size
    };
  }

  /**
   * Check for immediate performance issues
   */
  private checkForPerformanceIssues(metrics: PerformanceMetrics): void {
    // High memory usage warning
    if (metrics.memoryUsage > 1024 * 1024 * 1024) { // 1GB
      this.logger.warn(`High memory usage detected for task ${metrics.taskId}: ${Math.round(metrics.memoryUsage / 1024 / 1024)}MB`);
    }

    // High CPU usage warning
    if (metrics.cpuUsage > 80) {
      this.logger.warn(`High CPU usage detected for task ${metrics.taskId}: ${metrics.cpuUsage}%`);
    }

    // Long duration warning
    if (metrics.duration > 60000) { // 1 minute per iteration
      this.logger.warn(`Long iteration duration for task ${metrics.taskId}: ${Math.round(metrics.duration / 1000)}s`);
    }

    // High token usage warning
    if (metrics.tokenUsage > 100000) {
      this.logger.warn(`High token usage for task ${metrics.taskId}: ${metrics.tokenUsage} tokens`);
    }
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(metrics: PerformanceMetrics[]): BottleneckReport[] {
    const bottlenecks: BottleneckReport[] = [];

    // Memory bottleneck analysis
    const highMemoryTasks = metrics.filter(m => m.memoryUsage > 512 * 1024 * 1024); // 512MB
    if (highMemoryTasks.length > metrics.length * 0.2) { // 20% of tasks
      bottlenecks.push({
        type: 'memory',
        severity: 'high',
        description: `${highMemoryTasks.length} tasks are using excessive memory (>512MB)`,
        affectedTasks: [...new Set(highMemoryTasks.map(m => m.taskId))],
        suggestedActions: [
          'Implement more aggressive summarization',
          'Clear message history more frequently',
          'Optimize data structures'
        ]
      });
    }

    // Token usage bottleneck
    const highTokenTasks = metrics.filter(m => m.tokenUsage > 50000);
    if (highTokenTasks.length > metrics.length * 0.15) {
      bottlenecks.push({
        type: 'token_usage',
        severity: 'medium',
        description: `${highTokenTasks.length} tasks are using excessive tokens (>50k per iteration)`,
        affectedTasks: [...new Set(highTokenTasks.map(m => m.taskId))],
        suggestedActions: [
          'Reduce summarization threshold',
          'Optimize system prompts',
          'Implement smarter context window management'
        ]
      });
    }

    // Iteration count bottleneck
    const avgIterations = metrics.reduce((sum, m) => sum + m.iterationCount, 0) / metrics.length;
    if (avgIterations > 20) {
      bottlenecks.push({
        type: 'iteration_count',
        severity: 'medium',
        description: `Tasks require too many iterations on average (${Math.round(avgIterations)})`,
        affectedTasks: [],
        suggestedActions: [
          'Improve task planning in system prompts',
          'Implement step-by-step guidance',
          'Add task complexity assessment'
        ]
      });
    }

    return bottlenecks;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(metrics: PerformanceMetrics[], bottlenecks: BottleneckReport[]): string[] {
    const recommendations: string[] = [];

    // Based on bottlenecks
    if (bottlenecks.length > 0) {
      recommendations.push('Address identified bottlenecks to improve performance');
    }

    // Based on general trends
    const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
    if (avgDuration > 30000) { // 30 seconds
      recommendations.push('Consider implementing parallel processing for long-running tasks');
    }

    const avgTokens = metrics.reduce((sum, m) => sum + m.tokenUsage, 0) / metrics.length;
    if (avgTokens > 30000) {
      recommendations.push('Implement more aggressive context management to reduce token usage');
    }

    // Resource utilization recommendations
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
    if (avgMemory > 256 * 1024 * 1024) { // 256MB
      recommendations.push('Implement memory cleanup routines to prevent memory leaks');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is within acceptable ranges');
    }

    return recommendations;
  }

  /**
   * Get performance trend over time
   */
  getPerformanceTrend(hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= since);

    // Group by hour
    const hourlyStats = new Map<string, PerformanceMetrics[]>();
    
    for (const metric of recentMetrics) {
      const hour = new Date(metric.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();
      
      if (!hourlyStats.has(key)) {
        hourlyStats.set(key, []);
      }
      hourlyStats.get(key)!.push(metric);
    }

    return Array.from(hourlyStats.entries()).map(([hour, metrics]) => ({
      hour,
      averageDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
      averageTokenUsage: metrics.reduce((sum, m) => sum + m.tokenUsage, 0) / metrics.length,
      averageMemoryUsage: metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length,
      taskCount: new Set(metrics.map(m => m.taskId)).size
    }));
  }

  /**
   * Clear old metrics to free memory
   */
  clearOldMetrics(olderThanHours: number = 168): void { // 7 days default
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const initialLength = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    const cleared = initialLength - this.metrics.length;
    if (cleared > 0) {
      this.logger.log(`Cleared ${cleared} old performance metrics`);
    }
  }
}