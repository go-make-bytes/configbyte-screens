import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// The screens render against a DOM, so the suite runs in jsdom. Test files sit
// beside the source they cover.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  }),
)
