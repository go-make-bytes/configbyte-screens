import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// The package ships its source, so this library build is a compile check rather
// than the artifact a consumer installs: every entry must parse, resolve and
// bundle before a tag is cut. The host's own packages stay external — screens
// that bundle their own copy of Vue, the router or the store break the host.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // The design system ships single-file components, which the dependency
  // optimiser cannot parse.
  optimizeDeps: { exclude: ['uibyte'] },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [/^vue($|\/)/, 'vue-router', 'vue-i18n', 'pinia', /^uibyte($|\/)/],
    },
  },
})
