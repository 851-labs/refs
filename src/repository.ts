import { Console, Effect, FileSystem, Path } from "effect"
import { getRemoteDefaultBranch, gitRun } from "./git.ts"
import {
  assertNoDuplicateReferences,
  deriveNameFromUrl,
  effectiveName,
  emptyConfig,
  findReferenceIndex,
  formatConfig,
  normalizeEntry,
  normalizeGitUrl,
  parseConfig,
  type ReferenceEntry,
  type RefsConfig,
  RefsError,
  sortConfig,
  validateName
} from "./model.ts"

const refsJsonFileName = "refs.json"
const referencesDirectoryName = "references"
const gitignoreFileName = ".gitignore"

export interface Workspace {
  readonly root: string
  readonly referencesDir: string
  readonly refsJsonPath: string
  readonly gitignorePath: string
}

export const makeWorkspace = Effect.fn("makeWorkspace")(function*(root: string) {
  const path = yield* Path.Path
  return {
    root,
    referencesDir: path.join(root, referencesDirectoryName),
    refsJsonPath: path.join(root, refsJsonFileName),
    gitignorePath: path.join(root, gitignoreFileName)
  } satisfies Workspace
})

export const loadConfig = Effect.fn("loadConfig")(function*(workspace: Workspace) {
  const fs = yield* FileSystem.FileSystem
  const exists = yield* fs.exists(workspace.refsJsonPath)
  if (!exists) {
    return emptyConfig
  }

  const text = yield* fs.readFileString(workspace.refsJsonPath).pipe(
    Effect.mapError((cause) => new RefsError(`Could not read ${refsJsonFileName}`, { cause }))
  )

  return yield* Effect.try({
    try: () => parseConfig(text),
    catch: (cause) => cause instanceof RefsError ? cause : new RefsError(`Could not parse ${refsJsonFileName}`, { cause })
  })
})

export const saveConfig = Effect.fn("saveConfig")(function*(workspace: Workspace, config: RefsConfig) {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(workspace.refsJsonPath, formatConfig(config)).pipe(
    Effect.mapError((cause) => new RefsError(`Could not write ${refsJsonFileName}`, { cause }))
  )
})

export const ensureGitignore = Effect.fn("ensureGitignore")(function*(workspace: Workspace) {
  const fs = yield* FileSystem.FileSystem
  const exists = yield* fs.exists(workspace.gitignorePath)
  const current = exists ? yield* fs.readFileString(workspace.gitignorePath) : ""
  const lines = current.split(/\r?\n/u)

  if (lines.some((line) => line.trim() === "references/")) {
    return
  }

  const next = current.length === 0
    ? "references/\n"
    : current.endsWith("\n")
    ? `${current}references/\n`
    : `${current}\nreferences/\n`

  yield* fs.writeFileString(workspace.gitignorePath, next).pipe(
    Effect.mapError((cause) => new RefsError("Could not update .gitignore", { cause }))
  )
})

export const addReference = Effect.fn("addReference")(function*(
  workspace: Workspace,
  url: string,
  nameOverride?: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* loadConfig(workspace)
  const derivedName = validateName(deriveNameFromUrl(url))
  const name = nameOverride === undefined ? derivedName : validateName(nameOverride.trim())
  const entry = normalizeEntry({
    url,
    name: name === derivedName ? undefined : name
  })
  const nextReferences = [...config.references, entry]

  assertNoDuplicateReferences(nextReferences)

  const target = path.join(workspace.referencesDir, name)
  if (yield* fs.exists(target)) {
    return yield* Effect.fail(new RefsError(`Reference directory already exists: ${target}`))
  }

  yield* ensureGitignore(workspace)
  yield* fs.makeDirectory(workspace.referencesDir, { recursive: true })
  yield* cloneReference(workspace, entry)
  yield* saveConfig(workspace, sortConfig({ version: 1, references: nextReferences }))
  yield* Console.log(`Added ${name}`)
})

export const removeReference = Effect.fn("removeReference")(function*(workspace: Workspace, input: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* loadConfig(workspace)
  const index = findReferenceIndex(config.references, input)
  if (index === -1) {
    return yield* Effect.fail(new RefsError(`Reference not found: ${input}`))
  }

  const entry = config.references[index]!
  const name = effectiveName(entry)
  const target = path.join(workspace.referencesDir, name)
  yield* fs.remove(target, { recursive: true, force: true })
  yield* saveConfig(workspace, {
    version: 1,
    references: config.references.filter((_, currentIndex) => currentIndex !== index)
  })
  yield* Console.log(`Removed ${name}`)
})

export const syncReferences = Effect.fn("syncReferences")(function*(workspace: Workspace) {
  const config = yield* loadConfig(workspace)
  yield* ensureGitignore(workspace)
  for (const entry of config.references) {
    yield* cloneReference(workspace, entry)
  }
  yield* Console.log(`Synced ${config.references.length} reference${config.references.length === 1 ? "" : "s"}`)
})

export const cleanReferences = Effect.fn("cleanReferences")(function*(workspace: Workspace) {
  const fs = yield* FileSystem.FileSystem
  const entries = yield* fs.exists(workspace.referencesDir).pipe(
    Effect.flatMap((exists) => exists ? fs.readDirectory(workspace.referencesDir) : Effect.succeed([]))
  )

  const path = yield* Path.Path
  for (const entry of entries) {
    yield* fs.remove(path.join(workspace.referencesDir, entry), { recursive: true, force: true })
  }

  yield* Console.log(`Cleaned ${entries.length} reference${entries.length === 1 ? "" : "s"}`)
})

export const cloneReference = Effect.fn("cloneReference")(function*(workspace: Workspace, rawEntry: ReferenceEntry) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const entry = normalizeEntry(rawEntry)
  const name = effectiveName(entry)
  const target = path.join(workspace.referencesDir, name)
  const temp = path.join(workspace.referencesDir, `.${name}.tmp-${globalThis.process.pid}-${Date.now()}`)
  const branch = yield* getRemoteDefaultBranch(entry.url)

  yield* fs.makeDirectory(workspace.referencesDir, { recursive: true })
  yield* fs.remove(temp, { recursive: true, force: true })
  yield* gitRun(["clone", "--depth=1", "--branch", branch, normalizeGitUrl(entry.url), temp], { cwd: workspace.root }).pipe(
    Effect.onError(() => fs.remove(temp, { recursive: true, force: true }).pipe(Effect.ignore))
  )
  yield* fs.remove(target, { recursive: true, force: true })
  yield* fs.rename(temp, target).pipe(
    Effect.mapError((cause) => new RefsError(`Could not move ${temp} to ${target}`, { cause })),
    Effect.onError(() => fs.remove(temp, { recursive: true, force: true }).pipe(Effect.ignore))
  )
})
