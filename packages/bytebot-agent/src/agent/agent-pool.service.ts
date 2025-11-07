import { Injectable, Logger } from '@nestjs/common';
import { AgentProcessor } from './agent.processor';
import { Task, TaskStatus, TaskPriority } from '@prisma/client';
import { TasksService } from '../tasks/tasks.service';
import { PerformanceMonitorService } from '../monitoring/performance-monitor.service';

export interface AgentInstance {
  id: string;
  processor: AgentProcessor;
  currentTask: string | null;
  isAvailable: boolean;
  performance: {
    tasksCompleted: number;
    averageTaskDuration: number;
    successRate: number;
    lastActivity: Date;
  };
  resourceUsage: {
    cpuUsage: number;
    memoryUsage: number;
    loadFactor: number; // 0-1 scale
  };
}

export interface TaskDistributionStrategy {
  type: 'round_robin' | 'least_loaded' | 'priority_based' | 'intelligent';
  config?: {
    maxTasksPerAgent?: number;
    loadBalanceThreshold?: number;
    priorityWeights?: Record<TaskPriority, number>;
  };
}

@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);
  private agents: Map<string, AgentInstance> = new Map();
  private taskQueue: Task[] = [];
  private distributionStrategy: TaskDistributionStrategy = {
    type: 'intelligent',
  };

  constructor(
    private readonly tasksService: TasksService,
    private readonly performanceMonitor: PerformanceMonitorService,
  ) {}

  /**
   * Register a new agent instance in the pool
   */
  registerAgent(agentId: string, processor: AgentProcessor): void {
    const agent: AgentInstance = {
      id: agentId,
      processor,
      currentTask: null,
      isAvailable: true,
      performance: {
        tasksCompleted: 0,
        averageTaskDuration: 0,
        successRate: 1.0,
        lastActivity: new Date(),
      },
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0,
        loadFactor: 0,
      },
    };

    this.agents.set(agentId, agent);
    this.logger.log(`Registered agent ${agentId} in pool`);
  }

  /**
   * Unregister an agent from the pool
   */
  unregisterAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // If agent is processing a task, handle gracefully
    if (agent.currentTask) {
      this.logger.warn(
        `Unregistering agent ${agentId} that is processing task ${agent.currentTask}`,
      );
      // Task will be reassigned to another agent
      this.handleAgentFailure(agentId, agent.currentTask);
    }

    this.agents.delete(agentId);
    this.logger.log(`Unregistered agent ${agentId} from pool`);
    return true;
  }

  /**
   * Distribute a task to the most suitable agent
   */
  async distributeTask(task: Task): Promise<string | null> {
    const availableAgents = this.getAvailableAgents();

    if (availableAgents.length === 0) {
      this.logger.warn(
        `No available agents for task ${task.id}, adding to queue`,
      );
      this.taskQueue.push(task);
      return null;
    }

    const selectedAgent = this.selectBestAgent(availableAgents, task);
    if (!selectedAgent) {
      this.taskQueue.push(task);
      return null;
    }

    // Assign task to agent
    selectedAgent.currentTask = task.id;
    selectedAgent.isAvailable = false;
    selectedAgent.performance.lastActivity = new Date();

    this.logger.log(`Assigned task ${task.id} to agent ${selectedAgent.id}`);

    // Start processing
    try {
      selectedAgent.processor.processTask(task.id);
      return selectedAgent.id;
    } catch (error: any) {
      this.logger.error(
        `Failed to start task ${task.id} on agent ${selectedAgent.id}: ${error.message}`,
      );
      selectedAgent.currentTask = null;
      selectedAgent.isAvailable = true;
      return null;
    }
  }

  /**
   * Handle parallel execution of multiple tasks
   */
  async distributeParallelTasks(tasks: Task[]): Promise<Map<string, string[]>> {
    const assignments = new Map<string, string[]>();

    // Sort tasks by priority
    const sortedTasks = tasks.sort((a, b) => {
      const priorityOrder = { HIGH: 3, NORMAL: 2, LOW: 1 };
      return (
        (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1)
      );
    });

    for (const task of sortedTasks) {
      const agentId = await this.distributeTask(task);
      if (agentId) {
        if (!assignments.has(agentId)) {
          assignments.set(agentId, []);
        }
        assignments.get(agentId)!.push(task.id);
      }
    }

    this.logger.log(
      `Distributed ${sortedTasks.length} tasks across ${assignments.size} agents`,
    );
    return assignments;
  }

  /**
   * Handle agent failure and task reassignment
   */
  async handleAgentFailure(agentId: string, taskId: string): Promise<void> {
    this.logger.warn(
      `Handling failure of agent ${agentId} processing task ${taskId}`,
    );

    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTask = null;
      agent.isAvailable = true;

      // Update performance stats
      const totalTasks = agent.performance.tasksCompleted + 1;
      agent.performance.successRate =
        (agent.performance.successRate * agent.performance.tasksCompleted) /
        totalTasks;
    }

    // Get the task and mark it for reassignment
    const task = await this.tasksService.findById(taskId);
    if (task && task.status === TaskStatus.RUNNING) {
      await this.tasksService.update(taskId, {
        status: TaskStatus.PENDING,
        error: `Agent ${agentId} failed, reassigning task`,
      });

      // Try to reassign to another agent
      const reassignedAgentId = await this.distributeTask(task);
      if (reassignedAgentId) {
        this.logger.log(
          `Reassigned task ${taskId} to agent ${reassignedAgentId}`,
        );
      } else {
        this.logger.error(
          `Failed to reassign task ${taskId} - no available agents`,
        );
      }
    }
  }

  /**
   * Process queued tasks when agents become available
   */
  async processQueue(): Promise<void> {
    if (this.taskQueue.length === 0) return;

    const availableAgents = this.getAvailableAgents();
    if (availableAgents.length === 0) return;

    const tasksToProcess = this.taskQueue.splice(0, availableAgents.length);

    for (const task of tasksToProcess) {
      const agentId = await this.distributeTask(task);
      if (!agentId) {
        // If distribution failed, put task back in queue
        this.taskQueue.unshift(task);
        break;
      }
    }
  }

  /**
   * Update agent performance metrics
   */
  updateAgentPerformance(
    agentId: string,
    taskId: string,
    duration: number,
    success: boolean,
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Update performance stats
    const completedTasks = agent.performance.tasksCompleted + 1;
    agent.performance.averageTaskDuration =
      (agent.performance.averageTaskDuration *
        agent.performance.tasksCompleted +
        duration) /
      completedTasks;

    agent.performance.successRate =
      (agent.performance.successRate * agent.performance.tasksCompleted +
        (success ? 1 : 0)) /
      completedTasks;

    agent.performance.tasksCompleted = completedTasks;
    agent.performance.lastActivity = new Date();

    // Mark agent as available
    agent.currentTask = null;
    agent.isAvailable = true;

    this.logger.debug(
      `Updated performance for agent ${agentId}: ${completedTasks} tasks, ${Math.round(agent.performance.successRate * 100)}% success rate`,
    );

    // Process any queued tasks
    void this.processQueue();
  }

  /**
   * Update agent resource usage
   */
  updateAgentResources(
    agentId: string,
    cpuUsage: number,
    memoryUsage: number,
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.resourceUsage.cpuUsage = cpuUsage;
    agent.resourceUsage.memoryUsage = memoryUsage;

    // Calculate load factor (0-1 scale)
    const cpuFactor = Math.min(cpuUsage / 100, 1);
    const memoryFactor = Math.min(memoryUsage / (1024 * 1024 * 1024), 1); // Assume 1GB max
    agent.resourceUsage.loadFactor = (cpuFactor + memoryFactor) / 2;
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter((a) => !a.isAvailable);
    const totalTasksCompleted = agents.reduce(
      (sum, a) => sum + a.performance.tasksCompleted,
      0,
    );
    const averageSuccessRate =
      agents.length > 0
        ? agents.reduce((sum, a) => sum + a.performance.successRate, 0) /
          agents.length
        : 0;

    return {
      totalAgents: agents.length,
      activeAgents: activeAgents.length,
      availableAgents: agents.length - activeAgents.length,
      queuedTasks: this.taskQueue.length,
      totalTasksCompleted,
      averageSuccessRate,
      averageLoadFactor:
        agents.length > 0
          ? agents.reduce((sum, a) => sum + a.resourceUsage.loadFactor, 0) /
            agents.length
          : 0,
      topPerformers: agents
        .sort(
          (a, b) =>
            b.performance.successRate * b.performance.tasksCompleted -
            a.performance.successRate * a.performance.tasksCompleted,
        )
        .slice(0, 3)
        .map((a) => ({
          id: a.id,
          tasksCompleted: a.performance.tasksCompleted,
          successRate: a.performance.successRate,
          averageDuration: a.performance.averageTaskDuration,
        })),
    };
  }

  private getAvailableAgents(): AgentInstance[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.isAvailable && agent.resourceUsage.loadFactor < 0.8,
    );
  }

  private selectBestAgent(
    availableAgents: AgentInstance[],
    task: Task,
  ): AgentInstance | null {
    switch (this.distributionStrategy.type) {
      case 'round_robin':
        return availableAgents[0]; // Simple first available

      case 'least_loaded':
        return availableAgents.sort(
          (a, b) => a.resourceUsage.loadFactor - b.resourceUsage.loadFactor,
        )[0];

      case 'priority_based':
        if (task.priority === TaskPriority.HIGH) {
          // Assign high priority tasks to best performing agents
          return availableAgents.sort(
            (a, b) => b.performance.successRate - a.performance.successRate,
          )[0];
        }
        return availableAgents.sort(
          (a, b) => a.resourceUsage.loadFactor - b.resourceUsage.loadFactor,
        )[0];

      case 'intelligent':
        return this.selectIntelligentAgent(availableAgents, task);

      default:
        return availableAgents[0];
    }
  }

  private selectIntelligentAgent(
    availableAgents: AgentInstance[],
    task: Task,
  ): AgentInstance | null {
    // Score agents based on multiple factors
    const scoredAgents = availableAgents.map((agent) => {
      let score = 0;

      // Performance factor (0-40 points)
      score += agent.performance.successRate * 40;

      // Load factor (0-30 points, inverted - lower load is better)
      score += (1 - agent.resourceUsage.loadFactor) * 30;

      // Experience factor (0-20 points)
      const experienceFactor = Math.min(
        agent.performance.tasksCompleted / 100,
        1,
      );
      score += experienceFactor * 20;

      // Priority bonus (0-10 points)
      if (
        task.priority === TaskPriority.HIGH &&
        agent.performance.successRate > 0.8
      ) {
        score += 10;
      }

      return { agent, score };
    });

    // Return agent with highest score
    scoredAgents.sort((a, b) => b.score - a.score);
    return scoredAgents[0]?.agent || null;
  }

  /**
   * Set task distribution strategy
   */
  setDistributionStrategy(strategy: TaskDistributionStrategy): void {
    this.distributionStrategy = strategy;
    this.logger.log(`Updated distribution strategy to: ${strategy.type}`);
  }
}
