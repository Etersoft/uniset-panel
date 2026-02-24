const http = require('http');

const PORT = process.env.PORT || 8111;
const NODE_NAME = process.env.NODE_NAME || 'MockNode';

// Процессы с разными состояниями для реалистичности
const processes = [
    { name: 'SharedMemory', state: 'running', pid: 1001, uptime: 86400, restartCount: 0, group: 'core', critical: true },
    { name: 'MBTCPMaster1', state: 'running', pid: 1002, uptime: 86350, restartCount: 1, group: 'io', critical: true },
    { name: 'MBTCPSlave1', state: 'running', pid: 1003, uptime: 86300, restartCount: 0, group: 'io', critical: false },
    { name: 'OPCUAExchange', state: 'running', pid: 1004, uptime: 85200, restartCount: 2, group: 'io', critical: true },
    { name: 'OPCUAServer', state: 'running', pid: 1005, uptime: 85100, restartCount: 0, group: 'io', critical: false },
    { name: 'UNetExchange', state: 'running', pid: 1006, uptime: 86000, restartCount: 0, group: 'network', critical: true },
    { name: 'UWebSocketGate', state: 'running', pid: 1007, uptime: 85500, restartCount: 0, group: 'network', critical: false },
    { name: 'IONotifyController', state: 'running', pid: 1008, uptime: 86200, restartCount: 0, group: 'core', critical: true },
    { name: 'LogDB', state: 'stopped', pid: 0, uptime: 0, restartCount: 3, lastError: 'ClickHouse connection refused', group: 'logging', critical: false },
    { name: 'BackupService', state: 'completed', pid: 0, uptime: 0, restartCount: 0, group: 'maintenance', critical: false, oneshot: true },
    { name: 'Watchdog', state: 'running', pid: 1010, uptime: 86400, restartCount: 0, group: 'core', critical: true, manual: false },
    { name: 'ManualService', state: 'running', pid: 1011, uptime: 50000, restartCount: 0, group: 'maintenance', critical: false, manual: true },
    { name: 'SkippedService', state: 'stopped', pid: 0, uptime: 0, restartCount: 0, group: 'maintenance', critical: false, skip: true },
];

const groups = [
    { name: 'core', order: 1, processes: ['SharedMemory', 'IONotifyController', 'Watchdog'] },
    { name: 'io', order: 2, dependsOn: ['core'], processes: ['MBTCPMaster1', 'MBTCPSlave1', 'OPCUAExchange', 'OPCUAServer'] },
    { name: 'network', order: 3, dependsOn: ['core'], processes: ['UNetExchange', 'UWebSocketGate'] },
    { name: 'logging', order: 4, dependsOn: ['core'], processes: ['LogDB'] },
    { name: 'maintenance', order: 5, processes: ['BackupService', 'ManualService', 'SkippedService'] },
];

// Имитация живых данных — uptime растёт
setInterval(() => {
    for (const p of processes) {
        if (p.state === 'running') {
            p.uptime += 1;
        }
    }
}, 1000);

function getStatus() {
    const allRunning = processes.every(p => p.state === 'running' || p.state === 'completed');
    const anyCriticalFailed = processes.some(p => p.critical && (p.state === 'failed' || p.state === 'stopped'));
    return {
        node: NODE_NAME,
        processes,
        groups,
        allRunning,
        anyCriticalFailed,
    };
}

function findProcess(name) {
    return processes.find(p => p.name === name);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Health check
    if (req.method === 'GET' && path === '/api/v2/launcher/health') {
        const status = getStatus();
        res.end(JSON.stringify({
            status: status.anyCriticalFailed ? 'unhealthy' : 'healthy',
            allRunning: status.allRunning,
            anyCriticalFailed: status.anyCriticalFailed,
        }));
        return;
    }

    // Full status
    if (req.method === 'GET' && path === '/api/v2/launcher') {
        res.end(JSON.stringify(getStatus()));
        return;
    }

    // Processes list
    if (req.method === 'GET' && path === '/api/v2/launcher/processes') {
        res.end(JSON.stringify(processes));
        return;
    }

    // Groups list
    if (req.method === 'GET' && path === '/api/v2/launcher/groups') {
        res.end(JSON.stringify(groups));
        return;
    }

    // Bulk: restart all running processes
    if (req.method === 'POST' && path === '/api/v2/launcher/restart-all') {
        for (const proc of processes) {
            if (proc.state === 'running') {
                proc.state = 'restarting';
                proc.restartCount++;
                setTimeout(() => {
                    proc.state = 'running';
                    proc.pid = 2000 + Math.floor(Math.random() * 1000);
                    proc.uptime = 0;
                }, 2000 + Math.floor(Math.random() * 1000));
            }
        }
        res.end(JSON.stringify({ status: 'ok', action: 'restart-all' }));
        return;
    }

    // Bulk: reload all (stop all, then start all)
    if (req.method === 'POST' && path === '/api/v2/launcher/reload-all') {
        for (const proc of processes) {
            if (proc.state === 'running' || proc.state === 'failed' || proc.state === 'stopped') {
                proc.state = 'stopping';
                const p = proc;
                setTimeout(() => {
                    p.state = 'starting';
                    setTimeout(() => {
                        p.state = 'running';
                        p.pid = 2000 + Math.floor(Math.random() * 1000);
                        p.uptime = 0;
                        p.lastError = '';
                    }, 1500);
                }, 1000);
            }
        }
        res.end(JSON.stringify({ status: 'ok', action: 'reload-all' }));
        return;
    }

    // Process actions: restart/stop/start
    const actionMatch = path.match(/^\/api\/v2\/launcher\/process\/([^/]+)\/(restart|stop|start)$/);
    if (req.method === 'POST' && actionMatch) {
        const [, procName, action] = actionMatch;
        const proc = findProcess(procName);
        if (!proc) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: `process ${procName} not found` }));
            return;
        }

        switch (action) {
            case 'restart':
                proc.state = 'restarting';
                proc.restartCount++;
                setTimeout(() => {
                    proc.state = 'running';
                    proc.pid = 2000 + Math.floor(Math.random() * 1000);
                    proc.uptime = 0;
                }, 2000);
                break;
            case 'stop':
                proc.state = 'stopping';
                setTimeout(() => {
                    proc.state = 'stopped';
                    proc.pid = 0;
                    proc.uptime = 0;
                }, 1000);
                break;
            case 'start':
                proc.state = 'starting';
                setTimeout(() => {
                    proc.state = 'running';
                    proc.pid = 2000 + Math.floor(Math.random() * 1000);
                    proc.uptime = 0;
                    proc.lastError = '';
                }, 1500);
                break;
        }

        res.end(JSON.stringify({ status: 'ok', action, process: procName }));
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
    console.log(`Mock Launcher (${NODE_NAME}) listening on port ${PORT}`);
});
