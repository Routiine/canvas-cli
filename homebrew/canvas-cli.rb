class CanvasCli < Formula
  desc "AI Coding Assistant in Your Terminal - Production-ready CLI with advanced features"
  homepage "https://github.com/canvas-cli/canvas-cli"
  url "https://registry.npmjs.org/canvas-cli/-/canvas-cli-3.0.0.tgz"
  # SHA256: run 'shasum -a 256 canvas-cli-3.0.0.tgz' after npm publish and update this
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node" => "20.0"
  depends_on "python@3.8" => :optional

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
    
    # Install shell completions
    bash_completion.install "completions/canvas.bash" => "canvas"
    zsh_completion.install "completions/canvas.zsh" => "_canvas"
    fish_completion.install "completions/canvas.fish"
  end

  def post_install
    # Create config directory
    (var/"canvas-cli").mkpath
    
    # Initialize default configuration
    unless (var/"canvas-cli/config.json").exist?
      (var/"canvas-cli/config.json").write <<~EOS
        {
          "defaultProvider": "ollama",
          "defaultModel": "llama3.2",
          "providers": {
            "ollama": {
              "enabled": true
            }
          }
        }
      EOS
    end
  end

  def caveats
    <<~EOS
      Canvas CLI has been installed! 🎨
      
      To get started:
        1. Ensure Ollama is running: ollama serve
        2. Start Canvas CLI: canvas
        3. Or use directly: canvas chat "Help me refactor this function"
      
      Configuration is stored in: #{var}/canvas-cli/
      
      For API key setup:
        export OPENAI_API_KEY="your-key"
        export ANTHROPIC_API_KEY="your-key"
      
      Documentation: https://docs.canvas-cli.com
    EOS
  end

  test do
    system "#{bin}/canvas", "--version"
    assert_predicate var/"canvas-cli/config.json", :exist?
  end
end