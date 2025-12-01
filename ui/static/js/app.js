// State
const state = {
    objects: [],
    tabs: new Map(), // objectName -> { chart, updateInterval }
    activeTab: null
};

// API calls
async function fetchObjects() {
    const response = await fetch('/api/objects');
    if (!response.ok) throw new Error('Failed to fetch objects');
    return response.json();
}

async function fetchObjectData(name) {
    const response = await fetch(`/api/objects/${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error('Failed to fetch object data');
    return response.json();
}

async function watchObject(name) {
    const response = await fetch(`/api/objects/${encodeURIComponent(name)}/watch`, {
        method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to watch object');
    return response.json();
}

async function unwatchObject(name) {
    const response = await fetch(`/api/objects/${encodeURIComponent(name)}/watch`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to unwatch object');
    return response.json();
}

async function fetchVariableHistory(objectName, variableName, count = 100) {
    const response = await fetch(
        `/api/objects/${encodeURIComponent(objectName)}/variables/${encodeURIComponent(variableName)}/history?count=${count}`
    );
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
}

// UI functions
function renderObjectsList(objects) {
    const list = document.getElementById('objects-list');
    list.innerHTML = '';

    if (!objects || !objects.objects) {
        list.innerHTML = '<li class="loading">No objects found</li>';
        return;
    }

    objects.objects.forEach(obj => {
        const li = document.createElement('li');
        li.textContent = obj.name;
        li.dataset.name = obj.name;
        li.addEventListener('click', () => openObjectTab(obj.name));
        list.appendChild(li);
    });
}

function openObjectTab(name) {
    // Check if tab already exists
    if (state.tabs.has(name)) {
        activateTab(name);
        return;
    }

    // Create new tab
    createTab(name);
    activateTab(name);

    // Start watching
    watchObject(name).catch(console.error);

    // Load initial data
    loadObjectData(name);
}

function createTab(name) {
    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    // Remove placeholder if exists
    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    // Create tab button
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.name = name;
    tabBtn.innerHTML = `${name} <span class="close">&times;</span>`;
    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeTab(name);
        } else {
            activateTab(name);
        }
    });
    tabsHeader.appendChild(tabBtn);

    // Create tab panel
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.name = name;
    panel.innerHTML = `
        <div class="variables-section">
            <h3>Variables</h3>
            <table class="variables-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Value</th>
                        <th>Chart</th>
                    </tr>
                </thead>
                <tbody id="variables-${name}"></tbody>
            </table>
        </div>
        <div class="charts-section">
            <h3>Charts</h3>
            <div id="charts-${name}"></div>
        </div>
    `;
    tabsContent.appendChild(panel);

    // Store tab state
    state.tabs.set(name, {
        charts: new Map(),
        updateInterval: setInterval(() => loadObjectData(name), 5000)
    });
}

function activateTab(name) {
    // Deactivate all
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.objects-list li').forEach(li => li.classList.remove('active'));

    // Activate selected
    document.querySelector(`.tab-btn[data-name="${name}"]`)?.classList.add('active');
    document.querySelector(`.tab-panel[data-name="${name}"]`)?.classList.add('active');
    document.querySelector(`.objects-list li[data-name="${name}"]`)?.classList.add('active');

    state.activeTab = name;
}

function closeTab(name) {
    const tabState = state.tabs.get(name);
    if (tabState) {
        clearInterval(tabState.updateInterval);
        tabState.charts.forEach(chart => chart.destroy());
    }

    unwatchObject(name).catch(console.error);

    state.tabs.delete(name);

    document.querySelector(`.tab-btn[data-name="${name}"]`)?.remove();
    document.querySelector(`.tab-panel[data-name="${name}"]`)?.remove();

    // Show placeholder if no tabs left
    if (state.tabs.size === 0) {
        const tabsContent = document.getElementById('tabs-content');
        tabsContent.innerHTML = '<div class="placeholder">Select an object from the list</div>';
        state.activeTab = null;
    } else if (state.activeTab === name) {
        // Activate first available tab
        const firstTab = state.tabs.keys().next().value;
        activateTab(firstTab);
    }
}

async function loadObjectData(name) {
    try {
        const data = await fetchObjectData(name);
        renderVariables(name, data.Variables || {});
    } catch (err) {
        console.error(`Failed to load ${name}:`, err);
    }
}

function renderVariables(objectName, variables) {
    const tbody = document.getElementById(`variables-${objectName}`);
    if (!tbody) return;

    tbody.innerHTML = '';

    Object.entries(variables).forEach(([varName, value]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${varName}</td>
            <td class="variable-value">${formatValue(value)}</td>
            <td>
                <input type="checkbox"
                       id="chart-${objectName}-${varName}"
                       data-object="${objectName}"
                       data-variable="${varName}"
                       ${hasChart(objectName, varName) ? 'checked' : ''}>
            </td>
        `;

        const checkbox = tr.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                addChart(objectName, varName);
            } else {
                removeChart(objectName, varName);
            }
        });

        tbody.appendChild(tr);
    });
}

function formatValue(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value : value.toFixed(2);
    }
    return String(value);
}

function hasChart(objectName, varName) {
    const tabState = state.tabs.get(objectName);
    return tabState && tabState.charts.has(varName);
}

async function addChart(objectName, varName) {
    const tabState = state.tabs.get(objectName);
    if (!tabState || tabState.charts.has(varName)) return;

    const chartsContainer = document.getElementById(`charts-${objectName}`);

    // Create chart container
    const chartDiv = document.createElement('div');
    chartDiv.className = 'chart-container';
    chartDiv.id = `chart-container-${objectName}-${varName}`;
    chartDiv.innerHTML = `
        <h4>${varName}</h4>
        <div class="chart-wrapper">
            <canvas id="canvas-${objectName}-${varName}"></canvas>
        </div>
    `;
    chartsContainer.appendChild(chartDiv);

    // Fetch history
    try {
        const history = await fetchVariableHistory(objectName, varName);

        const ctx = document.getElementById(`canvas-${objectName}-${varName}`).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.points?.map(p => new Date(p.timestamp).toLocaleTimeString()) || [],
                datasets: [{
                    label: varName,
                    data: history.points?.map(p => p.value) || [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        display: true
                    },
                    y: {
                        beginAtZero: false
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        tabState.charts.set(varName, chart);

        // Update chart periodically
        updateChartPeriodically(objectName, varName, chart);
    } catch (err) {
        console.error(`Failed to load history for ${varName}:`, err);
        chartDiv.innerHTML += `<div class="error">Failed to load chart data</div>`;
    }
}

function updateChartPeriodically(objectName, varName, chart) {
    const updateChart = async () => {
        const tabState = state.tabs.get(objectName);
        if (!tabState || !tabState.charts.has(varName)) return;

        try {
            const history = await fetchVariableHistory(objectName, varName);
            chart.data.labels = history.points?.map(p => new Date(p.timestamp).toLocaleTimeString()) || [];
            chart.data.datasets[0].data = history.points?.map(p => p.value) || [];
            chart.update('none');
        } catch (err) {
            console.error(`Failed to update chart for ${varName}:`, err);
        }
    };

    // Store interval ID in chart object for cleanup
    chart._updateInterval = setInterval(updateChart, 5000);
}

function removeChart(objectName, varName) {
    const tabState = state.tabs.get(objectName);
    if (!tabState) return;

    const chart = tabState.charts.get(varName);
    if (chart) {
        clearInterval(chart._updateInterval);
        chart.destroy();
        tabState.charts.delete(varName);
    }

    document.getElementById(`chart-container-${objectName}-${varName}`)?.remove();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load objects
    fetchObjects()
        .then(renderObjectsList)
        .catch(err => {
            console.error('Failed to load objects:', err);
            document.getElementById('objects-list').innerHTML =
                '<li class="error">Failed to load objects</li>';
        });

    // Refresh button
    document.getElementById('refresh-objects').addEventListener('click', () => {
        fetchObjects()
            .then(renderObjectsList)
            .catch(console.error);
    });
});
