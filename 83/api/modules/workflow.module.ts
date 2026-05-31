import { getMetadataDb, generateUUID } from '../db/index.js';
import {
  RubbingStatus,
  WorkflowAction,
  WorkflowRecord,
  RubbingMetadata,
  UserRole,
} from '../../shared/types.js';

export class WorkflowModule {
  canTransition(
    currentStatus: RubbingStatus,
    action: WorkflowAction,
    userRole: UserRole
  ): boolean {
    const transitions: Record<RubbingStatus, Array<{ action: WorkflowAction; next: RubbingStatus; allowedRoles: UserRole[] }>> = {
      draft: [
        { action: 'submit', next: 'pending', allowedRoles: ['admin', 'operator'] },
        { action: 'update', next: 'draft', allowedRoles: ['admin', 'operator'] },
      ],
      pending: [
        { action: 'approve', next: 'published', allowedRoles: ['admin', 'auditor'] },
        { action: 'reject', next: 'draft', allowedRoles: ['admin', 'auditor'] },
        { action: 'update', next: 'pending', allowedRoles: ['admin', 'operator'] },
      ],
      published: [
        { action: 'update', next: 'published', allowedRoles: ['admin'] },
      ],
    };

    const allowedTransitions = transitions[currentStatus] || [];
    return allowedTransitions.some(t => t.action === action && t.allowedRoles.includes(userRole));
  }

  getNextStatus(
    currentStatus: RubbingStatus,
    action: WorkflowAction
  ): RubbingStatus | null {
    const transitions: Record<RubbingStatus, Partial<Record<WorkflowAction, RubbingStatus>>> = {
      draft: { submit: 'pending', approve: 'draft', reject: 'draft', create: 'draft', update: 'draft' },
      pending: { submit: 'pending', approve: 'published', reject: 'draft', create: 'pending', update: 'pending' },
      published: { submit: 'published', approve: 'published', reject: 'published', create: 'published', update: 'published' },
    };

    return transitions[currentStatus]?.[action] || null;
  }

  transitionStatus(
    rubbingId: string,
    action: WorkflowAction,
    operatorId: string,
    comment?: string
  ): WorkflowRecord | null {
    const db = getMetadataDb();

    const rubbing = db.prepare(`
      SELECT id, status, title FROM rubbings WHERE id = ?
    `).get(rubbingId) as { id: string; status: RubbingStatus; title: string };

    if (!rubbing) {
      return null;
    }

    const operator = db.prepare(`
      SELECT id, username, role FROM users WHERE id = ?
    `).get(operatorId) as { id: string; username: string; role: UserRole };

    if (!operator) {
      return null;
    }

    if (!this.canTransition(rubbing.status, action, operator.role)) {
      return null;
    }

    const nextStatus = this.getNextStatus(rubbing.status, action);
    if (!nextStatus) {
      return null;
    }

    const previousStatus = rubbing.status;
    const recordId = generateUUID();

    const insertRecordStmt = db.prepare(`
      INSERT INTO workflow_records (
        id, rubbing_id, action, operator_id, operator_name, comment, previous_status, new_status, to_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const updateRubbingStmt = db.prepare(`
      UPDATE rubbings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    const createVersionStmt = db.prepare(`
      INSERT INTO versions (
        id, rubbing_id, version_no, metadata_snapshot, created_by, created_at, change_note
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `);

    const transaction = db.transaction(() => {
      insertRecordStmt.run(
        recordId,
        rubbingId,
        action,
        operatorId,
        operator.username,
        comment || null,
        previousStatus,
        nextStatus,
        nextStatus
      );

      updateRubbingStmt.run(nextStatus, rubbingId);

      const latestVersion = db.prepare(`
        SELECT COALESCE(MAX(version_no), 0) as max_version FROM versions WHERE rubbing_id = ?
      `).get(rubbingId) as { max_version: number };

      const versionNo = latestVersion.max_version + 1;
      const versionId = generateUUID();

      const rubbingFull = db.prepare(`
        SELECT * FROM rubbings WHERE id = ?
      `).get(rubbingId) as Record<string, unknown>;

      const metadataSnapshot: RubbingMetadata = {
        id: rubbingFull.id as string,
        accessionNo: rubbingFull.accession_no as string,
        title: rubbingFull.title as string,
        dynasty: rubbingFull.dynasty as string,
        era: rubbingFull.era as string,
        author: rubbingFull.author as string,
        calligrapher: rubbingFull.calligrapher as string,
        material: rubbingFull.material as string,
        dimensions: rubbingFull.width ? {
          width: rubbingFull.width as number,
          height: rubbingFull.height as number,
          unit: rubbingFull.dimension_unit as string,
        } : rubbingFull.dimensions as string,
        rubbingDate: rubbingFull.rubbing_date as string,
        rubbingMethod: rubbingFull.rubbing_method as string,
        collector: rubbingFull.collector as string,
        collectionNo: rubbingFull.collection_no as string,
        description: rubbingFull.description as string,
        inscription: rubbingFull.inscription as string,
        location: rubbingFull.location as string,
        inscriptionContent: rubbingFull.inscription_content as string,
        transcription: rubbingFull.transcription as string,
        bibliography: rubbingFull.bibliography as string,
        provenance: rubbingFull.provenance as string,
        notes: rubbingFull.notes as string,
        keywords: JSON.parse(rubbingFull.keywords as string) || [],
        status: nextStatus,
        createdAt: rubbingFull.created_at as string,
        updatedAt: new Date().toISOString(),
      };

      createVersionStmt.run(
        versionId,
        rubbingId,
        versionNo,
        JSON.stringify(metadataSnapshot),
        operatorId,
        comment || null
      );

      return { recordId, versionId };
    });

    try {
      transaction();

      return {
        id: recordId,
        rubbingId,
        action,
        operatorId,
        operatorName: operator.username,
        comment,
        previousStatus,
        newStatus: nextStatus,
        toStatus: nextStatus,
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error('Status transition failed:', e);
      return null;
    }
  }

  getWorkflowHistory(rubbingId: string): WorkflowRecord[] {
    const db = getMetadataDb();

    const records = db.prepare(`
      SELECT 
        wr.*,
        u.username as operator_name
      FROM workflow_records wr
      LEFT JOIN users u ON wr.operator_id = u.id
      WHERE wr.rubbing_id = ?
      ORDER BY wr.created_at DESC
    `).all(rubbingId) as Array<Record<string, unknown>>;

    return records.map(record => ({
      id: record.id as string,
      rubbingId: record.rubbing_id as string,
      action: record.action as WorkflowAction,
      operatorId: record.operator_id as string,
      operatorName: record.operator_name as string,
      comment: record.comment as string,
      previousStatus: record.previous_status as RubbingStatus,
      newStatus: record.new_status as RubbingStatus,
      toStatus: (record.to_status || record.new_status) as RubbingStatus,
      createdAt: record.created_at as string,
    }));
  }

  getAvailableActions(status: RubbingStatus, userRole: UserRole): WorkflowAction[] {
    const actions: WorkflowAction[] = [];
    const allActions: WorkflowAction[] = ['submit', 'approve', 'reject'];

    allActions.forEach(action => {
      if (this.canTransition(status, action, userRole)) {
        actions.push(action);
      }
    });

    return actions;
  }

  getStatusLabel(status: RubbingStatus): string {
    const labels: Record<RubbingStatus, string> = {
      draft: '草稿',
      pending: '待审核',
      published: '已发布',
    };
    return labels[status] || status;
  }

  getActionLabel(action: WorkflowAction): string {
    const labels: Record<WorkflowAction, string> = {
      submit: '提交审核',
      approve: '审核通过',
      reject: '审核驳回',
      create: '创建记录',
      update: '编辑内容',
    };
    return labels[action] || action;
  }
}

export const workflowModule = new WorkflowModule();
