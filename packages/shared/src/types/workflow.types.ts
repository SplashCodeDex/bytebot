export interface WorkflowNode {
  id: string;
  type: 'task' | 'condition' | 'loop' | 'parallel' | 'human_approval' | 'delay' | 'webhook';
  name: string;
  description?: string;
  position: { x: number; y: number };
  
  // Task-specific properties
  taskConfig?: {
    prompt: string;
    priority: number;
    timeout: number;
    maxRetries: number;
    model?: string;
  };
  
  // Condition-specific properties
  conditionConfig?: {
    conditions: WorkflowCondition[];
    operator: 'AND' | 'OR';
    truePath: string[];  // Node IDs to execute if true
    falsePath: string[]; // Node IDs to execute if false
  };
  
  // Loop-specific properties
  loopConfig?: {
    iterationType: 'count' | 'condition' | 'array';
    maxIterations?: number;
    condition?: WorkflowCondition;
    arrayVariable?: string;
    bodyNodes: string[]; // Node IDs to execute in loop
  };
  
  // Parallel execution properties
  parallelConfig?: {
    branches: string[][]; // Array of node ID arrays to execute in parallel
    waitForAll: boolean; // Wait for all branches or first completion
  };
  
  // Human approval properties
  approvalConfig?: {
    approvers: string[]; // User IDs or roles
    timeoutAction: 'fail' | 'approve' | 'reject';
    timeoutMinutes: number;
    instructions: string;
  };
  
  // Delay properties
  delayConfig?: {
    duration: number; // milliseconds
    dynamicDuration?: string; // Variable name for dynamic delay
  };
  
  // Webhook properties
  webhookConfig?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers: Record<string, string>;
    body?: any;
    expectedStatus: number[];
  };
  
  // General properties
  dependencies: string[]; // Node IDs that must complete before this node
  variables?: Record<string, any>; // Node-specific variables
  retryPolicy: RetryPolicy;
  onError: ErrorAction;
}

export interface WorkflowCondition {
  field: string; // Variable name or property path
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'exists' | 'regex_match';
  value: any;
  caseSensitive?: boolean;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  retryOn: ('error' | 'timeout' | 'network_error')[];
}

export interface ErrorAction {
  action: 'fail' | 'continue' | 'retry' | 'skip' | 'escalate';
  fallbackNodes?: string[]; // Alternative nodes to execute on error
  notifyUsers?: string[]; // Users to notify on error
  customMessage?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: string;
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  tags: string[];
  
  // Workflow structure
  nodes: WorkflowNode[];
  entryPoints: string[]; // Starting node IDs
  variables: Record<string, WorkflowVariable>;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  
  // Configuration
  maxExecutionTime: number; // milliseconds
  priority: number;
  allowConcurrentExecutions: boolean;
  retentionDays: number; // How long to keep execution logs
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: any;
  required: boolean;
  description?: string;
  validation?: {
    pattern?: string; // regex for string validation
    min?: number; // min value for numbers, min length for strings/arrays
    max?: number; // max value for numbers, max length for strings/arrays
    enum?: any[]; // allowed values
  };
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  
  // Execution context
  variables: Record<string, any>;
  currentNodes: string[]; // Currently executing node IDs
  completedNodes: string[]; // Completed node IDs
  failedNodes: string[]; // Failed node IDs
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  estimatedCompletionAt?: Date;
  
  // Results
  result?: any;
  error?: string;
  logs: WorkflowExecutionLog[];
  
  // Metadata
  triggeredBy: string; // User ID or system
  triggerData?: any; // Data that triggered the workflow
  priority: number;
}

export interface WorkflowExecutionLog {
  id: string;
  timestamp: Date;
  nodeId?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  duration?: number; // milliseconds
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: Omit<Workflow, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;
  popularity: number;
  tags: string[];
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  enabled: boolean;
  
  // Schedule configuration
  scheduleType: 'cron' | 'interval' | 'once' | 'event';
  cronExpression?: string; // For cron schedules
  intervalMinutes?: number; // For interval schedules
  executeAt?: Date; // For one-time schedules
  eventTriggers?: string[]; // Event names for event-based triggers
  
  // Execution configuration
  variables: Record<string, any>;
  maxConcurrentExecutions: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
}