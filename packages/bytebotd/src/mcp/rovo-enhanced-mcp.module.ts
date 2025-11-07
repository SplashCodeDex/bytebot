import { Module } from '@nestjs/common';
import { McpModule } from '@rekog/mcp-nest';
import { ComputerUseModule } from '../computer-use/computer-use.module';
import { ComputerUseTools } from './computer-use.tools';
import { SmartToolSelectorService } from './smart-tool-selector.service';
import { RovoDevAiTools } from './rovo-dev-ai.tools';
import { RovoDevAiService } from './rovo-dev-ai.service';

@Module({
  imports: [
    ComputerUseModule,
    McpModule.forRoot({
      name: 'bytebot-rovo-enhanced',
      version: '2.0.0',
      sseEndpoint: '/mcp-rovo',
      enableIntelligence: true,
      capabilities: {
        tools: {
          listChanged: true,
        },
        resources: {
          subscribe: true,
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
      },
      metadata: {
        description: 'ByteBot with Rovo Dev AI enhanced capabilities',
        author: 'ByteBot Team',
        license: 'MIT',
        capabilities: [
          'computer-automation',
          'code-analysis', 
          'intelligent-refactoring',
          'test-generation',
          'debugging-assistance',
          'code-review',
          'pattern-recognition',
          'smart-tool-selection'
        ],
        integrations: ['rovo-dev-ai', 'claude', 'anthropic']
      }
    }),
  ],
  providers: [
    ComputerUseTools,
    SmartToolSelectorService,
    RovoDevAiService,
    RovoDevAiTools,
    {
      provide: 'ROVO_CONFIG',
      useValue: {
        enableCaching: true,
        maxCacheSize: 2000,
        modelPreferences: {
          codeAnalysis: 'claude-3.5-sonnet',
          refactoring: 'claude-3.5-sonnet',
          testGeneration: 'claude-3.5-sonnet', 
          debugging: 'claude-3.5-sonnet'
        }
      }
    }
  ],
  exports: [
    SmartToolSelectorService,
    RovoDevAiService,
    RovoDevAiTools
  ],
})
export class RovoEnhancedMcpModule {}