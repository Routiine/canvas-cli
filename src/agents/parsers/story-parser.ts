/**
 * Story Parser System
 * Parses and extracts user stories from various text formats
 */

import { z } from 'zod';
import chalk from 'chalk';

// Parsed Story Schema
export const ParsedStorySchema = z.object({
  title: z.string(),
  type: z.enum(['feature', 'bug', 'technical', 'spike', 'debt']).optional(),
  asA: z.string().optional(),
  iWant: z.string().optional(),
  soThat: z.string().optional(),
  narrative: z.string().optional(),
  acceptanceCriteria: z.array(z.object({
    given: z.string(),
    when: z.string(),
    then: z.string()
  })).optional(),
  priority: z.string().optional(),
  complexity: z.string().optional(),
  confidence: z.number().optional(),
  tags: z.array(z.string()).optional(),
  raw: z.string()
});

export type ParsedStory = z.infer<typeof ParsedStorySchema>;

/**
 * Story Parser Implementation
 */
export class StoryParser {
  // Regex patterns for story extraction
  private patterns = {
    userStory: /As (?:a|an) ([^,]+),?\s*I want ([^,]+),?\s*(?:so that|because) (.+)/i,
    givenWhenThen: /Given ([^,]+),?\s*[Ww]hen ([^,]+),?\s*[Tt]hen (.+)/i,
    acceptanceCriteria: /(?:AC|Acceptance Criteria|Criteria):?\s*(.+)/i,
    storyPoints: /(?:SP|Story Points?|Points?|Estimate):?\s*(\d+)/i,
    priority: /(?:Priority|P):?\s*(Critical|High|Medium|Low|P\d)/i,
    type: /(?:Type|Category):?\s*(Feature|Bug|Technical|Spike|Tech Debt)/i,
    title: /(?:Title|Story|Name):?\s*(.+)/i,
    tags: /(?:Tags?|Labels?):?\s*(.+)/i,
    epic: /(?:Epic|Parent):?\s*(.+)/i,
    dependencies: /(?:Depends on|Blocked by|Dependencies):?\s*(.+)/i
  };
  
  /**
   * Parse text to extract user stories
   */
  async parse(text: string): Promise<ParsedStory[]> {
    console.log(chalk.dim('  📖 Parsing user stories from text...'));
    
    const stories: ParsedStory[] = [];
    
    // Try different parsing strategies
    const strategies = [
      this.parseStructuredFormat.bind(this),
      this.parseUserStoryFormat.bind(this),
      this.parseMarkdownFormat.bind(this),
      this.parseJiraFormat.bind(this),
      this.parseNaturalLanguage.bind(this)
    ];
    
    for (const strategy of strategies) {
      const parsed = await strategy(text);
      if (parsed.length > 0) {
        stories.push(...parsed);
      }
    }
    
    // Deduplicate stories
    const uniqueStories = this.deduplicateStories(stories);
    
    console.log(chalk.dim(`  ✓ Parsed ${uniqueStories.length} unique stories`));
    
    return uniqueStories;
  }
  
  /**
   * Parse structured format (JSON, YAML-like)
   */
  private async parseStructuredFormat(text: string): Promise<ParsedStory[]> {
    const stories: ParsedStory[] = [];
    
    try {
      // Try to parse as JSON
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      
      for (const item of items) {
        if (this.isStoryLike(item)) {
          stories.push(this.normalizeStory(item, text));
        }
      }
    } catch {
      // Not JSON, try YAML-like format
      const blocks = text.split(/\n---\n/);
      for (const block of blocks) {
        const story = this.parseYamlLikeBlock(block);
        if (story) {
          stories.push(story);
        }
      }
    }
    
    return stories;
  }
  
  /**
   * Parse user story format
   */
  private async parseUserStoryFormat(text: string): Promise<ParsedStory[]> {
    const stories: ParsedStory[] = [];
    const lines = text.split('\n');
    
    let currentStory: Partial<ParsedStory> | null = null;
    let acceptanceCriteria: any[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check for user story pattern
      const storyMatch = this.patterns.userStory.exec(trimmedLine);
      if (storyMatch) {
        // Save previous story if exists
        if (currentStory) {
          if (acceptanceCriteria.length > 0) {
            currentStory.acceptanceCriteria = acceptanceCriteria;
          }
          stories.push(this.finalizeStory(currentStory, text));
          acceptanceCriteria = [];
        }
        
        currentStory = {
          asA: storyMatch[1].trim(),
          iWant: storyMatch[2].trim(),
          soThat: storyMatch[3].trim(),
          title: `${storyMatch[2].trim()}`
        };
        continue;
      }
      
      // Check for acceptance criteria
      const gwt = this.patterns.givenWhenThen.exec(trimmedLine);
      if (gwt && currentStory) {
        acceptanceCriteria.push({
          given: gwt[1].trim(),
          when: gwt[2].trim(),
          then: gwt[3].trim()
        });
        continue;
      }
      
      // Check for other attributes
      if (currentStory) {
        this.parseAttributes(trimmedLine, currentStory);
      }
    }
    
    // Save last story
    if (currentStory) {
      if (acceptanceCriteria.length > 0) {
        currentStory.acceptanceCriteria = acceptanceCriteria;
      }
      stories.push(this.finalizeStory(currentStory, text));
    }
    
    return stories;
  }
  
  /**
   * Parse markdown format
   */
  private async parseMarkdownFormat(text: string): Promise<ParsedStory[]> {
    const stories: ParsedStory[] = [];
    
    // Split by headers
    const sections = text.split(/^#{1,3}\s+/m);
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      const lines = section.split('\n');
      const title = lines[0]?.trim();
      
      if (!title) continue;
      
      const story: Partial<ParsedStory> = { title };
      
      // Parse content
      const content = lines.slice(1).join('\n');
      
      // Look for user story format
      const storyMatch = this.patterns.userStory.exec(content);
      if (storyMatch) {
        story.asA = storyMatch[1].trim();
        story.iWant = storyMatch[2].trim();
        story.soThat = storyMatch[3].trim();
      }
      
      // Look for acceptance criteria in list format
      const acMatches = content.matchAll(/[-*]\s*Given ([^,]+),?\s*[Ww]hen ([^,]+),?\s*[Tt]hen (.+)/g);
      const criteria = [];
      for (const match of acMatches) {
        criteria.push({
          given: match[1].trim(),
          when: match[2].trim(),
          then: match[3].trim()
        });
      }
      if (criteria.length > 0) {
        story.acceptanceCriteria = criteria;
      }
      
      // Parse other attributes from content
      this.parseAttributesFromContent(content, story);
      
      if (story.title) {
        stories.push(this.finalizeStory(story, section));
      }
    }
    
    return stories;
  }
  
  /**
   * Parse Jira-like format
   */
  private async parseJiraFormat(text: string): Promise<ParsedStory[]> {
    const stories: ParsedStory[] = [];
    
    // Look for Jira-style formatting
    const issueBlocks = text.split(/(?:^|\n)(?:[A-Z]+-\d+|Issue|Story|Task):/gm);
    
    for (const block of issueBlocks) {
      if (!block.trim()) continue;
      
      const story: Partial<ParsedStory> = {};
      const lines = block.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Parse field:value pairs
        const fieldMatch = /^([^:]+):\s*(.+)$/.exec(trimmedLine);
        if (fieldMatch) {
          const field = fieldMatch[1].toLowerCase();
          const value = fieldMatch[2];
          
          switch (field) {
            case 'summary':
            case 'title':
              story.title = value;
              break;
            case 'description':
              story.narrative = value;
              // Try to extract user story from description
              const storyMatch = this.patterns.userStory.exec(value);
              if (storyMatch) {
                story.asA = storyMatch[1].trim();
                story.iWant = storyMatch[2].trim();
                story.soThat = storyMatch[3].trim();
              }
              break;
            case 'type':
            case 'issue type':
              story.type = this.normalizeType(value);
              break;
            case 'priority':
              story.priority = value;
              break;
            case 'story points':
            case 'estimate':
              story.complexity = value;
              break;
            case 'labels':
            case 'tags':
              story.tags = value.split(/[,;]/).map(t => t.trim());
              break;
          }
        }
      }
      
      if (story.title || story.narrative) {
        stories.push(this.finalizeStory(story, block));
      }
    }
    
    return stories;
  }
  
  /**
   * Parse natural language format
   */
  private async parseNaturalLanguage(text: string): Promise<ParsedStory[]> {
    const stories: ParsedStory[] = [];
    
    // Split by common delimiters
    const chunks = text.split(/(?:\n\n|\n-{3,}\n|\n={3,}\n)/);
    
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      
      const story: Partial<ParsedStory> = {};
      
      // Try to extract title (first line or sentence)
      const lines = chunk.split('\n');
      const firstLine = lines[0]?.trim();
      
      if (firstLine && firstLine.length < 100) {
        story.title = firstLine;
      }
      
      // Look for user story pattern anywhere in the chunk
      const storyMatch = this.patterns.userStory.exec(chunk);
      if (storyMatch) {
        story.asA = storyMatch[1].trim();
        story.iWant = storyMatch[2].trim();
        story.soThat = storyMatch[3].trim();
        
        if (!story.title) {
          story.title = story.iWant;
        }
      }
      
      // Look for acceptance criteria
      const criteria = this.extractAcceptanceCriteria(chunk);
      if (criteria.length > 0) {
        story.acceptanceCriteria = criteria;
      }
      
      // Parse other attributes
      this.parseAttributesFromContent(chunk, story);
      
      // Set narrative to the full chunk if no specific format found
      if (!story.narrative && !story.asA) {
        story.narrative = chunk;
      }
      
      if (story.title || story.narrative || story.asA) {
        stories.push(this.finalizeStory(story, chunk));
      }
    }
    
    return stories;
  }
  
  /**
   * Parse YAML-like block
   */
  private parseYamlLikeBlock(block: string): ParsedStory | null {
    const story: Partial<ParsedStory> = {};
    const lines = block.split('\n');
    
    for (const line of lines) {
      const match = /^(\w+):\s*(.+)$/.exec(line.trim());
      if (match) {
        const key = match[1].toLowerCase();
        const value = match[2].trim();
        
        switch (key) {
          case 'title':
          case 'story':
            story.title = value;
            break;
          case 'as':
          case 'asa':
            story.asA = value;
            break;
          case 'iwant':
          case 'want':
            story.iWant = value;
            break;
          case 'sothat':
          case 'because':
            story.soThat = value;
            break;
          case 'type':
            story.type = this.normalizeType(value);
            break;
          case 'priority':
            story.priority = value;
            break;
          case 'complexity':
          case 'points':
            story.complexity = value;
            break;
        }
      }
    }
    
    if (story.title || story.asA) {
      return this.finalizeStory(story, block);
    }
    
    return null;
  }
  
  /**
   * Parse attributes from a line
   */
  private parseAttributes(line: string, story: Partial<ParsedStory>): void {
    // Check for priority
    const priorityMatch = this.patterns.priority.exec(line);
    if (priorityMatch) {
      story.priority = priorityMatch[1];
    }
    
    // Check for type
    const typeMatch = this.patterns.type.exec(line);
    if (typeMatch) {
      story.type = this.normalizeType(typeMatch[1]);
    }
    
    // Check for story points
    const pointsMatch = this.patterns.storyPoints.exec(line);
    if (pointsMatch) {
      story.complexity = pointsMatch[1];
    }
    
    // Check for tags
    const tagsMatch = this.patterns.tags.exec(line);
    if (tagsMatch) {
      story.tags = tagsMatch[1].split(/[,;]/).map(t => t.trim());
    }
    
    // Check for title
    if (!story.title) {
      const titleMatch = this.patterns.title.exec(line);
      if (titleMatch) {
        story.title = titleMatch[1];
      }
    }
  }
  
  /**
   * Parse attributes from content block
   */
  private parseAttributesFromContent(content: string, story: Partial<ParsedStory>): void {
    const lines = content.split('\n');
    for (const line of lines) {
      this.parseAttributes(line, story);
    }
  }
  
  /**
   * Extract acceptance criteria from text
   */
  private extractAcceptanceCriteria(text: string): any[] {
    const criteria = [];
    
    // Look for Given-When-Then patterns
    const gwtMatches = text.matchAll(this.patterns.givenWhenThen);
    for (const match of gwtMatches) {
      criteria.push({
        given: match[1].trim(),
        when: match[2].trim(),
        then: match[3].trim()
      });
    }
    
    // Look for numbered or bulleted criteria after "Acceptance Criteria" header
    const acMatch = this.patterns.acceptanceCriteria.exec(text);
    if (acMatch) {
      const acText = acMatch[1];
      const acLines = acText.split(/\n/).filter(line => line.trim());
      
      for (const line of acLines) {
        const gwt = this.patterns.givenWhenThen.exec(line);
        if (gwt) {
          criteria.push({
            given: gwt[1].trim(),
            when: gwt[2].trim(),
            then: gwt[3].trim()
          });
        }
      }
    }
    
    return criteria;
  }
  
  /**
   * Check if object looks like a story
   */
  private isStoryLike(obj: any): boolean {
    return obj && (
      obj.title ||
      obj.story ||
      obj.description ||
      obj.asA ||
      obj.iWant ||
      (obj.as && obj.want)
    );
  }
  
  /**
   * Normalize story object
   */
  private normalizeStory(obj: any, raw: string): ParsedStory {
    return {
      title: obj.title || obj.story || obj.summary || 'Untitled',
      type: this.normalizeType(obj.type || obj.issueType),
      asA: obj.asA || obj.as || obj.persona,
      iWant: obj.iWant || obj.want || obj.action,
      soThat: obj.soThat || obj.because || obj.value,
      narrative: obj.narrative || obj.description,
      acceptanceCriteria: obj.acceptanceCriteria || obj.criteria || obj.ac,
      priority: obj.priority,
      complexity: obj.complexity || obj.points || obj.estimate,
      confidence: obj.confidence,
      tags: obj.tags || obj.labels,
      raw
    };
  }
  
  /**
   * Normalize story type
   */
  private normalizeType(type: string | undefined): ParsedStory['type'] | undefined {
    if (!type) return undefined;
    
    const normalized = type.toLowerCase();
    
    if (normalized.includes('bug') || normalized.includes('defect')) {
      return 'bug';
    }
    if (normalized.includes('tech') || normalized.includes('debt')) {
      return 'debt';
    }
    if (normalized.includes('spike') || normalized.includes('research')) {
      return 'spike';
    }
    if (normalized.includes('technical') || normalized.includes('infrastructure')) {
      return 'technical';
    }
    
    return 'feature';
  }
  
  /**
   * Finalize story object
   */
  private finalizeStory(partial: Partial<ParsedStory>, raw: string): ParsedStory {
    // Generate title if missing
    if (!partial.title) {
      if (partial.iWant) {
        partial.title = partial.iWant;
      } else if (partial.narrative) {
        partial.title = partial.narrative.substring(0, 50) + '...';
      } else {
        partial.title = 'Untitled Story';
      }
    }
    
    return {
      title: partial.title,
      type: partial.type,
      asA: partial.asA,
      iWant: partial.iWant,
      soThat: partial.soThat,
      narrative: partial.narrative,
      acceptanceCriteria: partial.acceptanceCriteria,
      priority: partial.priority,
      complexity: partial.complexity,
      confidence: partial.confidence,
      tags: partial.tags,
      raw
    };
  }
  
  /**
   * Deduplicate stories
   */
  private deduplicateStories(stories: ParsedStory[]): ParsedStory[] {
    const seen = new Set<string>();
    const unique: ParsedStory[] = [];
    
    for (const story of stories) {
      // Create a signature for the story
      const signature = `${story.title}|${story.asA}|${story.iWant}|${story.soThat}`;
      
      if (!seen.has(signature)) {
        seen.add(signature);
        unique.push(story);
      }
    }
    
    return unique;
  }
  
  /**
   * Validate parsed story
   */
  validateStory(story: ParsedStory): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!story.title || story.title === 'Untitled Story') {
      errors.push('Story needs a proper title');
    }
    
    if (!story.asA && !story.narrative) {
      errors.push('Story needs either user story format or narrative description');
    }
    
    if (story.asA && (!story.iWant || !story.soThat)) {
      errors.push('Incomplete user story format (missing "I want" or "so that")');
    }
    
    if (story.acceptanceCriteria) {
      for (const ac of story.acceptanceCriteria) {
        if (!ac.given || !ac.when || !ac.then) {
          errors.push('Incomplete acceptance criteria (missing Given, When, or Then)');
          break;
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const storyParser = new StoryParser();