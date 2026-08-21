# Project Files Host Plugin

`@deepseek-ai/dsh-host-project-files` exposes workspace-confined directory listing, UTF-8 file reads, and version-guarded text saves to a Typert browser client.

## Contract

Every operation names a registered workspace and a relative path. The service resolves that path through `ctx.fs`, rejects paths outside the workspace and protected names (`.git`, `.env*`, `id_rsa`), and follows filesystem target identity so a symlink cannot escape the workspace.

`list` returns alphabetically ordered direct children up to `maxEntries` and marks a partial result as `truncated`. `read` rejects content larger than `maxFileBytes` or invalid UTF-8. `save` uses the version returned by `read`, so a stale browser tab cannot overwrite a newer file.

## Configuration

| Key | Default | Meaning |
| --- | ---: | --- |
| `maxFileBytes` | 2 MiB | Maximum bytes decoded for one read. |
| `maxEntries` | 1,000 | Maximum safe children returned by one list operation. |

## Model Experience

This plugin changes no model prompt, tool schema, token budget, or KV-cache input. It serves browser UI requests only.

## Known Limitations and Deferred Work

The filesystem capability returns a complete directory level before this plugin can apply `maxEntries`; very large directories may still consume host memory during provider listing. A streaming directory capability is required to bound that provider work.
