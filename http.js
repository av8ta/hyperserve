import http from 'http'

export async function httpServer (drive, { handler = defaultHttpHandler, port = 8080 } = {}) {
  const server = http.createServer(handler(drive))
  server.listen(port, () => {
    console.warn(`  🎉 Server running at http://localhost:${port}`)
  })
}

export function defaultHttpHandler (drive) {
  return async (req, res) => {
    const { url, method } = req
    if (method !== 'GET') return res.end()
    console.warn({ url, method })

    const fileBuffer = await drive.get(url)
    if (fileBuffer) {
      const contentType = inferContentType(url)
      res.writeHead(200, { 'Content-Type': contentType })
      res.write(fileBuffer)
    } else {
      const filenames = await listFilenames(drive, url)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      filenames.forEach(file => res.write(`<a href="${file}">${file}</a></br>`))
    }
    res.end()
  }
}

function inferContentType (url) {
  if (url.endsWith('.html')) return 'text/html'
  if (url.endsWith('.css')) return 'text/css'
  if (url.endsWith('.js')) return 'application/javascript '
  return 'text/html'
}

async function listFilenames (drive, url, options) {
  const files = await listFiles(drive, url, options)
  return files.map(file => file.key)
}

async function listFiles (drive, url, options = { recursive: true }) {
  const files = []
  for await (const path of drive.list(url, options)) files.push(path)
  return files
}
