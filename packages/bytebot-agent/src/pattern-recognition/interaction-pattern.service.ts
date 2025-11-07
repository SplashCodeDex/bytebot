import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UserInteractionSequence,
  InteractionStep,
  AutomationPotential,
  AutomationSuggestion,
  LearningSession,
  SessionInsight,
} from './pattern.types';

@Injectable()
export class InteractionPatternService {
  private readonly logger = new Logger(InteractionPatternService.name);
  private readonly activeSessions = new Map<string, LearningSession>();

  constructor(private readonly prisma: PrismaService) {}

  async startLearningSession(userId: string, sessionId?: string): Promise<string> {
    const id = sessionId || this.generateSessionId();
    
    const session: LearningSession = {
      id,
      userId,
      startTime: new Date(),
      interactions: [],
      patterns: [],
      insights: [],
      automationOpportunities: [],
    };

    this.activeSessions.set(id, session);
    
    this.logger.log(`Started learning session ${id} for user ${userId}`);
    return id;
  }

  async recordInteraction(
    sessionId: string,
    interaction: Omit<InteractionStep, 'id' | 'order'>,
    context: any,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found, creating new session`);
      await this.startLearningSession('unknown', sessionId);
      return this.recordInteraction(sessionId, interaction, context);
    }

    // Store interaction in database
    await this.prisma.userInteraction.create({
      data: {
        sessionId,
        type: interaction.type,
        element: interaction.target ? {
          boundingBox: interaction.target.element.boundingBox,
          attributes: interaction.target.element.attributes,
          type: interaction.target.element.type,
        } : null,
        data: interaction.data,
        applicationName: context.applicationName,
        windowTitle: context.windowTitle,
        screenshot: interaction.screenshot,
        automationSuggested: false,
      },
    });

    // Add to active session for real-time analysis
    const step: InteractionStep = {
      id: this.generateId(),
      order: session.interactions.reduce((max, seq) => 
        Math.max(max, seq.steps.length), 0) + 1,
      ...interaction,
    };

    // Try to add to existing sequence or create new one
    await this.addToInteractionSequence(session, step, context);

    // Analyze for patterns and suggestions
    await this.analyzeSessionPatterns(session);
  }

  async endLearningSession(sessionId: string): Promise<LearningSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.endTime = new Date();

    // Final analysis and insights generation
    await this.generateSessionInsights(session);
    await this.generateAutomationSuggestions(session);

    // Persist session data
    await this.persistSession(session);

    this.activeSessions.delete(sessionId);
    
    this.logger.log(`Ended learning session ${sessionId}`);
    return session;
  }

  async getAutomationSuggestions(sessionId: string): Promise<AutomationSuggestion[]> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      return session.automationOpportunities;
    }

    // Fetch from database for completed sessions
    const interactions = await this.prisma.userInteraction.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    return this.generateSuggestionsFromInteractions(interactions);
  }

  async findSimilarInteractionPatterns(
    sequence: UserInteractionSequence,
    threshold: number = 0.8,
  ): Promise<UserInteractionSequence[]> {
    // Query database for similar interaction patterns
    const allSequences = await this.getAllStoredSequences();
    const similar: UserInteractionSequence[] = [];

    for (const stored of allSequences) {
      const similarity = this.calculateSequenceSimilarity(sequence, stored);
      if (similarity >= threshold) {
        similar.push(stored);
      }
    }

    return similar.sort((a, b) => 
      this.calculateSequenceSimilarity(sequence, b) - 
      this.calculateSequenceSimilarity(sequence, a)
    );
  }

  async suggestWorkflowFromPattern(
    pattern: UserInteractionSequence,
  ): Promise<any> {
    const workflowNodes = [];

    for (let i = 0; i < pattern.steps.length; i++) {
      const step = pattern.steps[i];
      
      const node = {
        id: `step_${i + 1}`,
        type: this.mapInteractionToNodeType(step.type),
        name: `${step.type} action`,
        description: this.generateStepDescription(step),
        position: { x: i * 200, y: 100 },
        config: this.generateNodeConfig(step),
        dependencies: i > 0 ? [`step_${i}`] : [],
      };

      workflowNodes.push(node);
    }

    return {
      name: `Automated ${pattern.name || 'Workflow'}`,
      description: `Auto-generated workflow from learned interaction pattern`,
      version: '1.0.0',
      status: 'DRAFT',
      tags: ['auto-generated', 'pattern-learned'],
      nodes: workflowNodes,
      variables: this.extractVariablesFromPattern(pattern),
      automationPotential: pattern.automationPotential,
    };
  }

  private async addToInteractionSequence(
    session: LearningSession,
    step: InteractionStep,
    context: any,
  ): Promise<void> {
    // Try to match with existing sequences
    let matchedSequence = null;
    let bestSimilarity = 0;

    for (const sequence of session.interactions) {
      const similarity = this.calculateStepSimilarity(
        step,
        sequence.steps[sequence.steps.length - 1]
      );

      if (similarity > bestSimilarity && similarity > 0.7) {
        bestSimilarity = similarity;
        matchedSequence = sequence;
      }
    }

    if (matchedSequence && this.isSequenceContinuation(matchedSequence, step)) {
      // Add to existing sequence
      matchedSequence.steps.push(step);
      matchedSequence.lastPerformed = new Date();
    } else {
      // Create new sequence
      const newSequence: UserInteractionSequence = {
        id: this.generateId(),
        sessionId: session.id,
        steps: [step],
        frequency: 1,
        lastPerformed: new Date(),
        automationPotential: await this.calculateAutomationPotential([step]),
        context: {
          applicationName: context.applicationName,
          workflowCategory: this.categorizeWorkflow(context),
          businessProcess: this.identifyBusinessProcess(context),
          dataInvolved: this.extractDataTypes(step),
          externalDependencies: this.identifyDependencies(context),
        },
      };

      session.interactions.push(newSequence);
    }
  }

  private async analyzeSessionPatterns(session: LearningSession): Promise<void> {
    // Look for repetitive patterns
    const repetitiveSequences = this.findRepetitiveSequences(session.interactions);
    
    for (const sequence of repetitiveSequences) {
      if (sequence.frequency >= 3) { // Repeated 3+ times
        const suggestion: AutomationSuggestion = {
          id: this.generateId(),
          type: 'workflow_creation',
          title: `Automate Repetitive ${sequence.context.workflowCategory} Task`,
          description: `This sequence of ${sequence.steps.length} steps has been repeated ${sequence.frequency} times`,
          confidence: Math.min(0.9, 0.5 + (sequence.frequency * 0.1)),
          impact: sequence.steps.length > 5 ? 'high' : 'medium',
          effort: this.estimateAutomationEffort(sequence),
          category: sequence.context.workflowCategory,
          actions: [{
            type: 'create_workflow',
            description: 'Create automated workflow from this pattern',
            parameters: { sequence },
            automatable: true,
          }],
          benefits: [
            `Save ~${this.estimateTimeSavings(sequence)} minutes per execution`,
            'Reduce human error',
            'Ensure consistency',
          ],
          risks: this.identifyAutomationRisks(sequence),
        };

        session.automationOpportunities.push(suggestion);
      }
    }
  }

  private calculateSequenceSimilarity(
    seq1: UserInteractionSequence,
    seq2: UserInteractionSequence,
  ): number {
    if (seq1.steps.length === 0 || seq2.steps.length === 0) return 0;

    // Use dynamic programming to find longest common subsequence
    const dp = Array(seq1.steps.length + 1)
      .fill(null)
      .map(() => Array(seq2.steps.length + 1).fill(0));

    for (let i = 1; i <= seq1.steps.length; i++) {
      for (let j = 1; j <= seq2.steps.length; j++) {
        const stepSimilarity = this.calculateStepSimilarity(
          seq1.steps[i - 1],
          seq2.steps[j - 1]
        );

        if (stepSimilarity > 0.7) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const lcs = dp[seq1.steps.length][seq2.steps.length];
    const maxLength = Math.max(seq1.steps.length, seq2.steps.length);
    
    return maxLength > 0 ? lcs / maxLength : 0;
  }

  private calculateStepSimilarity(step1: InteractionStep, step2: InteractionStep): number {
    let similarity = 0;

    // Type similarity (40% weight)
    if (step1.type === step2.type) {
      similarity += 0.4;
    }

    // Target similarity (40% weight)
    if (step1.target && step2.target) {
      const targetSimilarity = this.calculateTargetSimilarity(step1.target, step2.target);
      similarity += targetSimilarity * 0.4;
    }

    // Data similarity (20% weight)
    if (step1.data && step2.data) {
      const dataSimilarity = this.calculateDataSimilarity(step1.data, step2.data);
      similarity += dataSimilarity * 0.2;
    }

    return similarity;
  }

  private calculateTargetSimilarity(target1: any, target2: any): number {
    // Compare element attributes, positions, etc.
    let similarity = 0;

    if (target1.element.type === target2.element.type) {
      similarity += 0.3;
    }

    if (target1.element.attributes?.text === target2.element.attributes?.text) {
      similarity += 0.4;
    }

    // Position similarity (within reasonable bounds)
    const pos1 = target1.element.boundingBox;
    const pos2 = target2.element.boundingBox;
    
    if (pos1 && pos2) {
      const distance = Math.sqrt(
        Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
      );
      const maxDistance = 100; // pixels
      const positionSimilarity = Math.max(0, 1 - (distance / maxDistance));
      similarity += positionSimilarity * 0.3;
    }

    return similarity;
  }

  private calculateDataSimilarity(data1: any, data2: any): number {
    if (typeof data1 === 'string' && typeof data2 === 'string') {
      // Use Levenshtein distance for text similarity
      const maxLength = Math.max(data1.length, data2.length);
      if (maxLength === 0) return 1;
      
      const distance = this.levenshteinDistance(data1, data2);
      return 1 - (distance / maxLength);
    }

    if (JSON.stringify(data1) === JSON.stringify(data2)) {
      return 1;
    }

    return 0;
  }

  private async calculateAutomationPotential(steps: InteractionStep[]): Promise<AutomationPotential> {
    let score = 0.5; // Base score
    const reasoning: string[] = [];
    let complexity: 'low' | 'medium' | 'high' = 'medium';
    const prerequisites: string[] = [];
    const risks: string[] = [];

    // Analyze steps for automation potential
    for (const step of steps) {
      switch (step.type) {
        case 'click':
          score += 0.1;
          reasoning.push('Click actions are easily automatable');
          break;
        case 'type':
          if (step.data && typeof step.data === 'string' && step.data.length > 0) {
            score += 0.15;
            reasoning.push('Text input can be automated');
          }
          break;
        case 'scroll':
          score += 0.05;
          reasoning.push('Scrolling can be automated');
          break;
        case 'wait':
          score -= 0.05;
          reasoning.push('Wait steps may indicate timing dependencies');
          risks.push('Timing-dependent operations may be unreliable');
          break;
      }
    }

    // Complexity assessment
    if (steps.length <= 3) {
      complexity = 'low';
      score += 0.1;
    } else if (steps.length > 10) {
      complexity = 'high';
      score -= 0.1;
      risks.push('Complex workflows may be harder to maintain');
    }

    // Check for conditional logic needs
    const hasVariableData = steps.some(step => 
      step.data && typeof step.data === 'string' && /\d/.test(step.data)
    );
    
    if (hasVariableData) {
      prerequisites.push('Variable data extraction capabilities');
      reasoning.push('Contains variable data that needs parameterization');
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      reasoning,
      complexity,
      prerequisites,
      risks,
      estimatedTimeToAutomate: this.estimateAutomationTime(steps, complexity),
      estimatedTimeSavings: this.estimateTimeSavings({ steps } as any),
    };
  }

  private findRepetitiveSequences(sequences: UserInteractionSequence[]): UserInteractionSequence[] {
    const repetitive: UserInteractionSequence[] = [];
    const sequenceGroups = new Map<string, UserInteractionSequence[]>();

    // Group similar sequences
    for (const sequence of sequences) {
      const signature = this.generateSequenceSignature(sequence);
      
      if (!sequenceGroups.has(signature)) {
        sequenceGroups.set(signature, []);
      }
      
      sequenceGroups.get(signature)!.push(sequence);
    }

    // Find groups with multiple occurrences
    for (const [signature, group] of sequenceGroups) {
      if (group.length > 1) {
        // Merge similar sequences into one representative sequence
        const representative = this.mergeSequences(group);
        representative.frequency = group.length;
        repetitive.push(representative);
      }
    }

    return repetitive;
  }

  private generateSequenceSignature(sequence: UserInteractionSequence): string {
    return sequence.steps
      .map(step => `${step.type}:${step.target?.element.type || 'unknown'}`)
      .join('|');
  }

  private mergeSequences(sequences: UserInteractionSequence[]): UserInteractionSequence {
    // Use the first sequence as the base and merge characteristics
    const base = { ...sequences[0] };
    
    // Average the automation potential
    const avgScore = sequences.reduce((sum, seq) => sum + seq.automationPotential.score, 0) / sequences.length;
    base.automationPotential.score = avgScore;

    return base;
  }

  private isSequenceContinuation(sequence: UserInteractionSequence, step: InteractionStep): boolean {
    if (sequence.steps.length === 0) return true;

    const lastStep = sequence.steps[sequence.steps.length - 1];
    const timeDiff = step.timing.startTime.getTime() - lastStep.timing.startTime.getTime();
    
    // Consider it a continuation if within 30 seconds and similar context
    return timeDiff < 30000 && this.calculateStepSimilarity(lastStep, step) > 0.3;
  }

  private mapInteractionToNodeType(interactionType: string): string {
    switch (interactionType) {
      case 'click':
      case 'type':
      case 'scroll':
        return 'TASK';
      case 'wait':
        return 'DELAY';
      default:
        return 'TASK';
    }
  }

  private generateStepDescription(step: InteractionStep): string {
    switch (step.type) {
      case 'click':
        return `Click on ${step.target?.element.attributes?.text || step.target?.element.type || 'element'}`;
      case 'type':
        return `Type "${step.data || 'text'}"`;
      case 'scroll':
        return 'Scroll page';
      case 'wait':
        return `Wait for ${step.timing.duration}ms`;
      default:
        return `Perform ${step.type} action`;
    }
  }

  private generateNodeConfig(step: InteractionStep): any {
    const config: any = {
      prompt: this.generateStepDescription(step),
      timeout: 10000,
    };

    if (step.target) {
      config.target = {
        selectors: step.target.element.attributes?.selectors || [],
        coordinates: step.target.coordinates,
      };
    }

    if (step.data) {
      config.data = step.data;
    }

    return config;
  }

  private extractVariablesFromPattern(pattern: UserInteractionSequence): any[] {
    const variables: any[] = [];
    
    for (const step of pattern.steps) {
      if (step.type === 'type' && step.data) {
        variables.push({
          name: `input_${step.order}`,
          type: 'string',
          defaultValue: step.data,
          description: `Input for step ${step.order}`,
        });
      }
    }

    return variables;
  }

  private categorizeWorkflow(context: any): string {
    const app = context.applicationName?.toLowerCase() || '';
    
    if (app.includes('browser') || app.includes('chrome') || app.includes('firefox')) {
      return 'web_automation';
    } else if (app.includes('excel') || app.includes('calc')) {
      return 'data_processing';
    } else if (app.includes('outlook') || app.includes('mail')) {
      return 'email_management';
    } else {
      return 'general_automation';
    }
  }

  private identifyBusinessProcess(context: any): string {
    // AI-powered business process identification would go here
    return 'unknown';
  }

  private extractDataTypes(step: InteractionStep): string[] {
    const types: string[] = [];
    
    if (step.data) {
      if (typeof step.data === 'string') {
        if (/^\d+$/.test(step.data)) types.push('number');
        if (/\w+@\w+\.\w+/.test(step.data)) types.push('email');
        if (/^\d{4}-\d{2}-\d{2}/.test(step.data)) types.push('date');
        types.push('text');
      }
    }

    return types;
  }

  private identifyDependencies(context: any): string[] {
    // Identify external system dependencies
    return [];
  }

  private estimateAutomationEffort(sequence: UserInteractionSequence): 'low' | 'medium' | 'high' {
    const stepCount = sequence.steps.length;
    const hasComplexData = sequence.steps.some(step => 
      step.data && typeof step.data === 'object'
    );

    if (stepCount <= 3 && !hasComplexData) return 'low';
    if (stepCount <= 10 && !hasComplexData) return 'medium';
    return 'high';
  }

  private estimateTimeSavings(sequence: UserInteractionSequence): number {
    // Estimate time savings in minutes
    return sequence.steps.length * 0.5; // 30 seconds per step
  }

  private estimateAutomationTime(steps: InteractionStep[], complexity: 'low' | 'medium' | 'high'): number {
    const baseTime = steps.length * 10; // 10 minutes per step
    const multiplier = complexity === 'low' ? 1 : complexity === 'medium' ? 1.5 : 2;
    return baseTime * multiplier;
  }

  private identifyAutomationRisks(sequence: UserInteractionSequence): string[] {
    const risks: string[] = [];
    
    if (sequence.steps.some(step => step.retryCount > 0)) {
      risks.push('Contains steps that previously failed');
    }

    if (sequence.context.dataInvolved.includes('email') || 
        sequence.context.dataInvolved.includes('personal')) {
      risks.push('Handles sensitive data');
    }

    return risks;
  }

  private async generateSessionInsights(session: LearningSession): Promise<void> {
    // Generate insights about the session
    session.insights.push({
      type: 'repetitive_task',
      description: `Found ${session.interactions.length} interaction sequences`,
      evidence: session.interactions,
      confidence: 0.9,
      actionable: true,
    });
  }

  private async generateAutomationSuggestions(session: LearningSession): Promise<void> {
    // Additional automation suggestions based on full session analysis
    for (const sequence of session.interactions) {
      if (sequence.automationPotential.score > 0.7) {
        const suggestion: AutomationSuggestion = {
          id: this.generateId(),
          type: 'workflow_creation',
          title: `High-Value Automation Opportunity`,
          description: `Sequence with ${sequence.steps.length} steps has ${Math.round(sequence.automationPotential.score * 100)}% automation potential`,
          confidence: sequence.automationPotential.score,
          impact: 'high',
          effort: sequence.automationPotential.complexity,
          category: sequence.context.workflowCategory,
          actions: [{
            type: 'create_workflow',
            description: 'Create workflow from this high-potential sequence',
            parameters: { sequence },
            automatable: true,
          }],
          benefits: [
            `Save ${sequence.automationPotential.estimatedTimeSavings} minutes per execution`,
            'High confidence automation',
            'Proven repeatable pattern',
          ],
          risks: sequence.automationPotential.risks,
        };

        session.automationOpportunities.push(suggestion);
      }
    }
  }

  private async persistSession(session: LearningSession): Promise<void> {
    // In a real implementation, this would save the session to database
    this.logger.debug(`Persisting session ${session.id} with ${session.interactions.length} sequences`);
  }

  private async getAllStoredSequences(): Promise<UserInteractionSequence[]> {
    // Query database for all stored interaction sequences
    const interactions = await this.prisma.userInteraction.findMany({
      orderBy: { timestamp: 'asc' },
    });

    // Group by session and convert to sequences
    const sequences: UserInteractionSequence[] = [];
    // Implementation would group interactions into sequences
    return sequences;
  }

  private async generateSuggestionsFromInteractions(interactions: any[]): Promise<AutomationSuggestion[]> {
    // Generate suggestions from raw interaction data
    return [];
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}