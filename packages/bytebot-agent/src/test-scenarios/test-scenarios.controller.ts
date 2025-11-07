import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { RovoDesktopTestService } from './rovo-desktop-test.service';

@Controller('test-scenarios')
export class TestScenariosController {
  private readonly logger = new Logger(TestScenariosController.name);

  constructor(private readonly testService: RovoDesktopTestService) {}

  /**
   * Get all available test scenarios
   */
  @Get()
  getTestScenarios() {
    return {
      scenarios: this.testService.getTestScenarios(),
      description: 'Available Rovo Desktop Control test scenarios'
    };
  }

  /**
   * Execute a specific test scenario
   */
  @Post('execute/:scenarioId')
  async executeScenario(@Param('scenarioId') scenarioId: string) {
    try {
      const taskId = await this.testService.executeTestScenario(scenarioId);
      return {
        success: true,
        scenarioId,
        taskId,
        message: `Test scenario started successfully`,
        monitorUrl: `http://localhost:3000/tasks/${taskId}`
      };
    } catch (error) {
      this.logger.error(`Failed to execute scenario ${scenarioId}:`, error.stack);
      return {
        success: false,
        scenarioId,
        error: error.message
      };
    }
  }

  /**
   * Execute all test scenarios
   */
  @Post('execute-all')
  async executeAllScenarios() {
    try {
      const results = await this.testService.executeAllTestScenarios();
      const taskIds = Object.values(results).filter(id => !id.startsWith('ERROR:'));
      
      return {
        success: true,
        message: `Started ${taskIds.length} test scenarios`,
        results,
        monitorUrl: 'http://localhost:3000/tasks',
        reportEndpoint: '/test-scenarios/report'
      };
    } catch (error) {
      this.logger.error('Failed to execute all scenarios:', error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute workflow test scenario
   */
  @Post('workflow/:workflowId')
  async executeWorkflowTest(
    @Param('workflowId') workflowId: string,
    @Body() variables: Record<string, any> = {}
  ) {
    try {
      const executionId = await this.testService.executeWorkflowTestScenario(workflowId, variables);
      return {
        success: true,
        workflowId,
        executionId,
        message: 'Workflow test started successfully',
        monitorUrl: `http://localhost:3000/workflows/${executionId}`
      };
    } catch (error) {
      this.logger.error(`Failed to execute workflow test ${workflowId}:`, error.stack);
      return {
        success: false,
        workflowId,
        error: error.message
      };
    }
  }

  /**
   * Execute integration test
   */
  @Post('integration')
  async executeIntegrationTest(@Body() scenario: {
    githubRepo?: { owner: string; repo: string };
    jiraProject?: { projectKey: string };
    testType: 'github-pr' | 'jira-issue' | 'full-pipeline';
  }) {
    try {
      const result = await this.testService.executeIntegrationTest(scenario);
      return {
        success: true,
        testType: scenario.testType,
        result,
        message: 'Integration test started successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to execute integration test:`, error.stack);
      return {
        success: false,
        testType: scenario.testType,
        error: error.message
      };
    }
  }

  /**
   * Generate test report
   */
  @Post('report')
  async generateReport(@Body() { taskIds }: { taskIds: string[] }) {
    try {
      const report = await this.testService.generateTestReport(taskIds);
      return {
        success: true,
        report
      };
    } catch (error) {
      this.logger.error('Failed to generate test report:', error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Quick demo - runs a simple code analysis test
   */
  @Post('quick-demo')
  async quickDemo() {
    try {
      this.logger.log('🚀 Starting Rovo AI Desktop Control Quick Demo...');
      
      const taskId = await this.testService.executeTestScenario('rovo-code-analysis-basic');
      
      return {
        success: true,
        message: '🎉 Rovo AI Desktop Control Demo Started!',
        taskId,
        description: 'Rovo AI is now analyzing your code and development environment',
        instructions: [
          '1. Visit http://localhost:3000/tasks to see Rovo in action',
          '2. Watch as Rovo takes screenshots and analyzes your IDE',
          '3. See intelligent code analysis and recommendations',
          '4. Observe context-aware navigation and actions'
        ],
        monitorUrl: `http://localhost:3000/tasks/${taskId}`,
        expectedBehavior: [
          '📸 Takes screenshot of current development environment',
          '🔍 Identifies programming language and framework',
          '🏗️ Analyzes code structure and architecture',
          '💡 Provides actionable improvement recommendations',
          '🧭 Navigates through code intelligently'
        ]
      };
    } catch (error) {
      this.logger.error('Quick demo failed:', error.stack);
      return {
        success: false,
        error: error.message,
        troubleshooting: [
          'Ensure ByteBot services are running',
          'Check that the desktop environment is accessible',
          'Verify Rovo AI service is properly configured'
        ]
      };
    }
  }
}