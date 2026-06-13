import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(projectDir, 'src');
const pagesDir = path.join(srcDir, 'pages');
const outputDir = path.join(projectDir, 'public');
const localesDir = path.join(srcDir, 'locales');
const contactPath = path.join(srcDir, 'data', 'contact.json');
const imagesPath = path.join(srcDir, 'data', 'images.json');
const defaultLang = 'en';
const languageLabels = {
  en: 'English',
  es: 'Español',
  nl: 'Nederlands',
  pt: 'Português',
};

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
  const contact = JSON.parse(fs.readFileSync(contactPath, 'utf8'));
  const images = JSON.parse(fs.readFileSync(imagesPath, 'utf8'));
  const locales = findFiles(localesDir, '.json')
    .map((localePath) => ({
      code: path.basename(localePath, '.json'),
      path: localePath,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  for (const locale of locales) {
    const t = JSON.parse(fs.readFileSync(locale.path, 'utf8'));
    const languages = locales.map(({ code }) => ({
      code,
      label: languageLabels[code] ?? code.toUpperCase(),
      href: code === defaultLang ? './' : `./${code}.html`,
    }));

    for (const inputPath of findFiles(pagesDir, '.njk')) {
      const templatePath = path.relative(srcDir, inputPath);
      const relativeOutputPath = path.relative(pagesDir, inputPath).replace(/\.njk$/, '.html');
      const outputPath = locale.code === defaultLang
        ? path.join(outputDir, relativeOutputPath)
        : path.join(outputDir, `${locale.code}.html`);

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, env.render(templatePath, {
        lang: locale.code,
        languages,
        t,
        contact,
        images,
      }));
      console.log(`Rendered ${templatePath} (${locale.code}) -> ${path.relative(projectDir, outputPath)}`);
    }
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
