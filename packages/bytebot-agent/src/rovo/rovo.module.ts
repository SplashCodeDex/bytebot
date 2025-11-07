import { Module } from '@nestjs/common';
import { RovoService } from './rovo.service';

@Module({
  providers: [RovoService],
  exports: [RovoService],
})
export class RovoModule {}