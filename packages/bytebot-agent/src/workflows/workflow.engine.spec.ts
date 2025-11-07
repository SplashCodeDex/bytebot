import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowEngine } from './workflow.engine';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

describe('WorkflowEngine', () => {
  let service: WorkflowEngine;
  let prisma: jest.Mocked<PrismaService>;
  let tasksService: jest.Mocked<TasksService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngine,
        {
          provide: PrismaService,
          useValue: {
            workflow: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            workflowExecution: {
              create: jest.fn(),
              update: jest.fn(),
              findFirst: jest.fn(),
            },
            pendingApproval: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: TasksService,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowEngine>(WorkflowEngine);
    prisma = module.get(PrismaService);
    tasksService = module.get(TasksService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeWorkflow', () => {
    it('should successfully execute a simple workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        status: 'ACTIVE',
        version: 1,
        priority: 'MEDIUM',
        allowConcurrentExecutions: false,
        nodes: [
          {
            id: 'node-1',
            type: 'TASK',
            dependencies: [],
            config: {
              prompt: 'Test task',
              model: { provider: 'anthropic', name: 'claude-3-sonnet-20240229' },
            },
            retryPolicy: { maxRetries: 3, baseDelay: 1000, backoffStrategy: 'exponential', maxDelay: 10000 },
            errorAction: { action: 'fail' },
          },
        ],
        variables: [],
      };

      const mockExecution = {
        id: 'execution-1',
        workflowId: 'workflow-1',
        workflowVersion: 1,
        variables: {},
        currentNodes: [],
        completedNodes: [],
        failedNodes: [],
        triggeredBy: 'test-user',
        triggerData: null,
        priority: 'MEDIUM',
      };

      prisma.workflow.findUnique.mockResolvedValue(mockWorkflow as any);
      prisma.workflowExecution.findFirst.mockResolvedValue(null);
      prisma.workflowExecution.create.mockResolvedValue(mockExecution as any);

      const result = await service.executeWorkflow('workflow-1', {}, 'test-user');

      expect(result).toBe('execution-1');
      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'workflow-1' },
        include: {
          nodes: {
            include: {
              dependencies: true,
            },
          },
          variables: true,
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('workflow.event', expect.objectContaining({
        type: 'workflow_started',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
      }));
    });

    it('should throw error if workflow not found', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.executeWorkflow('non-existent', {}, 'test-user'))
        .rejects.toThrow('Workflow non-existent not found');
    });

    it('should throw error if workflow is not active', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        status: 'INACTIVE',
        nodes: [],
        variables: [],
      };

      prisma.workflow.findUnique.mockResolvedValue(mockWorkflow as any);

      await expect(service.executeWorkflow('workflow-1', {}, 'test-user'))
        .rejects.toThrow('Workflow workflow-1 is not active');
    });

    it('should prevent concurrent execution when not allowed', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        status: 'ACTIVE',
        allowConcurrentExecutions: false,
        nodes: [],
        variables: [],
      };

      const mockActiveExecution = {
        id: 'active-execution',
        status: 'RUNNING',
      };

      prisma.workflow.findUnique.mockResolvedValue(mockWorkflow as any);
      prisma.workflowExecution.findFirst.mockResolvedValue(mockActiveExecution as any);

      await expect(service.executeWorkflow('workflow-1', {}, 'test-user'))
        .rejects.toThrow('Workflow workflow-1 is already running');
    });
  });

  describe('condition evaluation', () => {
    it('should correctly evaluate simple conditions', () => {
      const variables = { count: 5, name: 'test' };
      
      // Test equals
      const result1 = service['evaluateCondition']({ field: 'count', operator: 'equals', value: 5 }, variables);
      expect(result1).toBe(true);

      // Test greater_than
      const result2 = service['evaluateCondition']({ field: 'count', operator: 'greater_than', value: 3 }, variables);
      expect(result2).toBe(true);

      // Test contains
      const result3 = service['evaluateCondition']({ field: 'name', operator: 'contains', value: 'es' }, variables);
      expect(result3).toBe(true);
    });

    it('should handle nested field access', () => {
      const variables = { user: { profile: { age: 25 } } };
      
      const result = service['evaluateCondition']({ field: 'user.profile.age', operator: 'greater_than', value: 18 }, variables);
      expect(result).toBe(true);
    });
  });

  describe('variable interpolation', () => {
    it('should interpolate variables in templates', () => {
      const variables = { name: 'John', age: 30 };
      const template = 'Hello {{name}}, you are {{age}} years old';
      
      const result = service['interpolateVariables'](template, variables);
      expect(result).toBe('Hello John, you are 30 years old');
    });

    it('should leave unknown variables unchanged', () => {
      const variables = { name: 'John' };
      const template = 'Hello {{name}}, you are {{age}} years old';
      
      const result = service['interpolateVariables'](template, variables);
      expect(result).toBe('Hello John, you are {{age}} years old');
    });
  });
});