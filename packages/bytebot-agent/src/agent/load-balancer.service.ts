import { Injectable, Logger } from '@nestjs/common';
import { AgentPoolService, AgentInstance } from './agent-pool.service';
import { Task, TaskPriority } from '@prisma/client';

export interface LoadBalancingConfig {
  maxTasksPerAgent: number;
  cpuThreshold: number;
  memoryThreshold: number;
  responseTimeThreshold: number;
  enableAutoScaling: boolean;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
}

export interface LoadMetrics {
  timestamp: Date;
  totalAgents: number;
  activeAgents: number;
  queueLength: number;
  averageResponseTime: number;
  averageCpuUsage: number;
  averageMemoryUsage: number;
  tasksPerSecond: number;
}

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);
  private config: LoadBalancingConfig = {
    maxTasksPerAgent: 3,
    cpuThreshold: 80,
    memoryThreshold: 85,
    responseTimeThreshold: 30000, // 30 seconds
    enableAutoScaling: true,
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.3,
  };

  private loadHistory: LoadMetrics[] = [];
  private taskResponseTimes: Map<string, number> = new Map();

  constructor(private readonly agentPool: AgentPoolService) {}

  /**
   * Balance load across available agents
   */
  async balanceLoad(tasks: Task[]): Promise<Map<string, string[]>> {
    this.logger.log(`Balancing load for ${tasks.length} tasks`);

    // Get current load metrics
    const currentLoad = await this.getCurrentLoadMetrics();
    this.recordLoadMetrics(currentLoad);

    // Check if we need to scale
    if (this.config.enableAutoScaling) {
      await this.handleAutoScaling(currentLoad);
    }

    // Distribute tasks based on current load
    const distribution = await this.distributeTasksIntelligently(tasks);

    return distribution;
  }

  /**
   * Intelligently distribute tasks considering load, priority, and agent capabilities
   */
  private async distributeTasksIntelligently(
    tasks: Task[],
  ): Promise<Map<string, string[]>> {
    const distribution = new Map<string, string[]>();

    // Sort tasks by priority and estimated complexity
    const sortedTasks = this.sortTasksByPriority(tasks);

    for (const task of sortedTasks) {
      const selectedAgent = await this.selectOptimalAgent(task);

      if (selectedAgent) {
        const agentId = await this.agentPool.distributeTask(task);
        if (agentId) {
          if (!distribution.has(agentId)) {
            distribution.set(agentId, []);
          }
          distribution.get(agentId)!.push(task.id);
        }
      } else {
        this.logger.warn(`No suitable agent found for task ${task.id}`);
      }
    }

    return distribution;
  }

  /**
   * Select the optimal agent for a specific task
   */
  private async selectOptimalAgent(task: Task): Promise<string | null> {
    const poolStats = this.agentPool.getPoolStats();

    if (poolStats.availableAgents === 0) {
      this.logger.warn('No available agents for task assignment');
      return null;
    }

    // For now, let the agent pool handle selection
    // This could be enhanced with more sophisticated algorithms
    return 'auto'; // Indicates to use pool's selection logic
  }

  /**
   * Handle automatic scaling of the agent pool
   */
  private async handleAutoScaling(metrics: LoadMetrics): Promise<void> {
    const utilizationRate = metrics.activeAgents / metrics.totalAgents;

    if (
      utilizationRate > this.config.scaleUpThreshold &&
      metrics.queueLength > 5
    ) {
      await this.scaleUp(metrics);
    } else if (
      utilizationRate < this.config.scaleDownThreshold &&
      metrics.queueLength === 0
    ) {
      await this.scaleDown(metrics);
    }
  }

  /**
   * Scale up the number of agents
   */
  private async scaleUp(metrics: LoadMetrics): Promise<void> {
    this.logger.log(
      `Scaling up: utilization ${Math.round((metrics.activeAgents / metrics.totalAgents) * 100)}%, queue: ${metrics.queueLength}`,
    );

    // This would typically involve starting new agent processes or containers
    // For now, we just log the intention

    // In a real implementation, this might:
    // 1. Start new Docker containers
    // 2. Launch new processes
    // 3. Request resources from a cluster manager
    // 4. Register new agent instances with the pool
  }

  /**
   * Scale down the number of agents
   */
  private async scaleDown(metrics: LoadMetrics): Promise<void> {
    if (metrics.totalAgents <= 1) {
      return; // Always keep at least one agent
    }

    this.logger.log(
      `Scaling down: utilization ${Math.round((metrics.activeAgents / metrics.totalAgents) * 100)}%, queue: ${metrics.queueLength}`,
    );

    // This would involve gracefully shutting down idle agents
    // For now, we just log the intention
  }

  /**
   * Get current load metrics
   */
  private async getCurrentLoadMetrics(): Promise<LoadMetrics> {
    const poolStats = this.agentPool.getPoolStats();

    // Calculate tasks per second from recent history
    const recentMetrics = this.loadHistory.slice(-10);
    const tasksPerSecond =
      recentMetrics.length > 1
        ? this.calculateTasksPerSecond(recentMetrics)
        : 0;

    // Calculate average response time from recent tasks
    const recentResponseTimes = Array.from(
      this.taskResponseTimes.values(),
    ).slice(-100);
    const averageResponseTime =
      recentResponseTimes.length > 0
        ? recentResponseTimes.reduce((sum, time) => sum + time, 0) /
          recentResponseTimes.length
        : 0;

    return {
      timestamp: new Date(),
      totalAgents: poolStats.totalAgents,
      activeAgents: poolStats.activeAgents,
      queueLength: poolStats.queuedTasks,
      averageResponseTime,
      averageCpuUsage: 0, // Would be calculated from agent resource metrics
      averageMemoryUsage: 0, // Would be calculated from agent resource metrics
      tasksPerSecond,
    };
  }

  /**
   * Record load metrics for historical analysis
   */
  private recordLoadMetrics(metrics: LoadMetrics): void {
    this.loadHistory.push(metrics);

    // Keep only recent history (last 24 hours worth of data)
    const maxEntries = 24 * 60; // Assuming 1 metric per minute
    if (this.loadHistory.length > maxEntries) {
      this.loadHistory = this.loadHistory.slice(-maxEntries);
    }
  }

  /**
   * Record task completion time for performance monitoring
   */
  recordTaskCompletion(taskId: string, startTime: Date, endTime: Date): void {
    const responseTime = endTime.getTime() - startTime.getTime();
    this.taskResponseTimes.set(taskId, responseTime);

    // Keep only recent response times
    if (this.taskResponseTimes.size > 1000) {
      const entries = Array.from(this.taskResponseTimes.entries());
      this.taskResponseTimes = new Map(entries.slice(-1000));
    }

    // Check for performance issues
    if (responseTime > this.config.responseTimeThreshold) {
      this.logger.warn(
        `Task ${taskId} took ${Math.round(responseTime / 1000)}s to complete (threshold: ${this.config.responseTimeThreshold / 1000}s)`,
      );
    }
  }

  /**
   * Get load balancing statistics
   */
  getLoadBalancingStats() {
    const recentMetrics = this.loadHistory.slice(-60); // Last hour
    const poolStats = this.agentPool.getPoolStats();

    const avgUtilization =
      recentMetrics.length > 0
        ? recentMetrics.reduce(
            (sum, m) => sum + m.activeAgents / m.totalAgents,
            0,
          ) / recentMetrics.length
        : 0;

    const avgResponseTime = Array.from(this.taskResponseTimes.values())
      .slice(-100)
      .reduce((sum, time, _, arr) => sum + time / arr.length, 0);

    return {
      currentUtilization: poolStats.activeAgents / poolStats.totalAgents,
      averageUtilization: avgUtilization,
      currentQueueLength: poolStats.queuedTasks,
      averageResponseTime: avgResponseTime,
      totalTasksProcessed: this.taskResponseTimes.size,
      scalingEvents: {
        scaleUps: 0, // Would track actual scaling events
        scaleDowns: 0,
      },
      performanceThresholds: {
        cpuThreshold: this.config.cpuThreshold,
        memoryThreshold: this.config.memoryThreshold,
        responseTimeThreshold: this.config.responseTimeThreshold,
      },
    };
  }

  /**
   * Update load balancing configuration
   */
  updateConfig(newConfig: Partial<LoadBalancingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('Updated load balancing configuration');
  }

  /**
   * Get performance recommendations based on current metrics
   */
  getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getLoadBalancingStats();

    if (stats.currentUtilization > 0.9) {
      recommendations.push(
        'High agent utilization detected. Consider scaling up or optimizing task distribution.',
      );
    }

    if (stats.currentQueueLength > 10) {
      recommendations.push(
        'Large task queue detected. Consider adding more agents or increasing processing capacity.',
      );
    }

    if (stats.averageResponseTime > this.config.responseTimeThreshold) {
      recommendations.push(
        'Average response time exceeds threshold. Review task complexity and agent performance.',
      );
    }

    if (stats.currentUtilization < 0.3 && stats.currentQueueLength === 0) {
      recommendations.push(
        'Low utilization detected. Consider scaling down to optimize resource usage.',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Load balancing performance is within acceptable ranges.',
      );
    }

    return recommendations;
  }

  private sortTasksByPriority(tasks: Task[]): Task[] {
    const priorityOrder = { HIGH: 3, NORMAL: 2, LOW: 1 };

    return tasks.sort((a, b) => {
      // First sort by priority
      const priorityDiff =
        (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
      if (priorityDiff !== 0) return priorityDiff;

      // Then by creation time (older first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private calculateTasksPerSecond(metrics: LoadMetrics[]): number {
    if (metrics.length < 2) return 0;

    const timeSpan =
      metrics[metrics.length - 1].timestamp.getTime() -
      metrics[0].timestamp.getTime();
    const timeSpanSeconds = timeSpan / 1000;

    // This is a simplified calculation - in reality you'd track actual task completions
    const estimatedTasks = metrics.reduce((sum, m) => sum + m.activeAgents, 0);

    return timeSpanSeconds > 0 ? estimatedTasks / timeSpanSeconds : 0;
  }
}
