import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  Workflow,
  WorkflowExecution,
  WorkflowNode,
  WorkflowExecutionContext,
  NodeExecutionState,
  WorkflowEvent,
  WorkflowEngineConfig,
  ParallelBranchState,
  PendingApproval,
  WorkflowMetrics,
} from './workflow.types';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);
  private readonly activeExecutions = new Map<string, WorkflowExecutionContext>();
  private readonly config: WorkflowEngineConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.config = {
      maxConcurrentWorkflows: 10,
      maxConcurrentNodesPerWorkflow: 5,
      defaultTimeout: 300000, // 5 minutes
      defaultRetries: 3,
      heartbeatInterval: 5000,
      cleanupInterval: 60000,
      enableMetrics: true,
      enableAuditLogging: true,
    };

    this.startHeartbeat();
    this.startCleanup();
  }

  async executeWorkflow(
    workflowId: string,
    variables: Record<string, any> = {},
    triggeredBy: string,
    triggerData?: any,
  ): Promise<string> {
    // Check concurrent execution limits
    if (this.activeExecutions.size >= this.config.maxConcurrentWorkflows) {
      throw new Error('Maximum concurrent workflow executions reached');
    }

    // Load workflow
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        nodes: {
          include: {
            dependencies: true,
          },
        },
        variables: true,
      },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'ACTIVE') {
      throw new Error(`Workflow ${workflowId} is not active`);
    }

    // Check concurrent executions for this workflow
    if (!workflow.allowConcurrentExecutions) {
      const activeExecution = await this.prisma.workflowExecution.findFirst({
        where: {
          workflowId,
          status: { in: ['PENDING', 'RUNNING', 'PAUSED'] },
        },
      });

      if (activeExecution) {
        throw new Error(`Workflow ${workflowId} is already running`);
      }
    }

    // Validate and merge variables
    const mergedVariables = this.mergeVariables(workflow.variables, variables);

    // Create execution record
    const execution = await this.prisma.workflowExecution.create({
      data: {
        workflowId,
        workflowVersion: workflow.version,
        variables: mergedVariables,
        currentNodes: [],
        completedNodes: [],
        failedNodes: [],
        triggeredBy,
        triggerData,
        priority: workflow.priority,
      },
    });

    // Create execution context
    const context: WorkflowExecutionContext = {
      executionId: execution.id,
      workflowId,
      variables: mergedVariables,
      nodeStates: new Map(),
      executionStack: [],
      parallelBranches: new Map(),
      pendingApprovals: new Map(),
      metrics: {
        totalNodes: workflow.nodes.length,
        completedNodes: 0,
        failedNodes: 0,
        skippedNodes: 0,
        executionTime: 0,
        resourceUsage: {
          cpuTime: 0,
          memoryPeak: 0,
          networkRequests: 0,
        },
      },
    };

    // Initialize node states
    for (const node of workflow.nodes) {
      context.nodeStates.set(node.id, {
        nodeId: node.id,
        status: 'pending',
        retryCount: 0,
        logs: [],
      });
    }

    this.activeExecutions.set(execution.id, context);

    // Emit workflow started event
    this.emitEvent({
      type: 'workflow_started',
      workflowId,
      executionId: execution.id,
      timestamp: new Date(),
      data: { variables: mergedVariables },
    });

    // Find entry points (nodes with no dependencies)
    const entryPoints = workflow.nodes.filter(
      node => node.dependencies.length === 0,
    );

    if (entryPoints.length === 0) {
      throw new Error('Workflow has no entry points');
    }

    // Start execution with entry points
    await this.executeNodes(context, entryPoints.map(n => n.id), workflow);

    this.logger.log(`Started workflow execution ${execution.id} for workflow ${workflowId}`);
    return execution.id;
  }

  private async executeNodes(
    context: WorkflowExecutionContext,
    nodeIds: string[],
    workflow: any,
  ): Promise<void> {
    const startTime = Date.now();

    for (const nodeId of nodeIds) {
      if (context.executionStack.length >= this.config.maxConcurrentNodesPerWorkflow) {
        // Queue for later execution
        await this.queueNodeExecution(context, nodeId);
        continue;
      }

      const node = workflow.nodes.find((n: any) => n.id === nodeId);
      if (!node) {
        this.logger.error(`Node ${nodeId} not found in workflow`);
        continue;
      }

      // Check if dependencies are satisfied
      const dependenciesSatisfied = await this.checkDependencies(context, node);
      if (!dependenciesSatisfied) {
        this.logger.debug(`Dependencies not satisfied for node ${nodeId}`);
        continue;
      }

      await this.executeNode(context, node, workflow);
    }

    context.metrics.executionTime += Date.now() - startTime;
  }

  private async executeNode(
    context: WorkflowExecutionContext,
    node: any,
    workflow: any,
  ): Promise<void> {
    const nodeState = context.nodeStates.get(node.id);
    if (!nodeState) return;

    try {
      nodeState.status = 'running';
      nodeState.startedAt = new Date();
      context.executionStack.push(node.id);

      this.emitEvent({
        type: 'node_started',
        workflowId: context.workflowId,
        executionId: context.executionId,
        nodeId: node.id,
        timestamp: new Date(),
      });

      // Execute based on node type
      let result: any;
      switch (node.type) {
        case 'TASK':
          result = await this.executeTaskNode(context, node);
          break;
        case 'CONDITION':
          result = await this.executeConditionNode(context, node, workflow);
          break;
        case 'LOOP':
          result = await this.executeLoopNode(context, node, workflow);
          break;
        case 'PARALLEL':
          result = await this.executeParallelNode(context, node, workflow);
          break;
        case 'HUMAN_APPROVAL':
          result = await this.executeApprovalNode(context, node);
          break;
        case 'DELAY':
          result = await this.executeDelayNode(context, node);
          break;
        case 'WEBHOOK':
          result = await this.executeWebhookNode(context, node);
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      // Update node state
      nodeState.status = 'completed';
      nodeState.completedAt = new Date();
      nodeState.result = result;
      context.metrics.completedNodes++;

      // Update execution record
      await this.updateExecutionState(context);

      this.emitEvent({
        type: 'node_completed',
        workflowId: context.workflowId,
        executionId: context.executionId,
        nodeId: node.id,
        timestamp: new Date(),
        data: { result },
      });

      // Find and execute next nodes
      const nextNodes = await this.getNextNodes(context, node, workflow);
      if (nextNodes.length > 0) {
        await this.executeNodes(context, nextNodes, workflow);
      }

      // Check if workflow is complete
      await this.checkWorkflowCompletion(context, workflow);

    } catch (error) {
      await this.handleNodeError(context, node, error);
    } finally {
      const index = context.executionStack.indexOf(node.id);
      if (index > -1) {
        context.executionStack.splice(index, 1);
      }
    }
  }

  private async executeTaskNode(context: WorkflowExecutionContext, node: any): Promise<any> {
    const config = node.config;
    const prompt = this.interpolateVariables(config.prompt, context.variables);

    // Create task for execution
    const task = await this.tasksService.create({
      description: prompt,
      priority: config.priority || 'MEDIUM',
      model: config.model || { provider: 'anthropic', name: 'claude-3-sonnet-20240229' },
    });

    // Wait for task completion (implement polling or use events)
    const result = await this.waitForTaskCompletion(task.id, config.timeout || this.config.defaultTimeout);
    
    // Store result in context variables if specified
    if (config.outputVariable) {
      context.variables[config.outputVariable] = result;
    }

    return result;
  }

  private async executeConditionNode(
    context: WorkflowExecutionContext,
    node: any,
    workflow: any,
  ): Promise<any> {
    const config = node.config;
    const conditionResult = this.evaluateConditions(config.conditions, context.variables, config.operator);

    // Execute appropriate path based on condition result
    const pathNodes = conditionResult ? config.truePath : config.falsePath;
    if (pathNodes && pathNodes.length > 0) {
      await this.executeNodes(context, pathNodes, workflow);
    }

    return { conditionResult, executedPath: conditionResult ? 'true' : 'false' };
  }

  private async executeLoopNode(
    context: WorkflowExecutionContext,
    node: any,
    workflow: any,
  ): Promise<any> {
    const config = node.config;
    const results: any[] = [];
    let iterations = 0;

    while (true) {
      // Check loop termination conditions
      if (config.maxIterations && iterations >= config.maxIterations) {
        break;
      }

      if (config.condition && !this.evaluateConditions([config.condition], context.variables)) {
        break;
      }

      // Execute loop body
      const bodyResults = await this.executeNodes(context, config.bodyNodes, workflow);
      results.push(bodyResults);
      iterations++;

      // Update loop variables
      if (config.iteratorVariable) {
        context.variables[config.iteratorVariable] = iterations;
      }
    }

    return { iterations, results };
  }

  private async executeParallelNode(
    context: WorkflowExecutionContext,
    node: any,
    workflow: any,
  ): Promise<any> {
    const config = node.config;
    const branchPromises: Promise<any>[] = [];

    for (let i = 0; i < config.branches.length; i++) {
      const branch = config.branches[i];
      const branchId = `${node.id}_branch_${i}`;
      
      context.parallelBranches.set(branchId, {
        branchId,
        nodeIds: branch,
        status: 'running',
        completedNodes: [],
        failedNodes: [],
      });

      const branchPromise = this.executeNodes(context, branch, workflow);
      branchPromises.push(branchPromise);
    }

    // Wait based on configuration
    if (config.waitForAll) {
      return Promise.all(branchPromises);
    } else {
      return Promise.race(branchPromises);
    }
  }

  private async executeApprovalNode(context: WorkflowExecutionContext, node: any): Promise<any> {
    const config = node.config;
    const expiresAt = new Date(Date.now() + config.timeoutMinutes * 60 * 1000);

    // Create pending approval
    const approval = await this.prisma.pendingApproval.create({
      data: {
        workflowExecutionId: context.executionId,
        nodeId: node.id,
        approvers: config.approvers,
        instructions: config.instructions,
        expiresAt,
      },
    });

    context.pendingApprovals.set(node.id, {
      nodeId: node.id,
      approvers: config.approvers,
      instructions: config.instructions,
      requestedAt: new Date(),
      expiresAt,
      responses: [],
    });

    this.emitEvent({
      type: 'approval_requested',
      workflowId: context.workflowId,
      executionId: context.executionId,
      nodeId: node.id,
      timestamp: new Date(),
      data: {
        approvers: config.approvers,
        instructions: config.instructions,
        expiresAt,
      },
    });

    // Wait for approval (this will be handled by approval response mechanism)
    return { approvalId: approval.id, status: 'pending' };
  }

  private async executeDelayNode(context: WorkflowExecutionContext, node: any): Promise<any> {
    const config = node.config;
    let delay = config.duration;

    if (config.dynamicDuration && context.variables[config.dynamicDuration]) {
      delay = context.variables[config.dynamicDuration];
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    return { delayed: delay };
  }

  private async executeWebhookNode(context: WorkflowExecutionContext, node: any): Promise<any> {
    const config = node.config;
    const url = this.interpolateVariables(config.url, context.variables);
    const body = config.body ? this.interpolateVariables(JSON.stringify(config.body), context.variables) : undefined;

    const response = await fetch(url, {
      method: config.method,
      headers: config.headers,
      body: body ? JSON.parse(body) : undefined,
    });

    if (!config.expectedStatus.includes(response.status)) {
      throw new Error(`Webhook returned unexpected status: ${response.status}`);
    }

    const result = await response.json().catch(() => response.text());
    context.metrics.resourceUsage.networkRequests++;

    return { status: response.status, result };
  }

  // Helper methods
  private mergeVariables(workflowVars: any[], inputVars: Record<string, any>): Record<string, any> {
    const merged: Record<string, any> = {};

    // Set defaults from workflow variables
    for (const workflowVar of workflowVars) {
      if (workflowVar.defaultValue !== null) {
        merged[workflowVar.name] = workflowVar.defaultValue;
      }
    }

    // Override with input variables
    Object.assign(merged, inputVars);

    // Validate required variables
    for (const workflowVar of workflowVars) {
      if (workflowVar.required && !(workflowVar.name in merged)) {
        throw new Error(`Required variable '${workflowVar.name}' is missing`);
      }
    }

    return merged;
  }

  private interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? String(variables[varName]) : match;
    });
  }

  private evaluateConditions(
    conditions: any[],
    variables: Record<string, any>,
    operator: 'AND' | 'OR' = 'AND',
  ): boolean {
    if (conditions.length === 0) return true;

    const results = conditions.map(condition => this.evaluateCondition(condition, variables));

    return operator === 'AND' ? results.every(r => r) : results.some(r => r);
  }

  private evaluateCondition(condition: any, variables: Record<string, any>): boolean {
    const fieldValue = this.getNestedValue(variables, condition.field);
    const expectedValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return fieldValue === expectedValue;
      case 'not_equals':
        return fieldValue !== expectedValue;
      case 'contains':
        return String(fieldValue).includes(String(expectedValue));
      case 'not_contains':
        return !String(fieldValue).includes(String(expectedValue));
      case 'greater_than':
        return Number(fieldValue) > Number(expectedValue);
      case 'less_than':
        return Number(fieldValue) < Number(expectedValue);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'regex_match':
        return new RegExp(expectedValue).test(String(fieldValue));
      default:
        return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async checkDependencies(context: WorkflowExecutionContext, node: any): Promise<boolean> {
    for (const dependency of node.dependencies) {
      const depState = context.nodeStates.get(dependency.dependsOnNodeId);
      if (!depState || depState.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  private async getNextNodes(context: WorkflowExecutionContext, completedNode: any, workflow: any): Promise<string[]> {
    const nextNodes: string[] = [];

    for (const node of workflow.nodes) {
      for (const dependency of node.dependencies) {
        if (dependency.dependsOnNodeId === completedNode.id) {
          const dependenciesSatisfied = await this.checkDependencies(context, node);
          if (dependenciesSatisfied) {
            nextNodes.push(node.id);
          }
        }
      }
    }

    return nextNodes;
  }

  private async handleNodeError(context: WorkflowExecutionContext, node: any, error: any): Promise<void> {
    const nodeState = context.nodeStates.get(node.id);
    if (!nodeState) return;

    nodeState.retryCount++;
    nodeState.error = error.message;

    const retryPolicy = node.retryPolicy;
    if (nodeState.retryCount < retryPolicy.maxRetries) {
      // Calculate retry delay
      let delay = retryPolicy.baseDelay;
      if (retryPolicy.backoffStrategy === 'exponential') {
        delay = Math.min(retryPolicy.baseDelay * Math.pow(2, nodeState.retryCount), retryPolicy.maxDelay);
      } else if (retryPolicy.backoffStrategy === 'linear') {
        delay = Math.min(retryPolicy.baseDelay * nodeState.retryCount, retryPolicy.maxDelay);
      }

      // Schedule retry
      setTimeout(() => {
        this.executeNode(context, node, null);
      }, delay);

      return;
    }

    // Max retries reached
    nodeState.status = 'failed';
    context.metrics.failedNodes++;

    const errorAction = node.errorAction;
    switch (errorAction.action) {
      case 'fail':
        await this.failWorkflow(context, error.message);
        break;
      case 'continue':
        // Continue with next nodes
        break;
      case 'skip':
        nodeState.status = 'skipped';
        context.metrics.skippedNodes++;
        break;
      case 'escalate':
        await this.escalateError(context, node, error);
        break;
    }

    this.emitEvent({
      type: 'node_failed',
      workflowId: context.workflowId,
      executionId: context.executionId,
      nodeId: node.id,
      timestamp: new Date(),
      data: { error: error.message, retryCount: nodeState.retryCount },
    });
  }

  private async waitForTaskCompletion(taskId: string, timeout: number): Promise<any> {
    // Implementation would poll task status or use event-based approach
    // For now, return a placeholder
    return { taskId, status: 'completed', result: 'Task completed successfully' };
  }

  private async updateExecutionState(context: WorkflowExecutionContext): Promise<void> {
    const completedNodes = Array.from(context.nodeStates.values())
      .filter(state => state.status === 'completed')
      .map(state => state.nodeId);

    const failedNodes = Array.from(context.nodeStates.values())
      .filter(state => state.status === 'failed')
      .map(state => state.nodeId);

    await this.prisma.workflowExecution.update({
      where: { id: context.executionId },
      data: {
        completedNodes,
        failedNodes,
        currentNodes: context.executionStack,
      },
    });
  }

  private async checkWorkflowCompletion(context: WorkflowExecutionContext, workflow: any): Promise<void> {
    const allNodesProcessed = Array.from(context.nodeStates.values()).every(
      state => ['completed', 'failed', 'skipped'].includes(state.status),
    );

    if (allNodesProcessed) {
      const hasFailedNodes = context.metrics.failedNodes > 0;
      const status = hasFailedNodes ? 'FAILED' : 'COMPLETED';

      await this.prisma.workflowExecution.update({
        where: { id: context.executionId },
        data: {
          status,
          completedAt: new Date(),
        },
      });

      this.activeExecutions.delete(context.executionId);

      this.emitEvent({
        type: hasFailedNodes ? 'workflow_failed' : 'workflow_completed',
        workflowId: context.workflowId,
        executionId: context.executionId,
        timestamp: new Date(),
        data: { metrics: context.metrics },
      });
    }
  }

  private async failWorkflow(context: WorkflowExecutionContext, error: string): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id: context.executionId },
      data: {
        status: 'FAILED',
        error,
        completedAt: new Date(),
      },
    });

    this.activeExecutions.delete(context.executionId);

    this.emitEvent({
      type: 'workflow_failed',
      workflowId: context.workflowId,
      executionId: context.executionId,
      timestamp: new Date(),
      data: { error },
    });
  }

  private async escalateError(context: WorkflowExecutionContext, node: any, error: any): Promise<void> {
    // Implementation for error escalation (notifications, etc.)
    this.logger.error(`Escalating error for node ${node.id}: ${error.message}`);
  }

  private async queueNodeExecution(context: WorkflowExecutionContext, nodeId: string): Promise<void> {
    // Implementation for queuing node execution when limits are reached
    this.logger.debug(`Queuing node ${nodeId} for later execution`);
  }

  private emitEvent(event: WorkflowEvent): void {
    this.eventEmitter.emit('workflow.event', event);
  }

  private startHeartbeat(): void {
    setInterval(() => {
      this.logger.debug(`Active executions: ${this.activeExecutions.size}`);
    }, this.config.heartbeatInterval);
  }

  private startCleanup(): void {
    setInterval(async () => {
      // Clean up stale executions
      await this.cleanupStaleExecutions();
    }, this.config.cleanupInterval);
  }

  private async cleanupStaleExecutions(): Promise<void> {
    // Implementation for cleaning up stale executions
    this.logger.debug('Running cleanup for stale executions');
  }
}