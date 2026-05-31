import { AppDataSource } from '../database/data-source';
import { TerminalManager } from '../../shared/modules/terminal/TerminalManager';
import { FirmwareManager } from '../../shared/modules/firmware/FirmwareManager';
import { UpgradeTaskManager } from '../../shared/modules/task/UpgradeTaskManager';
import { LogService } from '../../shared/modules/logger/LogService';
import { TerminalDiscoverer } from '../../shared/modules/network/TerminalDiscoverer';
import { TerminalEntity } from '../database/entities/Terminal.entity';
import { TerminalGroupEntity } from '../database/entities/TerminalGroup.entity';
import { FirmwareEntity } from '../database/entities/Firmware.entity';
import { UpgradeTaskEntity } from '../database/entities/UpgradeTask.entity';
import { TaskProgressEntity } from '../database/entities/TaskProgress.entity';
import { LogEntity } from '../database/entities/Log.entity';
import { createModuleLogger } from '../../shared/modules/logger';

const logger = createModuleLogger('ServiceContainer');

export class ServiceContainer {
  private static instance: ServiceContainer;
  private initialized = false;

  public terminalManager: TerminalManager;
  public firmwareManager: FirmwareManager;
  public taskManager: UpgradeTaskManager;
  public logService: LogService;
  public terminalDiscoverer: TerminalDiscoverer;

  private constructor() {
    this.terminalManager = new TerminalManager();
    this.firmwareManager = new FirmwareManager();
    this.taskManager = new UpgradeTaskManager();
    this.logService = new LogService();
    this.terminalDiscoverer = new TerminalDiscoverer();
  }

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('init', '开始初始化服务容器');

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      logger.info('database_init', '数据库初始化完成');
    }

    const terminalRepo = AppDataSource.getRepository(TerminalEntity);
    const groupRepo = AppDataSource.getRepository(TerminalGroupEntity);
    const firmwareRepo = AppDataSource.getRepository(FirmwareEntity);
    const taskRepo = AppDataSource.getRepository(UpgradeTaskEntity);
    const progressRepo = AppDataSource.getRepository(TaskProgressEntity);
    const logRepo = AppDataSource.getRepository(LogEntity);

    this.terminalManager.setRepositories(terminalRepo, groupRepo);
    this.firmwareManager.setRepository(firmwareRepo);
    this.taskManager.setRepositories(taskRepo, progressRepo);
    this.logService.setRepository(logRepo);

    this.initialized = true;
    logger.info('init_complete', '服务容器初始化完成');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const serviceContainer = ServiceContainer.getInstance();
export default serviceContainer;
