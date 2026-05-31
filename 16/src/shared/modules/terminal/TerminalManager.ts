import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger } from '../logger';
import { Terminal, TerminalStatus, TerminalGroup, PaginatedResponse, PaginationParams, TerminalCreateOptions, TerminalUpdateOptions } from '@shared/types';
import { TerminalEntity } from '@backend/database/entities/Terminal.entity';
import { TerminalGroupEntity } from '@backend/database/entities/TerminalGroup.entity';
import { Repository } from 'typeorm';

const logger = createModuleLogger('TerminalManager');

export class TerminalManager {
  private terminalRepository: Repository<TerminalEntity> | null = null;
  private groupRepository: Repository<TerminalGroupEntity> | null = null;

  constructor() {
    logger.info('init', '终端管理器初始化完成');
  }

  setRepositories(
    terminalRepo: Repository<TerminalEntity>,
    groupRepo: Repository<TerminalGroupEntity>
  ): void {
    this.terminalRepository = terminalRepo;
    this.groupRepository = groupRepo;
  }

  private getTerminalRepository(): Repository<TerminalEntity> {
    if (!this.terminalRepository) {
      throw new Error('终端数据库仓库未初始化');
    }
    return this.terminalRepository;
  }

  private getGroupRepository(): Repository<TerminalGroupEntity> {
    if (!this.groupRepository) {
      throw new Error('分组数据库仓库未初始化');
    }
    return this.groupRepository;
  }

  private entityToTerminal(entity: TerminalEntity): Terminal {
    return {
      id: entity.id,
      name: entity.name,
      ip: entity.ip,
      mac: entity.mac,
      model: entity.model,
      firmwareVersion: entity.firmwareVersion,
      status: entity.status,
      groupId: entity.groupId,
      lastSeen: entity.lastSeen,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  private entityToGroup(entity: TerminalGroupEntity): TerminalGroup {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      terminalCount: entity.terminalCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  async createTerminal(options: TerminalCreateOptions): Promise<Terminal> {
    const repo = this.getTerminalRepository();

    const existing = await repo.findOne({ where: [{ ip: options.ip }, { mac: options.mac }] });
    if (existing) {
      throw new Error(`终端已存在: IP ${options.ip} 或 MAC ${options.mac}`);
    }

    const terminal: Terminal = {
      id: uuidv4(),
      name: options.name,
      ip: options.ip,
      mac: options.mac,
      model: options.model,
      firmwareVersion: options.firmwareVersion,
      status: options.status || TerminalStatus.OFFLINE,
      groupId: options.groupId,
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const entity = repo.create(terminal);
    await repo.save(entity);

    if (options.groupId) {
      await this.updateGroupTerminalCount(options.groupId);
    }

    logger.info('create_terminal', '终端创建成功', {
      terminalId: terminal.id,
      name: terminal.name,
      ip: terminal.ip
    });

    return terminal;
  }

  async updateTerminal(id: string, options: TerminalUpdateOptions): Promise<Terminal | null> {
    const repo = this.getTerminalRepository();
    const entity = await repo.findOne({ where: { id } });

    if (!entity) {
      logger.warn('update_terminal', '终端不存在', { terminalId: id });
      return null;
    }

    const oldGroupId = entity.groupId;

    Object.assign(entity, options);
    entity.updatedAt = new Date();

    await repo.save(entity);

    if (oldGroupId !== options.groupId) {
      if (oldGroupId) {
        await this.updateGroupTerminalCount(oldGroupId);
      }
      if (options.groupId) {
        await this.updateGroupTerminalCount(options.groupId);
      }
    }

    logger.info('update_terminal', '终端更新成功', { terminalId: id });
    return this.entityToTerminal(entity);
  }

  async deleteTerminal(id: string): Promise<boolean> {
    const repo = this.getTerminalRepository();
    const entity = await repo.findOne({ where: { id } });

    if (!entity) {
      logger.warn('delete_terminal', '终端不存在', { terminalId: id });
      return false;
    }

    const groupId = entity.groupId;
    await repo.delete(id);

    if (groupId) {
      await this.updateGroupTerminalCount(groupId);
    }

    logger.info('delete_terminal', '终端删除成功', { terminalId: id });
    return true;
  }

  async getTerminalList(params: PaginationParams & { groupId?: string; status?: TerminalStatus; keyword?: string } = { page: 1, pageSize: 20 }): Promise<PaginatedResponse<Terminal>> {
    const repo = this.getTerminalRepository();
    const queryBuilder = repo.createQueryBuilder('terminal');

    if (params.groupId) {
      queryBuilder.andWhere('terminal.groupId = :groupId', { groupId: params.groupId });
    }

    if (params.status) {
      queryBuilder.andWhere('terminal.status = :status', { status: params.status });
    }

    if (params.keyword) {
      queryBuilder.andWhere('(terminal.name LIKE :keyword OR terminal.ip LIKE :keyword OR terminal.mac LIKE :keyword)', {
        keyword: `%${params.keyword}%`
      });
    }

    const [entities, total] = await queryBuilder
      .orderBy('terminal.createdAt', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getManyAndCount();

    return {
      items: entities.map(e => this.entityToTerminal(e)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getTerminalById(id: string): Promise<Terminal | null> {
    const repo = this.getTerminalRepository();
    const entity = await repo.findOne({ where: { id } });
    return entity ? this.entityToTerminal(entity) : null;
  }

  async getTerminalByIp(ip: string): Promise<Terminal | null> {
    const repo = this.getTerminalRepository();
    const entity = await repo.findOne({ where: { ip } });
    return entity ? this.entityToTerminal(entity) : null;
  }

  async getTerminalByMac(mac: string): Promise<Terminal | null> {
    const repo = this.getTerminalRepository();
    const entity = await repo.findOne({ where: { mac } });
    return entity ? this.entityToTerminal(entity) : null;
  }

  async updateTerminalStatus(id: string, status: TerminalStatus, lastSeen?: Date): Promise<Terminal | null> {
    return this.updateTerminal(id, { status, lastSeen: lastSeen || new Date() });
  }

  async batchUpdateTerminalStatus(ids: string[], status: TerminalStatus): Promise<void> {
    const repo = this.getTerminalRepository();
    await repo.createQueryBuilder()
      .update()
      .set({ status, lastSeen: new Date(), updatedAt: new Date() })
      .whereInIds(ids)
      .execute();

    logger.info('batch_update_status', '批量更新终端状态', { count: ids.length, status });
  }

  async getTerminalCountByStatus(): Promise<Record<TerminalStatus, number>> {
    const repo = this.getTerminalRepository();
    const counts = await repo
      .createQueryBuilder('terminal')
      .select('terminal.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('terminal.status')
      .getRawMany();

    const result: Record<string, number> = {};
    for (const status of Object.values(TerminalStatus)) {
      result[status] = 0;
    }

    for (const item of counts) {
      result[item.status] = Number(item.count);
    }

    return result as Record<TerminalStatus, number>;
  }

  async createGroup(name: string, description?: string): Promise<TerminalGroup> {
    const repo = this.getGroupRepository();

    const existing = await repo.findOne({ where: { name } });
    if (existing) {
      throw new Error(`分组名称已存在: ${name}`);
    }

    const group: TerminalGroup = {
      id: uuidv4(),
      name,
      description,
      terminalCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const entity = repo.create(group);
    await repo.save(entity);

    logger.info('create_group', '分组创建成功', { groupId: group.id, name });
    return this.entityToGroup(entity);
  }

  async updateGroup(id: string, options: { name?: string; description?: string }): Promise<TerminalGroup | null> {
    const repo = this.getGroupRepository();
    const entity = await repo.findOne({ where: { id } });

    if (!entity) {
      logger.warn('update_group', '分组不存在', { groupId: id });
      return null;
    }

    Object.assign(entity, options);
    entity.updatedAt = new Date();
    await repo.save(entity);

    logger.info('update_group', '分组更新成功', { groupId: id });
    return this.entityToGroup(entity);
  }

  async deleteGroup(id: string): Promise<boolean> {
    const repo = this.getGroupRepository();
    const entity = await repo.findOne({ where: { id } });

    if (!entity) {
      logger.warn('delete_group', '分组不存在', { groupId: id });
      return false;
    }

    const terminalRepo = this.getTerminalRepository();
    await terminalRepo.createQueryBuilder()
      .update()
      .set({ groupId: undefined, updatedAt: new Date() })
      .where('groupId = :groupId', { groupId: id })
      .execute();

    await repo.delete(id);

    logger.info('delete_group', '分组删除成功', { groupId: id });
    return true;
  }

  async getGroupList(params: PaginationParams & { keyword?: string } = { page: 1, pageSize: 20 }): Promise<PaginatedResponse<TerminalGroup>> {
    const repo = this.getGroupRepository();
    const queryBuilder = repo.createQueryBuilder('group');

    if (params.keyword) {
      queryBuilder.andWhere('(group.name LIKE :keyword OR group.description LIKE :keyword)', {
        keyword: `%${params.keyword}%`
      });
    }

    const [entities, total] = await queryBuilder
      .orderBy('group.createdAt', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getManyAndCount();

    return {
      items: entities.map(e => this.entityToGroup(e)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getGroupById(id: string): Promise<TerminalGroup | null> {
    const repo = this.getGroupRepository();
    const entity = await repo.findOne({ where: { id } });
    return entity ? this.entityToGroup(entity) : null;
  }

  async getAllGroups(): Promise<TerminalGroup[]> {
    const repo = this.getGroupRepository();
    const entities = await repo.find({ order: { createdAt: 'DESC' } });
    return entities.map(e => this.entityToGroup(e));
  }

  async moveTerminalsToGroup(terminalIds: string[], groupId: string | undefined): Promise<void> {
    const repo = this.getTerminalRepository();
    const terminals = await repo.findByIds(terminalIds);

    const oldGroupIds = new Set<string>();
    for (const terminal of terminals) {
      if (terminal.groupId) {
        oldGroupIds.add(terminal.groupId);
      }
    }

    await repo.createQueryBuilder()
      .update()
      .set({ groupId: groupId ?? undefined, updatedAt: new Date() })
      .whereInIds(terminalIds)
      .execute();

    for (const oldGroupId of oldGroupIds) {
      await this.updateGroupTerminalCount(oldGroupId);
    }
    if (groupId) {
      await this.updateGroupTerminalCount(groupId);
    }

    logger.info('move_terminals', '批量移动终端到分组', { count: terminalIds.length, groupId });
  }

  private async updateGroupTerminalCount(groupId: string): Promise<void> {
    const terminalRepo = this.getTerminalRepository();
    const groupRepo = this.getGroupRepository();

    const count = await terminalRepo.count({ where: { groupId } });
    const group = await groupRepo.findOne({ where: { id: groupId } });

    if (group) {
      group.terminalCount = count;
      group.updatedAt = new Date();
      await groupRepo.save(group);
    }
  }
}

export const createTerminalManager = (): TerminalManager => {
  return new TerminalManager();
};

export default TerminalManager;
