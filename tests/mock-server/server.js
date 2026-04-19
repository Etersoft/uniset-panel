const http = require('http');
const WebSocket = require('ws');

const PORT = 9393;

// Mock data
const objects = ['UniSetActivator', 'TestProc', 'ControlProc', 'LogicProc', 'MonitorProc', 'StorageProc', 'SharedMemory', 'OPCUAClient1', 'MBTCPMaster1', 'MBTCPSlave1', 'OPCUAServer1', 'UNetExchange', 'UWebSocketGate'];

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
        in_input1_s: { comment: 'comment for input1', id: 1, name: 'Input1_S', textname: 'Вход 1 - Температура', smTestID: '1', value: 1, vartype: 'in' },
        in_input2_s: { comment: 'comment for input2', id: 19, initFromSM: '1', name: 'DumpSensor1_S', textname: 'Датчик давления', value: 0, vartype: 'in' },
        in_alarm_s: { id: 30, name: 'Alarm_S', textname: 'Аварийный сигнал', value: 0, vartype: 'in' },
        in_pump: { id: 31, name: 'PumpCmd_C', textname: 'Команда насоса', value: 1, vartype: 'in' },
        in_valve: { id: 32, name: 'ValveCmd_C', textname: 'Команда клапана', value: 0, vartype: 'in' },
        in_fan: { id: 33, name: 'FanCmd_C', textname: 'Команда вентилятора', value: 1, vartype: 'in' },
        in_heater: { id: 34, name: 'HeaterCmd_C', textname: 'Команда нагревателя', value: 0, vartype: 'in' },
        in_warn: { id: 35, name: 'Warning_S', textname: 'Предупреждение', value: 0, vartype: 'in' },
        in_ready: { id: 36, name: 'SystemReady_S', textname: 'Готовность системы', value: 1, vartype: 'in' },
        in_estop: { id: 37, name: 'EmergencyStop_C', textname: 'Аварийный стоп', value: 0, vartype: 'in' },
        in_logic_hb: { id: 38, name: 'LogicHeartbeat_S', textname: 'Heartbeat логики', value: 55, vartype: 'in' },
        in_power: { id: 39, name: 'PowerConsumption_S', textname: 'Потребляемая мощность', value: 880, vartype: 'in' },
        in_enable: { id: 40, name: 'Enable_S', textname: 'Разрешение работы', value: 1, vartype: 'in' }
      },
      out: {
        out_output1_c: { id: 7, name: 'DO_C', no_check_id: '1', comment: 'comment for output1', textname: 'Выход 1 - Насос', value: 1, vartype: 'out' },
        out_output2_c: { force: '1', id: 8, name: 'DO1_C', comment: 'comment for output2', textname: 'Выход 2 - Клапан', value: 0, vartype: 'out' },
        out_display: { id: 41, name: 'DisplayCode_C', textname: 'Код дисплея', value: 3, vartype: 'out' },
        out_log: { id: 42, name: 'EventLog_S', textname: 'Журнал событий', value: 100, vartype: 'out' },
        out_enable: { id: 43, name: 'Enable_S', textname: 'Разрешение работы (обратная связь)', value: 1, vartype: 'out' },
        out_feedback: { id: 44, name: 'TestFeedback_S', textname: 'Обратная связь тестов', value: 42, vartype: 'out' }
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

// ControlProc: reads raw sensors, outputs processed values to LogicProc
const controlProcData = {
  ControlProc: {
    Variables: {
      pollInterval: '500',
      filterCoeff: '0.85'
    },
    io: {
      in: {
        in_raw_temp: { id: 50, name: 'RawTemp_AI', textname: 'Сырой датчик температуры', value: 2450, vartype: 'in' },
        in_raw_press: { id: 51, name: 'RawPressure_AI', textname: 'Сырой датчик давления', value: 1800, vartype: 'in' },
        in_raw_humidity: { id: 55, name: 'RawHumidity_AI', textname: 'Сырой датчик влажности', value: 650, vartype: 'in' },
        in_raw_flow: { id: 56, name: 'RawFlow_AI', textname: 'Сырой датчик расхода', value: 3200, vartype: 'in' },
        in_raw_level: { id: 57, name: 'RawLevel_AI', textname: 'Сырой датчик уровня', value: 780, vartype: 'in' },
        in_raw_voltage: { id: 58, name: 'RawVoltage_AI', textname: 'Сырое напряжение', value: 2200, vartype: 'in' },
        in_raw_current: { id: 59, name: 'RawCurrent_AI', textname: 'Сырой ток', value: 450, vartype: 'in' },
        in_enable: { id: 70, name: 'Enable_S', textname: 'Разрешение работы', value: 1, vartype: 'in' },
        in_feedback: { id: 78, name: 'TestFeedback_S', textname: 'Обратная связь тестов', value: 42, vartype: 'in' }
      },
      out: {
        out_temp: { id: 52, name: 'Temp_S', textname: 'Температура (обработанная)', value: 24, vartype: 'out' },
        out_pressure: { id: 53, name: 'Pressure_S', textname: 'Давление (обработанное)', value: 1013, vartype: 'out' },
        out_humidity: { id: 71, name: 'Humidity_S', textname: 'Влажность (обработанная)', value: 65, vartype: 'out' },
        out_flow: { id: 72, name: 'Flow_S', textname: 'Расход (обработанный)', value: 320, vartype: 'out' },
        out_level: { id: 73, name: 'Level_S', textname: 'Уровень (обработанный)', value: 78, vartype: 'out' },
        out_voltage: { id: 74, name: 'Voltage_S', textname: 'Напряжение', value: 220, vartype: 'out' },
        out_current: { id: 75, name: 'Current_S', textname: 'Ток', value: 4, vartype: 'out' },
        out_mode: { id: 54, name: 'Mode_C', textname: 'Режим работы', value: 1, vartype: 'out' },
        out_status: { id: 76, name: 'CtrlStatus_S', textname: 'Статус контроллера', value: 1, vartype: 'out' },
        out_heartbeat: { id: 77, name: 'CtrlHeartbeat_S', textname: 'Heartbeat контроллера', value: 42, vartype: 'out' }
      }
    }
  },
  object: {
    id: 6100,
    isActive: true,
    lostMessages: 0,
    maxSizeOfMessageQueue: 1000,
    msgCount: 0,
    name: 'ControlProc',
    objectType: 'UniSetObject'
  }
};

// LogicProc: business logic - consumes from ControlProc, outputs to TestProc
const logicProcData = {
  LogicProc: {
    Variables: {
      tempThreshold: '80',
      pressureThreshold: '2000',
      alarmDelay: '3000'
    },
    io: {
      in: {
        in_temp: { id: 60, name: 'Temp_S', textname: 'Температура', value: 24, vartype: 'in' },
        in_pressure: { id: 61, name: 'Pressure_S', textname: 'Давление', value: 1013, vartype: 'in' },
        in_humidity: { id: 80, name: 'Humidity_S', textname: 'Влажность', value: 65, vartype: 'in' },
        in_flow: { id: 81, name: 'Flow_S', textname: 'Расход', value: 320, vartype: 'in' },
        in_level: { id: 82, name: 'Level_S', textname: 'Уровень', value: 78, vartype: 'in' },
        in_voltage: { id: 83, name: 'Voltage_S', textname: 'Напряжение', value: 220, vartype: 'in' },
        in_current: { id: 84, name: 'Current_S', textname: 'Ток', value: 4, vartype: 'in' },
        in_ctrl_status: { id: 85, name: 'CtrlStatus_S', textname: 'Статус контроллера', value: 1, vartype: 'in' },
        in_ctrl_hb: { id: 86, name: 'CtrlHeartbeat_S', textname: 'Heartbeat контроллера', value: 42, vartype: 'in' },
        in_mode: { id: 87, name: 'Mode_C', textname: 'Режим работы', value: 1, vartype: 'in' }
      },
      out: {
        out_alarm: { id: 62, name: 'Alarm_S', textname: 'Аварийный сигнал', value: 0, vartype: 'out' },
        out_pump: { id: 63, name: 'PumpCmd_C', textname: 'Команда насоса', value: 1, vartype: 'out' },
        out_valve: { id: 88, name: 'ValveCmd_C', textname: 'Команда клапана', value: 0, vartype: 'out' },
        out_fan: { id: 89, name: 'FanCmd_C', textname: 'Команда вентилятора', value: 1, vartype: 'out' },
        out_heater: { id: 90, name: 'HeaterCmd_C', textname: 'Команда нагревателя', value: 0, vartype: 'out' },
        out_warn: { id: 91, name: 'Warning_S', textname: 'Предупреждение', value: 0, vartype: 'out' },
        out_ready: { id: 92, name: 'SystemReady_S', textname: 'Готовность системы', value: 1, vartype: 'out' },
        out_emergency: { id: 93, name: 'EmergencyStop_C', textname: 'Аварийный стоп', value: 0, vartype: 'out' },
        out_logic_hb: { id: 94, name: 'LogicHeartbeat_S', textname: 'Heartbeat логики', value: 55, vartype: 'out' },
        out_power: { id: 95, name: 'PowerConsumption_S', textname: 'Потребляемая мощность', value: 880, vartype: 'out' }
      }
    }
  },
  object: {
    id: 6200,
    isActive: true,
    lostMessages: 0,
    maxSizeOfMessageQueue: 1000,
    msgCount: 0,
    name: 'LogicProc',
    objectType: 'UniSetObject'
  }
};

// MonitorProc: monitors system health — reads heartbeats/statuses, outputs aggregated metrics
const monitorProcData = {
  MonitorProc: {
    Variables: {
      checkInterval: '2000',
      alertThreshold: '3'
    },
    io: {
      in: {
        in_ctrl_hb: { id: 200, name: 'CtrlHeartbeat_S', textname: 'Heartbeat контроллера', value: 42, vartype: 'in' },
        in_logic_hb: { id: 201, name: 'LogicHeartbeat_S', textname: 'Heartbeat логики', value: 55, vartype: 'in' },
        in_alarm: { id: 202, name: 'Alarm_S', textname: 'Аварийный сигнал', value: 0, vartype: 'in' },
        in_warning: { id: 203, name: 'Warning_S', textname: 'Предупреждение', value: 0, vartype: 'in' },
        in_ready: { id: 204, name: 'SystemReady_S', textname: 'Готовность системы', value: 1, vartype: 'in' },
        in_estop: { id: 205, name: 'EmergencyStop_C', textname: 'Аварийный стоп', value: 0, vartype: 'in' },
        in_ctrl_status: { id: 206, name: 'CtrlStatus_S', textname: 'Статус контроллера', value: 1, vartype: 'in' },
        in_power: { id: 207, name: 'PowerConsumption_S', textname: 'Потребляемая мощность', value: 880, vartype: 'in' },
        in_event_log: { id: 208, name: 'EventLog_S', textname: 'Журнал событий', value: 100, vartype: 'in' },
        in_storage_ok: { id: 209, name: 'StorageStatus_S', textname: 'Статус хранилища', value: 1, vartype: 'in' }
      },
      out: {
        out_sys_health: { id: 210, name: 'SystemHealth_S', textname: 'Здоровье системы', value: 95, vartype: 'out' },
        out_active_alarms: { id: 211, name: 'ActiveAlarms_S', textname: 'Активные аварии', value: 0, vartype: 'out' },
        out_uptime: { id: 212, name: 'Uptime_S', textname: 'Время работы (мин)', value: 4320, vartype: 'out' },
        out_cpu_load: { id: 213, name: 'CpuLoad_S', textname: 'Загрузка CPU', value: 23, vartype: 'out' },
        out_mem_usage: { id: 214, name: 'MemUsage_S', textname: 'Использование памяти', value: 67, vartype: 'out' },
        out_mon_hb: { id: 215, name: 'MonitorHeartbeat_S', textname: 'Heartbeat монитора', value: 99, vartype: 'out' }
      }
    }
  },
  object: {
    id: 6300,
    isActive: true,
    lostMessages: 0,
    maxSizeOfMessageQueue: 1000,
    msgCount: 0,
    name: 'MonitorProc',
    objectType: 'UniSetObject'
  }
};

// StorageProc: data storage — receives processed values, outputs storage statistics
const storageProcData = {
  StorageProc: {
    Variables: {
      dbPath: '/var/data/storage.db',
      flushInterval: '5000',
      maxRecords: '1000000'
    },
    io: {
      in: {
        in_temp: { id: 300, name: 'Temp_S', textname: 'Температура', value: 24, vartype: 'in' },
        in_pressure: { id: 301, name: 'Pressure_S', textname: 'Давление', value: 1013, vartype: 'in' },
        in_humidity: { id: 302, name: 'Humidity_S', textname: 'Влажность', value: 65, vartype: 'in' },
        in_flow: { id: 303, name: 'Flow_S', textname: 'Расход', value: 320, vartype: 'in' },
        in_alarm: { id: 304, name: 'Alarm_S', textname: 'Аварийный сигнал', value: 0, vartype: 'in' },
        in_pump: { id: 305, name: 'PumpCmd_C', textname: 'Команда насоса', value: 1, vartype: 'in' },
        in_power: { id: 306, name: 'PowerConsumption_S', textname: 'Потребляемая мощность', value: 880, vartype: 'in' },
        in_sys_health: { id: 307, name: 'SystemHealth_S', textname: 'Здоровье системы', value: 95, vartype: 'in' },
        in_cpu_load: { id: 308, name: 'CpuLoad_S', textname: 'Загрузка CPU', value: 23, vartype: 'in' },
        in_mode: { id: 309, name: 'Mode_C', textname: 'Режим работы', value: 1, vartype: 'in' },
        in_display: { id: 310, name: 'DisplayCode_C', textname: 'Код дисплея', value: 3, vartype: 'in' },
        in_event_log: { id: 311, name: 'EventLog_S', textname: 'Журнал событий', value: 100, vartype: 'in' }
      },
      out: {
        out_storage_status: { id: 312, name: 'StorageStatus_S', textname: 'Статус хранилища', value: 1, vartype: 'out' },
        out_records_count: { id: 313, name: 'RecordsCount_S', textname: 'Количество записей', value: 542890, vartype: 'out' },
        out_disk_usage: { id: 314, name: 'DiskUsage_S', textname: 'Использование диска (%)', value: 34, vartype: 'out' },
        out_write_rate: { id: 315, name: 'WriteRate_S', textname: 'Скорость записи (зап/с)', value: 150, vartype: 'out' },
        out_last_flush: { id: 316, name: 'LastFlushTime_S', textname: 'Время последнего сброса', value: 1710, vartype: 'out' }
      }
    }
  },
  object: {
    id: 6400,
    isActive: true,
    lostMessages: 0,
    maxSizeOfMessageQueue: 1000,
    msgCount: 0,
    name: 'StorageProc',
    objectType: 'UniSetObject'
  }
};

// Mock sensors for SharedMemory (IONotifyController)
const mockSensors = [];
const supplierNames = ['TestProc', 'SharedMemory', 'MBTCPMaster1', '', 'OPCUAClient1'];
const supplierIds = [6000, 5003, 3001, 0, 2001];
for (let i = 1; i <= 200; i++) {
  const types = ['AI', 'DI', 'AO', 'DO'];
  const val = Math.floor(Math.random() * 1000);
  const supplierIdx = i % supplierNames.length;
  mockSensors.push({
    id: i,
    name: `Sensor${i}_S`,
    type: types[i % 4],
    value: val,
    real_value: val,
    default_val: 0,
    frozen: i % 20 === 0,
    blocked: i % 30 === 0,
    readonly: i % 10 === 0,
    undefined: false,
    dbignore: false,
    nchanges: Math.floor(Math.random() * 500),
    tv_sec: Math.floor(Date.now() / 1000),
    tv_nsec: 0,
    supplier: supplierNames[supplierIdx],
    supplier_id: supplierIds[supplierIdx],
    calibration: types[i % 4].startsWith('A') ?
      { cmin: 0, cmax: 1000, rmin: 0, rmax: 4095, precision: 2 } :
      { cmin: 0, cmax: 0, rmin: 0, rmax: 0, precision: 0 }
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
    objectType: 'IONotifyController',
    extensionType: 'SharedMemory'
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

// Generate 100 mock OPCUA sensors for testing virtual scroll and filtering
const opcuaSensors = [];
const sensorTypes = ['AI', 'AO', 'DI', 'DO'];
const vtypes = { AI: 'Double', AO: 'Double', DI: 'Bool', DO: 'Bool' };

for (let i = 1; i <= 100; i++) {
  const iotype = sensorTypes[(i - 1) % 4];
  const isAnalog = iotype.startsWith('A');
  opcuaSensors.push({
    id: i,
    name: `${iotype}${String(i).padStart(3, '0')}_OPC`,
    iotype: iotype,
    value: isAnalog ? (42.5 + i * 0.1) : (i % 2),
    tick: 10 + i,
    vtype: vtypes[iotype],
    precision: isAnalog ? 2 : 0,
    status: i % 10 === 0 ? 'Bad' : 'OK',
    nodeid: `ns=2;s=Demo.Dynamic.${iotype}.Item${i}`
  });
}

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

// ModbusMaster mock data
const mbDevices = [
  { addr: 1, respond: true, dtype: 'rtu', regCount: 25, mode: 0, safeMode: 0 },
  { addr: 2, respond: true, dtype: 'rtu', regCount: 10, mode: 0, safeMode: 0 },
  { addr: 3, respond: false, dtype: 'rtu', regCount: 15, mode: 0, safeMode: 1 }
];

// Generate 100 mock Modbus registers for testing
const mbRegisters = [];
const mbTypes = ['AI', 'AO', 'DI', 'DO'];
const mbVtypes = { AI: 'signed', AO: 'signed', DI: 'unsigned', DO: 'unsigned' };
const mbFuncs = { AI: 3, AO: 6, DI: 1, DO: 5 };

for (let i = 1; i <= 100; i++) {
  const iotype = mbTypes[(i - 1) % 4];
  const devAddr = ((i - 1) % 3) + 1;
  const isAnalog = iotype.startsWith('A');
  mbRegisters.push({
    id: 1000 + i,
    name: `MB_${iotype}${String(i).padStart(3, '0')}_S`,
    iotype: iotype,
    value: isAnalog ? (100 + i * 2) : (i % 2),
    vtype: mbVtypes[iotype],
    device: devAddr,  // now just addr, details in devices dict
    register: {
      mbreg: 100 + i,
      mbfunc: mbFuncs[iotype],
      mbval: isAnalog ? (100 + i * 2) : (i % 2)
    },
    nbit: -1,
    mask: 0,
    precision: isAnalog ? 1 : 0
  });
}

let mbHttpControlActive = false;

// ModbusSlave mock data
const mbsParams = {
  polltime: 100,
  default_timeout: 3000,
  maxHeartBeat: 10
};

const mbsStatus = {
  result: 'OK',
  status: {
    name: 'MBTCPSlave1',
    monitor: 'vmon: OK',
    activated: 1,
    logserver: { host: '127.0.0.1', port: 5520 },
    parameters: {
      config: 'TCP(slave): 0.0.0.0:502'
    },
    statistics: {
      text: 'Requests: 500 processed',
      interval: 30000
    },
    maxHeartBeat: 10,
    activateTimeout: 2000,
    config_params: {
      polltime: 100,
      default_timeout: 3000
    },
    httpEnabledSetParams: 1
  }
};

// Generate 80 mock ModbusSlave registers for testing
const mbsRegisters = [];
const mbsTypes = ['AI', 'AO', 'DI', 'DO'];
const mbsVtypes = { AI: 'signed', AO: 'signed', DI: 'unsigned', DO: 'unsigned' };

const mbsAmodes = ['rw', 'ro', 'wo'];

for (let i = 1; i <= 80; i++) {
  const iotype = mbsTypes[(i - 1) % 4];
  const isAnalog = iotype.startsWith('A');
  const devAddr = ((i - 1) % 5) + 1;  // MB addresses 1-5
  mbsRegisters.push({
    id: 2000 + i,
    name: `MBS_${iotype}${String(i).padStart(3, '0')}_S`,
    iotype: iotype,
    value: isAnalog ? (50 + i * 3) : (i % 2),
    vtype: mbsVtypes[iotype],
    device: devAddr,
    amode: mbsAmodes[(i - 1) % 3],
    register: {
      mbreg: 200 + i,
      mbfunc: iotype === 'AI' ? 4 : (iotype === 'AO' ? 6 : (iotype === 'DI' ? 2 : 5))
    },
    precision: isAnalog ? 1 : 0
  });
}

// OPCUAServer mock data
const opcuaServerParams = {
  updateTime_msec: 100,
  httpEnabledSetParams: 1
};

const opcuaServerStatus = {
  result: 'OK',
  status: {
    name: 'OPCUAServer1',
    extensionType: 'OPCUAServer',
    httpEnabledSetParams: 1,
    LogServer: {
      host: '',
      port: 0,
      state: 'STOPPED',
      info: {
        host: '',
        name: 'LogServer',
        port: 0,
        sessMaxCount: 10,
        sessions: []
      }
    },
    endpoints: [
      { name: 'uniset2 OPC UA gate', url: 'urn:uniset2.server' },
      { name: 'opc.tcp', url: 'opc.tcp://localhost:4840' }
    ],
    config: {
      maxSubscriptions: 10,
      maxSessions: 10,
      maxSecureChannels: 10,
      maxSessionTimeout: 5000
    },
    params: {
      updateTime_msec: 100
    },
    variables: {
      total: 50,
      read: 20,
      write: 28,
      methods: 2
    }
  }
};

// Generate mock OPCUAServer sensors (variables)
const opcuaServerSensors = [];
for (let i = 1; i <= 50; i++) {
  const iotype = sensorTypes[(i - 1) % 4];
  const isAnalog = iotype.startsWith('A');
  opcuaServerSensors.push({
    id: 5000 + i,
    name: `OPC_${iotype}${String(i).padStart(3, '0')}_Var`,
    iotype: iotype,
    value: isAnalog ? (10.5 + i * 0.5) : (i % 2),
    vtype: vtypes[iotype],
    precision: isAnalog ? 2 : 0
  });
}

// UNetExchange mock data
const unetStatus = {
  result: 'OK',
  status: {
    name: 'UNetExchange',
    activated: true,
    maxHeartBeat: 10,
    steptime: 1000,
    no_sender: false,
    LogServer: { host: 'localhost', port: 6008, state: 'RUNNING' },
    receivers: [
      {
        chan1: {
          transport: '127.255.255.255:2049',
          mode: 'ACTIVE',
          recvOK: true,
          receivepack: 1500,
          lostPackets: 2,
          cacheMissed: 0,
          params: { recvTimeout: 5000, lostTimeout: 200 },
          stats: { recvPerSec: 15, upPerSec: 10, qsize: 1 }
        },
        chan2: {
          transport: '192.168.56.255:3001',
          mode: 'PASSIVE',
          recvOK: true,
          receivepack: 1200,
          lostPackets: 0,
          cacheMissed: 1,
          params: { recvTimeout: 5000, lostTimeout: 200 },
          stats: { recvPerSec: 12, upPerSec: 8, qsize: 2 }
        }
      },
      {
        chan1: {
          transport: '127.255.255.255:2050',
          mode: 'ACTIVE',
          recvOK: false,
          receivepack: 0,
          lostPackets: 10,
          cacheMissed: 5,
          params: { recvTimeout: 5000, lostTimeout: 200 },
          stats: { recvPerSec: 0, upPerSec: 0, qsize: 0 }
        }
      }
    ],
    senders: {
      chan1: {
        transport: '127.255.255.255:2048',
        mode: 'Enabled',
        items: 2,
        lastpacknum: 561,
        params: { sendpause: 1000, packsendpause: 5 },
        packGroups: [{ sendfactor: 2, count: 1, packs: [] }]
      },
      chan2: {
        transport: '192.168.56.255:3000',
        mode: 'Enabled',
        items: 2,
        lastpacknum: 562,
        params: { sendpause: 1000, packsendpause: 5 },
        packGroups: [{ sendfactor: 2, count: 1, packs: [] }]
      }
    }
  }
};

// UWebSocketGate mock data
const uwsgSensors = [];
for (let i = 1; i <= 60; i++) {
  const iotype = sensorTypes[(i - 1) % 4];
  const isAnalog = iotype.startsWith('A');
  uwsgSensors.push({
    id: 8000 + i,
    name: `WS_${iotype}${String(i).padStart(3, '0')}_S`,
    sm_type: iotype,
    value: isAnalog ? Math.round((20 + i * 1.5) * 100) / 100 : (i % 2),
    node: 3000,
    supplier_id: 5003,
    supplier: 'SharedMemory',
    undefined: false,
    error: '',
    calibration: isAnalog ? { cmax: 100, cmin: 0, precision: 2, rmax: 4095, rmin: 0 } : null
  });
}

const uwsgStatus = {
  result: 'OK',
  status: {
    name: 'UWebSocketGate',
    activated: true,
    maxHeartBeat: 10,
    wsPort: 8081,
    wsPingInterval: 3000,
    httpEnabledSetParams: 1,
    LogServer: { host: 'localhost', port: 6010, state: 'RUNNING' },
    sessions: [
      { id: 1, remote: '127.0.0.1:54321', subscriptions: 5, connected: '2024-01-15T10:00:00Z' },
      { id: 2, remote: '192.168.1.100:12345', subscriptions: 12, connected: '2024-01-15T09:30:00Z' }
    ],
    statistics: {
      totalConnections: 150,
      activeConnections: 2,
      messagesReceived: 5000,
      messagesSent: 8500
    }
  }
};

// WebSocket sessions tracking
const wsClients = new Map(); // ws -> { subscriptions: Set<id>, frozen: Map<id, value> }

const mbParams = {
  force: 0,
  force_out: 0,
  maxHeartBeat: 10,
  recv_timeout: 2000,
  sleepPause_msec: 50,
  polltime: 200,
  default_timeout: 5000
};

const mbStatus = {
  result: 'OK',
  status: {
    name: 'MBTCPMaster1',
    monitor: 'vmon: OK',
    activated: 1,
    logserver: { host: '127.0.0.1', port: 5510 },
    parameters: {
      reopenTimeout: 5000,
      config: 'TCP(master): 192.168.0.1:502 (3 devices)'
    },
    statistics: {
      text: 'Packets: 1200 ok, 5 errors',
      interval: 30000
    },
    devices: mbDevices.map(d => ({ id: d.addr, info: `Dev${d.addr} [${d.regCount} regs]` })),
    mode: { name: 'normal', id: 0, control: 'manual' },
    maxHeartBeat: 10,
    force: 0,
    force_out: 0,
    activateTimeout: 2000,
    reopenTimeout: 5000,
    notUseExchangeTimer: 0,
    config_params: {
      recv_timeout: 2000,
      sleepPause_msec: 50,
      polltime: 200,
      default_timeout: 5000
    },
    httpControlAllow: 1,
    httpControlActive: 0,
    httpEnabledSetParams: 1
  }
};

// Simulate server down state
let simulateDown = false;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url;

  // Control endpoints for testing
  if (url === '/api/mock/disconnect') {
    simulateDown = true;
    console.log('[mock] Simulating server DOWN');
    res.end(JSON.stringify({ status: 'disconnected' }));
    return;
  } else if (url === '/api/mock/reconnect') {
    simulateDown = false;
    console.log('[mock] Simulating server UP');
    res.end(JSON.stringify({ status: 'connected' }));
    return;
  } else if (url === '/api/mock/status') {
    res.end(JSON.stringify({ simulateDown }));
    return;
  }

  // When simulating down, return 503 for all API endpoints
  if (simulateDown && url.startsWith('/api/v2/')) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'Service Unavailable (simulated)' }));
    return;
  }

  if (url === '/api/v2/list') {
    res.end(JSON.stringify(objects));
  } else if (url === '/api/v2/TestProc') {
    res.end(JSON.stringify(testProcData));
  } else if (url === '/api/v2/UniSetActivator') {
    res.end(JSON.stringify(unisetActivatorData));
  } else if (url === '/api/v2/ControlProc') {
    res.end(JSON.stringify(controlProcData));
  } else if (url === '/api/v2/LogicProc') {
    res.end(JSON.stringify(logicProcData));
  } else if (url === '/api/v2/MonitorProc') {
    res.end(JSON.stringify(monitorProcData));
  } else if (url === '/api/v2/StorageProc') {
    res.end(JSON.stringify(storageProcData));
  } else if (url === '/api/v2/TestProc/help') {
    res.end(JSON.stringify({
      TestProc: [
        { desc: 'get value for parameter', name: 'params/get' },
        { desc: 'set value for parameter', name: 'params/set' },
        { desc: 'show log level', name: 'log' }
      ]
    }));
  } else if (url === '/api/v2/SharedMemory' || url === '/api/v2/SharedMemory/') {
    res.end(JSON.stringify(sharedMemoryData));
  } else if (url === '/api/v2/SharedMemory/sensors' || url.startsWith('/api/v2/SharedMemory/sensors?')) {
    // Parse query parameters
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0');
    const limit = parseInt(urlObj.searchParams.get('limit') || '100');
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const iotype = (urlObj.searchParams.get('iotype') || '').toUpperCase();

    // Apply filters
    let filtered = mockSensors;
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search) ||
        String(s.id).includes(search)
      );
    }
    if (iotype && iotype !== 'ALL') {
      filtered = filtered.filter(s => s.type === iotype);
    }

    const paginatedSensors = filtered.slice(offset, offset + limit);
    res.end(JSON.stringify({
      sensors: paginatedSensors,
      size: filtered.length,
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
    // Return mock sensor values from mockSensors (matches real UniSet2 /get protocol)
    // URL format: /api/v2/SharedMemory/get?supplier=...&filter=id1,id2,id3[&shortInfo]
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const filter = urlObj.searchParams.get('filter') || '';
    const shortInfo = urlObj.searchParams.has('shortInfo');
    const sensorIds = filter.split(',').filter(Boolean).map(Number);
    const sensors = sensorIds.map(id => {
      const sensor = mockSensors.find(s => s.id === id);
      if (sensor) {
        // shortInfo returns only basic fields (like real UniSet2)
        const base = {
          id: sensor.id,
          name: sensor.name,
          value: sensor.value,
          real_value: sensor.real_value,
          tv_sec: sensor.tv_sec,
          tv_nsec: sensor.tv_nsec,
          supplier_id: sensor.supplier_id,
          supplier: sensor.supplier
        };
        if (shortInfo) return base;
        // Full info includes all fields
        return {
          ...base,
          type: sensor.type,
          default_val: sensor.default_val,
          dbignore: sensor.dbignore,
          nchanges: sensor.nchanges,
          undefined: sensor.undefined,
          frozen: sensor.frozen,
          blocked: sensor.blocked,
          readonly: sensor.readonly,
          calibration: sensor.calibration
        };
      }
      return { name: `Sensor${id}_S`, error: 'not found' };
    });
    res.end(JSON.stringify({ sensors }));
  } else if (url.startsWith('/api/v2/SharedMemory/set?')) {
    // Mock set endpoint (GET method like real UniSet2)
    // Parse query: /api/v2/SharedMemory/set?supplier=TestProc&{sensorId}={value}
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    for (const [key, value] of urlObj.searchParams) {
      if (key !== 'supplier') {
        const sensorId = parseInt(key, 10);
        const newValue = parseInt(value, 10);
        const sensor = mockSensors.find(s => s.id === sensorId);
        if (sensor && !isNaN(newValue)) {
          sensor.value = newValue;
          sensor.real_value = newValue;
        }
      }
    }
    res.end(JSON.stringify({ result: 'OK' }));
  } else if (url.startsWith('/api/v2/SharedMemory/freeze?')) {
    // Mock freeze endpoint (GET method like real UniSet2)
    res.end(JSON.stringify({ result: 'OK' }));
  } else if (url.startsWith('/api/v2/SharedMemory/unfreeze?')) {
    // Mock unfreeze endpoint (GET method like real UniSet2)
    res.end(JSON.stringify({ result: 'OK' }));
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
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const iotype = (urlObj.searchParams.get('iotype') || '').toUpperCase();

    // Apply filters
    let filtered = opcuaSensors;
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search) ||
        String(s.id).includes(search)
      );
    }
    if (iotype && iotype !== 'ALL') {
      filtered = filtered.filter(s => s.iotype === iotype);
    }

    // Apply pagination
    const paginatedSensors = filtered.slice(offset, offset + limit);

    res.end(JSON.stringify({
      result: 'OK',
      sensors: paginatedSensors,
      total: filtered.length,
      limit: limit,
      offset: offset
    }));
  } else if (url.startsWith('/api/v2/OPCUAClient1/sensor')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const id = parseInt(urlObj.searchParams.get('id') || '0', 10);
    const sensor = opcuaSensors.find(s => s.id === id) || null;
    res.end(JSON.stringify({ result: 'OK', sensor }));
  } else if (url === '/api/v2/OPCUAClient1/diagnostics') {
    res.end(JSON.stringify(opcuaDiagnostics));
  } else if (url.startsWith('/api/v2/OPCUAClient1/get')) {
    // GET /api/v2/OPCUAClient1/get?id=1&id=2 or ?name=sensor1&name=sensor2
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const names = urlObj.searchParams.getAll('name');
    const ids = urlObj.searchParams.getAll('id');
    // Also support filter=id1,id2,id3 format
    const filter = urlObj.searchParams.get('filter');
    const sensors = [];

    if (filter) {
      filter.split(',').forEach(idStr => {
        const id = parseInt(idStr.trim(), 10);
        if (!isNaN(id)) {
          const sensor = opcuaSensors.find(s => s.id === id);
          if (sensor && !sensors.find(s => s.id === sensor.id)) sensors.push(sensor);
        }
      });
    }
    names.forEach(name => {
      const sensor = opcuaSensors.find(s => s.name === name);
      if (sensor && !sensors.find(s => s.id === sensor.id)) sensors.push(sensor);
    });
    ids.forEach(id => {
      const sensor = opcuaSensors.find(s => s.id === parseInt(id, 10));
      if (sensor && !sensors.find(s => s.id === sensor.id)) sensors.push(sensor);
    });

    res.end(JSON.stringify({ result: 'OK', sensors }));
  } else if (url === '/api/v2/OPCUAClient1/takeControl') {
    res.end(JSON.stringify({ result: 'OK', message: 'control taken', previousMode: 0, currentMode: 1 }));
  } else if (url === '/api/v2/OPCUAClient1/releaseControl') {
    res.end(JSON.stringify({ result: 'OK', message: 'control released', previousMode: 1, currentMode: 0 }));
  // ModbusMaster endpoints
  } else if (url === '/api/v2/MBTCPMaster1') {
    res.end(JSON.stringify({
      MBTCPMaster1: {},
      object: {
        id: 3001,
        isActive: true,
        name: 'MBTCPMaster1',
        objectType: 'UniSetObject',
        extensionType: 'ModbusMaster',
        transportType: 'tcp'
      }
    }));
  } else if (url === '/api/v2/MBTCPMaster1/status') {
    mbStatus.status.httpControlActive = mbHttpControlActive ? 1 : 0;
    res.end(JSON.stringify(mbStatus));
  } else if (url === '/api/v2/MBTCPMaster1/devices') {
    res.end(JSON.stringify({
      result: 'OK',
      devices: mbDevices,
      count: mbDevices.length
    }));
  } else if (url === '/api/v2/MBTCPMaster1/registers' || url.startsWith('/api/v2/MBTCPMaster1/registers?')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const iotype = (urlObj.searchParams.get('iotype') || '').toUpperCase();

    let filtered = mbRegisters;
    if (search) {
      filtered = filtered.filter(r => r.name.toLowerCase().includes(search));
    }
    if (iotype && iotype !== 'ALL') {
      filtered = filtered.filter(r => r.iotype === iotype);
    }

    const paginatedRegs = filtered.slice(offset, offset + limit);

    // Build devices dictionary (only for devices in results)
    const usedDevices = new Set(paginatedRegs.map(r => r.device));
    const devicesDict = {};
    for (const addr of usedDevices) {
      const dev = mbDevices.find(d => d.addr === addr);
      if (dev) {
        devicesDict[addr] = {
          respond: dev.respond,
          dtype: dev.dtype,
          mode: dev.mode,
          safeMode: dev.safeMode
        };
      }
    }

    res.end(JSON.stringify({
      result: 'OK',
      devices: devicesDict,
      registers: paginatedRegs,
      total: filtered.length,
      count: paginatedRegs.length,
      offset: offset,
      limit: limit
    }));
  } else if (url.startsWith('/api/v2/MBTCPMaster1/getparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const names = urlObj.searchParams.getAll('name');
    const params = {};
    if (names.length === 0) {
      Object.assign(params, mbParams);
    } else {
      names.forEach(name => {
        if (Object.prototype.hasOwnProperty.call(mbParams, name)) {
          params[name] = mbParams[name];
        }
      });
    }
    res.end(JSON.stringify({ result: 'OK', params }));
  } else if (url.startsWith('/api/v2/MBTCPMaster1/setparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const updated = {};
    urlObj.searchParams.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(mbParams, key)) {
        mbParams[key] = Number.isNaN(Number(value)) ? value : Number(value);
        updated[key] = mbParams[key];
      }
    });
    res.end(JSON.stringify({ result: 'OK', updated }));
  } else if (url.startsWith('/api/v2/MBTCPMaster1/get')) {
    // GET /api/v2/MBTCPMaster1/get?filter=id1,id2,id3
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const filter = urlObj.searchParams.get('filter');
    const registers = [];

    if (filter) {
      filter.split(',').forEach(idStr => {
        const id = parseInt(idStr.trim(), 10);
        if (!isNaN(id)) {
          const reg = mbRegisters.find(r => r.id === id);
          if (reg && !registers.find(r => r.id === reg.id)) registers.push(reg);
        }
      });
    }

    res.end(JSON.stringify({ result: 'OK', registers, devices: mbDevices }));
  } else if (url === '/api/v2/MBTCPMaster1/takeControl') {
    mbHttpControlActive = true;
    res.end(JSON.stringify({ result: 'OK', httpControlActive: 1, currentMode: 0 }));
  } else if (url === '/api/v2/MBTCPMaster1/releaseControl') {
    mbHttpControlActive = false;
    res.end(JSON.stringify({ result: 'OK', httpControlActive: 0, currentMode: 0 }));
  } else if (url.startsWith('/api/v2/MBTCPMaster1/mode')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    if (urlObj.searchParams.has('get')) {
      res.end(JSON.stringify({ result: 'OK', mode: mbStatus.status.mode }));
    } else if (urlObj.searchParams.has('supported')) {
      res.end(JSON.stringify({
        result: 'OK',
        supported: [
          { id: 0, name: 'normal' },
          { id: 1, name: 'writeOnly' },
          { id: 2, name: 'readOnly' },
          { id: 3, name: 'disabled' }
        ]
      }));
    } else if (urlObj.searchParams.has('set')) {
      const modeName = urlObj.searchParams.get('set');
      mbStatus.status.mode.name = modeName;
      res.end(JSON.stringify({ result: 'OK', mode: mbStatus.status.mode }));
    } else {
      res.end(JSON.stringify({ result: 'OK', mode: mbStatus.status.mode }));
    }
  // ModbusSlave endpoints
  } else if (url === '/api/v2/MBTCPSlave1') {
    res.end(JSON.stringify({
      MBTCPSlave1: {},
      object: {
        id: 3501,
        isActive: true,
        name: 'MBTCPSlave1',
        objectType: 'UniSetObject',
        extensionType: 'ModbusSlave',
        transportType: 'tcp'
      }
    }));
  } else if (url === '/api/v2/MBTCPSlave1/status') {
    res.end(JSON.stringify(mbsStatus));
  } else if (url === '/api/v2/MBTCPSlave1/registers' || url.startsWith('/api/v2/MBTCPSlave1/registers?')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const iotype = (urlObj.searchParams.get('iotype') || '').toUpperCase();

    let filtered = mbsRegisters;
    if (search) {
      filtered = filtered.filter(r => r.name.toLowerCase().includes(search));
    }
    if (iotype && iotype !== 'ALL') {
      filtered = filtered.filter(r => r.iotype === iotype);
    }

    const paginatedRegs = filtered.slice(offset, offset + limit);

    res.end(JSON.stringify({
      result: 'OK',
      registers: paginatedRegs,
      total: filtered.length,
      count: paginatedRegs.length,
      offset: offset,
      limit: limit
    }));
  } else if (url.startsWith('/api/v2/MBTCPSlave1/getparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const names = urlObj.searchParams.getAll('name');
    const params = {};
    if (names.length === 0) {
      Object.assign(params, mbsParams);
    } else {
      names.forEach(name => {
        if (Object.prototype.hasOwnProperty.call(mbsParams, name)) {
          params[name] = mbsParams[name];
        }
      });
    }
    res.end(JSON.stringify({ result: 'OK', params }));
  } else if (url.startsWith('/api/v2/MBTCPSlave1/setparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const updated = {};
    urlObj.searchParams.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(mbsParams, key)) {
        mbsParams[key] = Number.isNaN(Number(value)) ? value : Number(value);
        updated[key] = mbsParams[key];
      }
    });
    res.end(JSON.stringify({ result: 'OK', updated }));
  } else if (url.startsWith('/api/v2/MBTCPSlave1/get')) {
    // GET /api/v2/MBTCPSlave1/get?filter=id1,id2,id3
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const filter = urlObj.searchParams.get('filter');
    const registers = [];

    if (filter) {
      filter.split(',').forEach(idStr => {
        const id = parseInt(idStr.trim(), 10);
        if (!isNaN(id)) {
          const reg = mbsRegisters.find(r => r.id === id);
          if (reg && !registers.find(r => r.id === reg.id)) registers.push(reg);
        }
      });
    }

    res.end(JSON.stringify({ result: 'OK', registers }));
  // OPCUAServer endpoints
  } else if (url === '/api/v2/OPCUAServer1') {
    res.end(JSON.stringify({
      OPCUAServer1: {},
      object: {
        id: 4001,
        isActive: true,
        name: 'OPCUAServer1',
        objectType: 'UniSetObject',
        extensionType: 'OPCUAServer'
      }
    }));
  } else if (url === '/api/v2/OPCUAServer1/status') {
    res.end(JSON.stringify(opcuaServerStatus));
  } else if (url.startsWith('/api/v2/OPCUAServer1/getparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const names = urlObj.searchParams.getAll('name');
    const params = {};
    if (names.length === 0) {
      Object.assign(params, opcuaServerParams);
    } else {
      names.forEach(name => {
        if (Object.prototype.hasOwnProperty.call(opcuaServerParams, name)) {
          params[name] = opcuaServerParams[name];
        }
      });
    }
    res.end(JSON.stringify({ result: 'OK', params }));
  } else if (url.startsWith('/api/v2/OPCUAServer1/setparam')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const updated = {};
    urlObj.searchParams.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(opcuaServerParams, key)) {
        opcuaServerParams[key] = Number.isNaN(Number(value)) ? value : Number(value);
        updated[key] = opcuaServerParams[key];
      }
    });
    res.end(JSON.stringify({ result: 'OK', updated }));
  } else if (url === '/api/v2/OPCUAServer1/sensors' || url.startsWith('/api/v2/OPCUAServer1/sensors?')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const iotype = (urlObj.searchParams.get('iotype') || '').toUpperCase();

    // Apply filters
    let filtered = opcuaServerSensors;
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search) ||
        String(s.id).includes(search)
      );
    }
    if (iotype && iotype !== 'ALL') {
      filtered = filtered.filter(s => s.iotype === iotype);
    }

    // Apply pagination
    const paginatedSensors = filtered.slice(offset, offset + limit);

    res.end(JSON.stringify({
      result: 'OK',
      sensors: paginatedSensors,
      total: filtered.length,
      limit: limit,
      offset: offset
    }));
  } else if (url.startsWith('/api/v2/OPCUAServer1/get')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const names = urlObj.searchParams.getAll('name');
    const ids = urlObj.searchParams.getAll('id');
    const sensors = [];

    names.forEach(name => {
      const sensor = opcuaServerSensors.find(s => s.name === name);
      if (sensor) sensors.push(sensor);
    });
    ids.forEach(id => {
      const sensor = opcuaServerSensors.find(s => s.id === parseInt(id, 10));
      if (sensor && !sensors.find(s => s.id === sensor.id)) sensors.push(sensor);
    });

    res.end(JSON.stringify({ result: 'OK', sensors }));
  // UNetExchange endpoints
  } else if (url === '/api/v2/UNetExchange') {
    res.end(JSON.stringify({
      UNetExchange: {},
      object: {
        id: 7001,
        isActive: true,
        name: 'UNetExchange',
        objectType: 'UniSetObject',
        extensionType: 'UNetExchange'
      }
    }));
  } else if (url === '/api/v2/UNetExchange/status') {
    res.end(JSON.stringify(unetStatus));
  // UWebSocketGate endpoints
  } else if (url === '/api/v2/UWebSocketGate') {
    res.end(JSON.stringify({
      UWebSocketGate: {},
      object: {
        id: 8001,
        isActive: true,
        name: 'UWebSocketGate',
        objectType: 'UniSetObject',
        extensionType: 'UWebSocketGate'
      }
    }));
  } else if (url === '/api/v2/UWebSocketGate/status') {
    // Update sessions from active WebSocket connections
    uwsgStatus.status.sessions = [];
    let sessionId = 1;
    wsClients.forEach((clientData, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        uwsgStatus.status.sessions.push({
          id: sessionId++,
          remote: ws._socket?.remoteAddress || 'unknown',
          subscriptions: clientData.subscriptions.size,
          frozen: clientData.frozen.size
        });
      }
    });
    uwsgStatus.status.statistics.activeConnections = wsClients.size;
    res.end(JSON.stringify(uwsgStatus));
  } else if (url === '/api/v2/UWebSocketGate/help') {
    res.end(JSON.stringify({
      UWebSocketGate: [
        { name: 'status', desc: 'Get UWebSocketGate status and sessions' },
        { name: 'sensors', desc: 'Get list of available sensors' },
        { name: 'get', desc: 'Get sensor values by id or name' }
      ],
      websocket: {
        url: 'ws://host:port/wsgate/',
        commands: [
          { cmd: 'ask:id1,id2,...', desc: 'Subscribe to sensor updates' },
          { cmd: 'get:id1,id2,...', desc: 'Get current sensor values' },
          { cmd: 'set:id=val,...', desc: 'Set sensor value' },
          { cmd: 'freeze:id=val,...', desc: 'Freeze sensor at value' },
          { cmd: 'unfreeze:id,...', desc: 'Unfreeze sensor' },
          { cmd: 'del:id,...', desc: 'Unsubscribe from sensors' }
        ]
      }
    }));
  } else if (url === '/api/v2/UWebSocketGate/sensors' || url.startsWith('/api/v2/UWebSocketGate/sensors?')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const iotype = (urlObj.searchParams.get('iotype') || '').toUpperCase();

    let filtered = uwsgSensors;
    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search) ||
        String(s.id).includes(search)
      );
    }
    if (iotype && iotype !== 'ALL') {
      filtered = filtered.filter(s => s.sm_type === iotype);
    }

    const paginatedSensors = filtered.slice(offset, offset + limit);

    res.end(JSON.stringify({
      result: 'OK',
      sensors: paginatedSensors,
      total: filtered.length,
      limit: limit,
      offset: offset
    }));
  } else if (url.startsWith('/api/v2/UWebSocketGate/get')) {
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    const filter = urlObj.searchParams.get('filter');
    const sensors = [];

    if (filter) {
      filter.split(',').forEach(idStr => {
        const id = parseInt(idStr.trim(), 10);
        if (!isNaN(id)) {
          const sensor = uwsgSensors.find(s => s.id === id);
          if (sensor && !sensors.find(s => s.id === sensor.id)) sensors.push(sensor);
        }
      });
    }

    res.end(JSON.stringify({ result: 'OK', sensors }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Simulate value changes for IONC sensors (triggers SSE batch events in backend)
setInterval(() => {
  mockSensors.forEach(sensor => {
    if (sensor.type === 'AI' || sensor.type === 'AO') {
      sensor.value += Math.floor(Math.random() * 5) - 2;
      sensor.real_value = sensor.value;
    } else {
      if (Math.random() < 0.05) {
        sensor.value = sensor.value === 0 ? 1 : 0;
        sensor.real_value = sensor.value;
      }
    }
    sensor.tv_sec = Math.floor(Date.now() / 1000);
  });
}, 1000);

// Simulate value changes for OPCUA sensors
setInterval(() => {
  opcuaSensors.forEach(sensor => {
    if (sensor.iotype === 'AI' || sensor.iotype === 'AO') {
      sensor.value = Math.round((sensor.value + (Math.random() - 0.5) * 2) * 100) / 100;
      sensor.tick++;
    }
  });
}, 1000);

// Simulate value changes for Modbus registers
setInterval(() => {
  mbRegisters.forEach(reg => {
    if (reg.iotype === 'AI' || reg.iotype === 'AO') {
      reg.value += Math.floor(Math.random() * 3) - 1;
      reg.register.mbval = reg.value;
    }
  });
}, 1000);

// Simulate IO value changes for overview-eligible objects (ControlProc, LogicProc, etc.)
// This makes the System Overview graph show dynamic sensor updates via SSE.
const overviewDataSources = [controlProcData, logicProcData, monitorProcData, storageProcData, testProcData];
setInterval(() => {
  for (const dataSource of overviewDataSources) {
    const objName = Object.keys(dataSource).find(k => k !== 'object');
    if (!objName || !dataSource[objName].io) continue;
    const io = dataSource[objName].io;
    // Mutate input values
    if (io.in) {
      for (const ioVar of Object.values(io.in)) {
        if (typeof ioVar.value === 'number') {
          if (ioVar.value > 10) {
            // Analog: small random walk
            ioVar.value = Math.round((ioVar.value + (Math.random() - 0.5) * ioVar.value * 0.05) * 100) / 100;
          } else {
            // Digital/small: occasional toggle or bump
            if (Math.random() < 0.15) {
              ioVar.value = ioVar.value === 0 ? 1 : (ioVar.value === 1 ? 0 : ioVar.value + Math.round(Math.random() * 2 - 1));
            }
          }
        }
      }
    }
    // Mutate output values
    if (io.out) {
      for (const ioVar of Object.values(io.out)) {
        if (typeof ioVar.value === 'number') {
          if (ioVar.value > 10) {
            ioVar.value = Math.round((ioVar.value + (Math.random() - 0.5) * ioVar.value * 0.05) * 100) / 100;
          } else {
            if (Math.random() < 0.15) {
              ioVar.value = ioVar.value === 0 ? 1 : (ioVar.value === 1 ? 0 : ioVar.value + Math.round(Math.random() * 2 - 1));
            }
          }
        }
      }
    }
  }
}, 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock UniSet2 server running on port ${PORT}`);
});

// WebSocket server for UWebSocketGate
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://localhost:${PORT}`).pathname;

  if (pathname === '/wsgate/' || pathname === '/wsgate') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Helper: create SensorInfo response
function createSensorInfo(sensor) {
  const now = Date.now();
  return {
    type: 'SensorInfo',
    tv_sec: Math.floor(now / 1000),
    tv_nsec: (now % 1000) * 1000000,
    value: sensor.value,
    sm_type: sensor.sm_type,
    error: sensor.error || '',
    id: sensor.id,
    name: sensor.name,
    node: sensor.node,
    supplier_id: sensor.supplier_id,
    supplier: sensor.supplier,
    undefined: sensor.undefined || false,
    calibration: sensor.calibration || { cmax: 0, cmin: 0, precision: 0, rmax: 0, rmin: 0 }
  };
}

// Helper: create ShortSensorInfo response
function createShortSensorInfo(sensor) {
  return {
    type: 'ShortSensorInfo',
    id: sensor.id,
    value: sensor.value,
    error: sensor.error || '',
    supplier_id: sensor.supplier_id,
    supplier: sensor.supplier
  };
}

// Helper: find sensor by id or name
function findSensor(idOrName) {
  const id = parseInt(idOrName, 10);
  if (!isNaN(id)) {
    return uwsgSensors.find(s => s.id === id);
  }
  return uwsgSensors.find(s => s.name === idOrName);
}

// Handle WebSocket commands
function handleWSCommand(ws, clientData, message) {
  const msg = message.toString().trim();
  const colonIndex = msg.indexOf(':');

  if (colonIndex === -1) {
    ws.send(JSON.stringify({ data: [{ type: 'Error', message: 'Invalid command format' }] }));
    return;
  }

  const cmd = msg.substring(0, colonIndex);
  const args = msg.substring(colonIndex + 1);

  switch (cmd) {
    case 'ask': {
      // Subscribe to sensors
      const ids = args.split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      ids.forEach(idOrName => {
        const sensor = findSensor(idOrName);
        if (sensor) {
          clientData.subscriptions.add(sensor.id);
          results.push(createSensorInfo(sensor));
        } else {
          results.push({ type: 'Error', message: `Sensor not found: ${idOrName}` });
        }
      });
      ws.send(JSON.stringify({ data: results }));
      break;
    }

    case 'get': {
      // Get current values (without subscribing)
      const ids = args.split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      ids.forEach(idOrName => {
        const sensor = findSensor(idOrName);
        if (sensor) {
          results.push(createShortSensorInfo(sensor));
        } else {
          results.push({ type: 'Error', message: `Sensor not found: ${idOrName}` });
        }
      });
      ws.send(JSON.stringify({ data: results }));
      break;
    }

    case 'set': {
      // Set sensor values: set:id1=val1,id2=val2
      const pairs = args.split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      pairs.forEach(pair => {
        const [idOrName, value] = pair.split('=');
        const sensor = findSensor(idOrName);
        if (sensor && value !== undefined) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            sensor.value = numValue;
            results.push(createShortSensorInfo(sensor));
          } else {
            results.push({ type: 'Error', message: `Invalid value for ${idOrName}` });
          }
        } else {
          results.push({ type: 'Error', message: `Sensor not found: ${idOrName}` });
        }
      });
      ws.send(JSON.stringify({ data: results }));
      break;
    }

    case 'freeze': {
      // Freeze sensor at value: freeze:id1=val1,id2=val2
      const pairs = args.split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      pairs.forEach(pair => {
        const [idOrName, value] = pair.split('=');
        const sensor = findSensor(idOrName);
        if (sensor && value !== undefined) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            clientData.frozen.set(sensor.id, numValue);
            sensor.value = numValue;
            results.push(createShortSensorInfo(sensor));
          } else {
            results.push({ type: 'Error', message: `Invalid value for ${idOrName}` });
          }
        } else {
          results.push({ type: 'Error', message: `Sensor not found or missing value: ${idOrName}` });
        }
      });
      ws.send(JSON.stringify({ data: results }));
      break;
    }

    case 'unfreeze': {
      // Unfreeze sensors: unfreeze:id1,id2
      const ids = args.split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      ids.forEach(idOrName => {
        const sensor = findSensor(idOrName);
        if (sensor) {
          clientData.frozen.delete(sensor.id);
          results.push(createShortSensorInfo(sensor));
        } else {
          results.push({ type: 'Error', message: `Sensor not found: ${idOrName}` });
        }
      });
      ws.send(JSON.stringify({ data: results }));
      break;
    }

    case 'del': {
      // Unsubscribe from sensors: del:id1,id2
      const ids = args.split(',').map(s => s.trim()).filter(Boolean);
      ids.forEach(idOrName => {
        const sensor = findSensor(idOrName);
        if (sensor) {
          clientData.subscriptions.delete(sensor.id);
        }
      });
      ws.send(JSON.stringify({ data: [{ type: 'OK', message: 'Unsubscribed' }] }));
      break;
    }

    default:
      ws.send(JSON.stringify({ data: [{ type: 'Error', message: `Unknown command: ${cmd}` }] }));
  }
}

wss.on('connection', (ws) => {
  console.log('WebSocket client connected to /wsgate/');

  const clientData = {
    subscriptions: new Set(),
    frozen: new Map()
  };
  wsClients.set(ws, clientData);

  // Send initial ping
  ws.send(JSON.stringify({ data: [{ type: 'Ping' }] }));

  // Ping interval (every 3 seconds as per protocol)
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ data: [{ type: 'Ping' }] }));
    }
  }, 3000);

  // Sensor value update simulation (for subscribed sensors)
  const updateInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN && clientData.subscriptions.size > 0) {
      const updates = [];
      clientData.subscriptions.forEach(sensorId => {
        const sensor = uwsgSensors.find(s => s.id === sensorId);
        if (sensor) {
          // Only update if not frozen
          if (!clientData.frozen.has(sensorId)) {
            // Simulate value change
            if (sensor.sm_type === 'AI' || sensor.sm_type === 'AO') {
              sensor.value = Math.round((sensor.value + (Math.random() - 0.5) * 2) * 100) / 100;
            } else {
              // DI/DO: occasional toggle
              if (Math.random() < 0.1) {
                sensor.value = sensor.value === 0 ? 1 : 0;
              }
            }
          }
          updates.push(createSensorInfo(sensor));
        }
      });
      if (updates.length > 0) {
        ws.send(JSON.stringify({ data: updates }));
      }
    }
  }, 1000);

  ws.on('message', (message) => {
    handleWSCommand(ws, clientData, message);
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clearInterval(pingInterval);
    clearInterval(updateInterval);
    wsClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clearInterval(pingInterval);
    clearInterval(updateInterval);
    wsClients.delete(ws);
  });
});

console.log('WebSocket server ready on /wsgate/');
