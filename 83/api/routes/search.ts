import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from './auth.js';
import { getMetadataDb } from '../db/index.js';
import {
  SearchQuery,
  SearchResult,
  RubbingMetadata,
  ApiResponse,
} from '../../shared/types.js';

const router = Router();

router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();

  const query: SearchQuery = {
    keyword: req.body.keyword,
    dynasty: req.body.dynasty,
    era: req.body.era,
    author: req.body.author,
    dateRange: req.body.dateRange,
    status: req.body.status,
    page: req.body.page || 1,
    pageSize: req.body.pageSize || 20,
    sortBy: req.body.sortBy || 'created_at',
    sortOrder: req.body.sortOrder || 'desc',
  };

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (query.keyword && query.keyword.trim()) {
    const keyword = `%${query.keyword.trim().toLowerCase()}%`;
    whereClauses.push(`(
      LOWER(r.title) LIKE ? OR
      LOWER(r.dynasty) LIKE ? OR
      LOWER(r.era) LIKE ? OR
      LOWER(r.author) LIKE ? OR
      LOWER(r.calligrapher) LIKE ? OR
      LOWER(r.description) LIKE ? OR
      LOWER(r.inscription) LIKE ? OR
      LOWER(r.keywords) LIKE ?
    )`);
    params.push(...Array(8).fill(keyword));
  }

  if (query.dynasty && query.dynasty.trim()) {
    whereClauses.push('r.dynasty = ?');
    params.push(query.dynasty);
  }

  if (query.era && query.era.trim()) {
    whereClauses.push('r.era = ?');
    params.push(query.era);
  }

  if (query.author && query.author.trim()) {
    whereClauses.push('r.author LIKE ?');
    params.push(`%${query.author}%`);
  }

  if (query.dateRange && query.dateRange[0] && query.dateRange[1]) {
    whereClauses.push('r.rubbing_date BETWEEN ? AND ?');
    params.push(query.dateRange[0], query.dateRange[1]);
  }

  if (query.status && query.status.length > 0) {
    const placeholders = query.status.map(() => '?').join(',');
    whereClauses.push(`r.status IN (${placeholders})`);
    params.push(...query.status);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sortField = ['title', 'dynasty', 'created_at', 'updated_at', 'rubbing_date'].includes(query.sortBy)
    ? `r.${query.sortBy}`
    : 'r.created_at';
  const sortDirection = query.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const offset = (query.page - 1) * query.pageSize;

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM rubbings r ${whereClause}
  `);

  const dataStmt = db.prepare(`
    SELECT 
      r.*,
      u.username as created_by_name,
      f.id as file_id
    FROM rubbings r
    LEFT JOIN users u ON r.created_by = u.id
    LEFT JOIN files f ON r.id = f.rubbing_id AND f.is_primary = 1
    ${whereClause}
    ORDER BY ${sortField} ${sortDirection}
    LIMIT ? OFFSET ?
  `);

  const count = countStmt.get(...params) as { total: number };
  const items = dataStmt.all(...params, query.pageSize, offset) as Array<Record<string, unknown>>;

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
      page: query.page,
      pageSize: query.pageSize,
    },
  };

  res.json(response);
});

router.get('/filters', authenticateToken, (_req: AuthRequest, res: Response) => {
  const db = getMetadataDb();

  const dynasties = db.prepare(`
    SELECT DISTINCT dynasty as value 
    FROM rubbings 
    WHERE dynasty IS NOT NULL AND dynasty != ''
    ORDER BY dynasty
  `).all() as Array<{ value: string }>;

  const eras = db.prepare(`
    SELECT DISTINCT era as value 
    FROM rubbings 
    WHERE era IS NOT NULL AND era != ''
    ORDER BY era
  `).all() as Array<{ value: string }>;

  const authors = db.prepare(`
    SELECT DISTINCT author as value 
    FROM rubbings 
    WHERE author IS NOT NULL AND author != ''
    ORDER BY author
  `).all() as Array<{ value: string }>;

  const methods = db.prepare(`
    SELECT DISTINCT rubbing_method as value 
    FROM rubbings 
    WHERE rubbing_method IS NOT NULL AND rubbing_method != ''
    ORDER BY rubbing_method
  `).all() as Array<{ value: string }>;

  const response: ApiResponse = {
    success: true,
    data: {
      dynasties: dynasties.map(d => d.value),
      eras: eras.map(e => e.value),
      authors: authors.map(a => a.value),
      methods: methods.map(m => m.value),
      statuses: ['draft', 'pending', 'published'],
    },
  };

  res.json(response);
});

router.get('/suggestions', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getMetadataDb();
  const q = (req.query.q as string || '').trim();

  if (!q || q.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }

  const searchTerm = `%${q.toLowerCase()}%`;

  const suggestions = db.prepare(`
    SELECT DISTINCT 
      CASE 
        WHEN LOWER(title) LIKE ? THEN title
        WHEN LOWER(author) LIKE ? THEN author
        WHEN LOWER(calligrapher) LIKE ? THEN calligrapher
        WHEN LOWER(dynasty) LIKE ? THEN dynasty
      END as text,
      CASE 
        WHEN LOWER(title) LIKE ? THEN 'title'
        WHEN LOWER(author) LIKE ? THEN 'author'
        WHEN LOWER(calligrapher) LIKE ? THEN 'calligrapher'
        WHEN LOWER(dynasty) LIKE ? THEN 'dynasty'
      END as type
    FROM rubbings
    WHERE 
      LOWER(title) LIKE ? OR
      LOWER(author) LIKE ? OR
      LOWER(calligrapher) LIKE ? OR
      LOWER(dynasty) LIKE ?
    LIMIT 10
  `).all(...Array(12).fill(searchTerm)) as Array<{ text: string; type: string }>;

  const uniqueSuggestions = suggestions
    .filter(s => s.text)
    .filter((s, index, self) => 
      index === self.findIndex(t => t.text === s.text && t.type === s.type)
    );

  res.json({ success: true, data: uniqueSuggestions });
});

export default router;
