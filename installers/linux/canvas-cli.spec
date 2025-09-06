Name:           canvas-cli
Version:        2.0.0
Release:        1%{?dist}
Summary:        AI Coding Assistant in Your Terminal
License:        MIT
URL:            https://canvas-cli.com
Source0:        https://github.com/canvas-cli/canvas-cli/archive/v%{version}.tar.gz
BuildArch:      x86_64

BuildRequires:  nodejs >= 20.0.0
BuildRequires:  npm
BuildRequires:  gcc-c++
BuildRequires:  make

Requires:       nodejs >= 20.0.0
Requires:       npm
Recommends:     git
Recommends:     python3 >= 3.8
Suggests:       ollama

%description
Canvas CLI is a production-ready AI command-line interface that combines
the best features from leading AI tools with production-ready architecture.
Built with TypeScript and featuring advanced tokenization, tool monitoring,
context management, and workflow automation.

Features:
- Multiple AI provider support (Ollama, OpenAI, Anthropic, Google)
- Advanced context management with automatic compression
- 50+ built-in tools for development workflows
- Recipe system for workflow automation
- Full VS Code and GitHub integration

%prep
%setup -q

%build
npm ci --production
npm run build

%install
rm -rf %{buildroot}

# Create directories
mkdir -p %{buildroot}%{_bindir}
mkdir -p %{buildroot}%{_libdir}/canvas-cli
mkdir -p %{buildroot}%{_sysconfdir}/canvas-cli
mkdir -p %{buildroot}%{_datadir}/doc/canvas-cli
mkdir -p %{buildroot}%{_datadir}/bash-completion/completions
mkdir -p %{buildroot}%{_datadir}/zsh/site-functions
mkdir -p %{buildroot}%{_datadir}/fish/vendor_completions.d

# Install application
cp -R dist/* %{buildroot}%{_libdir}/canvas-cli/
cp -R node_modules %{buildroot}%{_libdir}/canvas-cli/
cp package.json %{buildroot}%{_libdir}/canvas-cli/

# Install documentation
cp README.md %{buildroot}%{_datadir}/doc/canvas-cli/
cp LICENSE %{buildroot}%{_datadir}/doc/canvas-cli/

# Create executable wrapper
cat > %{buildroot}%{_bindir}/canvas << 'EOF'
#!/bin/bash
export NODE_PATH=%{_libdir}/canvas-cli/node_modules
exec /usr/bin/node %{_libdir}/canvas-cli/dist/index.js "$@"
EOF
chmod 755 %{buildroot}%{_bindir}/canvas

# Install default configuration
cat > %{buildroot}%{_sysconfdir}/canvas-cli/default.json << 'EOF'
{
  "defaultProvider": "ollama",
  "defaultModel": "llama3.2",
  "providers": {
    "ollama": {
      "enabled": true
    }
  }
}
EOF

# Install completions if they exist
if [ -f completions/canvas.bash ]; then
    cp completions/canvas.bash %{buildroot}%{_datadir}/bash-completion/completions/canvas
fi
if [ -f completions/canvas.zsh ]; then
    cp completions/canvas.zsh %{buildroot}%{_datadir}/zsh/site-functions/_canvas
fi
if [ -f completions/canvas.fish ]; then
    cp completions/canvas.fish %{buildroot}%{_datadir}/fish/vendor_completions.d/canvas.fish
fi

%clean
rm -rf %{buildroot}

%files
%license LICENSE
%doc README.md
%{_bindir}/canvas
%{_libdir}/canvas-cli
%{_sysconfdir}/canvas-cli
%{_datadir}/bash-completion/completions/canvas
%{_datadir}/zsh/site-functions/_canvas
%{_datadir}/fish/vendor_completions.d/canvas.fish

%post
# Create user config directory
if [ "$1" = 1 ]; then
    mkdir -p "$HOME/.canvas-cli"
    
    # Initialize default user configuration
    if [ ! -f "$HOME/.canvas-cli/config.json" ]; then
        cp %{_sysconfdir}/canvas-cli/default.json "$HOME/.canvas-cli/config.json"
        chmod 644 "$HOME/.canvas-cli/config.json"
    fi
    
    echo "Canvas CLI has been installed successfully!"
    echo "Run 'canvas' to get started"
    echo ""
    echo "To use with Ollama, ensure it's running:"
    echo "  ollama serve"
    echo ""
    echo "For other providers, set your API keys:"
    echo "  export OPENAI_API_KEY='your-key'"
    echo "  export ANTHROPIC_API_KEY='your-key'"
fi

%preun
if [ "$1" = 0 ]; then
    # Complete uninstall
    echo "Removing Canvas CLI..."
fi

%postun
if [ "$1" = 0 ]; then
    # Clean up after complete uninstall
    echo "Canvas CLI has been removed."
    echo "User configuration remains in ~/.canvas-cli"
    echo "To remove completely: rm -rf ~/.canvas-cli"
fi

%changelog
* Thu Jan 09 2025 Canvas CLI Team <support@canvas-cli.com> - 2.0.0-1
- Initial RPM release
- Full feature parity with npm package
- Added system-wide configuration
- Shell completion support
- Multi-provider AI support