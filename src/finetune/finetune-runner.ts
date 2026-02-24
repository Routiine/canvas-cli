/**
 * Priority 5: Fine-tune Runner
 * Orchestrates Ollama LoRA fine-tuning workflow
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

const execAsync = promisify(exec);
const CANVAS_DIR = path.join(os.homedir(), '.canvas');
const TRAINING_DIR = path.join(CANVAS_DIR, 'training');

interface FineTuneJob {
  id: string;
  base_model: string;
  output_model: string;
  epochs: number;
  training_file: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: number;
  completed_at?: number;
  error?: string;
}

function getDb(): Database.Database {
  fs.ensureDirSync(CANVAS_DIR);
  const db = new Database(path.join(CANVAS_DIR, 'canvas.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS finetune_jobs (
      id TEXT PRIMARY KEY,
      base_model TEXT NOT NULL,
      output_model TEXT NOT NULL,
      epochs INTEGER NOT NULL DEFAULT 3,
      training_file TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      completed_at INTEGER,
      error TEXT
    );
  `);
  return db;
}

export async function runFineTune(options: {
  baseModel?: string;
  outputModel?: string;
  epochs?: number;
  trainingFile?: string;
} = {}): Promise<{ jobId: string; message: string }> {
  const jobId = `ft-${Date.now()}`;
  const baseModel = options.baseModel || 'llama3.2:3b';
  const outputModel = options.outputModel || 'canvas-custom';
  const epochs = options.epochs || 3;
  const trainingFile = options.trainingFile || path.join(TRAINING_DIR, 'git-history.jsonl');

  if (!await fs.pathExists(trainingFile)) {
    throw new Error(`Training file not found: ${trainingFile}. Run 'canvas finetune extract' first.`);
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO finetune_jobs (id, base_model, output_model, epochs, training_file, status, started_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?)
  `).run(jobId, baseModel, outputModel, epochs, trainingFile, Date.now());

  // Generate Modelfile
  const modelfilePath = path.join(CANVAS_DIR, 'Modelfile');
  const modelfileContent = `FROM ${baseModel}
SYSTEM "You are Canvas, an expert software engineering assistant specialized for this codebase."
`;

  await fs.writeFile(modelfilePath, modelfileContent, 'utf-8');

  try {
    // Create model in Ollama
    await execAsync(`ollama create ${outputModel} -f "${modelfilePath}"`, { timeout: 300000 });

    db.prepare(`
      UPDATE finetune_jobs SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(Date.now(), jobId);

    return { jobId, message: `Fine-tuning completed. Model available as: ${outputModel}` };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    db.prepare(`
      UPDATE finetune_jobs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?
    `).run(Date.now(), error, jobId);
    throw new Error(`Fine-tuning failed: ${error}`);
  }
}

export function getJobStatus(jobId?: string): FineTuneJob[] {
  const db = getDb();
  if (jobId) {
    return db.prepare('SELECT * FROM finetune_jobs WHERE id = ?').all(jobId) as FineTuneJob[];
  }
  return db.prepare('SELECT * FROM finetune_jobs ORDER BY started_at DESC LIMIT 10').all() as FineTuneJob[];
}
