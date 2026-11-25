import { json } from '../http'

interface McpEnv {
  APP: Fetcher
  OAUTH_KV: KVNamespace
}

export default {
  fetch({ url, method }) {
    if (new URL(url).pathname === '/mcp') {
      return json({ error: 'mcp_unavailable' }, 503, method)
    }
    return json({ error: 'not_found' }, 404, method)
  },
} satisfies ExportedHandler<McpEnv>
