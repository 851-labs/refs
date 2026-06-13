# refs

`refs` is a small CLI for managing shallow git reference repositories in a
repo-local `./references` folder.

It is meant for projects where coding agents or developers need nearby source
references without committing full cloned repositories. The actual checkouts are
ignored by git; the committed `refs.json` file is the source of truth for
rebuilding them.

## Quick Start

Run without installing:

```sh
npx @851-labs/refs add https://github.com/Effect-TS/effect-smol
pnpm dlx @851-labs/refs pull
bunx @851-labs/refs update
```

Or install globally:

```sh
npm install -g @851-labs/refs
refs --help
```

## Commands

Add a reference:

```sh
refs add https://github.com/Effect-TS/effect-smol
```

Add a reference with a custom local folder name:

```sh
refs add https://github.com/example/project project-reference
```

Remove a reference by name:

```sh
refs remove effect-smol
```

Remove a reference by URL:

```sh
refs remove https://github.com/Effect-TS/effect-smol
```

Rebuild all configured references from their remote default branches:

```sh
refs pull
refs update
```

`pull` and `update` both reconcile `refs.json` into `./references`: missing
checkouts are cloned, and existing checkouts are replaced with fresh shallow
clones.

Delete local reference checkouts while keeping `refs.json`:

```sh
refs clean
```

## How It Works

`refs add` creates or updates two repo-local files:

```text
references/    # ignored clone cache
refs.json      # committed reference registry
```

Example `refs.json`:

```json
{
  "version": 1,
  "references": [
    {
      "url": "https://github.com/Effect-TS/effect-smol"
    },
    {
      "url": "https://github.com/example/project",
      "name": "project-reference"
    }
  ]
}
```

The CLI also makes sure `.gitignore` contains:

```gitignore
references/
```

Each checkout is cloned with `--depth=1` from the repository's remote default
branch to keep disk usage low.

## Development

Install dependencies:

```sh
bun install
```

Run the CLI from source:

```sh
bun run cli --help
bun run cli add https://github.com/Effect-TS/effect-smol
```

Run checks:

```sh
bun run check
bun run lint
bun run test
```

Build the published Node-compatible binary:

```sh
bun run build
node dist/bin.js --help
```
