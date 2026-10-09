# Configuration

Example:

```yaml
access_token: "use-a-long-random-token"
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

The MCP listens internally on port `3100`. Home Assistant exposes this as a configurable **Network** port. The default host port is also `3100`; change it from the add-on Network settings if that port is already in use. Talon must use the configured host port, for example `http://192.168.1.161:3100/mcp`.

`root` may be `share` or `media`. `path` is always relative to that Home Assistant folder.

The server never exposes an arbitrary-path tool. Talon can only address a configured source by its alias.

## File transfer

`copy_to_export` copies a single file from a configured read-only source to the MCP add-on's private export area. Source files cannot be modified, renamed, moved or deleted.

This is intentionally a copy, not a move.


## Export downloads

`copy_to_export` returns `export_path`, `size`, and a signed `download_url`. The URL is valid for five minutes and can be handed directly to a trusted local consumer such as Talon's `channel_send` attachment support. The URL signature does not reveal the MCP access token and the endpoint only serves files previously copied into the add-on's private export directory.

## Binary transfer through MCP

`get_file_info(source, path)` returns the file size, filename and MIME type.
`read_file_chunk(source, path, offset?, length?)` returns up to 262144 bytes per MCP tool call, base64-encoded in `data`, with `next_offset` and `eof` for pagination. Both tools enforce configured read-only source boundaries and do not use an HTTP download URL or copy to exports.

The MCP client must decode and assemble the chunks. **ChatGPT may display the returned data as tool output rather than a downloadable attachment; this feature does not guarantee a native ChatGPT download.** Transfer of multi-megabyte videos requires many calls and may hit client/tunnel limits. Start by testing a small file.
