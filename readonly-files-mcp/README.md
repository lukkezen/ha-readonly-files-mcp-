# HA Read-only Files MCP

A small Home Assistant add-on that exposes only explicitly configured folders through MCP.

## Security model

- Home Assistant mounts `/share` and `/media` into this add-on **read-only**.
- Talon itself never receives filesystem access to those mounts.
- Only configured source folders are exposed by MCP tools.
- Path traversal and symlink escape outside a source are blocked.
- There are no write, rename, move, or delete tools for source folders.
- `copy_to_export` copies a source file into this add-on's private `/data/exports` area. It never alters the source.
- MCP requests require a Bearer token.

## Tools

- `list_sources`
- `list_files` — `source` is optional. With no arguments it recursively returns all files from all configured sources, newest first. Each result includes `source`, `path`, `size` and `mtime`.
- `read_text` — requires `source` and `path` so reads remain unambiguous.
- `search_text` — requires `query`; `source` is optional. Without a source it searches all configured sources.
- `copy_to_export`
- `list_exports`

The MCP endpoint is `http://<addon-host>:3000/mcp`.
