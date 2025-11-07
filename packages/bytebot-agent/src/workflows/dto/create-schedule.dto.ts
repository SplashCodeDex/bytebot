import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsObject, IsDateString } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsString()
  scheduleType: 'cron' | 'interval' | 'once' | 'event';

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsNumber()
  intervalMinutes?: number;

  @IsOptional()
  @IsDateString()
  executeAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTriggers?: string[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  maxConcurrentExecutions?: number;
}