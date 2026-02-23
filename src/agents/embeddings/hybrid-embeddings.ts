/**
 * Hybrid Embeddings Service
 *
 * Provides semantic embeddings using a hybrid approach:
 * - Primary: Local transformers.js (@xenova/transformers) for offline, fast embeddings
 * - Fallback: Ollama API for when local model isn't available
 * - Optional: External API (OpenAI/Cohere) as last resort
 *
 * Features:
 * - LRU cache with content-hash keys
 * - Batch processing with parallelization
 * - Cosine similarity and other distance metrics
 * - Automatic fallback chain
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import type { EmbeddingsConfig} from '../autonomous/types.js';
import { DEFAULT_EMBEDDINGS_CONFIG } from '../autonomous/types.js';
import { getOllamaBackend } from '../autonomous/ollama-backend.js';

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingResult {
  vector: Float32Array;
  model: string;
  provider: 'local' | 'ollama' | 'api';
  cached: boolean;
  duration: number;
}

export interface BatchEmbeddingResult {
  vectors: Float32Array[];
  model: string;
  provider: 'local' | 'ollama' | 'api';
  successCount: number;
  failureCount: number;
  duration: number;
}

export interface SimilarityResult {
  index: number;
  score: number;
  text?: string;
}

interface CacheEntry {
  vector: Float32Array;
  model: string;
  provider: 'local' | 'ollama' | 'api';
  timestamp: number;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}

// ============================================================================
// Hybrid Embeddings Service
// ============================================================================

export class HybridEmbeddingService extends EventEmitter {
  private config: EmbeddingsConfig;
  private cache: LRUCache<string, CacheEntry>;
  private localModel: any = null;
  private localModelLoading: Promise<any> | null = null;
  private initialized: boolean = false;
  private localAvailable: boolean = false;
  private ollamaAvailable: boolean = false;

  constructor(config: Partial<EmbeddingsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_EMBEDDINGS_CONFIG, ...config };
    this.cache = new LRUCache(this.config.cacheSize);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const initPromises: Promise<void>[] = [];

    // Try to initialize local model
    if (this.config.provider === 'local' || this.config.provider === 'hybrid') {
      initPromises.push(this.initializeLocalModel());
    }

    // Check Ollama availability
    if (this.config.provider === 'ollama' || this.config.provider === 'hybrid') {
      initPromises.push(this.checkOllamaAvailability());
    }

    await Promise.allSettled(initPromises);

    this.initialized = true;
    this.emit('initialized', {
      localAvailable: this.localAvailable,
      ollamaAvailable: this.ollamaAvailable
    });
  }

  private async initializeLocalModel(): Promise<void> {
    if (this.localModelLoading) {
      await this.localModelLoading;
      return;
    }

    this.localModelLoading = (async () => {
      try {
        // Dynamic import for @xenova/transformers
        const { pipeline } = await import('@xenova/transformers');

        this.emit('local_model_loading', { model: this.config.localModel });

        // Load the embedding pipeline
        this.localModel = await pipeline('feature-extraction', this.config.localModel, {
          quantized: true // Use quantized model for faster inference
        });

        this.localAvailable = true;
        this.emit('local_model_loaded', { model: this.config.localModel });
      } catch (error) {
        this.localAvailable = false;
        this.emit('local_model_failed', { error });
        // Don't throw - fallback to Ollama/API
      }
    })();

    await this.localModelLoading;
  }

  private async checkOllamaAvailability(): Promise<void> {
    try {
      const backend = getOllamaBackend();
      await backend.checkHealth();
      this.ollamaAvailable = backend.isAvailable();
      this.emit('ollama_available', { available: this.ollamaAvailable });
    } catch {
      this.ollamaAvailable = false;
      this.emit('ollama_unavailable');
    }
  }

  // ==========================================================================
  // Embedding Methods
  // ==========================================================================

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const cacheKey = this.computeCacheKey(text);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        vector: cached.vector,
        model: cached.model,
        provider: cached.provider,
        cached: true,
        duration: Date.now() - startTime
      };
    }

    // Try providers in order
    let result: EmbeddingResult | null = null;

    // 1. Try local model
    if (this.localAvailable && (this.config.provider === 'local' || this.config.provider === 'hybrid')) {
      try {
        result = await this.embedLocal(text, startTime);
      } catch (error) {
        this.emit('local_embed_failed', { error });
      }
    }

    // 2. Fallback to Ollama
    if (!result && this.ollamaAvailable && (this.config.provider === 'ollama' || this.config.provider === 'hybrid')) {
      try {
        result = await this.embedOllama(text, startTime);
      } catch (error) {
        this.emit('ollama_embed_failed', { error });
      }
    }

    // 3. Fallback to API
    if (!result && this.config.fallbackToApi && this.config.apiProvider) {
      try {
        result = await this.embedApi(text, startTime);
      } catch (error) {
        this.emit('api_embed_failed', { error });
      }
    }

    // 4. Last resort: hash-based pseudo-embedding (not semantic but provides consistent vectors)
    if (!result) {
      result = this.embedHash(text, startTime);
    }

    // Cache the result
    this.cache.set(cacheKey, {
      vector: result.vector,
      model: result.model,
      provider: result.provider,
      timestamp: Date.now()
    });

    return result;
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const vectors: Float32Array[] = [];
    let successCount = 0;
    let failureCount = 0;
    let model = 'unknown';
    let provider: 'local' | 'ollama' | 'api' = 'local';

    // Process in parallel batches
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Try batch embedding with local model first
      if (this.localAvailable && this.localModel) {
        try {
          const batchVectors = await this.embedLocalBatch(batch);
          vectors.push(...batchVectors);
          successCount += batch.length;
          model = this.config.localModel;
          provider = 'local';
          continue;
        } catch {
          // Fall through to individual embedding
        }
      }

      // Process individually if batch fails
      const results = await Promise.allSettled(
        batch.map(text => this.embed(text))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          vectors.push(result.value.vector);
          model = result.value.model;
          provider = result.value.provider;
          successCount++;
        } else {
          // Push zero vector for failed embeddings
          vectors.push(new Float32Array(this.config.dimensions));
          failureCount++;
        }
      }
    }

    return {
      vectors,
      model,
      provider,
      successCount,
      failureCount,
      duration: Date.now() - startTime
    };
  }

  private async embedLocal(text: string, startTime: number): Promise<EmbeddingResult> {
    if (!this.localModel) {
      throw new Error('Local model not loaded');
    }

    const output = await this.localModel(text, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to Float32Array
    const vector = new Float32Array(output.data);

    return {
      vector,
      model: this.config.localModel,
      provider: 'local',
      cached: false,
      duration: Date.now() - startTime
    };
  }

  private async embedLocalBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.localModel) {
      throw new Error('Local model not loaded');
    }

    const results: Float32Array[] = [];

    for (const text of texts) {
      const output = await this.localModel(text, {
        pooling: 'mean',
        normalize: true
      });
      results.push(new Float32Array(output.data));
    }

    return results;
  }

  private async embedOllama(text: string, startTime: number): Promise<EmbeddingResult> {
    const backend = getOllamaBackend();
    const embedding = await backend.embed(text, this.config.ollamaModel);

    return {
      vector: new Float32Array(embedding),
      model: this.config.ollamaModel,
      provider: 'ollama',
      cached: false,
      duration: Date.now() - startTime
    };
  }

  private async embedApi(text: string, startTime: number): Promise<EmbeddingResult> {
    if (this.config.apiProvider === 'openai') {
      return this.embedOpenAI(text, startTime);
    } else if (this.config.apiProvider === 'cohere') {
      return this.embedCohere(text, startTime);
    }
    throw new Error(`Unknown API provider: ${this.config.apiProvider}`);
  }

  private async embedOpenAI(text: string, startTime: number): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    return {
      vector: new Float32Array(embedding),
      model: 'text-embedding-3-small',
      provider: 'api',
      cached: false,
      duration: Date.now() - startTime
    };
  }

  private async embedCohere(text: string, startTime: number): Promise<EmbeddingResult> {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('COHERE_API_KEY not set');
    }

    const response = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-english-v3.0',
        input_type: 'search_document'
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.embeddings[0];

    return {
      vector: new Float32Array(embedding),
      model: 'embed-english-v3.0',
      provider: 'api',
      cached: false,
      duration: Date.now() - startTime
    };
  }

  private embedHash(text: string, startTime: number): EmbeddingResult {
    // Hash-based pseudo-embedding as last resort
    // Not semantic, but provides consistent vectors for exact matches
    const hash = crypto.createHash('sha256').update(text).digest();
    const vector = new Float32Array(this.config.dimensions);

    // Convert hash bytes to normalized float values
    for (let i = 0; i < this.config.dimensions; i++) {
      const byteIndex = i % hash.length;
      vector[i] = (hash[byteIndex] / 255) * 2 - 1; // Range: -1 to 1
    }

    // Normalize the vector
    this.normalize(vector);

    this.emit('hash_fallback_used', { text: text.substring(0, 50) });

    return {
      vector,
      model: 'hash-fallback',
      provider: 'local',
      cached: false,
      duration: Date.now() - startTime
    };
  }

  // ==========================================================================
  // Similarity Methods
  // ==========================================================================

  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  euclideanDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  dotProduct(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }

    return sum;
  }

  async findSimilar(
    query: string,
    candidates: string[],
    topK: number = 5,
    minScore: number = 0
  ): Promise<SimilarityResult[]> {
    const queryResult = await this.embed(query);
    const candidateResults = await this.embedBatch(candidates);

    const scores: SimilarityResult[] = [];

    for (let i = 0; i < candidateResults.vectors.length; i++) {
      const score = this.cosineSimilarity(queryResult.vector, candidateResults.vectors[i]);
      if (score >= minScore) {
        scores.push({
          index: i,
          score,
          text: candidates[i]
        });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK);
  }

  async findSimilarVectors(
    queryVector: Float32Array,
    candidateVectors: Float32Array[],
    topK: number = 5,
    minScore: number = 0
  ): Promise<SimilarityResult[]> {
    const scores: SimilarityResult[] = [];

    for (let i = 0; i < candidateVectors.length; i++) {
      const score = this.cosineSimilarity(queryVector, candidateVectors[i]);
      if (score >= minScore) {
        scores.push({
          index: i,
          score
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  // ==========================================================================
  // Vector Operations
  // ==========================================================================

  normalize(vector: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  average(vectors: Float32Array[]): Float32Array {
    if (vectors.length === 0) {
      return new Float32Array(this.config.dimensions);
    }

    const result = new Float32Array(vectors[0].length);

    for (const vector of vectors) {
      for (let i = 0; i < vector.length; i++) {
        result[i] += vector[i];
      }
    }

    for (let i = 0; i < result.length; i++) {
      result[i] /= vectors.length;
    }

    return this.normalize(result);
  }

  weightedAverage(vectors: Float32Array[], weights: number[]): Float32Array {
    if (vectors.length === 0 || vectors.length !== weights.length) {
      return new Float32Array(this.config.dimensions);
    }

    const result = new Float32Array(vectors[0].length);
    let totalWeight = 0;

    for (let j = 0; j < vectors.length; j++) {
      const vector = vectors[j];
      const weight = weights[j];
      totalWeight += weight;

      for (let i = 0; i < vector.length; i++) {
        result[i] += vector[i] * weight;
      }
    }

    if (totalWeight > 0) {
      for (let i = 0; i < result.length; i++) {
        result[i] /= totalWeight;
      }
    }

    return this.normalize(result);
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  private computeCacheKey(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  clearCache(): void {
    this.cache.clear();
    this.emit('cache_cleared');
  }

  getCacheSize(): number {
    return this.cache.size();
  }

  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size(),
      hitRate: 0 // Would need to track hits/misses for accurate rate
    };
  }

  // ==========================================================================
  // Status & Configuration
  // ==========================================================================

  getStatus(): {
    initialized: boolean;
    localAvailable: boolean;
    ollamaAvailable: boolean;
    cacheSize: number;
  } {
    return {
      initialized: this.initialized,
      localAvailable: this.localAvailable,
      ollamaAvailable: this.ollamaAvailable,
      cacheSize: this.cache.size()
    };
  }

  updateConfig(config: Partial<EmbeddingsConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize if provider changed
    if (config.provider || config.localModel || config.ollamaModel) {
      this.initialized = false;
      this.localAvailable = false;
      this.ollamaAvailable = false;
      this.localModel = null;
      this.localModelLoading = null;
    }

    // Resize cache if needed
    if (config.cacheSize && config.cacheSize !== this.cache.size()) {
      const entries = Array.from(this.cache.entries());
      this.cache = new LRUCache(config.cacheSize);
      for (const [key, value] of entries.slice(-config.cacheSize)) {
        this.cache.set(key, value);
      }
    }

    this.emit('config_updated', this.config);
  }

  getConfig(): EmbeddingsConfig {
    return { ...this.config };
  }

  getDimensions(): number {
    return this.config.dimensions;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let embeddingServiceInstance: HybridEmbeddingService | null = null;

export function getEmbeddingService(config?: Partial<EmbeddingsConfig>): HybridEmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new HybridEmbeddingService(config);
  } else if (config) {
    embeddingServiceInstance.updateConfig(config);
  }
  return embeddingServiceInstance;
}

export function resetEmbeddingService(): void {
  if (embeddingServiceInstance) {
    embeddingServiceInstance.clearCache();
    embeddingServiceInstance.removeAllListeners();
  }
  embeddingServiceInstance = null;
}
