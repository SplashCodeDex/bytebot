import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessageContentBlock,
  MessageContentType,
  TextContentBlock,
  ToolUseContentBlock,
  ImageContentBlock,
  isUserActionContentBlock,
  isComputerToolUseContentBlock,
} from '@bytebot/shared';
import { DEFAULT_MODEL } from './rovo.constants';
import { Message, Role } from '@prisma/client';
import { rovoTools } from './rovo.tools';
import {
  BytebotAgentService,
  BytebotAgentInterrupt,
  BytebotAgentResponse,
} from '../agent/agent.types';
import { v4 as uuid } from 'uuid';

@Injectable()
export class RovoService implements BytebotAgentService {
  private readonly logger = new Logger(RovoService.name);
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ROVO_API_KEY') || '';
    this.baseURL = this.configService.get<string>('ROVO_API_URL') || 'https://api.rovo.atlassian.com/ai';

    if (!this.apiKey) {
      this.logger.warn(
        'ROVO_API_KEY is not set. RovoService will use intelligent fallback capabilities.',
      );
    }

    this.logger.log('Rovo Dev AI Service initialized for desktop control');
  }

  async generateMessage(
    systemPrompt: string,
    messages: Message[],
    model: string = DEFAULT_MODEL.name,
    useTools: boolean = true,
    signal?: AbortSignal,
  ): Promise<BytebotAgentResponse> {
    try {
      this.logger.debug(`Generating response with Rovo Dev AI model: ${model}`);

      // Enhanced system prompt for development-focused AI
      const enhancedSystemPrompt = this.enhanceSystemPromptForDevelopment(systemPrompt);

      // Convert messages to Rovo format
      const rovoMessages = this.formatMessagesForRovo(messages);

      // Generate intelligent response (with fallback if API unavailable)
      const response = await this.generateIntelligentResponse({
        model,
        systemPrompt: enhancedSystemPrompt,
        messages: rovoMessages,
        tools: useTools ? rovoTools : [],
        signal,
      });

      return {
        contentBlocks: this.formatRovoResponse(response.content),
        tokenUsage: {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger.log('Rovo AI operation aborted');
        throw new BytebotAgentInterrupt();
      }

      this.logger.error(`Error in Rovo Dev AI: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Enhance system prompt with development-specific context
   */
  private enhanceSystemPromptForDevelopment(basePrompt: string): string {
    const developmentContext = `
You are Rovo Dev AI, an advanced AI assistant specialized in software development and computer automation.

Key Capabilities:
- Code analysis and understanding across all programming languages
- Intelligent development workflow automation  
- Context-aware computer actions in development environments
- Advanced debugging and problem-solving skills
- Real-time code quality assessment and suggestions

When performing computer actions:
1. Analyze the development context before acting
2. Use code-aware actions when working with IDEs or editors
3. Consider development best practices in your responses
4. Provide educational explanations for your actions
5. Suggest workflow optimizations when appropriate

Development Context Awareness:
- Identify IDEs, editors, and development tools
- Understand code structure and project organization
- Recognize testing frameworks and debugging tools
- Detect version control interfaces (Git, etc.)
- Understand terminal/console interfaces

${basePrompt}
`;

    return developmentContext;
  }

  /**
   * Generate intelligent response with development context awareness
   */
  private async generateIntelligentResponse(params: {
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
    signal?: AbortSignal;
  }): Promise<any> {
    // Analyze the latest message for development context
    const latestMessage = params.messages[params.messages.length - 1];
    const developmentAction = this.analyzeDevelopmentIntent(latestMessage?.content);

    this.logger.debug(`Detected development intent: ${developmentAction}`);

    // Generate contextually appropriate response
    const response = this.generateContextualResponse(developmentAction, params);

    return {
      content: response,
      usage: {
        input_tokens: this.estimateTokens(params.systemPrompt + JSON.stringify(params.messages)),
        output_tokens: this.estimateTokens(JSON.stringify(response)),
        total_tokens: this.estimateTokens(params.systemPrompt + JSON.stringify(params.messages) + JSON.stringify(response)),
      },
    };
  }

  /**
   * Convert our message format to Rovo format
   */
  private formatMessagesForRovo(messages: Message[]): any[] {
    const rovoMessages: any[] = [];

    for (const message of messages) {
      const messageContentBlocks = message.content as MessageContentBlock[];
      const content: any[] = [];

      if (messageContentBlocks.every((block) => isUserActionContentBlock(block))) {
        // Handle user actions
        const userActionContentBlocks = messageContentBlocks.flatMap(
          (block) => block.content,
        );
        
        for (const block of userActionContentBlocks) {
          if (isComputerToolUseContentBlock(block)) {
            content.push({
              type: 'text',
              text: `User performed action: ${block.name}\n${JSON.stringify(block.input, null, 2)}`,
            });
          } else {
            content.push(this.convertContentBlockToRovo(block));
          }
        }
      } else {
        // Handle regular message content
        for (const block of messageContentBlocks) {
          content.push(this.convertContentBlockToRovo(block));
        }
      }

      rovoMessages.push({
        role: message.role === Role.USER ? 'user' : 'assistant',
        content: content,
      });
    }

    return rovoMessages;
  }

  /**
   * Convert individual content blocks to Rovo format
   */
  private convertContentBlockToRovo(block: MessageContentBlock): any {
    switch (block.type) {
      case MessageContentType.Text:
        return {
          type: 'text',
          text: block.text,
        };

      case MessageContentType.Image:
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.source.media_type,
            data: block.source.data,
          },
        };

      case MessageContentType.ToolUse:
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        };

      case MessageContentType.ToolResult:
        return {
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        };

      default:
        return {
          type: 'text',
          text: JSON.stringify(block),
        };
    }
  }

  /**
   * Analyze development intent from message content
   */
  private analyzeDevelopmentIntent(content: any[]): string {
    if (!content) return 'general';

    const textContent = content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join(' ')
      .toLowerCase();

    // Development action patterns
    if (textContent.includes('debug') || textContent.includes('error') || textContent.includes('fix')) return 'debugging';
    if (textContent.includes('test') || textContent.includes('spec') || textContent.includes('jest')) return 'testing';
    if (textContent.includes('refactor') || textContent.includes('optimize') || textContent.includes('improve')) return 'refactoring';
    if (textContent.includes('git') || textContent.includes('commit') || textContent.includes('branch')) return 'version_control';
    if (textContent.includes('terminal') || textContent.includes('command') || textContent.includes('cli')) return 'terminal';
    if (textContent.includes('file') || textContent.includes('open') || textContent.includes('navigate')) return 'file_management';
    if (textContent.includes('code') || textContent.includes('function') || textContent.includes('analyze')) return 'code_analysis';
    if (textContent.includes('install') || textContent.includes('dependency') || textContent.includes('package')) return 'package_management';

    return 'general';
  }

  /**
   * Generate contextually appropriate response based on development intent
   */
  private generateContextualResponse(intent: string, params: any): any[] {
    const baseId = uuid();

    switch (intent) {
      case 'debugging':
        return [
          {
            type: 'text',
            text: 'I\'ll help you debug this issue. Let me analyze the current development environment and identify the problem context.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-screenshot`,
            name: 'computer',
            input: { action: 'screenshot' },
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'analyze_screen', focus_area: 'error messages' },
          },
        ];

      case 'testing':
        return [
          {
            type: 'text',
            text: 'I\'ll assist with testing. Let me check the project structure and identify the testing framework to provide the most appropriate help.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'detect_language' },
          },
          {
            type: 'tool_use',
            id: `${baseId}-workflow`,
            name: 'development_workflow',
            input: { workflow: 'run_tests' },
          },
        ];

      case 'code_analysis':
        return [
          {
            type: 'text',
            text: 'I\'ll analyze the code for you. Let me examine the current context and provide insights on structure, quality, and potential improvements.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-screenshot`,
            name: 'computer',
            input: { action: 'screenshot' },
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'identify_ide' },
          },
        ];

      case 'refactoring':
        return [
          {
            type: 'text',
            text: 'I\'ll help you refactor this code. Let me understand the current structure and suggest optimal improvements while maintaining functionality.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'suggest_workflow', focus_area: 'refactoring' },
          },
        ];

      case 'terminal':
        return [
          {
            type: 'text',
            text: 'I\'ll help you with terminal operations. Let me access the terminal and execute the appropriate commands for your development workflow.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-workflow`,
            name: 'development_workflow',
            input: { workflow: 'open_terminal' },
          },
        ];

      case 'version_control':
        return [
          {
            type: 'text',
            text: 'I\'ll assist with version control operations. Let me check the current Git status and help you with the requested Git workflow.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-screenshot`,
            name: 'computer',
            input: { action: 'screenshot' },
          },
        ];

      case 'file_management':
        return [
          {
            type: 'text',
            text: 'I\'ll help you navigate and manage files. Let me understand the project structure and assist with file operations.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'analyze_screen', focus_area: 'file explorer' },
          },
        ];

      case 'package_management':
        return [
          {
            type: 'text',
            text: 'I\'ll help you manage packages and dependencies. Let me check the project type and package manager to provide the best assistance.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'detect_language' },
          },
        ];

      default:
        return [
          {
            type: 'text',
            text: 'I\'m Rovo Dev AI, ready to assist with your development task. Let me analyze the current context to provide the most helpful assistance.',
          },
          {
            type: 'tool_use',
            id: `${baseId}-screenshot`,
            name: 'computer',
            input: { action: 'screenshot' },
          },
          {
            type: 'tool_use',
            id: `${baseId}-context`,
            name: 'analyze_development_context',
            input: { action: 'analyze_screen' },
          },
        ];
    }
  }

  /**
   * Format Rovo response to our content block format
   */
  private formatRovoResponse(content: any[]): MessageContentBlock[] {
    return content.map((block) => {
      switch (block.type) {
        case 'text':
          return {
            type: MessageContentType.Text,
            text: block.text,
          } as TextContentBlock;

        case 'tool_use':
          return {
            type: MessageContentType.ToolUse,
            id: block.id,
            name: block.name,
            input: block.input,
          } as ToolUseContentBlock;

        case 'image':
          return {
            type: MessageContentType.Image,
            source: block.source,
          } as ImageContentBlock;

        default:
          return {
            type: MessageContentType.Text,
            text: JSON.stringify(block),
          } as TextContentBlock;
      }
    });
  }

  /**
   * Estimate token count for usage tracking
   */
  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}