import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://aamishuvo.github.io',
  base: '/',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto'
  }
});
