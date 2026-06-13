import { spawn } from 'node:child_process';
import chokidar from 'chokidar';

let rendering = false;
let renderAgain = false;

function render() {
  if (rendering) {
    renderAgain = true;
    return;
  }

  rendering = true;
  const child = spawn(process.execPath, ['src/scripts/render.js'], {
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    rendering = false;

    if (code !== 0) {
      console.error(`Render failed with exit code ${code}`);
    }

    if (renderAgain) {
      renderAgain = false;
      render();
    }
  });
}

console.log('Watching src for changes...');
render();

const watcher = chokidar.watch(
  ['src/**/*.njk', 'src/**/*.json', 'src/js/**/*', 'src/assets/**/*'],
  { ignoreInitial: true },
);

watcher.on('all', (event, changedPath) => {
  console.log(`${event}: ${changedPath}`);
  render();
});
