// ============================================================================
// System Overview — CustomEvent emission (hooks for Spec 4 detail panel)
// ============================================================================
// Emits DOM events on `document` so external modules (e.g. the future Spec 4
// detail panel) can react without being coupled to overview internals.
//
// Events:
//   uniset:schema-opened  { serverId, serverName, objectNames }
//   uniset:schema-closed  { serverId }
//   uniset:node-clicked   { serverId, serverName, objectName, nodeId, element }
//   uniset:node-double-clicked { serverId, serverName, objectName, nodeId }
// ============================================================================

function emitSchemaOpened(serverId, serverName, objectNames) {
    document.dispatchEvent(new CustomEvent('uniset:schema-opened', {
        detail: { serverId, serverName, objectNames }
    }));
}

function emitSchemaClosed(serverId) {
    document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
        detail: { serverId }
    }));
}

function emitNodeClicked(serverId, serverName, objectName, nodeId, element) {
    document.dispatchEvent(new CustomEvent('uniset:node-clicked', {
        detail: { serverId, serverName, objectName, nodeId, element }
    }));
}

function emitNodeDoubleClicked(serverId, serverName, objectName, nodeId) {
    document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
        detail: { serverId, serverName, objectName, nodeId }
    }));
}
