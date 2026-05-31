// 检索数据模型

/**
 * 检索范围枚举
 */
export enum SearchScope {
  ALL = 'all',
  PROJECT = 'project',
  DOCUMENT = 'document',
  PAGE = 'page',
  ANNOTATION = 'annotation',
  COLLATION = 'collation',
  METADATA = 'metadata'
}

/**
 * 检索条件操作符枚举
 */
export enum SearchOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_EQUAL = 'greater_equal',
  LESS_EQUAL = 'less_equal',
  IN = 'in',
  NOT_IN = 'not_in',
  BETWEEN = 'between',
  EXISTS = 'exists',
  NOT_EXISTS = 'not_exists'
}

/**
 * 检索条件接口
 */
export interface SearchCondition {
  field: string;
  operator: SearchOperator;
  value: any;
  boost?: number;
}

/**
 * 检索排序接口
 */
export interface SearchSort {
  field: string;
  order: 'asc' | 'desc';
  mode?: 'min' | 'max' | 'sum' | 'avg';
}

/**
 * 检索高亮配置接口
 */
export interface SearchHighlight {
  fields: string[];
  preTag: string;
  postTag: string;
  fragmentSize: number;
  numberOfFragments: number;
  requireFieldMatch: boolean;
}

/**
 * 分面检索配置接口
 */
export interface SearchFacet {
  name: string;
  field: string;
  size?: number;
  minCount?: number;
  sort?: 'count' | 'value';
  order?: 'asc' | 'desc';
}

/**
 * 分面结果接口
 */
export interface FacetResult {
  name: string;
  field: string;
  buckets: FacetBucket[];
}

/**
 * 分面桶接口
 */
export interface FacetBucket {
  value: string;
  count: number;
  selected?: boolean;
}

/**
 * 检索请求接口
 */
export interface SearchRequest {
  query: string;
  scope: SearchScope | SearchScope[];
  projectId?: string;
  documentId?: string;
  conditions?: SearchCondition[];
  filterQuery?: string;
  facets?: SearchFacet[];
  sort?: SearchSort[];
  highlight?: SearchHighlight;
  page: number;
  pageSize: number;
  includeMetadata?: boolean;
  explain?: boolean;
}

/**
 * 检索结果项接口
 */
export interface SearchResult {
  id: string;
  score: number;
  type: SearchScope;
  projectId: string;
  projectName?: string;
  documentId?: string;
  documentTitle?: string;
  pageNumber?: number;
  title: string;
  content: string;
  highlights: Record<string, string[]>;
  metadata: Record<string, any>;
  annotationCount?: number;
  collationVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 检索响应接口
 */
export interface SearchResponse {
  query: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  maxScore: number;
  took: number;
  hits: SearchResult[];
  facets: FacetResult[];
  suggestions: string[];
}

/**
 * 搜索建议请求接口
 */
export interface SearchSuggestRequest {
  query: string;
  projectId?: string;
  scope?: SearchScope | SearchScope[];
  size?: number;
}

/**
 * 搜索建议项接口
 */
export interface SearchSuggestion {
  text: string;
  score: number;
  type: SearchScope;
  count?: number;
}

/**
 * 搜索建议响应接口
 */
export interface SearchSuggestResponse {
  query: string;
  suggestions: SearchSuggestion[];
}

/**
 * 高级筛选条件接口
 */
export interface AdvancedFilter {
  field: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  operators: SearchOperator[];
  options?: { value: string; label: string }[];
  placeholder?: string;
}

/**
 * 检索历史记录接口
 */
export interface SearchHistory {
  id: string;
  userId: string;
  query: string;
  scope: SearchScope | SearchScope[];
  filters?: Record<string, any>;
  resultCount: number;
  createdAt: Date;
}

/**
 * 保存的检索接口
 */
export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  description?: string;
  request: SearchRequest;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  runCount: number;
}

/**
 * 检索统计接口
 */
export interface SearchStats {
  totalQueries: number;
  uniqueUsers: number;
  topQueries: { query: string; count: number }[];
  zeroResultQueries: { query: string; count: number }[];
  avgResponseTime: number;
  totalDocuments: number;
  totalAnnotations: number;
}
