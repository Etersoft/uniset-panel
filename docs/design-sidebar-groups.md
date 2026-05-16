# Sidebar Groups Design Document

## Overview

This document describes the implemented design for configurable sidebar groups in uniset-panel. Groups are defined in YAML and resolved by the backend into a ready-to-render tree. The frontend always renders groups (legacy hardcoded sections are hidden).

## Current Behavior (2026-02-26)

- `GET /api/sidebar` returns resolved groups with items (not raw rules).
- The sidebar always renders groups, even when no group config is provided.
- Groups render as a flat list (no sub-sections by type).

## Configuration Summary

Use `sidebar` in YAML. See `docs/sidebar.md` for full details and examples.

Key points:
- `sidebar.groups` is an ordered list of group definitions.
- `items` matches by exact entity name (any type).
- `patterns` matches `{type}:{name}@{serverId}` with glob rules.
- `!` prefix in patterns excludes items from that group only.
- `sidebar.exclude` removes entities globally before grouping.
- Servers are hidden unless any group has a `server:` pattern.

## API Contract

`GET /api/sidebar` returns:

```json
{
  "groups": [
    {
      "name": "Operations",
      "icon": "",
      "items": [
        {"type": "object", "name": "SharedMemory", "serverId": "main"},
        {"type": "launcher", "name": "Node-1"},
        {"type": "dashboard", "name": "System"},
        {"type": "journal", "name": "Production"},
        {"type": "server", "name": "main", "displayName": "Main Server"}
      ]
    }
  ]
}
```

Notes:
- The response always contains a `groups` array.
- When no groups are configured, the resolver returns a single unnamed group containing all entities (or an empty array if there are no entities).
- The backend resolves groups on each request to reflect current entities.

## Frontend Rendering

- Groups are rendered in the order returned by the API.
- Collapse state is stored in `localStorage` under `uniset-panel-group-collapse`.
- Status dots are shown for `object` and `server` items.
- Type badges use short labels: `Obj`, `Lnc`, `Dsh`, `Jrn`, `Srv`.
- User dashboards from localStorage are appended as a separate group named `Custom`.

## Fallback Behavior

When no groups are configured, the backend default resolver returns one
unnamed group containing all entities (see `internal/sidebar/resolver.go`).
The frontend always renders groups; legacy hardcoded sections are hidden
(see `ui/static/js/src/99-init.js`). Backward compatibility is maintained
through the unnamed-group fallback, not by re-enabling legacy sections.

## Non-Goals (Current Implementation)

- Per-user sidebar layout configuration.
- Hot reload of YAML group config.
