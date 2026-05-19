# Framer MCP Server

Local MCP server for Framer projects. It gives an agent enough Framer context to work on Code Overrides safely, while keeping direct write tools guarded.

## What It Exposes

29 tools, 5 resources, 4 prompts.

Code tools:
- `framer_list_code_files`, `framer_get_code_file`, `framer_get_code_file_versions`, `framer_get_code_file_version_content`
- `framer_typecheck_code`, `framer_preview_code_file_update`
- `framer_create_code_file`, `framer_apply_code_file_update`, `framer_rename_code_file`, `framer_remove_code_file`

Context tools:
- `framer_project_info`, `framer_get_publish_info`, `framer_list_pages_and_components`
- `framer_get_node_context`, `framer_get_selection_context`, `framer_get_styles_context`
- `framer_get_selection_context` depends on the installed `framer-api` exposing `getSelection`; if it doesn't, the tool returns a clear message — fall back to `framer_get_node_context` or `framer_agent_context`.

Agent-native tools:
- Read: `framer_agent_system_prompt`, `framer_agent_context`, `framer_agent_read_project`, `framer_agent_serialize_node`, `framer_agent_serialize_nodes`, `framer_agent_query_images`
- Guarded mutation: `framer_agent_apply_changes`, `framer_agent_review_changes`, `framer_agent_make_component_local`, `framer_agent_flatten_component`
- Guarded publish: `framer_agent_publish_preview`, `framer_agent_publish_confirm`, `framer_agent_deploy_production`

Resources:
- `framer://project/info` — project metadata
- `framer://code-files` — all code files, no content
- `framer://code-file/{id}` — one code file with capped content
- `framer://agent/context/{pagePath}` — page-scoped agent context; URL-encode the path, e.g. `framer://agent/context/%2Fabout`
- `framer://docs/overrides` — short Framer Overrides guide

Prompts:
- `write-framer-override`
- `debug-framer-override`
- `edit-framer-page-with-agent-dsl`
- `review-framer-code-or-dsl-changes`

## Canonical Workflow

Do this in order; do not skip to a write.

1. **Orient** — `framer_project_info`, `framer_list_pages_and_components`, `framer_list_code_files`.
2. **Inspect** — `framer_get_code_file` for the target file; `framer_get_node_context` and/or `framer_agent_context` for the target node/page; read `framer://docs/overrides` before writing an override.
3. **Preview** — `framer_preview_code_file_update`. Keep the returned `expectedVersionId`; read `diff` and `diagnostics`.
4. **Apply** — `framer_apply_code_file_update` with that exact `expectedVersionId`. A stale id is rejected.
5. **Publish** (only if asked) — `framer_agent_publish_preview` → `framer_agent_publish_confirm` → `framer_agent_deploy_production`.

### Typecheck gotcha (read this)

Existing Framer files import from `https://framer.com/m/...` URLs that the TypeScript typechecker cannot resolve, so they carry **pre-existing diagnostics even when your edit is correct**. `framer_apply_code_file_update` and `framer_create_code_file` refuse the write whenever diagnostics are present.

To proceed you must pass `allowTypecheckErrors: true`, and that requires **explicit user acceptance** — confirm with the user before using it. Always compare preview diagnostics against the pre-edit baseline so you only accept *pre-existing* noise, never new errors you introduced.

## Setup

Requirements:
- Node.js 22+
- pnpm 10+
- A Framer project API key

Install and build:

```bash
pnpm install
pnpm build
```

Create `.env`:

```bash
FRAMER_PROJECT_URL="https://framer.com/projects/Your-Site--abcdefghijklmnopqrst"
FRAMER_API_KEY="..."
# Optional
FRAMER_MCP_MAX_CONTENT_BYTES=500000
FRAMER_CLIENT_ID="framer-mcp-server/local"
```

## MCP Client Config

Use the built server for normal MCP clients:

```json
{
  "mcpServers": {
    "framer": {
      "command": "node",
      "args": ["/absolute/path/to/framer-mcp-server/dist/index.js"],
      "env": {
        "FRAMER_PROJECT_URL": "https://framer.com/projects/Your-Site--abcdefghijklmnopqrst",
        "FRAMER_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

For local development:

```bash
pnpm dev
```

## Recommended Live Test

Before giving this to someone else, run the MCP-level live smoke test:

```bash
pnpm smoke:mcp-live
```

This starts the MCP server in-process, connects an MCP client through the SDK, and checks:
- registration of `framer_project_info`, `framer_list_code_files`, `framer_agent_context`, `framer_preview_code_file_update`, `framer_agent_apply_changes`
- `framer_project_info`, `framer_list_code_files`, `framer_agent_context` calls return data
- `framer://project/info` and `framer://code-files` resources
- the `write-framer-override` prompt expands

It is read-only by default.

For a copied or sandbox Framer project only, run the guarded write round-trip:

```bash
FRAMER_MCP_LIVE_WRITE=1 pnpm smoke:mcp-live
```

That creates a temporary code file, previews an update, applies it with `expectedVersionId`, then deletes it with exact `confirmName`. Do not run this against a production project unless you are comfortable with a temporary code-file mutation.

There is also a lower-level direct Framer API smoke:

```bash
pnpm smoke:live
```

## Development Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

The test suite includes pure guardrail tests and an in-memory MCP client/server test.

## Safety Notes

- API keys are read from env and redacted from error text.
- The server does not execute local user code.
- Large content is capped by `FRAMER_MCP_MAX_CONTENT_BYTES`.

Guard → tool → required args:

| Action | Tool | Required guard args |
| --- | --- | --- |
| Update code | `framer_apply_code_file_update` | `expectedVersionId` (must be current); `allowTypecheckErrors: true` only with user consent |
| Create code | `framer_create_code_file` | `allowTypecheckErrors: true` only with user consent if diagnostics |
| Rename code | `framer_rename_code_file` | `expectedVersionId` |
| Delete code | `framer_remove_code_file` | `expectedVersionId` + exact `confirmName` |
| Agent DSL mutation | `framer_agent_apply_changes` | `confirm: true`, `pagePath`, human-readable `intent` |
| Production deploy | `framer_agent_deploy_production` | `confirmProduction: true` + deployment id |

## Useful First Prompt

Ask the agent:

> Use the Framer MCP server. Follow the Canonical Workflow: orient, then inspect the relevant code file and target node, then `framer_preview_code_file_update` (keep the `expectedVersionId`), then `framer_apply_code_file_update`. Treat `diagnostics` against the pre-edit baseline — only pre-existing Framer URL-import noise is acceptable, and only with my explicit OK via `allowTypecheckErrors`. Never deploy to production unless I ask.
