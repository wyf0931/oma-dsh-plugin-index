import { defineConfig } from 'tsdown'

/**
 * Bundle the tsc-emitted Host JavaScript into one ESM runtime artifact per
 * entry. DSH packages stay external and are provided by the host profile.
 */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/tool.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
