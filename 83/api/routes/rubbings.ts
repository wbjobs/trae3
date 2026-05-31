import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from './auth.js';
import { getMetadataDb, generateUUID } from '../db/index.js';
import { workflowModule } from '../modules/workflow.module.js';
import { validationModule } from '../modules/validation.module.js';
import {
  RubbingMetadata,
  ApiResponse,
  SearchResult,
  WorkflowRecord,
  Version,
  WorkflowAction,
} from '../../shared/types.js';
import * as XLSX from 'xlsx';

const router = Router();

router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();

  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const status = req.query.status as string;
  const offset = (page - 1) * pageSize;

  let whereClause = '';
  const params: (string | number)[] = [];

  if (status) {
    whereClause = 'WHERE r.status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM rubbings r ${whereClause}
  `);

  const dataStmt = db.prepare(`
    SELECT 
      r.*,
      u.username as created_by_name,
      f.id as file_id,
      f.file_name as thumbnail_file
    FROM rubbings r
    LEFT JOIN users u ON r.created_by = u.id
    LEFT JOIN files f ON r.id = f.rubbing_id AND f.is_primary = 1
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const count = countStmt.get(...params) as { total: number };
  const items = dataStmt.all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  const rubbings: RubbingMetadata[] = items.map(item => ({
    id: item.id as string,
    accessionNo: item.accession_no as string,
    title: item.title as string,
    dynasty: item.dynasty as string,
    era: item.era as string,
    author: item.author as string,
    calligrapher: item.calligrapher as string,
    material: item.material as string,
    dimensions: item.width ? {
      width: item.width as number,
      height: item.height as number,
      unit: item.dimension_unit as string,
    } : item.dimensions as string,
    rubbingDate: item.rubbing_date as string,
    rubbingMethod: item.rubbing_method as string,
    collector: item.collector as string,
    collectionNo: item.collection_no as string,
    description: item.description as string,
    inscription: item.inscription as string,
    location: item.location as string,
    inscriptionContent: item.inscription_content as string,
    transcription: item.transcription as string,
    bibliography: item.bibliography as string,
    provenance: item.provenance as string,
    notes: item.notes as string,
    fileId: item.file_id as string,
    keywords: JSON.parse(item.keywords as string) || [],
    status: item.status as RubbingMetadata['status'],
    createdBy: item.created_by as string,
    createdAt: item.created_at as string,
    updatedAt: item.updated_at as string,
  }));

  const response: ApiResponse<SearchResult<RubbingMetadata>> = {
    success: true,
    data: {
      total: count.total,
      items: rubbings,
      page,
      pageSize,
    },
  };

  res.json(response);
});

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();
  const { id } = req.params;

  const item = db.prepare(`
    SELECT 
      r.*,
      u.username as created_by_name,
      f.id as file_id
    FROM rubbings r
    LEFT JOIN users u ON r.created_by = u.id
    LEFT JOIN files f ON r.id = f.rubbing_id AND f.is_primary = 1
    WHERE r.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!item) {
    res.status(404).json({ success: false, message: '拓片记录不存在' });
    return;
  }

  const rubbing: RubbingMetadata = {
    id: item.id as string,
    accessionNo: item.accession_no as string,
    title: item.title as string,
    dynasty: item.dynasty as string,
    era: item.era as string,
    author: item.author as string,
    calligrapher: item.calligrapher as string,
    material: item.material as string,
    dimensions: item.width ? {
      width: item.width as number,
      height: item.height as number,
      unit: item.dimension_unit as string,
    } : item.dimensions as string,
    rubbingDate: item.rubbing_date as string,
    rubbingMethod: item.rubbing_method as string,
    collector: item.collector as string,
    collectionNo: item.collection_no as string,
    description: item.description as string,
    inscription: item.inscription as string,
    location: item.location as string,
    inscriptionContent: item.inscription_content as string,
    transcription: item.transcription as string,
    bibliography: item.bibliography as string,
    provenance: item.provenance as string,
    notes: item.notes as string,
    fileId: item.file_id as string,
    keywords: JSON.parse(item.keywords as string) || [],
    status: item.status as RubbingMetadata['status'],
    createdBy: item.created_by as string,
    createdAt: item.created_at as string,
    updatedAt: item.updated_at as string,
  };

  res.json({ success: true, data: rubbing });
});

router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();

  const validation = validationModule.validateMetadata(req.body);

  if (validation.errors.length > 0) {
    res.status(400).json({
      success: false,
      errors: validation.errors,
      message: '数据校验不通过',
    });
    return;
  }

  const {
    accessionNo,
    title,
    dynasty,
    era,
    author,
    calligrapher,
    material,
    dimensions,
    rubbingDate,
    rubbingMethod,
    collector,
    collectionNo,
    description,
    inscription,
    location,
    inscriptionContent,
    transcription,
    bibliography,
    provenance,
    notes,
    keywords,
  } = req.body;

  const existing = db.prepare('SELECT id FROM rubbings WHERE accession_no = ?').get(accessionNo);
  if (existing) {
    res.status(400).json({ success: false, message: '登记号已存在' });
    return;
  }

  const id = generateUUID();
  const createdBy = req.user?.id;

  let widthVal = null, heightVal = null, unitVal = 'cm', dimensionsVal = null;
  if (typeof dimensions === 'object' && dimensions) {
    widthVal = dimensions.width;
    heightVal = dimensions.height;
    unitVal = dimensions.unit || 'cm';
  } else if (typeof dimensions === 'string') {
    dimensionsVal = dimensions;
  }

  const stmt = db.prepare(`
    INSERT INTO rubbings (
      id, accession_no, title, dynasty, era, author, calligrapher, material,
      width, height, dimension_unit, dimensions, rubbing_date, rubbing_method,
      collector, collection_no, description, inscription, location,
      inscription_content, transcription, bibliography, provenance, notes,
      keywords, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `);

  stmt.run(
    id,
    accessionNo,
    title,
    dynasty || null,
    era || null,
    author || null,
    calligrapher || null,
    material || null,
    widthVal,
    heightVal,
    unitVal,
    dimensionsVal,
    rubbingDate || null,
    rubbingMethod || null,
    collector || null,
    collectionNo || null,
    description || null,
    inscription || null,
    location || null,
    inscriptionContent || null,
    transcription || null,
    bibliography || null,
    provenance || null,
    notes || null,
    JSON.stringify(keywords || []),
    createdBy || null
  );

  res.json({ success: true, data: { id }, message: '创建成功' });
});

router.put('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT id, status FROM rubbings WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ success: false, message: '拓片记录不存在' });
    return;
  }

  const validation = validationModule.validateMetadata(req.body);

  if (validation.errors.length > 0) {
    res.status(400).json({
      success: false,
      errors: validation.errors,
      message: '数据校验不通过',
    });
    return;
  }

  const {
    accessionNo,
    title,
    dynasty,
    era,
    author,
    calligrapher,
    material,
    dimensions,
    rubbingDate,
    rubbingMethod,
    collector,
    collectionNo,
    description,
    inscription,
    location,
    inscriptionContent,
    transcription,
    bibliography,
    provenance,
    notes,
    keywords,
  } = req.body;

  const accessionExists = db.prepare(
    'SELECT id FROM rubbings WHERE accession_no = ? AND id != ?'
  ).get(accessionNo, id);

  if (accessionExists) {
    res.status(400).json({ success: false, message: '登记号已存在' });
    return;
  }

  let widthVal = null, heightVal = null, unitVal = 'cm', dimensionsVal = null;
  if (typeof dimensions === 'object' && dimensions) {
    widthVal = dimensions.width;
    heightVal = dimensions.height;
    unitVal = dimensions.unit || 'cm';
  } else if (typeof dimensions === 'string') {
    dimensionsVal = dimensions;
  }

  const stmt = db.prepare(`
    UPDATE rubbings SET
      accession_no = ?,
      title = ?,
      dynasty = ?,
      era = ?,
      author = ?,
      calligrapher = ?,
      material = ?,
      width = ?,
      height = ?,
      dimension_unit = ?,
      dimensions = ?,
      rubbing_date = ?,
      rubbing_method = ?,
      collector = ?,
      collection_no = ?,
      description = ?,
      inscription = ?,
      location = ?,
      inscription_content = ?,
      transcription = ?,
      bibliography = ?,
      provenance = ?,
      notes = ?,
      keywords = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    accessionNo,
    title,
    dynasty || null,
    era || null,
    author || null,
    calligrapher || null,
    material || null,
    widthVal,
    heightVal,
    unitVal,
    dimensionsVal,
    rubbingDate || null,
    rubbingMethod || null,
    collector || null,
    collectionNo || null,
    description || null,
    inscription || null,
    location || null,
    inscriptionContent || null,
    transcription || null,
    bibliography || null,
    provenance || null,
    notes || null,
    JSON.stringify(keywords || []),
    id
  );

  if (req.user) {
    try {
      workflowModule.transitionStatus(id, 'update', req.user.id, '编辑著录内容');
    } catch (e) {
      console.error('创建更新工作流记录失败:', e);
    }
  }

  const updatedItem = db.prepare(`
    SELECT 
      r.*,
      u.username as created_by_name,
      f.id as file_id
    FROM rubbings r
    LEFT JOIN users u ON r.created_by = u.id
    LEFT JOIN files f ON r.id = f.rubbing_id AND f.is_primary = 1
    WHERE r.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  const rubbing: RubbingMetadata = {
    id: updatedItem!.id as string,
    accessionNo: updatedItem!.accession_no as string,
    title: updatedItem!.title as string,
    dynasty: updatedItem!.dynasty as string,
    era: updatedItem!.era as string,
    author: updatedItem!.author as string,
    calligrapher: updatedItem!.calligrapher as string,
    material: updatedItem!.material as string,
    dimensions: updatedItem!.width ? {
      width: updatedItem!.width as number,
      height: updatedItem!.height as number,
      unit: updatedItem!.dimension_unit as string,
    } : updatedItem!.dimensions as string,
    rubbingDate: updatedItem!.rubbing_date as string,
    rubbingMethod: updatedItem!.rubbing_method as string,
    collector: updatedItem!.collector as string,
    collectionNo: updatedItem!.collection_no as string,
    description: updatedItem!.description as string,
    inscription: updatedItem!.inscription as string,
    location: updatedItem!.location as string,
    inscriptionContent: updatedItem!.inscription_content as string,
    transcription: updatedItem!.transcription as string,
    bibliography: updatedItem!.bibliography as string,
    provenance: updatedItem!.provenance as string,
    notes: updatedItem!.notes as string,
    fileId: updatedItem!.file_id as string,
    keywords: JSON.parse(updatedItem!.keywords as string) || [],
    status: updatedItem!.status as RubbingMetadata['status'],
    createdBy: updatedItem!.created_by as string,
    createdAt: updatedItem!.created_at as string,
    updatedAt: updatedItem!.updated_at as string,
  };

  res.json({ success: true, data: rubbing, message: '更新成功' });
});

router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT id FROM rubbings WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ success: false, message: '拓片记录不存在' });
    return;
  }

  db.prepare('DELETE FROM rubbings WHERE id = ?').run(id);

  res.json({ success: true, message: '删除成功' });
});

router.post('/:id/submit', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const record = workflowModule.transitionStatus(
    req.params.id,
    'submit',
    req.user.id,
    req.body.comment
  );

  if (!record) {
    res.status(400).json({ success: false, message: '提交审核失败，请检查权限' });
    return;
  }

  res.json({ success: true, data: record, message: '提交审核成功' });
});

router.post('/:id/approve', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const record = workflowModule.transitionStatus(
    req.params.id,
    'approve',
    req.user.id,
    req.body.comment
  );

  if (!record) {
    res.status(400).json({ success: false, message: '审核通过失败，请检查权限' });
    return;
  }

  res.json({ success: true, data: record, message: '审核通过' });
});

router.post('/:id/reject', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const record = workflowModule.transitionStatus(
    req.params.id,
    'reject',
    req.user.id,
    req.body.comment
  );

  if (!record) {
    res.status(400).json({ success: false, message: '审核驳回失败，请检查权限' });
    return;
  }

  res.json({ success: true, data: record, message: '已驳回' });
});

router.get('/:id/workflow', authenticateToken, (req: AuthRequest, res: Response) => {
  const history = workflowModule.getWorkflowHistory(req.params.id);

  const response: ApiResponse<WorkflowRecord[]> = {
    success: true,
    data: history,
  };

  res.json(response);
});

router.get('/:id/versions', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();
  const { id } = req.params;

  const versions = db.prepare(`
    SELECT 
      v.*,
      u.username as created_by_name
    FROM versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.rubbing_id = ?
    ORDER BY v.version_no DESC
  `).all(id) as Array<Record<string, unknown>>;

  const versionList: Version[] = versions.map(v => ({
    id: v.id as string,
    rubbingId: v.rubbing_id as string,
    versionNo: v.version_no as number,
    metadataSnapshot: JSON.parse(v.metadata_snapshot as string),
    createdBy: v.created_by as string,
    createdAt: v.created_at as string,
    changeNote: v.change_note as string,
  }));

  res.json({ success: true, data: versionList });
});

router.get('/:id/available-actions', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();
  const { id } = req.params;

  const rubbing = db.prepare('SELECT status FROM rubbings WHERE id = ?').get(id) as { status: RubbingMetadata['status'] } | undefined;

  if (!rubbing || !req.user) {
    res.status(404).json({ success: false, message: '拓片记录不存在' });
    return;
  }

  const actions = workflowModule.getAvailableActions(rubbing.status, req.user.role);
  const actionList = actions.map(action => ({
    action,
    label: workflowModule.getActionLabel(action),
  }));

  res.json({ success: true, data: actionList });
});

const EXPORT_COLUMNS = [
  { key: 'accessionNo', label: '登录号' },
  { key: 'title', label: '题名' },
  { key: 'dynasty', label: '朝代' },
  { key: 'era', label: '年代' },
  { key: 'author', label: '撰者' },
  { key: 'calligrapher', label: '书者' },
  { key: 'material', label: '材质' },
  { key: 'dimensions', label: '尺寸' },
  { key: 'location', label: '现藏地点' },
  { key: 'rubbingDate', label: '拓制年代' },
  { key: 'rubbingMethod', label: '拓制方法' },
  { key: 'collector', label: '收藏者' },
  { key: 'collectionNo', label: '馆藏号' },
  { key: 'inscriptionContent', label: '铭文内容' },
  { key: 'transcription', label: '释文' },
  { key: 'bibliography', label: '著录' },
  { key: 'provenance', label: '来源' },
  { key: 'notes', label: '备注' },
  { key: 'keywords', label: '关键词' },
  { key: 'status', label: '状态' },
  { key: 'createdAt', label: '创建时间' },
];

const parseExcelDate = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'number') {
    try {
      return XLSX.SSF.format('yyyy-mm-dd', value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const parseStringValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() || undefined;
  return String(value);
};

const parseArrayValue = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    return value.split(/[,，;；\s]+/).filter(Boolean).map(s => s.trim());
  }
  return [];
};

const STATUS_MAP: Record<string, string> = {
  '草稿': 'draft',
  '待审核': 'pending',
  '已发布': 'published',
  '已驳回': 'draft',
  'draft': 'draft',
  'pending': 'pending',
  'published': 'published',
  'rejected': 'draft',
};

router.get('/export', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();

  const keyword = (req.query.keyword as string) || '';
  const status = (req.query.status as string) || '';
  const dynasty = (req.query.dynasty as string) || '';

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (keyword && keyword.trim()) {
    const kw = `%${keyword.trim().toLowerCase()}%`;
    whereClauses.push(`(
      LOWER(title) LIKE ? OR
      LOWER(dynasty) LIKE ? OR
      LOWER(author) LIKE ? OR
      LOWER(description) LIKE ? OR
      LOWER(keywords) LIKE ?
    )`);
    params.push(...Array(5).fill(kw));
  }

  if (status && status.trim()) {
    whereClauses.push('status = ?');
    params.push(status);
  }

  if (dynasty && dynasty.trim()) {
    whereClauses.push('dynasty = ?');
    params.push(dynasty);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const items = db.prepare(`
    SELECT 
      r.*,
      u.username as created_by_name
    FROM rubbings r
    LEFT JOIN users u ON r.created_by = u.id
    ${whereClause}
    ORDER BY r.created_at DESC
  `).all(...params) as Array<Record<string, unknown>>;

  const statusLabels: Record<string, string> = {
    draft: '草稿',
    pending: '待审核',
    published: '已发布',
  };

  const exportData = items.map(item => {
    let dims = '';
    if (item.width && item.height) {
      dims = `${item.width} × ${item.height} ${item.dimension_unit || 'cm'}`;
    } else if (item.dimensions) {
      dims = String(item.dimensions);
    }

    const kws = JSON.parse((item.keywords as string) || '[]') as string[];

    return {
      登录号: item.accession_no || '',
      题名: item.title || '',
      朝代: item.dynasty || '',
      年代: item.era || '',
      撰者: item.author || '',
      书者: item.calligrapher || '',
      材质: item.material || '',
      尺寸: dims,
      现藏地点: item.location || '',
      拓制年代: item.rubbing_date || '',
      拓制方法: item.rubbing_method || '',
      收藏者: item.collector || '',
      馆藏号: item.collection_no || '',
      铭文内容: item.inscription_content || '',
      释文: item.transcription || '',
      著录: item.bibliography || '',
      来源: item.provenance || '',
      备注: item.notes || '',
      关键词: kws.join('、'),
      状态: statusLabels[(item.status as string) || 'draft'] || '草稿',
      创建时间: item.created_at || '',
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);

  ws['!cols'] = EXPORT_COLUMNS.map(() => ({ wch: 15 }));
  ws['!cols'][0] = { wch: 18 };
  ws['!cols'][1] = { wch: 30 };

  XLSX.utils.book_append_sheet(wb, ws, '拓片著录');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `拓片著录档案_${new Date().toISOString().split('T')[0]}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(Buffer.from(buffer));
});

router.post('/batch-import', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  try {
    const { records } = req.body as { records: Array<Record<string, unknown>> };

    if (!records || records.length === 0) {
      res.status(400).json({ success: false, message: '导入数据不能为空' });
      return;
    }

    if (records.length > 500) {
      res.status(400).json({ success: false, message: '单次导入不能超过500条' });
      return;
    }

    const db = getMetadataDb();
    const results: Array<{
      row: number;
      accessionNo: string;
      title: string;
      success: boolean;
      error?: string;
      rubbingId?: string;
    }> = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const accessionNo = parseStringValue(row['登录号'] || row['accessionNo']);
      const title = parseStringValue(row['题名'] || row['title']);
      const rowNum = i + 2;

      try {
        if (!accessionNo) throw new Error('登录号不能为空');
        if (!title) throw new Error('题名不能为空');

        const existing = db.prepare('SELECT id FROM rubbings WHERE accession_no = ?').get(accessionNo);
        if (existing) throw new Error('登录号已存在');

        const dimensionsStr = parseStringValue(row['尺寸'] || row['dimensions']) || '';
        const keywords = parseArrayValue(row['关键词'] || row['keywords']);
        const statusRaw = parseStringValue(row['状态'] || row['status']);
        const status = (STATUS_MAP[statusRaw || ''] || 'draft') as RubbingMetadata['status'];

        const rubbingId = generateUUID();

        db.prepare(`
          INSERT INTO rubbings (
            id, accession_no, title, dynasty, era, author, calligrapher,
            material, dimensions, rubbing_date, rubbing_method, collector,
            collection_no, description, inscription, location, inscription_content,
            transcription, bibliography, provenance, notes, keywords, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rubbingId,
          accessionNo,
          title,
          parseStringValue(row['朝代'] || row['dynasty']),
          parseStringValue(row['年代'] || row['era']),
          parseStringValue(row['撰者'] || row['author']),
          parseStringValue(row['书者'] || row['calligrapher']),
          parseStringValue(row['材质'] || row['material']),
          dimensionsStr || null,
          parseExcelDate(row['拓制年代'] || row['rubbingDate']),
          parseStringValue(row['拓制方法'] || row['rubbingMethod']),
          parseStringValue(row['收藏者'] || row['collector']),
          parseStringValue(row['馆藏号'] || row['collectionNo']),
          parseStringValue(row['描述'] || row['description']),
          parseStringValue(row['铭文'] || row['inscription']),
          parseStringValue(row['现藏地点'] || row['location']),
          parseStringValue(row['铭文内容'] || row['inscriptionContent']),
          parseStringValue(row['释文'] || row['transcription']),
          parseStringValue(row['著录'] || row['bibliography']),
          parseStringValue(row['来源'] || row['provenance']),
          parseStringValue(row['备注'] || row['notes']),
          JSON.stringify(keywords),
          status,
          req.user.id
        );

        if (status !== 'draft') {
          const toStatus = status;
          db.prepare(`
            INSERT INTO workflow_records (
              id, rubbing_id, action, operator_id, operator_name, comment,
              previous_status, new_status, to_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(
            generateUUID(),
            rubbingId,
            'create',
            req.user.id,
            req.user.username,
            '批量导入创建',
            'draft',
            toStatus,
            toStatus
          );
        }

        results.push({
          row: rowNum,
          accessionNo,
          title,
          success: true,
          rubbingId,
        });
      } catch (e) {
        results.push({
          row: rowNum,
          accessionNo: accessionNo || '(空)',
          title: title || '(空)',
          success: false,
          error: e instanceof Error ? e.message : '未知错误',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      data: {
        total: results.length,
        success: successCount,
        failed: failCount,
        results,
      },
      message: `导入完成：成功 ${successCount} 条，失败 ${failCount} 条`,
    });
  } catch (e) {
    console.error('Batch import error:', e);
    res.status(500).json({
      success: false,
      message: `导入失败：${e instanceof Error ? e.message : '未知错误'}`,
    });
  }
});

router.get('/import-template', (req: AuthRequest, res: Response) => {
  const templateData = [
    {
      登录号: '示例：TP2024-001',
      题名: '示例：九成宫醴泉铭',
      朝代: '示例：唐',
      年代: '示例：贞观六年',
      撰者: '示例：魏征',
      书者: '示例：欧阳询',
      材质: '示例：纸本',
      尺寸: '示例：120 × 80 cm',
      现藏地点: '示例：故宫博物院',
      拓制年代: '示例：1980',
      拓制方法: '示例：乌金拓',
      收藏者: '示例：张伯驹',
      馆藏号: '示例：GB001',
      铭文内容: '示例：秘书监检校侍中钜鹿郡公臣奉王...',
      释文: '示例：秘书监检校侍中钜鹿郡公臣奉王...',
      著录: '示例：金石录卷二十三',
      来源: '示例：1956年收购',
      备注: '示例：保存完好，无缺损',
      关键词: '示例：唐代,楷书,欧阳询',
      状态: '示例：草稿/待审核/已发布',
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = Array(19).fill(null).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = '拓片批量导入模板.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(Buffer.from(buffer));
});

export default router;
