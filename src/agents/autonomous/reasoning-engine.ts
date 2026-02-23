/**
 * Reasoning Engine
 *
 * Implements chain-of-thought reasoning for autonomous task execution.
 * Uses a structured thinking loop: Observe → Hypothesize → Analyze → Decide → Reflect
 *
 * Features:
 * - Structured reasoning with confidence scoring
 * - Context-aware analysis
 * - Risk assessment
 * - Reflection and self-critique
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ThinkingStep,
  ThinkingStepType,
  ReasoningChain,
  ReasoningContext,
  ReasoningConfig,
  DEFAULT_REASONING_CONFIG,
  TaskType,
  ProgressCallback,
  CancellationToken
} from './types.js';
import { getOllamaBackend, OllamaBackend } from './ollama-backend.js';

// ============================================================================
// Types
// ============================================================================

interface ThinkingPrompt {
  type: ThinkingStepType;
  systemPrompt: string;
  userPromptTemplate: string;
}

interface ReasoningState {
  task: string;
  context: ReasoningContext;
  steps: ThinkingStep[];
  currentConfidence: number;
  observations: string[];
  hypotheses: string[];
  analysisPoints: string[];
  decisions: string[];
  reflections: string[];
}

// ============================================================================
// Thinking Prompts
// ============================================================================

const THINKING_PROMPTS: Record<ThinkingStepType, ThinkingPrompt> = {
  [ThinkingStepType.OBSERVATION]: {
    type: ThinkingStepType.OBSERVATION,
    systemPrompt: `You are an expert observer. Your task is to identify key facts, patterns, and relevant information from the given context.

Output your response in JSON format:
{
  "observations": ["observation 1", "observation 2", ...],
  "relevantFiles": ["file1.ts", "file2.ts"],
  "keyPatterns": ["pattern 1", "pattern 2"],
  "missingInfo": ["what we don't know yet"],
  "confidence": 0.0-1.0
}

Focus on concrete, actionable observations. Be thorough but concise.`,
    userPromptTemplate: `Task: {{task}}

Context:
{{context}}

Previous observations: {{previousObservations}}

What do you observe about this task and context?`
  },

  [ThinkingStepType.HYPOTHESIS]: {
    type: ThinkingStepType.HYPOTHESIS,
    systemPrompt: `You are a hypothesis generator. Based on observations, generate possible approaches or explanations.

Output your response in JSON format:
{
  "hypotheses": [
    {"id": "h1", "description": "hypothesis description", "likelihood": 0.0-1.0, "testable": true}
  ],
  "bestApproach": "which hypothesis seems most promising",
  "alternatives": ["alternative approach 1", "alternative approach 2"],
  "confidence": 0.0-1.0
}

Generate multiple hypotheses ranked by likelihood.`,
    userPromptTemplate: `Task: {{task}}

Observations:
{{observations}}

Context:
{{context}}

Based on these observations, what are the possible approaches or explanations?`
  },

  [ThinkingStepType.ANALYSIS]: {
    type: ThinkingStepType.ANALYSIS,
    systemPrompt: `You are an analytical expert. Evaluate hypotheses, identify trade-offs, and assess feasibility.

Output your response in JSON format:
{
  "analysis": [
    {"hypothesis": "h1", "pros": ["pro1"], "cons": ["con1"], "feasibility": 0.0-1.0, "risks": ["risk1"]}
  ],
  "recommendation": "which approach to proceed with",
  "dependencies": ["dependency 1", "dependency 2"],
  "potentialIssues": ["issue 1", "issue 2"],
  "confidence": 0.0-1.0
}

Be critical and thorough in your analysis.`,
    userPromptTemplate: `Task: {{task}}

Observations:
{{observations}}

Hypotheses:
{{hypotheses}}

Context:
{{context}}

Analyze these hypotheses. What are the trade-offs and which approach is best?`
  },

  [ThinkingStepType.DECISION]: {
    type: ThinkingStepType.DECISION,
    systemPrompt: `You are a decision-making expert. Make a clear decision based on analysis.

Output your response in JSON format:
{
  "decision": "clear statement of what to do",
  "reasoning": "why this decision was made",
  "actionItems": [
    {"order": 1, "action": "specific action to take", "type": "code|command|file|other"}
  ],
  "preconditions": ["what must be true before proceeding"],
  "expectedOutcome": "what success looks like",
  "rollbackPlan": "what to do if it fails",
  "confidence": 0.0-1.0
}

Be specific and actionable.`,
    userPromptTemplate: `Task: {{task}}

Observations:
{{observations}}

Hypotheses:
{{hypotheses}}

Analysis:
{{analysis}}

Make a decision on how to proceed.`
  },

  [ThinkingStepType.REFLECTION]: {
    type: ThinkingStepType.REFLECTION,
    systemPrompt: `You are a reflective critic. Evaluate the reasoning process and identify improvements.

Output your response in JSON format:
{
  "evaluation": "assessment of the reasoning quality",
  "strengths": ["what was done well"],
  "weaknesses": ["what could be improved"],
  "blindSpots": ["what might have been missed"],
  "alternativeViews": ["other perspectives to consider"],
  "lessonsLearned": ["insights for future tasks"],
  "finalConfidence": 0.0-1.0,
  "shouldProceed": true/false,
  "revisitSteps": ["observation", "hypothesis"] // steps to revisit if shouldProceed is false
}

Be honest and critical.`,
    userPromptTemplate: `Task: {{task}}

Reasoning Chain:
Observations: {{observations}}
Hypotheses: {{hypotheses}}
Analysis: {{analysis}}
Decision: {{decision}}

Reflect on this reasoning. Is the decision sound? What might we have missed?`
  }
};

// ============================================================================
// Reasoning Engine
// ============================================================================

export class ReasoningEngine extends EventEmitter {
  private config: ReasoningConfig;
  private ollama: OllamaBackend;
  private activeReasoning: Map<string, ReasoningState> = new Map();

  constructor(config: Partial<ReasoningConfig> = {}) {
    super();
    this.config = { ...DEFAULT_REASONING_CONFIG, ...config };
    this.ollama = getOllamaBackend();
  }

  // ==========================================================================
  // Main Reasoning Interface
  // ==========================================================================

  async think(
    task: string,
    context: ReasoningContext,
    onProgress?: ProgressCallback,
    cancellationToken?: CancellationToken
  ): Promise<ReasoningChain> {
    const chainId = uuidv4();
    const startTime = new Date();

    // Initialize state
    const state: ReasoningState = {
      task,
      context,
      steps: [],
      currentConfidence: 0,
      observations: [],
      hypotheses: [],
      analysisPoints: [],
      decisions: [],
      reflections: []
    };

    this.activeReasoning.set(chainId, state);
    this.emit('thinking_started', { chainId, task });

    try {
      let stepCount = 0;
      let shouldContinue = true;

      while (shouldContinue && stepCount < this.config.maxSteps) {
        // Check for cancellation
        if (cancellationToken?.isCancelled) {
          throw new Error('Reasoning cancelled');
        }

        const stepType = this.determineNextStep(state, stepCount);

        // Execute thinking step
        const step = await this.executeThinkingStep(chainId, stepType, state);
        state.steps.push(step);

        // Update state based on step results
        this.updateStateFromStep(state, step);

        // Report progress
        const progress = (stepCount + 1) / this.config.maxSteps;
        onProgress?.(progress, `Completed ${step.type} step`);
        this.emit('thinking_step', { chainId, step });

        stepCount++;

        // Check if we should continue or have reached a conclusion
        shouldContinue = this.shouldContinueThinking(state, step);
      }

      // Create reasoning chain
      const chain: ReasoningChain = {
        id: chainId,
        task,
        steps: state.steps,
        conclusion: this.synthesizeConclusion(state),
        overallConfidence: state.currentConfidence,
        startTime,
        endTime: new Date(),
        totalDuration: Date.now() - startTime.getTime(),
        context
      };

      this.emit('thinking_completed', { chainId, chain });
      return chain;
    } catch (error) {
      this.emit('thinking_failed', { chainId, error });
      throw error;
    } finally {
      this.activeReasoning.delete(chainId);
    }
  }

  async quickReason(
    task: string,
    context: string
  ): Promise<{ reasoning: string; conclusion: string; confidence: number }> {
    // Simplified reasoning for quick decisions
    const model = this.ollama.selectModelForCapability('reasoning');

    const response = await this.ollama.generate({
      model,
      prompt: `Task: ${task}\n\nContext:\n${context}\n\nProvide brief reasoning and a conclusion.`,
      system: `You are a quick reasoning engine. Analyze the task briefly but thoroughly.

Output JSON:
{
  "reasoning": "Your step-by-step analysis (2-4 sentences)",
  "conclusion": "Your conclusion or recommendation",
  "confidence": 0.0-1.0
}`,
      format: 'json',
      options: {
        temperature: this.config.temperature,
        num_predict: 1000
      }
    });

    try {
      return JSON.parse(response.response);
    } catch {
      return {
        reasoning: response.response,
        conclusion: 'See reasoning above',
        confidence: 0.5
      };
    }
  }

  // ==========================================================================
  // Thinking Step Execution
  // ==========================================================================

  private async executeThinkingStep(
    chainId: string,
    type: ThinkingStepType,
    state: ReasoningState
  ): Promise<ThinkingStep> {
    const stepId = `${chainId}_${type}_${Date.now()}`;
    const startTime = Date.now();

    const prompt = THINKING_PROMPTS[type];
    const userPrompt = this.buildUserPrompt(prompt.userPromptTemplate, state);

    const model = this.ollama.selectModelForCapability('reasoning');

    const response = await this.ollama.generate({
      model,
      prompt: userPrompt,
      system: prompt.systemPrompt,
      format: 'json',
      options: {
        temperature: this.config.temperature,
        num_predict: 2000
      }
    });

    let content: string;
    let confidence: number;

    try {
      const parsed = JSON.parse(response.response);
      content = JSON.stringify(parsed, null, 2);
      confidence = parsed.confidence ?? parsed.finalConfidence ?? 0.7;
    } catch {
      content = response.response;
      confidence = 0.5;
    }

    return {
      id: stepId,
      type,
      content,
      confidence,
      timestamp: new Date(),
      duration: Date.now() - startTime
    };
  }

  private buildUserPrompt(template: string, state: ReasoningState): string {
    return template
      .replace('{{task}}', state.task)
      .replace('{{context}}', this.formatContext(state.context))
      .replace('{{previousObservations}}', state.observations.join('\n') || 'None yet')
      .replace('{{observations}}', state.observations.join('\n') || 'None')
      .replace('{{hypotheses}}', state.hypotheses.join('\n') || 'None')
      .replace('{{analysis}}', state.analysisPoints.join('\n') || 'None')
      .replace('{{decision}}', state.decisions.join('\n') || 'None');
  }

  private formatContext(context: ReasoningContext): string {
    const parts: string[] = [];

    if (context.codebaseUnderstanding.length > 0) {
      parts.push(`Codebase Understanding:\n${context.codebaseUnderstanding.join('\n')}`);
    }

    if (context.relevantFiles.length > 0) {
      parts.push(`Relevant Files:\n${context.relevantFiles.join(', ')}`);
    }

    if (context.constraints.length > 0) {
      parts.push(`Constraints:\n${context.constraints.join('\n')}`);
    }

    if (context.assumptions.length > 0) {
      parts.push(`Assumptions:\n${context.assumptions.join('\n')}`);
    }

    if (context.risks.length > 0) {
      parts.push(`Known Risks:\n${context.risks.join('\n')}`);
    }

    return parts.join('\n\n') || 'No additional context provided.';
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  private determineNextStep(state: ReasoningState, stepCount: number): ThinkingStepType {
    // Follow the thinking loop: Observe → Hypothesize → Analyze → Decide → Reflect
    const stepOrder: ThinkingStepType[] = [
      ThinkingStepType.OBSERVATION,
      ThinkingStepType.HYPOTHESIS,
      ThinkingStepType.ANALYSIS,
      ThinkingStepType.DECISION,
      ThinkingStepType.REFLECTION
    ];

    // For initial steps, follow the order
    if (stepCount < 5) {
      return stepOrder[stepCount];
    }

    // After first cycle, determine based on confidence and state
    const lastStep = state.steps[state.steps.length - 1];

    // If reflection suggested revisiting steps
    if (lastStep?.type === ThinkingStepType.REFLECTION) {
      try {
        const reflectionData = JSON.parse(lastStep.content);
        if (!reflectionData.shouldProceed && reflectionData.revisitSteps?.length > 0) {
          const revisitStep = reflectionData.revisitSteps[0];
          return ThinkingStepType[revisitStep.toUpperCase() as keyof typeof ThinkingStepType] || ThinkingStepType.OBSERVATION;
        }
      } catch {
        // Continue with default logic
      }
    }

    // If confidence is low, do more analysis
    if (state.currentConfidence < this.config.minConfidence) {
      if (state.analysisPoints.length < state.observations.length) {
        return ThinkingStepType.ANALYSIS;
      }
      return ThinkingStepType.OBSERVATION;
    }

    // If we have decisions, reflect
    if (state.decisions.length > 0 && this.config.enableReflection) {
      // Use reverse loop instead of findLastIndex for compatibility
      let lastReflectionIndex = -1;
      let lastDecisionIndex = -1;
      for (let i = state.steps.length - 1; i >= 0; i--) {
        if (lastReflectionIndex === -1 && state.steps[i].type === ThinkingStepType.REFLECTION) {
          lastReflectionIndex = i;
        }
        if (lastDecisionIndex === -1 && state.steps[i].type === ThinkingStepType.DECISION) {
          lastDecisionIndex = i;
        }
        if (lastReflectionIndex !== -1 && lastDecisionIndex !== -1) break;
      }

      if (lastDecisionIndex > lastReflectionIndex) {
        return ThinkingStepType.REFLECTION;
      }
    }

    // Default: make a decision
    return ThinkingStepType.DECISION;
  }

  private updateStateFromStep(state: ReasoningState, step: ThinkingStep): void {
    try {
      const data = JSON.parse(step.content);

      switch (step.type) {
        case ThinkingStepType.OBSERVATION:
          if (data.observations) {
            state.observations.push(...data.observations);
          }
          break;

        case ThinkingStepType.HYPOTHESIS:
          if (data.hypotheses) {
            state.hypotheses.push(...data.hypotheses.map((h: any) =>
              typeof h === 'string' ? h : `${h.id}: ${h.description}`
            ));
          }
          break;

        case ThinkingStepType.ANALYSIS:
          if (data.analysis) {
            state.analysisPoints.push(...data.analysis.map((a: any) =>
              typeof a === 'string' ? a : `${a.hypothesis}: ${a.recommendation || 'No recommendation'}`
            ));
          }
          if (data.recommendation) {
            state.analysisPoints.push(`Recommendation: ${data.recommendation}`);
          }
          break;

        case ThinkingStepType.DECISION:
          if (data.decision) {
            state.decisions.push(data.decision);
          }
          if (data.actionItems) {
            state.decisions.push(...data.actionItems.map((a: any) =>
              `${a.order}. ${a.action}`
            ));
          }
          break;

        case ThinkingStepType.REFLECTION:
          if (data.evaluation) {
            state.reflections.push(data.evaluation);
          }
          if (data.lessonsLearned) {
            state.reflections.push(...data.lessonsLearned);
          }
          break;
      }

      // Update confidence
      state.currentConfidence = step.confidence;
    } catch {
      // If parsing fails, use raw content
      switch (step.type) {
        case ThinkingStepType.OBSERVATION:
          state.observations.push(step.content);
          break;
        case ThinkingStepType.HYPOTHESIS:
          state.hypotheses.push(step.content);
          break;
        case ThinkingStepType.ANALYSIS:
          state.analysisPoints.push(step.content);
          break;
        case ThinkingStepType.DECISION:
          state.decisions.push(step.content);
          break;
        case ThinkingStepType.REFLECTION:
          state.reflections.push(step.content);
          break;
      }
    }
  }

  private shouldContinueThinking(state: ReasoningState, lastStep: ThinkingStep): boolean {
    // Stop if we have a high-confidence decision
    if (lastStep.type === ThinkingStepType.DECISION && lastStep.confidence >= this.config.minConfidence) {
      // Check if reflection is enabled and we haven't reflected yet
      if (!this.config.enableReflection) {
        return false;
      }

      const hasReflectedOnDecision = state.steps.some(
        (s, i) => s.type === ThinkingStepType.REFLECTION &&
          state.steps.slice(0, i).some(d => d.type === ThinkingStepType.DECISION)
      );

      if (hasReflectedOnDecision) {
        return false;
      }
    }

    // Stop if reflection says we're done
    if (lastStep.type === ThinkingStepType.REFLECTION) {
      try {
        const data = JSON.parse(lastStep.content);
        if (data.shouldProceed === false && !data.revisitSteps?.length) {
          return false;
        }
        if (data.finalConfidence >= this.config.minConfidence && data.shouldProceed !== false) {
          return false;
        }
      } catch {
        // Continue if we can't parse
      }
    }

    // Continue if confidence is too low
    return state.currentConfidence < this.config.minConfidence;
  }

  private synthesizeConclusion(state: ReasoningState): string {
    const conclusions: string[] = [];

    // Add final decision
    if (state.decisions.length > 0) {
      conclusions.push(`Decision: ${state.decisions[state.decisions.length - 1]}`);
    }

    // Add key observations
    if (state.observations.length > 0) {
      conclusions.push(`Key observations: ${state.observations.slice(0, 3).join('; ')}`);
    }

    // Add recommendation from analysis
    const recommendation = state.analysisPoints.find(a => a.startsWith('Recommendation:'));
    if (recommendation) {
      conclusions.push(recommendation);
    }

    // Add lessons learned from reflection
    if (state.reflections.length > 0) {
      conclusions.push(`Reflections: ${state.reflections.slice(-2).join('; ')}`);
    }

    return conclusions.join('\n\n') || 'No conclusion reached.';
  }

  // ==========================================================================
  // Specialized Reasoning Methods
  // ==========================================================================

  async reasonAboutCode(
    code: string,
    question: string,
    fileContext?: string
  ): Promise<ReasoningChain> {
    const context: ReasoningContext = {
      codebaseUnderstanding: [
        `Code to analyze:\n\`\`\`\n${code.substring(0, 2000)}\n\`\`\``
      ],
      relevantFiles: fileContext ? [fileContext] : [],
      constraints: ['Must provide accurate code analysis'],
      assumptions: [],
      risks: ['Misunderstanding code intent']
    };

    return this.think(question, context);
  }

  async reasonAboutError(
    error: Error,
    context: string,
    previousAttempts?: string[]
  ): Promise<ReasoningChain> {
    const reasoningContext: ReasoningContext = {
      codebaseUnderstanding: [context],
      relevantFiles: [],
      constraints: ['Must identify root cause', 'Must suggest fix'],
      assumptions: [],
      risks: ['Similar fix might cause same error']
    };

    if (previousAttempts?.length) {
      reasoningContext.assumptions.push(`Previous attempts that failed: ${previousAttempts.join(', ')}`);
      reasoningContext.risks.push('Same approach might fail again');
    }

    const task = `Analyze and fix this error: ${error.message}\n\nStack trace:\n${error.stack || 'No stack trace'}`;

    return this.think(task, reasoningContext);
  }

  async reasonAboutApproach(
    goal: string,
    options: string[],
    constraints: string[]
  ): Promise<{ selectedOption: string; reasoning: ReasoningChain }> {
    const context: ReasoningContext = {
      codebaseUnderstanding: [`Options to evaluate: ${options.join(', ')}`],
      relevantFiles: [],
      constraints,
      assumptions: [],
      risks: []
    };

    const task = `Choose the best approach for: ${goal}\n\nOptions:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;

    const chain = await this.think(task, context);

    // Extract selected option from decision
    let selectedOption = options[0];
    const decision = chain.steps.find(s => s.type === ThinkingStepType.DECISION);
    if (decision) {
      for (const option of options) {
        if (decision.content.toLowerCase().includes(option.toLowerCase())) {
          selectedOption = option;
          break;
        }
      }
    }

    return { selectedOption, reasoning: chain };
  }

  // ==========================================================================
  // Configuration & State
  // ==========================================================================

  updateConfig(config: Partial<ReasoningConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): ReasoningConfig {
    return { ...this.config };
  }

  getActiveReasoningCount(): number {
    return this.activeReasoning.size;
  }

  cancelReasoning(chainId: string): boolean {
    if (this.activeReasoning.has(chainId)) {
      this.activeReasoning.delete(chainId);
      this.emit('reasoning_cancelled', { chainId });
      return true;
    }
    return false;
  }

  cancelAllReasoning(): void {
    for (const chainId of this.activeReasoning.keys()) {
      this.emit('reasoning_cancelled', { chainId });
    }
    this.activeReasoning.clear();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let reasoningEngineInstance: ReasoningEngine | null = null;

export function getReasoningEngine(config?: Partial<ReasoningConfig>): ReasoningEngine {
  if (!reasoningEngineInstance) {
    reasoningEngineInstance = new ReasoningEngine(config);
  } else if (config) {
    reasoningEngineInstance.updateConfig(config);
  }
  return reasoningEngineInstance;
}

export function resetReasoningEngine(): void {
  if (reasoningEngineInstance) {
    reasoningEngineInstance.cancelAllReasoning();
    reasoningEngineInstance.removeAllListeners();
  }
  reasoningEngineInstance = null;
}
