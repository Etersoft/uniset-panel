const http = require('http');

const PORT = 9393;

// Mock data
const objects = ['UniSetActivator', 'TestProc'];

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

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url;

  if (url === '/api/v01/list') {
    res.end(JSON.stringify(objects));
  } else if (url === '/api/v01/TestProc') {
    res.end(JSON.stringify(testProcData));
  } else if (url === '/api/v01/UniSetActivator') {
    res.end(JSON.stringify(unisetActivatorData));
  } else if (url === '/api/v01/TestProc/help') {
    res.end(JSON.stringify({
      TestProc: [
        { desc: 'get value for parameter', name: 'params/get' },
        { desc: 'set value for parameter', name: 'params/set' },
        { desc: 'show log level', name: 'log' }
      ]
    }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock UniSet2 server running on port ${PORT}`);
});
