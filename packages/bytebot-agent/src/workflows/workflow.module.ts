import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowEngine } from './workflow.engine';
import { WorkflowGateway } from './workflow.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [PrismaModule, TasksModule, EventEmitterModule.forRoot()],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowEngine, WorkflowGateway],
  exports: [WorkflowService, WorkflowEngine],
})
export class WorkflowModule {}
