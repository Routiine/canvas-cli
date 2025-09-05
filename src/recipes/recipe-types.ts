/**
 * Recipe system types and interfaces
 * Based on goose-cli's recipe system
 */

import { z } from 'zod';

// Parameter types
export enum RecipeParameterInputType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Select = 'select',
  MultiSelect = 'multiselect',
  File = 'file',
  Directory = 'directory'
}

export enum RecipeParameterRequirement {
  Required = 'required',
  Optional = 'optional',
  UserPrompt = 'user_prompt'
}

// Zod schemas for validation
export const RecipeParameterSchema = z.object({
  key: z.string().min(1),
  input_type: z.nativeEnum(RecipeParameterInputType),
  requirement: z.nativeEnum(RecipeParameterRequirement),
  description: z.string(),
  default: z.string().optional(),
  options: z.array(z.string()).optional(), // For select/multiselect
  validation: z.object({
    pattern: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional()
  }).optional()
});

export const RecipeSchema = z.object({
  version: z.string().default('1.0.0'),
  title: z.string().min(1),
  description: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  prompt: z.string().optional(),
  system_prompt: z.string().optional(),
  parameters: z.array(RecipeParameterSchema).optional(),
  tools: z.array(z.string()).optional(), // Tool names to enable
  model_preferences: z.object({
    preferred_models: z.array(z.string()).optional(),
    min_context_length: z.number().optional(),
    requires_tools: z.boolean().optional()
  }).optional(),
  execution: z.object({
    max_iterations: z.number().optional(),
    timeout: z.number().optional(),
    parallel: z.boolean().optional()
  }).optional(),
  examples: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.string()),
    expected_output: z.string().optional()
  })).optional()
});

// TypeScript types derived from schemas
export type RecipeParameter = z.infer<typeof RecipeParameterSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;

export interface RecipeExecutionContext {
  recipe: Recipe;
  parameters: Record<string, string>;
  recipePath: string;
  recipeDir: string;
  workingDir: string;
  timestamp: Date;
}

export interface RecipeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  tokensUsed?: number;
  parameters: Record<string, string>;
}

export interface RecipeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingParameters: string[];
  extraParameters: string[];
}

export interface RecipeSearchResult {
  name: string;
  path: string;
  recipe: Recipe;
  score: number; // Relevance score for search
}

export interface RecipeLibrary {
  name: string;
  path: string;
  recipes: Map<string, Recipe>;
  lastScanned: Date;
}

// Built-in parameter constants
export const BUILT_IN_RECIPE_DIR_PARAM = 'recipe_dir';
export const BUILT_IN_WORKING_DIR_PARAM = 'working_dir';
export const BUILT_IN_TIMESTAMP_PARAM = 'timestamp';
export const BUILT_IN_USER_PARAM = 'user';

export const RECIPE_FILE_EXTENSIONS = ['.yaml', '.yml', '.json'] as const;
export type RecipeFileExtension = typeof RECIPE_FILE_EXTENSIONS[number];

// Helper functions for recipe management
export function isValidRecipeExtension(extension: string): extension is RecipeFileExtension {
  return RECIPE_FILE_EXTENSIONS.includes(extension as RecipeFileExtension);
}

export function getRecipeFileName(name: string, extension: RecipeFileExtension = '.yaml'): string {
  return name.endsWith('.yaml') || name.endsWith('.yml') || name.endsWith('.json') 
    ? name 
    : name + extension;
}

export function extractRecipeName(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  return fileName.replace(/\.(yaml|yml|json)$/, '');
}

export function validateParameterValue(
  parameter: RecipeParameter, 
  value: string
): { valid: boolean; error?: string; convertedValue?: any } {
  // Type conversion and validation
  switch (parameter.input_type) {
    case RecipeParameterInputType.Number:
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: `Invalid number: ${value}` };
      }
      if (parameter.validation?.min !== undefined && num < parameter.validation.min) {
        return { valid: false, error: `Number must be >= ${parameter.validation.min}` };
      }
      if (parameter.validation?.max !== undefined && num > parameter.validation.max) {
        return { valid: false, error: `Number must be <= ${parameter.validation.max}` };
      }
      return { valid: true, convertedValue: num };

    case RecipeParameterInputType.Boolean:
      const bool = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
      return { valid: true, convertedValue: bool };

    case RecipeParameterInputType.Select:
      if (parameter.options && !parameter.options.includes(value)) {
        return { 
          valid: false, 
          error: `Invalid option. Must be one of: ${parameter.options.join(', ')}` 
        };
      }
      return { valid: true, convertedValue: value };

    case RecipeParameterInputType.MultiSelect:
      const values = value.split(',').map(v => v.trim());
      if (parameter.options) {
        const invalid = values.filter(v => !parameter.options!.includes(v));
        if (invalid.length > 0) {
          return { 
            valid: false, 
            error: `Invalid options: ${invalid.join(', ')}. Must be from: ${parameter.options.join(', ')}` 
          };
        }
      }
      return { valid: true, convertedValue: values };

    case RecipeParameterInputType.String:
    default:
      if (parameter.validation?.minLength && value.length < parameter.validation.minLength) {
        return { valid: false, error: `String must be at least ${parameter.validation.minLength} characters` };
      }
      if (parameter.validation?.maxLength && value.length > parameter.validation.maxLength) {
        return { valid: false, error: `String must be at most ${parameter.validation.maxLength} characters` };
      }
      if (parameter.validation?.pattern) {
        const regex = new RegExp(parameter.validation.pattern);
        if (!regex.test(value)) {
          return { valid: false, error: `String does not match required pattern` };
        }
      }
      return { valid: true, convertedValue: value };
  }
}