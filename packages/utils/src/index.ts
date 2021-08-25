import globby from 'globby'
import path from 'path'
import { getConfigDirnameFromEnvVar } from '@haetae/core'

interface LoadByGlobOptions {
  rootDir?: string // This is a facade option for globbyOptions.cwd
  preConfiguredPatterns?: readonly string[]
  globbyOptions?: globby.GlobbyOptions
}

export async function loadByGlob(
  patterns: readonly string[],
  {
    rootDir = getConfigDirnameFromEnvVar(),
    preConfiguredPatterns = [
      `!${path.join('**', 'node_modules')}`,
      `!${path.join('**', 'jspm_packages')}`,
      `!${path.join('**', 'web_modules')}`, // Snowpack dependency directory (https://snowpack.dev/)
    ],
    globbyOptions = {
      cwd: rootDir,
      gitignore: true,
    },
  }: LoadByGlobOptions = {},
): Promise<string[]> {
  const globbyRes = await globby(
    [...(preConfiguredPatterns as readonly string[]), ...patterns],
    globbyOptions,
  )
  return globbyRes.map((p) => path.join(rootDir, p))
}