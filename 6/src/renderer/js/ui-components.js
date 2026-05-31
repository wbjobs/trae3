class UIComponents {
  static showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };

    const icon = icons[type] || icons.info;
    const toastTitle = title || this.getDefaultTitle(type);

    toast.innerHTML = `
      <i class="fa-solid ${icon} toast-icon"></i>
      <div class="toast-content">
        <div class="toast-title">${toastTitle}</div>
        <div class="toast-message">${message}</div>
      </div>
      <i class="fa-solid fa-xmark toast-close"></i>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }

  static getDefaultTitle(type) {
    const titles = {
      success: '操作成功',
      error: '操作失败',
      warning: '注意',
      info: '提示'
    };
    return titles[type] || '提示';
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  static formatTime(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  static getStatusBadge(status) {
    const statusConfig = {
      online: { text: '在线', class: 'online' },
      offline: { text: '离线', class: 'offline' },
      flashing: { text: '刷写中', class: 'flashing' },
      success: { text: '成功', class: 'success' },
      error: { text: '错误', class: 'error' },
      pending: { text: '等待中', class: 'pending' },
      running: { text: '运行中', class: 'flashing' },
      failed: { text: '失败', class: 'failed' },
      cancelled: { text: '已取消', class: 'cancelled' }
    };

    const config = statusConfig[status] || { text: status, class: 'offline' };
    
    return `
      <span class="status-badge ${config.class}">
        <span class="status-dot"></span>
        ${config.text}
      </span>
    `;
  }

  static createProgressCard(task) {
    const statusClass = task.status === 'running' ? 'running' : 
                       task.status === 'success' ? 'success' :
                       task.status === 'failed' ? 'failed' : '';

    return `
      <div class="progress-card ${statusClass}" data-task-id="${task.taskId}">
        <div class="progress-card-header">
          <div class="progress-device">
            <div class="progress-device-icon">
              <i class="fa-solid fa-microchip"></i>
            </div>
            <div class="progress-device-info">
              <div class="progress-device-port">${task.portPath}</div>
              <div class="progress-device-name">${task.firmware.fileName}</div>
            </div>
          </div>
          <div class="progress-actions">
            ${(task.status === 'pending' || task.status === 'running') ? `
              <button class="btn btn-secondary btn-sm btn-cancel-task" data-task-id="${task.taskId}" title="取消">
                <i class="fa-solid fa-stop"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar ${task.status}" style="width: ${task.progress}%"></div>
        </div>
        <div class="progress-info">
          <span class="progress-percent">${task.progress}%</span>
          <span class="progress-time">${this.formatDuration(task.elapsed)}</span>
        </div>
        ${task.error ? `<div class="progress-message text-danger">${task.error}</div>` : ''}
      </div>
    `;
  }

  static createDeviceRow(device, isSelected = false) {
    const manufacturer = device.manufacturer || '-';
    const serialNumber = device.serialNumber || '-';
    const firmwareVersion = device.firmwareVersion || '-';
    const lastSeen = device.lastSeen ? this.formatDate(device.lastSeen) : '-';

    return `
      <tr data-device-id="${device.deviceId}" class="${isSelected ? 'selected' : ''}">
        <td>
          <div class="device-checkbox ${isSelected ? 'checked' : ''}" data-device-id="${device.deviceId}"></div>
        </td>
        <td>${this.getStatusBadge(device.status)}</td>
        <td class="text-mono">${device.portPath}</td>
        <td>${manufacturer}</td>
        <td class="text-mono">${serialNumber}</td>
        <td class="text-mono">${firmwareVersion}</td>
        <td>${lastSeen}</td>
        <td>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm btn-device-info" data-device-id="${device.deviceId}" title="设备信息">
              <i class="fa-solid fa-info"></i>
            </button>
            <button class="btn btn-secondary btn-sm btn-refresh-device" data-device-id="${device.deviceId}" title="刷新">
              <i class="fa-solid fa-rotate-right"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  static createTaskRow(task) {
    return `
      <tr data-task-id="${task.taskId}">
        <td class="text-mono">${task.taskId.substring(0, 12)}...</td>
        <td class="text-mono">${task.portPath}</td>
        <td>${task.firmware.fileName}</td>
        <td>${this.getStatusBadge(task.status)}</td>
        <td>
          <div class="progress-bar-container" style="margin-bottom: 0;">
            <div class="progress-bar ${task.status}" style="width: ${task.progress}%"></div>
          </div>
          <span style="font-size: 11px; color: var(--text-dark-3);">${task.progress}%</span>
        </td>
        <td>${this.formatDuration(task.elapsed)}</td>
        <td>
          <div class="flex gap-sm">
            ${(task.status === 'pending' || task.status === 'running') ? `
              <button class="btn btn-secondary btn-sm btn-cancel-task" data-task-id="${task.taskId}" title="取消">
                <i class="fa-solid fa-stop"></i>
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm btn-view-logs" data-task-id="${task.taskId}" title="查看日志">
              <i class="fa-solid fa-file-lines"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  static createHistoryRow(record) {
    const completedAt = record.completedAt ? this.formatDate(record.completedAt) : '-';
    
    return `
      <tr data-task-id="${record.taskId}">
        <td>${completedAt}</td>
        <td class="text-mono">${record.taskId.substring(0, 12)}...</td>
        <td class="text-mono">${record.portPath}</td>
        <td>${record.firmware.fileName}</td>
        <td>${this.getStatusBadge(record.status)}</td>
        <td>${this.formatDuration(record.elapsed)}</td>
        <td>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm btn-view-logs" data-task-id="${record.taskId}" title="查看日志">
              <i class="fa-solid fa-file-lines"></i>
            </button>
            <button class="btn btn-secondary btn-sm btn-export-report" data-task-id="${record.taskId}" title="导出报告">
              <i class="fa-solid fa-download"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  static createLogEntry(log) {
    const time = this.formatTime(log.timestamp);
    return `
      <div class="log-entry">
        <span class="log-time">${time}</span>
        <span class="log-level ${log.level}">${log.level}</span>
        <span class="log-message">${this.escapeHtml(log.message)}</span>
      </div>
    `;
  }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  static hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  static showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });

    const page = document.getElementById(`page-${pageId}`);
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    
    if (page) page.classList.add('active');
    if (navItem) navItem.classList.add('active');
  }

  static updateStats(stats) {
    const elements = {
      online: document.getElementById('stat-online'),
      pending: document.getElementById('stat-pending'),
      success: document.getElementById('stat-success'),
      failed: document.getElementById('stat-failed')
    };

    for (const [key, element] of Object.entries(elements)) {
      if (element && stats[key] !== undefined) {
        const current = parseInt(element.textContent) || 0;
        const target = stats[key];
        this.animateNumber(element, current, target, 500);
      }
    }
  }

  static animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (end - start) * easeProgress);
      element.textContent = current;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = end;
      }
    }
    
    requestAnimationFrame(update);
  }

  static updateStatusbar(devices, tasks) {
    const onlineDevices = devices.filter(d => d.status !== 'offline').length;
    document.getElementById('statusbar-devices').textContent = `${onlineDevices} 个设备在线`;
    document.getElementById('statusbar-tasks').textContent = `${tasks.length} 个任务`;
    document.getElementById('statusbar-time').textContent = this.formatDate(new Date());
  }

  static setStatus(status, isError = false) {
    const statusDot = document.getElementById('statusbar-dot');
    const statusText = document.getElementById('statusbar-status');
    
    if (isError) {
      statusDot.classList.add('error');
    } else {
      statusDot.classList.remove('error');
    }
    
    statusText.textContent = status;
  }
}
