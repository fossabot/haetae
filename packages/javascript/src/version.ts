import fs from 'fs'
import assert from 'assert/strict'
import upath from 'upath'
import readPkgUp from 'read-pkg-up'
import findUp from 'find-up'
import yaml from 'yaml'
import { getConfigDirname } from '@haetae/core'
import { major, minor, patch, prerelease } from 'semver'

export interface RootDirOption {
  rootDir?: string
}

/**
 * Read package version from yarn.lock
 */
export async function versionFromYarnBerry(
  packageName: string,
  {
    rootDir = getConfigDirname(),
    lockFilename = 'yarn.lock',
  }: RootDirOption & {
    lockFilename?: string
  } = {},
): Promise<string> | never {
  // eslint-disable-next-line no-useless-catch
  try {
    /**
     * For yarn berry, it throws an error (by assertion of package name or 'not found' of package.json).
     * With yarn berry, we cannot access to the package.json of the other packages.
     * Note that access to package.json of the package itself is allowed even with yarn berry.
     * For example, source code of `foo` can read package.json of `foo` with yarn berry.
     * But, source code of `foo` can NOT read package.json of `bar` with yarn berry.
     * For npm, yarn classic, or pnpm, there is no such restriction.
     * So, yarn.lock can be fallback.
     * yarn v1(classic), v2(berry) and v3(berry) are all compaitible for parsing dependency version.
     */
    const yarnLockfilePath = await findUp(lockFilename, { cwd: rootDir })
    assert(!!yarnLockfilePath)
    const yarnLockfile = fs.readFileSync(yarnLockfilePath, {
      encoding: 'utf8',
    })
    const depsLockJson = yaml.parse(yarnLockfile)
    /**
     * For yarn classic, uncomment the snippet below
     *
     * let depsLockJson
     * try {
     *   depsLockJson = yaml.parse(yarnLockfile) // For yarn berry
     * } catch {
     *   /// import yarnClassicLock from '@yarnpkg/lockfile'
     *   depsLockJson = yarnClassicLock.parse(yarnLockfile).object // for yarn classic
     * }
     */

    for (const key in depsLockJson) {
      if (
        Object.prototype.hasOwnProperty.call(depsLockJson, key) &&
        key.startsWith(`${packageName}@`)
      ) {
        const { version } = depsLockJson[key]
        return version
      }
    }

    throw new Error('11111')
  } catch (error) {
    throw error
    // throw new Error(`Version for package ${packageName} cannot be resolved.`)
  }
}

// TODO: test
export async function version(
  packageName: string,
  { rootDir = getConfigDirname() }: RootDirOption = {},
) {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const toVersionInfo = (version: string) => ({
    value: version,
    major: major(version),
    minor: minor(version),
    patch: patch(version),
    prerelease: prerelease(version),
    untilMinor: `${major(version)}.${minor(version)}`,
    untilPatch: `${major(version)}.${minor(version)}.${patch(version)}`,
  })
  try {
    const {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore // `readPkgUp`'s typing and implementation are mismatched. // ISSUE: https://github.com/sindresorhus/read-pkg-up/issues/21
      packageJson: { name, version },
    } = await readPkgUp({
      cwd: upath.dirname(require.resolve(packageName)),
    })
    assert(name, packageName)
    return toVersionInfo(version)
  } catch {
    return toVersionInfo(await versionFromYarnBerry(packageName, { rootDir }))
  }
}
