import { WorkflowDefinition, WorkflowNodeType } from '../workflow.types';

/**
 * Comprehensive Development Workflows combining ByteBot + Rovo AI
 */

export const ROVO_CODE_REVIEW_WORKFLOW: WorkflowDefinition = {
  id: 'rovo-code-review-automated',
  name: 'Rovo AI Code Review Pipeline',
  description: 'Automated code review with security analysis, performance check, and documentation',
  version: 1,
  status: 'ACTIVE',
  priority: 'HIGH',
  allowConcurrentExecutions: false,
  nodes: [
    {
      id: 'init-screenshot',
      type: WorkflowNodeType.TASK,
      dependencies: [],
      config: {
        prompt: 'Take a screenshot to analyze the current development environment',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 5000 },
      errorAction: { action: 'fail' }
    },
    {
      id: 'analyze-context',
      type: WorkflowNodeType.TASK,
      dependencies: ['init-screenshot'],
      config: {
        prompt: 'Analyze the development context - identify IDE, programming language, and project structure',
        model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
        tools: ['analyze_development_context', 'computer']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 10000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'security-analysis',
      type: WorkflowNodeType.PARALLEL,
      dependencies: ['analyze-context'],
      config: {
        branches: [
          {
            name: 'security-scan',
            tasks: [
              {
                prompt: 'Perform comprehensive security analysis of the codebase. Look for vulnerabilities, unsafe patterns, and security best practices violations.',
                model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
                tools: ['code_aware_action', 'computer']
              }
            ]
          },
          {
            name: 'dependency-check',
            tasks: [
              {
                prompt: 'Check package dependencies for known vulnerabilities and outdated packages',
                model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
                tools: ['development_workflow', 'computer']
              }
            ]
          }
        ]
      },
      retryPolicy: { maxRetries: 2, baseDelay: 2000, backoffStrategy: 'linear', maxDelay: 8000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'performance-analysis',
      type: WorkflowNodeType.TASK,
      dependencies: ['security-analysis'],
      config: {
        prompt: 'Analyze code performance - identify bottlenecks, inefficient algorithms, and optimization opportunities',
        model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
        tools: ['code_aware_action', 'analyze_development_context']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 1500, backoffStrategy: 'exponential', maxDelay: 12000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'generate-documentation',
      type: WorkflowNodeType.TASK,
      dependencies: ['performance-analysis'],
      config: {
        prompt: 'Generate comprehensive documentation for the analyzed code including API docs, README updates, and inline comments',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['code_aware_action', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 6000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'create-report',
      type: WorkflowNodeType.TASK,
      dependencies: ['generate-documentation'],
      config: {
        prompt: 'Create a comprehensive code review report with findings, recommendations, and action items. Save to project documentation.',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['computer', 'code_aware_action']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 5000 },
      errorAction: { action: 'fail' }
    }
  ],
  variables: [
    { name: 'project_path', type: 'string', defaultValue: './' },
    { name: 'review_depth', type: 'string', defaultValue: 'comprehensive' },
    { name: 'include_tests', type: 'boolean', defaultValue: true }
  ],
  schedule: {
    enabled: false,
    cronExpression: '0 2 * * 1', // Weekly on Monday at 2 AM
    timezone: 'UTC'
  }
};

export const ROVO_BUG_HUNTING_WORKFLOW: WorkflowDefinition = {
  id: 'rovo-bug-hunting-pipeline',
  name: 'Rovo AI Bug Detection & Resolution',
  description: 'Automated bug detection, analysis, and resolution using AI-driven debugging',
  version: 1,
  status: 'ACTIVE',
  priority: 'HIGH',
  allowConcurrentExecutions: true,
  nodes: [
    {
      id: 'environment-analysis',
      type: WorkflowNodeType.TASK,
      dependencies: [],
      config: {
        prompt: 'Analyze the current development environment and identify any visible errors, warnings, or issues',
        model: { provider: 'rovo', name: 'rovo-dev-ai-debugging' },
        tools: ['computer', 'analyze_development_context']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 5000 },
      errorAction: { action: 'fail' }
    },
    {
      id: 'error-detection',
      type: WorkflowNodeType.CONDITION,
      dependencies: ['environment-analysis'],
      config: {
        condition: {
          field: 'errors_found',
          operator: 'greater_than',
          value: 0
        },
        onTrue: 'debug-analysis',
        onFalse: 'proactive-testing'
      }
    },
    {
      id: 'debug-analysis',
      type: WorkflowNodeType.TASK,
      dependencies: ['error-detection'],
      config: {
        prompt: 'Perform detailed debugging analysis of the identified errors. Examine stack traces, error messages, and code context.',
        model: { provider: 'rovo', name: 'rovo-dev-ai-debugging' },
        tools: ['code_aware_action', 'development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 2000, backoffStrategy: 'exponential', maxDelay: 15000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'proactive-testing',
      type: WorkflowNodeType.TASK,
      dependencies: ['error-detection'],
      config: {
        prompt: 'No immediate errors found. Run comprehensive tests to identify potential issues and edge cases.',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1500, backoffStrategy: 'linear', maxDelay: 6000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'fix-implementation',
      type: WorkflowNodeType.TASK,
      dependencies: ['debug-analysis', 'proactive-testing'],
      config: {
        prompt: 'Implement fixes for identified issues. Apply best practices and ensure no regression.',
        model: { provider: 'rovo', name: 'rovo-dev-ai-debugging' },
        tools: ['code_aware_action', 'computer']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 2000, backoffStrategy: 'exponential', maxDelay: 12000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'validation-testing',
      type: WorkflowNodeType.TASK,
      dependencies: ['fix-implementation'],
      config: {
        prompt: 'Run tests to validate fixes and ensure no new issues were introduced',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 8000 },
      errorAction: { action: 'retry' }
    }
  ],
  variables: [
    { name: 'test_suite', type: 'string', defaultValue: 'all' },
    { name: 'fix_approach', type: 'string', defaultValue: 'conservative' },
    { name: 'create_backup', type: 'boolean', defaultValue: true }
  ]
};

export const ROVO_FEATURE_DEVELOPMENT_WORKFLOW: WorkflowDefinition = {
  id: 'rovo-feature-development-pipeline',
  name: 'Rovo AI Feature Development Pipeline',
  description: 'End-to-end feature development with AI assistance - from planning to deployment',
  version: 1,
  status: 'ACTIVE',
  priority: 'MEDIUM',
  allowConcurrentExecutions: true,
  nodes: [
    {
      id: 'requirement-analysis',
      type: WorkflowNodeType.TASK,
      dependencies: [],
      config: {
        prompt: 'Analyze the feature requirements and create a detailed implementation plan with architecture considerations',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['computer', 'analyze_development_context']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 5000 },
      errorAction: { action: 'fail' }
    },
    {
      id: 'setup-development-branch',
      type: WorkflowNodeType.TASK,
      dependencies: ['requirement-analysis'],
      config: {
        prompt: 'Create a new development branch for the feature and set up the development environment',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 1500, backoffStrategy: 'exponential', maxDelay: 10000 },
      errorAction: { action: 'fail' }
    },
    {
      id: 'implement-core-logic',
      type: WorkflowNodeType.TASK,
      dependencies: ['setup-development-branch'],
      config: {
        prompt: 'Implement the core feature logic following best practices and design patterns',
        model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
        tools: ['code_aware_action', 'computer']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 2000, backoffStrategy: 'exponential', maxDelay: 15000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'generate-tests',
      type: WorkflowNodeType.PARALLEL,
      dependencies: ['implement-core-logic'],
      config: {
        branches: [
          {
            name: 'unit-tests',
            tasks: [
              {
                prompt: 'Generate comprehensive unit tests for the implemented feature',
                model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
                tools: ['code_aware_action', 'computer']
              }
            ]
          },
          {
            name: 'integration-tests',
            tasks: [
              {
                prompt: 'Create integration tests to ensure the feature works with existing systems',
                model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
                tools: ['development_workflow', 'computer']
              }
            ]
          }
        ]
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1500, backoffStrategy: 'linear', maxDelay: 8000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'documentation-and-examples',
      type: WorkflowNodeType.TASK,
      dependencies: ['generate-tests'],
      config: {
        prompt: 'Create documentation and usage examples for the new feature',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['code_aware_action', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 6000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'code-review-prep',
      type: WorkflowNodeType.TASK,
      dependencies: ['documentation-and-examples'],
      config: {
        prompt: 'Perform self-review, run all tests, and prepare the feature for code review',
        model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1500, backoffStrategy: 'exponential', maxDelay: 8000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'create-pull-request',
      type: WorkflowNodeType.TASK,
      dependencies: ['code-review-prep'],
      config: {
        prompt: 'Create a detailed pull request with description, testing notes, and deployment considerations',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 5000 },
      errorAction: { action: 'fail' }
    }
  ],
  variables: [
    { name: 'feature_name', type: 'string', required: true },
    { name: 'target_branch', type: 'string', defaultValue: 'main' },
    { name: 'include_e2e_tests', type: 'boolean', defaultValue: false },
    { name: 'deployment_environment', type: 'string', defaultValue: 'staging' }
  ]
};

export const ROVO_PERFORMANCE_OPTIMIZATION_WORKFLOW: WorkflowDefinition = {
  id: 'rovo-performance-optimization',
  name: 'Rovo AI Performance Optimization Pipeline',
  description: 'Automated performance analysis and optimization with benchmarking',
  version: 1,
  status: 'ACTIVE',
  priority: 'MEDIUM',
  allowConcurrentExecutions: false,
  nodes: [
    {
      id: 'baseline-measurement',
      type: WorkflowNodeType.TASK,
      dependencies: [],
      config: {
        prompt: 'Establish performance baseline by running benchmarks and profiling the application',
        model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 3, baseDelay: 2000, backoffStrategy: 'exponential', maxDelay: 12000 },
      errorAction: { action: 'fail' }
    },
    {
      id: 'identify-bottlenecks',
      type: WorkflowNodeType.TASK,
      dependencies: ['baseline-measurement'],
      config: {
        prompt: 'Analyze performance data to identify bottlenecks, slow queries, and inefficient code patterns',
        model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
        tools: ['code_aware_action', 'analyze_development_context']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1500, backoffStrategy: 'exponential', maxDelay: 8000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'optimization-implementation',
      type: WorkflowNodeType.LOOP,
      dependencies: ['identify-bottlenecks'],
      config: {
        condition: {
          field: 'optimization_opportunities',
          operator: 'greater_than',
          value: 0
        },
        maxIterations: 5,
        loopBody: [
          {
            prompt: 'Implement performance optimizations for identified bottlenecks',
            model: { provider: 'rovo', name: 'rovo-dev-ai-code-focused' },
            tools: ['code_aware_action', 'computer']
          },
          {
            prompt: 'Run performance tests to validate improvements',
            model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
            tools: ['development_workflow', 'computer']
          }
        ]
      },
      retryPolicy: { maxRetries: 2, baseDelay: 2000, backoffStrategy: 'linear', maxDelay: 10000 },
      errorAction: { action: 'continue' }
    },
    {
      id: 'final-benchmarking',
      type: WorkflowNodeType.TASK,
      dependencies: ['optimization-implementation'],
      config: {
        prompt: 'Run final performance benchmarks and generate improvement report',
        model: { provider: 'rovo', name: 'rovo-dev-ai-v1' },
        tools: ['development_workflow', 'computer']
      },
      retryPolicy: { maxRetries: 2, baseDelay: 1500, backoffStrategy: 'exponential', maxDelay: 8000 },
      errorAction: { action: 'continue' }
    }
  ],
  variables: [
    { name: 'optimization_target', type: 'string', defaultValue: 'response_time' },
    { name: 'acceptable_improvement', type: 'number', defaultValue: 20 },
    { name: 'max_optimization_time', type: 'number', defaultValue: 3600 }
  ]
};

// Export all workflows for easy import
export const ROVO_DEVELOPMENT_WORKFLOWS = [
  ROVO_CODE_REVIEW_WORKFLOW,
  ROVO_BUG_HUNTING_WORKFLOW,
  ROVO_FEATURE_DEVELOPMENT_WORKFLOW,
  ROVO_PERFORMANCE_OPTIMIZATION_WORKFLOW
];