# Configuration

Example:

```yaml
access_token: "use-a-long-random-token"
port: 3100
max_text_bytes: 2097152
max_copy_bytes: 1073741824
sources:
  - name: videoclipper
    root: share
    path: videoclipper
  - name: transcripts
    root: share
    path: transcripts
```

`port` controls the TCP port the MCP server listens on. The default is `3100`. After changing it, restart the add-on and use the same port in the Talon MCP URL, for example `http://192.168.1.161:3100/mcp`.

`root` may be `share` or `media`. `path` is always relative to that Home Assistant folder.

The server never exposes an arbitrary-path tool. Talon can only address a configured source by its alias.

## File transfer

`copy_to_export` copies a single file from a configured read-only source to the MCP add-on's private export area. Source files cannot be modified, renamed, moved or deleted.

This is intentionally a copy, not a move.
