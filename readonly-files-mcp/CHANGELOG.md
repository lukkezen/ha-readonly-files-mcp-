# Changelog

## 0.2.2

- Publishes configured source names as an enum in MCP tool schemas so agents know the valid `source` values.
- Accepts source names case-insensitively while preserving the configured display name.
- Returns clearer errors that include the valid source names when `source` is missing or unknown.

## 0.2.1

- Fixes port configuration to use Home Assistant add-on `ports` mapping instead of an application option.
- Keeps the MCP internal port fixed at `3100`.
- Exposes `3100/tcp` in the Home Assistant Network section, where the host port can be changed safely.

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
