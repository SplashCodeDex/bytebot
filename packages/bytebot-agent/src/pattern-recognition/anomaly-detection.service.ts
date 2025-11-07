import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApplicationState,
  StateSnapshot,
  ErrorState,
  NotificationState,
  LoadingState,
  VisualPattern,
  PerformanceBaseline,
  AnomalyDetectionConfig,
} from './pattern.types';

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private readonly config: AnomalyDetectionConfig;
  private readonly performanceBaselines = new Map<string, PerformanceBaseline>();
  private readonly stateHistory = new Map<string, ApplicationState[]>();
  private readonly MAX_BASELINE_ENTRIES = 100;
  private readonly MAX_STATE_HISTORY = 50;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.config = {
      enableUIChangeDetection: true,
      enablePerformanceMonitoring: true,
      enableErrorRateMonitoring: true,
      thresholds: {
        uiChangeThreshold: 0.3, // 30% difference triggers anomaly
        performanceDeviationPercent: 50, // 50% slower than baseline
        errorRateThreshold: 0.1, // 10% error rate
        responseTimeThreshold: 5000, // 5 seconds
      },
      alerting: {
        enabled: true,
        channels: ['dashboard', 'webhook'],
        severityLevels: ['medium', 'high', 'critical'],
      },
    };

    this.initializeBaselines();
    this.startPeriodicAnalysis();
  }

  async detectUIChanges(
    currentState: ApplicationState,
    applicationName: string,
  ): Promise<void> {
    if (!this.config.enableUIChangeDetection) return;

    const previousStates = this.stateHistory.get(applicationName) || [];
    
    if (previousStates.length === 0) {
      // First state capture, just store it
      this.storeState(applicationName, currentState);
      return;
    }

    const lastState = previousStates[previousStates.length - 1];
    const changeScore = await this.calculateUIChangeScore(lastState, currentState);

    if (changeScore > this.config.thresholds.uiChangeThreshold) {
      await this.recordAnomaly({
        type: 'ui_change',
        severity: this.classifyChangeSeverity(changeScore),
        description: `Significant UI changes detected in ${applicationName}`,
        context: {
          applicationName,
          changeScore,
          timestamp: new Date(),
          currentState: currentState.state,
          previousState: lastState.state,
        },
        expectedPattern: lastState,
        actualPattern: currentState,
      });

      this.logger.warn(`UI change anomaly detected in ${applicationName}: ${changeScore.toFixed(2)} change score`);
    }

    this.storeState(applicationName, currentState);
  }

  async detectPerformanceAnomalies(
    operation: string,
    duration: number,
    success: boolean,
  ): Promise<void> {
    if (!this.config.enablePerformanceMonitoring) return;

    const baseline = this.performanceBaselines.get(operation);
    
    if (!baseline) {
      // Create new baseline
      this.performanceBaselines.set(operation, {
        operation,
        averageTime: duration,
        standardDeviation: 0,
        successRate: success ? 1 : 0,
        lastUpdated: new Date(),
      });
      return;
    }

    // Update baseline with new data point
    this.updateBaseline(baseline, duration, success);

    // Check for performance anomalies
    const deviationPercent = Math.abs(duration - baseline.averageTime) / baseline.averageTime;
    
    if (deviationPercent > (this.config.thresholds.performanceDeviationPercent / 100)) {
      await this.recordAnomaly({
        type: 'performance',
        severity: duration > baseline.averageTime ? 'high' : 'medium',
        description: `Performance anomaly detected for ${operation}`,
        context: {
          operation,
          actualDuration: duration,
          expectedDuration: baseline.averageTime,
          deviationPercent: deviationPercent * 100,
          timestamp: new Date(),
        },
        expectedPattern: { averageTime: baseline.averageTime },
        actualPattern: { actualTime: duration },
      });

      this.logger.warn(`Performance anomaly detected for ${operation}: ${duration}ms vs ${baseline.averageTime}ms baseline`);
    }

    // Check for timeout anomalies
    if (duration > this.config.thresholds.responseTimeThreshold) {
      await this.recordAnomaly({
        type: 'timeout',
        severity: 'critical',
        description: `Operation timeout detected for ${operation}`,
        context: {
          operation,
          duration,
          threshold: this.config.thresholds.responseTimeThreshold,
          timestamp: new Date(),
        },
        expectedPattern: { maxDuration: this.config.thresholds.responseTimeThreshold },
        actualPattern: { actualDuration: duration },
      });
    }
  }

  async detectErrorPatterns(
    operation: string,
    error: ErrorState,
    context: any,
  ): Promise<void> {
    if (!this.config.enableErrorRateMonitoring) return;

    // Store error for pattern analysis
    await this.storeError(operation, error, context);

    // Analyze error frequency
    const recentErrors = await this.getRecentErrors(operation, new Date(Date.now() - 3600000)); // Last hour
    const totalOperations = await this.getTotalOperations(operation, new Date(Date.now() - 3600000));
    
    if (totalOperations > 0) {
      const errorRate = recentErrors.length / totalOperations;
      
      if (errorRate > this.config.thresholds.errorRateThreshold) {
        await this.recordAnomaly({
          type: 'error_rate',
          severity: errorRate > 0.25 ? 'critical' : 'high',
          description: `High error rate detected for ${operation}`,
          context: {
            operation,
            errorRate: errorRate * 100,
            recentErrorCount: recentErrors.length,
            totalOperations,
            timestamp: new Date(),
          },
          expectedPattern: { maxErrorRate: this.config.thresholds.errorRateThreshold },
          actualPattern: { actualErrorRate: errorRate },
        });

        this.logger.error(`High error rate detected for ${operation}: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    // Detect error pattern clusters
    await this.analyzeErrorClusters(operation, recentErrors);
  }

  async predictPotentialIssues(
    applicationName: string,
    currentPatterns: VisualPattern[],
  ): Promise<any[]> {
    const predictions: any[] = [];

    // Analyze current patterns against known failure patterns
    const knownFailurePatterns = await this.getKnownFailurePatterns(applicationName);
    
    for (const pattern of currentPatterns) {
      for (const failurePattern of knownFailurePatterns) {
        const similarity = await this.calculatePatternSimilarity(pattern, failurePattern);
        
        if (similarity > 0.8) {
          predictions.push({
            type: 'potential_failure',
            confidence: similarity,
            description: `Current UI state similar to known failure pattern`,
            pattern,
            failurePattern,
            recommendation: 'Monitor closely or take preventive action',
            estimatedImpact: failurePattern.severity,
          });
        }
      }
    }

    // Predict based on performance trends
    const performanceTrends = await this.analyzePerformanceTrends(applicationName);
    if (performanceTrends.degrading) {
      predictions.push({
        type: 'performance_degradation',
        confidence: performanceTrends.confidence,
        description: 'Performance showing degrading trend',
        trend: performanceTrends,
        recommendation: 'Investigate performance bottlenecks',
        estimatedImpact: 'medium',
      });
    }

    return predictions;
  }

  async getAnomalyInsights(timeRange: { start: Date; end: Date }): Promise<any> {
    const anomalies = await this.prisma.anomalyDetection.findMany({
      where: {
        detectedAt: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      },
      orderBy: { detectedAt: 'desc' },
    });

    const insights = {
      totalAnomalies: anomalies.length,
      byType: this.groupAnomaliesByType(anomalies),
      bySeverity: this.groupAnomaliesBySeverity(anomalies),
      trends: this.analyzeTrends(anomalies),
      topIssues: this.identifyTopIssues(anomalies),
      recommendations: this.generateRecommendations(anomalies),
    };

    return insights;
  }

  private async calculateUIChangeScore(
    previousState: ApplicationState,
    currentState: ApplicationState,
  ): Promise<number> {
    let changeScore = 0;
    let totalFactors = 0;

    // Compare window titles
    if (previousState.state.windowTitle !== currentState.state.windowTitle) {
      changeScore += 0.3;
    }
    totalFactors += 0.3;

    // Compare active elements count
    const prevElementCount = previousState.state.activeElements.length;
    const currElementCount = currentState.state.activeElements.length;
    
    if (prevElementCount > 0) {
      const elementDiff = Math.abs(prevElementCount - currElementCount) / prevElementCount;
      changeScore += elementDiff * 0.4;
    }
    totalFactors += 0.4;

    // Compare error states
    const prevErrors = previousState.state.errors.length;
    const currErrors = currentState.state.errors.length;
    
    if (currErrors > prevErrors) {
      changeScore += (currErrors - prevErrors) * 0.1;
    }
    totalFactors += 0.3;

    return totalFactors > 0 ? changeScore / totalFactors : 0;
  }

  private classifyChangeSeverity(changeScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (changeScore < 0.3) return 'low';
    if (changeScore < 0.6) return 'medium';
    if (changeScore < 0.9) return 'high';
    return 'critical';
  }

  private updateBaseline(baseline: PerformanceBaseline, newDuration: number, success: boolean): void {
    // Simple exponential moving average
    const alpha = 0.1; // Smoothing factor
    baseline.averageTime = (1 - alpha) * baseline.averageTime + alpha * newDuration;
    
    // Update success rate
    baseline.successRate = (baseline.successRate * 0.9) + (success ? 0.1 : 0);
    
    baseline.lastUpdated = new Date();
  }

  private async recordAnomaly(anomalyData: any): Promise<void> {
    const anomaly = await this.prisma.anomalyDetection.create({
      data: {
        type: anomalyData.type,
        severity: anomalyData.severity,
        description: anomalyData.description,
        context: anomalyData.context,
        expectedPattern: anomalyData.expectedPattern,
        actualPattern: anomalyData.actualPattern,
      },
    });

    // Emit event for real-time notifications
    this.eventEmitter.emit('anomaly.detected', {
      id: anomaly.id,
      type: anomaly.type,
      severity: anomaly.severity,
      description: anomaly.description,
      timestamp: anomaly.detectedAt,
      context: anomaly.context,
    });

    // Send alerts if enabled
    if (this.config.alerting.enabled && 
        this.config.alerting.severityLevels.includes(anomaly.severity)) {
      await this.sendAlert(anomaly);
    }
  }

  private storeState(applicationName: string, state: ApplicationState): void {
    if (!this.stateHistory.has(applicationName)) {
      this.stateHistory.set(applicationName, []);
    }

    const history = this.stateHistory.get(applicationName)!;
    history.push(state);

    // Keep only last 50 states to prevent memory bloat
    if (history.length > this.MAX_STATE_HISTORY) {
      history.shift();
    }

    // Cleanup old entries periodically
    this.cleanupOldEntries();
  }

  private async storeError(operation: string, error: ErrorState, context: any): Promise<void> {
    // In a real implementation, this would store error details in database
    this.logger.debug(`Storing error for operation ${operation}: ${error.message}`);
  }

  private async getRecentErrors(operation: string, since: Date): Promise<any[]> {
    // Query recent errors from database
    return [];
  }

  private async getTotalOperations(operation: string, since: Date): Promise<number> {
    // Query total operation count from database
    return 100; // Mock data
  }

  private async analyzeErrorClusters(operation: string, errors: any[]): Promise<void> {
    // Group errors by type and time to identify clusters
    const clusters = new Map<string, any[]>();

    for (const error of errors) {
      const key = `${error.type}_${error.message}`;
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(error);
    }

    // Look for clusters with multiple occurrences
    for (const [key, cluster] of clusters) {
      if (cluster.length >= 3) { // 3+ similar errors
        await this.recordAnomaly({
          type: 'error_pattern',
          severity: 'medium',
          description: `Error cluster detected: ${cluster.length} similar errors`,
          context: {
            operation,
            errorType: cluster[0].type,
            errorMessage: cluster[0].message,
            occurrences: cluster.length,
            timespan: cluster[cluster.length - 1].timestamp - cluster[0].timestamp,
          },
          expectedPattern: { maxSimilarErrors: 2 },
          actualPattern: { actualSimilarErrors: cluster.length },
        });
      }
    }
  }

  private async getKnownFailurePatterns(applicationName: string): Promise<any[]> {
    // Query database for known failure patterns
    const patterns = await this.prisma.learnedPattern.findMany({
      where: {
        type: 'ERROR_PATTERN',
      },
    });

    return patterns.map(p => ({
      ...p.patternData,
      severity: p.confidence > 0.8 ? 'high' : 'medium',
    }));
  }

  private async calculatePatternSimilarity(pattern1: any, pattern2: any): Promise<number> {
    // Calculate similarity between visual patterns
    // Implementation would compare visual characteristics
    return 0.5; // Mock similarity
  }

  private async analyzePerformanceTrends(applicationName: string): Promise<any> {
    // Analyze performance trends over time
    const baselines = Array.from(this.performanceBaselines.values())
      .filter(b => b.operation.includes(applicationName));

    if (baselines.length === 0) {
      return { degrading: false, confidence: 0 };
    }

    // Simple trend analysis - check if recent performance is consistently worse
    const avgDegradation = baselines.reduce((sum, b) => {
      // Mock calculation - in reality would compare recent vs historical data
      return sum + (Math.random() > 0.7 ? 1 : 0);
    }, 0) / baselines.length;

    return {
      degrading: avgDegradation > 0.5,
      confidence: avgDegradation,
      affectedOperations: baselines.map(b => b.operation),
    };
  }

  private groupAnomaliesByType(anomalies: any[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const anomaly of anomalies) {
      groups[anomaly.type] = (groups[anomaly.type] || 0) + 1;
    }
    return groups;
  }

  private groupAnomaliesBySeverity(anomalies: any[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const anomaly of anomalies) {
      groups[anomaly.severity] = (groups[anomaly.severity] || 0) + 1;
    }
    return groups;
  }

  private analyzeTrends(anomalies: any[]): any {
    // Analyze anomaly trends over time
    const hourlyCount = new Map<number, number>();
    const now = new Date();

    for (const anomaly of anomalies) {
      const hoursSince = Math.floor((now.getTime() - anomaly.detectedAt.getTime()) / (1000 * 60 * 60));
      hourlyCount.set(hoursSince, (hourlyCount.get(hoursSince) || 0) + 1);
    }

    return {
      peakHour: Array.from(hourlyCount.entries()).sort((a, b) => b[1] - a[1])[0],
      isIncreasing: anomalies.slice(-10).length > anomalies.slice(-20, -10).length,
      averagePerHour: anomalies.length / 24,
    };
  }

  private identifyTopIssues(anomalies: any[]): any[] {
    const issueMap = new Map<string, any>();

    for (const anomaly of anomalies) {
      const key = `${anomaly.type}_${anomaly.severity}`;
      if (!issueMap.has(key)) {
        issueMap.set(key, {
          type: anomaly.type,
          severity: anomaly.severity,
          count: 0,
          lastOccurrence: anomaly.detectedAt,
        });
      }
      
      const issue = issueMap.get(key)!;
      issue.count++;
      if (anomaly.detectedAt > issue.lastOccurrence) {
        issue.lastOccurrence = anomaly.detectedAt;
      }
    }

    return Array.from(issueMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private generateRecommendations(anomalies: any[]): string[] {
    const recommendations: string[] = [];
    const typeGroups = this.groupAnomaliesByType(anomalies);

    if (typeGroups.ui_change > 10) {
      recommendations.push('Consider implementing UI stability tests');
    }

    if (typeGroups.performance > 5) {
      recommendations.push('Review and optimize system performance');
    }

    if (typeGroups.error_rate > 3) {
      recommendations.push('Investigate recurring errors and implement better error handling');
    }

    return recommendations;
  }

  private async sendAlert(anomaly: any): Promise<void> {
    // Implementation would send alerts via configured channels
    this.logger.warn(`ALERT: ${anomaly.severity.toUpperCase()} - ${anomaly.description}`);
  }

  private async initializeBaselines(): Promise<void> {
    // Load historical performance data to initialize baselines
    this.logger.debug('Initializing performance baselines');
  }

  private startPeriodicAnalysis(): void {
    // Run periodic analysis every 5 minutes
    setInterval(async () => {
      await this.runPeriodicAnalysis();
    }, 5 * 60 * 1000);
  }

  private async runPeriodicAnalysis(): Promise<void> {
    // Periodic analysis of stored data for new anomalies
    this.logger.debug('Running periodic anomaly analysis');
  }

  private cleanupOldEntries(): void {
    // Cleanup performance baseline if too large
    if (this.performanceBaselines.size > this.MAX_BASELINE_ENTRIES) {
      const entries = Array.from(this.performanceBaselines.entries());
      const toKeep = entries.slice(-this.MAX_BASELINE_ENTRIES);
      this.performanceBaselines.clear();
      toKeep.forEach(([key, value]) => this.performanceBaselines.set(key, value));
    }

    // Cleanup state history
    for (const [key, history] of this.stateHistory.entries()) {
      if (history.length > this.MAX_STATE_HISTORY) {
        this.stateHistory.set(key, history.slice(-this.MAX_STATE_HISTORY));
      }
    }
  }

  onModuleInit(): void {
    // Set up periodic cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
    }, 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    // Clear all maps
    this.performanceBaselines.clear();
    this.stateHistory.clear();
  }
}