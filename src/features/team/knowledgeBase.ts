import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: 'command' | 'snippet' | 'procedure' | 'troubleshooting' | 'reference' | 'best_practice';
  category: string;
  tags: string[];
  metadata: {
    created: number;
    updated: number;
    author: string;
    version: string;
    language?: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  };
  access: {
    visibility: 'public' | 'team' | 'private';
    permissions: {
      read: string[]; // user/role IDs
      write: string[];
      admin: string[];
    };
  };
  usage: {
    views: number;
    likes: number;
    dislikes: number;
    copies: number;
    lastAccessed?: number;
  };
  relations: {
    dependencies: string[]; // related item IDs
    references: string[];
    alternatives: string[];
  };
  validation: {
    tested: boolean;
    testedDate?: number;
    testedBy?: string;
    platforms: string[];
    verified: boolean;
  };
}

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  items: string[]; // item IDs
  metadata: {
    created: number;
    updated: number;
    owner: string;
    collaborators: string[];
    version: string;
  };
  settings: {
    visibility: 'public' | 'team' | 'private';
    allowContributions: boolean;
    requireApproval: boolean;
    autoSync: boolean;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'contributor' | 'viewer';
  permissions: {
    create: boolean;
    edit: boolean;
    delete: boolean;
    moderate: boolean;
    admin: boolean;
  };
  expertise: string[];
  status: 'active' | 'inactive' | 'invited';
  joinedDate: number;
}

export interface SearchQuery {
  text?: string;
  type?: KnowledgeItem['type'];
  category?: string;
  tags?: string[];
  author?: string;
  difficulty?: KnowledgeItem['metadata']['difficulty'];
  dateRange?: { from: number; to: number };
  verified?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  item: KnowledgeItem;
  relevanceScore: number;
  matchedFields: string[];
  snippet: string;
}

export interface KnowledgeConfig {
  teamId: string;
  syncEnabled: boolean;
  cacheEnabled: boolean;
  autoSuggest: boolean;
  requireApproval: boolean;
  maxItemSize: number;
  backupEnabled: boolean;
  analyticsEnabled: boolean;
}

class TeamKnowledgeBase extends EventEmitter {
  private knowledgeItems: Map<string, KnowledgeItem> = new Map();
  private collections: Map<string, KnowledgeCollection> = new Map();
  private teamMembers: Map<string, TeamMember> = new Map();
  private config: KnowledgeConfig;
  private currentUser: string;
  private searchIndex: Map<string, Set<string>> = new Map(); // word -> item IDs
  private pendingApprovals: Map<string, KnowledgeItem> = new Map();

  constructor(teamId: string = 'default-team', currentUser: string = 'default-user') {
    super();
    this.currentUser = currentUser;
    this.config = {
      teamId,
      syncEnabled: true,
      cacheEnabled: true,
      autoSuggest: true,
      requireApproval: false,
      maxItemSize: 100000, // 100KB
      backupEnabled: true,
      analyticsEnabled: true
    };

    this.initializeDefaultContent();
  }

  /**
   * Initialize with default knowledge content
   */
  private initializeDefaultContent(): void {
    const defaultItems: Omit<KnowledgeItem, 'id'>[] = [
      {
        title: 'Git Best Practices',
        content: `# Git Best Practices

## Commit Messages
- Use imperative mood: "Add feature" not "Added feature"
- Keep first line under 50 characters
- Separate subject from body with blank line
- Use body to explain what and why, not how

## Branching Strategy
- Use feature branches for new features
- Keep master/main branch stable
- Use descriptive branch names: feature/user-auth, fix/login-bug

## Common Commands
\`\`\`bash
# Create and switch to new branch
git checkout -b feature/new-feature

# Stage and commit changes
git add .
git commit -m "Add user authentication"

# Push branch to remote
git push -u origin feature/new-feature

# Merge branch (after PR approval)
git checkout main
git merge feature/new-feature
git branch -d feature/new-feature
\`\`\``,
        type: 'best_practice',
        category: 'version-control',
        tags: ['git', 'best-practices', 'workflow'],
        metadata: {
          created: Date.now(),
          updated: Date.now(),
          author: 'system',
          version: '1.0',
          difficulty: 'beginner'
        },
        access: {
          visibility: 'public',
          permissions: {
            read: ['*'],
            write: ['admin', 'contributor'],
            admin: ['admin']
          }
        },
        usage: {
          views: 0,
          likes: 0,
          dislikes: 0,
          copies: 0
        },
        relations: {
          dependencies: [],
          references: [],
          alternatives: []
        },
        validation: {
          tested: true,
          testedDate: Date.now(),
          testedBy: 'system',
          platforms: ['linux', 'macos', 'windows'],
          verified: true
        }
      },
      {
        title: 'Docker Container Debugging',
        content: `# Docker Container Debugging

## Common Debug Commands
\`\`\`bash
# List running containers
docker ps

# View container logs
docker logs <container-id>

# Execute command in running container
docker exec -it <container-id> /bin/bash

# Inspect container configuration
docker inspect <container-id>

# View container resource usage
docker stats <container-id>

# Copy files from container
docker cp <container-id>:/path/to/file ./local-path
\`\`\`

## Troubleshooting Steps
1. Check container status with \`docker ps -a\`
2. Review logs with \`docker logs\`
3. Verify port mappings and network configuration
4. Check resource limits and usage
5. Validate volume mounts and permissions`,
        type: 'troubleshooting',
        category: 'containers',
        tags: ['docker', 'debugging', 'containers', 'troubleshooting'],
        metadata: {
          created: Date.now(),
          updated: Date.now(),
          author: 'system',
          version: '1.0',
          difficulty: 'intermediate'
        },
        access: {
          visibility: 'public',
          permissions: {
            read: ['*'],
            write: ['admin', 'contributor'],
            admin: ['admin']
          }
        },
        usage: {
          views: 0,
          likes: 0,
          dislikes: 0,
          copies: 0
        },
        relations: {
          dependencies: [],
          references: [],
          alternatives: []
        },
        validation: {
          tested: true,
          testedDate: Date.now(),
          testedBy: 'system',
          platforms: ['linux', 'macos', 'windows'],
          verified: true
        }
      }
    ];

    defaultItems.forEach(item => {
      const id = crypto.randomUUID();
      this.knowledgeItems.set(id, { ...item, id });
      this.indexItem({ ...item, id });
    });

    this.emit('initialized', { itemCount: this.knowledgeItems.size });
  }

  /**
   * Create a new knowledge item
   */
  public async createItem(
    itemData: Omit<KnowledgeItem, 'id' | 'metadata' | 'usage' | 'validation'>
  ): Promise<string> {
    const id = crypto.randomUUID();
    const item: KnowledgeItem = {
      ...itemData,
      id,
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        author: this.currentUser,
        version: '1.0',
        difficulty: 'beginner'
      },
      usage: {
        views: 0,
        likes: 0,
        dislikes: 0,
        copies: 0
      },
      validation: {
        tested: false,
        platforms: [],
        verified: false
      }
    };

    // Check permissions
    if (!this.canCreate()) {
      throw new Error('Insufficient permissions to create knowledge items');
    }

    // Check item size
    if (JSON.stringify(item).length > this.config.maxItemSize) {
      throw new Error(`Item exceeds maximum size of ${this.config.maxItemSize} bytes`);
    }

    // Handle approval workflow
    if (this.config.requireApproval && !this.isAdmin()) {
      this.pendingApprovals.set(id, item);
      this.emit('approval:required', { item, author: this.currentUser });
      return id;
    }

    this.knowledgeItems.set(id, item);
    this.indexItem(item);
    this.emit('item:created', item);

    return id;
  }

  /**
   * Update an existing knowledge item
   */
  public async updateItem(id: string, updates: Partial<KnowledgeItem>): Promise<boolean> {
    const existingItem = this.knowledgeItems.get(id);
    if (!existingItem) {
      throw new Error(`Knowledge item ${id} not found`);
    }

    // Check permissions
    if (!this.canEdit(existingItem)) {
      throw new Error('Insufficient permissions to edit this item');
    }

    const updatedItem: KnowledgeItem = {
      ...existingItem,
      ...updates,
      id, // Ensure ID doesn't change
      metadata: {
        ...existingItem.metadata,
        ...updates.metadata,
        updated: Date.now(),
        version: this.incrementVersion(existingItem.metadata.version)
      }
    };

    this.knowledgeItems.set(id, updatedItem);
    this.reindexItem(existingItem, updatedItem);
    this.emit('item:updated', { old: existingItem, new: updatedItem });

    return true;
  }

  /**
   * Delete a knowledge item
   */
  public async deleteItem(id: string): Promise<boolean> {
    const item = this.knowledgeItems.get(id);
    if (!item) {
      return false;
    }

    // Check permissions
    if (!this.canDelete(item)) {
      throw new Error('Insufficient permissions to delete this item');
    }

    this.knowledgeItems.delete(id);
    this.removeFromIndex(item);
    this.emit('item:deleted', item);

    return true;
  }

  /**
   * Search knowledge base
   */
  public search(query: SearchQuery): SearchResult[] {
    let items = Array.from(this.knowledgeItems.values());

    // Filter by permissions
    items = items.filter(item => this.canRead(item));

    // Apply filters
    if (query.type) {
      items = items.filter(item => item.type === query.type);
    }
    if (query.category) {
      items = items.filter(item => item.category === query.category);
    }
    if (query.tags && query.tags.length > 0) {
      items = items.filter(item => 
        query.tags!.some(tag => item.tags.includes(tag))
      );
    }
    if (query.author) {
      items = items.filter(item => item.metadata.author === query.author);
    }
    if (query.difficulty) {
      items = items.filter(item => item.metadata.difficulty === query.difficulty);
    }
    if (query.verified !== undefined) {
      items = items.filter(item => item.validation.verified === query.verified);
    }
    if (query.dateRange) {
      items = items.filter(item => 
        item.metadata.created >= query.dateRange!.from &&
        item.metadata.created <= query.dateRange!.to
      );
    }

    // Text search
    let results: SearchResult[] = [];
    if (query.text) {
      results = this.performTextSearch(query.text, items);
    } else {
      results = items.map(item => ({
        item,
        relevanceScore: 1.0,
        matchedFields: [],
        snippet: this.generateSnippet(item.content)
      }));
    }

    // Sort by relevance and usage
    results.sort((a, b) => {
      const scoreA = a.relevanceScore + (a.item.usage.likes * 0.1) + (a.item.usage.views * 0.01);
      const scoreB = b.relevanceScore + (b.item.usage.likes * 0.1) + (b.item.usage.views * 0.01);
      return scoreB - scoreA;
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    results = results.slice(offset, offset + limit);

    this.emit('search:performed', { query, resultCount: results.length });
    return results;
  }

  /**
   * Get knowledge item by ID
   */
  public getItem(id: string): KnowledgeItem | null {
    const item = this.knowledgeItems.get(id);
    if (!item || !this.canRead(item)) {
      return null;
    }

    // Update usage statistics
    item.usage.views++;
    item.usage.lastAccessed = Date.now();
    this.emit('item:accessed', item);

    return item;
  }

  /**
   * Like/dislike an item
   */
  public rateItem(id: string, rating: 'like' | 'dislike'): boolean {
    const item = this.knowledgeItems.get(id);
    if (!item || !this.canRead(item)) {
      return false;
    }

    if (rating === 'like') {
      item.usage.likes++;
    } else {
      item.usage.dislikes++;
    }

    this.emit('item:rated', { item, rating, user: this.currentUser });
    return true;
  }

  /**
   * Copy/bookmark an item
   */
  public copyItem(id: string): boolean {
    const item = this.knowledgeItems.get(id);
    if (!item || !this.canRead(item)) {
      return false;
    }

    item.usage.copies++;
    this.emit('item:copied', { item, user: this.currentUser });
    return true;
  }

  /**
   * Create a knowledge collection
   */
  public createCollection(
    name: string,
    description: string,
    settings: Partial<KnowledgeCollection['settings']> = {}
  ): string {
    const id = crypto.randomUUID();
    const collection: KnowledgeCollection = {
      id,
      name,
      description,
      items: [],
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        owner: this.currentUser,
        collaborators: [],
        version: '1.0'
      },
      settings: {
        visibility: 'team',
        allowContributions: true,
        requireApproval: false,
        autoSync: true,
        ...settings
      }
    };

    this.collections.set(id, collection);
    this.emit('collection:created', collection);
    return id;
  }

  /**
   * Add item to collection
   */
  public addToCollection(collectionId: string, itemId: string): boolean {
    const collection = this.collections.get(collectionId);
    const item = this.knowledgeItems.get(itemId);

    if (!collection || !item) {
      return false;
    }

    if (!this.canEditCollection(collection)) {
      throw new Error('Insufficient permissions to edit this collection');
    }

    if (!collection.items.includes(itemId)) {
      collection.items.push(itemId);
      collection.metadata.updated = Date.now();
      this.emit('collection:item_added', { collection, item });
    }

    return true;
  }

  /**
   * Get suggestions based on current context
   */
  public getSuggestions(context: {
    command?: string;
    error?: string;
    project?: string;
    language?: string;
    tags?: string[];
  }): KnowledgeItem[] {
    if (!this.config.autoSuggest) {
      return [];
    }

    let suggestions: Array<{ item: KnowledgeItem; score: number }> = [];
    
    for (const item of this.knowledgeItems.values()) {
      if (!this.canRead(item)) continue;

      let score = 0;

      // Context matching
      if (context.command && item.content.toLowerCase().includes(context.command.toLowerCase())) {
        score += 0.8;
      }
      if (context.error && item.type === 'troubleshooting') {
        score += 0.7;
      }
      if (context.language && item.metadata.language === context.language) {
        score += 0.6;
      }
      if (context.tags) {
        const matchingTags = context.tags.filter(tag => item.tags.includes(tag));
        score += matchingTags.length * 0.3;
      }

      // Boost popular items
      score += Math.min(item.usage.likes * 0.1, 0.5);
      score += Math.min(item.usage.views * 0.01, 0.3);

      if (score > 0.3) {
        suggestions.push({ item, score });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    const results = suggestions.slice(0, 5).map(s => s.item);

    this.emit('suggestions:generated', { context, suggestions: results });
    return results;
  }

  /**
   * Approve pending item
   */
  public approveItem(id: string): boolean {
    const item = this.pendingApprovals.get(id);
    if (!item || !this.isAdmin()) {
      return false;
    }

    this.knowledgeItems.set(id, item);
    this.indexItem(item);
    this.pendingApprovals.delete(id);
    
    this.emit('item:approved', item);
    return true;
  }

  /**
   * Reject pending item
   */
  public rejectItem(id: string, reason: string): boolean {
    const item = this.pendingApprovals.get(id);
    if (!item || !this.isAdmin()) {
      return false;
    }

    this.pendingApprovals.delete(id);
    this.emit('item:rejected', { item, reason });
    return true;
  }

  /**
   * Get pending approvals
   */
  public getPendingApprovals(): KnowledgeItem[] {
    if (!this.isAdmin()) {
      return [];
    }
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Export knowledge base
   */
  public exportData(): string {
    const exportData = {
      version: '1.0.0',
      timestamp: Date.now(),
      items: Array.from(this.knowledgeItems.values()),
      collections: Array.from(this.collections.values()),
      teamMembers: Array.from(this.teamMembers.values()),
      config: this.config
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import knowledge base data
   */
  public importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);

      if (data.items) {
        for (const item of data.items) {
          this.knowledgeItems.set(item.id, item);
          this.indexItem(item);
        }
      }

      if (data.collections) {
        for (const collection of data.collections) {
          this.collections.set(collection.id, collection);
        }
      }

      if (data.teamMembers) {
        for (const member of data.teamMembers) {
          this.teamMembers.set(member.id, member);
        }
      }

      this.emit('data:imported', { 
        itemCount: data.items?.length || 0,
        collectionCount: data.collections?.length || 0 
      });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'import', error });
      return false;
    }
  }

  /**
   * Perform text search
   */
  private performTextSearch(query: string, items: KnowledgeItem[]): SearchResult[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    const results: SearchResult[] = [];

    for (const item of items) {
      const searchText = [
        item.title,
        item.content,
        ...item.tags,
        item.category
      ].join(' ').toLowerCase();

      let relevanceScore = 0;
      const matchedFields: string[] = [];

      // Title matches (higher weight)
      if (item.title.toLowerCase().includes(query.toLowerCase())) {
        relevanceScore += 2.0;
        matchedFields.push('title');
      }

      // Content matches
      for (const word of queryWords) {
        const wordCount = (searchText.match(new RegExp(word, 'g')) || []).length;
        relevanceScore += wordCount * 0.1;
        if (wordCount > 0) {
          matchedFields.push('content');
        }
      }

      // Tag exact matches
      const matchingTags = item.tags.filter(tag => 
        queryWords.some(word => tag.toLowerCase().includes(word))
      );
      relevanceScore += matchingTags.length * 0.5;
      if (matchingTags.length > 0) {
        matchedFields.push('tags');
      }

      if (relevanceScore > 0) {
        results.push({
          item,
          relevanceScore,
          matchedFields: [...new Set(matchedFields)],
          snippet: this.generateSnippet(item.content, queryWords)
        });
      }
    }

    return results;
  }

  /**
   * Generate content snippet
   */
  private generateSnippet(content: string, queryWords?: string[]): string {
    const maxLength = 200;
    
    if (!queryWords || queryWords.length === 0) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    // Find best position that includes query words
    const lowerContent = content.toLowerCase();
    let bestPosition = 0;
    let bestScore = 0;

    for (let i = 0; i < content.length - maxLength; i += 50) {
      const section = lowerContent.substring(i, i + maxLength);
      let score = 0;
      
      for (const word of queryWords) {
        score += (section.match(new RegExp(word, 'g')) || []).length;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestPosition = i;
      }
    }

    const snippet = content.substring(bestPosition, bestPosition + maxLength);
    return (bestPosition > 0 ? '...' : '') + snippet + 
           (bestPosition + maxLength < content.length ? '...' : '');
  }

  /**
   * Index item for search
   */
  private indexItem(item: KnowledgeItem): void {
    const words = this.extractWords(item);
    
    for (const word of words) {
      if (!this.searchIndex.has(word)) {
        this.searchIndex.set(word, new Set());
      }
      this.searchIndex.get(word)!.add(item.id);
    }
  }

  /**
   * Remove item from search index
   */
  private removeFromIndex(item: KnowledgeItem): void {
    const words = this.extractWords(item);
    
    for (const word of words) {
      const itemSet = this.searchIndex.get(word);
      if (itemSet) {
        itemSet.delete(item.id);
        if (itemSet.size === 0) {
          this.searchIndex.delete(word);
        }
      }
    }
  }

  /**
   * Reindex item (remove old, add new)
   */
  private reindexItem(oldItem: KnowledgeItem, newItem: KnowledgeItem): void {
    this.removeFromIndex(oldItem);
    this.indexItem(newItem);
  }

  /**
   * Extract searchable words from item
   */
  private extractWords(item: KnowledgeItem): string[] {
    const text = [
      item.title,
      item.content,
      ...item.tags,
      item.category,
      item.type
    ].join(' ').toLowerCase();

    return text.split(/\W+/).filter(word => word.length > 2);
  }

  /**
   * Check if user can create items
   */
  private canCreate(): boolean {
    const member = this.teamMembers.get(this.currentUser);
    return member ? member.permissions.create : true;
  }

  /**
   * Check if user can read item
   */
  private canRead(item: KnowledgeItem): boolean {
    if (item.access.visibility === 'public') return true;
    if (item.metadata.author === this.currentUser) return true;
    
    const member = this.teamMembers.get(this.currentUser);
    if (member?.permissions.admin) return true;

    return item.access.permissions.read.includes(this.currentUser) ||
           item.access.permissions.read.includes('*');
  }

  /**
   * Check if user can edit item
   */
  private canEdit(item: KnowledgeItem): boolean {
    if (item.metadata.author === this.currentUser) return true;
    
    const member = this.teamMembers.get(this.currentUser);
    if (member?.permissions.edit || member?.permissions.admin) return true;

    return item.access.permissions.write.includes(this.currentUser);
  }

  /**
   * Check if user can delete item
   */
  private canDelete(item: KnowledgeItem): boolean {
    if (item.metadata.author === this.currentUser) return true;
    
    const member = this.teamMembers.get(this.currentUser);
    if (member?.permissions.delete || member?.permissions.admin) return true;

    return item.access.permissions.admin.includes(this.currentUser);
  }

  /**
   * Check if user can edit collection
   */
  private canEditCollection(collection: KnowledgeCollection): boolean {
    if (collection.metadata.owner === this.currentUser) return true;
    
    const member = this.teamMembers.get(this.currentUser);
    if (member?.permissions.admin) return true;

    return collection.metadata.collaborators.includes(this.currentUser);
  }

  /**
   * Check if user is admin
   */
  private isAdmin(): boolean {
    const member = this.teamMembers.get(this.currentUser);
    return member ? member.permissions.admin : true;
  }

  /**
   * Increment version string
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0] || '1'}.${parts[1] || '0'}.${patch}`;
  }

  /**
   * Get all categories
   */
  public getCategories(): string[] {
    const categories = new Set<string>();
    for (const item of this.knowledgeItems.values()) {
      categories.add(item.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all tags
   */
  public getTags(): string[] {
    const tags = new Set<string>();
    for (const item of this.knowledgeItems.values()) {
      for (const tag of item.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get usage statistics
   */
  public getUsageStats(): {
    totalItems: number;
    totalViews: number;
    totalLikes: number;
    topCategories: Array<{ category: string; count: number }>;
    topTags: Array<{ tag: string; count: number }>;
    recentActivity: Array<{ item: KnowledgeItem; activity: string; timestamp: number }>;
  } {
    const items = Array.from(this.knowledgeItems.values());
    const totalItems = items.length;
    const totalViews = items.reduce((sum, item) => sum + item.usage.views, 0);
    const totalLikes = items.reduce((sum, item) => sum + item.usage.likes, 0);

    const categoryCount = new Map<string, number>();
    const tagCount = new Map<string, number>();

    for (const item of items) {
      categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
      for (const tag of item.tags) {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      }
    }

    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topTags = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const recentActivity = items
      .filter(item => item.usage.lastAccessed)
      .sort((a, b) => (b.usage.lastAccessed || 0) - (a.usage.lastAccessed || 0))
      .slice(0, 10)
      .map(item => ({
        item,
        activity: 'viewed',
        timestamp: item.usage.lastAccessed || 0
      }));

    return {
      totalItems,
      totalViews,
      totalLikes,
      topCategories,
      topTags,
      recentActivity
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<KnowledgeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): KnowledgeConfig {
    return { ...this.config };
  }
}

let knowledgeBaseInstance: TeamKnowledgeBase | null = null;

export function getTeamKnowledgeBase(teamId?: string, currentUser?: string): TeamKnowledgeBase {
  if (!knowledgeBaseInstance) {
    knowledgeBaseInstance = new TeamKnowledgeBase(teamId, currentUser);
  }
  return knowledgeBaseInstance;
}

export default TeamKnowledgeBase;