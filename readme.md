# hyperserve

serve hyperdrive contents over http

# example - remotely hosted blog or other website updated by local machine

## on local machine

start a hyperserve instance in server mode and publish content to it

```js
import { Hyperserve } from 'hyperserve'

const swarmOpts = { server: true, client: false }
const storageDir = 'storage'
const hyperserve = new Hyperserve({ swarmOpts, storageDir })

await hyperserve.ready()

// put one file on hyperdrive
await hyperserve.put('/css/theme.css', './path/to/website/theme.css')

// put all html files from a directory recursively
await hyperserve.putDir('/blog', './path/to/website/content/', '**/*.html')

// optionally start an http server if you wish to look at your site locally
// hyperserve.serve({ port: 3000 })

// content is now able to replicate over hyperswarm to your cloud server
```

## on remote cloud machine

start a hyperserve instance in client mode and connect with local hyperdrive key over hyperswarm dht

```js
import { Hyperserve } from 'hyperserve'

const key = 'key-logged-from-hyperserve-on-local-machine'
const swarmOpts = { server: false, client: true }
const storageDir = 'blog'
const hyperserve = new Hyperserve({ key, swarmOpts, storageDir })

hyperserve.on('ready', () => console.log('hyperserve ready'))
process.once('SIGINT', hyperserve.close)
process.once('SIGTERM', hyperserve.close)

await hyperserve.ready()

// serve site on http://localhost:8080
// optionally pass port and handler to serve function
// handler: (drive) => (req, res) => 
hyperserve.serve()
```

content from you local server will replicate to the cloud server. whenever you put new content, or edit existing content on your local machine's hyperserve instance, your website will update.

since the hyperserve process on the cloud server is long running, you might want to manage it with `pm2`. to view your website online point your domain name to your cloud server and set up a reverse proxy.

example `caddy` Caddyfile (with automatic letsencrypt tls certificates):

```Caddyfile
your.domain.com {
handle_path /blog/* {
  reverse_proxy http://localhost:8080
}
```
