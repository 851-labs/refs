import { Effect, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { RefsError } from "./model.ts"

export interface GitCommandOptions {
  readonly cwd?: string
}

export const gitOutput = Effect.fn("gitOutput")(function*(args: ReadonlyArray<string>, options: GitCommandOptions = {}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const output = yield* Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", args, {
        cwd: options.cwd,
        stderr: "pipe"
      })
    )
    const collected = yield* handle.all.pipe(
      Stream.decodeText(),
      Stream.mkString
    )
    const exitCode = yield* handle.exitCode

    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* Effect.fail(new RefsError(`git ${args.join(" ")} failed with exit code ${exitCode}: ${String.trim(collected)}`))
    }

    return collected
  })).pipe(
    Effect.mapError((cause) => cause instanceof RefsError ? cause : new RefsError(`git ${args.join(" ")} failed`, { cause }))
  )

  return String.trim(output)
})

export const gitRun = Effect.fn("gitRun")(function*(args: ReadonlyArray<string>, options: GitCommandOptions = {}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("git", args, {
      cwd: options.cwd,
      stderr: "inherit",
      stdout: "inherit"
    })
  ).pipe(
    Effect.mapError((cause) => new RefsError(`git ${args.join(" ")} failed`, { cause }))
  )

  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* Effect.fail(new RefsError(`git ${args.join(" ")} failed with exit code ${exitCode}`))
  }
})

export const findGitRoot = Effect.fn("findGitRoot")(function*() {
  return yield* gitOutput(["rev-parse", "--show-toplevel"]).pipe(
    Effect.mapError(() => new RefsError("refs must be run inside a git repository"))
  )
})

export const getRemoteDefaultBranch = Effect.fn("getRemoteDefaultBranch")(function*(url: string) {
  const output = yield* gitOutput(["ls-remote", "--symref", url, "HEAD"])
  const firstLine = output.split(/\r?\n/u).find((line) => line.startsWith("ref: refs/heads/"))
  const branch = firstLine?.match(/^ref: refs\/heads\/(.+)\s+HEAD$/u)?.[1]
  if (branch === undefined || branch.length === 0) {
    return yield* Effect.fail(new RefsError(`Could not resolve remote default branch for ${url}`))
  }
  return branch
})
