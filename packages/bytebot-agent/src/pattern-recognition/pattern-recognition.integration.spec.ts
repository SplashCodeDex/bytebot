import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TaskPatternService } from './task-pattern.service';
import { ToolUsageAnalyzerService } from './tool-usage-analyzer.service';
import { InteractionPatternService } from './interaction-pattern.service';

describe('Pattern Recognition Integration', () => {
  let module: TestingModule;
  let taskPatternService: TaskPatternService;
  let toolUsageAnalyzer: ToolUsageAnalyzerService;
  let interactionPatternService: InteractionPatternService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TaskPatternService,
        ToolUsageAnalyzerService,
        InteractionPatternService,
        {
          provide: PrismaService,
          useValue: {
            task: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            message: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    taskPatternService = module.get<TaskPatternService>(TaskPatternService);
    toolUsageAnalyzer = module.get<ToolUsageAnalyzerService>(
      ToolUsageAnalyzerService,
    );
    interactionPatternService = module.get<InteractionPatternService>(
      InteractionPatternService,
    );
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('End-to-End Pattern Analysis', () => {
    it('should analyze complete task patterns and provide recommendations', async () => {
      // Mock task data with various patterns
      const mockTasks = [
        {
          id: 'task-1',
          description: 'Open browser and navigate to website',
          status: 'COMPLETED',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          completedAt: new Date('2024-01-01'),
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: 'computer',
                  input: { action: 'screenshot' },
                },
                {
                  type: 'tool_use',
                  name: 'computer',
                  input: { action: 'click', coordinate: [100, 200] },
                },
              ],
            },
          ],
        },
        {
          id: 'task-2',
          description: 'Open browser and navigate to different website',
          status: 'COMPLETED',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          completedAt: new Date('2024-01-02'),
          messages: [
            {
              id: 'msg-2',
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: 'computer',
                  input: { action: 'screenshot' },
                },
                {
                  type: 'tool_use',
                  name: 'computer',
                  input: { action: 'click', coordinate: [150, 250] },
                },
              ],
            },
          ],
        },
        {
          id: 'task-3',
          description: 'Failed browser navigation',
          status: 'FAILED',
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          error: 'Network timeout',
          messages: [
            {
              id: 'msg-3',
              role: 'assistant',
              content: 'Error: Unable to connect to website',
            },
          ],
        },
      ];

      prisma.task.findMany.mockResolvedValue(mockTasks as any);
      prisma.message.findMany.mockResolvedValue(
        mockTasks.flatMap((task) => task.messages) as any,
      );

      // Analyze patterns
      await taskPatternService.analyzeTaskPatterns();

      // Get pattern statistics
      const stats = taskPatternService.getPatternStats();

      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(stats.totalTasksAnalyzed).toBe(3);
      expect(stats.averageSuccessRate).toBeLessThan(1); // Should account for failed task

      // Check failure reasons extraction
      const patterns = Array.from(taskPatternService['patterns'].values());
      const failedPattern = patterns.find((p) => p.failureReasons.length > 0);
      expect(failedPattern?.failureReasons).toContain('Network timeout');
    });

    it('should provide tool usage recommendations', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          taskId: 'task-1',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'computer',
              input: { action: 'screenshot' },
            },
          ],
          createdAt: new Date(),
        },
        {
          id: 'msg-2',
          taskId: 'task-1',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'computer',
              input: { action: 'screenshot' },
            },
          ],
          createdAt: new Date(),
        },
      ];

      prisma.message.findMany.mockResolvedValue(mockMessages as any);

      const recommendations =
        await toolUsageAnalyzer.getToolUsageRecommendations();

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);

      // Should detect frequent screenshot usage
      const screenshotRecommendation = recommendations.find((r) =>
        r.recommendation.includes('screenshot'),
      );
      expect(screenshotRecommendation).toBeDefined();
    });

    it('should detect interaction patterns and anomalies', async () => {
      const mockInteractions = [
        { timestamp: new Date(), action: 'click', success: true },
        { timestamp: new Date(), action: 'type', success: true },
        { timestamp: new Date(), action: 'click', success: false },
        { timestamp: new Date(), action: 'screenshot', success: true },
      ];

      // Analyze interaction patterns
      for (const interaction of mockInteractions) {
        interactionPatternService.recordInteraction(interaction);
      }

      const patterns = interactionPatternService.getPatterns();
      expect(patterns.commonSequences.length).toBeGreaterThan(0);
      expect(patterns.successRates).toBeDefined();

      // Should detect that click actions have mixed success rates
      expect(patterns.successRates['click']).toBeLessThan(1);
      expect(patterns.successRates['type']).toBe(1);
    });
  });

  describe('Pattern-Based Optimization', () => {
    it('should suggest workflow optimizations based on patterns', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          description: 'Repetitive data entry task',
          status: 'COMPLETED',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          completedAt: new Date('2024-01-02'), // 1 day duration
          messages: [],
        },
        {
          id: 'task-2',
          description: 'Another repetitive data entry task',
          status: 'COMPLETED',
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          completedAt: new Date('2024-01-04'), // 1 day duration
          messages: [],
        },
      ];

      prisma.task.findMany.mockResolvedValue(mockTasks as any);

      await taskPatternService.analyzeTaskPatterns();
      const stats = taskPatternService.getPatternStats();

      // Should identify repetitive patterns
      expect(stats.mostFrequent.length).toBeGreaterThan(0);
      const topPattern = stats.mostFrequent[0];
      expect(topPattern.frequency).toBeGreaterThanOrEqual(2);
    });
  });
});
