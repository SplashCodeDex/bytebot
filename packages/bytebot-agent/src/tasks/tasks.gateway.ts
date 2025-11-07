import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class TasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    // Use proper logger instead of console.log
    // this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // Use proper logger instead of console.log
    // this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_task')
  handleJoinTask(client: Socket, taskId: string) {
    client.join(`task_${taskId}`);
    // Use proper logger: this.logger.log(`Client ${client.id} joined task ${taskId}`);
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, taskId: string) {
    client.leave(`task_${taskId}`);
    // Use proper logger: this.logger.log(`Client ${client.id} left task ${taskId}`);
  }

  emitTaskUpdate(taskId: string, task: any) {
    this.server.to(`task_${taskId}`).emit('task_updated', task);
  }

  emitNewMessage(taskId: string, message: any) {
    this.server.to(`task_${taskId}`).emit('new_message', message);
  }

  emitTaskCreated(task: any) {
    this.server.emit('task_created', task);
  }

  emitTaskDeleted(taskId: string) {
    this.server.emit('task_deleted', taskId);
  }

  emitProgressUpdate(
    taskId: string,
    progress: {
      status: string;
      iterationCount: number;
      tokenUsage: number;
      duration: number;
      memoryUsage: number;
      anomalies: number;
      currentStep?: string;
      estimatedCompletion?: number;
    },
  ): void {
    this.server.to(`task_${taskId}`).emit('task_progress', progress);
  }

  emitAnomalyDetected(
    taskId: string,
    anomaly: {
      type: string;
      severity: string;
      description: string;
      suggestedActions: string[];
    },
  ): void {
    this.server.to(`task_${taskId}`).emit('task_anomaly', anomaly);
  }
}
