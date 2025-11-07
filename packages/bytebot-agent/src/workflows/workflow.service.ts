import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowEngine } from './workflow.engine';
import { Workflow, WorkflowExecution, WorkflowSchedule } from './workflow.types';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngine: WorkflowEngine,
  ) {}

  async createWorkflow(data: any): Promise<Workflow> {
    // Validate workflow structure
    this.validateWorkflowStructure(data);

    // Check for unique name-version combination
    const existing = await this.prisma.workflow.findUnique({
      where: {
        name_version: {
          name: data.name,
          version: data.version,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Workflow ${data.name} version ${data.version} already exists`);
    }

    // Create workflow with nodes and variables
    const workflow = await this.prisma.workflow.create({
      data: {
        name: data.name,
        description: data.description,
        version: data.version,
        status: data.status || 'DRAFT',
        tags: data.tags || [],
        maxExecutionTime: data.maxExecutionTime || 300000,
        priority: data.priority || 1,
        allowConcurrentExecutions: data.allowConcurrentExecutions || false,
        retentionDays: data.retentionDays || 30,
        createdBy: data.createdBy,
        nodes: {
          create: data.nodes?.map((node: any) => ({
            type: node.type,
            name: node.name,
            description: node.description,
            positionX: node.position?.x || 0,
            positionY: node.position?.y || 0,
            config: node.config || {},
            variables: node.variables || {},
            retryPolicy: node.retryPolicy || {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 1000,
              maxDelay: 30000,
              retryOn: ['error', 'timeout'],
            },
            errorAction: node.errorAction || {
              action: 'fail',
            },
          })) || [],
        },
        variables: {
          create: data.variables?.map((variable: any) => ({
            name: variable.name,
            type: variable.type,
            defaultValue: variable.defaultValue,
            required: variable.required || false,
            description: variable.description,
            validation: variable.validation,
          })) || [],
        },
      },
      include: {
        nodes: {
          include: {
            dependencies: true,
          },
        },
        variables: true,
      },
    });

    // Create node dependencies
    if (data.nodes) {
      await this.createNodeDependencies(workflow.nodes, data.nodes);
    }

    this.logger.log(`Created workflow ${workflow.name} version ${workflow.version}`);
    return workflow as any;
  }

  async updateWorkflow(id: string, data: any): Promise<Workflow> {
    const existing = await this.prisma.workflow.findUnique({
      where: { id },
      include: { executions: { where: { status: { in: ['PENDING', 'RUNNING'] } } } },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    // Prevent updates if workflow is running
    if (existing.executions.length > 0) {
      throw new BadRequestException('Cannot update workflow while executions are running');
    }

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: {
        description: data.description,
        status: data.status,
        tags: data.tags,
        maxExecutionTime: data.maxExecutionTime,
        priority: data.priority,
        allowConcurrentExecutions: data.allowConcurrentExecutions,
        retentionDays: data.retentionDays,
      },
      include: {
        nodes: {
          include: {
            dependencies: true,
          },
        },
        variables: true,
      },
    });

    this.logger.log(`Updated workflow ${id}`);
    return updated as any;
  }

  async deleteWorkflow(id: string): Promise<void> {
    const existing = await this.prisma.workflow.findUnique({
      where: { id },
      include: { executions: { where: { status: { in: ['PENDING', 'RUNNING'] } } } },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (existing.executions.length > 0) {
      throw new BadRequestException('Cannot delete workflow while executions are running');
    }

    await this.prisma.workflow.delete({
      where: { id },
    });

    this.logger.log(`Deleted workflow ${id}`);
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        nodes: {
          include: {
            dependencies: true,
          },
        },
        variables: true,
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        schedules: true,
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow as any;
  }

  async listWorkflows(filters?: any): Promise<{ workflows: Workflow[]; total: number }> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.tags && filters.tags.length > 0) {
      where.tags = {
        hasSome: filters.tags,
      };
    }

    if (filters?.createdBy) {
      where.createdBy = filters.createdBy;
    }

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [workflows, total] = await Promise.all([
      this.prisma.workflow.findMany({
        where,
        include: {
          nodes: true,
          variables: true,
          _count: {
            select: {
              executions: true,
            },
          },
        },
        orderBy: filters?.orderBy || { createdAt: 'desc' },
        skip: filters?.skip || 0,
        take: filters?.take || 50,
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return { workflows: workflows as any, total };
  }

  async executeWorkflow(
    id: string,
    variables: Record<string, any> = {},
    triggeredBy: string,
    triggerData?: any,
  ): Promise<string> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (workflow.status !== 'ACTIVE') {
      throw new BadRequestException(`Workflow ${id} is not active`);
    }

    const executionId = await this.workflowEngine.executeWorkflow(
      id,
      variables,
      triggeredBy,
      triggerData,
    );

    this.logger.log(`Started execution ${executionId} for workflow ${id}`);
    return executionId;
  }

  async getExecution(executionId: string): Promise<WorkflowExecution> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: {
        workflow: true,
        nodeExecutions: {
          include: {
            node: true,
          },
        },
        logs: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
        approvals: {
          include: {
            responses: true,
          },
        },
      },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    return execution as any;
  }

  async listExecutions(filters?: any): Promise<{ executions: WorkflowExecution[]; total: number }> {
    const where: any = {};

    if (filters?.workflowId) {
      where.workflowId = filters.workflowId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.triggeredBy) {
      where.triggeredBy = filters.triggeredBy;
    }

    if (filters?.startedAfter) {
      where.startedAt = { gte: filters.startedAfter };
    }

    if (filters?.startedBefore) {
      where.startedAt = { ...where.startedAt, lte: filters.startedBefore };
    }

    const [executions, total] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where,
        include: {
          workflow: {
            select: {
              name: true,
              version: true,
            },
          },
          _count: {
            select: {
              nodeExecutions: true,
              logs: true,
            },
          },
        },
        orderBy: filters?.orderBy || { startedAt: 'desc' },
        skip: filters?.skip || 0,
        take: filters?.take || 50,
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return { executions: executions as any, total };
  }

  async cancelExecution(executionId: string, userId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (!['PENDING', 'RUNNING', 'PAUSED'].includes(execution.status)) {
      throw new BadRequestException(`Execution ${executionId} cannot be cancelled (status: ${execution.status})`);
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        error: `Cancelled by user ${userId}`,
      },
    });

    this.logger.log(`Cancelled execution ${executionId} by user ${userId}`);
  }

  async pauseExecution(executionId: string, userId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'RUNNING') {
      throw new BadRequestException(`Execution ${executionId} is not running`);
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'PAUSED' },
    });

    this.logger.log(`Paused execution ${executionId} by user ${userId}`);
  }

  async resumeExecution(executionId: string, userId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'PAUSED') {
      throw new BadRequestException(`Execution ${executionId} is not paused`);
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING' },
    });

    this.logger.log(`Resumed execution ${executionId} by user ${userId}`);
  }

  async createSchedule(workflowId: string, scheduleData: any): Promise<WorkflowSchedule> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const schedule = await this.prisma.workflowSchedule.create({
      data: {
        workflowId,
        name: scheduleData.name,
        enabled: scheduleData.enabled !== false,
        scheduleType: scheduleData.scheduleType,
        cronExpression: scheduleData.cronExpression,
        intervalMinutes: scheduleData.intervalMinutes,
        executeAt: scheduleData.executeAt,
        eventTriggers: scheduleData.eventTriggers || [],
        variables: scheduleData.variables || {},
        maxConcurrentExecutions: scheduleData.maxConcurrentExecutions || 1,
        nextExecutionAt: this.calculateNextExecution(scheduleData),
      },
    });

    this.logger.log(`Created schedule ${schedule.id} for workflow ${workflowId}`);
    return schedule as any;
  }

  async updateSchedule(scheduleId: string, scheduleData: any): Promise<WorkflowSchedule> {
    const schedule = await this.prisma.workflowSchedule.update({
      where: { id: scheduleId },
      data: {
        name: scheduleData.name,
        enabled: scheduleData.enabled,
        cronExpression: scheduleData.cronExpression,
        intervalMinutes: scheduleData.intervalMinutes,
        executeAt: scheduleData.executeAt,
        eventTriggers: scheduleData.eventTriggers,
        variables: scheduleData.variables,
        maxConcurrentExecutions: scheduleData.maxConcurrentExecutions,
        nextExecutionAt: this.calculateNextExecution(scheduleData),
      },
    });

    this.logger.log(`Updated schedule ${scheduleId}`);
    return schedule as any;
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.prisma.workflowSchedule.delete({
      where: { id: scheduleId },
    });

    this.logger.log(`Deleted schedule ${scheduleId}`);
  }

  async getWorkflowMetrics(workflowId: string, timeRange?: { start: Date; end: Date }): Promise<any> {
    const where: any = { workflowId };

    if (timeRange) {
      where.startedAt = {
        gte: timeRange.start,
        lte: timeRange.end,
      };
    }

    const [executions, avgDuration, successRate] = await Promise.all([
      this.prisma.workflowExecution.count({ where }),
      this.prisma.workflowExecution.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _avg: {
          // Calculate duration from startedAt to completedAt
        },
      }),
      this.prisma.workflowExecution.aggregate({
        where,
        _count: {
          status: true,
        },
      }),
    ]);

    const successCount = await this.prisma.workflowExecution.count({
      where: { ...where, status: 'COMPLETED' },
    });

    return {
      totalExecutions: executions,
      successRate: executions > 0 ? (successCount / executions) * 100 : 0,
      averageDuration: avgDuration._avg || 0,
      recentExecutions: await this.prisma.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          error: true,
        },
      }),
    };
  }

  async validateWorkflow(workflowData: any): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic structure
    if (!workflowData.name) {
      errors.push('Workflow name is required');
    }

    if (!workflowData.nodes || workflowData.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    // Validate nodes
    if (workflowData.nodes) {
      const nodeIds = new Set(workflowData.nodes.map((n: any) => n.id));

      for (const node of workflowData.nodes) {
        // Check for required fields
        if (!node.id) errors.push(`Node is missing ID`);
        if (!node.type) errors.push(`Node ${node.id} is missing type`);
        if (!node.name) warnings.push(`Node ${node.id} is missing name`);

        // Validate dependencies
        if (node.dependencies) {
          for (const depId of node.dependencies) {
            if (!nodeIds.has(depId)) {
              errors.push(`Node ${node.id} depends on non-existent node ${depId}`);
            }
          }
        }

        // Validate node-specific configurations
        this.validateNodeConfiguration(node, errors, warnings);
      }

      // Check for cycles in dependencies
      if (this.hasCycles(workflowData.nodes)) {
        errors.push('Workflow contains circular dependencies');
      }

      // Check for unreachable nodes
      const unreachableNodes = this.findUnreachableNodes(workflowData.nodes);
      if (unreachableNodes.length > 0) {
        warnings.push(`Unreachable nodes: ${unreachableNodes.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateWorkflowStructure(data: any): void {
    if (!data.name) {
      throw new BadRequestException('Workflow name is required');
    }

    if (!data.version) {
      throw new BadRequestException('Workflow version is required');
    }

    if (!data.createdBy) {
      throw new BadRequestException('Workflow createdBy is required');
    }

    // Additional validation logic
    const validation = this.validateWorkflow(data);
    if (!validation.isValid) {
      throw new BadRequestException(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }
  }

  private async createNodeDependencies(nodes: any[], nodeData: any[]): Promise<void> {
    const nodeMap = new Map(nodes.map(n => [n.name, n.id]));

    for (const nodeInfo of nodeData) {
      if (nodeInfo.dependencies && nodeInfo.dependencies.length > 0) {
        const nodeId = nodeMap.get(nodeInfo.name);
        if (!nodeId) continue;

        const dependencies = nodeInfo.dependencies
          .map((depName: string) => nodeMap.get(depName))
          .filter((id: string) => id);

        for (const depId of dependencies) {
          await this.prisma.nodeDependency.create({
            data: {
              dependentNodeId: nodeId,
              dependsOnNodeId: depId,
            },
          });
        }
      }
    }
  }

  private validateNodeConfiguration(node: any, errors: string[], warnings: string[]): void {
    switch (node.type) {
      case 'TASK':
        if (!node.config?.prompt) {
          errors.push(`Task node ${node.id} is missing prompt configuration`);
        }
        break;
      case 'CONDITION':
        if (!node.config?.conditions) {
          errors.push(`Condition node ${node.id} is missing conditions configuration`);
        }
        break;
      case 'HUMAN_APPROVAL':
        if (!node.config?.approvers || node.config.approvers.length === 0) {
          errors.push(`Approval node ${node.id} is missing approvers`);
        }
        break;
      case 'WEBHOOK':
        if (!node.config?.url) {
          errors.push(`Webhook node ${node.id} is missing URL`);
        }
        break;
    }
  }

  private hasCycles(nodes: any[]): boolean {
    const graph = new Map<string, string[]>();
    
    // Build adjacency list
    for (const node of nodes) {
      graph.set(node.id, node.dependencies || []);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const deps = graph.get(nodeId) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (recStack.has(dep)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  private findUnreachableNodes(nodes: any[]): string[] {
    const entryPoints = nodes.filter(n => !n.dependencies || n.dependencies.length === 0);
    const reachable = new Set<string>();

    const dfs = (nodeId: string) => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);

      // Find nodes that depend on this node
      const dependents = nodes.filter(n => 
        n.dependencies && n.dependencies.includes(nodeId)
      );

      for (const dependent of dependents) {
        dfs(dependent.id);
      }
    };

    // Start DFS from all entry points
    for (const entry of entryPoints) {
      dfs(entry.id);
    }

    return nodes
      .filter(n => !reachable.has(n.id))
      .map(n => n.id);
  }

  private calculateNextExecution(scheduleData: any): Date | null {
    const now = new Date();

    switch (scheduleData.scheduleType) {
      case 'once':
        return scheduleData.executeAt ? new Date(scheduleData.executeAt) : null;
      case 'interval':
        return scheduleData.intervalMinutes 
          ? new Date(now.getTime() + scheduleData.intervalMinutes * 60 * 1000)
          : null;
      case 'cron':
        // Would integrate with a cron parser library
        return new Date(now.getTime() + 60 * 60 * 1000); // Placeholder: 1 hour from now
      default:
        return null;
    }
  }
}