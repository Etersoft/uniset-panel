const http = require('http');

const PORT = 9393;

// Mock data
const objects = ['UniSetActivator', 'TestProc', 'SharedMemory', 'OPCUAClient1'];

const testProcData = {
  TestProc: {
    LogServer: {
      host: 'localhost',
      port: 6000,
      state: 'RUNNIG',
      info: {
        host: 'localhost',
        name: 'localhost:6000',
        port: 6000,
        sessMaxCount: 10,
        sessions: []
      }
    },
    Timers: {
      '2': { id: 2, msec: 3000, name: '', tick: -1, timeleft: 1500 },
      count: 1
    },
    Variables: {
      activateTimeout: '120000',
      argprefix: 'test-',
      bool_var: '0',
      forceOut: '0',
      idHeartBeat: '-1',
      int_var: '0',
      maxHeartBeat: '10',
      resetMsgTime: '300',
      sleep_msec: '150',
      smReadyTimeout: '15000',
      smTestID: '1',
      t_val: '0',
      test_double: '52.044000',
      test_float: '50.000000',
      test_int: '0',
      test_int2: '110',
      test_long: '110',
      test_str: 'ddd'
    },
    Statistics: {
      processingMessageCatchCount: 0,
      sensors: {
        DumpSensor1_S: { count: 1, id: 19, name: 'DumpSensor1_S' },
        Input1_S: { count: 1, id: 1, name: 'Input1_S' }
      }
    },
    io: {
      in: {
        in_input1_s: {
          comment: 'comment for input1',
          id: 1,
          name: 'Input1_S',
          textname: 'Вход 1 - Температура',
          smTestID: '1',
          value: 1,
          vartype: 'in'
        },
        in_input2_s: {
          comment: 'comment for input2',
          id: 19,
          initFromSM: '1',
          name: 'DumpSensor1_S',
          textname: 'Датчик давления',
          value: 0,
          vartype: 'in'
        }
      },
      out: {
        out_output1_c: {
          id: 7,
          name: 'DO_C',
          no_check_id: '1',
          comment: 'comment for output1',
          textname: 'Выход 1 - Насос',
          value: 1,
          vartype: 'out'
        },
        out_output2_c: {
          force: '1',
          id: 8,
          name: 'DO1_C',
          comment: 'comment for output2',
          textname: 'Выход 2 - Клапан',
          value: 0,
          vartype: 'out'
        }
      }
    },
    myFloatVar: 42.42,
    myMessage: 'This is text for test httpGetUserData',
    myMode: 'RUNNING',
    myVar: 42
  },
  object: {
    id: 6000,
    isActive: true,
    lostMessages: 0,
    maxSizeOfMessageQueue: 1000,
    msgCount: 0,
    name: 'TestProc',
    objectType: 'UniSetManager'
  }
};

const unisetActivatorData = {
  UniSetActivator: {
    Variables: {},
    io: { in: {}, out: {} }
  },
  object: {
    id: 1000,
    isActive: true,
    name: 'UniSetActivator',
    objectType: 'UniSetActivator'
  }
};

// Mock sensors for SharedMemory (IONotifyController)
const mockSensors = [];
for (let i = 1; i <= 200; i++) {
  const types = ['AI', 'DI', 'AO', 'DO'];
  mockSensors.push({
    id: i,
    name: `Sensor${i}_S`,
    type: types[i % 4],
    value: Math.floor(Math.random() * 1000),
    frozen: i % 20 === 0,
    blocked: i % 30 === 0,
    readonly: i % 10 === 0,
    undefined: false
  });
}

const sharedMemoryData = {
  SharedMemory: {
    LogServer: {
      host: 'localhost',
      port: 5003,
      state: 'RUNNING',
      info: {
        host: 'localhost',
        name: 'localhost:5003',
        port: 5003,
        sessMaxCount: 10,
        sessions: []
      }
    }
  },
  object: {
    id: 5003,
    isActive: true,
    lostMessages: 0,
    maxSizeOfMessageQueue: 1000,
    msgCount: 0,
    name: 'SharedMemory',
    objectType: 'IONotifyController'
  }
};

// OPCUAExchange mock data
const opcuaParams = {
  polltime: 300,
  updatetime: 300,
  reconnectPause: 10000,
  timeoutIterate: 0,
  exchangeMode: 0,
  writeToAllChannels: 0,
  currentChannel: 0,
  connectCount: 0,
  activated: 1,
  iolistSize: 8,
  httpControlAllow: 0,
  httpControlActive: 0,
  errorHistoryMax: 100
};

const opcuaStatus = {
  result: 'OK',
  status: {
    subscription: { enabled: true, items: 2 },
    iolist_size: 8,
    monitor: 'OK',
    httpEnabledSetParams: true,
    httpControlAllow: false,
    httpControlActive: false,
    errorHistorySize: 1,
    errorHistoryMax: 100,
    channels: [
      { index: 0, status: 'OK', ok: true, addr: 'opc.tcp://localhost:48010' },
      { index: 1, status: 'FAIL', ok: false, addr: 'opc.tcp://localhost:48020', disabled: true }
    ]
  }
};

const opcuaSensors = [
  {
    id: 1,
    name: 'AI100_OPC',
    iotype: 'AI',
    value: 42.5,
    tick: 10,
    vtype: 'Double',
    precision: 2,
    status: 'OK',
    nodeid: 'ns=2;s=Demo.Dynamic.Scalar.Double'
  },
  {
    id: 2,
    name: 'DO10_OPC',
    iotype: 'DO',
    value: 1,
    tick: 11,
    vtype: 'Bool',
    precision: 0,
    status: 'OK',
    nodeid: 'ns=2;s=Demo.Dynamic.Scalar.Boolean'
  }
];

const opcuaDiagnostics = {
  result: 'OK',
  summary: {
    reconnects: 1,
    errors: 0,
    warnings: 2
  },
  lastErrors: [
    {
      time: '2024-01-01T10:00:00Z',
      channel: 1,
      operation: 'read',
      statusCode: 'BadCommunicationError',
      nodeid: 'ns=2;s=Demo.Dynamic.Scalar.Double'
    }
  ],
  errorHistoryMax: 100,
  errorHistorySize: 1
};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url;

  if (url === '/api/v2/list') {
    res.end(JSON.stringify(objects));
  } else if (url === '/api/v2/TestProc') {
    res.end(JSON.stringify(testProcData));
  } else if (url === '/api/v2/UniSetActivator') {
    res.end(JSON.stringify(unisetActivatorData));
  } else if (url === '/api/v2/TestProc/help') {
    res.end(JSON.stringify({
      TestProc: [
        { desc: 'get value for parameter', name: 'params/get' },
        { desc: 'set value for parameter', name: 'params/set' },
        { desc: 'show log level', name: 'log' }
      ]
    }));
  } else if (url === '/api/v2/SharedMemory') {
    res.end(JSON.stringify(sharedMemoryData));
  } else if (url === '/api/v2/SharedMemory/sensors' || url.startsWith('/api/v2/SharedMemory/sensors?')) {
    // Parse offset and limit from query
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0');
    const limit = parseInt(urlObj.searchParams.get('limit') || '100');

    const paginatedSensors = mockSensors.slice(offset, offset + limit);
    res.end(JSON.stringify({
      sensors: paginatedSensors,
      size: mockSensors.length,
      offset: offset,
      limit: limit
    }));
  } else if (url === '/api/v2/SharedMemory/lost') {
    res.end(JSON.stringify({ 'lost consumers': [] }));
  } else if (url.startsWith('/api/v2/SharedMemory/consumers')) {
    // Parse sensor IDs from query
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const sensorsParam = urlObj.searchParams.get('sensors') || '';
    const sensorIds = sensorsParam.split(',').filter(s => s).map(Number);

    const sensors = sensorIds.map(id => ({
      id: id,
      name: `Sensor${id}_S`,
      consumers: []
    }));

    res.end(JSON.stringify({ sensors }));
  } else if (url.startsWith('/api/v2/SharedMemory/get')) {
    // Return mock sensor values to avoid noisy poller errors
    const query = url.split('?')[1] || '';
    const sensorsPart = query.split('&')[0] || '';
    const sensorIds = sensorsPart.split(',').filter(Boolean);
    const sensors = sensorIds.map(id => ({
      id: Number(id) || 0,
      name: `Sensor${id}_S`,
      value: 0,
      real_value: 0
    }));
    res.end(JSON.stringify({ sensors }));
  } else if (url === '/api/v2/OPCUAClient1') {
    res.end(JSON.stringify({
      OPCUAClient1: {},
      object: {
        id: 2001,
        isActive: true,
        name: 'OPCUAClient1',
        objectType: 'UniSetObject',
        extensionType: 'OPCUAExchange'
      }
    }));
  } else if (url === '/api/v2/OPCUAClient1/status') {
    res.end(JSON.stringify(opcuaStatus));
  } else if (url.startsWith('/api/v2/OPCUAClient1/getparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const names = urlObj.searchParams.getAll('name');
    const params = {};
    if (names.length === 0) {
      Object.assign(params, opcuaParams);
    } else {
      names.forEach(name => {
        if (Object.prototype.hasOwnProperty.call(opcuaParams, name)) {
          params[name] = opcuaParams[name];
        }
      });
    }
    res.end(JSON.stringify({ result: 'OK', params }));
  } else if (url.startsWith('/api/v2/OPCUAClient1/setparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    urlObj.searchParams.forEach((value, key) => {
      opcuaParams[key] = Number.isNaN(Number(value)) ? value : Number(value);
    });
    res.end(JSON.stringify({ result: 'OK', updated: opcuaParams }));
  } else if (url === '/api/v2/OPCUAClient1/sensors' || url.startsWith('/api/v2/OPCUAClient1/sensors?')) {
    res.end(JSON.stringify({
      result: 'OK',
      sensors: opcuaSensors,
      total: opcuaSensors.length,
      limit: 50,
      offset: 0
    }));
  } else if (url.startsWith('/api/v2/OPCUAClient1/sensor')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const id = parseInt(urlObj.searchParams.get('id') || '0', 10);
    const sensor = opcuaSensors.find(s => s.id === id) || null;
    res.end(JSON.stringify({ result: 'OK', sensor }));
  } else if (url === '/api/v2/OPCUAClient1/diagnostics') {
    res.end(JSON.stringify(opcuaDiagnostics));
  } else if (url === '/api/v2/OPCUAClient1/takeControl') {
    res.end(JSON.stringify({ result: 'OK', message: 'control taken', previousMode: 0, currentMode: 1 }));
  } else if (url === '/api/v2/OPCUAClient1/releaseControl') {
    res.end(JSON.stringify({ result: 'OK', message: 'control released', previousMode: 1, currentMode: 0 }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock UniSet2 server running on port ${PORT}`);
});
