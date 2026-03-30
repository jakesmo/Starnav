import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/cgi-bin': {
        target: 'http://100.113.240.15:8082',
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
        },
      },
    },
  },
})
