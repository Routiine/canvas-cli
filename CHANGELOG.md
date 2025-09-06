# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multi-agent orchestration system for complex task coordination
- Voice command interface (experimental)
- Kubernetes deployment manifests
- Docker Compose configuration for containerized deployment
- Advanced error recovery and retry mechanisms
- Real-time collaboration features via WebSocket
- Support for custom model providers beyond Ollama

### Changed
- Improved token counting accuracy with tiktoken integration
- Enhanced performance monitoring and profiling tools
- Refactored tool system for better extensibility
- Updated UI components with Ink v6 for better terminal rendering

### Fixed
- Memory leak in long-running interactive sessions
- Race condition in parallel tool execution
- Context window overflow handling for large documents
- WebSocket connection stability in web interface mode

### Security
- Added input sanitization for all tool executions
- Implemented secure credential storage with encryption
- Added audit logging for enterprise compliance

## [2.0.0] - 2024-12-15

### Added
- Complete rewrite with TypeScript for better type safety
- 50+ built-in tools for comprehensive automation
- Interactive UI with Ink framework
- Session management with checkpoints and auto-save
- Multi-modal support for images, PDFs, audio, and video
- Plugin architecture for custom extensions
- Recipe system for reusable workflows
- Knowledge search with RAG capabilities
- Hook system for customizing behavior
- Web interface for remote access
- MCP (Model Context Protocol) integration
- Notebook mode for exploratory AI work
- Intent detection for natural language commands
- Smart completion system with context awareness
- Notification system for long-running tasks
- Transcript management for session history
- Advanced token management and optimization
- Enterprise features including audit logging and compliance

### Changed
- Migrated from CommonJS to ES modules
- Switched to streaming-first architecture for better performance
- Redesigned configuration system with schemas
- Improved error handling with detailed error types
- Enhanced context management with automatic detection
- Restructured codebase for better maintainability

### Removed
- Legacy CLI parser (replaced with Commander.js)
- Deprecated configuration format
- Old session format (automatic migration provided)

## [1.5.0] - 2024-10-01

### Added
- Workflow automation with pipeline support
- Model orchestration for multi-model tasks
- Project context auto-detection
- Git integration for repository awareness
- File watching and auto-reload
- Theme customization with 10+ built-in themes
- Progress indicators and spinners
- Syntax highlighting for code blocks

### Changed
- Improved streaming performance by 3x
- Reduced memory usage by 40%
- Enhanced error messages with suggestions
- Better handling of rate limits

### Fixed
- Token counting discrepancies
- Unicode handling in prompts
- Memory leaks in streaming mode
- Connection timeout issues

## [1.0.0] - 2024-07-15

### Added
- Initial release with core functionality
- Support for Ollama models
- Basic interactive mode
- File input/output operations
- JSON and markdown output formats
- Simple configuration management
- Basic tool system with 5 tools
- Command history
- Auto-completion for commands

### Known Issues
- Performance degradation with large contexts
- Limited error recovery
- No session persistence
- Basic UI without customization

## [0.9.0-beta] - 2024-06-01

### Added
- Beta release for testing
- Core chat functionality
- Ollama API integration
- Basic streaming support
- Configuration file support

### Known Issues
- Unstable streaming on slow connections
- Memory usage not optimized
- Limited error handling
- No session management

[Unreleased]: https://github.com/canvas-cli/canvas-cli/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/canvas-cli/canvas-cli/compare/v1.5.0...v2.0.0
[1.5.0]: https://github.com/canvas-cli/canvas-cli/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/canvas-cli/canvas-cli/compare/v0.9.0-beta...v1.0.0
[0.9.0-beta]: https://github.com/canvas-cli/canvas-cli/releases/tag/v0.9.0-beta