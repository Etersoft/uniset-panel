// tests/unit/helpers/detail-dom.js
// Minimal DOM scaffold that detail-panel expects (real app.js has these
// in index.html). Call before openDetailPanel in jsdom-based unit tests.

export function setupDetailDOM() {
    document.body.innerHTML =
        '<div id="tabs-header"></div>' +
        '<div id="tabs-content"></div>';
}
