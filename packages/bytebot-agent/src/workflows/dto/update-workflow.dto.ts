import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateWorkflowDto } from './create-workflow.dto';

export class UpdateWorkflowDto extends PartialType(
  OmitType(CreateWorkflowDto, ['name', 'version', 'createdBy'] as const),
) {}
