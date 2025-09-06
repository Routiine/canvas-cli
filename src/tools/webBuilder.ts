/**
 * Web & App Builder Tool for Canvas CLI
 * Intelligently creates websites, web apps, and native apps based on natural language requests
 */

import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface BuildOptions {
  type?: 'landing' | 'website' | 'webapp' | 'mobile' | 'desktop';
  name?: string;
  description?: string;
  framework?: string;
  features?: string[];
  style?: 'modern' | 'minimal' | 'colorful' | 'dark' | 'light';
}

interface ProjectTemplate {
  files: { [filename: string]: string };
  dependencies?: { [key: string]: string };
  scripts?: { [key: string]: string };
  structure?: string[];
}

export class WebBuilderTool extends BaseTool {
  name = 'web_builder';
  description = 'Build websites, landing pages, web apps, and native apps';
  parameters = {
    prompt: { type: 'string', description: 'The user request for what to build' },
    type: { type: 'string', description: 'Type of project: landing, website, webapp, mobile, desktop' }
  };

  async execute(params: any): Promise<any> {
    const { prompt, type, name, outputDir } = params;
    
    // Analyze the request to determine what to build
    const buildOptions = this.analyzeBuildRequest(prompt || '');
    
    if (type) buildOptions.type = type;
    if (name) buildOptions.name = name;
    
    const projectName = buildOptions.name || 'my-project';
    const projectDir = outputDir || `./${projectName}`;
    
    console.log(chalk.cyan.bold('\n🚀 Canvas Web Builder'));
    console.log(chalk.gray('=' .repeat(50)));
    console.log(chalk.yellow(`Building: ${this.getBuildTypeDescription(buildOptions.type || 'website')}`));
    console.log(chalk.yellow(`Project: ${projectName}`));
    
    // Generate the appropriate template
    const template = await this.generateTemplate(buildOptions);
    
    // Create the project
    await this.createProject(projectDir, template, buildOptions);
    
    return {
      success: true,
      projectDir,
      type: buildOptions.type,
      files: Object.keys(template.files),
      message: `Successfully created ${buildOptions.type} project at ${projectDir}`
    };
  }

  private analyzeBuildRequest(prompt: string): BuildOptions {
    const lower = prompt.toLowerCase();
    const options: BuildOptions = {};
    
    // Determine project type
    if (lower.includes('landing page') || lower.includes('landing')) {
      options.type = 'landing';
    } else if (lower.includes('web app') || lower.includes('webapp') || lower.includes('application')) {
      options.type = 'webapp';
    } else if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
      options.type = 'mobile';
    } else if (lower.includes('desktop') || lower.includes('electron')) {
      options.type = 'desktop';
    } else {
      options.type = 'website';
    }
    
    // Determine framework preference
    if (lower.includes('react')) {
      options.framework = 'react';
    } else if (lower.includes('vue')) {
      options.framework = 'vue';
    } else if (lower.includes('angular')) {
      options.framework = 'angular';
    } else if (lower.includes('svelte')) {
      options.framework = 'svelte';
    } else if (lower.includes('next')) {
      options.framework = 'nextjs';
    } else if (lower.includes('nuxt')) {
      options.framework = 'nuxt';
    } else if (lower.includes('vanilla') || lower.includes('plain')) {
      options.framework = 'vanilla';
    }
    
    // Determine style
    if (lower.includes('modern') || lower.includes('sleek')) {
      options.style = 'modern';
    } else if (lower.includes('minimal') || lower.includes('simple')) {
      options.style = 'minimal';
    } else if (lower.includes('colorful') || lower.includes('vibrant')) {
      options.style = 'colorful';
    } else if (lower.includes('dark')) {
      options.style = 'dark';
    }
    
    // Extract features
    options.features = [];
    if (lower.includes('form') || lower.includes('contact')) {
      options.features.push('contact-form');
    }
    if (lower.includes('blog')) {
      options.features.push('blog');
    }
    if (lower.includes('shop') || lower.includes('ecommerce') || lower.includes('store')) {
      options.features.push('ecommerce');
    }
    if (lower.includes('auth') || lower.includes('login')) {
      options.features.push('authentication');
    }
    if (lower.includes('dashboard')) {
      options.features.push('dashboard');
    }
    if (lower.includes('api')) {
      options.features.push('api');
    }
    
    // Extract name if mentioned
    const nameMatch = lower.match(/(?:called|named|for)\s+([a-z0-9-]+)/);
    if (nameMatch) {
      options.name = nameMatch[1];
    }
    
    return options;
  }

  private async generateTemplate(options: BuildOptions): Promise<ProjectTemplate> {
    switch (options.type) {
      case 'landing':
        return this.generateLandingPageTemplate(options);
      case 'webapp':
        return this.generateWebAppTemplate(options);
      case 'mobile':
        return this.generateMobileAppTemplate(options);
      case 'desktop':
        return this.generateDesktopAppTemplate(options);
      default:
        return this.generateWebsiteTemplate(options);
    }
  }

  private generateLandingPageTemplate(options: BuildOptions): ProjectTemplate {
    const style = options.style || 'modern';
    const hasForm = options.features?.includes('contact-form') || false;
    
    return {
      files: {
        'index.html': this.getLandingPageHTML(style, hasForm),
        'styles.css': this.getLandingPageCSS(style),
        'script.js': this.getLandingPageJS(hasForm),
        'README.md': this.getReadme('landing', options),
        '.gitignore': 'node_modules/\n.DS_Store\n*.log'
      }
    };
  }

  private generateWebsiteTemplate(options: BuildOptions): ProjectTemplate {
    const framework = options.framework || 'vanilla';
    
    if (framework === 'vanilla') {
      return {
        files: {
          'index.html': this.getWebsiteHTML(options),
          'about.html': this.getAboutHTML(),
          'contact.html': this.getContactHTML(),
          'css/styles.css': this.getWebsiteCSS(options.style || 'modern'),
          'js/main.js': this.getWebsiteJS(),
          'README.md': this.getReadme('website', options),
          '.gitignore': 'node_modules/\n.DS_Store\n*.log'
        },
        structure: ['css', 'js', 'images']
      };
    } else {
      return this.generateFrameworkProject(framework, options);
    }
  }

  private generateWebAppTemplate(options: BuildOptions): ProjectTemplate {
    const framework = options.framework || 'react';
    return this.generateFrameworkProject(framework, options);
  }

  private generateMobileAppTemplate(options: BuildOptions): ProjectTemplate {
    // React Native template
    return {
      files: {
        'App.js': this.getReactNativeApp(),
        'package.json': this.getReactNativePackageJson(options.name || 'MyApp'),
        'index.js': `import {AppRegistry} from 'react-native';\nimport App from './App';\nimport {name as appName} from './app.json';\n\nAppRegistry.registerComponent(appName, () => App);`,
        'app.json': JSON.stringify({
          name: options.name || 'MyApp',
          displayName: options.name || 'My App'
        }, null, 2),
        'README.md': this.getReadme('mobile', options)
      }
    };
  }

  private generateDesktopAppTemplate(options: BuildOptions): ProjectTemplate {
    // Electron template
    return {
      files: {
        'main.js': this.getElectronMain(),
        'index.html': this.getElectronHTML(),
        'renderer.js': `// Renderer process script\nconsole.log('Electron app running');`,
        'package.json': this.getElectronPackageJson(options.name || 'MyApp'),
        'README.md': this.getReadme('desktop', options)
      }
    };
  }

  private generateFrameworkProject(framework: string, options: BuildOptions): ProjectTemplate {
    switch (framework) {
      case 'react':
        return this.generateReactProject(options);
      case 'vue':
        return this.generateVueProject(options);
      case 'nextjs':
        return this.generateNextProject(options);
      default:
        return this.generateWebsiteTemplate({ ...options, framework: 'vanilla' });
    }
  }

  private generateReactProject(options: BuildOptions): ProjectTemplate {
    return {
      files: {
        'src/App.js': this.getReactApp(options),
        'src/index.js': this.getReactIndex(),
        'src/App.css': this.getReactCSS(options.style || 'modern'),
        'public/index.html': this.getReactHTML(),
        'package.json': this.getReactPackageJson(options.name || 'my-app'),
        'README.md': this.getReadme('react', options),
        '.gitignore': 'node_modules/\nbuild/\n.DS_Store\n*.log'
      },
      structure: ['src', 'public']
    };
  }

  private generateVueProject(options: BuildOptions): ProjectTemplate {
    return {
      files: {
        'src/App.vue': this.getVueApp(options),
        'src/main.js': `import { createApp } from 'vue'\nimport App from './App.vue'\nimport './style.css'\n\ncreateApp(App).mount('#app')`,
        'src/style.css': this.getVueCSS(options.style || 'modern'),
        'index.html': this.getVueHTML(),
        'package.json': this.getVuePackageJson(options.name || 'my-app'),
        'vite.config.js': `import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\nexport default defineConfig({\n  plugins: [vue()],\n})`,
        'README.md': this.getReadme('vue', options)
      },
      structure: ['src', 'public']
    };
  }

  private generateNextProject(options: BuildOptions): ProjectTemplate {
    return {
      files: {
        'pages/index.js': this.getNextIndexPage(options),
        'pages/_app.js': `import '../styles/globals.css'\n\nfunction MyApp({ Component, pageProps }) {\n  return <Component {...pageProps} />\n}\n\nexport default MyApp`,
        'styles/globals.css': this.getNextCSS(options.style || 'modern'),
        'styles/Home.module.css': this.getNextHomeCSS(),
        'package.json': this.getNextPackageJson(options.name || 'my-app'),
        'next.config.js': `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n}\n\nmodule.exports = nextConfig`,
        'README.md': this.getReadme('nextjs', options)
      },
      structure: ['pages', 'styles', 'public']
    };
  }

  private async createProject(projectDir: string, template: ProjectTemplate, options: BuildOptions): Promise<void> {
    const spinner = ora('Creating project structure...').start();
    
    try {
      // Create project directory
      await fs.ensureDir(projectDir);
      
      // Create subdirectories if specified
      if (template.structure) {
        for (const dir of template.structure) {
          await fs.ensureDir(path.join(projectDir, dir));
        }
      }
      
      // Write all files
      for (const [filename, content] of Object.entries(template.files)) {
        const filepath = path.join(projectDir, filename);
        await fs.ensureDir(path.dirname(filepath));
        await fs.writeFile(filepath, content);
      }
      
      spinner.succeed('Project structure created');
      
      // Show next steps
      console.log(chalk.green('\n✅ Project created successfully!'));
      console.log(chalk.cyan('\n📋 Next steps:'));
      console.log(chalk.gray(`   cd ${path.basename(projectDir)}`));
      
      if (this.needsNpmInstall(options.framework)) {
        console.log(chalk.gray('   npm install'));
        console.log(chalk.gray('   npm run dev'));
      } else {
        console.log(chalk.gray('   Open index.html in your browser'));
      }
      
      console.log(chalk.cyan('\n📁 Files created:'));
      Object.keys(template.files).forEach(file => {
        console.log(chalk.gray(`   ✓ ${file}`));
      });
      
    } catch (error) {
      spinner.fail('Failed to create project');
      throw error;
    }
  }

  private needsNpmInstall(framework?: string): boolean {
    return ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt'].includes(framework || '');
  }

  private getBuildTypeDescription(type: string): string {
    const descriptions: { [key: string]: string } = {
      'landing': 'Landing Page',
      'website': 'Website',
      'webapp': 'Web Application',
      'mobile': 'Mobile App',
      'desktop': 'Desktop Application'
    };
    return descriptions[type] || 'Project';
  }

  // Template content generators
  private getLandingPageHTML(style: string, hasForm: boolean): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome - Landing Page</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <div class="logo">YourBrand</div>
            <ul class="nav-links">
                <li><a href="#features">Features</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
        </div>
    </nav>

    <section class="hero">
        <div class="container">
            <h1>Welcome to Something Amazing</h1>
            <p>Build beautiful, modern applications with ease</p>
            <button class="cta-button">Get Started</button>
        </div>
    </section>

    <section id="features" class="features">
        <div class="container">
            <h2>Features</h2>
            <div class="feature-grid">
                <div class="feature">
                    <h3>Fast</h3>
                    <p>Lightning-fast performance</p>
                </div>
                <div class="feature">
                    <h3>Secure</h3>
                    <p>Built with security in mind</p>
                </div>
                <div class="feature">
                    <h3>Scalable</h3>
                    <p>Grows with your needs</p>
                </div>
            </div>
        </div>
    </section>
${hasForm ? `
    <section id="contact" class="contact">
        <div class="container">
            <h2>Get in Touch</h2>
            <form id="contact-form">
                <input type="text" placeholder="Name" required>
                <input type="email" placeholder="Email" required>
                <textarea placeholder="Message" rows="5" required></textarea>
                <button type="submit">Send Message</button>
            </form>
        </div>
    </section>` : ''}
    <footer>
        <div class="container">
            <p>&copy; 2024 YourBrand. All rights reserved.</p>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>`;
  }

  private getLandingPageCSS(style: string): string {
    const colors: Record<string, any> = {
      modern: { primary: '#3B82F6', secondary: '#8B5CF6', bg: '#0F172A', text: '#F8FAFC' },
      minimal: { primary: '#000000', secondary: '#666666', bg: '#FFFFFF', text: '#000000' },
      colorful: { primary: '#FF6B6B', secondary: '#4ECDC4', bg: '#FFF7F0', text: '#2D3436' },
      dark: { primary: '#BB86FC', secondary: '#03DAC6', bg: '#121212', text: '#FFFFFF' },
      light: { primary: '#2563EB', secondary: '#7C3AED', bg: '#FFFFFF', text: '#1F2937' }
    };
    
    const theme = colors[style] || colors.modern;
    
    return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: ${theme.bg};
    color: ${theme.text};
    line-height: 1.6;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.navbar {
    background: ${theme.bg};
    padding: 1rem 0;
    position: fixed;
    width: 100%;
    top: 0;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.navbar .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo {
    font-size: 1.5rem;
    font-weight: bold;
    color: ${theme.primary};
}

.nav-links {
    display: flex;
    list-style: none;
    gap: 2rem;
}

.nav-links a {
    color: ${theme.text};
    text-decoration: none;
    transition: color 0.3s;
}

.nav-links a:hover {
    color: ${theme.primary};
}

.hero {
    margin-top: 60px;
    padding: 100px 0;
    text-align: center;
    background: linear-gradient(135deg, ${theme.primary}20 0%, ${theme.secondary}20 100%);
}

.hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.hero p {
    font-size: 1.25rem;
    margin-bottom: 2rem;
    opacity: 0.9;
}

.cta-button {
    background: linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%);
    color: white;
    border: none;
    padding: 12px 30px;
    font-size: 1rem;
    border-radius: 50px;
    cursor: pointer;
    transition: transform 0.3s;
}

.cta-button:hover {
    transform: translateY(-2px);
}

.features {
    padding: 80px 0;
}

.features h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
}

.feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
}

.feature {
    text-align: center;
    padding: 2rem;
    background: ${theme.bg === '#FFFFFF' ? '#F8F9FA' : theme.bg === '#121212' ? '#1E1E1E' : theme.bg + '99'};
    border-radius: 10px;
    transition: transform 0.3s;
}

.feature:hover {
    transform: translateY(-5px);
}

.feature h3 {
    color: ${theme.primary};
    margin-bottom: 1rem;
}

.contact {
    padding: 80px 0;
    background: ${theme.bg === '#FFFFFF' ? '#F8F9FA' : theme.bg === '#121212' ? '#1E1E1E' : theme.bg + '99'};
}

.contact h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
}

#contact-form {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

#contact-form input,
#contact-form textarea {
    padding: 12px;
    border: 1px solid ${theme.text}30;
    border-radius: 5px;
    background: ${theme.bg};
    color: ${theme.text};
    font-size: 1rem;
}

#contact-form button {
    background: ${theme.primary};
    color: white;
    border: none;
    padding: 12px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.3s;
}

#contact-form button:hover {
    background: ${theme.secondary};
}

footer {
    padding: 2rem 0;
    text-align: center;
    background: ${theme.bg === '#FFFFFF' ? '#000000' : '#000000'};
    color: ${theme.bg === '#FFFFFF' ? '#FFFFFF' : theme.text};
}`;
  }

  private getLandingPageJS(hasForm: boolean): string {
    return `// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// CTA button handler
document.querySelector('.cta-button').addEventListener('click', () => {
    alert('Welcome! Your journey starts here.');
});
${hasForm ? `
// Contact form handler
document.getElementById('contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Thank you for your message! We\\'ll get back to you soon.');
    e.target.reset();
});` : ''}

// Add scroll animation
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
    } else {
        navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    }
});`;
  }

  private getWebsiteHTML(options: BuildOptions): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - ${options.name || 'My Website'}</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <header>
        <nav>
            <div class="logo">${options.name || 'My Website'}</div>
            <ul class="nav-menu">
                <li><a href="index.html" class="active">Home</a></li>
                <li><a href="about.html">About</a></li>
                <li><a href="contact.html">Contact</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <section class="hero">
            <h1>Welcome to ${options.name || 'Our Website'}</h1>
            <p>Discover amazing content and services</p>
        </section>

        <section class="content">
            <div class="container">
                <h2>What We Offer</h2>
                <div class="cards">
                    <div class="card">
                        <h3>Service One</h3>
                        <p>Description of your first service or feature</p>
                    </div>
                    <div class="card">
                        <h3>Service Two</h3>
                        <p>Description of your second service or feature</p>
                    </div>
                    <div class="card">
                        <h3>Service Three</h3>
                        <p>Description of your third service or feature</p>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <p>&copy; 2024 ${options.name || 'My Website'}. All rights reserved.</p>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>`;
  }

  private getAboutHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About Us</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <header>
        <nav>
            <div class="logo">My Website</div>
            <ul class="nav-menu">
                <li><a href="index.html">Home</a></li>
                <li><a href="about.html" class="active">About</a></li>
                <li><a href="contact.html">Contact</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <section class="page-header">
            <h1>About Us</h1>
        </section>

        <section class="content">
            <div class="container">
                <h2>Our Story</h2>
                <p>We are a team of passionate professionals dedicated to delivering exceptional results.</p>
                
                <h2>Our Mission</h2>
                <p>To provide innovative solutions that make a difference in people's lives.</p>
                
                <h2>Our Values</h2>
                <ul>
                    <li>Innovation</li>
                    <li>Excellence</li>
                    <li>Integrity</li>
                    <li>Collaboration</li>
                </ul>
            </div>
        </section>
    </main>

    <footer>
        <p>&copy; 2024 My Website. All rights reserved.</p>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>`;
  }

  private getContactHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact Us</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <header>
        <nav>
            <div class="logo">My Website</div>
            <ul class="nav-menu">
                <li><a href="index.html">Home</a></li>
                <li><a href="about.html">About</a></li>
                <li><a href="contact.html" class="active">Contact</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <section class="page-header">
            <h1>Contact Us</h1>
        </section>

        <section class="content">
            <div class="container">
                <form class="contact-form">
                    <div class="form-group">
                        <label for="name">Name</label>
                        <input type="text" id="name" name="name" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="message">Message</label>
                        <textarea id="message" name="message" rows="5" required></textarea>
                    </div>
                    
                    <button type="submit">Send Message</button>
                </form>
            </div>
        </section>
    </main>

    <footer>
        <p>&copy; 2024 My Website. All rights reserved.</p>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>`;
  }

  private getWebsiteCSS(style: string): string {
    return `/* Website Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
}

header {
    background: #fff;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    position: sticky;
    top: 0;
    z-index: 100;
}

nav {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo {
    font-size: 1.5rem;
    font-weight: bold;
    color: #3B82F6;
}

.nav-menu {
    display: flex;
    list-style: none;
    gap: 2rem;
}

.nav-menu a {
    color: #666;
    text-decoration: none;
    transition: color 0.3s;
}

.nav-menu a:hover,
.nav-menu a.active {
    color: #3B82F6;
}

.hero {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    text-align: center;
    padding: 100px 20px;
}

.hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.page-header {
    background: #f8f9fa;
    padding: 50px 20px;
    text-align: center;
}

.content {
    padding: 50px 20px;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
}

.cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
}

.card {
    background: #f8f9fa;
    padding: 2rem;
    border-radius: 8px;
    transition: transform 0.3s;
}

.card:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.contact-form {
    max-width: 600px;
    margin: 0 auto;
}

.form-group {
    margin-bottom: 1.5rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

.form-group input,
.form-group textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
}

button {
    background: #3B82F6;
    color: white;
    border: none;
    padding: 12px 30px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.3s;
}

button:hover {
    background: #2563EB;
}

footer {
    background: #1f2937;
    color: white;
    text-align: center;
    padding: 2rem;
    margin-top: 50px;
}`;
  }

  private getWebsiteJS(): string {
    return `// Main JavaScript file
console.log('Website loaded');

// Handle contact form submission
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Thank you for your message! We will get back to you soon.');
        contactForm.reset();
    });
}

// Add smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});`;
  }

  private getReactApp(options: BuildOptions): string {
    return `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to ${options.name || 'My React App'}</h1>
        <p>Edit <code>src/App.js</code> and save to reload.</p>
        <button className="App-button">Get Started</button>
      </header>
      
      <main>
        <section className="features">
          <h2>Features</h2>
          <div className="feature-grid">
            <div className="feature">
              <h3>Modern</h3>
              <p>Built with the latest React features</p>
            </div>
            <div className="feature">
              <h3>Fast</h3>
              <p>Optimized for performance</p>
            </div>
            <div className="feature">
              <h3>Scalable</h3>
              <p>Ready to grow with your needs</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;`;
  }

  private getReactIndex(): string {
    return `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
  }

  private getReactCSS(style: string): string {
    return `.App {
  text-align: center;
}

.App-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
  color: white;
}

.App-button {
  background: white;
  color: #667eea;
  border: none;
  padding: 12px 30px;
  border-radius: 25px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 20px;
  transition: transform 0.3s;
}

.App-button:hover {
  transform: scale(1.05);
}

.features {
  padding: 50px 20px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.feature {
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 8px;
}`;
  }

  private getReactHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Web app created with Canvas CLI" />
    <title>React App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`;
  }

  private getReactPackageJson(name: string): string {
    return JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '0.1.0',
      private: true,
      dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
        'react-scripts': '5.0.1'
      },
      scripts: {
        start: 'react-scripts start',
        build: 'react-scripts build',
        test: 'react-scripts test',
        eject: 'react-scripts eject'
      },
      eslintConfig: {
        extends: ['react-app']
      },
      browserslist: {
        production: ['>0.2%', 'not dead', 'not op_mini all'],
        development: ['last 1 chrome version', 'last 1 firefox version', 'last 1 safari version']
      }
    }, null, 2);
  }

  private getVueApp(options: BuildOptions): string {
    return `<template>
  <div id="app">
    <header>
      <h1>{{ title }}</h1>
      <p>Welcome to your Vue.js application</p>
    </header>
    
    <main>
      <section class="features">
        <h2>Features</h2>
        <div class="feature-grid">
          <div v-for="feature in features" :key="feature.id" class="feature">
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </div>
        </div>
      </section>
      
      <button @click="handleClick" class="cta-button">
        {{ buttonText }}
      </button>
    </main>
  </div>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      title: '${options.name || 'My Vue App'}',
      buttonText: 'Get Started',
      features: [
        { id: 1, title: 'Reactive', description: 'Reactive data binding' },
        { id: 2, title: 'Component-Based', description: 'Build with reusable components' },
        { id: 3, title: 'Performant', description: 'Optimized virtual DOM' }
      ]
    }
  },
  methods: {
    handleClick() {
      alert('Welcome to Vue.js!');
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

header {
  background: linear-gradient(135deg, #42b883 0%, #35495e 100%);
  color: white;
  padding: 50px 20px;
}

.features {
  padding: 50px 20px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.feature {
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.cta-button {
  background: #42b883;
  color: white;
  border: none;
  padding: 12px 30px;
  border-radius: 25px;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.3s;
}

.cta-button:hover {
  transform: scale(1.05);
}
</style>`;
  }

  private getVueCSS(style: string): string {
    return `/* Global styles for Vue app */
body {
  margin: 0;
  padding: 0;
}`;
  }

  private getVueHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vite + Vue</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`;
  }

  private getVuePackageJson(name: string): string {
    return JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview'
      },
      dependencies: {
        vue: '^3.3.4'
      },
      devDependencies: {
        '@vitejs/plugin-vue': '^4.2.3',
        vite: '^4.4.5'
      }
    }, null, 2);
  }

  private getNextIndexPage(options: BuildOptions): string {
    return `import Head from 'next/head'
import styles from '../styles/Home.module.css'

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>${options.name || 'My Next.js App'}</title>
        <meta name="description" content="Created with Canvas CLI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className={styles.description}>
          Get started by editing{' '}
          <code className={styles.code}>pages/index.js</code>
        </p>

        <div className={styles.grid}>
          <a href="https://nextjs.org/docs" className={styles.card}>
            <h2>Documentation &rarr;</h2>
            <p>Find in-depth information about Next.js features and API.</p>
          </a>

          <a href="https://nextjs.org/learn" className={styles.card}>
            <h2>Learn &rarr;</h2>
            <p>Learn about Next.js in an interactive course with quizzes!</p>
          </a>
        </div>
      </main>
    </div>
  )
}`;
  }

  private getNextCSS(style: string): string {
    return `html,
body {
  padding: 0;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen,
    Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

* {
  box-sizing: border-box;
}`;
  }

  private getNextHomeCSS(): string {
    return `.container {
  padding: 0 2rem;
}

.main {
  min-height: 100vh;
  padding: 4rem 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.title {
  margin: 0;
  line-height: 1.15;
  font-size: 4rem;
}

.title,
.description {
  text-align: center;
}

.description {
  margin: 4rem 0;
  line-height: 1.5;
  font-size: 1.5rem;
}

.code {
  background: #fafafa;
  border-radius: 5px;
  padding: 0.75rem;
  font-size: 1.1rem;
  font-family: Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono,
    Bitstream Vera Sans Mono, Courier New, monospace;
}

.grid {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 800px;
}

.card {
  margin: 1rem;
  padding: 1.5rem;
  text-align: left;
  color: inherit;
  text-decoration: none;
  border: 1px solid #eaeaea;
  border-radius: 10px;
  transition: color 0.15s ease, border-color 0.15s ease;
  max-width: 300px;
}

.card:hover,
.card:focus,
.card:active {
  color: #0070f3;
  border-color: #0070f3;
}

.card h2 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
}

.card p {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.5;
}`;
  }

  private getNextPackageJson(name: string): string {
    return JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint'
      },
      dependencies: {
        next: '13.4.19',
        react: '18.2.0',
        'react-dom': '18.2.0'
      },
      devDependencies: {
        eslint: '8.48.0',
        'eslint-config-next': '13.4.19'
      }
    }, null, 2);
  }

  private getReactNativeApp(): string {
    return `import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  Button,
} from 'react-native';

const App = () => {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Your App</Text>
          <Text style={styles.subtitle}>Built with React Native</Text>
        </View>
        
        <View style={styles.body}>
          <View style={styles.feature}>
            <Text style={styles.featureTitle}>Cross-Platform</Text>
            <Text style={styles.featureText}>Works on iOS and Android</Text>
          </View>
          
          <View style={styles.feature}>
            <Text style={styles.featureTitle}>Native Performance</Text>
            <Text style={styles.featureText}>Fast and responsive</Text>
          </View>
          
          <Button title="Get Started" onPress={() => alert('Welcome!')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#6200ee',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 16,
    color: 'white',
    marginTop: 8,
  },
  body: {
    padding: 20,
  },
  feature: {
    marginVertical: 20,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  featureText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});

export default App;`;
  }

  private getReactNativePackageJson(name: string): string {
    return JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '0.0.1',
      private: true,
      scripts: {
        android: 'react-native run-android',
        ios: 'react-native run-ios',
        start: 'react-native start',
        test: 'jest',
        lint: 'eslint .'
      },
      dependencies: {
        react: '18.2.0',
        'react-native': '0.72.5'
      },
      devDependencies: {
        '@babel/core': '^7.20.0',
        '@babel/preset-env': '^7.20.0',
        '@babel/runtime': '^7.20.0',
        '@react-native/eslint-config': '^0.72.2',
        '@react-native/metro-config': '^0.72.11',
        '@tsconfig/react-native': '^3.0.0',
        '@types/react': '^18.0.24',
        '@types/react-test-renderer': '^18.0.0',
        babel: '^6.23.0',
        eslint: '^8.19.0',
        jest: '^29.2.1',
        'metro-react-native-babel-preset': '0.76.8',
        prettier: '^2.4.1',
        'react-test-renderer': '18.2.0',
        typescript: '4.8.4'
      },
      engines: {
        node: '>=16'
      }
    }, null, 2);
  }

  private getElectronMain(): string {
    return `const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});`;
  }

  private getElectronHTML(): string {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
    <title>Electron App</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        margin: 0;
        padding: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
      }
      .container {
        text-align: center;
      }
      h1 {
        font-size: 3rem;
        margin-bottom: 1rem;
      }
      p {
        font-size: 1.2rem;
        opacity: 0.9;
      }
      button {
        background: white;
        color: #667eea;
        border: none;
        padding: 12px 30px;
        border-radius: 25px;
        font-size: 1rem;
        cursor: pointer;
        margin-top: 20px;
      }
      button:hover {
        transform: scale(1.05);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Welcome to Electron</h1>
      <p>Build cross-platform desktop apps with JavaScript, HTML, and CSS</p>
      <button onclick="alert('Hello from Electron!')">Click Me</button>
      
      <div style="margin-top: 40px;">
        <p>Node.js: <span id="node-version"></span></p>
        <p>Chromium: <span id="chrome-version"></span></p>
        <p>Electron: <span id="electron-version"></span></p>
      </div>
    </div>
    
    <script src="renderer.js"></script>
    <script>
      document.getElementById('node-version').textContent = process.versions.node;
      document.getElementById('chrome-version').textContent = process.versions.chrome;
      document.getElementById('electron-version').textContent = process.versions.electron;
    </script>
  </body>
</html>`;
  }

  private getElectronPackageJson(name: string): string {
    return JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: 'A desktop application built with Electron',
      main: 'main.js',
      scripts: {
        start: 'electron .',
        build: 'electron-builder',
        dist: 'electron-builder --publish=never'
      },
      keywords: ['electron', 'desktop', 'app'],
      author: '',
      license: 'MIT',
      devDependencies: {
        electron: '^26.0.0',
        'electron-builder': '^24.6.3'
      },
      build: {
        appId: `com.example.${name.toLowerCase().replace(/\s+/g, '-')}`,
        productName: name,
        directories: {
          output: 'dist'
        },
        mac: {
          category: 'public.app-category.developer-tools'
        },
        win: {
          target: 'nsis'
        },
        linux: {
          target: 'AppImage'
        }
      }
    }, null, 2);
  }

  private getReadme(type: string, options: BuildOptions): string {
    const projectName = options.name || 'My Project';
    const typeDescriptions: { [key: string]: string } = {
      'landing': 'Landing Page',
      'website': 'Website',
      'webapp': 'Web Application',
      'mobile': 'Mobile Application',
      'desktop': 'Desktop Application',
      'react': 'React Application',
      'vue': 'Vue.js Application',
      'nextjs': 'Next.js Application'
    };
    
    const projectType = typeDescriptions[type] || 'Project';
    
    return `# ${projectName}

A ${projectType} created with Canvas CLI.

## Description

${options.description || `This is a ${projectType.toLowerCase()} built with modern web technologies.`}

## Features

${options.features?.map(f => `- ${f.charAt(0).toUpperCase() + f.slice(1).replace(/-/g, ' ')}`).join('\n') || '- Modern design\n- Responsive layout\n- Fast performance'}

## Getting Started

### Prerequisites

${this.needsNpmInstall(options.framework) ? '- Node.js 16+ and npm' : '- A modern web browser'}

### Installation

\`\`\`bash
# Clone or navigate to the project
cd ${projectName.toLowerCase().replace(/\s+/g, '-')}
${this.needsNpmInstall(options.framework) ? '\n# Install dependencies\nnpm install' : ''}
\`\`\`

### Running the Project

${this.needsNpmInstall(options.framework) ? 
`\`\`\`bash
# Development server
npm run dev

# Build for production
npm run build
\`\`\`` : 
`Open \`index.html\` in your web browser.`}

## Project Structure

\`\`\`
${projectName}/
${type === 'react' ? '├── src/\n│   ├── App.js\n│   ├── App.css\n│   └── index.js\n├── public/\n│   └── index.html' : 
  type === 'vue' ? '├── src/\n│   ├── App.vue\n│   ├── main.js\n│   └── style.css\n├── index.html' :
  type === 'nextjs' ? '├── pages/\n│   ├── index.js\n│   └── _app.js\n├── styles/\n│   └── globals.css' :
  type === 'website' ? '├── index.html\n├── about.html\n├── contact.html\n├── css/\n│   └── styles.css\n├── js/\n│   └── main.js' :
  '├── index.html\n├── styles.css\n└── script.js'}
├── package.json
└── README.md
\`\`\`

## Technologies Used

${options.framework ? `- ${options.framework.charAt(0).toUpperCase() + options.framework.slice(1)}` : '- HTML5\n- CSS3\n- JavaScript'}
${type === 'mobile' ? '- React Native' : ''}
${type === 'desktop' ? '- Electron' : ''}

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Created with Canvas CLI

Built with ❤️ using [Canvas CLI](https://github.com/canvas-cli/canvas-cli)`;
  }
}