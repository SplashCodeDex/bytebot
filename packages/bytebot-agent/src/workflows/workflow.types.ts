export * from '../../../shared/src/types/workflow.types';

// Additional agent-specific workflow types
export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  variables: Record<string, any>;
  nodeStates: Map<string, NodeExecutionState>;
  executionStack: string[]; // Stack of currently executing nodes
  parallelBranches: Map<string, ParallelBranchState>;
  pendingApprovals: Map<string, PendingApproval>;
  metrics: WorkflowMetrics;
}

export interface NodeExecutionState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval';
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  retryCount: number;
  logs: string[];
}

export interface ParallelBranchState {
  branchId: string;
  nodeIds: string[];
  status: 'running' | 'completed' | 'failed';
  completedNodes: string[];
  failedNodes: string[];
}

export interface PendingApproval {
  nodeId: string;
  approvers: string[];
  instructions: string;
  requestedAt: Date;
  expiresAt: Date;
  responses: ApprovalResponse[];
}

export interface ApprovalResponse {
  userId: string;
  decision: 'approve' | 'reject';
  comment?: string;
  respondedAt: Date;
}

export interface WorkflowMetrics {
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  executionTime: number; // milliseconds
  estimatedRemainingTime?: number;
  resourceUsage: {
    cpuTime: number;
    memoryPeak: number;
    networkRequests: number;
  };
}

export interface WorkflowEngineConfig {
  maxConcurrentWorkflows: number;
  maxConcurrentNodesPerWorkflow: number;
  defaultTimeout: number;
  defaultRetries: number;
  heartbeatInterval: number;
  cleanupInterval: number;
  enableMetrics: boolean;
  enableAuditLogging: boolean;
}

export interface WorkflowEvent {
  type: 'workflow_started' | 'workflow_completed' | 'workflow_failed' | 'node_started' | 'node_completed' | 'node_failed' | 'approval_requested' | 'approval_received';
  workflowId: string;
  executionId: string;
  nodeId?: string;
  timestamp: Date;
  data?: any;
  userId?: string;
}

export interface WorkflowValidator {
  validateWorkflow(workflow: Workflow): ValidationResult;
  validateExecution(execution: WorkflowExecution): ValidationResult;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}