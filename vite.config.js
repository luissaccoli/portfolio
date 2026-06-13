import { defineConfig } from 'vite';
import path from 'node:path';
import { resolve } from 'path';
import fs from 'fs';

function getHtmlInputs(dir = 'public') {
  const inputs = {};
  const defaultLang = 'en';

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.html')) {
        const relativePath = path.relative(dir, fullPath);
        const segments = relativePath.split(path.sep);

        if (segments[0] === defaultLang) {
          const subPath = segments.slice(1).join('/').replace(/\.html$/, '');
          const name = subPath === 'index' ? 'index' : subPath; // map 'en/index.html' to root
          inputs[name] = fullPath;
        } else {
          const name = relativePath.replace(/\.html$/, '').replace(/\\/g, '/');
          inputs[name] = fullPath;
        }
      }
    }
  };

  walk(dir);
  return inputs;
}

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: getHtmlInputs('public')
    },
    emptyOutDir: true
  }
});
