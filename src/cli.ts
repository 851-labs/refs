import { readFileSync } from "node:fs"
import { Console, Effect, Option } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { findGitRoot } from "./git.ts"
import { addReference, cleanReferences, makeWorkspace, removeReference, syncReferences, type Workspace } from "./repository.ts"

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }

const withWorkspace = <A, E, R>(run: (workspace: Workspace) => Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const gitRoot = yield* findGitRoot()
    const workspace = yield* makeWorkspace(gitRoot)
    return yield* run(workspace)
  })

const root = Command.make("refs").pipe(
  Command.withDescription("Manage shallow git reference repositories in ./references")
)

const add = Command.make(
  "add",
  {
    url: Argument.string("repo-url").pipe(
      Argument.withDescription("Git repository URL to clone")
    ),
    name: Argument.string("name").pipe(
      Argument.optional,
      Argument.withDescription("Optional local reference name")
    )
  },
  Effect.fn("refs.add")(function*({ url, name }) {
    const nameOverride = Option.getOrUndefined(name)
    yield* withWorkspace((workspace) => addReference(workspace, url, nameOverride))
  })
).pipe(
  Command.withDescription("Add a reference repository"),
  Command.withExamples([
    {
      command: "refs add https://github.com/Effect-TS/effect-smol",
      description: "Add a reference using its repository name"
    },
    {
      command: "refs add https://github.com/org/project local-project",
      description: "Add a reference with a custom local name"
    }
  ])
)

const remove = Command.make(
  "remove",
  {
    reference: Argument.string("name-or-url").pipe(
      Argument.withDescription("Configured reference name or repository URL")
    )
  },
  Effect.fn("refs.remove")(function*({ reference }) {
    yield* withWorkspace((workspace) => removeReference(workspace, reference))
  })
).pipe(
  Command.withDescription("Remove a configured reference")
)

const update = Command.make(
  "update",
  {},
  Effect.fn("refs.update")(function*() {
    yield* withWorkspace(syncReferences)
  })
).pipe(
  Command.withDescription("Rebuild all configured references from their remote default branches")
)

const pull = Command.make(
  "pull",
  {},
  Effect.fn("refs.pull")(function*() {
    yield* withWorkspace(syncReferences)
  })
).pipe(
  Command.withDescription("Rebuild all missing or stale configured references")
)

const clean = Command.make(
  "clean",
  {},
  Effect.fn("refs.clean")(function*() {
    yield* withWorkspace(cleanReferences)
  })
).pipe(
  Command.withDescription("Delete local reference checkouts while keeping refs.json")
)

export const command = root.pipe(
  Command.withSubcommands([add, remove, update, pull, clean])
)

export const run = command.pipe(
  Command.run({
    version: packageJson.version
  }),
  Effect.catchTag("RefsError", (error) =>
    Console.error(error.message).pipe(
      Effect.flatMap(() => Effect.fail(error))
    )
  )
)
