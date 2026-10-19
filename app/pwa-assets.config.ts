import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.12, resizeOptions: { background: '#000000', fit: 'contain' } },
    apple: { ...minimal2023Preset.apple, padding: 0.12, resizeOptions: { background: '#000000', fit: 'contain' } },
  },
  images: ['public/icon.svg'],
})
