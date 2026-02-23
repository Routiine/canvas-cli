/**
 * Basic unit tests for core tools
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ToolRegistry } from '../../../src/tools/registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('tool registration', () => {
    it('should have core tools registered', () => {
      const tools = registry.list();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have read_file tool', () => {
      const tool = registry.get('read_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('read_file');
    });

    it('should have write_file tool', () => {
      const tool = registry.get('write_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('write_file');
    });

    it('should have run_shell_command tool', () => {
      const tool = registry.get('run_shell_command');
      expect(tool).toBeDefined();
    });
  });

  describe('tool enabling/disabling', () => {
    it('should enable a tool', () => {
      registry.disable('read_file');
      expect(registry.isEnabled('read_file')).toBe(false);

      registry.enable('read_file');
      expect(registry.isEnabled('read_file')).toBe(true);
    });

    it('should disable a tool', () => {
      registry.disable('read_file');
      expect(registry.isEnabled('read_file')).toBe(false);
    });
  });

  describe('tool definitions', () => {
    it('should generate tool definitions for LLM', () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions.length).toBeGreaterThan(0);

      const readFileDef = definitions.find(d => d.function.name === 'read_file');
      expect(readFileDef).toBeDefined();
      expect(readFileDef?.type).toBe('function');
      expect(readFileDef?.function.description).toBeDefined();
    });
  });

  describe('tool summary', () => {
    it('should provide tool count summary', () => {
      const summary = registry.getToolSummary();
      expect(summary.total).toBeGreaterThan(0);
      expect(summary.core).toBeGreaterThanOrEqual(0);
      expect(summary.extra).toBeGreaterThanOrEqual(0);
    });
  });
});
