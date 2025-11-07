import { IsString, IsOptional, IsObject } from 'class-validator';

export class ExecuteWorkflowDto {
  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsString()
  triggeredBy: string;

  @IsOptional()
  @IsObject()
  triggerData?: any;
}