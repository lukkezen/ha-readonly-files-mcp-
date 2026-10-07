# Changelog

## 0.2.0

- Makes the MCP listening port configurable through the Home Assistant add-on configuration.
- Changes the default listening port to `3100` to reduce collisions with services already using port 3000.
- Validates the configured port before starting the server.

## 0.1.0

- Initial Home Assistant add-on and MCP server.
- Explicit source allowlist for `share` and `media`.
- Home Assistant mounts source roots read-only.
- Read/list/search tools only for source folders.
- Adds safe `copy_to_export` into private add-on storage.
- Bearer-token authentication.
- Blocks path traversal and symlink escape.
