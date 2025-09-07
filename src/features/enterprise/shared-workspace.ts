/**
 * Shared Workspace Management System for Canvas CLI
 * Provides collaborative workspaces with real-time synchronization
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { User } from './multi-user-system.js';
import { rbacSystem } from './rbac-system.js';

export interface Workspace {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: WorkspaceMember[];
  projects: Project[];
  settings: WorkspaceSettings;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastAccessedAt: Date;
    size: number; // in bytes
    fileCount: number;
  };
  status: 'active' | 'archived' | 'deleted';
  tags: string[];
}

export interface WorkspaceMember {
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  permissions: Set<string>;
  joinedAt: Date;
  lastActiveAt: Date;
  invitedBy?: string;
  status: 'active' | 'invited' | 'suspended';
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  path: string;
  ownerId: string;
  collaborators: ProjectCollaborator[];
  files: ProjectFile[];
  settings: ProjectSettings;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastModifiedBy: string;
    version: string;
    language?: string;
    framework?: string;
  };
  status: 'active' | 'archived' | 'locked';
}

export interface ProjectCollaborator {
  userId: string;
  permissions: Set<string>;
  addedAt: Date;
  addedBy: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content?: string;
  size: number;
  mimeType: string;
  metadata: {
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
    version: number;
  };
  locks?: FileLock[];
}

export interface FileLock {
  userId: string;
  lockedAt: Date;
  expiresAt: Date;
  type: 'exclusive' | 'shared';
}

export interface WorkspaceSettings {
  visibility: 'public' | 'private' | 'team';
  allowGuestAccess: boolean;
  requireApproval: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
  maxFileSize: number; // in MB
  allowedFileTypes: string[];
  versionControl: {
    enabled: boolean;
    provider: 'git' | 'internal';
    autoCommit: boolean;
  };
  collaboration: {
    realTimeSync: boolean;
    conflictResolution: 'manual' | 'auto-merge' | 'last-write-wins';
    presenceIndicators: boolean;
    cursors: boolean;
  };
}

export interface ProjectSettings {
  autoFormat: boolean;
  linting: boolean;
  testing: {
    enabled: boolean;
    onSave: boolean;
    coverage: boolean;
  };
  deployment: {
    enabled: boolean;
    target?: string;
    autoDeploy: boolean;
  };
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  token: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface WorkspaceActivity {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export class SharedWorkspaceManager extends EventEmitter {
  private workspaces: Map<string, Workspace> = new Map();
  private projects: Map<string, Project> = new Map();
  private files: Map<string, ProjectFile> = new Map();
  private invites: Map<string, WorkspaceInvite> = new Map();
  private activities: Map<string, WorkspaceActivity[]> = new Map();
  private activeUsers: Map<string, Set<string>> = new Map(); // workspaceId -> Set<userId>
  private fileLocks: Map<string, FileLock> = new Map();

  constructor() {
    super();
    this.startLockCleanup();
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(
    name: string,
    description: string,
    ownerId: string,
    settings?: Partial<WorkspaceSettings>
  ): Promise<Workspace> {
    const workspace: Workspace = {
      id: uuidv4(),
      name,
      description,
      ownerId,
      members: [{
        userId: ownerId,
        role: 'owner',
        permissions: new Set(['*']),
        joinedAt: new Date(),
        lastActiveAt: new Date(),
        status: 'active'
      }],
      projects: [],
      settings: {
        visibility: 'private',
        allowGuestAccess: false,
        requireApproval: true,
        autoSave: true,
        autoSaveInterval: 30,
        maxFileSize: 100,
        allowedFileTypes: ['*'],
        versionControl: {
          enabled: true,
          provider: 'git',
          autoCommit: false
        },
        collaboration: {
          realTimeSync: true,
          conflictResolution: 'auto-merge',
          presenceIndicators: true,
          cursors: true
        },
        ...settings
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        size: 0,
        fileCount: 0
      },
      status: 'active',
      tags: []
    };

    this.workspaces.set(workspace.id, workspace);
    this.activities.set(workspace.id, []);
    this.activeUsers.set(workspace.id, new Set());

    // Log activity
    this.logActivity(workspace.id, ownerId, 'workspace.created', 'workspace', workspace.id);

    // Assign workspace role
    await rbacSystem.assignRole(ownerId, 'owner', 'system', workspace.id);

    this.emit('workspace:created', workspace);
    return workspace;
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get user's workspaces
   */
  getUserWorkspaces(userId: string): Workspace[] {
    return Array.from(this.workspaces.values()).filter(workspace =>
      workspace.members.some(member => member.userId === userId && member.status === 'active')
    );
  }

  /**
   * Update workspace
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    updates: Partial<Workspace>
  ): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    // Check permissions
    const hasPermission = await this.checkWorkspacePermission(userId, workspaceId, 'update');
    if (!hasPermission) return false;

    // Apply updates
    if (updates.name) workspace.name = updates.name;
    if (updates.description) workspace.description = updates.description;
    if (updates.settings) workspace.settings = { ...workspace.settings, ...updates.settings };
    if (updates.tags) workspace.tags = updates.tags;

    workspace.metadata.updatedAt = new Date();

    // Log activity
    this.logActivity(workspaceId, userId, 'workspace.updated', 'workspace', workspaceId, updates);

    this.emit('workspace:updated', workspace);
    return true;
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    // Only owner can delete
    if (workspace.ownerId !== userId) return false;

    // Mark as deleted (soft delete)
    workspace.status = 'deleted';

    // Remove all projects
    workspace.projects.forEach(project => {
      this.projects.delete(project.id);
    });

    // Log activity
    this.logActivity(workspaceId, userId, 'workspace.deleted', 'workspace', workspaceId);

    this.emit('workspace:deleted', workspaceId);
    return true;
  }

  /**
   * Invite user to workspace
   */
  async inviteToWorkspace(
    workspaceId: string,
    email: string,
    role: 'admin' | 'editor' | 'viewer',
    invitedBy: string
  ): Promise<WorkspaceInvite> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    // Check permissions
    const hasPermission = await this.checkWorkspacePermission(invitedBy, workspaceId, 'share');
    if (!hasPermission) throw new Error('Permission denied');

    const invite: WorkspaceInvite = {
      id: uuidv4(),
      workspaceId,
      email,
      role,
      invitedBy,
      invitedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      token: crypto.randomBytes(32).toString('hex'),
      status: 'pending'
    };

    this.invites.set(invite.id, invite);

    // Log activity
    this.logActivity(workspaceId, invitedBy, 'member.invited', 'invite', invite.id, { email, role });

    this.emit('workspace:invite:sent', invite);
    return invite;
  }

  /**
   * Accept workspace invite
   */
  async acceptInvite(token: string, userId: string): Promise<boolean> {
    const invite = Array.from(this.invites.values()).find(i => i.token === token);
    if (!invite || invite.status !== 'pending') return false;

    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      return false;
    }

    const workspace = this.workspaces.get(invite.workspaceId);
    if (!workspace) return false;

    // Add member to workspace
    const member: WorkspaceMember = {
      userId,
      role: invite.role,
      permissions: this.getRolePermissions(invite.role),
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      invitedBy: invite.invitedBy,
      status: 'active'
    };

    workspace.members.push(member);
    invite.status = 'accepted';

    // Assign role in RBAC
    await rbacSystem.assignRole(userId, invite.role, invite.invitedBy, workspace.id);

    // Log activity
    this.logActivity(workspace.id, userId, 'member.joined', 'member', userId);

    this.emit('workspace:member:added', { workspace, member });
    return true;
  }

  /**
   * Remove member from workspace
   */
  async removeMember(workspaceId: string, userId: string, removedBy: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    // Check permissions
    const hasPermission = await this.checkWorkspacePermission(removedBy, workspaceId, 'manage');
    if (!hasPermission) return false;

    // Cannot remove owner
    if (userId === workspace.ownerId) return false;

    // Remove member
    workspace.members = workspace.members.filter(m => m.userId !== userId);

    // Revoke role in RBAC
    await rbacSystem.revokeRole(userId, 'viewer', workspaceId);
    await rbacSystem.revokeRole(userId, 'editor', workspaceId);
    await rbacSystem.revokeRole(userId, 'admin', workspaceId);

    // Log activity
    this.logActivity(workspaceId, removedBy, 'member.removed', 'member', userId);

    this.emit('workspace:member:removed', { workspaceId, userId });
    return true;
  }

  /**
   * Create project in workspace
   */
  async createProject(
    workspaceId: string,
    name: string,
    description: string,
    path: string,
    ownerId: string,
    settings?: Partial<ProjectSettings>
  ): Promise<Project> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    // Check permissions
    const hasPermission = await this.checkWorkspacePermission(ownerId, workspaceId, 'create');
    if (!hasPermission) throw new Error('Permission denied');

    const project: Project = {
      id: uuidv4(),
      workspaceId,
      name,
      description,
      path,
      ownerId,
      collaborators: [{
        userId: ownerId,
        permissions: new Set(['*']),
        addedAt: new Date(),
        addedBy: ownerId
      }],
      files: [],
      settings: {
        autoFormat: true,
        linting: true,
        testing: {
          enabled: true,
          onSave: false,
          coverage: true
        },
        deployment: {
          enabled: false,
          autoDeploy: false
        },
        ...settings
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        lastModifiedBy: ownerId,
        version: '1.0.0'
      },
      status: 'active'
    };

    this.projects.set(project.id, project);
    workspace.projects.push(project);

    // Log activity
    this.logActivity(workspaceId, ownerId, 'project.created', 'project', project.id);

    this.emit('project:created', project);
    return project;
  }

  /**
   * Get project by ID
   */
  getProject(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<Project>
  ): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) return false;

    // Check permissions
    const hasPermission = await this.checkProjectPermission(userId, projectId, 'update');
    if (!hasPermission) return false;

    // Apply updates
    if (updates.name) project.name = updates.name;
    if (updates.description) project.description = updates.description;
    if (updates.settings) project.settings = { ...project.settings, ...updates.settings };

    project.metadata.updatedAt = new Date();
    project.metadata.lastModifiedBy = userId;

    // Log activity
    this.logActivity(project.workspaceId, userId, 'project.updated', 'project', projectId, updates);

    this.emit('project:updated', project);
    return true;
  }

  /**
   * Add collaborator to project
   */
  async addCollaborator(
    projectId: string,
    userId: string,
    addedBy: string,
    permissions: string[]
  ): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) return false;

    // Check permissions
    const hasPermission = await this.checkProjectPermission(addedBy, projectId, 'share');
    if (!hasPermission) return false;

    // Check if already collaborator
    if (project.collaborators.some(c => c.userId === userId)) return false;

    const collaborator: ProjectCollaborator = {
      userId,
      permissions: new Set(permissions),
      addedAt: new Date(),
      addedBy
    };

    project.collaborators.push(collaborator);

    // Log activity
    this.logActivity(project.workspaceId, addedBy, 'collaborator.added', 'project', projectId, { userId });

    this.emit('project:collaborator:added', { project, collaborator });
    return true;
  }

  /**
   * Lock file for editing
   */
  async lockFile(fileId: string, userId: string, type: 'exclusive' | 'shared' = 'exclusive'): Promise<boolean> {
    const file = this.files.get(fileId);
    if (!file) return false;

    // Check for existing locks
    const existingLock = this.fileLocks.get(fileId);
    if (existingLock) {
      if (existingLock.type === 'exclusive') return false;
      if (type === 'exclusive') return false;
    }

    const lock: FileLock = {
      userId,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      type
    };

    this.fileLocks.set(fileId, lock);
    
    if (!file.locks) file.locks = [];
    file.locks.push(lock);

    this.emit('file:locked', { fileId, userId, type });
    return true;
  }

  /**
   * Unlock file
   */
  async unlockFile(fileId: string, userId: string): Promise<boolean> {
    const lock = this.fileLocks.get(fileId);
    if (!lock || lock.userId !== userId) return false;

    this.fileLocks.delete(fileId);

    const file = this.files.get(fileId);
    if (file && file.locks) {
      file.locks = file.locks.filter(l => l.userId !== userId);
    }

    this.emit('file:unlocked', { fileId, userId });
    return true;
  }

  /**
   * Join workspace (for presence)
   */
  joinWorkspace(workspaceId: string, userId: string): void {
    if (!this.activeUsers.has(workspaceId)) {
      this.activeUsers.set(workspaceId, new Set());
    }
    
    this.activeUsers.get(workspaceId)!.add(userId);
    
    // Update member's last active time
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      const member = workspace.members.find(m => m.userId === userId);
      if (member) {
        member.lastActiveAt = new Date();
      }
      workspace.metadata.lastAccessedAt = new Date();
    }

    this.emit('workspace:user:joined', { workspaceId, userId });
  }

  /**
   * Leave workspace (for presence)
   */
  leaveWorkspace(workspaceId: string, userId: string): void {
    const users = this.activeUsers.get(workspaceId);
    if (users) {
      users.delete(userId);
    }

    this.emit('workspace:user:left', { workspaceId, userId });
  }

  /**
   * Get active users in workspace
   */
  getActiveUsers(workspaceId: string): string[] {
    const users = this.activeUsers.get(workspaceId);
    return users ? Array.from(users) : [];
  }

  /**
   * Get workspace activities
   */
  getActivities(workspaceId: string, limit: number = 100): WorkspaceActivity[] {
    const activities = this.activities.get(workspaceId) || [];
    return activities.slice(-limit);
  }

  /**
   * Search workspaces
   */
  searchWorkspaces(query: string, userId?: string): Workspace[] {
    const lowerQuery = query.toLowerCase();
    let workspaces = Array.from(this.workspaces.values());

    // Filter by user if specified
    if (userId) {
      workspaces = workspaces.filter(w => 
        w.members.some(m => m.userId === userId)
      );
    }

    // Search by name, description, or tags
    return workspaces.filter(w =>
      w.name.toLowerCase().includes(lowerQuery) ||
      w.description.toLowerCase().includes(lowerQuery) ||
      w.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Helper: Check workspace permission
   */
  private async checkWorkspacePermission(
    userId: string,
    workspaceId: string,
    action: string
  ): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    // Owner has all permissions
    if (workspace.ownerId === userId) return true;

    // Check member permissions
    const member = workspace.members.find(m => m.userId === userId);
    if (!member) return false;

    // Check with RBAC system
    const result = await rbacSystem.checkPermission({
      userId,
      resource: 'workspace',
      action,
      context: { workspaceId, ownerId: workspace.ownerId }
    });

    return result.granted;
  }

  /**
   * Helper: Check project permission
   */
  private async checkProjectPermission(
    userId: string,
    projectId: string,
    action: string
  ): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) return false;

    // Owner has all permissions
    if (project.ownerId === userId) return true;

    // Check collaborator permissions
    const collaborator = project.collaborators.find(c => c.userId === userId);
    if (collaborator && collaborator.permissions.has(action)) return true;

    // Check with RBAC system
    const result = await rbacSystem.checkPermission({
      userId,
      resource: 'project',
      action,
      context: { projectId, ownerId: project.ownerId }
    });

    return result.granted;
  }

  /**
   * Helper: Get role permissions
   */
  private getRolePermissions(role: string): Set<string> {
    switch (role) {
      case 'admin':
        return new Set(['read', 'write', 'update', 'delete', 'share', 'manage']);
      case 'editor':
        return new Set(['read', 'write', 'update']);
      case 'viewer':
        return new Set(['read']);
      default:
        return new Set(['read']);
    }
  }

  /**
   * Helper: Log activity
   */
  private logActivity(
    workspaceId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    details?: Record<string, any>
  ): void {
    const activity: WorkspaceActivity = {
      id: uuidv4(),
      workspaceId,
      userId,
      action,
      resource,
      resourceId,
      details,
      timestamp: new Date()
    };

    if (!this.activities.has(workspaceId)) {
      this.activities.set(workspaceId, []);
    }

    const activities = this.activities.get(workspaceId)!;
    activities.push(activity);

    // Keep only last 1000 activities per workspace
    if (activities.length > 1000) {
      activities.splice(0, activities.length - 1000);
    }

    this.emit('activity:logged', activity);
  }

  /**
   * Clean up expired locks
   */
  private startLockCleanup(): void {
    setInterval(() => {
      const now = new Date();
      
      for (const [fileId, lock] of this.fileLocks) {
        if (lock.expiresAt < now) {
          this.unlockFile(fileId, lock.userId);
        }
      }
    }, 60000); // Check every minute
  }
}

// Export singleton instance
export const sharedWorkspaceManager = new SharedWorkspaceManager();