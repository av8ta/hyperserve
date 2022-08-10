#!/usr/bin/env node
import { Hyperserve } from './hyperserve.js'
import { UnpackrStream } from 'msgpackr'
import minimist from 'minimist2'
import Debug from 'debug'
import { join } from 'node:path'

const log = process.env.DEBUG ? Debug('hyperserve') : console.warn

const argv = minimist(process.argv.slice(2))
const { _, ...flags } = argv
const [command, ...args] = _
log('command', command)
log('args', args)
log('flags', flags)

if (process.stdin.isTTY) {
  // not piped into
} else {
  // we have a pipe to attend to
  publishStdin()
}

async function publishStdin () {
  const receivingStream = new UnpackrStream()
  process.stdin.pipe(receivingStream).on('error', e => {
    console.error(`process.stdin.pipe error: ${e.message}`)
  })

  // display help
  if (!command || flags.help) {
    if (command === 'publish') console.warn(helpPublish())
    else console.warn(help())
    process.exit(0)
  }

  const [storageDir] = args
  const key = flags.key
  const assetsUrl = flags.assets || '/'
  const contentUrl = flags.url || '/'
  log('storageDir', storageDir)
  log('key', key)
  log('assetsUrl', assetsUrl)
  log('contentUrl', contentUrl)

  // setup hyperserve
  const swarmOpts = { server: true, client: false }
  const hyperserve = new Hyperserve({ swarmOpts, storageDir, key })

  hyperserve.on('ready', () => console.log('hyperserve ready', hyperserve.opened))
  hyperserve.on('corestore_ready', () => console.log('corestore_ready. hyperserve ready', hyperserve.opened))
  hyperserve.on('drive_ready', () => console.log('drive_ready. hyperserve ready', hyperserve.opened))
  hyperserve.on('swarm_ready', () => console.log('swarm_ready. hyperserve ready', hyperserve.opened))
  hyperserve.on('close', () => {
    console.log('Hyperserve closed.')
    process.exit(0)
  })

  process.once('SIGINT', hyperserve.close)
  process.once('SIGTERM', hyperserve.close)

  await hyperserve.ready()

  receivingStream.on('end', () => log('End of stream'))

  receivingStream.on('data', async data => {
    const isAsset = !!data.asset
    // log('isAsset', data.path, isAsset)
    const url = isAsset ? join(assetsUrl, data.path) : join(contentUrl, data.path)
    log('hyperdrive url', url)
    await hyperserve.putBlob(url, data.data)
  })

  if (flags.serve) hyperserve.serve({ port: flags.port })
}

function help () {
  return `
  Usage
    $ hyperserve command [options]

  Commands
    publish       Write blobs to hyperdrive
    serve         Serve hyperdrive over http

  Options
    --help        Displays this message
`
}

function helpPublish () {
  return `
  Usage
    $ hyperserve publish <storageDir?|/> <path-to-content?|stdin> [options]

  Options
    --url         Content url on hyperdrive. Default: '/'
    --assets      Assets url on hyperdrive.  Default: '/'
    --key         Hyperdrive key. Must pass either storageDir or --key or both
    --serve       Serve over http
    --port        http port to listen on
    --help        Displays this message
`
}
