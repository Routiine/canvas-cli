/**
 * Recipe manager for loading, validating, and executing recipes
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import * as os from 'os';
import { glob } from 'glob';
import inquirer from 'inquirer';

import type {
  Recipe,
  RecipeParameter,
  RecipeExecutionContext,
  RecipeExecutionResult,
  RecipeValidationResult,
  RecipeSearchResult,
  RecipeLibrary} from './recipe-types.js';
import {
  RecipeParameterRequirement,
  RecipeSchema,
  BUILT_IN_RECIPE_DIR_PARAM,
  BUILT_IN_WORKING_DIR_PARAM,
  BUILT_IN_TIMESTAMP_PARAM,
  BUILT_IN_USER_PARAM,
  RECIPE_FILE_EXTENSIONS,
  isValidRecipeExtension,
  getRecipeFileName,
  extractRecipeName,
  validateParameterValue
} from './recipe-types.js';

export class RecipeManager {
  private libraries: Map<string, RecipeLibrary> = new Map();
  private templateEnvironment: nunjucks.Environment;
  private builtInRecipesDir: string;
  private userRecipesDir: string;

  constructor() {
    // Set up template environment
    this.templateEnvironment = nunjucks.configure({ autoescape: false });
    this.templateEnvironment.addFilter('upper', (str: string) => str.toUpperCase());
    this.templateEnvironment.addFilter('lower', (str: string) => str.toLowerCase());
    this.templateEnvironment.addFilter('title', (str: string) => 
      str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
    );

    // Set up directories
    this.builtInRecipesDir = path.join(__dirname, '..', '..', 'recipes');
    this.userRecipesDir = path.join(os.homedir(), '.canvas-cli', 'recipes');
    
    void this.initializeRecipeDirectories();
  }

  /**
   * Initialize recipe directories and load built-in recipes
   */
  private async initializeRecipeDirectories(): Promise<void> {
    try {
      // Ensure user recipes directory exists
      await fs.ensureDir(this.userRecipesDir);

      // Load built-in recipes
      if (await fs.pathExists(this.builtInRecipesDir)) {
        await this.addLibrary('built-in', this.builtInRecipesDir);
      }

      // Load user recipes
      await this.addLibrary('user', this.userRecipesDir);

      // Create some example recipes if user directory is empty
      await this.createExampleRecipes();
    } catch (error) {
      console.warn('Failed to initialize recipe directories:', error);
    }
  }

  /**
   * Add a recipe library
   */
  async addLibrary(name: string, libraryPath: string): Promise<void> {
    try {
      if (!await fs.pathExists(libraryPath)) {
        console.warn(`Recipe library path does not exist: ${libraryPath}`);
        return;
      }

      const library: RecipeLibrary = {
        name,
        path: libraryPath,
        recipes: new Map(),
        lastScanned: new Date()
      };

      await this.scanLibrary(library);
      this.libraries.set(name, library);
      
      console.log(`Added recipe library '${name}' with ${library.recipes.size} recipes`);
    } catch (error) {
      console.error(`Failed to add recipe library '${name}':`, error);
    }
  }

  /**
   * Scan a library for recipes
   */
  private async scanLibrary(library: RecipeLibrary): Promise<void> {
    const patterns = RECIPE_FILE_EXTENSIONS.map(ext => 
      path.join(library.path, '**', `*${ext}`)
    );

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, { nodir: true });
      files.push(...matches);
    }

    library.recipes.clear();

    for (const file of files) {
      try {
        const recipe = await this.loadRecipeFromFile(file);
        const name = extractRecipeName(path.relative(library.path, file));
        library.recipes.set(name, recipe);
      } catch (error) {
        console.warn(`Failed to load recipe from ${file}:`, error);
      }
    }

    library.lastScanned = new Date();
  }

  /**
   * Load a recipe from file
   */
  private async loadRecipeFromFile(filePath: string): Promise<Recipe> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);

    let parsed: any;
    if (ext === '.json') {
      parsed = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      parsed = yaml.load(content);
    } else {
      throw new Error(`Unsupported recipe file extension: ${ext}`);
    }

    // Validate against schema
    const result = RecipeSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid recipe format: ${result.error.message}`);
    }

    return result.data;
  }

  /**
   * Load a recipe by name
   */
  async loadRecipe(recipeName: string): Promise<Recipe | null> {
    // Try exact match first
    for (const library of this.libraries.values()) {
      const recipe = library.recipes.get(recipeName);
      if (recipe) {
        return recipe;
      }
    }

    // Try with file extensions
    for (const ext of RECIPE_FILE_EXTENSIONS) {
      const nameWithExt = recipeName.endsWith(ext) ? recipeName : recipeName + ext;
      for (const library of this.libraries.values()) {
        const recipe = library.recipes.get(extractRecipeName(nameWithExt));
        if (recipe) {
          return recipe;
        }
      }
    }

    return null;
  }

  /**
   * Load and render a recipe with parameters
   */
  async loadAndRenderRecipe(
    recipeName: string,
    parameters: Array<{ key: string; value: string }> = [],
    options: {
      enableUserPrompt?: boolean;
      workingDir?: string;
    } = {}
  ): Promise<RecipeExecutionContext> {
    const recipe = await this.loadRecipe(recipeName);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeName}`);
    }

    // Find recipe path
    let recipePath = '';
    let recipeDir = '';
    for (const library of this.libraries.values()) {
      if (library.recipes.has(recipeName) || library.recipes.has(extractRecipeName(recipeName))) {
        recipePath = path.join(library.path, getRecipeFileName(recipeName));
        recipeDir = library.path;
        break;
      }
    }

    // Validate recipe parameters
    const validation = this.validateRecipe(recipe, parameters.map(p => p.key));
    if (!validation.valid) {
      throw new Error(`Recipe validation failed: ${validation.errors.join(', ')}`);
    }

    // Build parameter map
    const parameterMap = await this.buildParameterMap(
      recipe,
      parameters,
      recipeDir,
      options.enableUserPrompt || false
    );

    // Add built-in parameters
    parameterMap.set(BUILT_IN_RECIPE_DIR_PARAM, recipeDir);
    parameterMap.set(BUILT_IN_WORKING_DIR_PARAM, options.workingDir || process.cwd());
    parameterMap.set(BUILT_IN_TIMESTAMP_PARAM, new Date().toISOString());
    parameterMap.set(BUILT_IN_USER_PARAM, os.userInfo().username);

    // Render recipe with parameters
    const renderedRecipe = await this.renderRecipe(recipe, parameterMap);

    return {
      recipe: renderedRecipe,
      parameters: Object.fromEntries(parameterMap),
      recipePath,
      recipeDir,
      workingDir: options.workingDir || process.cwd(),
      timestamp: new Date()
    };
  }

  /**
   * Validate a recipe
   */
  validateRecipe(recipe: Recipe, providedParameters: string[] = []): RecipeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingParameters: string[] = [];
    const extraParameters: string[] = [];

    // Check for required parameters
    const recipeParams = recipe.parameters || [];
    const requiredParams = recipeParams
      .filter(p => p.requirement === RecipeParameterRequirement.Required)
      .map(p => p.key);

    const providedSet = new Set(providedParameters);
    const requiredSet = new Set(requiredParams);
    const recipeParamSet = new Set(recipeParams.map(p => p.key));

    // Find missing required parameters
    for (const required of requiredParams) {
      if (!providedSet.has(required)) {
        missingParameters.push(required);
      }
    }

    // Find extra parameters
    for (const provided of providedParameters) {
      if (!recipeParamSet.has(provided)) {
        extraParameters.push(provided);
      }
    }

    // Check for optional parameters without defaults
    const optionalWithoutDefaults = recipeParams
      .filter(p => 
        p.requirement === RecipeParameterRequirement.Optional && 
        !p.default &&
        !providedSet.has(p.key)
      )
      .map(p => p.key);

    if (optionalWithoutDefaults.length > 0) {
      warnings.push(`Optional parameters without defaults: ${optionalWithoutDefaults.join(', ')}`);
    }

    if (missingParameters.length > 0) {
      errors.push(`Missing required parameters: ${missingParameters.join(', ')}`);
    }

    if (extraParameters.length > 0) {
      warnings.push(`Extra parameters provided: ${extraParameters.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingParameters,
      extraParameters
    };
  }

  /**
   * Search recipes
   */
  searchRecipes(query: string, options: {
    tags?: string[];
    author?: string;
    fuzzy?: boolean;
  } = {}): RecipeSearchResult[] {
    const results: RecipeSearchResult[] = [];

    for (const [libraryName, library] of this.libraries) {
      for (const [recipeName, recipe] of library.recipes) {
        let score = 0;

        // Title match (highest weight)
        if (recipe.title.toLowerCase().includes(query.toLowerCase())) {
          score += 10;
        }

        // Description match
        if (recipe.description.toLowerCase().includes(query.toLowerCase())) {
          score += 5;
        }

        // Tag match
        if (recipe.tags) {
          for (const tag of recipe.tags) {
            if (tag.toLowerCase().includes(query.toLowerCase())) {
              score += 3;
            }
          }
        }

        // Name match
        if (recipeName.toLowerCase().includes(query.toLowerCase())) {
          score += 7;
        }

        // Filter by options
        if (options.tags && recipe.tags) {
          const hasRequiredTag = options.tags.some(tag => 
            recipe.tags!.some(recipeTag => recipeTag.toLowerCase() === tag.toLowerCase())
          );
          if (!hasRequiredTag) score = 0;
        }

        if (options.author && recipe.author !== options.author) {
          score = 0;
        }

        if (score > 0) {
          results.push({
            name: recipeName,
            path: path.join(library.path, getRecipeFileName(recipeName)),
            recipe,
            score
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * List all recipes
   */
  listRecipes(libraryName?: string): Array<{ name: string; library: string; recipe: Recipe }> {
    const results: Array<{ name: string; library: string; recipe: Recipe }> = [];

    const libraries = libraryName 
      ? (this.libraries.has(libraryName) ? [this.libraries.get(libraryName)!] : [])
      : Array.from(this.libraries.values());

    for (const library of libraries) {
      for (const [recipeName, recipe] of library.recipes) {
        results.push({
          name: recipeName,
          library: library.name,
          recipe
        });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Refresh all libraries
   */
  async refreshLibraries(): Promise<void> {
    for (const library of this.libraries.values()) {
      await this.scanLibrary(library);
    }
  }

  /**
   * Save a recipe
   */
  async saveRecipe(
    name: string, 
    recipe: Recipe, 
    libraryName = 'user',
    format: 'yaml' | 'json' = 'yaml'
  ): Promise<void> {
    const library = this.libraries.get(libraryName);
    if (!library) {
      throw new Error(`Library not found: ${libraryName}`);
    }

    const ext = format === 'json' ? '.json' : '.yaml';
    const fileName = getRecipeFileName(name, ext);
    const filePath = path.join(library.path, fileName);

    // Validate recipe
    const validation = RecipeSchema.safeParse(recipe);
    if (!validation.success) {
      throw new Error(`Invalid recipe: ${validation.error.message}`);
    }

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(validation.data, null, 2);
    } else {
      content = yaml.dump(validation.data, { indent: 2, lineWidth: -1 });
    }

    await fs.writeFile(filePath, content, 'utf-8');
    
    // Update library
    library.recipes.set(extractRecipeName(name), validation.data);
    
    console.log(`Saved recipe: ${name} to ${filePath}`);
  }

  // Private helper methods

  private async buildParameterMap(
    recipe: Recipe,
    parameters: Array<{ key: string; value: string }>,
    recipeDir: string,
    enableUserPrompt: boolean
  ): Promise<Map<string, string>> {
    const paramMap = new Map<string, string>();
    
    // Add provided parameters
    for (const param of parameters) {
      paramMap.set(param.key, param.value);
    }

    // Handle recipe parameters
    const recipeParams = recipe.parameters || [];
    
    for (const param of recipeParams) {
      if (!paramMap.has(param.key)) {
        if (param.default) {
          paramMap.set(param.key, param.default);
        } else if (param.requirement === RecipeParameterRequirement.UserPrompt && enableUserPrompt) {
          const promptConfig: any = {
            type: this.getInquirerType(param),
            name: 'value',
            message: `${param.key}: ${param.description}`,
            validate: (value: unknown) => {
              const validation = validateParameterValue(param, String(value));
              return validation.valid || validation.error || 'Invalid value';
            }
          };
          
          if (param.options) {
            promptConfig.choices = param.options;
          }
          
          const answer = await inquirer.prompt([promptConfig]);
          paramMap.set(param.key, String(answer.value));
        }
      }
    }

    return paramMap;
  }

  private async renderRecipe(recipe: Recipe, parameters: Map<string, string>): Promise<Recipe> {
    const paramObj = Object.fromEntries(parameters);
    
    // Render string fields
    const rendered = { ...recipe };
    
    if (recipe.instructions) {
      rendered.instructions = this.templateEnvironment.renderString(recipe.instructions, paramObj);
    }
    
    if (recipe.prompt) {
      rendered.prompt = this.templateEnvironment.renderString(recipe.prompt, paramObj);
    }
    
    if (recipe.system_prompt) {
      rendered.system_prompt = this.templateEnvironment.renderString(recipe.system_prompt, paramObj);
    }

    return rendered;
  }

  private getInquirerType(param: RecipeParameter): "number" | "search" | "checkbox" | "confirm" | "editor" | "expand" | "input" | "password" | "rawlist" | "list" | "select" {
    switch (param.input_type) {
      case 'boolean': return 'confirm';
      case 'select': return 'list';
      case 'multiselect': return 'checkbox';
      case 'number': return 'input';
      default: return 'input';
    }
  }

  private async createExampleRecipes(): Promise<void> {
    // Only create if user directory is empty
    const userLibrary = this.libraries.get('user');
    if (!userLibrary || userLibrary.recipes.size > 0) {
      return;
    }

    const exampleRecipes = [
      {
        name: 'code-review',
        recipe: {
          version: '1.0.0',
          title: 'Code Review Assistant',
          description: 'Review code for best practices, bugs, and improvements',
          author: 'Canvas CLI',
          tags: ['code', 'review', 'development'],
          system_prompt: 'You are an expert code reviewer. Provide constructive feedback on code quality, potential bugs, and improvements.',
          prompt: 'Please review the following {{ language }} code:\n\n{{ code }}\n\nProvide feedback on:\n1. Code quality and readability\n2. Potential bugs or issues\n3. Performance improvements\n4. Best practices',
          parameters: [
            {
              key: 'language',
              input_type: 'select',
              requirement: 'required',
              description: 'Programming language',
              options: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Rust', 'Go']
            },
            {
              key: 'code',
              input_type: 'string',
              requirement: 'user_prompt',
              description: 'Code to review'
            }
          ]
        }
      },
      {
        name: 'documentation',
        recipe: {
          version: '1.0.0',
          title: 'Documentation Generator',
          description: 'Generate documentation for code or projects',
          author: 'Canvas CLI',
          tags: ['documentation', 'markdown', 'development'],
          system_prompt: 'You are a technical writer. Create clear, comprehensive documentation.',
          prompt: 'Generate {{ doc_type }} documentation for:\n\n{{ content }}\n\nInclude:\n- Clear explanations\n- Usage examples\n- Best practices{% if include_installation %}\n- Installation instructions{% endif %}',
          parameters: [
            {
              key: 'doc_type',
              input_type: 'select',
              requirement: 'required',
              description: 'Type of documentation',
              options: ['API', 'User Guide', 'README', 'Tutorial'],
              default: 'README'
            },
            {
              key: 'content',
              input_type: 'string',
              requirement: 'user_prompt',
              description: 'Content to document'
            },
            {
              key: 'include_installation',
              input_type: 'boolean',
              requirement: 'optional',
              description: 'Include installation instructions',
              default: 'true'
            }
          ]
        }
      }
    ];

    for (const { name, recipe } of exampleRecipes) {
      try {
        await this.saveRecipe(name, recipe as Recipe, 'user', 'yaml');
      } catch (error) {
        console.warn(`Failed to create example recipe ${name}:`, error);
      }
    }
  }

  /**
   * Load all recipe libraries
   */
  public async loadLibraries(): Promise<void> {
    await this.initializeRecipeDirectories();
  }

  /**
   * List all recipes from all libraries with paths
   */
  public async listRecipesWithPaths(category?: string): Promise<Array<{name: string, path: string, recipe: Recipe}>> {
    const results: Array<{name: string, path: string, recipe: Recipe}> = [];
    
    for (const [libraryName, library] of this.libraries) {
      if (category && !libraryName.includes(category)) continue;
      
      for (const [recipeName, recipe] of library.recipes) {
        results.push({
          name: recipeName,
          path: path.join(library.path, recipeName),
          recipe
        });
      }
    }
    
    return results;
  }

  /**
   * Find a specific recipe by name
   */
  public async findRecipe(recipeName: string): Promise<Recipe | null> {
    for (const library of this.libraries.values()) {
      if (library.recipes.has(recipeName)) {
        return library.recipes.get(recipeName) || null;
      }
      
      // Try with .yaml extension
      if (library.recipes.has(`${recipeName}.yaml`)) {
        return library.recipes.get(`${recipeName}.yaml`) || null;
      }
    }
    
    return null;
  }

  /**
   * Execute a recipe with parameters
   */
  public async executeRecipe(recipeName: string, parameters: Record<string, string>): Promise<RecipeExecutionResult> {
    const recipe = await this.findRecipe(recipeName);
    
    if (!recipe) {
      return {
        success: false,
        output: '',
        error: `Recipe '${recipeName}' not found`,
        duration: 0,
        parameters
      };
    }
    
    const paramMap = new Map(Object.entries(parameters));
    
    // Render the recipe with parameters
    const renderedRecipe = await this.renderRecipe(recipe, paramMap);
    
    // For now, just return the rendered prompt as output
    // In a real implementation, this would execute the recipe through the AI model
    return {
      success: true,
      output: renderedRecipe.prompt || 'Recipe executed successfully',
      duration: 0,
      parameters
    };
  }

  /**
   * Render a template string with parameters
   */
  public async renderTemplate(template: string, context: Record<string, any>): Promise<string> {
    return this.templateEnvironment.renderString(template, context);
  }
}

// Export singleton instance
export const recipeManager = new RecipeManager();