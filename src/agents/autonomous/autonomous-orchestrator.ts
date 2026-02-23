/**
 * Autonomous Orchestrator
 *
 * Main controller for the autonomous agent system. Coordinates reasoning,
 * planning, execution, verification, and self-correction to accomplish
 * complex coding tasks with minimal human intervention.
 *
 * Execution Flow:
 * 1. RECEIVE GOAL → 2. THINK (ReasoningEngine)
 *                        ↓
 * 3. PLAN (PlanningSystem) → 4. EXECUTE (Tool/Agent)
 *                                 ↓
 * 5. VERIFY (VerificationEngine) → Pass? → 6. LEARN & Continue
 *                                     ↓ Fail
 * 7. CORRECT (SelfCorrectionLoop) → Retry with modified approach
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import type {
  AutonomousTask,
  AutonomousConfig,
  AutonomousEvent,
  EventHandler,
  TaskContext,
  TaskConstraints,
  TaskResult,
  TaskMetrics,
  ExecutionStep,
  ExecutionPlan,
  ExecutionError,
  ApprovalRequired,
  ReasoningContext,
  ProgressCallback,
  CancellationToken
} from './types.js';
import {
  TaskType,
  ExecutionStatus,
  ReasoningChain,
  VerificationResult,
  CorrectionStrategy,
  DEFAULT_AUTONOMOUS_CONFIG
} from './types.js';

import type { OllamaBackend } from './ollama-backend.js';
import { getOllamaBackend } from './ollama-backend.js';
import type { ReasoningEngine } from './reasoning-engine.js';
import { getReasoningEngine } from './reasoning-engine.js';
import type { PlanningSystem } from './planning-system.js';
import { getPlanningSystem } from './planning-system.js';
import type { VerificationEngine } from './verification-engine.js';
import { getVerificationEngine } from './verification-engine.js';
import type { SelfCorrectionLoop } from './self-correction.js';
import { getSelfCorrectionLoop } from './self-correction.js';
import type { HybridEmbeddingService } from '../embeddings/hybrid-embeddings.js';
import { getEmbeddingService } from '../embeddings/hybrid-embeddings.js';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

interface ExecutionContext {
  task: AutonomousTask;
  plan: ExecutionPlan;
  currentStepIndex: number;
  filesModified: Map<string, { before: string; after: string }>;
  commandsExecuted: string[];
  startTime: Date;
  metrics: Partial<TaskMetrics>;
}

interface StepExecutionResult {
  success: boolean;
  output?: unknown;
  error?: ExecutionError;
  filesChanged?: string[];
}

// ============================================================================
// Autonomous Orchestrator
// ============================================================================

export class AutonomousOrchestrator extends EventEmitter {
  private config: AutonomousConfig;
  private ollama: OllamaBackend;
  private reasoning: ReasoningEngine;
  private planning: PlanningSystem;
  private verification: VerificationEngine;
  private correction!: SelfCorrectionLoop;
  private embeddings: HybridEmbeddingService;

  private activeTasks: Map<string, ExecutionContext> = new Map();
  private taskHistory: AutonomousTask[] = [];
  private eventHandlers: Set<EventHandler> = new Set();
  private initialized: boolean = false;
  private workingDirectory: string = process.cwd();

  constructor(config: Partial<AutonomousConfig> = {}) {
    super();
    this.config = { ...DEFAULT_AUTONOMOUS_CONFIG, ...config };

    // Initialize components
    this.ollama = getOllamaBackend(this.config.ollama);
    this.reasoning = getReasoningEngine(this.config.reasoning);
    this.planning = getPlanningSystem(this.config.planning);
    this.verification = getVerificationEngine(this.config.verification);
    this.embeddings = getEmbeddingService(this.config.embeddings);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize all components
    await Promise.all([
      this.ollama.initialize(),
      this.embeddings.initialize()
    ]);

    // Initialize correction loop (async)
    this.correction = await getSelfCorrectionLoop(this.config.correction);

    // Set up event forwarding
    this.setupEventForwarding();

    this.initialized = true;
    this.emitEvent({ type: 'task_started', task: null as any }); // Signal ready
  }

  private setupEventForwarding(): void {
    // Forward events from sub-components
    this.reasoning.on('thinking_step', (data) => {
      const task = this.findTaskForChain(data.chainId);
      if (task) {
        this.emitEvent({ type: 'thinking_step', taskId: task.id, step: data.step });
      }
    });

    this.planning.on('planning_completed', (data) => {
      this.emitEvent({ type: 'planning_completed', taskId: data.planId, plan: data.plan });
    });

    this.correction.on('help_requested', (data) => {
      this.emitEvent({
        type: 'approval_required',
        taskId: data.stepId,
        operation: 'shell_command' as ApprovalRequired,
        details: data.message
      });
    });
  }

  // ==========================================================================
  // Main Execution Interface
  // ==========================================================================

  async execute(
    goal: string,
    context?: Partial<TaskContext>,
    constraints?: Partial<TaskConstraints>,
    onProgress?: ProgressCallback,
    cancellationToken?: CancellationToken
  ): Promise<TaskResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const taskId = uuidv4();
    const startTime = new Date();

    // Create task
    const task: AutonomousTask = {
      id: taskId,
      goal,
      type: this.inferTaskType(goal),
      priority: 'medium',
      context: {
        conversationHistory: context?.conversationHistory || [],
        relevantFiles: context?.relevantFiles || [],
        codebaseState: context?.codebaseState || '',
        userPreferences: context?.userPreferences || {},
        previousAttempts: context?.previousAttempts || []
      },
      constraints: {
        maxIterations: constraints?.maxIterations || this.config.maxIterations,
        timeoutMs: constraints?.timeoutMs || 300000,
        requireApprovalFor: constraints?.requireApprovalFor || this.config.requireApprovalFor,
        allowedTools: constraints?.allowedTools || ['*'],
        disallowedOperations: constraints?.disallowedOperations || []
      },
      status: ExecutionStatus.PENDING,
      verificationReports: [],
      correctionAttempts: [],
      createdAt: new Date()
    };

    this.emitEvent({ type: 'task_started', task });
    onProgress?.(0, 'Task started');

    try {
      // Phase 1: Thinking (Reasoning)
      onProgress?.(0.1, 'Analyzing task...');
      task.status = ExecutionStatus.IN_PROGRESS;
      task.startedAt = new Date();

      const reasoningContext = await this.buildReasoningContext(task);
      this.emitEvent({ type: 'thinking_started', taskId });

      const reasoningChain = await this.reasoning.think(
        goal,
        reasoningContext,
        (p, m) => onProgress?.(0.1 + p * 0.15, m),
        cancellationToken
      );

      task.reasoningChain = reasoningChain;
      this.emitEvent({ type: 'thinking_completed', taskId, chain: reasoningChain });

      // Check cancellation
      if (cancellationToken?.isCancelled) {
        throw new Error('Task cancelled');
      }

      // Phase 2: Planning
      onProgress?.(0.25, 'Creating execution plan...');
      this.emitEvent({ type: 'planning_started', taskId });

      const contextSummary = this.summarizeContext(task.context);
      const plan = await this.planning.createPlan(
        goal,
        contextSummary + '\n\nReasoning:\n' + reasoningChain.conclusion,
        (p, m) => onProgress?.(0.25 + p * 0.1, m)
      );

      task.plan = plan;
      this.emitEvent({ type: 'planning_completed', taskId, plan });

      // Check if approval needed
      if (plan.metadata.requiresApproval) {
        await this.requestApproval(task, plan);
      }

      // Phase 3: Execution
      onProgress?.(0.35, 'Executing plan...');

      const executionContext: ExecutionContext = {
        task,
        plan,
        currentStepIndex: 0,
        filesModified: new Map(),
        commandsExecuted: [],
        startTime,
        metrics: {
          thinkingDuration: Date.now() - startTime.getTime(),
          modelCalls: 0,
          tokensUsed: 0
        }
      };

      this.activeTasks.set(taskId, executionContext);

      const result = await this.executePlan(
        executionContext,
        (p, m) => onProgress?.(0.35 + p * 0.55, m),
        cancellationToken
      );

      // Phase 4: Finalization
      onProgress?.(0.9, 'Finalizing...');

      task.status = result.success ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED;
      task.completedAt = new Date();
      task.result = result;

      this.taskHistory.push(task);
      this.activeTasks.delete(taskId);

      if (result.success) {
        this.emitEvent({ type: 'task_completed', task, result });
      } else {
        this.emitEvent({
          type: 'task_failed',
          task,
          error: result.errors[0] || { code: 'UNKNOWN', message: 'Task failed', type: 'unknown', recoverable: false }
        });
      }

      onProgress?.(1, result.success ? 'Task completed' : 'Task failed');
      return result;

    } catch (error: any) {
      task.status = ExecutionStatus.FAILED;
      task.completedAt = new Date();

      const taskResult: TaskResult = {
        success: false,
        output: '',
        filesModified: [],
        commandsExecuted: [],
        errors: [{
          code: error.code || 'EXECUTION_ERROR',
          message: error.message,
          type: 'runtime',
          stackTrace: error.stack,
          recoverable: false
        }],
        metrics: this.activeTasks.get(taskId)?.metrics as TaskMetrics || this.createEmptyMetrics()
      };

      task.result = taskResult;
      this.taskHistory.push(task);
      this.activeTasks.delete(taskId);

      this.emitEvent({
        type: 'task_failed',
        task,
        error: taskResult.errors[0]
      });

      return taskResult;
    }
  }

  // ==========================================================================
  // Plan Execution
  // ==========================================================================

  private async executePlan(
    context: ExecutionContext,
    onProgress?: ProgressCallback,
    cancellationToken?: CancellationToken
  ): Promise<TaskResult> {
    const { task, plan } = context;
    const errors: ExecutionError[] = [];
    let iteration = 0;

    while (iteration < task.constraints.maxIterations) {
      // Check cancellation
      if (cancellationToken?.isCancelled) {
        throw new Error('Task cancelled');
      }

      // Get next executable steps
      const nextSteps = this.planning.getNextExecutableSteps(plan);

      if (nextSteps.length === 0) {
        // Check if all steps completed
        const allCompleted = plan.steps.every(
          s => s.status === ExecutionStatus.COMPLETED || s.status === ExecutionStatus.SKIPPED
        );

        if (allCompleted) {
          break;
        }

        // Check for blocked steps
        const blockedSteps = plan.steps.filter(s => s.status === ExecutionStatus.BLOCKED);
        if (blockedSteps.length > 0) {
          errors.push({
            code: 'BLOCKED',
            message: `Steps blocked: ${blockedSteps.map(s => s.description).join(', ')}`,
            type: 'logic',
            recoverable: false
          });
          break;
        }

        // No more steps but not all completed - something went wrong
        break;
      }

      // Execute steps (potentially in parallel if enabled)
      const stepProgress = iteration / task.constraints.maxIterations;
      onProgress?.(stepProgress, `Executing step ${iteration + 1}`);

      if (this.config.planning.enableParallelExecution && nextSteps.length > 1) {
        await Promise.all(
          nextSteps.map(step => this.executeStep(context, step, cancellationToken))
        );
      } else {
        for (const step of nextSteps) {
          await this.executeStep(context, step, cancellationToken);
        }
      }

      iteration++;
    }

    // Build result
    const result: TaskResult = {
      success: errors.length === 0 && plan.steps.every(
        s => s.status === ExecutionStatus.COMPLETED || s.status === ExecutionStatus.SKIPPED
      ),
      output: this.buildOutput(context),
      filesModified: Array.from(context.filesModified.keys()),
      commandsExecuted: context.commandsExecuted,
      errors,
      metrics: this.calculateMetrics(context)
    };

    return result;
  }

  private async executeStep(
    context: ExecutionContext,
    step: ExecutionStep,
    cancellationToken?: CancellationToken
  ): Promise<void> {
    const { task, plan } = context;

    // Check if approval needed
    if (await this.needsApproval(step, task.constraints)) {
      this.emitEvent({
        type: 'approval_required',
        taskId: task.id,
        operation: this.getApprovalType(step),
        details: step.description
      });
      // In a real implementation, would wait for approval
      // For now, continue with execution
    }

    this.emitEvent({ type: 'step_started', taskId: task.id, step });
    this.planning.updateStepStatus(plan, step.id, ExecutionStatus.IN_PROGRESS);

    try {
      const result = await this.performStepExecution(context, step);

      if (result.success) {
        // Verify if this is a checkpoint
        if (this.planning.isCheckpoint(plan, step.id)) {
          const verificationResult = await this.verifyStep(context, step, result);

          if (verificationResult.result === VerificationResult.FAILED) {
            throw new Error(`Verification failed: ${verificationResult.checks.filter((c: any) => !c.passed).map((c: any) => c.message).join(', ')}`);
          }

          task.verificationReports.push(verificationResult);
        }

        this.planning.updateStepStatus(plan, step.id, ExecutionStatus.COMPLETED, result.output as any);
        this.emitEvent({ type: 'step_completed', taskId: task.id, stepId: step.id, result: result.output });
      } else {
        throw result.error || new Error('Step execution failed');
      }

    } catch (error: any) {
      const execError: ExecutionError = {
        code: error.code || 'STEP_FAILED',
        message: error.message,
        type: this.classifyErrorType(error),
        stackTrace: error.stack,
        recoverable: step.retryCount < step.maxRetries
      };

      this.emitEvent({ type: 'step_failed', taskId: task.id, stepId: step.id, error: execError });

      // Attempt correction
      if (execError.recoverable) {
        const correctionResult = await this.correction.attemptCorrection(
          step,
          execError,
          this.summarizeContext(task.context),
          task.correctionAttempts
        );

        task.correctionAttempts.push(correctionResult.attempt);
        this.emitEvent({
          type: 'correction_completed',
          taskId: task.id,
          attempt: correctionResult.attempt
        });

        if (correctionResult.success) {
          // Retry the step
          step.retryCount++;
          if (correctionResult.newApproach) {
            step.description = correctionResult.newApproach;
          }
          await this.executeStep(context, step, cancellationToken);
          return;
        }
      }

      // Mark step as failed
      this.planning.updateStepStatus(plan, step.id, ExecutionStatus.FAILED, undefined, execError);
    }
  }

  private async performStepExecution(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    switch (step.type) {
      case TaskType.CODE_GENERATION:
        return this.executeCodeGeneration(context, step);

      case TaskType.CODE_MODIFICATION:
        return this.executeCodeModification(context, step);

      case TaskType.CODE_ANALYSIS:
        return this.executeCodeAnalysis(context, step);

      case TaskType.FILE_OPERATION:
        return this.executeFileOperation(context, step);

      case TaskType.SHELL_COMMAND:
        return this.executeShellCommand(context, step);

      case TaskType.TESTING:
        return this.executeTesting(context, step);

      case TaskType.BUG_FIX:
        return this.executeBugFix(context, step);

      case TaskType.REFACTORING:
        return this.executeRefactoring(context, step);

      case TaskType.DOCUMENTATION:
        return this.executeDocumentation(context, step);

      case TaskType.RESEARCH:
        return this.executeResearch(context, step);

      case TaskType.PLANNING:
        // Planning steps are handled by creating sub-plans
        return { success: true, output: 'Planning step completed' };

      default:
        return this.executeGenericStep(context, step);
    }
  }

  // ==========================================================================
  // Step Type Executors
  // ==========================================================================

  private async executeCodeGeneration(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const language = this.detectLanguage(step.description);
    const existingContext = step.inputs?.context as string || '';

    const result = await this.ollama.generateCode(
      step.description,
      language,
      existingContext
    );

    // If output file is specified, write to it
    const outputFile = step.inputs?.outputFile as string;
    if (outputFile) {
      const filePath = path.resolve(this.workingDirectory, outputFile);
      const beforeContent = await this.safeReadFile(filePath);

      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, result.code);

      context.filesModified.set(filePath, {
        before: beforeContent || '',
        after: result.code
      });

      return {
        success: true,
        output: { code: result.code, explanation: result.explanation, file: outputFile },
        filesChanged: [outputFile]
      };
    }

    return {
      success: true,
      output: { code: result.code, explanation: result.explanation }
    };
  }

  private async executeCodeModification(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const targetFile = step.inputs?.file as string;
    if (!targetFile) {
      return {
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'No target file specified for modification',
          type: 'logic',
          recoverable: true
        }
      };
    }

    const filePath = path.resolve(this.workingDirectory, targetFile);
    const beforeContent = await this.safeReadFile(filePath);

    if (!beforeContent) {
      return {
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${targetFile}`,
          type: 'runtime',
          recoverable: true
        }
      };
    }

    // Use AI to modify the code
    const response = await this.ollama.generate({
      model: this.ollama.selectModelForCapability('code_generation'),
      prompt: `Current file content:\n\`\`\`\n${beforeContent}\n\`\`\`\n\nModification required: ${step.description}\n\nProvide the complete modified file content.`,
      system: `You are a code modification expert. Modify the given code according to the instruction.
Output ONLY the complete modified file content, no explanations.`,
      options: {
        temperature: 0.3,
        num_predict: 8000
      }
    });

    // Extract code from response (remove markdown if present)
    let modifiedCode = response.response;
    const codeMatch = modifiedCode.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeMatch) {
      modifiedCode = codeMatch[1];
    }

    await fs.writeFile(filePath, modifiedCode);

    context.filesModified.set(filePath, {
      before: beforeContent,
      after: modifiedCode
    });

    return {
      success: true,
      output: { file: targetFile, changes: 'Code modified successfully' },
      filesChanged: [targetFile]
    };
  }

  private async executeCodeAnalysis(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const targetFile = step.inputs?.file as string;
    const analysisType = (step.inputs?.analysisType as string) || 'general';

    let codeToAnalyze: string;

    if (targetFile) {
      const filePath = path.resolve(this.workingDirectory, targetFile);
      codeToAnalyze = await this.safeReadFile(filePath) || '';
    } else {
      codeToAnalyze = step.inputs?.code as string || step.description;
    }

    const result = await this.ollama.analyzeCode(
      codeToAnalyze,
      analysisType as any
    );

    return {
      success: true,
      output: result
    };
  }

  private async executeFileOperation(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const operation = step.inputs?.operation as string || 'read';
    const targetPath = step.inputs?.path as string;

    if (!targetPath) {
      return {
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'No path specified for file operation',
          type: 'logic',
          recoverable: true
        }
      };
    }

    const fullPath = path.resolve(this.workingDirectory, targetPath);

    switch (operation) {
      case 'read':
        const content = await this.safeReadFile(fullPath);
        return { success: !!content, output: content };

      case 'write':
        const writeContent = step.inputs?.content as string;
        const beforeContent = await this.safeReadFile(fullPath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, writeContent || '');
        context.filesModified.set(fullPath, {
          before: beforeContent || '',
          after: writeContent || ''
        });
        return { success: true, output: 'File written', filesChanged: [targetPath] };

      case 'delete':
        await fs.remove(fullPath);
        return { success: true, output: 'File deleted' };

      case 'copy':
        const destPath = step.inputs?.destination as string;
        if (!destPath) {
          return { success: false, error: { code: 'MISSING_DEST', message: 'No destination', type: 'logic', recoverable: true } };
        }
        await fs.copy(fullPath, path.resolve(this.workingDirectory, destPath));
        return { success: true, output: 'File copied' };

      case 'move':
        const moveDest = step.inputs?.destination as string;
        if (!moveDest) {
          return { success: false, error: { code: 'MISSING_DEST', message: 'No destination', type: 'logic', recoverable: true } };
        }
        await fs.move(fullPath, path.resolve(this.workingDirectory, moveDest));
        return { success: true, output: 'File moved' };

      default:
        return { success: false, error: { code: 'UNKNOWN_OP', message: `Unknown operation: ${operation}`, type: 'logic', recoverable: true } };
    }
  }

  private async executeShellCommand(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const command = step.inputs?.command as string || step.description;

    // Security check
    if (this.isCommandDangerous(command)) {
      return {
        success: false,
        error: {
          code: 'DANGEROUS_COMMAND',
          message: `Command blocked for safety: ${command}`,
          type: 'permission',
          recoverable: false
        }
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDirectory,
        timeout: 60000
      });

      context.commandsExecuted.push(command);

      return {
        success: true,
        output: { stdout, stderr, command }
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'COMMAND_FAILED',
          message: error.message,
          type: 'runtime',
          recoverable: true
        }
      };
    }
  }

  private async executeTesting(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const testCommand = step.inputs?.command as string || 'npm test';

    try {
      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: this.workingDirectory,
        timeout: 120000
      });

      context.commandsExecuted.push(testCommand);

      const passed = !stdout.includes('FAIL') && !stderr.includes('FAIL');

      return {
        success: passed,
        output: { stdout, stderr, passed }
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'TEST_FAILED',
          message: error.message,
          type: 'runtime',
          recoverable: true
        }
      };
    }
  }

  private async executeBugFix(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    // Analyze the bug using reasoning
    const chain = await this.reasoning.reasonAboutError(
      new Error(step.description),
      this.summarizeContext(context.task.context)
    );

    // Extract fix from reasoning
    const decision = chain.steps.find(s => s.type === 'decision');
    if (!decision) {
      return {
        success: false,
        error: {
          code: 'NO_FIX_FOUND',
          message: 'Could not determine fix for bug',
          type: 'logic',
          recoverable: true
        }
      };
    }

    // Apply the fix
    return this.executeCodeModification(context, {
      ...step,
      description: decision.content
    });
  }

  private async executeRefactoring(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    return this.executeCodeModification(context, step);
  }

  private async executeDocumentation(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    const targetFile = step.inputs?.file as string;

    if (targetFile) {
      const filePath = path.resolve(this.workingDirectory, targetFile);
      const code = await this.safeReadFile(filePath);

      if (!code) {
        return {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: `File not found: ${targetFile}`,
            type: 'runtime',
            recoverable: true
          }
        };
      }

      // Generate documentation
      const docs = await this.ollama.summarize(
        `Code to document:\n${code}\n\nGenerate comprehensive documentation.`,
        'detailed'
      );

      return {
        success: true,
        output: { documentation: docs, file: targetFile }
      };
    }

    // Generate standalone documentation
    const docs = await this.ollama.generate({
      model: this.ollama.selectModelForCapability('summarization'),
      prompt: step.description,
      system: 'Generate clear, comprehensive documentation.',
      options: { temperature: 0.4 }
    });

    return {
      success: true,
      output: { documentation: docs.response }
    };
  }

  private async executeResearch(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    // Use reasoning engine for research
    const chain = await this.reasoning.think(
      step.description,
      await this.buildReasoningContext(context.task)
    );

    return {
      success: true,
      output: {
        findings: chain.conclusion,
        reasoning: chain.steps.map(s => s.content)
      }
    };
  }

  private async executeGenericStep(
    context: ExecutionContext,
    step: ExecutionStep
  ): Promise<StepExecutionResult> {
    // Use AI to determine how to execute
    const response = await this.ollama.generate({
      model: this.ollama.selectModelForCapability('reasoning'),
      prompt: `Execute this task: ${step.description}`,
      system: 'You are a helpful assistant. Complete the task and describe what you did.',
      options: { temperature: 0.5 }
    });

    return {
      success: true,
      output: response.response
    };
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  private async verifyStep(
    context: ExecutionContext,
    step: ExecutionStep,
    result: StepExecutionResult
  ): Promise<any> {
    const fileChanges = [];

    for (const [filePath, change] of context.filesModified) {
      if (result.filesChanged?.some(f => filePath.includes(f))) {
        fileChanges.push({
          path: filePath,
          type: change.before ? 'modified' : 'added',
          beforeContent: change.before,
          afterContent: change.after,
          diff: await this.verification.getFileDiff(filePath, change.before, change.after)
        });
      }
    }

    return this.verification.verify(
      step,
      fileChanges as any,
      context.commandsExecuted,
      this.workingDirectory
    );
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async buildReasoningContext(task: AutonomousTask): Promise<ReasoningContext> {
    return {
      codebaseUnderstanding: task.context.conversationHistory.slice(-10),
      relevantFiles: task.context.relevantFiles,
      constraints: Object.entries(task.constraints)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
      assumptions: [],
      risks: task.context.previousAttempts.length > 0
        ? ['Previous attempts failed']
        : []
    };
  }

  private summarizeContext(context: TaskContext): string {
    const parts: string[] = [];

    if (context.conversationHistory.length > 0) {
      parts.push(`Recent history: ${context.conversationHistory.slice(-5).join('\n')}`);
    }

    if (context.relevantFiles.length > 0) {
      parts.push(`Relevant files: ${context.relevantFiles.join(', ')}`);
    }

    if (context.codebaseState) {
      parts.push(`Codebase state: ${context.codebaseState}`);
    }

    return parts.join('\n\n');
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private inferTaskType(goal: string): TaskType {
    const lower = goal.toLowerCase();

    if (lower.includes('fix') || lower.includes('bug')) return TaskType.BUG_FIX;
    if (lower.includes('test')) return TaskType.TESTING;
    if (lower.includes('refactor')) return TaskType.REFACTORING;
    if (lower.includes('document')) return TaskType.DOCUMENTATION;
    if (lower.includes('analyze') || lower.includes('review')) return TaskType.CODE_ANALYSIS;
    if (lower.includes('create') || lower.includes('generate') || lower.includes('implement')) return TaskType.CODE_GENERATION;
    if (lower.includes('run') || lower.includes('execute')) return TaskType.SHELL_COMMAND;
    if (lower.includes('file') || lower.includes('move') || lower.includes('copy')) return TaskType.FILE_OPERATION;
    if (lower.includes('research') || lower.includes('find')) return TaskType.RESEARCH;
    if (lower.includes('plan')) return TaskType.PLANNING;

    return TaskType.CODE_MODIFICATION;
  }

  private detectLanguage(description: string): string {
    const lower = description.toLowerCase();

    if (lower.includes('typescript') || lower.includes('.ts')) return 'typescript';
    if (lower.includes('javascript') || lower.includes('.js')) return 'javascript';
    if (lower.includes('python') || lower.includes('.py')) return 'python';
    if (lower.includes('rust') || lower.includes('.rs')) return 'rust';
    if (lower.includes('go') || lower.includes('golang')) return 'go';
    if (lower.includes('java')) return 'java';
    if (lower.includes('c++') || lower.includes('cpp')) return 'cpp';
    if (lower.includes('c#') || lower.includes('csharp')) return 'csharp';

    return 'typescript'; // Default
  }

  private classifyErrorType(error: Error): ExecutionError['type'] {
    const message = error.message.toLowerCase();

    if (message.includes('syntax')) return 'syntax';
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('permission') || message.includes('eacces')) return 'permission';
    if (message.includes('network') || message.includes('econnrefused')) return 'external';

    return 'runtime';
  }

  private isCommandDangerous(command: string): boolean {
    const dangerous = [
      /rm\s+-rf\s+\/(?!\w)/,  // rm -rf /
      /mkfs/,
      /dd\s+if=/,
      /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/, // Fork bomb
      />\s*\/dev\/sda/,
      /chmod\s+777\s+\//
    ];

    return dangerous.some(pattern => pattern.test(command));
  }

  private async needsApproval(step: ExecutionStep, constraints: TaskConstraints): Promise<boolean> {
    const approvalTypes = constraints.requireApprovalFor;

    if (step.type === TaskType.SHELL_COMMAND && approvalTypes.includes('shell_command')) return true;
    if (step.type === TaskType.FILE_OPERATION) {
      const op = step.inputs?.operation as string;
      if (op === 'delete' && approvalTypes.includes('file_delete')) return true;
      if (op === 'write' && approvalTypes.includes('file_write')) return true;
    }

    return false;
  }

  private getApprovalType(step: ExecutionStep): ApprovalRequired {
    if (step.type === TaskType.SHELL_COMMAND) return 'shell_command';
    if (step.type === TaskType.FILE_OPERATION) {
      const op = step.inputs?.operation as string;
      if (op === 'delete') return 'file_delete';
      return 'file_write';
    }
    return 'shell_command';
  }

  private async requestApproval(task: AutonomousTask, plan: ExecutionPlan): Promise<void> {
    this.emitEvent({
      type: 'approval_required',
      taskId: task.id,
      operation: 'file_write',
      details: `Plan requires approval:\n${plan.steps.map(s => s.description).join('\n')}`
    });
    // In a real implementation, would wait for user approval
  }

  private buildOutput(context: ExecutionContext): string {
    const completedSteps = context.plan.steps.filter(s => s.status === ExecutionStatus.COMPLETED);
    const outputs = completedSteps.map(s => s.outputs).filter(Boolean);

    return outputs.map(o => JSON.stringify(o, null, 2)).join('\n\n');
  }

  private calculateMetrics(context: ExecutionContext): TaskMetrics {
    const now = Date.now();
    const startMs = context.startTime.getTime();

    return {
      totalDuration: now - startMs,
      thinkingDuration: context.metrics.thinkingDuration || 0,
      planningDuration: context.metrics.planningDuration || 0,
      executionDuration: now - startMs - (context.metrics.thinkingDuration || 0) - (context.metrics.planningDuration || 0),
      verificationDuration: 0,
      correctionDuration: 0,
      iterationCount: context.currentStepIndex,
      tokensUsed: context.metrics.tokensUsed || 0,
      modelCalls: context.metrics.modelCalls || 0
    };
  }

  private createEmptyMetrics(): TaskMetrics {
    return {
      totalDuration: 0,
      thinkingDuration: 0,
      planningDuration: 0,
      executionDuration: 0,
      verificationDuration: 0,
      correctionDuration: 0,
      iterationCount: 0,
      tokensUsed: 0,
      modelCalls: 0
    };
  }

  private findTaskForChain(chainId: string): AutonomousTask | undefined {
    for (const context of this.activeTasks.values()) {
      if (context.task.reasoningChain?.id === chainId) {
        return context.task;
      }
    }
    return undefined;
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  private emitEvent(event: AutonomousEvent): void {
    this.emit(event.type, event);
    for (const handler of this.eventHandlers) {
      try {
        void handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // ==========================================================================
  // Configuration & State
  // ==========================================================================

  updateConfig(config: Partial<AutonomousConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): AutonomousConfig {
    return { ...this.config };
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  getActiveTasks(): AutonomousTask[] {
    return Array.from(this.activeTasks.values()).map(c => c.task);
  }

  getTaskHistory(limit: number = 50): AutonomousTask[] {
    return this.taskHistory.slice(-limit);
  }

  cancelTask(taskId: string): boolean {
    const context = this.activeTasks.get(taskId);
    if (context) {
      context.task.status = ExecutionStatus.FAILED;
      this.activeTasks.delete(taskId);
      return true;
    }
    return false;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let orchestratorInstance: AutonomousOrchestrator | null = null;

export async function getAutonomousOrchestrator(
  config?: Partial<AutonomousConfig>
): Promise<AutonomousOrchestrator> {
  if (!orchestratorInstance) {
    orchestratorInstance = new AutonomousOrchestrator(config);
    await orchestratorInstance.initialize();
  } else if (config) {
    orchestratorInstance.updateConfig(config);
  }
  return orchestratorInstance;
}

export function resetAutonomousOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.removeAllListeners();
  }
  orchestratorInstance = null;
}
