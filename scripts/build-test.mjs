// Build isolada: nunca escreve em dist/ nem limpa diretórios existentes.
import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { writeBuildInfo } from './build-info.mjs';
await viteBuild({ configFile: 'vite.config.ts', build: { outDir: '../dist-teste/client', emptyOutDir: false } });
await build({ entryPoints: ['server/index.ts'], outfile: 'dist-teste/server/index.js', bundle: true, platform: 'node', target: 'node20', format: 'esm', packages: 'external', sourcemap: true });
writeBuildInfo('dist-teste/build.json');
