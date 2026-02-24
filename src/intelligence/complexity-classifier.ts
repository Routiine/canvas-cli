/**
 * Priority 1: Task Complexity Classifier
 * Scores tasks 0-100 to determine routing (local vs API)
 */

export interface ClassificationResult {
  score: number;
  tier: 'local' | 'local-preferred' | 'api';
  reasons: string[];
}

const COMPLEXITY_KEYWORDS = {
  high: [
    'architecture', 'security', 'debug', 'refactor', 'design pattern',
    'performance optimization', 'system design', 'scalab', 'distributed',
    'concurrent', 'race condition', 'memory leak', 'algorithm', 'cryptograph',
    'authentication', 'authorization', 'vulnerability', 'exploit', 'reverse engineer'
  ],
  medium: [
    'implement', 'create', 'build', 'add feature', 'integrate', 'configure',
    'test', 'migrate', 'upgrade', 'convert', 'transform', 'analyze', 'review'
  ],
  low: [
    'explain', 'what is', 'how does', 'show me', 'list', 'print', 'format',
    'rename', 'move', 'copy', 'delete', 'fix typo', 'update comment'
  ]
};

export function classifyTask(task: string, context: {
  fileCount?: number;
  codeBlockCount?: number;
  conversationLength?: number;
} = {}): ClassificationResult {
  const reasons: string[] = [];
  let score = 0;
  
  const lowerTask = task.toLowerCase();
  const wordCount = task.split(/\s+/).length;
  
  // Token/length scoring (0-20 points)
  if (wordCount > 200) { score += 20; reasons.push('Very long task description'); }
  else if (wordCount > 100) { score += 12; reasons.push('Long task description'); }
  else if (wordCount > 50) { score += 6; reasons.push('Medium task description'); }
  else { score += 2; }
  
  // Code blocks detected (0-15 points)
  const codeBlockCount = context.codeBlockCount ?? (task.match(/```/g) || []).length / 2;
  if (codeBlockCount >= 3) { score += 15; reasons.push('Multiple code blocks'); }
  else if (codeBlockCount >= 1) { score += 8; reasons.push('Code blocks present'); }
  
  // File count mentioned (0-15 points)
  const fileCount = context.fileCount ?? (task.match(/\b\w+\.[a-z]{1,4}\b/g) || []).length;
  if (fileCount >= 5) { score += 15; reasons.push('Many files referenced'); }
  else if (fileCount >= 2) { score += 8; reasons.push('Multiple files referenced'); }
  
  // High-complexity keywords (0-30 points)
  const highKeywords = COMPLEXITY_KEYWORDS.high.filter(kw => lowerTask.includes(kw));
  if (highKeywords.length >= 3) { score += 30; reasons.push(`Complex keywords: ${highKeywords.slice(0,3).join(', ')}`); }
  else if (highKeywords.length >= 2) { score += 20; reasons.push(`Complex keywords: ${highKeywords.join(', ')}`); }
  else if (highKeywords.length === 1) { score += 12; reasons.push(`Complex keyword: ${highKeywords[0]}`); }
  
  // Medium keywords (0-15 points)
  const medKeywords = COMPLEXITY_KEYWORDS.medium.filter(kw => lowerTask.includes(kw));
  if (medKeywords.length >= 3) { score += 10; }
  else if (medKeywords.length >= 1) { score += 5; }
  
  // Low keywords (reduce score by 0-10)
  const lowKeywords = COMPLEXITY_KEYWORDS.low.filter(kw => lowerTask.includes(kw));
  if (lowKeywords.length > 0 && highKeywords.length === 0) { 
    score -= 10; 
    reasons.push('Simple task keywords detected');
  }
  
  // Nested reasoning indicators (0-10 points)
  const reasoningIndicators = ['because', 'therefore', 'however', 'considering', 'tradeoff', 'alternatively', 'furthermore'];
  const reasoningCount = reasoningIndicators.filter(r => lowerTask.includes(r)).length;
  if (reasoningCount >= 3) { score += 10; reasons.push('Complex reasoning required'); }
  else if (reasoningCount >= 1) { score += 5; }
  
  // Conversation length context (0-10 points)
  const convLength = context.conversationLength ?? 0;
  if (convLength > 20) { score += 10; reasons.push('Long conversation context'); }
  else if (convLength > 10) { score += 5; }
  
  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));
  
  // Determine tier
  let tier: 'local' | 'local-preferred' | 'api';
  if (score < 30) {
    tier = 'local';
  } else if (score <= 70) {
    tier = 'local-preferred';
  } else {
    tier = 'api';
  }
  
  return { score, tier, reasons };
}
