const api = (window as any).electronAPI;

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFileManager();
  initParser();
  initConverter();
  initSync();
  loadStats();
});

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const viewId = item.getAttribute('data-view');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${viewId}`)?.classList.add('active');
    });
  });
}

function initFileManager() {
  loadFileList();

  document.getElementById('btnImport')?.addEventListener('click', async () => {
    const result = await api.files.openDialog();
    if (result.canceled || result.filePaths.length === 0) return;

    for (const filePath of result.filePaths) {
      try {
        const fs = require('fs');
        const content = fs.readFileSync(filePath, 'utf-8');
        const name = filePath.split(/[/\\]/).pop();
        await api.files.import(name, content, 'fanuc');
      } catch (err) {
        console.error('导入失败:', err);
      }
    }
    loadFileList();
  });

  document.getElementById('btnNewFile')?.addEventListener('click', () => {
    const name = prompt('输入文件名:');
    if (!name) return;
    api.files.import(name, '%\nO0001\nG90 G54 G00 X0 Y0\nG01 Z-5 F100\nG00 Z50\nM30\n%', 'fanuc')
      .then(() => loadFileList())
      .catch(err => console.error('创建失败:', err));
  });

  document.getElementById('searchInput')?.addEventListener('input', () => {
    loadFileList();
  });

  document.getElementById('filterFormat')?.addEventListener('change', () => {
    loadFileList();
  });
}

async function loadFileList() {
  const query = (document.getElementById('searchInput') as HTMLInputElement)?.value || '';
  const format = (document.getElementById('filterFormat') as HTMLSelectElement)?.value || '';

  let files;
  if (query || format) {
    files = await api.files.search(query, format || undefined);
  } else {
    files = await api.files.list();
  }

  const listEl = document.getElementById('fileList');
  if (!listEl) return;

  if (files.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><p>暂无文件，点击"导入文件"开始使用</p></div>';
    return;
  }

  listEl.innerHTML = files.map((file: any) => `
    <div class="file-item" data-id="${file.id}">
      <span class="file-item-name">${escapeHtml(file.name)}</span>
      <span class="file-item-format">${escapeHtml(file.format)}</span>
      <span class="file-item-version">v${file.version}</span>
      <span class="file-item-date">${formatDate(file.lastModified)}</span>
      <div class="file-item-actions">
        <button class="file-action-btn" onclick="viewFile('${file.id}')">查看</button>
        <button class="file-action-btn" onclick="viewVersions('${file.id}')">版本</button>
        <button class="file-action-btn delete" onclick="deleteFile('${file.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

async function viewFile(id: string) {
  const content = await api.files.read(id);
  const file = await api.files.get(id);

  const parserView = document.getElementById('view-parser');
  if (parserView) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-view="parser"]')?.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    parserView.classList.add('active');

    const input = document.getElementById('parseInput') as HTMLTextAreaElement;
    if (input) {
      input.value = content;
    }
    const formatSelect = document.getElementById('parseFormat') as HTMLSelectElement;
    if (formatSelect && file?.format) {
      formatSelect.value = file.format;
    }
  }
}

async function viewVersions(id: string) {
  const versions = await api.files.versions(id);
  if (versions.length === 0) {
    alert('暂无版本记录');
    return;
  }

  const versionList = versions.map((v: any) =>
    `v${v.version} - ${v.changeDescription} (${formatDate(v.timestamp)})`
  ).join('\n');

  const selected = prompt(`版本历史:\n${versionList}\n\n输入版本号查看:`);
  if (selected) {
    const version = parseInt(selected);
    const content = await api.files.readVersion(id, version);
    const input = document.getElementById('parseInput') as HTMLTextAreaElement;
    if (input) input.value = content;
  }
}

async function deleteFile(id: string) {
  if (!confirm('确定删除此文件？')) return;
  await api.files.delete(id);
  loadFileList();
}

function initParser() {
  document.getElementById('btnParse')?.addEventListener('click', async () => {
    const content = (document.getElementById('parseInput') as HTMLTextAreaElement)?.value;
    const format = (document.getElementById('parseFormat') as HTMLSelectElement)?.value;

    if (!content) return;

    const result = await api.parser.parse(content, format);
    displayParseResult(result);
  });

  document.getElementById('btnValidate')?.addEventListener('click', async () => {
    const content = (document.getElementById('parseInput') as HTMLTextAreaElement)?.value;
    const format = (document.getElementById('parseFormat') as HTMLSelectElement)?.value;

    if (!content) return;

    const errors = await api.parser.validate(content, format);
    displayValidationResult(errors);
  });

  document.querySelectorAll('.result-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      document.querySelectorAll('.result-tabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tabId!)?.classList.add('active');
    });
  });
}

function displayParseResult(result: any) {
  const commandsEl = document.getElementById('parsed-commands');
  if (commandsEl) {
    if (result.commands.length === 0) {
      commandsEl.innerHTML = '<div class="result-empty">无指令</div>';
    } else {
      let html = '<table class="command-table"><thead><tr><th>行号</th><th>类型</th><th>代码</th><th>参数</th><th>注释</th></tr></thead><tbody>';
      for (const cmd of result.commands) {
        const params = Object.entries(cmd.parameters || {})
          .map(([k, v]) => `${k}${v}`)
          .join(' ');
        html += `<tr>
          <td>${cmd.lineNumber}</td>
          <td>${cmd.type}</td>
          <td>${cmd.type}${cmd.code}</td>
          <td>${escapeHtml(params)}</td>
          <td>${escapeHtml(cmd.comment || '')}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      commandsEl.innerHTML = html;
    }
  }

  const metadataEl = document.getElementById('parsed-metadata');
  if (metadataEl && result.metadata) {
    const m = result.metadata;
    let html = '<div class="metadata-grid">';
    html += metadataItem('总行数', m.totalLines);
    html += metadataItem('总指令数', m.totalCommands);
    html += metadataItem('快速移动', m.rapidMoves);
    html += metadataItem('直线移动', m.linearMoves);
    html += metadataItem('圆弧移动', m.arcMoves);
    html += metadataItem('换刀次数', m.toolChanges);
    html += metadataItem('暂停次数', m.dwellCount);
    if (m.boundingBox) {
      html += metadataItem('X 范围', `${m.boundingBox.minX.toFixed(2)} ~ ${m.boundingBox.maxX.toFixed(2)}`);
      html += metadataItem('Y 范围', `${m.boundingBox.minY.toFixed(2)} ~ ${m.boundingBox.maxY.toFixed(2)}`);
      html += metadataItem('Z 范围', `${m.boundingBox.minZ.toFixed(2)} ~ ${m.boundingBox.maxZ.toFixed(2)}`);
    }
    html += '</div>';
    metadataEl.innerHTML = html;
  }

  const errorsEl = document.getElementById('parsed-errors');
  if (errorsEl) {
    displayErrors(errorsEl, result.errors);
  }
}

function displayValidationResult(errors: any[]) {
  const errorsEl = document.getElementById('parsed-errors');
  if (errorsEl) {
    displayErrors(errorsEl, errors);

    document.querySelectorAll('.result-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="parsed-errors"]')?.classList.add('active');
    errorsEl.classList.add('active');
  }
}

function displayErrors(container: HTMLElement, errors: any[]) {
  if (errors.length === 0) {
    container.innerHTML = '<div class="result-empty">无错误或警告</div>';
  } else {
    container.innerHTML = errors.map((e: any) =>
      `<div class="error-item ${e.severity}">[行 ${e.line}] ${escapeHtml(e.message)}</div>`
    ).join('');
  }
}

function metadataItem(label: string, value: any): string {
  return `<div class="metadata-item"><label>${label}</label><value>${value}</value></div>`;
}

function initConverter() {
  document.getElementById('btnConvert')?.addEventListener('click', async () => {
    const content = (document.getElementById('convInput') as HTMLTextAreaElement)?.value;
    const sourceFormat = (document.getElementById('convSourceFormat') as HTMLSelectElement)?.value;
    const targetFormat = (document.getElementById('convTargetFormat') as HTMLSelectElement)?.value;

    if (!content) return;

    const result = await api.converter.convert(content, sourceFormat, targetFormat);

    const outputEl = document.getElementById('convOutput') as HTMLTextAreaElement;
    if (outputEl) outputEl.value = result.output;

    const statsEl = document.getElementById('conversionStats');
    if (statsEl) {
      statsEl.style.display = 'flex';
      document.getElementById('convConverted')!.textContent = result.stats.convertedCommands;
      document.getElementById('convSkipped')!.textContent = result.stats.skippedCommands;
      document.getElementById('convUnmapped')!.textContent = result.stats.unmappedCodes.length;

      const warningsEl = document.getElementById('convWarnings');
      if (warningsEl && result.warnings.length > 0) {
        warningsEl.innerHTML = result.warnings.map((w: string) => `<div>⚠ ${escapeHtml(w)}</div>`).join('');
      }
    }
  });
}

function initSync() {
  document.getElementById('btnSyncNow')?.addEventListener('click', async () => {
    try {
      updateSyncStatus('syncing');
      await api.sync.start();
      updateSyncStatus('online');
      loadSyncStatus();
    } catch (err) {
      updateSyncStatus('offline');
      console.error('同步失败:', err);
    }
  });

  document.getElementById('btnSyncStop')?.addEventListener('click', async () => {
    await api.sync.stop();
    updateSyncStatus('offline');
  });

  document.getElementById('btnSaveSyncConfig')?.addEventListener('click', async () => {
    const config = {
      sync: {
        serverUrl: (document.getElementById('syncServerUrl') as HTMLInputElement)?.value,
        apiKey: (document.getElementById('syncApiKey') as HTMLInputElement)?.value,
        syncInterval: parseInt((document.getElementById('syncInterval') as HTMLInputElement)?.value || '300'),
        conflictStrategy: (document.getElementById('syncConflictStrategy') as HTMLSelectElement)?.value,
        autoSync: (document.getElementById('syncAutoSync') as HTMLInputElement)?.checked,
        enabled: true,
      }
    };
    await api.config.update(config);
    alert('配置已保存');
  });

  loadSyncConfig();
}

async function loadSyncConfig() {
  const config = await api.config.get();
  if (config?.sync) {
    const s = config.sync;
    setInputValue('syncServerUrl', s.serverUrl);
    setInputValue('syncApiKey', s.apiKey);
    setInputValue('syncInterval', s.syncInterval);
    setInputValue('syncConflictStrategy', s.conflictStrategy);
    setCheckboxValue('syncAutoSync', s.autoSync);
  }
}

async function loadSyncStatus() {
  const status = await api.sync.status();
  if (!status) return;

  setTextContent('lastSyncTime', status.lastSyncTime ? formatDate(status.lastSyncTime) : '从未');
  setTextContent('syncState', status.syncInProgress ? '同步中...' : '已连接');
  setTextContent('pendingUploads', String(status.pendingUploads));
  setTextContent('pendingDownloads', String(status.pendingDownloads));
  setTextContent('conflictCount', String(status.conflicts.length));

  if (status.conflicts.length > 0) {
    const panel = document.getElementById('conflictsPanel');
    if (panel) {
      panel.style.display = 'block';
      const list = document.getElementById('conflictsList');
      if (list) {
        list.innerHTML = status.conflicts.map((c: any) => `
          <div class="conflict-item">
            <div class="conflict-item-header">
              <span class="conflict-item-name">${escapeHtml(c.fileName)}</span>
              <div class="conflict-item-actions">
                <button class="conflict-btn" onclick="resolveConflict('${c.id}', 'local')">使用本地</button>
                <button class="conflict-btn" onclick="resolveConflict('${c.id}', 'remote')">使用远程</button>
                <button class="conflict-btn" onclick="resolveConflict('${c.id}', 'merge')">合并</button>
              </div>
            </div>
            <div style="font-size:12px;color:var(--text-muted)">
              本地版本: v${c.localVersion.version} | 远程版本: v${c.remoteVersion.version}
            </div>
          </div>
        `).join('');
      }
    }
  }

  if (status.errors.length > 0) {
    const panel = document.getElementById('syncErrorsPanel');
    if (panel) {
      panel.style.display = 'block';
      const list = document.getElementById('syncErrorsList');
      if (list) {
        list.innerHTML = status.errors.slice(-10).map((e: any) => `
          <div class="error-log-item">
            <span class="error-log-time">${formatDate(e.timestamp)}</span>
            <span>${escapeHtml(e.message)}</span>
          </div>
        `).join('');
      }
    }
  }
}

async function resolveConflict(conflictId: string, resolution: string) {
  await api.sync.resolveConflict(conflictId, resolution);
  loadSyncStatus();
}

function updateSyncStatus(state: 'online' | 'offline' | 'syncing') {
  const dot = document.querySelector('#syncStatus .status-dot');
  const text = document.querySelector('#syncStatus .status-text');
  if (dot) {
    dot.className = `status-dot ${state}`;
  }
  if (text) {
    const labels = { online: '已连接', offline: '未连接', syncing: '同步中' };
    text.textContent = labels[state];
  }
}

async function loadStats() {
  const stats = await api.stats.get();
  if (stats) {
    setTextContent('statFiles', String(stats.totalFiles));
    setTextContent('statVersions', String(stats.totalVersions));
    setTextContent('statSize', formatSize(stats.totalSize));
  }
}

function setTextContent(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setInputValue(id: string, value: any) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  if (el) el.value = String(value || '');
}

function setCheckboxValue(id: string, value: boolean) {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.checked = value;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN');
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
