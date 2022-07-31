import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import ram from 'random-access-memory'
import { EventEmitter } from 'events'

let _corestore, _drive, _swarm

export class Hyperserve extends EventEmitter {
  constructor (opts) {
    super()
    this._closing = null
    this.opening = this._open(opts)
    this.opening.catch(console.error)
    this.opened = false
  }

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

function isString (s) {
  return !!(typeof s === 'string' || s instanceof String)
}
