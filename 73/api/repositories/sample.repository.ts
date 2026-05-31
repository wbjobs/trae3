import { getBaseDb, saveBaseDb } from '../db/base-db.js';
import { getFlowDb, saveFlowDb } from '../db/flow-db.js';
import type { Sample, SampleItem } from '../../shared/types.js';

function generateSampleNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `YP${y}${m}${d}${seq}`;
}

function typeToCode(type: string): string {
  const map: Record<string, string> = {
    '化学试剂': 'chem',
    '生物样品': 'bio',
    '环境样品': 'env',
    '食品样品': 'food',
    '药品样品': 'drug',
    '其他': 'other',
  };
  return map[type] || 'other';
}

function codeToType(code: string): string {
  const map: Record<string, string> = {
    'chem': '化学试剂',
    'bio': '生物样品',
    'env': '环境样品',
    'food': '食品样品',
    'drug': '药品样品',
    'other': '其他',
  };
  return map[code] || code;
}

export async function create(data: { name: string; type: string; source: string; specification: string; quantity: number; unit: string; description?: string; createdBy: string }): Promise<Sample> {
  const db = await getBaseDb();
  const id = crypto.randomUUID();
  const sampleNo = generateSampleNo();
  const now = new Date().toISOString();
  const typeCode = typeToCode(data.type);

  db.run(
    'INSERT INTO samples (id, sample_no, name, type_code, source, specification, quantity, unit, description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, sampleNo, data.name, typeCode, data.source, data.specification, data.quantity, data.unit, data.description || null, 'pending', data.createdBy, now, now]
  );
  saveBaseDb();

  return {
    id, sampleNo, name: data.name, type: data.type, source: data.source,
    specification: data.specification, quantity: data.quantity, unit: data.unit,
    description: data.description, status: 'pending', createdBy: data.createdBy,
    createdAt: now, updatedAt: now
  };
}

export async function findById(id: string): Promise<Sample | null> {
  const db = await getBaseDb();
  const result = db.exec(`
    SELECT s.id, s.sample_no, s.name, st.name as type_name, s.source, s.specification,
           s.quantity, s.unit, s.description, s.status, s.created_by, s.created_at, s.updated_at
    FROM samples s
    LEFT JOIN sample_types st ON s.type_code = st.code
    WHERE s.id = ?`, [id]);
  if (!result[0]?.values?.[0]) return null;
  return mapRow(result[0].values[0], result[0].columns);
}

export async function findPaginated(params: { page: number; pageSize: number; keyword?: string; status?: string; startDate?: string; endDate?: string }): Promise<{ total: number; items: SampleItem[] }> {
  const db = await getBaseDb();
  const flowDb = await getFlowDb();

  let where = '1=1';
  const args: (string | number)[] = [];

  if (params.keyword) {
    where += ' AND (s.name LIKE ? OR s.sample_no LIKE ?)';
    args.push(`%${params.keyword}%`, `%${params.keyword}%`);
  }
  if (params.status) {
    where += ' AND s.status = ?';
    args.push(params.status);
  }
  if (params.startDate) {
    where += ' AND s.created_at >= ?';
    args.push(params.startDate);
  }
  if (params.endDate) {
    where += ' AND s.created_at <= ?';
    args.push(params.endDate);
  }

  const countResult = db.exec(`SELECT COUNT(*) as cnt FROM samples s WHERE ${where}`, args);
  const total = (countResult[0]?.values[0]?.[0] as number) || 0;

  const offset = (params.page - 1) * params.pageSize;
  const itemsResult = db.exec(
    `SELECT s.id, s.sample_no, s.name, st.name as type_name, s.source, s.specification,
            s.quantity, s.unit, s.description, s.status, s.created_by, s.created_at, s.updated_at
     FROM samples s LEFT JOIN sample_types st ON s.type_code = st.code
     WHERE ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...args, params.pageSize, offset]
  );

  const items: SampleItem[] = [];
  if (itemsResult[0]?.values) {
    for (const row of itemsResult[0].values) {
      const sample = mapRow(row, itemsResult[0].columns);
      const flowResult = flowDb.exec('SELECT step, operator FROM flow_records WHERE sample_id = ? ORDER BY created_at DESC LIMIT 1', [sample.id]);
      const currentStep = (flowResult[0]?.values?.[0]?.[0] as string) || '登记';
      const handler = (flowResult[0]?.values?.[0]?.[1] as string) || '';
      items.push({
        id: sample.id, sampleNo: sample.sampleNo, name: sample.name, type: sample.type,
        status: sample.status, currentStep, handler, createdAt: sample.createdAt, updatedAt: sample.updatedAt
      });
    }
  }

  return { total, items };
}

export async function findAllForExport(params: { status?: string; startDate?: string; endDate?: string }): Promise<SampleItem[]> {
  const result = await findPaginated({ ...params, page: 1, pageSize: 10000 });
  return result.items;
}

export async function updateStatus(id: string, status: Sample['status']): Promise<void> {
  const db = await getBaseDb();
  const now = new Date().toISOString();
  db.run('UPDATE samples SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
  saveBaseDb();
}

export async function getDetailWithRelations(id: string): Promise<{ sample: Sample; flowRecords: any[]; attachments: any[] } | null> {
  const db = await getBaseDb();
  const flowDb = await getFlowDb();

  const sampleResult = db.exec(`
    SELECT s.id, s.sample_no, s.name, st.name as type_name, s.source, s.specification,
           s.quantity, s.unit, s.description, s.status, s.created_by, s.created_at, s.updated_at
    FROM samples s
    LEFT JOIN sample_types st ON s.type_code = st.code
    WHERE s.id = ?`, [id]);
  if (!sampleResult[0]?.values?.[0]) return null;
  const sample = mapRow(sampleResult[0].values[0], sampleResult[0].columns);

  const flowResult = flowDb.exec('SELECT * FROM flow_records WHERE sample_id = ? ORDER BY created_at ASC', [id]);
  const flowRecords = flowResult[0]?.values?.map((row) => {
    const [fid, sampleId, stageId, step, action, operator, comment, duration, createdAt] = row as [string, string, string | null, string, string, string, string | null, number | null, string];
    return { id: fid, sampleId, stageId, step, action, operator, comment: comment || undefined, duration, createdAt };
  }) || [];

  const attResult = db.exec('SELECT * FROM attachments WHERE sample_id = ? ORDER BY uploaded_at DESC', [id]);
  const attachments = attResult[0]?.values?.map((row) => {
    const [aid, sampleId, fileName, fileSize, filePath, fileType, fileCategory, uploadedBy, uploadedAt] = row as [string, string, string, number, string, string, string, string, string];
    return { id: aid, sampleId, fileName, fileSize, filePath, fileType, fileCategory, uploadedBy, uploadedAt };
  }) || [];

  return { sample, flowRecords, attachments };
}

function mapRow(row: (string | number | null | undefined)[], columns: string[]): Sample {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return {
    id: obj.id as string,
    sampleNo: obj.sample_no as string,
    name: obj.name as string,
    type: (obj.type_name as string) || (obj.type_code as string),
    source: obj.source as string,
    specification: obj.specification as string,
    quantity: obj.quantity as number,
    unit: obj.unit as string,
    description: (obj.description as string) || undefined,
    status: obj.status as Sample['status'],
    createdBy: obj.created_by as string,
    createdAt: obj.created_at as string,
    updatedAt: obj.updated_at as string
  };
}
