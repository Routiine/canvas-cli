// Mock for @e2b/code-interpreter — prevents ESM/chalk import errors in Jest
const noOp = () => Promise.resolve(undefined);

export const Sandbox = {
  create: () => Promise.resolve({
    runCode: () => Promise.resolve({ logs: { stdout: [], stderr: [] }, error: null }),
    kill: noOp,
  }),
};
