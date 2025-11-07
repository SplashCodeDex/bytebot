import { Module } from '@nestjs/common';
import { McpModule } from '@rekog/mcp-nest';
import { ComputerUseModule } from '../computer-use/computer-use.module';
import { ComputerUseTools } from './computer-use.tools';
import { SmartToolSelectorService } from './smart-tool-selector.service';
import { IntelligentMcpService } from './intelligent-mcp.service';

@Module({
  imports: [
    ComputerUseModule,
    McpModule.forRoot({
      name: 'bytebotd-intelligent',
      version: '1.0.0',
      sseEndpoint: '/sse',
      enableIntelligence: true,
    }),
  ],
  providers: [
    ComputerUseTools,
    SmartToolSelectorService,
    IntelligentMcpService,
  ],
  exports: [
    SmartToolSelectorService,
    IntelligentMcpService,
  ],
})
export class IntelligentMcpModule {}