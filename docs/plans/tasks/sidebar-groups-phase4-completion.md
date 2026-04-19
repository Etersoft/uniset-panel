# Phase 4 Completion: Frontend Collapse & SSE

Metadata:
- Dependencies: task-06, task-07, Phase 3 completion
- Size: Verification only

## Phase 4 Completion Criteria

- [ ] Group collapse state persisted in localStorage and restored on reload (AC: FR5)
- [ ] Existing section collapse in legacy mode continues to work (AC: FR6)
- [ ] Entity status dot updates live when server disconnects/reconnects (AC: FR7)
- [ ] `make build` succeeds

## Operational Verification Procedures

1. Open sidebar with groups -- collapse a group
2. Reload page -- verify group is still collapsed
3. Expand group -- reload -- verify group is expanded
4. Disconnect a server (stop UniSet2 backend) -- verify status dot turns disconnected in group
5. Reconnect server -- verify status dot recovers
6. Switch to legacy mode (no config) -- verify existing section collapse still works

## All Task Completion Checklist

- [ ] Task 06: Group collapse state persistence
- [ ] Task 07: SSE status updates in groups
