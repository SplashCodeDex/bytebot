import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as os from 'os';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  memory: {
    used: number;
    total: number;
    usage: number;
  };
  cpu: {
    usage: number;
    load: number[];
  };
  tasks: {
    active: number;
    completed: number;
    failed: number;
    queued: number;
  };
  services: {
    database: 'healthy' | 'unhealthy';
    desktop: 'healthy' | 'unhealthy';
    aiProviders: Record<string, 'healthy' | 'unhealthy'>;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private healthData: SystemHealth;
  private startTime: Date = new Date();

  constructor() {
    this.initializeHealth();
  }

  private initializeHealth() {
    this.healthData = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: 0,
      memory: { used: 0, total: 0, usage: 0 },
      cpu: { usage: 0, load: [0, 0, 0] },
      tasks: { active: 0, completed: 0, failed: 0, queued: 0 },
      services: {
        database: 'healthy',
        desktop: 'healthy',
        aiProviders: {},
      },
    };
  }

  @Cron('*/30 * * * * *') // Every 30 seconds
  async updateHealthMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      this.healthData = {
        ...this.healthData,
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime(),
        memory: {
          used: usedMem,
          total: totalMem,
          usage: (usedMem / totalMem) * 100,
        },
        cpu: {
          usage: await this.getCpuUsage(),
          load: os.loadavg(),
        },
      };

      // Determine overall health status
      this.healthData.status = this.calculateHealthStatus();
    } catch (error) {
      this.logger.error('Error updating health metrics', error);
    }
  }

  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = endUsage.user + endUsage.system;
        const usage = (totalUsage / 1000000) * 100; // Convert to percentage
        resolve(Math.min(usage, 100));
      }, 100);
    });
  }

  private calculateHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const { memory, cpu, services } = this.healthData;

    // Check critical conditions
    if (memory.usage > 90 || cpu.usage > 95) {
      return 'unhealthy';
    }

    if (services.database === 'unhealthy') {
      return 'unhealthy';
    }

    // Check degraded conditions
    if (memory.usage > 75 || cpu.usage > 80) {
      return 'degraded';
    }

    const unhealthyServices = Object.values(services.aiProviders).filter(
      (status) => status === 'unhealthy',
    ).length;

    if (unhealthyServices > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  updateTaskMetrics(metrics: Partial<SystemHealth['tasks']>) {
    this.healthData.tasks = { ...this.healthData.tasks, ...metrics };
  }

  updateServiceHealth(
    service: keyof SystemHealth['services'],
    status: 'healthy' | 'unhealthy',
  ) {
    if (service === 'aiProviders') {
      return; // Handle AI providers separately
    }
    (this.healthData.services as any)[service] = status;
  }

  updateAiProviderHealth(provider: string, status: 'healthy' | 'unhealthy') {
    this.healthData.services.aiProviders[provider] = status;
  }

  getHealth(): SystemHealth {
    return { ...this.healthData };
  }

  isHealthy(): boolean {
    return this.healthData.status === 'healthy';
  }
}
