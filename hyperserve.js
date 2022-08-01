import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import ram from 'random-access-memory'
import { EventEmitter } from 'events'
import http from 'http'
import { defaultHttpHandler } from './http.js'
import fs from 'node:fs/promises'
import path from 'path'
import pull from 'pull-stream'
import { read } from 'pull-files'

let _corestore, _drive, _swarm

export class Hyperserve extends EventEmitter {
  constructor (opts) {
    super()
    this._closing = null
    this.opening = this._open(opts)
    this.opening.catch(console.error)
    this.opened = false
  }

  serve = opts => httpServer(_drive, opts)

  put = async (url, filepath, readFileOpts) => await putBlob(_drive, url, await fs.readFile(filepath, readFileOpts))
  putDir = async (url, directory, glob = '**/*') => await putFiles(_drive, { url, directory, glob })

  delete = async (url, opts = { recursive: true }) => await deleteBlobs(_drive, url, opts)
  del = async (url, opts = { recursive: true }) => await deleteBlobs(_drive, url, opts)

  ready = () => {
    return this.opening
  }

  _open = async ({ corestore = undefined, storageDir = undefined, key = undefined, hyperdriveOpts = undefined, swarmOpts = undefined } = {}) => {
    _corestore = corestore || new Corestore(storageDir || ram)
    await _corestore.ready()
    this.emit('corestore_ready')

    key = isString(key) ? Buffer.from(key, 'hex') : Buffer.isBuffer(key) ? key : undefined

    _drive = new Hyperdrive(_corestore, key, hyperdriveOpts)
    await _drive.ready()
    this.emit('drive_ready')

    _swarm = new Hyperswarm(swarmOpts)
    _swarm.on('connection', (socket, peer) => {
      const { publicKey, client } = peer
      console.warn('[Hyperserve] event:connection', { publicKey: publicKey.toString('hex'), client })
      return _corestore.replicate(socket)
    })

    _swarm.join(_drive.key, swarmOpts)
    await _swarm.flush()
    console.warn('Joined swarm with key:', _drive.key.toString('hex'))
    this.emit('swarm_ready')

    this.opened = true
    this.emit('ready')
  }

  close = () => {
    if (this._closing) return this._closing
    this._closing = this._close()
    return this._closing
  }

  _close = async () => {
    console.log('Closing hyperserve...')
    try {
      await this.ready()
      await _drive.close()
      await _corestore.close()
    } catch (error) {
      console.error('Error closing Hyperserve', error)
    }
    this.opened = false
    this.emit('close')
  }
}

async function httpServer (drive, { handler = defaultHttpHandler, port = 8080 } = {}) {
  const server = http.createServer(handler(drive)).listen(port)
  console.warn('http server listening at:', server.address())
}

function isString (s) {
  return !!(typeof s === 'string' || s instanceof String)
}

async function putBlob (drive, url, blob) {
  const driveContent = await drive.get(url)
  // only put blob if it has changed
  if (compareBlobs(driveContent, blob) !== 0) {
    await drive.put(url, blob)
    console.warn('Put blob:', url)
  } else console.warn('Blob is same, skipping put:', url)
}

function compareBlobs (left, right) {
  if (!left || !right) return -1
  left = Buffer.isBuffer(left) ? left : Buffer.from(left)
  right = Buffer.isBuffer(right) ? right : Buffer.from(right)
  return Buffer.compare(left, right)
}

async function putFiles (drive, { url, directory, glob }) {
  return new Promise((resolve, reject) => {
    pull(
      read(path.join(directory, glob)),
      pull.asyncMap(async (file, callback) => {
        const dest = path.join(url, file.path)
        console.warn('Writing to hyperdrive:', dest)
        await putBlob(drive, dest, file.data)
        callback(null, dest)
      }),
      pull.collect((error, urls) => {
        if (error) reject(error)
        resolve(urls)
      })
    )
  })
}

async function deleteBlobs (drive, url, options) {
  const urls = []
  for await (const { key } of drive.list(url, options)) {
    console.log('Deleting from hyperdrive:', key)
    await drive.del(key)
    urls.push(key)
  }
  return urls
}
