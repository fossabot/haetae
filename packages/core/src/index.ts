import path from 'path'
import assert from 'assert/strict'
import fs from 'fs'
import memoizee from 'memoizee'
import serialize from 'serialize-javascript'
// eslint-disable-next-line import/no-extraneous-dependencies
import { Required } from 'utility-types'
import produce from 'immer'

export const { name: packageName, version: packageVersion } = (() => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'package.json'), {
    encoding: 'utf8',
  })
  return JSON.parse(content)
})()

let currentCommand: string | undefined

export const setCurrentCommand = (command: string) => {
  currentCommand = command
}

export const getCurrentCommand = (): string => {
  if (!currentCommand) {
    throw new Error(
      `currentCommand has invalid value or not set: ${currentCommand}`,
    )
  }
  return currentCommand
}

export const defaultConfigFile = 'haetae.config.js'

let configFilename: string | undefined

export const setConfigFilename = (filename: string | undefined) => {
  configFilename = filename
}

/**
 * @memoized
 */
export const getConfigFilename = memoizee((): string => {
  // TODO: finding config file recursively(parental)
  let filename =
    configFilename || (process.env.HAETAE_CONFIG_FILE as string) || '.'
  assert(filename, '$HAETAE_CONFIG_FILE is not given.')
  if (!path.isAbsolute(filename)) {
    filename = path.join(process.cwd(), filename)
  }
  try {
    if (fs.statSync(filename).isDirectory()) {
      filename = path.join(filename, defaultConfigFile)
      assert(fs.existsSync(filename), 'Path to config file is invalid')
      return filename
    }
    return filename
  } catch {
    throw new Error('Path to config file is non-existent path.')
  }
})

// todo: set/get current config dirname
export const getConfigDirname = () => path.dirname(getConfigFilename())

export type HaetaeRecordEnv = Record<string, unknown>

export interface HaetaeRecord {
  time: number | string // ISO format
  env: HaetaeRecordEnv
  // '@haetae/git'?: {
  //   commit: string
  // }
  [key: string]: unknown
}

export type HaetaePreRecord = Omit<HaetaeRecord, 'time' | 'env'>

export interface HaetaeStore {
  version: string
  commands: {
    [command: string]: HaetaeRecord[]
  }
}

export interface HaetaeCommand {
  run: () => HaetaePreRecord | Promise<HaetaePreRecord>
  env: () => HaetaeRecordEnv | Promise<HaetaeRecordEnv>
}

export interface HaetaePreConfig {
  commands: {
    [command: string]: HaetaeCommand
  }
  // maxLimit?: number // Infinity
  // maxAge?: number // Infinity
  // It should be an absolute or relative path (relative to config file path)
  storeFile?: string
}

export type HaetaeConfig = Required<HaetaePreConfig, 'storeFile'>

export const defaultStoreFile = 'haetae.store.json'

/**
 *
 * @param preConfig: config object provided from user.
 * @returns
 */
export function configure({
  commands,
  storeFile,
}: HaetaePreConfig): HaetaePreConfig {
  for (const command in commands) {
    if (Object.prototype.hasOwnProperty.call(commands, command)) {
      const { run, env } = commands[command]
      assert(
        typeof run === 'function',
        `commands.${command}.run is invalid. It should be a function.`,
      )
      // TODO: https://github.com/jjangga0214/haetae/issues/4
      assert(
        typeof env === 'function',
        `commands.${command}.env is invalid. It should be a function.`,
      )
    }
  }
  return {
    storeFile,
    commands,
  }
}

export interface GetConfigOptions {
  filename?: string | Promise<string> // It should be an absolute path
}

/**
 * The function will fill in default values if not already configured..
 * @memoized
 */
export const getConfig = memoizee(
  async ({
    filename = getConfigFilename(),
  }: GetConfigOptions = {}): Promise<HaetaeConfig> => {
    let configFilename = await filename
    try {
      if (fs.statSync(configFilename).isDirectory()) {
        configFilename = path.join(configFilename, defaultConfigFile)
      }
    } catch {
      throw new Error(
        `Config filename is given as "${configFilename}", but it does not exist.`,
      )
    }

    const preConfigFromFile = await import(configFilename)
    // delete preConfigFromFile.default
    const preConfig: HaetaePreConfig = configure(preConfigFromFile)

    for (const command in preConfig.commands) {
      if (Object.prototype.hasOwnProperty.call(preConfig.commands, command)) {
        // Setting default: env
        preConfig.commands[command].env =
          preConfig.commands[command].env || (() => ({}))
      }
    }

    // Setting default: storeFile
    preConfig.storeFile = preConfig.storeFile || '.'

    if (!path.isAbsolute(preConfig.storeFile)) {
      preConfig.storeFile = path.join(
        path.dirname(configFilename),
        preConfig.storeFile,
      )
    }

    // When it's given as a directory.
    // Keep in mind that store file might not exist, yet.
    // So you must NOT use `fs.statSync(preConfig.storeFile).isDirectory()`.
    if (!preConfig.storeFile.endsWith('.json')) {
      preConfig.storeFile = path.join(preConfig.storeFile, defaultStoreFile)
    }

    return preConfig as HaetaeConfig
  },
  {
    normalizer: serialize,
  },
)

export function initNewStore(): HaetaeStore {
  return { version: packageVersion, commands: {} }
}

export interface GetStoreOptions {
  config?: HaetaeConfig | Promise<HaetaeConfig>
  filename?: string | Promise<string>
  // When there's no store file yet.
  fallback?: () => HaetaeStore | Promise<HaetaeStore>
}

/**
 * @throw if the file does not exist
 * `config.storeFile` should be absolute path
 * @memoized
 */
export const getStore = memoizee(
  async ({
    config = getConfig(),
    filename = (async () => (await config).storeFile)(),
    fallback = initNewStore,
  }: GetStoreOptions = {}): Promise<HaetaeStore> => {
    let rawStore
    try {
      rawStore = fs.readFileSync(await filename, {
        encoding: 'utf8',
      })
    } catch {
      return fallback()
    }
    const store = JSON.parse(rawStore)
    return store
  },
  {
    normalizer: serialize,
  },
)

export interface GetRecordsOptions {
  command?: string | Promise<string> // record store file path
  store?: HaetaeStore | Promise<HaetaeStore>
}

export async function getRecords({
  command = getCurrentCommand(),
  store = getStore(),
}: GetRecordsOptions = {}): Promise<HaetaeRecord[] | undefined> {
  return (await store).commands[await command]
}

export interface CommandFromConfig {
  command?: string | Promise<string>
  config?: HaetaeConfig | Promise<HaetaeConfig>
}

/**
 * @memoized
 */
export const invokeEnv = memoizee(
  async ({
    command = getCurrentCommand(),
    config = getConfig(),
  }: CommandFromConfig = {}): Promise<HaetaeRecordEnv> =>
    (await config)?.commands[await command]?.env(),
  {
    normalizer: serialize,
  },
)

export const invokeRun = async ({
  command = getCurrentCommand(),
  config = getConfig(),
}: CommandFromConfig = {}): Promise<HaetaePreRecord> => {
  const preRecord = (await config)?.commands[await command]?.run()
  assert(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    preRecord.time === undefined,
    'A command function should not return an record(object) with a key named "time". The key "time" is statically reserved by Haetae, and automatically filled in.',
  )
  assert(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    preRecord.env === undefined,
    'A command function should not return an record(object) with a key named "env". The key "env" is statically reserved by Haetae, and automatically filled in.',
  )
  return preRecord
}

export interface GetRecordOptions extends GetRecordsOptions {
  env?: HaetaeRecordEnv | Promise<HaetaeRecordEnv>
}

/**
 * @returns true if those envs are identical, false otherwise.
 */
export async function compareEnvs(
  one: HaetaeRecordEnv | Promise<HaetaeRecordEnv>,
  theOther: HaetaeRecordEnv | Promise<HaetaeRecordEnv>,
) {
  return JSON.stringify(await one) === JSON.stringify(await theOther)
}

export async function getRecord({
  command = getCurrentCommand(),
  env = invokeEnv({ command }),
  store = getStore(),
}: GetRecordOptions = {}): Promise<HaetaeRecord | undefined> {
  const records = await getRecords({ command, store })
  if (records) {
    for (const record of records) {
      if (await compareEnvs(env, record.env)) {
        return record
      }
    }
  }
  return undefined
}

export interface MapRecordOptions {
  time?: number | string
  env?: HaetaeRecordEnv | Promise<HaetaeRecordEnv>
  // "pre" is different from "prev", which means "previous". Instead, "pre" means "given from user's config", so default values should be filled in."
  preRecord?: HaetaePreRecord | Promise<HaetaePreRecord>
}

export async function mapRecord({
  time = new Date().toISOString(),
  env = invokeEnv(),
  preRecord = invokeRun(),
}: MapRecordOptions): Promise<HaetaeRecord> {
  return {
    time,
    env: await env,
    ...(await preRecord),
  }
}

export interface MapStoreOptions {
  command?: string | Promise<string>
  store?: HaetaeStore | Promise<HaetaeStore>
  record?: HaetaeRecord | Promise<HaetaeRecord>
}

/**
 * This creates a new store from previous store
 * The term map is coined from map function
 */
export async function mapStore({
  command = getCurrentCommand(),
  store = getStore(),
  record = mapRecord({
    env: invokeEnv({ command }),
    preRecord: invokeRun({ command }),
  }),
}: MapStoreOptions = {}) {
  return produce(await store, async (draft) => {
    /* eslint-disable no-param-reassign */
    record = await record
    command = await command
    draft.version = packageVersion
    draft.commands = draft.commands || {}
    draft.commands[command] = draft.commands[command] || []
    const records = draft.commands[command]
    for (const [index, oldRecord] of records.entries()) {
      try {
        if (await compareEnvs(record.env, oldRecord.env)) {
          records[index] = record
          return draft
        }
      } catch {
        // console.error(error)
        throw new Error('`env` must be able to be stringified.')
      }
    }
    draft.commands[command].push(await record)
    /* eslint-enable no-param-reassign */
    return draft
  })
}

export interface SaveStoreOptions {
  filename?: string | Promise<string>
  store?: HaetaeStore | Promise<HaetaeStore>
}

export async function saveStore({
  filename = getConfig().then((config) => config.storeFile),
  store = mapStore(),
}: SaveStoreOptions = {}) {
  // TODO: await
  fs.writeFileSync(
    await filename,
    `${JSON.stringify(await store, undefined, 2)}\n`, // trailing empty line
    {
      encoding: 'utf8',
    },
  )
  getStore.clear() // memoization cache clear
}
