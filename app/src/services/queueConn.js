/**
 * @module QueueConnection
 *
 * Create and check the connection for a Bull queue.
 *
 * @see QueueService
 *
 * @see Bull
 *
 * @exports QueueConnection
 */
const Bull = require('bull');
const config = require('config');
const log = require('npmlog');
const Redis = require('ioredis');
const utils = require('../components/utils');
class QueueConnection {
  /**
   * Creates a new QueueConnection with default configuration.
   * @class
   */
  constructor() {
    if (!QueueConnection.instance) {
      this._connected = false;
      this.queue = new Bull('ches', {
        // The redis instance must be created inside the function to behave correctly
        // https://github.com/OptimalBits/bull/issues/1401#issuecomment-519443898
        createClient: this._createClient()
      });
      QueueConnection.instance = this;
    }

    return QueueConnection.instance;
  }

  _createClient() {
    const redisConfig = {
      host: config.get('redis.host'),
      password: config.get('redis.password'),
      // Force reconnect when the error contains "READONLY"
      reconnectOnError: (err) => {
        if (err.message.includes('READONLY')) {
          log.warn('ioredis', 'Connection is READONLY. Attempting to reconnect to master...');
          return true;
        }
      },
      showFriendlyErrorStack: true
    };

    if (config.has('redis.name') || config.has('redis.sentinels')) {
      redisConfig.name = config.get('redis.name');
      redisConfig.sentinels = JSON.parse(config.get('redis.sentinels'));
    }

    console.log(redisConfig);

    const redis = new Redis(redisConfig);

    redis.on('error', (error) => {
      log.error(`Redis Errored: ${error}`);
    });
    redis.on('end', (error) => {
      log.error(`Redis Ended: ${error}`);
      this._connected = false;
    });
    redis.on('ready', () => {
      log.info('Redis Ready.');
    });
    redis.on('connect', () => {
      log.info('Redis Connected');
      this._connected = true;
    });

    return redis;
  }

  /**
   *  @function queue
   *  Gets the underlying Bull queue
   */
  get queue() {
    return this._queue;
  }

  /**
   *  @function queue
   *  Sets the underlying Bull queue
   *  Also sets the globalQueue object
   *  @param {object} v - a new Bull instance
   */
  set queue(v) {
    this._queue = v;
    // this._connected = false;
  }

  /** @function connected
   *  True or false if connected.
   */
  get connected() {
    return this._connected;
  }

  /**
   *  @function close
   *  Will close the globally stored QueueConnection
   */
  static close() {
    if (this._connected && this.queue) {
      try {
        this.queue.close();
        this._connected = false;
        log.info('QueueConnection', 'Disconnected');
      } catch (e) {
        log.error(e);
      }
    }
  }

  /**
   *  @function checkConnection
   *  Checks the current QueueConnection
   *  @param {integer} [timeout=1] Number of seconds to retry before failing out
   *  @returns boolean True if queue is connected
   */
  async checkConnection(timeout = 5) {
    // Redis does not establish connection immediately.
    // You need a small grace period checking for the status.
    for (let i = 0; i < timeout; i++) {
      // this._connected = this.queue.clients[0].status === 'ready';
      if (this.connected) break;
      await utils.wait(1000);
    }
    if (!this.connected) {
      log.error('QueueConnection', 'Unable to connect to queue');
    }
    return this._connected;
  }
}

module.exports = QueueConnection;
