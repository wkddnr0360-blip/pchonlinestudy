import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './worker/analytics/schema.ts',
  out: './.ons2/drizzle-preview',
})
