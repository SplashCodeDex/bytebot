import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowEvent } from './workflow.types';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/workflows',
})
export class WorkflowGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WorkflowGateway.name);
  private readonly clientSubscriptions = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe_workflow')
  handleSubscribeWorkflow(
    @MessageBody() data: { workflowId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (subscriptions) {
      subscriptions.add(data.workflowId);
      client.join(`workflow:${data.workflowId}`);
      this.logger.debug(
        `Client ${client.id} subscribed to workflow ${data.workflowId}`,
      );
    }
  }

  @SubscribeMessage('unsubscribe_workflow')
  handleUnsubscribeWorkflow(
    @MessageBody() data: { workflowId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (subscriptions) {
      subscriptions.delete(data.workflowId);
      client.leave(`workflow:${data.workflowId}`);
      this.logger.debug(
        `Client ${client.id} unsubscribed from workflow ${data.workflowId}`,
      );
    }
  }

  @SubscribeMessage('subscribe_execution')
  handleSubscribeExecution(
    @MessageBody() data: { executionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`execution:${data.executionId}`);
    this.logger.debug(
      `Client ${client.id} subscribed to execution ${data.executionId}`,
    );
  }

  @SubscribeMessage('unsubscribe_execution')
  handleUnsubscribeExecution(
    @MessageBody() data: { executionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`execution:${data.executionId}`);
    this.logger.debug(
      `Client ${client.id} unsubscribed from execution ${data.executionId}`,
    );
  }

  @OnEvent('workflow.event')
  handleWorkflowEvent(event: WorkflowEvent) {
    // Broadcast to workflow subscribers
    this.server
      .to(`workflow:${event.workflowId}`)
      .emit('workflow_event', event);

    // Broadcast to execution subscribers
    this.server
      .to(`execution:${event.executionId}`)
      .emit('execution_event', event);

    // Broadcast to all clients for global events
    if (
      ['workflow_started', 'workflow_completed', 'workflow_failed'].includes(
        event.type,
      )
    ) {
      this.server.emit('global_workflow_event', event);
    }
  }

  // Real-time workflow metrics
  @SubscribeMessage('get_workflow_status')
  async handleGetWorkflowStatus(
    @MessageBody() data: { workflowId: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Implementation would fetch current workflow status
    // and send back to the requesting client
    const status = {
      workflowId: data.workflowId,
      activeExecutions: 0,
      recentExecutions: [],
      metrics: {},
    };

    client.emit('workflow_status', status);
  }

  // Broadcast system-wide notifications
  broadcastSystemNotification(notification: {
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    data?: any;
  }) {
    this.server.emit('system_notification', notification);
  }

  // Broadcast workflow execution progress
  broadcastExecutionProgress(
    executionId: string,
    progress: {
      percentage: number;
      currentNode: string;
      completedNodes: string[];
      estimatedTimeRemaining?: number;
    },
  ) {
    this.server.to(`execution:${executionId}`).emit('execution_progress', {
      executionId,
      ...progress,
    });
  }
}
