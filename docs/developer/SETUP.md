# Project Setup Guide

This guide provides detailed instructions for setting up and running the Canvas CLI project on your local machine for development purposes.

---

## Prerequisites

Before you begin, ensure you have the following software installed.

- **Node.js**: This project requires **Node.js version 20.0.0 or higher**. You can verify your version with `node -v`. We recommend using a version manager like [nvm](https://github.com/nvm-sh/nvm) to easily switch between Node.js versions.
- **npm** or **yarn**: The project uses a package manager to handle dependencies. `npm` is included with Node.js. You can install `yarn` from [yarnpkg.com](https://yarnpkg.com/).
- **Git**: Required for cloning the repository and managing source control.

## Installation

1.  **Clone the Repository**
    Use Git to clone the project source code from GitHub.
    ```bash
    git clone https://github.com/canvas-cli/canvas-cli.git
    ```

2.  **Navigate to the Project Directory**
    ```bash
    cd canvas-cli
    ```

3.  **Install Dependencies**
    This command will read the `package.json` file and download all necessary development and production dependencies into the `node_modules` directory.
    ```bash
    npm install
    ```
    *(or `yarn install` if you are using Yarn)*

---

## Project Scripts

The `package.json` file contains several scripts to help with development.

### `npm run dev`
- **Action**: Starts the application in development mode.
- **Details**: This is the primary script you will use during development. It uses `tsx` to execute the TypeScript source files directly without requiring a separate build step. It also provides live reloading, so the application will automatically restart when you save changes to a file.

### `npm run build`
- **Action**: Compiles the entire project for production.
- **Details**: This script invokes the TypeScript compiler (`tsc`), which reads the `tsconfig.json` file, compiles all files in the `src/` directory, and outputs the resulting JavaScript files to the `dist/` directory. This is a necessary step before deploying the application or running it in a production environment.

### `npm run start`
- **Action**: Runs the compiled, production version of the application.
- **Details**: This script executes the main entry point of the compiled code (`dist/index.js`) using Node.js. You must run `npm run build` before this script will work.

---

## Debugging

Debugging is a critical part of the development process. Here is a recommended setup for debugging the application using Visual Studio Code.

1.  **Open the project** in VS Code.
2.  Go to the **Run and Debug** view (you can use the `Ctrl+Shift+D` shortcut).
3.  Click on the "**create a launch.json file**" link.
4.  Select **Node.js** as the environment.
5.  VS Code will create a `.vscode/launch.json` file. Replace its contents with the following configuration:

    ```json
    {
      "version": "0.2.0",
      "configurations": [
        {
          "type": "node",
          "request": "launch",
          "name": "Debug Canvas CLI",
          "runtimeArgs": [
            "--loader=tsx"
          ],
          "program": "${workspaceFolder}/src/index.ts",
          "args": ["chat"], // Or any other command you want to debug
          "internalConsoleOptions": "openOnSessionStart",
          "console": "integratedTerminal"
        }
      ]
    }
    ```

6.  **Start Debugging**: Now you can set breakpoints anywhere in the TypeScript code and start the debugger by pressing `F5` or clicking the green play button in the Run and Debug view. The application will launch, and execution will pause at your breakpoints.

## Code Style & Linting

To maintain a consistent and high-quality codebase, we recommend adhering to the established code style.

- **Formatting**: The project uses Prettier for automated code formatting. It's highly recommended to install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension for VS Code and enable "Format On Save" in your editor settings.
- **Linting**: While a formal linting script (like ESLint) is not explicitly defined in the `package.json`, the TypeScript compiler (`tsc`) performs strict type-checking that catches a wide range of potential errors. Ensure that your code compiles without any TypeScript errors before submitting changes.
