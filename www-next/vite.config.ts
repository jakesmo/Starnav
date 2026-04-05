import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss(), cesium()],
  resolve: {
    alias: {
      '@update': path.resolve(__dirname, 'src/shared-update'),
      '@app': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/cgi-bin': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../www',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/'))
            return 'vendor-react'
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet'))
            return 'vendor-map'
          if (id.includes('node_modules/@tanstack'))
            return 'vendor-query'
          if (id.includes('node_modules/cesium') || id.includes('node_modules/resium'))
            return 'vendor-cesium'
        },
      },
    },
  },
})
