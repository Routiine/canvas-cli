/**
 * Role-Based Access Control (RBAC) System for Canvas CLI
 * Provides fine-grained permission management and role hierarchy
 */

import { EventEmitter } from 'events';
import { User } from './multi-user-system.js';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Set<string>;
  inherits?: string[]; // Role IDs to inherit from
  priority: number; // Higher priority overrides lower
  isSystem: boolean; // System roles cannot be deleted
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  scope?: 'global' | 'workspace' | 'project' | 'personal';
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  type: 'ownership' | 'time' | 'location' | 'attribute';
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  value: any;
}

export interface AccessRequest {
  userId: string;
  resource: string;
  action: string;
  context?: Record<string, any>;
}

export interface AccessResult {
  granted: boolean;
  reason?: string;
  permissions?: string[];
  conditions?: PermissionCondition[];
}

export interface RoleAssignment {
  userId: string;
  roleId: string;
  scope?: string; // workspace/project ID
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
}

export class RBACSystem extends EventEmitter {
  private roles: Map<string, Role> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private roleAssignments: Map<string, RoleAssignment[]> = new Map();
  private permissionCache: Map<string, Set<string>> = new Map();
  private readonly wildcardChar = '*';

  constructor() {
    super();
    this.initializeSystemRoles();
    this.initializeSystemPermissions();
  }

  /**
   * Initialize system roles
   */
  private initializeSystemRoles(): void {
    const systemRoles: Role[] = [
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Full system access',
        permissions: new Set(['*']),
        priority: 100,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'owner',
        name: 'Owner',
        description: 'Full access to owned resources',
        permissions: new Set([
          'workspace.*',
          'project.*',
          'team.manage',
          'billing.manage'
        ]),
        priority: 90,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'manager',
        name: 'Manager',
        description: 'Manage team and projects',
        permissions: new Set([
          'project.create',
          'project.update',
          'project.delete',
          'team.invite',
          'team.remove',
          'workspace.read',
          'workspace.update'
        ]),
        inherits: ['contributor'],
        priority: 70,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'contributor',
        name: 'Contributor',
        description: 'Create and modify content',
        permissions: new Set([
          'project.read',
          'project.write',
          'file.create',
          'file.update',
          'file.delete',
          'agent.execute',
          'recipe.run'
        ]),
        inherits: ['viewer'],
        priority: 50,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access',
        permissions: new Set([
          'project.read',
          'file.read',
          'workspace.read',
          'agent.list',
          'recipe.list'
        ]),
        priority: 30,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'guest',
        name: 'Guest',
        description: 'Limited temporary access',
        permissions: new Set([
          'project.read',
          'file.read'
        ]),
        priority: 10,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    systemRoles.forEach(role => {
      this.roles.set(role.id, role);
    });
  }

  /**
   * Initialize system permissions
   */
  private initializeSystemPermissions(): void {
    const systemPermissions: Permission[] = [
      // Workspace permissions
      { id: 'workspace.create', name: 'Create Workspace', description: 'Create new workspaces', resource: 'workspace', action: 'create' },
      { id: 'workspace.read', name: 'View Workspace', description: 'View workspace details', resource: 'workspace', action: 'read' },
      { id: 'workspace.update', name: 'Update Workspace', description: 'Modify workspace settings', resource: 'workspace', action: 'update' },
      { id: 'workspace.delete', name: 'Delete Workspace', description: 'Delete workspaces', resource: 'workspace', action: 'delete' },
      { id: 'workspace.share', name: 'Share Workspace', description: 'Share workspace with others', resource: 'workspace', action: 'share' },
      
      // Project permissions
      { id: 'project.create', name: 'Create Project', description: 'Create new projects', resource: 'project', action: 'create' },
      { id: 'project.read', name: 'View Project', description: 'View project details', resource: 'project', action: 'read' },
      { id: 'project.write', name: 'Edit Project', description: 'Modify project content', resource: 'project', action: 'write' },
      { id: 'project.update', name: 'Update Project', description: 'Update project settings', resource: 'project', action: 'update' },
      { id: 'project.delete', name: 'Delete Project', description: 'Delete projects', resource: 'project', action: 'delete' },
      { id: 'project.share', name: 'Share Project', description: 'Share project with others', resource: 'project', action: 'share' },
      
      // File permissions
      { id: 'file.create', name: 'Create Files', description: 'Create new files', resource: 'file', action: 'create' },
      { id: 'file.read', name: 'Read Files', description: 'View file contents', resource: 'file', action: 'read' },
      { id: 'file.update', name: 'Update Files', description: 'Modify file contents', resource: 'file', action: 'update' },
      { id: 'file.delete', name: 'Delete Files', description: 'Delete files', resource: 'file', action: 'delete' },
      { id: 'file.execute', name: 'Execute Files', description: 'Run executable files', resource: 'file', action: 'execute' },
      
      // Agent permissions
      { id: 'agent.list', name: 'List Agents', description: 'View available agents', resource: 'agent', action: 'list' },
      { id: 'agent.execute', name: 'Execute Agents', description: 'Run AI agents', resource: 'agent', action: 'execute' },
      { id: 'agent.create', name: 'Create Agents', description: 'Create custom agents', resource: 'agent', action: 'create' },
      { id: 'agent.update', name: 'Update Agents', description: 'Modify agent configurations', resource: 'agent', action: 'update' },
      { id: 'agent.delete', name: 'Delete Agents', description: 'Remove custom agents', resource: 'agent', action: 'delete' },
      
      // Recipe permissions
      { id: 'recipe.list', name: 'List Recipes', description: 'View available recipes', resource: 'recipe', action: 'list' },
      { id: 'recipe.run', name: 'Run Recipes', description: 'Execute recipes', resource: 'recipe', action: 'run' },
      { id: 'recipe.create', name: 'Create Recipes', description: 'Create custom recipes', resource: 'recipe', action: 'create' },
      { id: 'recipe.update', name: 'Update Recipes', description: 'Modify recipe configurations', resource: 'recipe', action: 'update' },
      { id: 'recipe.delete', name: 'Delete Recipes', description: 'Remove custom recipes', resource: 'recipe', action: 'delete' },
      
      // Team permissions
      { id: 'team.invite', name: 'Invite Members', description: 'Invite team members', resource: 'team', action: 'invite' },
      { id: 'team.remove', name: 'Remove Members', description: 'Remove team members', resource: 'team', action: 'remove' },
      { id: 'team.manage', name: 'Manage Team', description: 'Full team management', resource: 'team', action: 'manage' },
      
      // Billing permissions
      { id: 'billing.view', name: 'View Billing', description: 'View billing information', resource: 'billing', action: 'view' },
      { id: 'billing.manage', name: 'Manage Billing', description: 'Manage payment methods and subscriptions', resource: 'billing', action: 'manage' },
      
      // System permissions
      { id: 'system.admin', name: 'System Admin', description: 'Full system administration', resource: 'system', action: 'admin' },
      { id: 'system.audit', name: 'View Audit Logs', description: 'Access audit logs', resource: 'system', action: 'audit' },
      { id: 'system.settings', name: 'Manage Settings', description: 'Configure system settings', resource: 'system', action: 'settings' }
    ];

    systemPermissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });
  }

  /**
   * Check if user has permission
   */
  async checkPermission(request: AccessRequest): Promise<AccessResult> {
    const userRoles = this.getUserRoles(request.userId);
    const userPermissions = this.getUserPermissions(request.userId);
    
    // Check for wildcard admin permission
    if (userPermissions.has('*')) {
      return { granted: true, reason: 'Admin access' };
    }

    // Build permission string
    const permissionString = `${request.resource}.${request.action}`;
    
    // Check exact permission
    if (userPermissions.has(permissionString)) {
      return { granted: true, permissions: [permissionString] };
    }

    // Check wildcard permissions
    const resourceWildcard = `${request.resource}.*`;
    if (userPermissions.has(resourceWildcard)) {
      return { granted: true, permissions: [resourceWildcard] };
    }

    // Check conditional permissions
    const conditionalResult = await this.checkConditionalPermissions(
      request,
      userPermissions
    );
    
    if (conditionalResult.granted) {
      return conditionalResult;
    }

    // Check ownership-based permissions
    if (request.context?.ownerId === request.userId) {
      const ownerPermissions = this.getOwnerPermissions(request.resource);
      if (ownerPermissions.has(request.action)) {
        return { granted: true, reason: 'Owner access' };
      }
    }

    return { 
      granted: false, 
      reason: `Missing permission: ${permissionString}` 
    };
  }

  /**
   * Assign role to user
   */
  assignRole(
    userId: string,
    roleId: string,
    assignedBy: string,
    scope?: string,
    expiresAt?: Date
  ): boolean {
    const role = this.roles.get(roleId);
    if (!role) return false;

    const assignment: RoleAssignment = {
      userId,
      roleId,
      scope,
      assignedBy,
      assignedAt: new Date(),
      expiresAt
    };

    if (!this.roleAssignments.has(userId)) {
      this.roleAssignments.set(userId, []);
    }

    const userAssignments = this.roleAssignments.get(userId)!;
    
    // Check if role already assigned
    const existing = userAssignments.find(a => 
      a.roleId === roleId && a.scope === scope
    );
    
    if (existing) {
      // Update expiration if needed
      existing.expiresAt = expiresAt;
      existing.assignedAt = new Date();
      existing.assignedBy = assignedBy;
    } else {
      userAssignments.push(assignment);
    }

    // Clear permission cache
    this.clearUserPermissionCache(userId);

    this.emit('role:assigned', { userId, roleId, scope });
    return true;
  }

  /**
   * Revoke role from user
   */
  revokeRole(userId: string, roleId: string, scope?: string): boolean {
    const userAssignments = this.roleAssignments.get(userId);
    if (!userAssignments) return false;

    const initialLength = userAssignments.length;
    const filtered = userAssignments.filter(a => 
      !(a.roleId === roleId && a.scope === scope)
    );

    if (filtered.length === initialLength) return false;

    this.roleAssignments.set(userId, filtered);
    
    // Clear permission cache
    this.clearUserPermissionCache(userId);

    this.emit('role:revoked', { userId, roleId, scope });
    return true;
  }

  /**
   * Get user roles
   */
  getUserRoles(userId: string): Role[] {
    const assignments = this.roleAssignments.get(userId) || [];
    const now = new Date();
    
    // Filter out expired assignments
    const validAssignments = assignments.filter(a => 
      !a.expiresAt || a.expiresAt > now
    );

    const roles: Role[] = [];
    const processedRoles = new Set<string>();

    const processRole = (roleId: string) => {
      if (processedRoles.has(roleId)) return;
      processedRoles.add(roleId);

      const role = this.roles.get(roleId);
      if (!role) return;

      roles.push(role);

      // Process inherited roles
      if (role.inherits) {
        role.inherits.forEach(inheritedRoleId => {
          processRole(inheritedRoleId);
        });
      }
    };

    validAssignments.forEach(assignment => {
      processRole(assignment.roleId);
    });

    // Sort by priority
    return roles.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get user permissions
   */
  getUserPermissions(userId: string): Set<string> {
    // Check cache
    if (this.permissionCache.has(userId)) {
      return this.permissionCache.get(userId)!;
    }

    const permissions = new Set<string>();
    const userRoles = this.getUserRoles(userId);

    userRoles.forEach(role => {
      role.permissions.forEach(permission => {
        permissions.add(permission);
      });
    });

    // Cache the result
    this.permissionCache.set(userId, permissions);
    
    return permissions;
  }

  /**
   * Create custom role
   */
  createRole(
    name: string,
    description: string,
    permissions: string[],
    inherits?: string[],
    priority: number = 40
  ): Role {
    const role: Role = {
      id: `custom-${Date.now()}`,
      name,
      description,
      permissions: new Set(permissions),
      inherits,
      priority,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.roles.set(role.id, role);
    this.emit('role:created', role);
    
    return role;
  }

  /**
   * Update role
   */
  updateRole(
    roleId: string,
    updates: Partial<Pick<Role, 'name' | 'description' | 'permissions' | 'inherits' | 'priority'>>
  ): boolean {
    const role = this.roles.get(roleId);
    if (!role || role.isSystem) return false;

    if (updates.name) role.name = updates.name;
    if (updates.description) role.description = updates.description;
    if (updates.permissions) role.permissions = new Set(updates.permissions);
    if (updates.inherits !== undefined) role.inherits = updates.inherits;
    if (updates.priority !== undefined) role.priority = updates.priority;
    
    role.updatedAt = new Date();

    // Clear permission cache for all users with this role
    this.clearRolePermissionCache(roleId);

    this.emit('role:updated', role);
    return true;
  }

  /**
   * Delete role
   */
  deleteRole(roleId: string): boolean {
    const role = this.roles.get(roleId);
    if (!role || role.isSystem) return false;

    // Remove role assignments
    for (const [userId, assignments] of this.roleAssignments) {
      const filtered = assignments.filter(a => a.roleId !== roleId);
      if (filtered.length < assignments.length) {
        this.roleAssignments.set(userId, filtered);
        this.clearUserPermissionCache(userId);
      }
    }

    this.roles.delete(roleId);
    this.emit('role:deleted', roleId);
    
    return true;
  }

  /**
   * Get all roles
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * Get all permissions
   */
  getAllPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  /**
   * Get permissions by resource
   */
  getResourcePermissions(resource: string): Permission[] {
    return Array.from(this.permissions.values())
      .filter(p => p.resource === resource);
  }

  /**
   * Check conditional permissions
   */
  private async checkConditionalPermissions(
    request: AccessRequest,
    userPermissions: Set<string>
  ): Promise<AccessResult> {
    for (const permissionId of userPermissions) {
      const permission = this.permissions.get(permissionId);
      if (!permission || !permission.conditions) continue;

      if (permission.resource !== request.resource || 
          permission.action !== request.action) continue;

      // Check all conditions
      let allConditionsMet = true;
      for (const condition of permission.conditions) {
        if (!this.evaluateCondition(condition, request.context)) {
          allConditionsMet = false;
          break;
        }
      }

      if (allConditionsMet) {
        return { 
          granted: true, 
          permissions: [permissionId],
          conditions: permission.conditions 
        };
      }
    }

    return { granted: false };
  }

  /**
   * Evaluate permission condition
   */
  private evaluateCondition(
    condition: PermissionCondition,
    context?: Record<string, any>
  ): boolean {
    if (!context) return false;

    const contextValue = context[condition.type];
    if (contextValue === undefined) return false;

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      case 'greaterThan':
        return contextValue > condition.value;
      case 'lessThan':
        return contextValue < condition.value;
      case 'between':
        return contextValue >= condition.value[0] && 
               contextValue <= condition.value[1];
      default:
        return false;
    }
  }

  /**
   * Get owner permissions for resource
   */
  private getOwnerPermissions(resource: string): Set<string> {
    const ownerActions = new Set<string>();
    
    switch (resource) {
      case 'workspace':
      case 'project':
        ownerActions.add('read');
        ownerActions.add('write');
        ownerActions.add('update');
        ownerActions.add('delete');
        ownerActions.add('share');
        break;
      case 'file':
        ownerActions.add('read');
        ownerActions.add('update');
        ownerActions.add('delete');
        ownerActions.add('execute');
        break;
    }

    return ownerActions;
  }

  /**
   * Clear user permission cache
   */
  private clearUserPermissionCache(userId: string): void {
    this.permissionCache.delete(userId);
  }

  /**
   * Clear permission cache for all users with a role
   */
  private clearRolePermissionCache(roleId: string): void {
    for (const [userId, assignments] of this.roleAssignments) {
      if (assignments.some(a => a.roleId === roleId)) {
        this.clearUserPermissionCache(userId);
      }
    }
  }

  /**
   * Export role configuration
   */
  exportRoles(): string {
    const roles = Array.from(this.roles.values())
      .filter(r => !r.isSystem)
      .map(r => ({
        ...r,
        permissions: Array.from(r.permissions)
      }));

    return JSON.stringify(roles, null, 2);
  }

  /**
   * Import role configuration
   */
  importRoles(jsonString: string): boolean {
    try {
      const roles = JSON.parse(jsonString);
      
      roles.forEach((roleData: any) => {
        const role: Role = {
          ...roleData,
          permissions: new Set(roleData.permissions),
          createdAt: new Date(roleData.createdAt),
          updatedAt: new Date(roleData.updatedAt)
        };
        
        if (!role.isSystem) {
          this.roles.set(role.id, role);
        }
      });

      return true;
    } catch (error) {
      return false;
    }
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _rbacSystem: RBACSystem | null = null;
export function getRbacSystem(): RBACSystem {
  if (!_rbacSystem) _rbacSystem = new RBACSystem();
  return _rbacSystem;
}