import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { VisualPatternService } from './visual-pattern.service';
import { InteractionPatternService } from './interaction-pattern.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { ContextAwarenessService } from './context-awareness.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventEmitterModule.forRoot()],
  providers: [
    VisualPatternService,
    InteractionPatternService,
    AnomalyDetectionService,
    ContextAwarenessService,
  ],
  exports: [
    VisualPatternService,
    InteractionPatternService,
    AnomalyDetectionService,
    ContextAwarenessService,
  ],
})
export class PatternRecognitionModule {}
