/**
 * Multi-User Support System for Canvas CLI
 * Provides user management, authentication, and session handling
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash?: string;
  roles: string[];
  permissions: Set<string>;
  profile: UserProfile;
  sessions: UserSession[];
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  isActive: boolean;
  preferences: UserPreferences;
}

export interface UserProfile {
  displayName: string;
  avatar?: string;
  bio?: string;
  organization?: string;
  department?: string;
  location?: string;
  timezone: string;
  language: string;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  deviceInfo: {
    platform: string;
    browser?: string;
    ip?: string;
    userAgent?: string;
  };
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface UserPreferences {
  theme: string;
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'team' | 'private';
    activityVisibility: 'public' | 'team' | 'private';
  };
  collaboration: {
    autoShare: boolean;
    defaultPermissions: string[];
  };
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export interface UserActivity {
  userId: string;
  action: string;
  resource?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  ip?: string;
  sessionId?: string;
}

export class MultiUserSystem extends EventEmitter {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private activities: UserActivity[] = [];
  private jwtSecret: string;
  private tokenExpiry: number = 3600; // 1 hour
  private refreshTokenExpiry: number = 604800; // 7 days
  private maxConcurrentSessions: number = 5;
  private passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };

  constructor(jwtSecret?: string) {
    super();
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    
    this.passwordPolicy = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    };

    this.initializeDefaultUsers();
  }

  /**
   * Initialize default system users
   */
  private initializeDefaultUsers(): void {
    // Create system admin user
    const admin: User = {
      id: 'system-admin',
      username: 'admin',
      email: 'admin@canvas-cli.local',
      roles: ['admin', 'user'],
      permissions: new Set(['*']), // All permissions
      profile: {
        displayName: 'System Administrator',
        timezone: 'UTC',
        language: 'en'
      },
      sessions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      preferences: this.getDefaultPreferences()
    };

    this.users.set(admin.id, admin);
  }

  /**
   * Register a new user
   */
  async register(
    username: string,
    email: string,
    password: string,
    profile?: Partial<UserProfile>
  ): Promise<AuthResult> {
    try {
      // Validate username
      if (this.isUsernameTaken(username)) {
        return { success: false, error: 'Username already taken' };
      }

      // Validate email
      if (this.isEmailTaken(email)) {
        return { success: false, error: 'Email already registered' };
      }

      // Validate password
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const user: User = {
        id: uuidv4(),
        username,
        email,
        passwordHash,
        roles: ['user'],
        permissions: new Set(['read', 'write']),
        profile: {
          displayName: profile?.displayName || username,
          timezone: profile?.timezone || 'UTC',
          language: profile?.language || 'en',
          ...profile
        },
        sessions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        preferences: this.getDefaultPreferences()
      };

      this.users.set(user.id, user);

      // Log activity
      this.logActivity({
        userId: user.id,
        action: 'user.registered',
        timestamp: new Date()
      });

      // Generate tokens
      const { token, refreshToken } = this.generateTokens(user);

      this.emit('user:registered', user);

      return {
        success: true,
        user,
        token,
        refreshToken,
        expiresIn: this.tokenExpiry
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Authenticate a user
   */
  async authenticate(username: string, password: string): Promise<AuthResult> {
    try {
      // Find user
      const user = this.findUserByUsername(username);
      if (!user) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Check if user is active
      if (!user.isActive) {
        return { success: false, error: 'Account is disabled' };
      }

      // Verify password
      if (!user.passwordHash) {
        return { success: false, error: 'Password not set' };
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Check concurrent sessions
      const activeSessions = this.getUserActiveSessions(user.id);
      if (activeSessions.length >= this.maxConcurrentSessions) {
        // Terminate oldest session
        const oldestSession = activeSessions.sort((a, b) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        )[0];
        this.terminateSession(oldestSession.id);
      }

      // Generate tokens
      const { token, refreshToken } = this.generateTokens(user);

      // Create session
      const session: UserSession = {
        id: uuidv4(),
        userId: user.id,
        token,
        deviceInfo: {
          platform: process.platform,
          userAgent: 'Canvas CLI'
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.tokenExpiry * 1000),
        lastActivity: new Date(),
        isActive: true
      };

      this.sessions.set(session.id, session);
      user.sessions.push(session);
      user.lastLogin = new Date();

      // Log activity
      this.logActivity({
        userId: user.id,
        action: 'user.login',
        timestamp: new Date(),
        sessionId: session.id
      });

      this.emit('user:authenticated', user);

      return {
        success: true,
        user,
        token,
        refreshToken,
        expiresIn: this.tokenExpiry
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout a user
   */
  async logout(token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const session = this.findSessionByToken(token);
      
      if (session) {
        session.isActive = false;
        this.sessions.delete(session.id);

        // Log activity
        this.logActivity({
          userId: decoded.userId,
          action: 'user.logout',
          timestamp: new Date(),
          sessionId: session.id
        });

        this.emit('user:logout', decoded.userId);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify a token
   */
  verifyToken(token: string): { valid: boolean; user?: User; error?: string } {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const user = this.users.get(decoded.userId);
      
      if (!user) {
        return { valid: false, error: 'User not found' };
      }

      if (!user.isActive) {
        return { valid: false, error: 'User is not active' };
      }

      const session = this.findSessionByToken(token);
      if (!session || !session.isActive) {
        return { valid: false, error: 'Session expired' };
      }

      // Update last activity
      session.lastActivity = new Date();

      return { valid: true, user };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      
      if (decoded.type !== 'refresh') {
        return { success: false, error: 'Invalid refresh token' };
      }

      const user = this.users.get(decoded.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Generate new tokens
      const tokens = this.generateTokens(user);

      return {
        success: true,
        user,
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        expiresIn: this.tokenExpiry
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    user.profile = { ...user.profile, ...updates };
    user.updatedAt = new Date();

    // Log activity
    this.logActivity({
      userId,
      action: 'user.profile.updated',
      timestamp: new Date(),
      metadata: { updates }
    });

    this.emit('user:updated', user);
    return true;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    user.preferences = { ...user.preferences, ...preferences };
    user.updatedAt = new Date();

    this.emit('user:preferences:updated', user);
    return true;
  }

  /**
   * Change password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || !user.passwordHash) return false;

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) return false;

    // Validate new password
    const validation = this.validatePassword(newPassword);
    if (!validation.valid) return false;

    // Update password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();

    // Invalidate all sessions
    this.invalidateUserSessions(userId);

    // Log activity
    this.logActivity({
      userId,
      action: 'user.password.changed',
      timestamp: new Date()
    });

    this.emit('user:password:changed', userId);
    return true;
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<{ success: boolean; resetToken?: string }> {
    const user = this.findUserByEmail(email);
    if (!user) {
      return { success: false };
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    // Log activity
    this.logActivity({
      userId: user.id,
      action: 'user.password.reset.requested',
      timestamp: new Date()
    });

    this.emit('user:password:reset', { user, resetToken });

    return { success: true, resetToken };
  }

  /**
   * Complete password reset
   */
  async completePasswordReset(resetToken: string, newPassword: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(resetToken, this.jwtSecret) as any;
      
      if (decoded.type !== 'password-reset') {
        return false;
      }

      const user = this.users.get(decoded.userId);
      if (!user) return false;

      // Validate new password
      const validation = this.validatePassword(newPassword);
      if (!validation.valid) return false;

      // Update password
      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.updatedAt = new Date();

      // Invalidate all sessions
      this.invalidateUserSessions(user.id);

      // Log activity
      this.logActivity({
        userId: user.id,
        action: 'user.password.reset.completed',
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Search users
   */
  searchUsers(query: string): User[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.users.values()).filter(user =>
      user.username.toLowerCase().includes(lowerQuery) ||
      user.email.toLowerCase().includes(lowerQuery) ||
      user.profile.displayName.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get user activities
   */
  getUserActivities(userId: string, limit: number = 100): UserActivity[] {
    return this.activities
      .filter(activity => activity.userId === userId)
      .slice(-limit);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): UserSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.isActive);
  }

  /**
   * Get user's active sessions
   */
  getUserActiveSessions(userId: string): UserSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId && session.isActive);
  }

  /**
   * Terminate a session
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;
    this.sessions.delete(sessionId);

    // Log activity
    this.logActivity({
      userId: session.userId,
      action: 'session.terminated',
      timestamp: new Date(),
      sessionId
    });

    this.emit('session:terminated', sessionId);
    return true;
  }

  /**
   * Invalidate all user sessions
   */
  invalidateUserSessions(userId: string): void {
    const sessions = this.getUserActiveSessions(userId);
    sessions.forEach(session => {
      this.terminateSession(session.id);
    });
  }

  /**
   * Enable/disable user
   */
  setUserActive(userId: string, isActive: boolean): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.isActive = isActive;
    user.updatedAt = new Date();

    if (!isActive) {
      this.invalidateUserSessions(userId);
    }

    // Log activity
    this.logActivity({
      userId,
      action: isActive ? 'user.enabled' : 'user.disabled',
      timestamp: new Date()
    });

    this.emit('user:status:changed', { userId, isActive });
    return true;
  }

  /**
   * Delete user
   */
  deleteUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    // Don't delete system admin
    if (userId === 'system-admin') return false;

    // Invalidate sessions
    this.invalidateUserSessions(userId);

    // Delete user
    this.users.delete(userId);

    // Log activity
    this.logActivity({
      userId,
      action: 'user.deleted',
      timestamp: new Date()
    });

    this.emit('user:deleted', userId);
    return true;
  }

  /**
   * Helper: Generate JWT tokens
   */
  private generateTokens(user: User): { token: string; refreshToken: string } {
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        roles: user.roles,
        type: 'access'
      },
      this.jwtSecret,
      { expiresIn: this.tokenExpiry }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        type: 'refresh'
      },
      this.jwtSecret,
      { expiresIn: this.refreshTokenExpiry }
    );

    return { token, refreshToken };
  }

  /**
   * Helper: Validate password
   */
  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < this.passwordPolicy.minLength) {
      return { valid: false, error: `Password must be at least ${this.passwordPolicy.minLength} characters` };
    }

    if (this.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      return { valid: false, error: 'Password must contain uppercase letters' };
    }

    if (this.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
      return { valid: false, error: 'Password must contain lowercase letters' };
    }

    if (this.passwordPolicy.requireNumbers && !/\d/.test(password)) {
      return { valid: false, error: 'Password must contain numbers' };
    }

    if (this.passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return { valid: false, error: 'Password must contain special characters' };
    }

    return { valid: true };
  }

  /**
   * Helper: Check if username is taken
   */
  private isUsernameTaken(username: string): boolean {
    return Array.from(this.users.values())
      .some(user => user.username.toLowerCase() === username.toLowerCase());
  }

  /**
   * Helper: Check if email is taken
   */
  private isEmailTaken(email: string): boolean {
    return Array.from(this.users.values())
      .some(user => user.email.toLowerCase() === email.toLowerCase());
  }

  /**
   * Helper: Find user by username
   */
  private findUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values())
      .find(user => user.username.toLowerCase() === username.toLowerCase());
  }

  /**
   * Helper: Find user by email
   */
  private findUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values())
      .find(user => user.email.toLowerCase() === email.toLowerCase());
  }

  /**
   * Helper: Find session by token
   */
  private findSessionByToken(token: string): UserSession | undefined {
    return Array.from(this.sessions.values())
      .find(session => session.token === token);
  }

  /**
   * Helper: Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      theme: 'default',
      notifications: {
        email: true,
        push: false,
        inApp: true
      },
      privacy: {
        profileVisibility: 'team',
        activityVisibility: 'team'
      },
      collaboration: {
        autoShare: false,
        defaultPermissions: ['read']
      }
    };
  }

  /**
   * Helper: Log activity
   */
  private logActivity(activity: UserActivity): void {
    this.activities.push(activity);
    
    // Keep only last 10000 activities
    if (this.activities.length > 10000) {
      this.activities = this.activities.slice(-10000);
    }

    this.emit('activity:logged', activity);
  }
}

// Export singleton instance
export const multiUserSystem = new MultiUserSystem();