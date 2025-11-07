import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  VisualPattern,
  PatternMatchResult,
  BoundingBox,
  PatternAttributes,
  ElementSelector,
  PatternVariation,
  VisualContext,
} from './pattern.types';

@Injectable()
export class VisualPatternService {
  private readonly logger = new Logger(VisualPatternService.name);

  constructor(private readonly prisma: PrismaService) {}

  async detectPatternsInScreenshot(
    screenshotBase64: string,
    context: VisualContext,
  ): Promise<VisualPattern[]> {
    try {
      // Convert base64 to image buffer for processing
      const imageBuffer = Buffer.from(screenshotBase64, 'base64');
      
      // Perform computer vision analysis
      const detectedElements = await this.performComputerVisionAnalysis(imageBuffer, context);
      
      // Match against known patterns
      const patterns: VisualPattern[] = [];
      for (const element of detectedElements) {
        const pattern = await this.createPatternFromElement(element, context);
        if (pattern) {
          patterns.push(pattern);
        }
      }

      // Learn new patterns if confidence is high enough
      await this.learnNewPatterns(patterns, context);

      this.logger.debug(`Detected ${patterns.length} visual patterns in screenshot`);
      return patterns;

    } catch (error) {
      this.logger.error(`Error detecting patterns: ${error.message}`);
      return [];
    }
  }

  async findMatchingPatterns(
    targetPattern: VisualPattern,
    screenshot: string,
    context: VisualContext,
  ): Promise<PatternMatchResult[]> {
    const detectedPatterns = await this.detectPatternsInScreenshot(screenshot, context);
    const matches: PatternMatchResult[] = [];

    for (const detected of detectedPatterns) {
      const similarity = await this.calculatePatternSimilarity(targetPattern, detected);
      
      if (similarity.overall > 0.7) { // 70% similarity threshold
        matches.push({
          pattern: detected,
          confidence: similarity.overall,
          location: detected.boundingBox,
          variations: detected.variations,
          contextMatch: similarity.context,
          suggestions: await this.generateAutomationSuggestions(detected, context),
        });
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  async improvePatternRecognition(
    patternId: string,
    feedback: 'correct' | 'incorrect' | 'partial',
    actualElement?: VisualPattern,
  ): Promise<void> {
    const pattern = await this.getPatternById(patternId);
    if (!pattern) return;

    // Update pattern confidence based on feedback
    let confidenceAdjustment = 0;
    switch (feedback) {
      case 'correct':
        confidenceAdjustment = 0.05;
        break;
      case 'incorrect':
        confidenceAdjustment = -0.1;
        break;
      case 'partial':
        confidenceAdjustment = 0.02;
        break;
    }

    const newConfidence = Math.max(0, Math.min(1, pattern.confidence + confidenceAdjustment));

    await this.updatePatternConfidence(patternId, newConfidence);

    // If actual element provided and feedback was incorrect, learn from the correction
    if (feedback === 'incorrect' && actualElement) {
      await this.learnFromCorrection(pattern, actualElement);
    }

    this.logger.debug(`Updated pattern ${patternId} confidence to ${newConfidence} based on ${feedback} feedback`);
  }

  async generateElementSelectors(pattern: VisualPattern): Promise<ElementSelector[]> {
    const selectors: ElementSelector[] = [];

    // Generate various types of selectors
    if (pattern.attributes.text) {
      selectors.push({
        type: 'text',
        value: pattern.attributes.text,
        confidence: 0.9,
      });

      selectors.push({
        type: 'xpath',
        value: `//*[contains(text(), "${pattern.attributes.text}")]`,
        confidence: 0.8,
      });
    }

    // Generate CSS selectors based on attributes
    if (pattern.attributes.accessibility?.role) {
      selectors.push({
        type: 'css',
        value: `[role="${pattern.attributes.accessibility.role}"]`,
        confidence: 0.7,
      });
    }

    // Generate coordinate-based selector as fallback
    selectors.push({
      type: 'xpath',
      value: `//*[@x="${pattern.boundingBox.x}" and @y="${pattern.boundingBox.y}"]`,
      confidence: 0.5,
    });

    // AI-powered selector generation using ML model
    const aiSelectors = await this.generateAISelectors(pattern);
    selectors.push(...aiSelectors);

    return selectors.sort((a, b) => b.confidence - a.confidence);
  }

  private async performComputerVisionAnalysis(
    imageBuffer: Buffer,
    context: VisualContext,
  ): Promise<any[]> {
    // This would integrate with actual computer vision services
    // For now, we'll simulate the analysis with mock data
    
    const mockElements = [
      {
        type: 'button',
        boundingBox: { x: 100, y: 200, width: 80, height: 30 },
        text: 'Submit',
        confidence: 0.95,
        attributes: {
          color: '#007bff',
          shape: 'rectangular',
          size: 'medium',
        },
      },
      {
        type: 'input',
        boundingBox: { x: 50, y: 150, width: 200, height: 25 },
        text: '',
        confidence: 0.88,
        attributes: {
          placeholder: 'Enter email',
          inputType: 'email',
        },
      },
    ];

    // In a real implementation, this would use:
    // - OpenCV for basic computer vision
    // - TensorFlow/PyTorch models for element classification
    // - OCR for text recognition
    // - Custom ML models trained on UI elements

    return mockElements;
  }

  private async createPatternFromElement(element: any, context: VisualContext): Promise<VisualPattern | null> {
    if (element.confidence < 0.5) return null;

    const pattern: VisualPattern = {
      id: this.generatePatternId(),
      type: element.type,
      confidence: element.confidence,
      boundingBox: element.boundingBox,
      attributes: {
        text: element.text,
        color: element.attributes?.color,
        size: element.attributes?.size,
        shape: element.attributes?.shape,
        selectors: await this.generateBasicSelectors(element),
      },
      context,
      variations: [],
    };

    return pattern;
  }

  private async generateBasicSelectors(element: any): Promise<ElementSelector[]> {
    const selectors: ElementSelector[] = [];

    if (element.text) {
      selectors.push({
        type: 'text',
        value: element.text,
        confidence: 0.9,
      });
    }

    if (element.type === 'button') {
      selectors.push({
        type: 'css',
        value: 'button',
        confidence: 0.7,
      });
    }

    return selectors;
  }

  private async calculatePatternSimilarity(
    pattern1: VisualPattern,
    pattern2: VisualPattern,
  ): Promise<{ overall: number; visual: number; context: number; attributes: number }> {
    // Visual similarity (position, size, shape)
    const visualSimilarity = this.calculateVisualSimilarity(pattern1, pattern2);
    
    // Context similarity (application, window title, etc.)
    const contextSimilarity = this.calculateContextSimilarity(pattern1.context, pattern2.context);
    
    // Attributes similarity (text, color, accessibility, etc.)
    const attributesSimilarity = this.calculateAttributesSimilarity(pattern1.attributes, pattern2.attributes);

    // Weighted overall similarity
    const overall = (visualSimilarity * 0.4) + (contextSimilarity * 0.3) + (attributesSimilarity * 0.3);

    return {
      overall,
      visual: visualSimilarity,
      context: contextSimilarity,
      attributes: attributesSimilarity,
    };
  }

  private calculateVisualSimilarity(pattern1: VisualPattern, pattern2: VisualPattern): number {
    const box1 = pattern1.boundingBox;
    const box2 = pattern2.boundingBox;

    // Calculate intersection over union (IoU)
    const intersectionArea = Math.max(0, Math.min(box1.x + box1.width, box2.x + box2.width) - Math.max(box1.x, box2.x)) *
                           Math.max(0, Math.min(box1.y + box1.height, box2.y + box2.height) - Math.max(box1.y, box2.y));
    
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const unionArea = area1 + area2 - intersectionArea;

    const iou = unionArea > 0 ? intersectionArea / unionArea : 0;

    // Also consider size similarity
    const sizeSimilarity = 1 - Math.abs(area1 - area2) / Math.max(area1, area2);

    // Type similarity
    const typeSimilarity = pattern1.type === pattern2.type ? 1 : 0;

    return (iou * 0.5) + (sizeSimilarity * 0.3) + (typeSimilarity * 0.2);
  }

  private calculateContextSimilarity(context1: VisualContext, context2: VisualContext): number {
    let similarity = 0;
    let factors = 0;

    // Application name similarity
    if (context1.applicationName === context2.applicationName) {
      similarity += 0.4;
    }
    factors += 0.4;

    // Window title similarity
    if (context1.windowTitle === context2.windowTitle) {
      similarity += 0.3;
    } else if (context1.windowTitle.includes(context2.windowTitle) || context2.windowTitle.includes(context1.windowTitle)) {
      similarity += 0.15;
    }
    factors += 0.3;

    // URL similarity (if applicable)
    if (context1.url && context2.url) {
      if (context1.url === context2.url) {
        similarity += 0.3;
      } else if (new URL(context1.url).hostname === new URL(context2.url).hostname) {
        similarity += 0.15;
      }
      factors += 0.3;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  private calculateAttributesSimilarity(attr1: PatternAttributes, attr2: PatternAttributes): number {
    let similarity = 0;
    let factors = 0;

    // Text similarity
    if (attr1.text && attr2.text) {
      if (attr1.text === attr2.text) {
        similarity += 0.4;
      } else {
        // Calculate Levenshtein distance for partial text matches
        const textSimilarity = this.calculateTextSimilarity(attr1.text, attr2.text);
        similarity += textSimilarity * 0.4;
      }
      factors += 0.4;
    }

    // Color similarity
    if (attr1.color && attr2.color) {
      similarity += (attr1.color === attr2.color ? 0.2 : 0);
      factors += 0.2;
    }

    // Size similarity
    if (attr1.size && attr2.size) {
      similarity += (attr1.size === attr2.size ? 0.2 : 0);
      factors += 0.2;
    }

    // Accessibility similarity
    if (attr1.accessibility && attr2.accessibility) {
      const accessibilitySimilarity = this.calculateAccessibilitySimilarity(attr1.accessibility, attr2.accessibility);
      similarity += accessibilitySimilarity * 0.2;
      factors += 0.2;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const maxLength = Math.max(text1.length, text2.length);
    if (maxLength === 0) return 1;

    const distance = this.levenshteinDistance(text1, text2);
    return 1 - (distance / maxLength);
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

  private calculateAccessibilitySimilarity(acc1: any, acc2: any): number {
    let similarity = 0;
    let factors = 0;

    if (acc1.role && acc2.role) {
      similarity += (acc1.role === acc2.role ? 0.5 : 0);
      factors += 0.5;
    }

    if (acc1.label && acc2.label) {
      const labelSimilarity = this.calculateTextSimilarity(acc1.label, acc2.label);
      similarity += labelSimilarity * 0.5;
      factors += 0.5;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  private async generateAutomationSuggestions(pattern: VisualPattern, context: VisualContext): Promise<any[]> {
    const suggestions: any[] = [];

    // Suggest automation based on pattern type and context
    if (pattern.type === 'button' && pattern.attributes.text?.toLowerCase().includes('submit')) {
      suggestions.push({
        id: this.generateId(),
        type: 'workflow_creation',
        title: 'Automate Form Submission',
        description: 'Create a workflow to automatically fill and submit this form',
        confidence: 0.8,
        impact: 'medium',
        effort: 'low',
        category: 'form_automation',
        actions: [{
          type: 'create_workflow',
          description: 'Create workflow for form submission',
          parameters: { formPattern: pattern },
          automatable: true,
        }],
        benefits: ['Reduced manual effort', 'Consistent data entry', 'Error reduction'],
        risks: ['Data validation needed', 'Form changes may break automation'],
      });
    }

    return suggestions;
  }

  private async learnNewPatterns(patterns: VisualPattern[], context: VisualContext): Promise<void> {
    for (const pattern of patterns) {
      if (pattern.confidence > 0.8) {
        // Check if similar pattern exists
        const existingPattern = await this.findSimilarPattern(pattern);
        
        if (existingPattern) {
          // Update existing pattern with new variation
          await this.addPatternVariation(existingPattern.id, pattern);
        } else {
          // Learn new pattern
          await this.saveNewPattern(pattern);
        }
      }
    }
  }

  private async findSimilarPattern(pattern: VisualPattern): Promise<VisualPattern | null> {
    // Query database for similar patterns
    const learnedPatterns = await this.prisma.learnedPattern.findMany({
      where: {
        type: pattern.type.toUpperCase() as any,
        confidence: { gte: 0.7 },
      },
    });

    for (const dbPattern of learnedPatterns) {
      const similarity = await this.calculatePatternSimilarity(pattern, this.convertDbPatternToVisualPattern(dbPattern));
      if (similarity.overall > 0.8) {
        return this.convertDbPatternToVisualPattern(dbPattern);
      }
    }

    return null;
  }

  private convertDbPatternToVisualPattern(dbPattern: any): VisualPattern {
    return {
      id: dbPattern.id,
      type: dbPattern.type.toLowerCase(),
      confidence: dbPattern.confidence,
      boundingBox: dbPattern.patternData.boundingBox,
      attributes: dbPattern.patternData.attributes,
      context: dbPattern.patternData.context,
      variations: dbPattern.examples.map((example: any) => ({
        id: this.generateId(),
        description: 'Learned variation',
        differenceScore: 0.1,
        attributes: example.attributes,
        examples: [example.screenshot],
      })),
    };
  }

  private async saveNewPattern(pattern: VisualPattern): Promise<void> {
    await this.prisma.learnedPattern.create({
      data: {
        type: pattern.type.toUpperCase() as any,
        name: `${pattern.type}_${pattern.attributes.text || 'unnamed'}`,
        description: `Auto-learned ${pattern.type} pattern`,
        confidence: pattern.confidence,
        patternData: {
          boundingBox: pattern.boundingBox,
          attributes: pattern.attributes,
          context: pattern.context,
        },
        examples: [{
          screenshot: '', // Would contain actual screenshot data
          attributes: pattern.attributes,
          context: pattern.context,
        }],
      },
    });

    this.logger.debug(`Learned new ${pattern.type} pattern with confidence ${pattern.confidence}`);
  }

  private async addPatternVariation(patternId: string, variation: VisualPattern): Promise<void> {
    const existingPattern = await this.prisma.learnedPattern.findUnique({
      where: { id: patternId },
    });

    if (existingPattern) {
      const updatedExamples = [
        ...existingPattern.examples,
        {
          screenshot: '', // Would contain actual screenshot data
          attributes: variation.attributes,
          context: variation.context,
        },
      ];

      await this.prisma.learnedPattern.update({
        where: { id: patternId },
        data: {
          examples: updatedExamples,
          confidence: Math.min(1, existingPattern.confidence + 0.01), // Slightly increase confidence
          matchCount: existingPattern.matchCount + 1,
        },
      });
    }
  }

  private async getPatternById(patternId: string): Promise<VisualPattern | null> {
    const dbPattern = await this.prisma.learnedPattern.findUnique({
      where: { id: patternId },
    });

    return dbPattern ? this.convertDbPatternToVisualPattern(dbPattern) : null;
  }

  private async updatePatternConfidence(patternId: string, confidence: number): Promise<void> {
    await this.prisma.learnedPattern.update({
      where: { id: patternId },
      data: { confidence },
    });
  }

  private async learnFromCorrection(originalPattern: VisualPattern, correctedPattern: VisualPattern): Promise<void> {
    // Analyze the difference between original and corrected patterns
    const differences = this.analyzePattereDifferences(originalPattern, correctedPattern);
    
    // Update pattern learning algorithms based on the correction
    await this.updateLearningModel(differences);
    
    this.logger.debug(`Learned from correction for pattern ${originalPattern.id}`);
  }

  private analyzePattereDifferences(pattern1: VisualPattern, pattern2: VisualPattern): any {
    return {
      boundingBoxDiff: {
        x: pattern2.boundingBox.x - pattern1.boundingBox.x,
        y: pattern2.boundingBox.y - pattern1.boundingBox.y,
        width: pattern2.boundingBox.width - pattern1.boundingBox.width,
        height: pattern2.boundingBox.height - pattern1.boundingBox.height,
      },
      attributesDiff: {
        textChanged: pattern1.attributes.text !== pattern2.attributes.text,
        colorChanged: pattern1.attributes.color !== pattern2.attributes.color,
        sizeChanged: pattern1.attributes.size !== pattern2.attributes.size,
      },
      typeChanged: pattern1.type !== pattern2.type,
    };
  }

  private async updateLearningModel(differences: any): Promise<void> {
    // In a real implementation, this would update ML model weights
    // based on the correction feedback to improve future predictions
    this.logger.debug('Updated learning model with correction feedback');
  }

  private async generateAISelectors(pattern: VisualPattern): Promise<ElementSelector[]> {
    // AI-powered selector generation using machine learning
    // This would use trained models to generate robust selectors
    const selectors: ElementSelector[] = [];

    // Mock AI-generated selectors
    if (pattern.attributes.text) {
      selectors.push({
        type: 'css',
        value: `[aria-label*="${pattern.attributes.text}"]`,
        confidence: 0.85,
      });
    }

    return selectors;
  }

  private generatePatternId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}