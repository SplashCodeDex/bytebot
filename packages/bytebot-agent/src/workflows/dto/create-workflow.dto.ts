import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsNumber,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowNodeDto {
  @IsString()
  id: string;

  @IsString()
  type:
    | 'TASK'
    | 'CONDITION'
    | 'LOOP'
    | 'PARALLEL'
    | 'HUMAN_APPROVAL'
    | 'DELAY'
    | 'WEBHOOK';

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  position?: { x: number; y: number };

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @IsArray()
  dependencies?: string[];

  @IsOptional()
  @IsObject()
  retryPolicy?: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential' | 'fixed';
    baseDelay: number;
    maxDelay: number;
    retryOn: string[];
  };

  @IsOptional()
  @IsObject()
  errorAction?: {
    action: 'fail' | 'continue' | 'retry' | 'skip' | 'escalate';
    fallbackNodes?: string[];
    notifyUsers?: string[];
    customMessage?: string;
  };
}

export class WorkflowVariableDto {
  @IsString()
  name: string;

  @IsString()
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  @IsOptional()
  defaultValue?: any;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: any[];
  };
}

export class CreateWorkflowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  version: string;

  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  maxExecutionTime?: number;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  allowConcurrentExecutions?: boolean;

  @IsOptional()
  @IsNumber()
  retentionDays?: number;

  @IsString()
  createdBy: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeDto)
  nodes?: WorkflowNodeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowVariableDto)
  variables?: WorkflowVariableDto[];
}
