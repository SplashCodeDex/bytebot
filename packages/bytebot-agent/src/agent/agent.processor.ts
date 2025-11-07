import { TasksService } from '../tasks/tasks.service';
import { MessagesService } from '../messages/messages.service';
import { Injectable, Logger } from '@nestjs/common';
import {
  Message,
  Role,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import { AnthropicService } from '../anthropic/anthropic.service';
import {
  isComputerToolUseContentBlock,
  isSetTaskStatusToolUseBlock,
  isCreateTaskToolUseBlock,
  SetTaskStatusToolUseBlock,
} from '@bytebot/shared';

import {
  MessageContentBlock,
  MessageContentType,
  ToolResultContentBlock,
  TextContentBlock,
} from '@bytebot/shared';
import { InputCaptureService } from './input-capture.service';
import { OnEvent } from '@nestjs/event-emitter';
import { OpenAIService } from '../openai/openai.service';
import { GoogleService } from '../google/google.service';
import { RovoService } from '../rovo/rovo.service';
import {
  BytebotAgentModel,
  BytebotAgentService,
  BytebotAgentResponse,
} from './agent.types';
import {
  AGENT_SYSTEM_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
} from './agent.constants';
import { SummariesService } from '../summaries/summaries.service';
import { handleComputerToolUse } from './agent.computer-use';
import { ProxyService } from '../proxy/proxy.service';
import { EnhancedRetryService } from '../utils/enhanced-retry.service';
import {
  PerformanceMonitorService,
  PerformanceMetrics,
} from '../monitoring/performance-monitor.service';
import { AnomalyDetectorService } from '../monitoring/anomaly-detector.service';

@Injectable()
export class AgentProcessor {
  private readonly logger = new Logger(AgentProcessor.name);
  private currentTaskId: string | null = null;
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private services: Record<string, BytebotAgentService> = {};

  constructor(
    private readonly tasksService: TasksService,
    private readonly messagesService: MessagesService,
    private readonly summariesService: SummariesService,
    private readonly anthropicService: AnthropicService,
    private readonly openaiService: OpenAIService,
    private readonly googleService: GoogleService,
    private readonly rovoService: RovoService,
    private readonly proxyService: ProxyService,
    private readonly inputCaptureService: InputCaptureService,
    private readonly enhancedRetryService: EnhancedRetryService,
    private readonly performanceMonitor: PerformanceMonitorService,
    private readonly anomalyDetector: AnomalyDetectorService,
  ) {
    this.services = {
      anthropic: this.anthropicService,
      openai: this.openaiService,
      google: this.googleService,
      rovo: this.rovoService,
      proxy: this.proxyService,
    };
    this.logger.log('AgentProcessor initialized');
  }

  /**
   * Generate message with automatic fallback to other providers when quota/rate limits are hit
   */
  private async generateMessageWithFallback(
    primaryModel: BytebotAgentModel,
    systemPrompt: string,
    messages: Message[],
    useTools: boolean,
    signal?: AbortSignal,
  ): Promise<BytebotAgentResponse> {
    const fallbackProviders = [
      { provider: 'rovo', models: ['rovo-dev-ai-v1', 'rovo-dev-ai-code-focused'] },
      { provider: 'google', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
      {
        provider: 'anthropic',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
      },
      { provider: 'openai', models: ['gpt-4o', 'gpt-4o-mini'] },
    ];

    // Try the primary model first
    const primaryService = this.services[primaryModel.provider];
    if (!primaryService) {
      throw new Error(
        `No service found for model provider: ${primaryModel.provider}`,
      );
    }

    try {
      this.logger.log(
        `Attempting to use primary model: ${primaryModel.name} (${primaryModel.provider})`,
      );
      return await primaryService.generateMessage(
        systemPrompt,
        messages,
        primaryModel.name,
        useTools,
        signal,
      );
    } catch (error: any) {
      // Check if this is a quota or rate limit error that we can fall back from
      if (
        error.name === 'QuotaExceededError' ||
        error.message?.includes('quota') ||
        error.message?.includes('429')
      ) {
        this.logger.warn(
          `Primary model ${primaryModel.name} hit quota/rate limit. Attempting fallback...`,
        );

        // Try fallback providers
        for (const fallback of fallbackProviders) {
          // Skip the primary provider since it already failed
          if (fallback.provider === primaryModel.provider) {
            continue;
          }

          const fallbackService = this.services[fallback.provider];
          if (!fallbackService) {
            this.logger.warn(
              `Fallback service ${fallback.provider} not available`,
            );
            continue;
          }

          for (const modelName of fallback.models) {
            try {
              this.logger.log(
                `Trying fallback: ${modelName} (${fallback.provider})`,
              );
              const response = await fallbackService.generateMessage(
                systemPrompt,
                messages,
                modelName,
                useTools,
                signal,
              );
              this.logger.log(
                `Successfully used fallback model: ${modelName} (${fallback.provider})`,
              );
              return response;
            } catch (fallbackError: any) {
              this.logger.warn(
                `Fallback model ${modelName} (${fallback.provider}) also failed: ${fallbackError.message}`,
              );
              continue;
            }
          }
        }

        // If all fallbacks failed, throw the original error with additional context
        throw new Error(
          `All AI providers failed. Primary error: ${error.message}. Please check your API keys and quotas.`,
        );
      }

      // For non-quota errors, throw immediately
      throw error;
    }
  }

  /**
   * Check if the processor is currently processing a task
   */
  isRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Get the current task ID being processed
   */
  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  @OnEvent('task.takeover')
  handleTaskTakeover({ taskId }: { taskId: string }) {
    this.logger.log(`Task takeover event received for task ID: ${taskId}`);

    // If the agent is still processing this task, abort any in-flight operations
    if (this.currentTaskId === taskId && this.isProcessing) {
      this.abortController?.abort();
    }

    // Always start capturing user input so that emitted actions are received
    this.inputCaptureService.start(taskId);
  }

  @OnEvent('task.resume')
  handleTaskResume({ taskId }: { taskId: string }) {
    if (this.currentTaskId === taskId && this.isProcessing) {
      this.logger.log(`Task resume event received for task ID: ${taskId}`);
      this.abortController = new AbortController();

      void this.runIteration(taskId);
    }
  }

  @OnEvent('task.cancel')
  async handleTaskCancel({ taskId }: { taskId: string }) {
    this.logger.log(`Task cancel event received for task ID: ${taskId}`);

    await this.stopProcessing();
  }

  processTask(taskId: string) {
    this.logger.log(`Starting processing for task ID: ${taskId}`);

    if (this.isProcessing) {
      this.logger.warn('AgentProcessor is already processing another task');
      return;
    }

    this.isProcessing = true;
    this.currentTaskId = taskId;
    this.abortController = new AbortController();

    // Kick off the first iteration without blocking the caller
    void this.runIteration(taskId);
  }

  /**
   * Runs a single iteration of task processing and schedules the next
   * iteration via setImmediate while the task remains RUNNING.
   */
  private async runIteration(taskId: string): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    const iterationStartTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    let tokenUsage = 0;
    const iterationCount = 1;

    try {
      const task: Task = await this.tasksService.findById(taskId);

      if (task.status !== TaskStatus.RUNNING) {
        this.logger.log(
          `Task processing completed for task ID: ${taskId} with status: ${task.status}`,
        );
        this.isProcessing = false;
        this.currentTaskId = null;
        return;
      }

      this.logger.log(`Processing iteration for task ID: ${taskId}`);

      // Refresh abort controller for this iteration to avoid accumulating
      // "abort" listeners on a single AbortSignal across iterations.
      this.abortController = new AbortController();

      const latestSummary = await this.summariesService.findLatest(taskId);
      const unsummarizedMessages =
        await this.messagesService.findUnsummarized(taskId);
      const messages = [
        ...(latestSummary
          ? [
              {
                id: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                taskId,
                summaryId: null,
                role: Role.USER,
                content: [
                  {
                    type: MessageContentType.Text,
                    text: latestSummary.content,
                  },
                ],
              },
            ]
          : []),
        ...unsummarizedMessages,
      ];
      this.logger.debug(
        `Sending ${messages.length} messages to LLM for processing`,
      );

      const model = task.model as unknown as BytebotAgentModel;
      let agentResponse: BytebotAgentResponse;

      // Try the primary service first, with fallback support
      agentResponse =
        await this.enhancedRetryService.withRetryAndCircuitBreaker(
          () =>
            this.generateMessageWithFallback(
              model,
              AGENT_SYSTEM_PROMPT,
              messages,
              true,
              this.abortController.signal,
            ),
          `ai_provider_${model.provider}`,
          { maxAttempts: 2, baseDelay: 1000 },
          { failureThreshold: 3, timeout: 30000 },
        );

      tokenUsage = agentResponse.tokenUsage.totalTokens;

      const messageContentBlocks = agentResponse.contentBlocks;

      this.logger.debug(
        `Received ${messageContentBlocks.length} content blocks from LLM`,
      );

      if (messageContentBlocks.length === 0) {
        this.logger.warn(
          `Task ID: ${taskId} received no content blocks from LLM, marking as failed`,
        );
        await this.tasksService.update(taskId, {
          status: TaskStatus.FAILED,
        });
        this.isProcessing = false;
        this.currentTaskId = null;
        return;
      }

      await this.messagesService.create({
        content: messageContentBlocks,
        role: Role.ASSISTANT,
        taskId,
      });

      // Calculate if we need to summarize based on token usage
      const contextWindow = model.contextWindow || 200000; // Default to 200k if not specified
      const contextThreshold = contextWindow * 0.6; // Start summarization at 60% for better performance
      const shouldSummarize =
        agentResponse.tokenUsage.totalTokens >= contextThreshold;

      if (shouldSummarize) {
        try {
          // After we've successfully generated a response, we can summarize the unsummarized messages
          const summaryResponse = await this.generateMessageWithFallback(
            model,
            SUMMARIZATION_SYSTEM_PROMPT,
            [
              ...messages,
              {
                id: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                taskId,
                summaryId: null,
                role: Role.USER,
                content: [
                  {
                    type: MessageContentType.Text,
                    text: 'Respond with a summary of the messages above. Do not include any additional information.',
                  },
                ],
              },
            ],
            false,
            this.abortController.signal,
          );

          const summaryContentBlocks = summaryResponse.contentBlocks;

          this.logger.debug(
            `Received ${summaryContentBlocks.length} summary content blocks from LLM`,
          );
          const summaryContent = summaryContentBlocks
            .filter(
              (block: MessageContentBlock) =>
                block.type === MessageContentType.Text,
            )
            .map((block: TextContentBlock) => block.text)
            .join('\n');

          const summary = await this.summariesService.create({
            content: summaryContent,
            taskId,
          });

          await this.messagesService.attachSummary(taskId, summary.id, [
            ...messages.map((message) => {
              return message.id;
            }),
          ]);

          this.logger.log(
            `Generated summary for task ${taskId} due to token usage (${agentResponse.tokenUsage.totalTokens}/${contextWindow})`,
          );
        } catch (error: any) {
          this.logger.error(
            `Error summarizing messages for task ID: ${taskId}`,
            error.stack,
          );
        }
      }

      this.logger.debug(
        `Token usage for task ${taskId}: ${agentResponse.tokenUsage.totalTokens}/${contextWindow} (${Math.round((agentResponse.tokenUsage.totalTokens / contextWindow) * 100)}%)`,
      );

      const generatedToolResults: ToolResultContentBlock[] = [];

      let setTaskStatusToolUseBlock: SetTaskStatusToolUseBlock | null = null;

      for (const block of messageContentBlocks) {
        if (isComputerToolUseContentBlock(block)) {
          const result = await handleComputerToolUse(block, this.logger);
          generatedToolResults.push(result);
        }

        if (isCreateTaskToolUseBlock(block)) {
          const type = block.input.type?.toUpperCase() as TaskType;
          const priority = block.input.priority?.toUpperCase() as TaskPriority;

          await this.tasksService.create({
            description: block.input.description,
            type,
            createdBy: Role.ASSISTANT,
            ...(block.input.scheduledFor && {
              scheduledFor: new Date(block.input.scheduledFor),
            }),
            model: task.model,
            priority,
          });

          generatedToolResults.push({
            type: MessageContentType.ToolResult,
            tool_use_id: block.id,
            content: [
              {
                type: MessageContentType.Text,
                text: 'The task has been created',
              },
            ],
          });
        }

        if (isSetTaskStatusToolUseBlock(block)) {
          setTaskStatusToolUseBlock = block;

          generatedToolResults.push({
            type: MessageContentType.ToolResult,
            tool_use_id: block.id,
            is_error: block.input.status === 'failed',
            content: [
              {
                type: MessageContentType.Text,
                text: block.input.description,
              },
            ],
          });
        }
      }

      if (generatedToolResults.length > 0) {
        await this.messagesService.create({
          content: generatedToolResults,
          role: Role.USER,
          taskId,
        });
      }

      // Update the task status after all tool results have been generated if we have a set task status tool use block
      if (setTaskStatusToolUseBlock) {
        switch (setTaskStatusToolUseBlock.input.status) {
          case 'completed':
            await this.tasksService.update(taskId, {
              status: TaskStatus.COMPLETED,
              completedAt: new Date(),
            });
            break;
          case 'needs_help':
            await this.tasksService.update(taskId, {
              status: TaskStatus.NEEDS_HELP,
            });
            break;
        }
      }

      // Schedule the next iteration without blocking
      if (this.isProcessing && this.currentTaskId === taskId) {
        // Check if task still needs processing before scheduling next iteration
        const currentTask = await this.tasksService.findTask(taskId);
        if (
          currentTask &&
          [TaskStatus.RUNNING, TaskStatus.NEEDS_HELP].includes(
            currentTask.status,
          )
        ) {
          setImmediate(() => {
            // Double-check we're still processing the same task to prevent race conditions
            if (this.isProcessing && this.currentTaskId === taskId) {
              this.runIteration(taskId);
            }
          });
        }
      }

      // Record performance metrics and check for anomalies
      const iterationDuration = Date.now() - iterationStartTime;
      const currentMemory = process.memoryUsage().heapUsed;
      const memoryUsed = currentMemory - startMemory;

      const performanceMetrics: PerformanceMetrics = {
        taskId,
        duration: iterationDuration,
        tokenUsage,
        iterationCount,
        memoryUsage: currentMemory,
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to percentage approximation
        timestamp: new Date(),
      };

      this.performanceMonitor.recordMetrics(performanceMetrics);

      // Detect anomalies
      const anomalies = this.anomalyDetector.analyzeMetrics(performanceMetrics);
      if (anomalies.length > 0) {
        for (const anomaly of anomalies) {
          this.logger.warn(`Anomaly detected: ${anomaly.description}`);
        }
      }

      // Emit progress update
      await this.emitProgressUpdate(taskId, {
        status: 'processing',
        iterationCount,
        tokenUsage,
        duration: iterationDuration,
        memoryUsage: Math.round(currentMemory / 1024 / 1024), // MB
        anomalies: anomalies.length,
      });
    } catch (error: any) {
      if (error?.name === 'BytebotAgentInterrupt') {
        this.logger.warn(`Processing aborted for task ID: ${taskId}`);
      } else {
        this.logger.error(
          `Error during task processing iteration for task ID: ${taskId} - ${error.message}`,
          error.stack,
        );

        // Determine task status based on error type
        let taskStatus = TaskStatus.FAILED;
        let errorMessage = error.message;

        if (
          error.name === 'QuotaExceededError' ||
          error.message?.includes('quota') ||
          error.message?.includes('All AI providers failed')
        ) {
          taskStatus = TaskStatus.NEEDS_HELP;
          errorMessage = `Task paused due to API quota limits. Please check your AI provider billing and quotas, or try again later. Original error: ${error.message}`;
        } else if (error.message?.includes('rate limit')) {
          taskStatus = TaskStatus.NEEDS_HELP;
          errorMessage = `Task paused due to rate limiting. Please wait a moment and try again. Original error: ${error.message}`;
        }

        await this.tasksService.update(taskId, {
          status: taskStatus,
          error: errorMessage,
        });
        this.isProcessing = false;
        this.currentTaskId = null;
      }
    }
  }

  async stopProcessing(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    this.logger.log(`Stopping execution of task ${this.currentTaskId}`);

    // Signal any in-flight async operations to abort
    this.abortController?.abort();

    await this.inputCaptureService.stop();

    this.isProcessing = false;
    this.currentTaskId = null;
  }

  /**
   * Emit progress updates for real-time monitoring
   */
  private async emitProgressUpdate(
    taskId: string,
    progress: {
      status: string;
      iterationCount: number;
      tokenUsage: number;
      duration: number;
      memoryUsage: number;
      anomalies: number;
    },
  ): Promise<void> {
    try {
      // This would emit through WebSocket or similar real-time mechanism
      this.logger.debug(`Task ${taskId} progress: ${JSON.stringify(progress)}`);

      // Emit real-time progress updates through TasksGateway
      // Note: TasksGateway would need to be injected for this to work
      // this.tasksGateway.emitProgressUpdate(taskId, progress);
    } catch (error: any) {
      this.logger.error('Failed to emit progress update', error.stack);
    }
  }
}
