---
name: release-cli
description: Release a new version of the @851-labs/refs CLI to npm. Use when asked to publish, cut, tag, or prepare a refs CLI release, including running release checks, bumping package.json, pushing the cli-vX.Y.Z tag, monitoring the Release CLI GitHub Actions workflow, and smoke-testing the published npm package.
---

# CLI Release Process

Follow these steps to release a new version of the `@851-labs/refs` CLI.

## Pre-flight Checks

Before starting:

1. Verify you are on `main`.
2. Ensure the working tree is clean.
3. Pull the latest changes.

```sh
git status --short --branch
git branch --show-current
git pull origin main
```

Do not release from a dirty worktree or a non-`main` branch.

## Step 1: Run Release Checks

Run the local release verification script:

```sh
bun run release:cli:check
```

This script typechecks, lints with Oxlint, runs tests, builds the CLI, and verifies the built `refs` help output.

If checks fail, fix them before continuing.

## Step 2: Bump Version

Bump the root package version in `package.json`.

```sh
$EDITOR package.json
```

Allowed bump values are:

- `patch`
- `minor`
- `major`
- `prepatch`
- `preminor`
- `premajor`
- `prerelease`

Refresh the Bun lockfile after changing the version:

```sh
bun install --lockfile-only
```

Read the new version:

```sh
node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version"
```

## Step 3: Commit Version Bump

Replace `X.Y.Z` with the new version.

```sh
git add package.json bun.lock
git commit -m "chore: release cli vX.Y.Z"
```

## Step 4: Create And Push Tag

```sh
git tag cli-vX.Y.Z
git push origin main
git push origin cli-vX.Y.Z
```

The `cli-vX.Y.Z` tag starts the `Release CLI` GitHub Actions workflow. The workflow verifies the tag matches `package.json`, runs `bun run release:cli:check`, then publishes to npm using `secrets.NPM_TOKEN`.

## Step 5: Monitor Publish Workflow

Wait for the workflow run to appear:

```sh
gh run list --workflow "Release CLI" --limit 1
```

Then watch it:

```sh
gh run watch
```

If no run appears yet, wait and retry:

```sh
sleep 10
gh run list --workflow "Release CLI" --limit 1
```

If the workflow fails, inspect logs:

```sh
gh run view --log-failed
```

## Step 6: Smoke Test Published Package

Use `npx` for the install smoke test because it tends to resolve freshly published exact versions reliably.

```sh
npx @851-labs/refs@X.Y.Z --help
bun pm view @851-labs/refs version
```

Confirm `bun pm view` returns `X.Y.Z`.

## Troubleshooting

### Tests Fail

Fix failing tests before releasing.

### Tag Already Exists

Delete the local and remote tag, then retry:

```sh
git tag -d cli-vX.Y.Z
git push origin :refs/tags/cli-vX.Y.Z
```

### Push Rejected

Pull latest and retry:

```sh
git pull --rebase origin main
```

### Publish Workflow Fails After Tag Push

Fix the failure on `main`, delete the failed tag locally and remotely, then create a new tag from the corrected commit.
