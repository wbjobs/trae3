import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import type { FirmwareProject, BuildRecord, CompilerConfig, BuildSnapshot, RiskCheckResult, RiskCheck } from '@shared/types';
import { generateId, calculateMD5, ensureDir, findFilesByPattern, createBuildSnapshot, analyzeFirmwareSections } from '@shared/utils';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 768,
    title: '固件批量编译与版本管控系统',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    icon: join(__dirname, '../public/icon.png')
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

ipcMain.handle('dialog:openFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters
  });
  return result.filePaths;
});

ipcMain.handle('dialog:saveFile', async (_, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath
  });
  return result.filePath;
});

ipcMain.handle('fs:readFile', async (_, filePath: string, encoding?: BufferEncoding) => {
  return fs.readFileSync(filePath, encoding);
});

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string | Buffer) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  return true;
});

ipcMain.handle('fs:exists', async (_, filePath: string) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('fs:stat', async (_, filePath: string) => {
  const stat = fs.statSync(filePath);
  return {
    size: stat.size,
    mtime: stat.mtime.getTime(),
    isDirectory: stat.isDirectory(),
    isFile: stat.isFile()
  };
});

ipcMain.handle('fs:listDirectory', async (_, dirPath: string) => {
  const files = fs.readdirSync(dirPath);
  return files.map((file) => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    return {
      name: file,
      path: fullPath,
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime.getTime()
    };
  });
});

ipcMain.handle('fs:findFiles', async (_, dir: string, pattern: string) => {
  return findFilesByPattern(dir, new RegExp(pattern));
});

ipcMain.handle('fs:copyFile', async (_, src: string, dest: string) => {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
});

ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
});

ipcMain.handle('crypto:md5', async (_, filePath: string) => {
  return calculateMD5(filePath);
});

ipcMain.handle('crypto:md5Sync', (_, data: string) => {
  return crypto.createHash('md5').update(data).digest('hex');
});

ipcMain.handle('path:join', (_, ...paths: string[]) => {
  return path.join(...paths);
});

ipcMain.handle('path:dirname', (_, filePath: string) => {
  return path.dirname(filePath);
});

ipcMain.handle('path:basename', (_, filePath: string, ext?: string) => {
  return path.basename(filePath, ext);
});

ipcMain.handle('app:getPath', (_, name: string) => {
  return app.getPath(name as Electron.PathName);
});

ipcMain.handle('process:platform', () => {
  return process.platform;
});

ipcMain.handle('process:env', () => {
  return process.env;
});

const buildProcesses: Map<string, { process: ReturnType<typeof spawn>; cancel: () => void }> = new Map();

function killProcessTree(pid: number, signal: string = 'SIGTERM'): void {
  if (process.platform === 'win32') {
    try {
      process.kill(pid, signal as NodeJS.Signals);
    } catch (e) {
      console.warn(`Failed to kill process ${pid}:`, e);
    }
  } else {
    try {
      process.kill(-pid, signal as NodeJS.Signals);
    } catch (e) {
      try {
        process.kill(pid, signal as NodeJS.Signals);
      } catch (e2) {
        console.warn(`Failed to kill process ${pid}:`, e2);
      }
    }
  }
}

ipcMain.handle('build:start', async (event, project: FirmwareProject, options: { cleanBuild: boolean; customEnv?: Record<string, string> }) => {
  const buildId = generateId();
  const { compiler, path: projectPath } = project;
  
  const record: BuildRecord = {
    id: buildId,
    projectId: project.id,
    version: project.version,
    status: 'building',
    startTime: Date.now(),
    outputFiles: []
  };

  const platform = process.platform;
  const isWindows = platform === 'win32';
  const isLinux = platform === 'linux';

  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...compiler.env,
      ...options.customEnv,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    };

    if (options.cleanBuild && compiler.cleanCommand) {
      await executeCommand(compiler.cleanCommand, projectPath, env, (data) => {
        event.sender.send(`build:log:${buildId}`, data.toString());
      });
    }

    let childProcess: ReturnType<typeof spawn>;
    
    if (isWindows) {
      childProcess = spawn(compiler.buildCommand, compiler.args, {
        cwd: projectPath,
        env,
        shell: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } else {
      const cmdArgs = compiler.args.length > 0 
        ? [compiler.buildCommand, ...compiler.args]
        : [compiler.buildCommand];
      
      childProcess = spawn('/bin/bash', ['-c', cmdArgs.join(' ')], {
        cwd: projectPath,
        env,
        shell: false,
        detached: !isWindows,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }

    childProcess.stdout?.setEncoding('utf-8');
    childProcess.stderr?.setEncoding('utf-8');

    if (childProcess.stdout) {
      (childProcess.stdout as NodeJS.ReadableStream).setMaxListeners(20);
    }
    if (childProcess.stderr) {
      (childProcess.stderr as NodeJS.ReadableStream).setMaxListeners(20);
    }

    const cancel = () => {
      if (childProcess && !childProcess.killed) {
        if (childProcess.pid) {
          killProcessTree(childProcess.pid, 'SIGTERM');
          setTimeout(() => {
            if (!childProcess.killed && childProcess.pid) {
              killProcessTree(childProcess.pid, 'SIGKILL');
            }
          }, 5000);
        } else {
          childProcess.kill('SIGTERM');
        }
      }
    };

    buildProcesses.set(buildId, { process: childProcess, cancel });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    childProcess.stdout?.on('data', (data) => {
      const str = data.toString();
      stdoutBuffer += str;
      event.sender.send(`build:log:${buildId}`, str);
    });

    childProcess.stderr?.on('data', (data) => {
      const str = data.toString();
      stderrBuffer += str;
      event.sender.send(`build:log:${buildId}`, str);
    });

    childProcess.on('error', (error) => {
      console.error(`Build process error [${buildId}]:`, error);
      record.status = 'failed';
      record.error = error.message;
      record.endTime = Date.now();
      buildProcesses.delete(buildId);
      event.sender.send(`build:complete:${buildId}`, record);
    });

    childProcess.on('close', async (code, signal) => {
      buildProcesses.delete(buildId);
      
      if (code === 0) {
        try {
          const outputPattern = new RegExp(compiler.outputPattern);
          const outputFiles = findFilesByPattern(projectPath, outputPattern);
          
          record.status = 'success';
          record.outputFiles = outputFiles;
          record.outputPath = outputFiles.length > 0 ? outputFiles[0] : undefined;
          
          if (outputFiles.length > 0) {
            record.md5 = await calculateMD5(outputFiles[0]);
            record.size = fs.statSync(outputFiles[0]).size;
            
            try {
              const snapshot = await createBuildSnapshot(buildId, projectPath);
              const sectionSizes = analyzeFirmwareSections(outputFiles[0]);
              if (sectionSizes) {
                snapshot.sectionSizes = sectionSizes;
              }
              record.snapshot = snapshot;
            } catch (snapshotErr) {
              console.warn('Failed to create build snapshot:', snapshotErr);
            }
          }
        } catch (err) {
          console.error('Error finding output files:', err);
          record.status = 'success';
          record.outputFiles = [];
        }
      } else {
        record.status = 'failed';
        if (signal) {
          record.error = `Build terminated by signal: ${signal}`;
        } else if (code !== null) {
          record.error = `Build failed with exit code ${code}`;
        } else {
          record.error = 'Build failed for unknown reason';
        }
      }
      
      record.endTime = Date.now();
      event.sender.send(`build:complete:${buildId}`, record);
    });

    if (isLinux) {
      childProcess.on('exit', () => {
        console.log(`Build process exited [${buildId}]`);
      });
    }

    return { buildId, record };
  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    record.endTime = Date.now();
    return { buildId, record };
  }
});

ipcMain.handle('build:cancel', (_, buildId: string) => {
  const build = buildProcesses.get(buildId);
  if (build) {
    try {
      build.cancel();
    } catch (e) {
      console.error('Error canceling build:', e);
    }
    buildProcesses.delete(buildId);
    return true;
  }
  return false;
});

async function executeCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  onData?: (data: Buffer) => void
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const options: Parameters<typeof exec>[1] = {
      cwd,
      env,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      windowsHide: isWindows
    };

    const child = exec(command, options, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        reject(new Error(`Command failed: ${error.message}\nstderr: ${stderr}`));
      } else {
        resolve({ code: error?.code || 0, stdout, stderr });
      }
    });

    if (onData && child.stdout && child.stderr) {
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
    }

    child.on('error', (err) => {
      reject(err);
    });
  });
}

ipcMain.handle('compiler:detect', async () => {
  const compilers: CompilerConfig[] = [];
  
  const platform = process.platform;
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(platform === 'win32' ? ';' : ':');

  const compilerChecks = [
    {
      type: 'gcc-arm' as const,
      command: 'arm-none-eabi-gcc',
      versionArg: '--version',
      buildCommand: 'make',
      outputPattern: '\\.elf$|\\.bin$|\\.hex$'
    },
    {
      type: 'xtensa' as const,
      command: 'xtensa-esp32-elf-gcc',
      versionArg: '--version',
      buildCommand: 'idf.py build',
      outputPattern: '\\.bin$|\\.elf$'
    },
    {
      type: 'keil' as const,
      command: 'UV4',
      versionArg: '',
      buildCommand: 'UV4 -b',
      outputPattern: '\\.axf$|\\.hex$|\\.bin$'
    }
  ];

  for (const check of compilerChecks) {
    for (const dir of pathDirs) {
      const cmdPath = path.join(dir, platform === 'win32' ? `${check.command}.exe` : check.command);
      if (fs.existsSync(cmdPath)) {
        compilers.push({
          type: check.type,
          path: cmdPath,
          args: [],
          buildCommand: check.buildCommand,
          outputPattern: check.outputPattern
        });
        break;
      }
    }
  }

  return compilers;
});

ipcMain.handle('compiler:getVersion', async (_, compilerPath: string, versionArg: string = '--version') => {
  return new Promise<string>((resolve) => {
    exec(`"${compilerPath}" ${versionArg}`, (error, stdout) => {
      if (error) {
        resolve('Unknown');
      } else {
        resolve(stdout.split('\n')[0].trim());
      }
    });
  });
});

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  return shell.openExternal(url);
});

ipcMain.handle('shell:openPath', async (_, filePath: string) => {
  return shell.openPath(filePath);
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:name', () => {
  return app.getName();
});

ipcMain.handle('snapshot:create', async (_, buildId: string, projectPath: string, includeContent: boolean = false) => {
  try {
    return await createBuildSnapshot(buildId, projectPath, undefined, includeContent);
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    return null;
  }
});

ipcMain.handle('firmware:analyzeSections', async (_, firmwarePath: string) => {
  try {
    return analyzeFirmwareSections(firmwarePath);
  } catch (error) {
    console.error('Failed to analyze firmware sections:', error);
    return null;
  }
});

ipcMain.handle('files:compareContents', async (_, leftPath: string, rightPath: string) => {
  try {
    const leftContent = fs.readFileSync(leftPath, 'utf-8');
    const rightContent = fs.readFileSync(rightPath, 'utf-8');
    return { left: leftContent, right: rightContent };
  } catch (error) {
    console.error('Failed to read files for comparison:', error);
    return null;
  }
});

ipcMain.handle('risk:preCheck', async (_, projects: FirmwareProject[]) => {
  const results: RiskCheckResult[] = [];
  
  for (const project of projects) {
    const checks: RiskCheck[] = [];
    const warnings: string[] = [];
    let hasFail = false;
    let hasWarning = false;

    checks.push(...(await checkEnvironment(project)));
    checks.push(...(await checkSourceCode(project)));
    checks.push(...(await checkBuildConfig(project)));
    checks.push(...(await checkDiskSpace(project)));

    for (const check of checks) {
      if (check.status === 'fail') {
        hasFail = true;
        warnings.push(`[${check.name}] ${check.message}`);
      } else if (check.status === 'warning') {
        hasWarning = true;
      }
    }

    let overallRisk: RiskCheckResult['overallRisk'] = 'low';
    if (hasFail) overallRisk = 'critical';
    else if (checks.filter(c => c.status === 'warning').length >= 3) overallRisk = 'high';
    else if (hasWarning) overallRisk = 'medium';

    results.push({
      projectId: project.id,
      projectName: project.name,
      overallRisk,
      checks,
      canBuild: !hasFail,
      warnings
    });
  }

  return results;
});

async function checkEnvironment(project: FirmwareProject): Promise<RiskCheck[]> {
  const checks: RiskCheck[] = [];

  if (!fs.existsSync(project.path)) {
    checks.push({
      name: '工程目录',
      category: 'environment',
      status: 'fail',
      message: '工程目录不存在',
      detail: project.path,
      suggestion: '请检查工程路径是否正确'
    });
    return checks;
  }

  checks.push({
    name: '工程目录',
    category: 'environment',
    status: 'pass',
    message: '工程目录存在'
  });

  const compilerPath = project.compiler.path;
  if (compilerPath && !fs.existsSync(compilerPath)) {
    checks.push({
      name: '编译器路径',
      category: 'environment',
      status: 'fail',
      message: `编译器不存在: ${compilerPath}`,
      suggestion: '请在设置中配置正确的编译器路径'
    });
  } else if (compilerPath) {
    try {
      fs.accessSync(compilerPath, fs.constants.X_OK);
      checks.push({
        name: '编译器路径',
        category: 'environment',
        status: 'pass',
        message: '编译器可执行'
      });
    } catch {
      checks.push({
        name: '编译器权限',
        category: 'environment',
        status: 'fail',
        message: '编译器无执行权限',
        suggestion: '请添加执行权限: chmod +x ' + compilerPath
      });
    }
  } else {
    try {
      const compilerName = project.compiler.type === 'gcc-arm' ? 'arm-none-eabi-gcc'
        : project.compiler.type === 'xtensa' ? 'xtensa-esp32-elf-gcc'
        : project.compiler.type === 'keil' ? 'UV4'
        : 'make';
      
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? `where ${compilerName}` : `which ${compilerName}`;
      
      await new Promise<void>((resolve, reject) => {
        exec(checkCmd, { timeout: 5000 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      checks.push({
        name: '编译器检测',
        category: 'environment',
        status: 'pass',
        message: `${compilerName} 在 PATH 中找到`
      });
    } catch {
      checks.push({
        name: '编译器检测',
        category: 'environment',
        status: 'fail',
        message: `未在 PATH 中找到编译器 (${project.compiler.type})`,
        suggestion: '请安装编译工具链并添加到 PATH'
      });
    }
  }

  const buildFiles = ['Makefile', 'CMakeLists.txt', 'Kbuild'];
  const hasBuildFile = buildFiles.some(f => fs.existsSync(path.join(project.path, f)));
  const hasKeilProject = findFilesByPattern(project.path, /\.uvprojx$/).length > 0;
  const hasIarProject = findFilesByPattern(project.path, /\.ewp$/).length > 0;
  
  if (!hasBuildFile && !hasKeilProject && !hasIarProject) {
    checks.push({
      name: '构建文件',
      category: 'environment',
      status: 'warning',
      message: '未找到标准构建文件 (Makefile/CMakeLists.txt/.uvprojx/.ewp)',
      suggestion: '请确认构建系统配置正确'
    });
  } else {
    checks.push({
      name: '构建文件',
      category: 'environment',
      status: 'pass',
      message: '构建文件检测通过'
    });
  }

  return checks;
}

async function checkSourceCode(project: FirmwareProject): Promise<RiskCheck[]> {
  const checks: RiskCheck[] = [];

  try {
    const sourceFiles = findFilesByPattern(project.path, /\.(c|cpp|h|hpp|s|S)$/);
    
    if (sourceFiles.length === 0) {
      checks.push({
        name: '源代码文件',
        category: 'source',
        status: 'warning',
        message: '未找到源代码文件',
        suggestion: '请确认工程目录包含源代码'
      });
      return checks;
    }

    checks.push({
      name: '源代码文件',
      category: 'source',
      status: 'pass',
      message: `找到 ${sourceFiles.length} 个源代码文件`
    });

    let largeFileCount = 0;
    let recentlyModifiedCount = 0;
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    for (const filePath of sourceFiles.slice(0, 100)) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 100 * 1024) largeFileCount++;
        if (stat.mtime.getTime() > oneDayAgo) recentlyModifiedCount++;
      } catch {}
    }

    if (largeFileCount > 0) {
      checks.push({
        name: '大型源文件',
        category: 'source',
        status: 'warning',
        message: `${largeFileCount} 个源文件超过 100KB，可能影响编译速度`,
        suggestion: '考虑拆分大型源文件'
      });
    }

    if (recentlyModifiedCount > sourceFiles.length * 0.5) {
      checks.push({
        name: '近期修改',
        category: 'source',
        status: 'warning',
        message: `${recentlyModifiedCount} 个源文件在最近24小时内被修改`,
        suggestion: '大量文件近期被修改，建议确认代码已保存并审查变更'
      });
    }

    const conflictMarkers = ['<<<<<<<', '=======', '>>>>>>>'];
    let conflictCount = 0;
    for (const filePath of sourceFiles.slice(0, 50)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const marker of conflictMarkers) {
          if (content.includes(marker)) {
            conflictCount++;
            break;
          }
        }
      } catch {}
    }

    if (conflictCount > 0) {
      checks.push({
        name: '合并冲突',
        category: 'source',
        status: 'fail',
        message: `检测到 ${conflictCount} 个文件包含合并冲突标记`,
        detail: '文件中包含 <<<<<<<, =======, >>>>>>> 标记',
        suggestion: '请先解决所有合并冲突再编译'
      });
    } else {
      checks.push({
        name: '合并冲突',
        category: 'source',
        status: 'pass',
        message: '未检测到合并冲突'
      });
    }
  } catch (error) {
    checks.push({
      name: '源代码检查',
      category: 'source',
      status: 'warning',
      message: '源代码检查失败',
      detail: (error as Error).message
    });
  }

  return checks;
}

async function checkBuildConfig(project: FirmwareProject): Promise<RiskCheck[]> {
  const checks: RiskCheck[] = [];

  if (!project.compiler.buildCommand || project.compiler.buildCommand.trim() === '') {
    checks.push({
      name: '编译命令',
      category: 'config',
      status: 'fail',
      message: '编译命令为空',
      suggestion: '请配置编译命令'
    });
  } else {
    checks.push({
      name: '编译命令',
      category: 'config',
      status: 'pass',
      message: '编译命令已配置'
    });
  }

  if (!project.version || !/^\d+\.\d+\.\d+/.test(project.version)) {
    checks.push({
      name: '版本号',
      category: 'config',
      status: 'warning',
      message: `版本号格式不规范: ${project.version}`,
      suggestion: '建议使用语义化版本号 (MAJOR.MINOR.PATCH)'
    });
  } else {
    checks.push({
      name: '版本号',
      category: 'config',
      status: 'pass',
      message: `版本号: ${project.version}`
    });
  }

  try {
    const linkerScripts = findFilesByPattern(project.path, /\.(ld|icf|sct)$/);
    if (linkerScripts.length === 0 && project.type !== 'esp32') {
      checks.push({
        name: '链接脚本',
        category: 'config',
        status: 'warning',
        message: '未找到链接脚本文件 (.ld/.icf/.sct)',
        suggestion: 'ESP-IDF 项目自动管理链接脚本，其他项目请确认链接脚本配置'
      });
    } else {
      checks.push({
        name: '链接脚本',
        category: 'config',
        status: 'pass',
        message: linkerScripts.length > 0 ? `找到 ${linkerScripts.length} 个链接脚本` : 'ESP-IDF 自动管理'
      });
    }
  } catch {}

  if (project.lastBuild?.status === 'failed') {
    checks.push({
      name: '上次编译',
      category: 'config',
      status: 'warning',
      message: `上次编译失败: ${project.lastBuild.error || '未知错误'}`,
      suggestion: '请检查上次编译错误后再重试'
    });
  }

  return checks;
}

async function checkDiskSpace(project: FirmwareProject): Promise<RiskCheck[]> {
  const checks: RiskCheck[] = [];

  try {
    const stats = fs.statSync(project.path);
    const requiredSpace = 500 * 1024 * 1024;

    let freeSpace = Infinity;
    try {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        const { execSync } = require('child_process');
        const dfOutput = execSync(`df -k "${project.path}"`, { encoding: 'utf-8' }).split('\n')[1];
        if (dfOutput) {
          const parts = dfOutput.trim().split(/\s+/);
          freeSpace = parseInt(parts[3]) * 1024;
        }
      }
    } catch {}

    if (freeSpace !== Infinity && freeSpace < requiredSpace) {
      checks.push({
        name: '磁盘空间',
        category: 'resource',
        status: 'fail',
        message: `磁盘空间不足: 剩余 ${Math.round(freeSpace / 1024 / 1024)}MB，建议至少 500MB`,
        suggestion: '请清理磁盘空间'
      });
    } else {
      checks.push({
        name: '磁盘空间',
        category: 'resource',
        status: 'pass',
        message: freeSpace !== Infinity ? `剩余空间: ${Math.round(freeSpace / 1024 / 1024)}MB` : '磁盘空间充足'
      });
    }
  } catch (error) {
    checks.push({
      name: '磁盘空间',
      category: 'resource',
      status: 'warning',
      message: '无法检查磁盘空间'
    });
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsage = 1 - freeMem / totalMem;

  if (memUsage > 0.9) {
    checks.push({
      name: '内存使用',
      category: 'resource',
      status: 'warning',
      message: `内存使用率 ${Math.round(memUsage * 100)}%，可能影响编译性能`,
      detail: `总计: ${Math.round(totalMem / 1024 / 1024 / 1024)}GB, 可用: ${Math.round(freeMem / 1024 / 1024 / 1024)}GB`,
      suggestion: '建议关闭其他应用释放内存'
    });
  } else {
    checks.push({
      name: '内存使用',
      category: 'resource',
      status: 'pass',
      message: `内存使用率 ${Math.round(memUsage * 100)}%，可用 ${Math.round(freeMem / 1024 / 1024 / 1024)}GB`
    });
  }

  return checks;
});

ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});
