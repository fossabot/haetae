import { getConfigDirnameFromEnvVar } from '@haetae/core'
import path from 'path'
import fs from 'fs'

import dependencyTree from 'dependency-tree'

export interface DependsOnOptions {
  tsConfig?: string
  rootDir?: string
  // TODO: more options
}

export async function dependsOn(
  filenames: readonly string[],
  { tsConfig, rootDir = getConfigDirnameFromEnvVar() }: DependsOnOptions = {},
) {
  // default option.tsConfig if exists
  if (fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
    // eslint-disable-next-line no-param-reassign
    tsConfig = tsConfig || path.join(rootDir, 'tsconfig.json')
  }
  return (target: string): boolean => {
    // This includes target file itself as well.
    const deepDepsList = dependencyTree.toList({
      directory: rootDir,
      filename: target,
      tsConfig,
    })
    for (const filename of filenames) {
      if (deepDepsList.includes(filename)) {
        return true
      }
    }
    return false
  }
}