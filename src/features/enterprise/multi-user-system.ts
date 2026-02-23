/**
 * Multi-User Support System for Canvas CLI
 * Provides user management, authentication, and session handling
 * with SQLite-backed persistence.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

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

export interface MultiUserSystemConfig {
  jwtSecret?: string;
}

// Internal DB row shape for users table (flat, JSON-serialized fields)
interface UserDbRow {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  roles: string;           // JSON array
  permissions: string;     // JSON array
  profile: string;         // JSON object
  preferences: string;     // JSON object
  sessions: string;        // JSON array of session IDs (lightweight; full sessions in sessions table)
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
  isActive: number;        // 0 | 1
}

// Internal DB row shape for sessions table
interface SessionDbRow {
  id: string;
  userId: string;
  token: string;
  deviceInfo: string;      // JSON object
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  isActive: number;
}

// Internal DB row shape for activities table
interface ActivityDbRow {
  id: string;
  userId: string;
  action: string;
  resource: string | null;
  metadata: string;        // JSON object
  ip: string | null;
  sessionId: string | null;
  timestamp: string;
}

export class MultiUserSystem extends EventEmitter {
  private db: Database.Database;
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

  // Brute force protection (in-memory; not critical to persist across restarts)
  private loginAttempts: Map<string, { count: number; lockedUntil?: Date }> = new Map();
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  constructor(config?: Partial<MultiUserSystemConfig>) {
    super();

    // Initialize SQLite database
    const dbDir = path.join(os.homedir(), '.canvas');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'canvas.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        passwordHash TEXT NOT NULL,
        roles TEXT NOT NULL DEFAULT '[]',
        permissions TEXT NOT NULL DEFAULT '[]',
        profile TEXT NOT NULL DEFAULT '{}',
        preferences TEXT NOT NULL DEFAULT '{}',
        sessions TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastLogin TEXT,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        token TEXT NOT NULL,
        deviceInfo TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        lastActivity TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(userId) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        ip TEXT,
        sessionId TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Load or generate persistent JWT secret
    const secretRow = this.db
      .prepare('SELECT value FROM config WHERE key = ?')
      .get('jwt_secret') as { value: string } | undefined;

    if (secretRow) {
      this.jwtSecret = secretRow.value;
    } else {
      this.jwtSecret =
        config?.jwtSecret || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
      this.db
        .prepare('INSERT INTO config (key, value) VALUES (?, ?)')
        .run('jwt_secret', this.jwtSecret);
    }

    this.passwordPolicy = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    };
  }

  /**
   * Async initializer — call after construction to set up default users.
   */
  async initialize(): Promise<void> {
    await this.initializeDefaultUsers();
  }

  // ---------------------------------------------------------------------------
  // Row conversion helpers
  // ---------------------------------------------------------------------------

  private rowToUser(row: UserDbRow): User {
    const profile = JSON.parse(row.profile || '{}');
    const preferences = JSON.parse(row.preferences || '{}');
    const sessionsIds: string[] = JSON.parse(row.sessions || '[]');

    // Fetch full session objects for convenience
    const sessions: UserSession[] = sessionsIds
      .map(id => {
        const srow = this.db
          .prepare('SELECT * FROM sessions WHERE id = ?')
          .get(id) as SessionDbRow | undefined;
        return srow ? this.rowToSession(srow) : null;
      })
      .filter((s): s is UserSession => s !== null);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.passwordHash,
      roles: JSON.parse(row.roles || '[]'),
      permissions: new Set<string>(JSON.parse(row.permissions || '[]')),
      profile,
      preferences: {
        theme: preferences.theme ?? 'default',
        notifications: preferences.notifications ?? { email: true, push: false, inApp: true },
        privacy: preferences.privacy ?? { profileVisibility: 'team', activityVisibility: 'team' },
        collaboration: preferences.collaboration ?? { autoShare: false, defaultPermissions: ['read'] }
      },
      sessions,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastLogin: row.lastLogin ? new Date(row.lastLogin) : undefined,
      isActive: Boolean(row.isActive)
    };
  }

  private userToRow(user: User): UserDbRow {
    const sessionIds = user.sessions.map(s => s.id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash ?? '',
      roles: JSON.stringify(user.roles),
      permissions: JSON.stringify(Array.from(user.permissions)),
      profile: JSON.stringify(user.profile),
      preferences: JSON.stringify(user.preferences),
      sessions: JSON.stringify(sessionIds),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLogin: user.lastLogin?.toISOString() ?? null,
      isActive: user.isActive ? 1 : 0
    };
  }

  private rowToSession(row: SessionDbRow): UserSession {
    const deviceInfo = JSON.parse(row.deviceInfo || '{}');
    return {
      id: row.id,
      userId: row.userId,
      token: row.token,
      deviceInfo,
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
      lastActivity: new Date(row.lastActivity),
      isActive: Boolean(row.isActive)
    };
  }

  private sessionToRow(session: UserSession): SessionDbRow {
    return {
      id: session.id,
      userId: session.userId,
      token: session.token,
      deviceInfo: JSON.stringify(session.deviceInfo),
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      isActive: session.isActive ? 1 : 0
    };
  }

  // ---------------------------------------------------------------------------
  // DB-backed user CRUD
  // ---------------------------------------------------------------------------

  private saveUser(user: User): void {
    const row = this.userToRow(user);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO users
          (id, username, email, passwordHash, roles, permissions, profile, preferences, sessions, createdAt, updatedAt, lastLogin, isActive)
         VALUES
          (@id, @username, @email, @passwordHash, @roles, @permissions, @profile, @preferences, @sessions, @createdAt, @updatedAt, @lastLogin, @isActive)`
      )
      .run(row);
  }

  private loadUser(id: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserDbRow | undefined;
    return row ? this.rowToUser(row) : undefined;
  }

  private deleteUserFromDb(id: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  private allUsers(): User[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as UserDbRow[];
    return rows.map(r => this.rowToUser(r));
  }

  // ---------------------------------------------------------------------------
  // DB-backed session CRUD
  // ---------------------------------------------------------------------------

  private saveSession(session: UserSession): void {
    const row = this.sessionToRow(session);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions
          (id, userId, token, deviceInfo, createdAt, expiresAt, lastActivity, isActive)
         VALUES
          (@id, @userId, @token, @deviceInfo, @createdAt, @expiresAt, @lastActivity, @isActive)`
      )
      .run(row);
  }

  private loadSession(id: string): UserSession | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionDbRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  private deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  private loadSessionByToken(token: string): UserSession | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE token = ? AND isActive = 1')
      .get(token) as SessionDbRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  private loadUserSessions(userId: string): UserSession[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE userId = ? AND isActive = 1')
      .all(userId) as SessionDbRow[];
    return rows.map(r => this.rowToSession(r));
  }

  private markSessionInactive(sessionId: string): void {
    this.db
      .prepare('UPDATE sessions SET isActive = 0 WHERE id = ?')
      .run(sessionId);
  }

  private updateSessionActivity(sessionId: string, lastActivity: Date): void {
    this.db
      .prepare('UPDATE sessions SET lastActivity = ? WHERE id = ?')
      .run(lastActivity.toISOString(), sessionId);
  }

  // ---------------------------------------------------------------------------
  // DB-backed activity log
  // ---------------------------------------------------------------------------

  private saveActivity(activity: UserActivity): void {
    this.db
      .prepare(
        `INSERT INTO activities (id, userId, action, resource, metadata, ip, sessionId, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuidv4(),
        activity.userId,
        activity.action,
        activity.resource ?? null,
        JSON.stringify(activity.metadata ?? {}),
        activity.ip ?? null,
        activity.sessionId ?? null,
        activity.timestamp.toISOString()
      );
  }

  private loadUserActivities(userId: string, limit: number): UserActivity[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM activities WHERE userId = ? ORDER BY timestamp DESC LIMIT ?'
      )
      .all(userId, limit) as ActivityDbRow[];

    return rows.map(r => ({
      userId: r.userId,
      action: r.action,
      resource: r.resource ?? undefined,
      timestamp: new Date(r.timestamp),
      metadata: JSON.parse(r.metadata || '{}'),
      ip: r.ip ?? undefined,
      sessionId: r.sessionId ?? undefined
    }));
  }

  // ---------------------------------------------------------------------------
  // Brute-force protection
  // ---------------------------------------------------------------------------

  private isAccountLocked(username: string): boolean {
    const attempts = this.loginAttempts.get(username);
    if (!attempts) return false;
    if (!attempts.lockedUntil) return false;
    if (new Date() > attempts.lockedUntil) {
      this.loginAttempts.delete(username);
      return false;
    }
    return true;
  }

  private recordFailedAttempt(username: string): void {
    const attempts = this.loginAttempts.get(username) || { count: 0 };
    attempts.count++;
    if (attempts.count >= this.MAX_LOGIN_ATTEMPTS) {
      attempts.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION_MS);
      this.emit('account:locked', { username, lockedUntil: attempts.lockedUntil });
    }
    this.loginAttempts.set(username, attempts);
  }

  private clearLoginAttempts(username: string): void {
    this.loginAttempts.delete(username);
  }

  // ---------------------------------------------------------------------------
  // Default users
  // ---------------------------------------------------------------------------

  private async initializeDefaultUsers(): Promise<void> {
    // Only create if admin does not already exist
    const existing = this.db
      .prepare("SELECT id FROM users WHERE id = 'system-admin'")
      .get();
    if (existing) return;

    const initialPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const admin: User = {
      id: 'system-admin',
      username: 'admin',
      email: 'admin@canvas-cli.local',
      passwordHash,
      roles: ['admin', 'user'],
      permissions: new Set(['*']),
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

    this.saveUser(admin);

    console.log('\n[SECURITY] Initial admin password generated.');
    console.log('[SECURITY] Run "canvas config admin-password" to set a new password.');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

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
      if (this.isUsernameTaken(username)) {
        return { success: false, error: 'Username already taken' };
      }

      if (this.isEmailTaken(email)) {
        return { success: false, error: 'Email already registered' };
      }

      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
      }

      const passwordHash = await bcrypt.hash(password, 10);

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

      this.saveUser(user);

      this.logActivity({
        userId: user.id,
        action: 'user.registered',
        timestamp: new Date()
      });

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
      if (this.isAccountLocked(username)) {
        const attempts = this.loginAttempts.get(username);
        const remainingTime = attempts?.lockedUntil
          ? Math.ceil((attempts.lockedUntil.getTime() - Date.now()) / 60000)
          : 0;
        return {
          success: false,
          error: `Account locked due to too many failed attempts. Try again in ${remainingTime} minutes.`
        };
      }

      const user = this.findUserByUsername(username);
      if (!user) {
        this.recordFailedAttempt(username);
        return { success: false, error: 'Invalid credentials' };
      }

      if (!user.isActive) {
        return { success: false, error: 'Account is disabled' };
      }

      if (!user.passwordHash) {
        return { success: false, error: 'Password not set' };
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        this.recordFailedAttempt(username);
        return { success: false, error: 'Invalid credentials' };
      }

      this.clearLoginAttempts(username);

      // Check concurrent sessions
      const activeSessions = this.getUserActiveSessions(user.id);
      if (activeSessions.length >= this.maxConcurrentSessions) {
        const oldestSession = activeSessions.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        )[0];
        this.terminateSession(oldestSession.id);
      }

      const { token, refreshToken } = this.generateTokens(user);

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

      this.saveSession(session);

      // Update user's session list and lastLogin in DB
      user.sessions.push(session);
      user.lastLogin = new Date();
      this.saveUser(user);

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
      const session = this.loadSessionByToken(token);

      if (session) {
        this.markSessionInactive(session.id);

        this.logActivity({
          userId: decoded.userId,
          action: 'user.logout',
          timestamp: new Date(),
          sessionId: session.id
        });

        this.emit('user:logout', decoded.userId);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a token
   */
  verifyToken(token: string): { valid: boolean; user?: User; error?: string } {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const user = this.loadUser(decoded.userId);

      if (!user) {
        return { valid: false, error: 'User not found' };
      }

      if (!user.isActive) {
        return { valid: false, error: 'User is not active' };
      }

      const session = this.loadSessionByToken(token);
      if (!session || !session.isActive) {
        return { valid: false, error: 'Session expired' };
      }

      // Update last activity
      this.updateSessionActivity(session.id, new Date());

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

      const user = this.loadUser(decoded.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

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
    const user = this.loadUser(userId);
    if (!user) return false;

    user.profile = { ...user.profile, ...updates };
    user.updatedAt = new Date();
    this.saveUser(user);

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
    const user = this.loadUser(userId);
    if (!user) return false;

    user.preferences = { ...user.preferences, ...preferences };
    user.updatedAt = new Date();
    this.saveUser(user);

    this.emit('user:preferences:updated', user);
    return true;
  }

  /**
   * Change password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = this.loadUser(userId);
    if (!user || !user.passwordHash) return false;

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) return false;

    const validation = this.validatePassword(newPassword);
    if (!validation.valid) return false;

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    this.saveUser(user);

    this.invalidateUserSessions(userId);

    this.logActivity({
      userId,
      action: 'user.password.changed',
      timestamp: new Date()
    });

    this.emit('user:password:changed', userId);
    return true;
  }

  /**
   * Reset password (request)
   */
  async resetPassword(email: string): Promise<{ success: boolean; resetToken?: string }> {
    const user = this.findUserByEmail(email);
    if (!user) {
      return { success: false };
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

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

      const user = this.loadUser(decoded.userId);
      if (!user) return false;

      const validation = this.validatePassword(newPassword);
      if (!validation.valid) return false;

      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.updatedAt = new Date();
      this.saveUser(user);

      this.invalidateUserSessions(user.id);

      this.logActivity({
        userId: user.id,
        action: 'user.password.reset.completed',
        timestamp: new Date()
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | undefined {
    return this.loadUser(userId);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return this.allUsers();
  }

  /**
   * Search users
   */
  searchUsers(query: string): User[] {
    const lowerQuery = query.toLowerCase();
    return this.allUsers().filter(
      user =>
        user.username.toLowerCase().includes(lowerQuery) ||
        user.email.toLowerCase().includes(lowerQuery) ||
        user.profile.displayName.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get user activities
   */
  getUserActivities(userId: string, limit: number = 100): UserActivity[] {
    return this.loadUserActivities(userId, limit);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): UserSession[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE isActive = 1')
      .all() as SessionDbRow[];
    return rows.map(r => this.rowToSession(r));
  }

  /**
   * Get user's active sessions
   */
  getUserActiveSessions(userId: string): UserSession[] {
    return this.loadUserSessions(userId);
  }

  /**
   * Terminate a session
   */
  terminateSession(sessionId: string): boolean {
    const session = this.loadSession(sessionId);
    if (!session) return false;

    this.markSessionInactive(sessionId);

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
    const user = this.loadUser(userId);
    if (!user) return false;

    user.isActive = isActive;
    user.updatedAt = new Date();
    this.saveUser(user);

    if (!isActive) {
      this.invalidateUserSessions(userId);
    }

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
    const user = this.loadUser(userId);
    if (!user) return false;

    if (userId === 'system-admin') return false;

    this.invalidateUserSessions(userId);
    this.deleteUserFromDb(userId);

    this.logActivity({
      userId,
      action: 'user.deleted',
      timestamp: new Date()
    });

    this.emit('user:deleted', userId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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

  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < this.passwordPolicy.minLength) {
      return {
        valid: false,
        error: `Password must be at least ${this.passwordPolicy.minLength} characters`
      };
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

  private isUsernameTaken(username: string): boolean {
    const row = this.db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username);
    return row !== undefined;
  }

  private isEmailTaken(email: string): boolean {
    const row = this.db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email);
    return row !== undefined;
  }

  private findUserByUsername(username: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username) as UserDbRow | undefined;
    return row ? this.rowToUser(row) : undefined;
  }

  private findUserByEmail(email: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as UserDbRow | undefined;
    return row ? this.rowToUser(row) : undefined;
  }

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

  private logActivity(activity: UserActivity): void {
    this.saveActivity(activity);
    this.emit('activity:logged', activity);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export { MultiUserSystem as default };
export let multiUserSystem: MultiUserSystem;

export async function initializeMultiUserSystem(
  config?: Partial<MultiUserSystemConfig>
): Promise<MultiUserSystem> {
  multiUserSystem = new MultiUserSystem(config);
  await multiUserSystem.initialize();
  return multiUserSystem;
}
