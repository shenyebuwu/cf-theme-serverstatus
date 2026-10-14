import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { buildApiDomainsWithWs, buildBackgroundStyle, buildCspHeader, injectApiBase, injectTitle, parseCspOrigins } from '../../src/utils/csp.js'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const bases = parseCspOrigins(env.API_BASE)
  const proxy = { target: env.CFSM_DEV_PROXY || 'http://127.0.0.1:8787', changeOrigin: true, ws: true, secure: false }
  return {
    base: './',
    publicDir: false,
    plugins: [vue(), {
      name: 'cfsm-runtime-config',
      transformIndexHtml(html) {
        html = injectApiBase(injectTitle(html, env.TITLE), bases)
        const background = buildBackgroundStyle(env.BACKGROUND_IMAGE, env.BACKGROUND_IMAGE_MOBILE)
        // Worker mode receives its CSP and appearance settings from the backend.
        if (bases.length) {
          const csp = buildCspHeader({
            staticDomains: parseCspOrigins(env.CSP_STATIC),
            apiDomains: buildApiDomainsWithWs([...bases, ...parseCspOrigins(env.CSP_API)])
          }).replace(/; frame-ancestors [^;]+/, '')
          html = html.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head>`)
        }
        return html.replace('</head>', `${background}\n</head>`)
      }
    }],
    build: { outDir: 'dist', assetsDir: 'assets', emptyOutDir: true },
    server: { port: 5174, proxy: { '/api': proxy, '/admin': proxy, '/flags': proxy, '/os-icons': proxy } }
  }
})
