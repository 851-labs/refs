import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { normalizeGitUrl } from "../src/model.ts"

const cli = join(import.meta.dirname, "..", "src", "bin.ts")
const execFileAsync = promisify(execFile)

let tempRoot: string

const run = async (cwd: string, args: ReadonlyArray<string>) => {
  try {
    const result = await execFileAsync("bun", ["run", cli, ...args], { cwd })
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    const result = error as { readonly code?: number; readonly stdout?: string; readonly stderr?: string }
    return {
      exitCode: result.code ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    }
  }
}

const git = async (cwd: string, args: ReadonlyArray<string>) => {
  await execFileAsync("git", args, { cwd })
}

const createRemote = async (name: string) => {
  const source = join(tempRoot, `${name}-source`)
  const remote = join(tempRoot, `${name}.git`)
  await mkdir(source, { recursive: true })
  await git(source, ["init", "--initial-branch=main"])
  await git(source, ["config", "user.email", "refs@example.com"])
  await git(source, ["config", "user.name", "Refs Test"])
  await writeFile(join(source, "README.md"), `# ${name}\n`)
  await git(source, ["add", "."])
  await git(source, ["commit", "-m", "initial"])
  await git(source, ["clone", "--bare", source, remote])
  return remote
}

const createWorkspace = async () => {
  const workspace = join(tempRoot, "workspace")
  await mkdir(workspace, { recursive: true })
  await git(workspace, ["init", "--initial-branch=main"])
  return workspace
}

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "refs-test-"))
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe("refs cli", () => {
  it("adds and removes a reference", async () => {
    const workspace = await createWorkspace()
    const remote = await createRemote("alpha")

    const add = await run(workspace, ["add", remote])
    expect(add.exitCode).toBe(0)
    await expect(stat(join(workspace, "references", "alpha"))).resolves.toBeTruthy()
    await expect(readFile(join(workspace, ".gitignore"), "utf8")).resolves.toContain("references/")
    await expect(readFile(join(workspace, "refs.json"), "utf8")).resolves.toContain(normalizeGitUrl(remote))

    const duplicate = await run(workspace, ["add", remote])
    expect(duplicate.exitCode).not.toBe(0)

    const remove = await run(workspace, ["remove", remote])
    expect(remove.exitCode).toBe(0)
    await expect(stat(join(workspace, "references", "alpha"))).rejects.toThrow()
    await expect(readFile(join(workspace, "refs.json"), "utf8")).resolves.toContain("\"references\": []")
  })

  it("supports custom names, pull/update reconciliation, and clean", async () => {
    const workspace = await createWorkspace()
    const remote = await createRemote("beta")

    expect((await run(workspace, ["add", remote, "custom-beta"])).exitCode).toBe(0)
    await rm(join(workspace, "references", "custom-beta"), { recursive: true, force: true })

    expect((await run(workspace, ["pull"])).exitCode).toBe(0)
    await expect(stat(join(workspace, "references", "custom-beta"))).resolves.toBeTruthy()

    await writeFile(join(workspace, "references", "custom-beta", "LOCAL.txt"), "stale")
    expect((await run(workspace, ["update"])).exitCode).toBe(0)
    await expect(stat(join(workspace, "references", "custom-beta", "LOCAL.txt"))).rejects.toThrow()

    expect((await run(workspace, ["clean"])).exitCode).toBe(0)
    await expect(stat(join(workspace, "references", "custom-beta"))).rejects.toThrow()
    await expect(readFile(join(workspace, "refs.json"), "utf8")).resolves.toContain("custom-beta")
  })
})
