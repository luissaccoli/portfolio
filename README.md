# Luisa Correa portfolio

This project uses Nunjucks templates and static files in `src/` to generate most
of the site in `public/`. The stylesheet is maintained directly at
`public/styles.css`. Vite serves `public/` during development and creates the
deployable `dist/` directory for production.

Edit templates, data, JavaScript, and assets in `src/`. Edit CSS directly in
`public/styles.css`. Treat `public/index.html`, `public/js/`, `public/assets/`,
and `dist/` as generated output.

## Commands

```bash
npm install
npm run dev
npm run build
```

- `npm run dev` watches `src/`, updates `public/`, and starts the Vite dev server.
- `npm run render` performs one render from `src/` to `public/`.
- `npm run build` renders the site and creates a production build in `dist/`.
- `npm run watch` only watches and renders; it does not start a dev server.
