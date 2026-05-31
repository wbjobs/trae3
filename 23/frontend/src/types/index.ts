export interface User {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  avatar: string
  tenantId: number
  roleIds: number[]
  permissions: string[]
  createTime: string
  updateTime: string
}

export interface Tenant {
  id: number
  name: string
  code: string
  status: number
  createTime: string
}

export interface Role {
  id: number
  name: string
  code: string
  description: string
  status: number
  tenantId: number
  permissions: Permission[]
  createTime: string
  updateTime: string
}

export interface Permission {
  id: number
  name: string
  code: string
  type: string
  parentId: number
  sort: number
  icon: string
  path: string
  component: string
  children?: Permission[]
}

export interface TeamMember {
  id: number
  userId: number
  username: string
  nickname: string
  email: string
  phone: string
  roleId: number
  roleName: string
  joinTime: string
  status: number
}

export const SPECIMEN_TYPE_MAP: Record<number, string> = {
  1: '生物标本',
  2: '地质标本',
  3: '植物标本',
  4: '动物标本',
  5: '化石标本',
  6: '矿物标本',
  99: '其他'
}

export const SPECIMEN_TYPE_OPTIONS = [
  { label: '生物标本', value: 1 },
  { label: '地质标本', value: 2 },
  { label: '植物标本', value: 3 },
  { label: '动物标本', value: 4 },
  { label: '化石标本', value: 5 },
  { label: '矿物标本', value: 6 },
  { label: '其他', value: 99 }
]

export const ANNOTATION_TYPE_MAP: Record<number, string> = {
  1: '矩形框',
  2: '多边形',
  3: '点标记',
  4: '圆形',
  5: '线条',
  6: '文字标注'
}

export interface SpecimenStatisticsVO {
  totalCount: number
  biologyCount: number
  geologyCount: number
  plantCount: number
  animalCount: number
  fossilCount: number
  mineralCount: number
  otherCount: number
  thisWeekCount: number
  thisMonthCount: number
}

export interface Specimen {
  id: number
  specimenNo: string
  name: string
  type: number
  typeName: string
  classification: string
  description: string
  location: string
  longitude: number
  latitude: number
  collector: string
  collectTime: string
  storageMethod: string
  status: number
  tags: string[]
  customFields: Record<string, any>
  fileId: number
  fileUrl: string
  images: SpecimenImage[]
  annotations: Annotation[]
  createBy: number
  createTime: string
  updateTime: string
}

export interface SpecimenImage {
  id: number
  specimenId: number
  fileId: number
  imageUrl: string
  fileUrl: string
  imageType: number
  sort: number
  description: string
  previewUrl: string
  objectName?: string
  createTime: string
}

export interface SpecimenTag {
  id: number
  name: string
  color: string
  count: number
}

export type AnnotationTypeFront = 'rectangle' | 'polygon' | 'point' | 'circle' | 'line' | 'text'

export const ANNOTATION_TYPE_TO_CODE: Record<AnnotationTypeFront, number> = {
  rectangle: 1,
  polygon: 2,
  point: 3,
  circle: 4,
  line: 5,
  text: 6
}

export const ANNOTATION_CODE_TO_TYPE: Record<number, AnnotationTypeFront> = {
  1: 'rectangle',
  2: 'polygon',
  3: 'point',
  4: 'circle',
  5: 'line',
  6: 'text'
}

export interface Annotation {
  id: number
  specimenId: number
  imageId: number
  annotationType: number
  annotationTypeName: string
  label: string
  confidence: number
  coordinates: string
  color: string
  note: string
  annotatorId: number
  annotatorName: string
  annotationTime: string
  status: number
  createTime: string
}

export interface TraceabilityRecord {
  id: number
  specimenId: number
  operationType: number
  operationTypeName: string
  operatorId: number
  operatorName: string
  operationTime: string
  location: string
  remark: string
  beforeData: any
  afterData: any
  createTime: string
}

export interface TraceabilityChain {
  specimenId: number
  specimenNo: string
  specimenName: string
  specimenType: number
  specimenTypeName: string
  classification: string
  description: string
  location: string
  collector: string
  collectTime: string
  tags: string[]
  records: TraceabilityRecord[]
}

export interface QrCode {
  id: number
  specimenId: number
  qrCodeUrl: string
  qrCodeContent: string
  qrCodeData: string
  qrCodeImageBase64: string
  scanCount: number
  lastScanTime: string
  expireTime: string
  status: number
  createTime: string
}

export interface SearchResult {
  specimenId: number
  specimenNo: string
  name: string
  type: number
  typeName: string
  classification: string
  description: string
  location: string
  longitude: number
  latitude: number
  collector: string
  collectTime: string
  tags: string[]
  annotations: string[]
  createTime: string
  highlightFields: Record<string, string>
  score: number
}

export interface PageResult<T> {
  list: T[]
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

export interface LoginParams {
  username: string
  password: string
  tenantId?: number
  tenantCode: string
}

export interface RegisterParams {
  username: string
  password: string
  nickname: string
  email: string
  tenantId?: number
  tenantName: string
  tenantCode: string
}

export interface TokenResult {
  accessToken: string
  tokenType: string
  expiresIn: number
  userId: number
  username: string
  tenantId: number
  tenantName: string
}

export interface SpecimenQueryParams {
  page: number
  size: number
  type?: number
  keyword?: string
  status?: number
  startTime?: string
  endTime?: string
  collector?: string
  tag?: string
  minLongitude?: number
  maxLongitude?: number
  minLatitude?: number
  maxLatitude?: number
}

export interface SpecimenCreateParams {
  specimenNo: string
  name: string
  type: number
  classification?: string
  description?: string
  location?: string
  longitude?: number
  latitude?: number
  collector: string
  collectTime: string
  storageMethod?: string
  status?: number
  tags?: string[]
  customFields?: Record<string, any>
  imageFileIds?: number[]
}

export interface SpecimenUpdateParams extends SpecimenCreateParams {
  id: number
}

export interface AnnotationCreateParams {
  specimenId: number
  imageId: number
  annotationType: number
  label: string
  confidence: number
  coordinates: string
  color: string
  note?: string
}

export interface AnnotationBatchCreateParams {
  specimenId: number
  imageId: number
  annotations: Omit<AnnotationCreateParams, 'specimenId' | 'imageId'>[]
}

export interface AnnotationQueryParams {
  page?: number
  size?: number
  specimenId?: number
  imageId?: number
  annotationType?: number
  label?: string
  status?: number
  annotatorId?: number
}

export interface TraceabilityQueryParams {
  pageNum: number
  pageSize: number
  specimenId?: number
  operationType?: number
  startTime?: string
  endTime?: string
  operatorId?: number
  operatorName?: string
  operator?: string
}

export interface TraceabilitySearchParams {
  keyword?: string
  specimenType?: number
  startTime?: string
  endTime?: string
  minLongitude?: number
  maxLongitude?: number
  minLatitude?: number
  maxLatitude?: number
  tags?: string[]
  pageNum?: number
  pageSize?: number
}

export interface FileUploadResult {
  fileId: number
  fileName: string
  fileUrl: string
  fileSize: number
  bucketName: string
  objectName: string
}

export interface FileInfoResult {
  id: number
  fileName: string
  originalName: string
  filePath: string
  fileSize: number
  fileType: string
  contentType: string
  bucketName: string
  objectName: string
  md5: string
  uploaderId: number
  uploaderName: string
  status: number
  createTime: string
}

export interface MultipartUploadInitResult {
  uploadId: string
  objectName: string
  partCount: number
  parts: { partNumber: number; uploadUrl: string }[]
}

export interface MultipartUploadPartResult {
  partNumber: number
  uploadId: string
  fileUrl: string
  etag: string
}
