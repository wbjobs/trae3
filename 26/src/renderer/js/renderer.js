const api = window.api;

let paramConfig = [];
let availablePorts = [];
let devices = [];
let tasks = [];
let currentPortPath = null;
let paramValues = {};
let isConnected = false;

document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
  setupEventListeners();
  setupIpcListeners();
  setupSettingsPanel();
});

async function initializeApp() {
  try {
    const platformResult = await api.platform.getInfo();
    if (platformResult.success) {
      document.getElementById('connectionPlatform').textContent = platformResult.data.name;
      console.log('平台信息:', platformResult.data);
    }

    await refreshPorts();
    await loadParamConfig();
    renderParamsForm();
    await refreshDevices();
    await refreshLogFiles();
    updateStats();

    const stateResult = await api.state.getState();
    if (stateResult.success && stateResult.data) {
      const state = stateResult.data;
      if (state.connection && state.connection.portPath) {
        document.getElementById('portSelect').value = state.connection.portPath || '';
        document.getElementById('baudRateSelect').value = state.connection.baudRate || 115200;
        document.getElementById('dataBitsSelect').value = state.connection.dataBits || 8;
        document.getElementById('stopBitsSelect').value = state.connection.stopBits || 1;
        document.getElementById('paritySelect').value = state.connection.parity || 'none';
      }
      if (state.paramValues) {
        paramValues = state.paramValues;
        Object.keys(state.paramValues).forEach(key => {
          const input = document.getElementById('param_' + key);
          if (input && state.paramValues[key] !== undefined) {
            input.value = state.paramValues[key];
          }
        });
      }
      if (state.currentDeviceId) {
        document.getElementById('targetDeviceId').value = state.currentDeviceId;
      }
    }

    const recoveryResult = await api.batch.checkRecovery();
    if (recoveryResult.success && recoveryResult.data && recoveryResult.data.canRecover) {
      showRecoveryDialog(recoveryResult.data);
    }

    setupAutoSave();
    startStatsUpdate();
  } catch (error) {
    console.error('初始化失败:', error);
    showToast('初始化失败: ' + error.message, 'error');
  }
}

function setupAutoSave() {
  setInterval(async () => {
    try {
      await api.state.setParamValues(paramValues);
      const connectionConfig = {
        portPath: document.getElementById('portSelect').value,
        baudRate: parseInt(document.getElementById('baudRateSelect').value),
        dataBits: parseInt(document.getElementById('dataBitsSelect').value),
        stopBits: parseInt(document.getElementById('stopBitsSelect').value),
        parity: document.getElementById('paritySelect').value
      };
      await api.state.setConnectionConfig(connectionConfig);

      const deviceId = parseInt(document.getElementById('targetDeviceId').value);
      if (deviceId) {
        const stateResult = await api.state.getState();
        if (stateResult.success) {
          stateResult.data.currentDeviceId = deviceId;
        }
      }
    } catch (e) {
    }
  }, 5000);
}

function startStatsUpdate() {
  setInterval(async () => {
    if (isConnected) {
      updateStats();
    }
  }, 5000);
}

async function updateStats() {
  try {
    const batchStatus = await api.batch.getStatus();
    if (batchStatus.success) {
      const stats = batchStatus.data.stats;
      if (stats) {
        const hitRate = stats.cacheHits + stats.cacheMisses > 0 
          ? Math.round((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100) + '%'
          : '-';
        document.getElementById('cacheHitRate').textContent = hitRate;
        document.getElementById('taskCount').textContent = batchStatus.data.total;
        document.getElementById('deviceCount').textContent = devices.length;
      }
    }

    const poolStats = await api.batch.getPoolStats();
    if (poolStats.success) {
      const data = poolStats.data;
      document.getElementById('taskPoolStatus').textContent = 
        `${data.taskPool.inPool} 池内 / ${data.taskPool.borrowed} 使用中`;
      document.getElementById('bufferPoolMemory').textContent = data.bufferPool.totalMemoryMB;
      
      const batchStatusData = await api.batch.getStatus();
      if (batchStatusData.success) {
        const avgTime = batchStatusData.data.stats?.avgExecutionTime;
        document.getElementById('avgExecTime').textContent = avgTime ? avgTime.toFixed(0) + 'ms' : '-';
        document.getElementById('cacheRate').textContent = hitRate;
      }
    }
  } catch (e) {
  }
}

function showRecoveryDialog(recoveryData) {
  const interruptedConfig = recoveryData.interrupted;
  const deviceCount = recoveryData.configuredDevices ? recoveryData.configuredDevices.length : 0;
  const totalCount = recoveryData.totalDeviceCount || 0;
  const interruptTime = interruptedConfig ? new Date(interruptedConfig.interruptedAt).toLocaleString() : '';
  const operationType = interruptedConfig ? (interruptedConfig.operationType === 'write_all' ? '批量写入' : '批量读取') : '配置操作';

  const message = `检测到未完成的${operationType}！\n\n` +
    `中断时间: ${interruptTime}\n` +
    `中断原因: ${interruptedConfig ? interruptedConfig.interruptReason : '未知'}\n` +
    `已完成: ${deviceCount}/${totalCount} 个设备\n\n` +
    `是否恢复未完成的配置？`;

  if (confirm(message)) {
    showToast('正在恢复配置...', 'info');
    api.batch.resumeRecovery().then(result => {
      if (result.success) {
        showToast(`配置恢复完成: ${result.data.completed}成功, ${result.data.failed}失败`,
          result.data.failed > 0 ? 'warning' : 'success');
        refreshTasks();
      } else {
        showToast('恢复失败: ' + result.error, 'error');
      }
    });
  } else {
    api.batch.discardRecovery().then(() => {
      showToast('已放弃恢复', 'info');
    });
  }
}

function setupSettingsPanel() {
  document.getElementById('batchStrategy').addEventListener('change', (e) => {
    api.batch.setStrategy(e.target.value);
    showToast(`批量策略已设置为: ${e.target.value === 'smart' ? '智能' : e.target.value === 'sequential' ? '顺序' : '并行'}`, 'info');
  });

  document.getElementById('optimizedMode').addEventListener('change', (e) => {
    api.batch.setOptimizedMode(e.target.checked);
    showToast(`优化模式已${e.target.checked ? '启用' : '禁用'}`, 'info');
  });

  document.getElementById('concurrencyInput').addEventListener('change', async (e) => {
    await api.batch.setConcurrency(parseInt(e.target.value));
  });

  document.getElementById('autoReconnect').addEventListener('change', async (e) => {
    await api.serial.setAutoReconnect(e.target.checked);
  });

  document.getElementById('maxReconnect').addEventListener('change', async (e) => {
    await api.serial.setMaxReconnectAttempts(parseInt(e.target.value));
  });

  document.getElementById('refreshStatsBtn').addEventListener('click', updateStats);
}

function setupEventListeners() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  document.getElementById('refreshPortsBtn').addEventListener('click', refreshPorts);
  document.getElementById('connectBtn').addEventListener('click', handleConnect);
  document.getElementById('disconnectBtn').addEventListener('click', handleDisconnect);
  document.getElementById('testConnectionBtn').addEventListener('click', handleTestConnection);
  document.getElementById('readDeviceInfoBtn').addEventListener('click', handleReadDeviceInfo);
  document.getElementById('resetDeviceBtn').addEventListener('click', handleResetDevice);

  document.getElementById('scanDevicesBtn').addEventListener('click', handleScanDevices);
  document.getElementById('addDeviceBtn').addEventListener('click', () => openModal('addDeviceModal'));
  document.getElementById('selectAllDevices').addEventListener('change', handleSelectAllDevices);

  document.getElementById('readAllParamsBtn').addEventListener('click', handleReadAllParams);
  document.getElementById('writeAllParamsBtn').addEventListener('click', handleWriteAllParams);

  document.getElementById('addTaskBtn').addEventListener('click', openAddTaskModal);
  document.getElementById('clearTasksBtn').addEventListener('click', handleClearTasks);
  document.getElementById('startTasksBtn').addEventListener('click', handleStartTasks);
  document.getElementById('pauseTasksBtn').addEventListener('click', handlePauseTasks);
  document.getElementById('resumeTasksBtn').addEventListener('click', handleResumeTasks);
  document.getElementById('stopTasksBtn').addEventListener('click', handleStopTasks);
  document.getElementById('exportResultsBtn').addEventListener('click', handleExportResults);

  document.getElementById('clearMonitorBtn').addEventListener('click', clearMonitor);

  document.getElementById('refreshLogsBtn').addEventListener('click', refreshLogFiles);
  document.getElementById('logFileSelect').addEventListener('change', handleLogFileSelect);

  document.getElementById('closeDeviceModal').addEventListener('click', () => closeModal('addDeviceModal'));
  document.getElementById('cancelAddDeviceBtn').addEventListener('click', () => closeModal('addDeviceModal'));
  document.getElementById('confirmAddDeviceBtn').addEventListener('click', handleConfirmAddDevice);

  document.getElementById('closeTaskModal').addEventListener('click', () => closeModal('addTaskModal'));
  document.getElementById('cancelAddTaskBtn').addEventListener('click', () => closeModal('addTaskModal'));
  document.getElementById('confirmAddTaskBtn').addEventListener('click', handleConfirmAddTask);
  document.getElementById('taskTypeSelect').addEventListener('change', handleTaskTypeChange);

  document.getElementById('addDeviceModal').addEventListener('click', (e) => {
    if (e.target.id === 'addDeviceModal') closeModal('addDeviceModal');
  });
  document.getElementById('addTaskModal').addEventListener('click', (e) => {
    if (e.target.id === 'addTaskModal') closeModal('addTaskModal');
  });
}

function setupIpcListeners() {
  api.serial.onConnected((portPath) => {
    currentPortPath = portPath;
    isConnected = true;
    updateConnectionStatus(true, portPath);
    showToast('串口连接成功', 'success');
  });

  api.serial.onDisconnected(() => {
    currentPortPath = null;
    isConnected = false;
    updateConnectionStatus(false);
    showToast('串口已断开', 'warning');
  });

  api.serial.onError((error) => {
    showToast('串口错误: ' + error, 'error');
    addMonitorLine('错误: ' + error, 'error');
  });

  api.serial.onData((data) => {
    addMonitorLine('RX: ' + data, 'rx');
  });

  api.serial.onReconnectScheduled((info) => {
    const seconds = Math.ceil(info.delayMs / 1000);
    updateReconnectionStatus('reconnecting', `连接已断开，${seconds}秒后自动重连 (${info.attempt}/${info.maxAttempts})`);
    addMonitorLine(`检测到连接断开，计划在 ${seconds} 秒后重连...`, 'info');
  });

  api.serial.onReconnected((info) => {
    updateReconnectionStatus('connected', null);
    updateConnectionStatus(true, info.portPath);
    showToast('连接已恢复', 'success');
    addMonitorLine(`连接已恢复: ${info.portPath}`, 'info');
  });

  api.serial.onReconnectAttemptFailed((info) => {
    const seconds = Math.ceil(info.nextDelayMs / 1000);
    updateReconnectionStatus('reconnecting', `第 ${info.attempt} 次重连失败，${seconds}秒后重试...`);
    addMonitorLine(`重连失败 (${info.attempt}/${info.maxAttempts}): ${info.error}`, 'error');
  });

  api.serial.onReconnectFailed((info) => {
    updateReconnectionStatus('failed', null);
    updateConnectionStatus(false);
    showToast(`重连失败 (${info.maxAttempts}次尝试)，请手动重新连接`, 'error');
    addMonitorLine(`自动重连失败，已尝试 ${info.maxAttempts} 次，请手动重新连接`, 'error');
  });

  api.device.onScanProgress((progress) => {
    updateScanProgress(progress);
  });

  api.device.onDeviceStatus((device) => {
    updateDeviceStatus(device);
  });

  api.batch.onTaskStart((task) => {
    updateTaskStatus(task.id, 'running');
  });

  api.batch.onTaskComplete((task) => {
    updateTaskStatus(task.id, 'completed', task.result);
  });

  api.batch.onTaskFailed(({ task, error }) => {
    updateTaskStatus(task.id, 'failed', null, error);
  });

  api.batch.onProgress((progress) => {
    updateBatchProgress(progress);
  });

  api.batch.onStart((info) => {
    document.getElementById('batchProgress').style.display = 'flex';
    document.getElementById('startTasksBtn').disabled = true;
    document.getElementById('pauseTasksBtn').disabled = false;
    document.getElementById('stopTasksBtn').disabled = false;
    updateStats();
  });

  api.batch.onComplete((results) => {
    document.getElementById('batchProgress').style.display = 'none';
    document.getElementById('startTasksBtn').disabled = false;
    document.getElementById('pauseTasksBtn').disabled = true;
    document.getElementById('resumeTasksBtn').disabled = true;
    document.getElementById('stopTasksBtn').disabled = true;
    showToast(`批量任务完成: ${results.completed}成功, ${results.failed}失败`, results.failed > 0 ? 'warning' : 'success');
    updateStats();
  });

  api.batch.onRecoveryReady((recovery) => {
    showRecoveryDialog(recovery);
  });

  api.config.onImported((config) => {
    if (config.params) {
      Object.keys(config.params).forEach(key => {
        const input = document.getElementById('param_' + key);
        if (input) input.value = config.params[key];
      });
      showToast('配置导入成功', 'success');
    }
  });

  api.config.onExportRequest(async (filePath) => {
    const config = {
      params: paramValues,
      exportedAt: new Date().toISOString()
    };
    await api.serial.exportConfig(filePath, config);
    showToast('配置导出成功', 'success');
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === 'tab-' + tabName);
  });

  if (tabName === 'devices') {
    refreshDevices();
  } else if (tabName === 'tasks') {
    refreshTasks();
  } else if (tabName === 'logs') {
    refreshLogFiles();
  } else if (tabName === 'monitor') {
    updateStats();
  }
}

async function refreshPorts() {
  const result = await api.serial.listPorts();
  if (result.success) {
    availablePorts = result.data;
    const portSelect = document.getElementById('portSelect');
    const modalPortSelect = document.getElementById('modalPortSelect');

    portSelect.innerHTML = '<option value="">刷新后选择串口</option>';
    modalPortSelect.innerHTML = '<option value="">选择串口</option>';

    result.data.forEach(port => {
      const label = port.path + (port.manufacturer ? ' (' + port.manufacturer + ')' : '');
      portSelect.innerHTML += `<option value="${port.path}">${label}</option>`;
      modalPortSelect.innerHTML += `<option value="${port.path}">${label}</option>`;
    });
  } else {
    showToast('获取串口列表失败: ' + result.error, 'error');
  }
}

async function loadParamConfig() {
  const result = await api.param.getConfig();
  if (result.success) {
    paramConfig = result.data;
  }
}

function renderParamsForm() {
  const form = document.getElementById('paramsForm');
  form.innerHTML = '';

  paramConfig.forEach(param => {
    const item = document.createElement('div');
    item.className = 'param-item';
    item.innerHTML = `
      <label>${param.name}</label>
      <input type="${getInputType(param.type)}" id="param_${param.key}" 
             placeholder="${param.min !== undefined ? '范围: ' + param.min + '-' + param.max : ''}"
             step="${param.type === 'float' ? '0.01' : '1'}"
             ${param.min !== undefined ? 'min="' + param.min + '"' : ''}
             ${param.max !== undefined ? 'max="' + param.max + '"' : ''}>
      <div class="param-actions">
        <button class="btn btn-sm btn-secondary" onclick="readParam('${param.key}')">读取</button>
        <button class="btn btn-sm btn-primary" onclick="writeParam('${param.key}')">写入</button>
      </div>
    `;
    form.appendChild(item);

    document.getElementById('param_' + param.key).addEventListener('change', (e) => {
      paramValues[param.key] = e.target.value;
    });
  });
}

function getInputType(type) {
  if (type === 'float' || type.includes('int')) return 'number';
  return 'text';
}

async function handleConnect() {
  const portPath = document.getElementById('portSelect').value;
  if (!portPath) {
    showToast('请选择串口', 'warning');
    return;
  }

  const options = {
    baudRate: parseInt(document.getElementById('baudRateSelect').value),
    dataBits: parseInt(document.getElementById('dataBitsSelect').value),
    stopBits: parseInt(document.getElementById('stopBitsSelect').value),
    parity: document.getElementById('paritySelect').value
  };

  updateConnectionStatus(null, portPath);

  try {
    const result = await api.serial.connect(portPath, options);
    if (result.success) {
      addMonitorLine(`已连接到 ${portPath}`, 'info');
    } else {
      updateConnectionStatus(false);
      showToast('连接失败: ' + result.error, 'error');
    }
  } catch (error) {
    updateConnectionStatus(false);
    showToast('连接失败: ' + error.message, 'error');
  }
}

async function handleDisconnect() {
  try {
    await api.serial.disconnect();
    addMonitorLine('已断开连接', 'info');
  } catch (error) {
    showToast('断开失败: ' + error.message, 'error');
  }
}

async function handleTestConnection() {
  if (!isConnected) {
    showToast('请先连接串口', 'warning');
    return;
  }
  showToast('通信正常', 'success');
}

async function handleReadDeviceInfo() {
  if (!isConnected) {
    showToast('请先连接串口', 'warning');
    return;
  }
  const deviceId = parseInt(document.getElementById('targetDeviceId').value);
  if (!deviceId) {
    showToast('请输入目标设备ID', 'warning');
    return;
  }
  showToast('读取设备信息中...', 'info');
}

async function handleResetDevice() {
  if (!isConnected) {
    showToast('请先连接串口', 'warning');
    return;
  }
  if (!confirm('确定要重置设备吗？')) return;
  showToast('设备重置命令已发送', 'info');
}

async function checkSerialConnected() {
  if (!isConnected) {
    showToast('请先连接串口', 'warning');
    return false;
  }
  return true;
}

function updateConnectionStatus(connected, portPath = null) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const portSelect = document.getElementById('portSelect');
  const testBtn = document.getElementById('testConnectionBtn');
  const readInfoBtn = document.getElementById('readDeviceInfoBtn');
  const resetBtn = document.getElementById('resetDeviceBtn');

  indicator.className = 'status-indicator';

  if (connected === null) {
    indicator.classList.add('connecting');
    statusText.textContent = '连接中...';
    connectBtn.disabled = true;
    disconnectBtn.disabled = true;
    portSelect.disabled = true;
  } else if (connected) {
    indicator.classList.add('online');
    statusText.textContent = '已连接: ' + portPath;
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    portSelect.disabled = true;
    testBtn.disabled = false;
    readInfoBtn.disabled = false;
    resetBtn.disabled = false;
    isConnected = true;
  } else {
    statusText.textContent = '未连接';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    portSelect.disabled = false;
    testBtn.disabled = true;
    readInfoBtn.disabled = true;
    resetBtn.disabled = true;
    isConnected = false;
  }
}

function updateReconnectionStatus(status, message = null) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  if (!indicator || !statusText) return;

  indicator.classList.remove('reconnecting', 'reconnect-failed');

  if (status === 'reconnecting') {
    indicator.classList.add('reconnecting');
    if (message) statusText.textContent = message;
  } else if (status === 'failed') {
    indicator.classList.add('reconnect-failed');
  } else if (status === 'connected') {
    if (currentPortPath) {
      statusText.textContent = '已连接: ' + currentPortPath;
    }
  }
}

async function handleScanDevices() {
  const portPath = document.getElementById('portSelect').value;
  if (!portPath) {
    showToast('请选择串口', 'warning');
    return;
  }

  const rangeStr = document.getElementById('deviceIdRange').value || '1-255';
  const [startId, endId] = rangeStr.split('-').map(v => parseInt(v.trim()));

  if (isNaN(startId) || isNaN(endId) || startId < 1 || endId > 255 || startId > endId) {
    showToast('请输入有效的设备ID范围 (如: 1-255)', 'warning');
    return;
  }

  document.getElementById('scanProgress').style.display = 'flex';
  document.getElementById('scanDevicesBtn').disabled = true;

  try {
    const options = {
      baudRate: parseInt(document.getElementById('baudRateSelect').value),
      dataBits: parseInt(document.getElementById('dataBitsSelect').value),
      stopBits: parseInt(document.getElementById('stopBitsSelect').value),
      parity: document.getElementById('paritySelect').value
    };

    const result = await api.device.scanDevices(portPath, startId, endId, options);
    if (result.success) {
      await refreshDevices();
      showToast(`扫描完成，发现 ${result.data.length} 个设备`, 'success');
    } else {
      showToast('扫描失败: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('扫描失败: ' + error.message, 'error');
  } finally {
    document.getElementById('scanProgress').style.display = 'none';
    document.getElementById('scanDevicesBtn').disabled = false;
  }
}

function updateScanProgress(progress) {
  const percent = Math.round((progress.current / progress.total) * 100);
  document.getElementById('scanProgressFill').style.width = percent + '%';
  document.getElementById('scanProgressText').textContent =
    `扫描中... ${progress.current}/${progress.total} (设备ID: ${progress.deviceId})`;
}

async function refreshDevices() {
  const result = await api.device.getAllDevices();
  if (result.success) {
    devices = result.data;
    renderDeviceTable();
    renderDeviceSelect();
    updateStats();
  }
}

function renderDeviceTable() {
  const tbody = document.getElementById('deviceTableBody');
  if (devices.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无设备，请扫描或手动添加</td></tr>';
    return;
  }

  tbody.innerHTML = devices.map(device => `
    <tr>
      <td><input type="checkbox" class="device-checkbox" data-device-id="${device.deviceId}" data-port="${device.portPath}"></td>
      <td>${device.deviceId}</td>
      <td>${device.portPath}</td>
      <td><span class="status-badge ${device.online ? 'online' : 'offline'}">${device.online ? '在线' : '离线'}</span></td>
      <td>${device.firmwareVersion || '-'}</td>
      <td>${device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '-'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="checkDevice('${device.portPath}', ${device.deviceId})">检测</button>
        <button class="btn btn-sm btn-danger" onclick="removeDevice('${device.portPath}', ${device.deviceId})">删除</button>
      </td>
    </tr>
  `).join('');
}

function renderDeviceSelect() {
  const select = document.getElementById('modalDeviceSelect');
  select.innerHTML = devices.map(device =>
    `<option value="${device.portPath}:${device.deviceId}">设备 ${device.deviceId} (${device.portPath})</option>`
  ).join('');
}

async function checkDevice(portPath, deviceId) {
  if (!await checkSerialConnected()) return;

  const result = await api.device.checkStatus(portPath, deviceId);
  if (result.success) {
    updateDeviceStatus(result.data);
    showToast(result.data.online ? '设备在线' : '设备离线', result.data.online ? 'success' : 'warning');
  } else {
    showToast('检测失败: ' + result.error, 'error');
  }
}

async function removeDevice(portPath, deviceId) {
  if (!confirm('确定要删除该设备吗？')) return;

  const result = await api.device.removeDevice(portPath, deviceId);
  if (result.success) {
    await refreshDevices();
    showToast('设备已删除', 'success');
  }
}

function updateDeviceStatus(device) {
  const index = devices.findIndex(d => d.portPath === device.portPath && d.deviceId === device.deviceId);
  if (index !== -1) {
    devices[index] = { ...devices[index], ...device };
  } else {
    devices.push(device);
  }
  renderDeviceTable();
  renderDeviceSelect();
  updateStats();
}

function handleSelectAllDevices(e) {
  const checked = e.target.checked;
  document.querySelectorAll('.device-checkbox').forEach(cb => {
    cb.checked = checked;
  });
}

function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
  if (modalId === 'addDeviceModal') {
    refreshPorts();
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

async function handleConfirmAddDevice() {
  const portPath = document.getElementById('modalPortSelect').value;
  const deviceId = parseInt(document.getElementById('modalDeviceId').value);

  if (!portPath || !deviceId) {
    showToast('请填写完整信息', 'warning');
    return;
  }

  const result = await api.device.addDevice(portPath, deviceId);
  if (result.success) {
    await refreshDevices();
    closeModal('addDeviceModal');
    showToast('设备添加成功', 'success');
  } else {
    showToast('添加失败: ' + result.error, 'error');
  }
}

function openAddTaskModal() {
  renderParamCheckboxes();
  handleTaskTypeChange();
  openModal('addTaskModal');
}

function renderParamCheckboxes() {
  const container = document.getElementById('paramCheckboxes');
  container.innerHTML = paramConfig.map(param => `
    <label>
      <input type="checkbox" value="${param.key}" class="param-checkbox">
      ${param.name}
    </label>
  `).join('');

  const writeContainer = document.getElementById('writeParamsInputs');
  writeContainer.innerHTML = paramConfig.map(param => `
    <div class="form-group" style="margin-bottom: 10px;">
      <label style="font-size: 12px;">${param.name}</label>
      <input type="${getInputType(param.type)}" id="writeParam_${param.key}" 
             placeholder="请输入${param.name}"
             step="${param.type === 'float' ? '0.01' : '1'}"
             ${param.min !== undefined ? 'min="' + param.min + '"' : ''}
             ${param.max !== undefined ? 'max="' + param.max + '"' : ''}>
    </div>
  `).join('');
}

function handleTaskTypeChange() {
  const taskType = document.getElementById('taskTypeSelect').value;
  document.getElementById('taskParamsGroup').style.display =
    (taskType === 'read' || taskType === 'write') ? 'block' : 'none';
  document.getElementById('writeParamsGroup').style.display =
    (taskType === 'write' || taskType === 'write_all') ? 'block' : 'none';
}

async function handleConfirmAddTask() {
  const taskType = document.getElementById('taskTypeSelect').value;
  const selectedOptions = Array.from(document.getElementById('modalDeviceSelect').selectedOptions);

  if (selectedOptions.length === 0) {
    showToast('请至少选择一个设备', 'warning');
    return;
  }

  const deviceIds = selectedOptions.map(opt => parseInt(opt.value.split(':')[1]));
  const selectedParamKeys = Array.from(document.querySelectorAll('.param-checkbox:checked'))
    .map(cb => cb.value);

  let result;

  if (taskType === 'read') {
    if (selectedParamKeys.length === 0) {
      showToast('请至少选择一个参数', 'warning');
      return;
    }
    result = await api.batch.addReadTasks(deviceIds, selectedParamKeys);
  } else if (taskType === 'write') {
    const params = {};
    if (selectedParamKeys.length === 0) {
      showToast('请至少选择一个参数', 'warning');
      return;
    }
    selectedParamKeys.forEach(key => {
      const input = document.getElementById('writeParam_' + key);
      if (input && input.value !== '') {
        params[key] = input.value;
      }
    });
    result = await api.batch.addWriteTasks(deviceIds, params);
  } else if (taskType === 'read_all' || taskType === 'write_all') {
    const params = {};
    if (taskType === 'write_all') {
      paramConfig.forEach(param => {
        const input = document.getElementById('writeParam_' + param.key);
        if (input && input.value !== '') {
          params[param.key] = input.value;
        }
      });
    }
    result = await api.batch.addBatchTasks(taskType, deviceIds, params);
  }

  if (result && result.success) {
    await refreshTasks();
    closeModal('addTaskModal');
    showToast(`已添加 ${result.data.length} 个任务`, 'success');
  } else if (result) {
    showToast('添加失败: ' + result.error, 'error');
  }
}

async function refreshTasks() {
  const result = await api.batch.getTasks();
  if (result.success) {
    tasks = result.data;
    renderTaskTable();
    updateStats();
  }
}

function renderTaskTable() {
  const tbody = document.getElementById('taskTableBody');
  document.getElementById('taskCountBadge').textContent = `${tasks.length} 个任务`;
  
  if (tasks.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无任务</td></tr>';
    return;
  }

  tbody.innerHTML = tasks.map(task => `
    <tr>
      <td>${task.id.slice(-8)}</td>
      <td>${getTaskTypeName(task.type)}</td>
      <td>${task.deviceId}</td>
      <td>${task.params.paramKey || (task.params.params ? Object.keys(task.params.params).join(', ') : '-')}</td>
      <td><span class="status-badge ${task.status}">${getStatusName(task.status)}</span></td>
      <td>${task.result ? (typeof task.result === 'object' ? JSON.stringify(task.result).substring(0, 30) : task.result) : (task.error || '-')}</td>
      <td>
        ${task.status === 'pending' ?
          `<button class="btn btn-sm btn-danger" onclick="removeTask('${task.id}')">删除</button>` :
          '-'
        }
      </td>
    </tr>
  `).join('');
}

function getTaskTypeName(type) {
  const names = {
    read: '读取',
    write: '写入',
    read_all: '读取全部',
    write_all: '写入全部',
    reset: '重置'
  };
  return names[type] || type;
}

function getStatusName(status) {
  const names = {
    pending: '待执行',
    running: '执行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return names[status] || status;
}

function updateTaskStatus(taskId, status, result = null, error = null) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    if (result) task.result = result;
    if (error) task.error = error;
    renderTaskTable();
  }
}

function updateBatchProgress(progress) {
  const percent = Math.round((progress.current / progress.total) * 100);
  document.getElementById('batchProgressFill').style.width = percent + '%';
  document.getElementById('batchProgressText').textContent =
    `进度: ${progress.current}/${progress.total} (完成: ${progress.completed}, 失败: ${progress.failed})`;
}

async function removeTask(taskId) {
  const result = await api.batch.removeTask(taskId);
  if (result.success) {
    await refreshTasks();
    showToast('任务已删除', 'success');
  }
}

async function handleClearTasks() {
  if (!confirm('确定要清空所有任务吗？')) return;

  const result = await api.batch.clearTasks();
  if (result.success) {
    await refreshTasks();
    showToast('任务已清空', 'success');
  } else {
    showToast('清空失败: ' + result.error, 'error');
  }
}

async function handleStartTasks() {
  if (!await checkSerialConnected()) return;

  try {
    await api.batch.start();
  } catch (error) {
    showToast('启动失败: ' + error.message, 'error');
  }
}

async function handlePauseTasks() {
  const result = await api.batch.pause();
  if (result.success) {
    document.getElementById('pauseTasksBtn').disabled = true;
    document.getElementById('resumeTasksBtn').disabled = false;
    showToast('任务已暂停', 'success');
  } else {
    showToast('暂停失败: ' + result.error, 'error');
  }
}

async function handleResumeTasks() {
  const result = await api.batch.resume();
  if (result.success) {
    document.getElementById('pauseTasksBtn').disabled = false;
    document.getElementById('resumeTasksBtn').disabled = true;
    showToast('任务已继续', 'success');
  } else {
    showToast('继续失败: ' + result.error, 'error');
  }
}

async function handleStopTasks() {
  if (!confirm('确定要停止所有任务吗？')) return;

  await api.batch.stop();
  document.getElementById('startTasksBtn').disabled = false;
  document.getElementById('pauseTasksBtn').disabled = true;
  document.getElementById('resumeTasksBtn').disabled = true;
  document.getElementById('stopTasksBtn').disabled = true;
  document.getElementById('batchProgress').style.display = 'none';
  await refreshTasks();
  showToast('任务已停止', 'success');
}

async function handleExportResults() {
  const result = await api.batch.exportResults();
  if (result.success) {
    const json = JSON.stringify(result.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('结果已导出', 'success');
  }
}

async function handleReadAllParams() {
  const deviceId = parseInt(document.getElementById('targetDeviceId').value);
  if (!deviceId) {
    showToast('请输入目标设备ID', 'warning');
    return;
  }

  if (!await checkSerialConnected()) return;

  try {
    const result = await api.device.readAllParams(deviceId);
    if (result.success) {
      const params = result.data.params;
      Object.keys(params).forEach(key => {
        const input = document.getElementById('param_' + key);
        if (input) {
          input.value = params[key];
          paramValues[key] = params[key];
        }
      });
      showToast('读取全部参数成功', 'success');
    } else {
      showToast('读取失败: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('读取失败: ' + error.message, 'error');
  }
}

async function handleWriteAllParams() {
  const deviceId = parseInt(document.getElementById('targetDeviceId').value);
  if (!deviceId) {
    showToast('请输入目标设备ID', 'warning');
    return;
  }

  if (!await checkSerialConnected()) return;

  const params = {};
  paramConfig.forEach(param => {
    const input = document.getElementById('param_' + param.key);
    if (input && input.value !== '') {
      params[param.key] = input.value;
    }
  });

  const validation = await api.param.validateAll(params);
  if (!validation.success) {
    showToast('参数校验失败: ' + validation.errors.join('; '), 'error');
    return;
  }

  try {
    const result = await api.device.writeAllParams(deviceId, params);
    if (result.success) {
      Object.keys(params).forEach(key => paramValues[key] = params[key]);
      showToast('写入全部参数成功', 'success');
    } else {
      showToast('写入失败: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('写入失败: ' + error.message, 'error');
  }
}

async function readParam(paramKey) {
  const deviceId = parseInt(document.getElementById('targetDeviceId').value);
  if (!deviceId) {
    showToast('请输入目标设备ID', 'warning');
    return;
  }

  if (!await checkSerialConnected()) return;

  try {
    const result = await api.device.readParam(deviceId, paramKey);
    if (result.success) {
      document.getElementById('param_' + paramKey).value = result.data.value;
      paramValues[paramKey] = result.data.value;
      showToast(`读取${result.data.name}成功: ${result.data.value}`, 'success');
    } else {
      showToast('读取失败: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('读取失败: ' + error.message, 'error');
  }
}

async function writeParam(paramKey) {
  const deviceId = parseInt(document.getElementById('targetDeviceId').value);
  const value = document.getElementById('param_' + paramKey).value;

  if (!deviceId) {
    showToast('请输入目标设备ID', 'warning');
    return;
  }

  if (!await checkSerialConnected()) return;

  const validation = await api.param.validate(paramKey, value);
  if (!validation.success) {
    showToast('参数校验失败: ' + validation.error, 'error');
    return;
  }

  try {
    const result = await api.device.writeParam(deviceId, paramKey, value);
    if (result.success) {
      paramValues[paramKey] = value;
      showToast('写入成功', 'success');
    } else {
      showToast('写入失败: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('写入失败: ' + error.message, 'error');
  }
}

async function refreshLogFiles() {
  const result = await api.logger.getLogFiles();
  if (result.success) {
    const select = document.getElementById('logFileSelect');
    select.innerHTML = '<option value="">选择日志文件</option>';
    result.data.forEach(file => {
      select.innerHTML += `<option value="${file}">${file}</option>`;
    });
  }
}

async function handleLogFileSelect(e) {
  const filename = e.target.value;
  if (!filename) {
    document.getElementById('logViewer').innerHTML = '<div class="log-line">请选择日志文件查看内容</div>';
    return;
  }

  const result = await api.logger.readLogFile(filename);
  if (result.success) {
    const viewer = document.getElementById('logViewer');
    viewer.innerHTML = result.data.map(line => {
      let level = 'info';
      if (line.includes('"level":"error"')) level = 'error';
      else if (line.includes('"level":"warn"')) level = 'warn';
      return `<div class="log-line ${level}">${escapeHtml(line)}</div>`;
    }).join('');
    viewer.scrollTop = viewer.scrollHeight;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addMonitorLine(text, type = 'info') {
  const monitor = document.getElementById('monitorContent');
  const line = document.createElement('div');
  line.className = 'monitor-line ' + type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  monitor.appendChild(line);
  monitor.scrollTop = monitor.scrollHeight;

  if (monitor.children.length > 1000) {
    monitor.removeChild(monitor.firstChild);
  }
}

function clearMonitor() {
  document.getElementById('monitorContent').innerHTML = '<div class="monitor-line">等待数据...</div>';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

window.readParam = readParam;
window.writeParam = writeParam;
window.checkDevice = checkDevice;
window.removeDevice = removeDevice;
window.removeTask = removeTask;
