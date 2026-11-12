import { defineConfig } from 'vite';
import { writeFileSync, readFileSync } from 'fs';

// Config alineado con searys-pos-frontend: mismo mecanismo de rutas
// relativas para que el build funcione dentro de assets/ de Android
// sin pasos manuales de "corregir rutas" después de cada build.
export default defineConfig({
  base: '',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      }
    }
  },
  plugins: [
    {
      name: 'fix-android-paths',
      closeBundle() {
        const path = 'dist/index.html';
        let html = readFileSync(path, 'utf-8');
        // Quitar ./ del inicio de rutas para que Android las lea correctamente
        html = html.replace(/src="\.\//g, 'src="').replace(/href="\.\//g, 'href="');
        writeFileSync(path, html);
        console.log('✅ Rutas corregidas para Android (recepción)');
      }
    }
  ]
});
