import { connect, isRetryableError, type Framer } from "framer-api"
import type { ServerConfig } from "./config.js"

type FramerConnector = typeof connect

export interface FramerProvider {
  withFramer<T>(operation: (framer: Framer) => Promise<T>): Promise<T>
}

export class FramerConnection implements FramerProvider {
  #framerPromise: Promise<Framer> | null = null

  constructor(
    private readonly config: ServerConfig,
    private readonly connector: FramerConnector = connect,
  ) {}

  async get(): Promise<Framer> {
    if (!this.#framerPromise) {
      this.#framerPromise = this.connector(this.config.projectUrl, this.config.apiKey, {
        clientId: this.config.clientId,
      }).catch(error => {
        this.#framerPromise = null
        throw error
      })
    }

    return this.#framerPromise
  }

  async withFramer<T>(operation: (framer: Framer) => Promise<T>): Promise<T> {
    const framer = await this.get()

    try {
      return await operation(framer)
    } catch (error) {
      if (!this.#isRecoverable(error)) throw error

      await this.disconnect()
      return operation(await this.get())
    }
  }

  async disconnect(): Promise<void> {
    const framerPromise = this.#framerPromise
    this.#framerPromise = null

    if (!framerPromise) return

    try {
      const framer = await framerPromise
      await framer.disconnect()
    } catch {
      // Shutdown cleanup should be best effort.
    }
  }

  #isRecoverable(error: unknown): boolean {
    if (isRetryableError(error)) return true
    if (!(error instanceof Error)) return false

    return /connection closed|project_closed|timeout|no connection/iu.test(error.message)
  }
}
