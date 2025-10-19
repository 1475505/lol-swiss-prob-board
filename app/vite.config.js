import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [svelte()],
    base: mode === 'production' ? '/lol-swiss-prob-board/' : '/',
    define: {
      __MONTE_CARLO_ENABLED__: JSON.stringify(env.MONTE_CARLO_VALIDATION_ENABLED === 'true'),
      __MONTE_CARLO_SIMULATIONS__: JSON.stringify(Number(env.MONTE_CARLO_VALIDATION_SIMULATIONS || 1000))
    }
  }
})
