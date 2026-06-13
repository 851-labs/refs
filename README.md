# refs

`refs` manages shallow git repositories in a repo-local `./references` folder.

```sh
refs add https://github.com/Effect-TS/effect-smol
refs add https://github.com/example/project custom-name
refs pull
refs update
refs remove effect-smol
refs clean
```

Reference checkouts are ignored by git. The committed `refs.json` file is the
source of truth for rebuilding them.
