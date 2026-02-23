/**
 * Story Validation System
 * Validates user stories for completeness, clarity, and quality
 */

import { z } from 'zod';
import chalk from 'chalk';

export interface ValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  metrics: {
    completeness: number;
    clarity: number;
    testability: number;
    independence: number;
    value: number;
  };
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'suggestion';
  validate: (story: any) => boolean | string;
}

/**
 * Story Validator Implementation
 */
export class StoryValidator {
  private rules: Map<string, ValidationRule> = new Map();
  
  constructor() {
    this.initializeRules();
  }
  
  /**
   * Initialize validation rules
   */
  private initializeRules(): void {
    // INVEST criteria rules
    this.addRule({
      id: 'invest-independent',
      name: 'Independent',
      description: 'Story should be self-contained and not depend on other stories',
      severity: 'warning',
      validate: (story) => {
        if (story.dependencies && story.dependencies.length > 2) {
          return 'Story has too many dependencies (>2)';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'invest-negotiable',
      name: 'Negotiable',
      description: 'Story should not be too detailed initially',
      severity: 'suggestion',
      validate: (story) => {
        if (story.narrative && story.narrative.length > 1000) {
          return 'Story description might be too detailed for initial planning';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'invest-valuable',
      name: 'Valuable',
      description: 'Story should deliver value to users or business',
      severity: 'error',
      validate: (story) => {
        if (!story.soThat && !story.narrative) {
          return 'Story must describe the value it provides';
        }
        if (story.soThat && story.soThat.length < 10) {
          return 'Value proposition is too vague';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'invest-estimable',
      name: 'Estimable',
      description: 'Story should be clear enough to estimate',
      severity: 'warning',
      validate: (story) => {
        if (!story.asA && !story.iWant && !story.narrative) {
          return 'Story lacks sufficient detail for estimation';
        }
        if (story.type === 'spike' && !story.acceptanceCriteria) {
          return 'Spike stories need clear success criteria';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'invest-small',
      name: 'Small',
      description: 'Story should be completable within a sprint',
      severity: 'warning',
      validate: (story) => {
        if (story.complexity && parseInt(story.complexity) > 13) {
          return 'Story might be too large (>13 points)';
        }
        if (story.acceptanceCriteria && story.acceptanceCriteria.length > 10) {
          return 'Story has too many acceptance criteria (>10)';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'invest-testable',
      name: 'Testable',
      description: 'Story should have clear acceptance criteria',
      severity: 'error',
      validate: (story) => {
        if (!story.acceptanceCriteria || story.acceptanceCriteria.length === 0) {
          return 'Story must have acceptance criteria';
        }
        for (const ac of story.acceptanceCriteria) {
          if (!ac.given || !ac.when || !ac.then) {
            return 'Acceptance criteria must follow Given-When-Then format';
          }
        }
        return true;
      }
    });
    
    // Format rules
    this.addRule({
      id: 'format-title',
      name: 'Has Title',
      description: 'Story should have a clear title',
      severity: 'error',
      validate: (story) => {
        if (!story.title || story.title === 'Untitled Story') {
          return 'Story must have a meaningful title';
        }
        if (story.title.length < 5) {
          return 'Title is too short';
        }
        if (story.title.length > 200) {
          return 'Title is too long';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'format-user-story',
      name: 'User Story Format',
      description: 'Story should follow user story format when applicable',
      severity: 'warning',
      validate: (story) => {
        if (story.type === 'feature' && !story.asA) {
          return 'Feature stories should follow "As a... I want... So that..." format';
        }
        if (story.asA && (!story.iWant || !story.soThat)) {
          return 'Incomplete user story format';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'format-type',
      name: 'Has Type',
      description: 'Story should have a type specified',
      severity: 'warning',
      validate: (story) => {
        if (!story.type) {
          return 'Story type should be specified';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'format-priority',
      name: 'Has Priority',
      description: 'Story should have priority assigned',
      severity: 'warning',
      validate: (story) => {
        if (!story.priority) {
          return 'Story priority should be assigned';
        }
        return true;
      }
    });
    
    // Content quality rules
    this.addRule({
      id: 'quality-persona',
      name: 'Clear Persona',
      description: 'User persona should be specific',
      severity: 'suggestion',
      validate: (story) => {
        if (story.asA && (story.asA === 'user' || story.asA === 'customer')) {
          return 'Consider using a more specific persona';
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'quality-action',
      name: 'Clear Action',
      description: 'Desired action should be specific',
      severity: 'warning',
      validate: (story) => {
        if (story.iWant) {
          const vaguePhrases = ['something', 'stuff', 'things', 'it to work'];
          for (const phrase of vaguePhrases) {
            if (story.iWant.toLowerCase().includes(phrase)) {
              return 'Action description is too vague';
            }
          }
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'quality-value',
      name: 'Clear Value',
      description: 'Value proposition should be meaningful',
      severity: 'warning',
      validate: (story) => {
        if (story.soThat) {
          const vaguePhrases = ['it works', 'its done', 'i can use it'];
          for (const phrase of vaguePhrases) {
            if (story.soThat.toLowerCase().includes(phrase)) {
              return 'Value proposition is not clear';
            }
          }
        }
        return true;
      }
    });
    
    // Technical rules
    this.addRule({
      id: 'tech-no-implementation',
      name: 'No Implementation Details',
      description: 'Story should focus on what, not how',
      severity: 'suggestion',
      validate: (story) => {
        const text = (story.narrative || '') + (story.iWant || '');
        const techTerms = ['database', 'api', 'class', 'function', 'method', 'sql'];
        let count = 0;
        for (const term of techTerms) {
          if (text.toLowerCase().includes(term)) count++;
        }
        if (count > 3) {
          return 'Story contains too many implementation details';
        }
        return true;
      }
    });
    
    // Acceptance criteria rules
    this.addRule({
      id: 'ac-measurable',
      name: 'Measurable Criteria',
      description: 'Acceptance criteria should be measurable',
      severity: 'warning',
      validate: (story) => {
        if (story.acceptanceCriteria) {
          for (const ac of story.acceptanceCriteria) {
            const thenText = ac.then?.toLowerCase() || '';
            if (thenText.includes('should') || thenText.includes('might')) {
              return 'Acceptance criteria should be definitive, not conditional';
            }
          }
        }
        return true;
      }
    });
    
    this.addRule({
      id: 'ac-coverage',
      name: 'Criteria Coverage',
      description: 'Acceptance criteria should cover main scenarios',
      severity: 'suggestion',
      validate: (story) => {
        if (story.acceptanceCriteria && story.acceptanceCriteria.length < 2) {
          return 'Consider adding more acceptance criteria for better coverage';
        }
        return true;
      }
    });
  }
  
  /**
   * Add a validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
  }
  
  /**
   * Remove a validation rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }
  
  /**
   * Validate a story
   */
  async validate(story: any): Promise<ValidationResult> {
    console.log(chalk.dim('    ✓ Validating story...'));
    
    const result: ValidationResult = {
      isValid: true,
      score: 100,
      errors: [],
      warnings: [],
      suggestions: [],
      metrics: {
        completeness: 0,
        clarity: 0,
        testability: 0,
        independence: 0,
        value: 0
      }
    };
    
    // Run all validation rules
    for (const rule of this.rules.values()) {
      const validation = rule.validate(story);
      
      if (validation !== true) {
        const message = typeof validation === 'string' ? validation : rule.description;
        
        switch (rule.severity) {
          case 'error':
            result.errors.push(`${rule.name}: ${message}`);
            result.isValid = false;
            result.score -= 20;
            break;
          case 'warning':
            result.warnings.push(`${rule.name}: ${message}`);
            result.score -= 10;
            break;
          case 'suggestion':
            result.suggestions.push(`${rule.name}: ${message}`);
            result.score -= 5;
            break;
        }
      }
    }
    
    // Calculate metrics
    result.metrics = this.calculateMetrics(story);
    
    // Ensure score doesn't go below 0
    result.score = Math.max(0, result.score);
    
    return result;
  }
  
  /**
   * Calculate quality metrics
   */
  private calculateMetrics(story: any): ValidationResult['metrics'] {
    const metrics = {
      completeness: 0,
      clarity: 0,
      testability: 0,
      independence: 0,
      value: 0
    };
    
    // Completeness metric
    let completeFields = 0;
    const totalFields = 8;
    if (story.title && story.title !== 'Untitled Story') completeFields++;
    if (story.type) completeFields++;
    if (story.asA || story.narrative) completeFields++;
    if (story.iWant || story.narrative) completeFields++;
    if (story.soThat || story.narrative) completeFields++;
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) completeFields++;
    if (story.priority) completeFields++;
    if (story.complexity) completeFields++;
    metrics.completeness = (completeFields / totalFields) * 100;
    
    // Clarity metric
    let clarityScore = 100;
    if (!story.title || story.title.length < 10) clarityScore -= 20;
    if (story.asA === 'user' || story.asA === 'customer') clarityScore -= 10;
    if (story.iWant && story.iWant.length < 15) clarityScore -= 15;
    if (story.soThat && story.soThat.length < 15) clarityScore -= 15;
    metrics.clarity = Math.max(0, clarityScore);
    
    // Testability metric
    let testabilityScore = 0;
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
      testabilityScore = 50;
      const validCriteria = story.acceptanceCriteria.filter((ac: any) => 
        ac.given && ac.when && ac.then
      );
      testabilityScore += (validCriteria.length / story.acceptanceCriteria.length) * 50;
    }
    metrics.testability = testabilityScore;
    
    // Independence metric
    let independenceScore = 100;
    if (story.dependencies && story.dependencies.length > 0) {
      independenceScore -= story.dependencies.length * 20;
    }
    metrics.independence = Math.max(0, independenceScore);
    
    // Value metric
    let valueScore = 0;
    if (story.soThat && story.soThat.length > 20) valueScore += 50;
    if (story.priority === 'critical' || story.priority === 'high') valueScore += 30;
    if (story.type === 'feature') valueScore += 20;
    metrics.value = Math.min(100, valueScore);
    
    return metrics;
  }
  
  /**
   * Validate multiple stories
   */
  async validateBatch(stories: any[]): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();
    
    for (const story of stories) {
      const result = await this.validate(story);
      results.set(story.id || story.title, result);
    }
    
    return results;
  }
  
  /**
   * Get validation summary
   */
  getValidationSummary(results: Map<string, ValidationResult>): any {
    const summary = {
      total: results.size,
      valid: 0,
      invalid: 0,
      averageScore: 0,
      commonErrors: new Map<string, number>(),
      commonWarnings: new Map<string, number>(),
      metrics: {
        avgCompleteness: 0,
        avgClarity: 0,
        avgTestability: 0,
        avgIndependence: 0,
        avgValue: 0
      }
    };
    
    let totalScore = 0;
    const totalMetrics = {
      completeness: 0,
      clarity: 0,
      testability: 0,
      independence: 0,
      value: 0
    };
    
    for (const result of results.values()) {
      if (result.isValid) {
        summary.valid++;
      } else {
        summary.invalid++;
      }
      
      totalScore += result.score;
      
      // Count common errors
      for (const error of result.errors) {
        const count = summary.commonErrors.get(error) || 0;
        summary.commonErrors.set(error, count + 1);
      }
      
      // Count common warnings
      for (const warning of result.warnings) {
        const count = summary.commonWarnings.get(warning) || 0;
        summary.commonWarnings.set(warning, count + 1);
      }
      
      // Sum metrics
      totalMetrics.completeness += result.metrics.completeness;
      totalMetrics.clarity += result.metrics.clarity;
      totalMetrics.testability += result.metrics.testability;
      totalMetrics.independence += result.metrics.independence;
      totalMetrics.value += result.metrics.value;
    }
    
    // Calculate averages
    if (results.size > 0) {
      summary.averageScore = totalScore / results.size;
      summary.metrics.avgCompleteness = totalMetrics.completeness / results.size;
      summary.metrics.avgClarity = totalMetrics.clarity / results.size;
      summary.metrics.avgTestability = totalMetrics.testability / results.size;
      summary.metrics.avgIndependence = totalMetrics.independence / results.size;
      summary.metrics.avgValue = totalMetrics.value / results.size;
    }
    
    return summary;
  }
  
  /**
   * Generate validation report
   */
  generateReport(result: ValidationResult, format: 'text' | 'markdown' | 'json' = 'markdown'): string {
    switch (format) {
      case 'text':
        return this.generateTextReport(result);
      case 'markdown':
        return this.generateMarkdownReport(result);
      case 'json':
        return JSON.stringify(result, null, 2);
      default:
        return this.generateMarkdownReport(result);
    }
  }
  
  /**
   * Generate text report
   */
  private generateTextReport(result: ValidationResult): string {
    let report = `Story Validation Report\n`;
    report += `======================\n\n`;
    report += `Status: ${result.isValid ? 'VALID' : 'INVALID'}\n`;
    report += `Score: ${result.score}/100\n\n`;
    
    if (result.errors.length > 0) {
      report += `Errors (${result.errors.length}):\n`;
      result.errors.forEach(error => report += `  - ${error}\n`);
      report += '\n';
    }
    
    if (result.warnings.length > 0) {
      report += `Warnings (${result.warnings.length}):\n`;
      result.warnings.forEach(warning => report += `  - ${warning}\n`);
      report += '\n';
    }
    
    if (result.suggestions.length > 0) {
      report += `Suggestions (${result.suggestions.length}):\n`;
      result.suggestions.forEach(suggestion => report += `  - ${suggestion}\n`);
      report += '\n';
    }
    
    report += `Metrics:\n`;
    report += `  Completeness: ${result.metrics.completeness.toFixed(1)}%\n`;
    report += `  Clarity: ${result.metrics.clarity.toFixed(1)}%\n`;
    report += `  Testability: ${result.metrics.testability.toFixed(1)}%\n`;
    report += `  Independence: ${result.metrics.independence.toFixed(1)}%\n`;
    report += `  Value: ${result.metrics.value.toFixed(1)}%\n`;
    
    return report;
  }
  
  /**
   * Generate markdown report
   */
  private generateMarkdownReport(result: ValidationResult): string {
    let report = `# Story Validation Report\n\n`;
    report += `**Status:** ${result.isValid ? '✅ VALID' : '❌ INVALID'}\n`;
    report += `**Score:** ${result.score}/100\n\n`;
    
    if (result.errors.length > 0) {
      report += `## ❌ Errors (${result.errors.length})\n\n`;
      result.errors.forEach(error => report += `- ${error}\n`);
      report += '\n';
    }
    
    if (result.warnings.length > 0) {
      report += `## ⚠️ Warnings (${result.warnings.length})\n\n`;
      result.warnings.forEach(warning => report += `- ${warning}\n`);
      report += '\n';
    }
    
    if (result.suggestions.length > 0) {
      report += `## 💡 Suggestions (${result.suggestions.length})\n\n`;
      result.suggestions.forEach(suggestion => report += `- ${suggestion}\n`);
      report += '\n';
    }
    
    report += `## 📊 Quality Metrics\n\n`;
    report += `| Metric | Score |\n`;
    report += `|--------|-------|\n`;
    report += `| Completeness | ${result.metrics.completeness.toFixed(1)}% |\n`;
    report += `| Clarity | ${result.metrics.clarity.toFixed(1)}% |\n`;
    report += `| Testability | ${result.metrics.testability.toFixed(1)}% |\n`;
    report += `| Independence | ${result.metrics.independence.toFixed(1)}% |\n`;
    report += `| Value | ${result.metrics.value.toFixed(1)}% |\n`;
    
    return report;
  }
}

// Export singleton instance
export const storyValidator = new StoryValidator();