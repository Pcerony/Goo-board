import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // ⚠️ 注意：如果你刚才在 GitHub 起的名字不是 final-board，请把这里改掉
  // 前后都要有斜杠 /
  base: command === 'serve' ? '/final-board/' : '/Goo-board/',
}))
