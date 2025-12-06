const http = require('http');

const PORT = process.env.PORT || 9394;
const SERVER_NAME = process.env.SERVER_NAME || 'Server2';

// Mock data for second server - different objects
const objects = ['Server2Controller', 'BackupProcess'];

const server2ControllerData = {
  Server2Controller: {
    LogServer: {
      host: 'server2-loghost',
      port: 7000,
      state: 'RUNNING',
      info: {
        host: 'server2-loghost',
        name: 'server2-loghost:7000',
        port: 7000,
        sessMaxCount: 10,
        sessions: []
      }
    },
    Variables: {
      serverName: 'Server2Controller',
      status: 'active',
      uptime: '3600',
      version: '2.0.0'
    },
    type: 'UniSetObject'
  }
};

const backupProcessData = {
  BackupProcess: {
    LogServer: {
      host: 'backup-loghost',
      port: 7001,
      state: 'RUNNING',
      info: {
        host: 'backup-loghost',
        name: 'backup-loghost:7001',
        port: 7001,
        sessMaxCount: 5,
        sessions: []
      }
    },
    Variables: {
      processName: 'BackupProcess',
      lastBackup: '2024-01-15T10:30:00',
      interval: '3600',
      enabled: '1'
    },
    type: 'UniSetObject'
  }
};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;

  // List objects
  if (url === '/api/v01/list') {
    res.writeHead(200);
    res.end(JSON.stringify(objects));
    return;
  }

  // Get object data
  if (url === '/api/v01/Server2Controller') {
    res.writeHead(200);
    res.end(JSON.stringify(server2ControllerData));
    return;
  }

  if (url === '/api/v01/BackupProcess') {
    res.writeHead(200);
    res.end(JSON.stringify(backupProcessData));
    return;
  }

  // Not found
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Mock UniSet2 ${SERVER_NAME} server running on port ${PORT}`);
});
