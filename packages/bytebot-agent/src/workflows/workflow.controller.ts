import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto, UpdateWorkflowDto, ExecuteWorkflowDto, CreateScheduleDto } from './dto';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkflow(@Body() createWorkflowDto: CreateWorkflowDto) {
    return this.workflowService.createWorkflow(createWorkflowDto);
  }

  @Get()
  async listWorkflows(
    @Query('status') status?: string,
    @Query('tags') tags?: string,
    @Query('createdBy') createdBy?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: string,
  ) {
    const filters = {
      status,
      tags: tags ? tags.split(',') : undefined,
      createdBy,
      search,
      skip: page ? (parseInt(page) - 1) * (parseInt(limit) || 50) : 0,
      take: limit ? parseInt(limit) : 50,
      orderBy: orderBy ? { [orderBy]: 'desc' } : undefined,
    };

    return this.workflowService.listWorkflows(filters);
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string) {
    return this.workflowService.getWorkflow(id);
  }

  @Put(':id')
  async updateWorkflow(
    @Param('id') id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
  ) {
    return this.workflowService.updateWorkflow(id, updateWorkflowDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkflow(@Param('id') id: string) {
    await this.workflowService.deleteWorkflow(id);
  }

  @Post(':id/execute')
  async executeWorkflow(
    @Param('id') id: string,
    @Body() executeWorkflowDto: ExecuteWorkflowDto,
  ) {
    const executionId = await this.workflowService.executeWorkflow(
      id,
      executeWorkflowDto.variables || {},
      executeWorkflowDto.triggeredBy,
      executeWorkflowDto.triggerData,
    );

    return { executionId };
  }

  @Post(':id/validate')
  async validateWorkflow(@Param('id') id: string) {
    const workflow = await this.workflowService.getWorkflow(id);
    return this.workflowService.validateWorkflow(workflow);
  }

  @Get(':id/metrics')
  async getWorkflowMetrics(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const timeRange = startDate && endDate ? {
      start: new Date(startDate),
      end: new Date(endDate),
    } : undefined;

    return this.workflowService.getWorkflowMetrics(id, timeRange);
  }

  // Execution Management
  @Get('executions')
  async listExecutions(
    @Query('workflowId') workflowId?: string,
    @Query('status') status?: string,
    @Query('triggeredBy') triggeredBy?: string,
    @Query('startedAfter') startedAfter?: string,
    @Query('startedBefore') startedBefore?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters = {
      workflowId,
      status,
      triggeredBy,
      startedAfter: startedAfter ? new Date(startedAfter) : undefined,
      startedBefore: startedBefore ? new Date(startedBefore) : undefined,
      skip: page ? (parseInt(page) - 1) * (parseInt(limit) || 50) : 0,
      take: limit ? parseInt(limit) : 50,
    };

    return this.workflowService.listExecutions(filters);
  }

  @Get('executions/:executionId')
  async getExecution(@Param('executionId') executionId: string) {
    return this.workflowService.getExecution(executionId);
  }

  @Post('executions/:executionId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelExecution(
    @Param('executionId') executionId: string,
    @Body('userId') userId: string,
  ) {
    await this.workflowService.cancelExecution(executionId, userId);
    return { message: 'Execution cancelled successfully' };
  }

  @Post('executions/:executionId/pause')
  @HttpCode(HttpStatus.OK)
  async pauseExecution(
    @Param('executionId') executionId: string,
    @Body('userId') userId: string,
  ) {
    await this.workflowService.pauseExecution(executionId, userId);
    return { message: 'Execution paused successfully' };
  }

  @Post('executions/:executionId/resume')
  @HttpCode(HttpStatus.OK)
  async resumeExecution(
    @Param('executionId') executionId: string,
    @Body('userId') userId: string,
  ) {
    await this.workflowService.resumeExecution(executionId, userId);
    return { message: 'Execution resumed successfully' };
  }

  // Schedule Management
  @Post(':id/schedules')
  async createSchedule(
    @Param('id') workflowId: string,
    @Body() createScheduleDto: CreateScheduleDto,
  ) {
    return this.workflowService.createSchedule(workflowId, createScheduleDto);
  }

  @Put('schedules/:scheduleId')
  async updateSchedule(
    @Param('scheduleId') scheduleId: string,
    @Body() updateScheduleDto: CreateScheduleDto,
  ) {
    return this.workflowService.updateSchedule(scheduleId, updateScheduleDto);
  }

  @Delete('schedules/:scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSchedule(@Param('scheduleId') scheduleId: string) {
    await this.workflowService.deleteSchedule(scheduleId);
  }
}