import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(projectDir, 'src');
const pagesDir = path.join(srcDir, 'pages');
const outputDir = path.join(projectDir, 'public');
const localePath = path.join(srcDir, 'locales', 'en.json');
const contactPath = path.join(srcDir, 'data', 'contact.json');
const imagesPath = path.join(srcDir, 'data', 'images.json');

const env = nunjucks.configure(srcDir, {
  autoescape: true,
  noCache: true,
});

function findFiles(dir, extension) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return findFiles(fullPath, extension);
    }

    return entry.isFile() && fullPath.endsWith(extension) ? [fullPath] : [];
  });
}

function renderPages() {
  const t = JSON.parse(fs.readFileSync(localePath, 'utf8'));
  const contact = JSON.parse(fs.readFileSync(contactPath, 'utf8'));
  const images = JSON.parse(fs.readFileSync(imagesPath, 'utf8'));

  for (const inputPath of findFiles(pagesDir, '.njk')) {
    const templatePath = path.relative(srcDir, inputPath);
    const outputPath = path.join(
      outputDir,
      path.relative(pagesDir, inputPath).replace(/\.njk$/, '.html'),
    );

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, env.render(templatePath, {
      lang: 'en',
      t,
      contact,
      images,
    }));
    console.log(`Rendered ${templatePath} -> ${path.relative(projectDir, outputPath)}`);
  }
}

function copyStaticFiles() {
  const staticEntries = ['assets', 'js'];

  for (const entry of staticEntries) {
    const source = path.join(srcDir, entry);
    const destination = path.join(outputDir, entry);

    if (fs.existsSync(source)) {
      fs.rmSync(destination, { recursive: true, force: true });
      fs.cpSync(source, destination, { recursive: true });
    }
  }
}

fs.mkdirSync(outputDir, { recursive: true });
renderPages();
copyStaticFiles();
