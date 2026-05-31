class App {
  constructor() {
    this.devices = [];
    this.selectedDevices = new Set();
    this.tasks = [];
    this.currentFirmware = null;
    this.logFilter = 'all';
    this.settings = this.loadSettings();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupIpcListeners();
    this.loadInitialData();
    this.startClock();
    UIComponents.setStatus('就绪');
  }

  setupEventListeners() {
    document.getElementById('btn-minimize').addEventListener('click', () => {
      ipcClient.minimizeApp();
    });

    document.getElementById('btn-maximize').addEventListener('click', () => {
      ipcClient.toggleMaximize();
    });

    document.getElementById('btn-close').addEventListener('click', () => {
      ipcClient.closeApp();
    });

    ipcClient.onWindowStateChanged((state) => {
      const btn = document.getElementById('btn-maximize');
      const icon = btn.querySelector('i');
      if (state.isMaximized) {
        icon.className = 'fa-regular fa-square-caret-down';
      } else {
        icon.className = 'fa-regular fa-square';
      }
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        UIComponents.showPage(page);
        this.onPageChanged(page);
      });
    });

    document.getElementById('btn-refresh-dashboard').addEventListener('click', () => {
      this.refreshDashboard();
    });

    document.getElementById('btn-start-batch').addEventListener('click', () => {
      this.showCreateTasksModal();
    });

    document.getElementById('btn-clear-completed').addEventListener('click', async () => {
      try {
        await ipcClient.clearCompletedTasks();
        await this.refreshTasks();
        UIComponents.showToast('已清除已完成的任务', 'success');
      } catch (error) {
        UIComponents.showToast(error.message, 'error');
      }
    });

    document.getElementById('btn-cancel-all').addEventListener('click', async () => {
      if (confirm('确定要取消所有正在运行的任务吗？')) {
        try {
          await ipcClient.cancelAllTasks();
          UIComponents.showToast('已取消所有任务', 'info');
        } catch (error) {
          UIComponents.showToast(error.message, 'error');
        }
      }
    });

    document.getElementById('btn-select-all').addEventListener('click', () => {
      this.selectAllDevices(true);
    });

    document.getElementById('btn-deselect-all').addEventListener('click', () => {
      this.selectAllDevices(false);
    });

    document.getElementById('btn-refresh-devices').addEventListener('click', () => {
      this.refreshDevices();
    });

    document.getElementById('select-all-checkbox').addEventListener('click', () => {
      const checkbox = document.getElementById('select-all-checkbox');
      const isChecked = !checkbox.classList.contains('checked');
      this.selectAllDevices(isChecked);
    });

    document.getElementById('firmware-dropzone').addEventListener('click', () => {
      document.getElementById('firmware-file').click();
    });

    document.getElementById('firmware-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.loadFirmware(file.path);
      }
    });

    const dropzone = document.getElementById('firmware-dropzone');
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        this.loadFirmware(file.path);
      }
    });

    document.getElementById('btn-create-tasks').addEventListener('click', () => {
      this.showCreateTasksModal();
    });

    document.getElementById('btn-refresh-history').addEventListener('click', () => {
      this.refreshHistory();
    });

    document.getElementById('btn-clear-history').addEventListener('click', async () => {
      if (confirm('确定要清除所有历史记录吗？此操作不可恢复。')) {
        try {
          await ipcClient.clearHistory();
          await this.refreshHistory();
          UIComponents.showToast('历史记录已清除', 'success');
        } catch (error) {
          UIComponents.showToast(error.message, 'error');
        }
      }
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('btn-reset-settings').addEventListener('click', () => {
      this.resetSettings();
    });

    document.getElementById('btn-close-modal').addEventListener('click', () => {
      UIComponents.hideModal('modal-create-tasks');
    });

    document.getElementById('btn-cancel-modal').addEventListener('click', () => {
      UIComponents.hideModal('modal-create-tasks');
    });

    document.getElementById('btn-confirm-create').addEventListener('click', () => {
      this.createAndStartTasks();
    });

    document.getElementById('modal-create-tasks').addEventListener('click', (e) => {
      if (e.target.id === 'modal-create-tasks') {
        UIComponents.hideModal('modal-create-tasks');
      }
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.logFilter = btn.dataset.level;
        this.refreshLogs();
      });
    });

    document.getElementById('btn-clear-logs').addEventListener('click', async () => {
      try {
        await ipcClient.clearLogs();
        document.getElementById('log-content').innerHTML = '';
        UIComponents.showToast('日志已清除', 'success');
      } catch (error) {
        UIComponents.showToast(error.message, 'error');
      }
    });

    document.getElementById('btn-toggle-log').addEventListener('click', () => {
      const logPanel = document.getElementById('log-panel');
      const isVisible = logPanel.style.display === 'flex';
      logPanel.style.display = isVisible ? 'none' : 'flex';
      
      const icon = document.querySelector('#btn-toggle-log i');
      icon.className = isVisible ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    });

    document.addEventListener('click', (e) => {
      const deviceCheckbox = e.target.closest('.device-checkbox');
      if (deviceCheckbox && !deviceCheckbox.id) {
        const deviceId = deviceCheckbox.dataset.deviceId;
        this.toggleDeviceSelection(deviceId);
      }

      const cancelTaskBtn = e.target.closest('.btn-cancel-task');
      if (cancelTaskBtn) {
        const taskId = cancelTaskBtn.dataset.taskId;
        this.cancelTask(taskId);
      }

      const viewLogsBtn = e.target.closest('.btn-view-logs');
      if (viewLogsBtn) {
        const taskId = viewLogsBtn.dataset.taskId;
        this.showTaskLogs(taskId);
      }

      const exportReportBtn = e.target.closest('.btn-export-report');
      if (exportReportBtn) {
        const taskId = exportReportBtn.dataset.taskId;
        this.exportTaskReport(taskId);
      }
    });
  }

  setupIpcListeners() {
    ipcClient.onDeviceChanged((data) => {
      this.handleDeviceChange(data);
    });

    ipcClient.onDevicesUpdated((devices) => {
      this.devices = devices;
      this.renderDeviceTable();
      this.updateDashboardStats();
    });

    ipcClient.onTaskProgress((progress) => {
      this.handleTaskProgress(progress);
    });

    ipcClient.onTaskComplete((result) => {
      this.handleTaskComplete(result);
    });
  }

  async loadInitialData() {
    try {
      await this.refreshDevices();
      await this.refreshTasks();
      await this.refreshHistory();
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  async refreshDevices() {
    try {
      UIComponents.setStatus('正在扫描设备...');
      this.devices = await ipcClient.refreshDevices();
      this.renderDeviceTable();
      this.updateDashboardStats();
      UIComponents.setStatus('就绪');
    } catch (error) {
      UIComponents.setStatus('扫描设备失败', true);
      UIComponents.showToast(error.message, 'error');
    }
  }

  renderDeviceTable() {
    const tbody = document.getElementById('device-table-body');
    
    if (this.devices.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state" style="padding: var(--spacing-3xl);">
              <i class="fa-solid fa-microchip empty-state-icon"></i>
              <div class="empty-state-title">未检测到设备</div>
              <div class="empty-state-subtitle">请连接设备并点击刷新按钮</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.devices.map(device => 
      UIComponents.createDeviceRow(device, this.selectedDevices.has(device.deviceId))
    ).join('');

    const allSelected = this.devices.length > 0 && 
      this.devices.every(d => this.selectedDevices.has(d.deviceId));
    
    const checkbox = document.getElementById('select-all-checkbox');
    checkbox.classList.toggle('checked', allSelected);
  }

  toggleDeviceSelection(deviceId) {
    if (this.selectedDevices.has(deviceId)) {
      this.selectedDevices.delete(deviceId);
    } else {
      this.selectedDevices.add(deviceId);
    }
    this.renderDeviceTable();
  }

  selectAllDevices(select) {
    if (select) {
      this.devices.forEach(d => this.selectedDevices.add(d.deviceId));
    } else {
      this.selectedDevices.clear();
    }
    this.renderDeviceTable();
  }

  async loadFirmware(filePath) {
    try {
      UIComponents.setStatus('正在解析固件...');
      const result = await ipcClient.loadFirmware(filePath);
      
      if (result.success) {
        this.currentFirmware = result.firmware;
        this.renderFirmwareInfo(result);
        UIComponents.showToast('固件加载成功', 'success');
      } else {
        UIComponents.showToast(result.error, 'error', '固件加载失败');
      }
      
      UIComponents.setStatus('就绪');
    } catch (error) {
      UIComponents.setStatus('固件解析失败', true);
      UIComponents.showToast(error.message, 'error');
    }
  }

  renderFirmwareInfo(result) {
    const info = result.info;
    const isValid = result.isValid;

    document.getElementById('firmware-info-container').style.display = 'block';
    document.getElementById('info-filename').textContent = info.fileName;
    document.getElementById('info-version').textContent = info.version;
    document.getElementById('info-format').textContent = info.format.toUpperCase();
    document.getElementById('info-size').textContent = info.sizeHuman;
    document.getElementById('info-checksum').textContent = info.checksum;
    document.getElementById('info-loadaddr').textContent = info.loadAddress;
    document.getElementById('info-segments').textContent = info.segments;

    const validEl = document.getElementById('info-valid');
    validEl.textContent = isValid ? '通过' : '失败';
    validEl.className = `info-value ${isValid ? 'success' : 'danger'}`;
  }

  async refreshTasks() {
    try {
      this.tasks = await ipcClient.getTasks();
      this.renderTaskTable();
      this.renderProgressGrid();
      this.updateDashboardStats();
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  renderTaskTable() {
    const tbody = document.getElementById('task-table-body');
    
    if (this.tasks.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state" style="padding: var(--spacing-3xl);">
              <i class="fa-solid fa-list-check empty-state-icon"></i>
              <div class="empty-state-title">暂无任务</div>
              <div class="empty-state-subtitle">选择设备和固件后创建刷写任务</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.tasks.map(task => 
      UIComponents.createTaskRow(task)
    ).join('');
  }

  renderProgressGrid() {
    const grid = document.getElementById('progress-grid');
    
    if (this.tasks.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-list-check empty-state-icon"></i>
          <div class="empty-state-title">暂无刷写任务</div>
          <div class="empty-state-subtitle">选择设备并加载固件后开始刷写</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.tasks.map(task => 
      UIComponents.createProgressCard(task)
    ).join('');
  }

  async refreshHistory() {
    try {
      const history = await ipcClient.getHistory({ limit: 100 });
      this.renderHistoryTable(history);
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  renderHistoryTable(history) {
    const tbody = document.getElementById('history-table-body');
    
    if (history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state" style="padding: var(--spacing-3xl);">
              <i class="fa-solid fa-clock-rotate-left empty-state-icon"></i>
              <div class="empty-state-title">暂无历史记录</div>
              <div class="empty-state-subtitle">完成刷写任务后将显示在此处</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = history.map(record => 
      UIComponents.createHistoryRow(record)
    ).join('');
  }

  async refreshLogs() {
    try {
      const options = {};
      if (this.logFilter !== 'all') {
        options.level = this.logFilter;
      }
      
      const logs = await ipcClient.queryLogs(options);
      this.renderLogs(logs);
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  renderLogs(logs) {
    const container = document.getElementById('log-content');
    
    if (logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--spacing-2xl);">
          <div class="empty-state-title">暂无日志</div>
        </div>
      `;
      return;
    }

    container.innerHTML = logs.map(log => 
      UIComponents.createLogEntry(log)
    ).join('');
    
    container.scrollTop = container.scrollHeight;
  }

  showCreateTasksModal() {
    const selectedDevicesList = document.getElementById('selected-devices-list');
    const firmwareInfo = document.getElementById('selected-firmware-info');
    const confirmBtn = document.getElementById('btn-confirm-create');

    const selectedDevices = this.devices.filter(d => 
      this.selectedDevices.has(d.deviceId) && d.status !== 'offline'
    );

    if (selectedDevices.length === 0) {
      selectedDevicesList.innerHTML = '<span class="text-danger">请先选择在线设备</span>';
      confirmBtn.disabled = true;
    } else {
      selectedDevicesList.innerHTML = selectedDevices.map(d => 
        `<span class="status-badge online" style="margin-right: var(--spacing-sm); margin-bottom: var(--spacing-xs);">
          <span class="status-dot"></span>${d.portPath}
        </span>`
      ).join('');
      confirmBtn.disabled = !this.currentFirmware;
    }

    if (!this.currentFirmware) {
      firmwareInfo.innerHTML = '<span class="text-danger">请先加载固件文件</span>';
      confirmBtn.disabled = true;
    } else {
      firmwareInfo.innerHTML = `
        <div>
          <div class="text-mono">${this.currentFirmware.fileName}</div>
          <div class="text-muted" style="font-size: var(--font-size-xs); margin-top: 2px;">
            v${this.currentFirmware.version} · ${UIComponents.formatBytes(this.currentFirmware.size)}
          </div>
        </div>
      `;
      confirmBtn.disabled = selectedDevices.length === 0;
    }

    document.getElementById('modal-baudrate').value = this.settings.baudRate;
    document.getElementById('modal-concurrency').value = this.settings.concurrency;

    UIComponents.showModal('modal-create-tasks');
  }

  async createAndStartTasks() {
    try {
      UIComponents.hideModal('modal-create-tasks');
      UIComponents.setStatus('正在创建任务...');

      const baudRate = parseInt(document.getElementById('modal-baudrate').value);
      const concurrency = parseInt(document.getElementById('modal-concurrency').value);

      const selectedDevices = this.devices.filter(d => 
        this.selectedDevices.has(d.deviceId) && d.status !== 'offline'
      );

      const taskIds = [];
      for (const device of selectedDevices) {
        const task = await ipcClient.createTask({
          deviceId: device.deviceId,
          portPath: device.portPath,
          firmware: this.currentFirmware,
          baudRate
        });
        taskIds.push(task.taskId);
      }

      await this.refreshTasks();
      
      UIComponents.setStatus('正在执行刷写任务...');
      ipcClient.startTasks(taskIds, concurrency);
      
      UIComponents.showToast(`已创建 ${taskIds.length} 个刷写任务`, 'success');
    } catch (error) {
      UIComponents.setStatus('任务创建失败', true);
      UIComponents.showToast(error.message, 'error');
    }
  }

  async cancelTask(taskId) {
    try {
      await ipcClient.cancelTask(taskId);
      UIComponents.showToast('任务已取消', 'info');
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  showTaskLogs(taskId) {
    const logPanel = document.getElementById('log-panel');
    logPanel.style.display = 'flex';
    
    const icon = document.querySelector('#btn-toggle-log i');
    icon.className = 'fa-solid fa-chevron-down';

    this.queryAndRenderLogs(taskId);
  }

  async queryAndRenderLogs(taskId) {
    try {
      const logs = await ipcClient.queryLogs({ taskId, limit: 200 });
      this.renderLogs(logs);
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  async exportTaskReport(taskId) {
    try {
      const exportPath = prompt('请输入导出文件路径:', `task-report-${taskId.substring(0, 8)}.txt`);
      if (exportPath) {
        await ipcClient.exportLogs(taskId, exportPath);
        UIComponents.showToast(`报告已导出到: ${exportPath}`, 'success');
      }
    } catch (error) {
      UIComponents.showToast(error.message, 'error');
    }
  }

  handleDeviceChange(data) {
    if (data.type === 'added') {
      UIComponents.showToast(`检测到新设备: ${data.device.portPath}`, 'info', '新设备');
    } else if (data.type === 'removed') {
      UIComponents.showToast(`设备已断开: ${data.device.portPath}`, 'warning', '设备断开');
    }
    
    this.refreshDevices();
  }

  handleTaskProgress(progress) {
    const taskIndex = this.tasks.findIndex(t => t.taskId === progress.taskId);
    if (taskIndex !== -1) {
      this.tasks[taskIndex] = { ...this.tasks[taskIndex], ...progress };
    } else {
      this.tasks.push(progress);
    }

    this.renderTaskTable();
    this.renderProgressGrid();
    this.updateDashboardStats();

    const progressCard = document.querySelector(`[data-task-id="${progress.taskId}"]`);
    if (progressCard) {
      progressCard.classList.add('animate-pulse');
      setTimeout(() => progressCard.classList.remove('animate-pulse'), 300);
    }

    if (progress.error) {
      this.addLogEntry({
        level: 'error',
        message: `[${progress.portPath}] ${progress.error}`
      });
    }
  }

  handleTaskComplete(result) {
    const taskIndex = this.tasks.findIndex(t => t.taskId === result.taskId);
    if (taskIndex !== -1) {
      this.tasks[taskIndex] = { ...this.tasks[taskIndex], ...result };
    }

    this.renderTaskTable();
    this.renderProgressGrid();
    this.updateDashboardStats();
    this.refreshHistory();

    if (result.status === 'success') {
      UIComponents.showToast(`设备 ${result.portPath} 刷写成功`, 'success');
      this.addLogEntry({
        level: 'info',
        message: `[${result.portPath}] 刷写完成，耗时 ${UIComponents.formatDuration(result.elapsed)}`
      });
    } else if (result.status === 'failed') {
      UIComponents.showToast(`设备 ${result.portPath} 刷写失败: ${result.error}`, 'error');
      this.addLogEntry({
        level: 'error',
        message: `[${result.portPath}] 刷写失败: ${result.error}`
      });
    } else if (result.status === 'cancelled') {
      this.addLogEntry({
        level: 'warn',
        message: `[${result.portPath}] 任务已取消`
      });
    }

    const runningTasks = this.tasks.filter(t => t.status === 'running' || t.status === 'pending');
    if (runningTasks.length === 0) {
      UIComponents.setStatus('就绪');
    }
  }

  addLogEntry(log) {
    const container = document.getElementById('log-content');
    const entry = document.createElement('div');
    entry.innerHTML = UIComponents.createLogEntry({
      ...log,
      timestamp: new Date().toISOString()
    });
    
    if (this.logFilter === 'all' || this.logFilter === log.level) {
      container.appendChild(entry.firstChild);
      container.scrollTop = container.scrollHeight;
    }
  }

  updateDashboardStats() {
    const onlineDevices = this.devices.filter(d => d.status !== 'offline').length;
    const pendingTasks = this.tasks.filter(t => t.status === 'pending').length;
    const successTasks = this.tasks.filter(t => t.status === 'success').length;
    const failedTasks = this.tasks.filter(t => t.status === 'failed').length;

    UIComponents.updateStats({
      online: onlineDevices,
      pending: pendingTasks,
      success: successTasks,
      failed: failedTasks
    });

    UIComponents.updateStatusbar(this.devices, this.tasks);
  }

  async refreshDashboard() {
    await this.refreshDevices();
    await this.refreshTasks();
    UIComponents.showToast('数据已刷新', 'success');
  }

  onPageChanged(page) {
    if (page === 'history') {
      this.refreshHistory();
    }
  }

  loadSettings() {
    const defaults = {
      baudRate: 115200,
      concurrency: 4,
      chunkSize: 1024,
      scanInterval: 2000,
      timeout: 5000
    };

    try {
      const saved = localStorage.getItem('firmwareFlasherSettings');
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }

    return defaults;
  }

  saveSettings() {
    const settings = {
      baudRate: parseInt(document.getElementById('setting-baudrate').value),
      concurrency: parseInt(document.getElementById('setting-concurrency').value),
      chunkSize: parseInt(document.getElementById('setting-chunksize').value),
      scanInterval: parseInt(document.getElementById('setting-scaninterval').value),
      timeout: parseInt(document.getElementById('setting-timeout').value)
    };

    try {
      localStorage.setItem('firmwareFlasherSettings', JSON.stringify(settings));
      this.settings = settings;
      UIComponents.showToast('设置已保存', 'success');
    } catch (error) {
      UIComponents.showToast('保存设置失败: ' + error.message, 'error');
    }
  }

  resetSettings() {
    const defaults = {
      baudRate: 115200,
      concurrency: 4,
      chunkSize: 1024,
      scanInterval: 2000,
      timeout: 5000
    };

    document.getElementById('setting-baudrate').value = defaults.baudRate;
    document.getElementById('setting-concurrency').value = defaults.concurrency;
    document.getElementById('setting-chunksize').value = defaults.chunkSize;
    document.getElementById('setting-scaninterval').value = defaults.scanInterval;
    document.getElementById('setting-timeout').value = defaults.timeout;

    localStorage.removeItem('firmwareFlasherSettings');
    this.settings = defaults;
    UIComponents.showToast('设置已恢复默认', 'info');
  }

  startClock() {
    setInterval(() => {
      document.getElementById('statusbar-time').textContent = 
        UIComponents.formatDate(new Date());
    }, 1000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
