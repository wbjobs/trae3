import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VersionSnapshot, DiffResult, DiffItem, DrawingFile, HighlightResult, HighlightDiff } from '@shared/types';
import { VERSION_HISTORY_LIMIT, HIGHLIGHT_COLORS } from '@shared/constants';

interface ParsedEntity {
  id: string;
  type: string;
  layer: string;
  bounds: { x: number; y: number; width: number; height: number };
  hash: string;
  data: string;
}

interface VersionLock {
  drawingId: string;
  version: number;
  lockToken: string;
  expiresAt: number;
}

class DrawingComparator {
  private versionStore: Map<string, VersionSnapshot[]> = new Map();
  private versionLocks: Map<string, VersionLock> = new Map();
  private persistPath: string = '';

  async initialize(persistDir: string): Promise<void> {
    this.persistPath = path.join(persistDir, 'versions.json');
    try {
      if (await fs.pathExists(this.persistPath)) {
        const raw = await fs.readFile(this.persistPath, 'utf-8');
        const data: Record<string, VersionSnapshot[]> = JSON.parse(raw);
        for (const [drawingId, versions] of Object.entries(data)) {
          this.versionStore.set(drawingId, versions);
        }
      }
    } catch {
      this.versionStore.clear();
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const data: Record<string, VersionSnapshot[]> = {};
      for (const [drawingId, versions] of this.versionStore.entries()) {
        data[drawingId] = versions;
      }
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // ignore persist error
    }
  }

  private acquireLock(drawingId: string): string | null {
    const existing = this.versionLocks.get(drawingId);
    if (existing && existing.expiresAt > Date.now()) {
      return null;
    }
    const lockToken = uuidv4();
    this.versionLocks.set(drawingId, {
      drawingId,
      version: 0,
      lockToken,
      expiresAt: Date.now() + 30000,
    });
    return lockToken;
  }

  private releaseLock(drawingId: string, token: string): boolean {
    const lock = this.versionLocks.get(drawingId);
    if (lock && lock.lockToken === token) {
      this.versionLocks.delete(drawingId);
      return true;
    }
    return false;
  }

  async createSnapshot(drawing: DrawingFile): Promise<VersionSnapshot> {
    const drawingId = drawing.id;
    const lockToken = this.acquireLock(drawingId);
    if (!lockToken) {
      throw new Error('版本创建冲突，请稍后重试');
    }

    try {
      const versions = this.versionStore.get(drawingId) ?? [];
      const nextVersion = versions.length > 0 ? versions[versions.length - 1].version + 1 : 1;

      const fileBuffer = await fs.readFile(drawing.path);
      const fileHash = this.computeFileHash(fileBuffer);

      if (versions.length > 0) {
        const lastSnapshot = versions[versions.length - 1];
        const lastBuffer = await this.safeReadFile(lastSnapshot.path);
        if (lastBuffer && this.computeFileHash(lastBuffer) === fileHash) {
          return lastSnapshot;
        }
      }

      const entities = this.extractEntities(fileBuffer, drawing.format);
      const entityHash = this.computeEntityHash(entities);

      const snapshot: VersionSnapshot = {
        id: uuidv4(),
        drawingId,
        version: nextVersion,
        hash: entityHash,
        path: drawing.path,
        size: drawing.size,
        createdAt: new Date().toISOString(),
        metadata: {
          fileHash,
          entityCount: entities.length,
          layers: [...new Set(entities.map((e) => e.layer))],
          lockToken,
        },
      };

      versions.push(snapshot);
      if (versions.length > VERSION_HISTORY_LIMIT) {
        versions.splice(0, versions.length - VERSION_HISTORY_LIMIT);
      }
      this.versionStore.set(drawingId, versions);
      await this.persist();

      return snapshot;
    } finally {
      this.releaseLock(drawingId, lockToken);
    }
  }

  private async safeReadFile(filePath: string): Promise<Buffer | null> {
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readFile(filePath);
      }
    } catch {
      // ignore
    }
    return null;
  }

  private computeFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private computeEntityHash(entities: ParsedEntity[]): string {
    const sortedHashes = entities.map((e) => e.hash).sort().join('|');
    return crypto.createHash('sha256').update(sortedHashes).digest('hex');
  }

  async compare(
    drawingId: string,
    versionA: number,
    versionB: number
  ): Promise<DiffResult> {
    const versions = this.versionStore.get(drawingId);
    if (!versions) throw new Error('未找到图纸版本记录');

    const snapshotA = versions.find((v) => v.version === versionA);
    const snapshotB = versions.find((v) => v.version === versionB);

    if (!snapshotA) throw new Error(`版本 ${versionA} 不存在`);
    if (!snapshotB) throw new Error(`版本 ${versionB} 不存在`);

    const bufferA = await this.safeReadFile(snapshotA.path);
    const bufferB = await this.safeReadFile(snapshotB.path);

    if (!bufferA || !bufferB) {
      throw new Error('版本文件已丢失，无法比对');
    }

    const formatA = this.detectFormat(snapshotA.path, 'dxf');
    const formatB = this.detectFormat(snapshotB.path, 'dxf');

    const entitiesA = this.extractEntities(bufferA, formatA);
    const entitiesB = this.extractEntities(bufferB, formatB);

    return this.computeDiff(entitiesA, entitiesB, versionA, versionB);
  }

  private detectFormat(filePath: string, fallback: string): string {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return ext || fallback;
  }

  async compareFiles(fileA: DrawingFile, fileB: DrawingFile): Promise<DiffResult> {
    const bufferA = await fs.readFile(fileA.path);
    const bufferB = await fs.readFile(fileB.path);

    const hashA = this.computeFileHash(bufferA);
    const hashB = this.computeFileHash(bufferB);

    if (hashA === hashB) {
      return {
        added: [],
        removed: [],
        modified: [],
        summary: '文件完全相同，无差异',
        similarity: 100,
      };
    }

    const entitiesA = this.extractEntities(bufferA, fileA.format);
    const entitiesB = this.extractEntities(bufferB, fileB.format);

    return this.computeDiff(entitiesA, entitiesB, 0, 0);
  }

  getVersions(drawingId: string): VersionSnapshot[] {
    return this.versionStore.get(drawingId) ?? [];
  }

  private computeDiff(
    entitiesA: ParsedEntity[],
    entitiesB: ParsedEntity[],
    versionA: number,
    versionB: number
  ): DiffResult {
    const mapA = new Map(entitiesA.map((e) => [e.id, e]));
    const mapB = new Map(entitiesB.map((e) => [e.id, e]));

    const added: DiffItem[] = [];
    const removed: DiffItem[] = [];
    const modified: DiffItem[] = [];

    for (const [id, entity] of mapB) {
      if (!mapA.has(id)) {
        added.push({
          type: entity.type,
          layer: entity.layer,
          bounds: entity.bounds,
          description: `新增 ${entity.type} (图层: ${entity.layer})`,
        });
      } else if (mapA.get(id)!.hash !== entity.hash) {
        const oldEntity = mapA.get(id)!;
        modified.push({
          type: entity.type,
          layer: entity.layer,
          bounds: entity.bounds,
          description: `修改 ${entity.type} (图层: ${entity.layer}) - 位置或属性变化`,
        });
      }
    }

    for (const [id, entity] of mapA) {
      if (!mapB.has(id)) {
        removed.push({
          type: entity.type,
          layer: entity.layer,
          bounds: entity.bounds,
          description: `删除 ${entity.type} (图层: ${entity.layer})`,
        });
      }
    }

    const totalEntities = Math.max(entitiesA.length, entitiesB.length, 1);
    const changedEntities = added.length + removed.length + modified.length;
    const similarity = Math.max(0, ((totalEntities - changedEntities) / totalEntities) * 100);

    const summary = this.buildSummary(added.length, removed.length, modified.length, versionA, versionB);

    return { added, removed, modified, summary, similarity: Math.round(similarity * 100) / 100 };
  }

  private buildSummary(
    addedCount: number,
    removedCount: number,
    modifiedCount: number,
    versionA: number,
    versionB: number
  ): string {
    const parts: string[] = [];
    if (versionA > 0 && versionB > 0) {
      parts.push(`版本 V${versionA} → V${versionB}:`);
    }
    if (addedCount > 0) parts.push(`新增 ${addedCount} 个图元`);
    if (removedCount > 0) parts.push(`删除 ${removedCount} 个图元`);
    if (modifiedCount > 0) parts.push(`修改 ${modifiedCount} 个图元`);
    if (parts.length === 0) parts.push('无差异');
    return parts.join(', ');
  }

  private extractEntities(buffer: Buffer, format: string): ParsedEntity[] {
    const content = buffer.toString('utf-8');

    switch (format) {
      case 'dxf':
        return this.parseDxfEntities(content);
      case 'svg':
        return this.parseSvgEntities(content);
      case 'pdf':
        return this.parsePdfEntities(buffer);
      case 'dwg':
        return this.parseDwgEntities(buffer);
      default:
        return [];
    }
  }

  private parseDxfEntities(content: string): ParsedEntity[] {
    const lines = content.split(/\r?\n/);
    const entities: ParsedEntity[] = [];
    let i = 0;
    let inEntities = false;

    while (i < lines.length) {
      const code = parseInt(lines[i]?.trim());
      const value = lines[i + 1]?.trim();

      if (isNaN(code)) { i++; continue; }

      if (code === 2 && value === 'ENTITIES') inEntities = true;
      if (code === 0 && value === 'ENDSEC' && inEntities) inEntities = false;

      if (inEntities && code === 0) {
        const entityType = value;
        i += 2;

        let layer = '0';
        const props: Record<string, number> = {};

        while (i < lines.length) {
          const c = parseInt(lines[i]?.trim());
          const v = lines[i + 1]?.trim();
          if (isNaN(c)) { i++; continue; }
          if (c === 0) break;
          if (c === 8) layer = v;
          if (c === 10) props.x1 = parseFloat(v);
          if (c === 20) props.y1 = parseFloat(v);
          if (c === 11) props.x2 = parseFloat(v);
          if (c === 21) props.y2 = parseFloat(v);
          if (c === 40) props.radius = parseFloat(v);
          i += 2;
        }

        const dataStr = JSON.stringify({ type: entityType, layer, ...props });
        const hash = crypto.createHash('md5').update(dataStr).digest('hex');

        entities.push({
          id: hash.substring(0, 12),
          type: entityType,
          layer,
          bounds: {
            x: props.x1 ?? 0,
            y: props.y1 ?? 0,
            width: (props.x2 ?? props.x1 ?? 0) - (props.x1 ?? 0) || (props.radius ? props.radius * 2 : 1),
            height: (props.y2 ?? props.y1 ?? 0) - (props.y1 ?? 0) || (props.radius ? props.radius * 2 : 1),
          },
          hash,
          data: dataStr,
        });
        continue;
      }

      i += 2;
    }

    return entities;
  }

  private parseSvgEntities(content: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];
    const tagRegex = /<(line|circle|rect|path|ellipse|polygon|polyline)\s([^>]*)\/?>/gi;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      const type = match[1].toLowerCase();
      const attrs = match[2];

      const x = parseFloat(attrs.match(/x(?:1)?="([^"]+)"/)?.[1] ?? '0');
      const y = parseFloat(attrs.match(/y(?:1)?="([^"]+)"/)?.[1] ?? '0');
      const width = parseFloat(attrs.match(/width="([^"]+)"/)?.[1] ?? '0') || 1;
      const height = parseFloat(attrs.match(/height="([^"]+)"/)?.[1] ?? '0') || 1;

      const hash = crypto.createHash('md5').update(match[0]).digest('hex');

      entities.push({
        id: hash.substring(0, 12),
        type,
        layer: 'default',
        bounds: { x, y, width, height },
        hash,
        data: match[0],
      });
    }

    return entities;
  }

  private parsePdfEntities(_buffer: Buffer): ParsedEntity[] {
    const hash = crypto.createHash('md5').update(_buffer).digest('hex');
    return [{
      id: hash.substring(0, 12),
      type: 'page',
      layer: 'default',
      bounds: { x: 0, y: 0, width: 595, height: 842 },
      hash,
      data: 'PDF page entity',
    }];
  }

  private parseDwgEntities(buffer: Buffer): ParsedEntity[] {
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    return [{
      id: hash.substring(0, 12),
      type: 'drawing',
      layer: 'default',
      bounds: { x: 0, y: 0, width: 1000, height: 1000 },
      hash,
      data: 'DWG drawing entity',
    }];
  }

  async generateHighlight(
    drawingId: string,
    versionA: number,
    versionB: number
  ): Promise<HighlightResult> {
    const versions = this.versionStore.get(drawingId);
    if (!versions) throw new Error('未找到图纸版本记录');

    const snapshotA = versions.find((v) => v.version === versionA);
    const snapshotB = versions.find((v) => v.version === versionB);

    if (!snapshotA) throw new Error(`版本 ${versionA} 不存在`);
    if (!snapshotB) throw new Error(`版本 ${versionB} 不存在`);

    const bufferA = await this.safeReadFile(snapshotA.path);
    const bufferB = await this.safeReadFile(snapshotB.path);

    if (!bufferA || !bufferB) {
      throw new Error('版本文件已丢失，无法生成高亮');
    }

    const formatA = this.detectFormat(snapshotA.path, 'dxf');
    const formatB = this.detectFormat(snapshotB.path, 'dxf');

    const entitiesA = this.extractEntities(bufferA, formatA);
    const entitiesB = this.extractEntities(bufferB, formatB);

    const diffs = this.computeHighlightDiffs(entitiesA, entitiesB);

    let originalSvg = bufferB.toString('utf-8');
    if (formatB !== 'svg') {
      originalSvg = this.entitiesToSvg(entitiesB);
    }

    const highlightedSvg = this.injectHighlightLayers(originalSvg, diffs);

    return {
      originalSvg,
      highlightedSvg,
      diffs,
      summary: {
        added: diffs.filter((d) => d.type === 'added').length,
        removed: diffs.filter((d) => d.type === 'removed').length,
        modified: diffs.filter((d) => d.type === 'modified').length,
      },
    };
  }

  private computeHighlightDiffs(
    entitiesA: ParsedEntity[],
    entitiesB: ParsedEntity[]
  ): HighlightDiff[] {
    const mapA = new Map(entitiesA.map((e) => [e.id, e]));
    const mapB = new Map(entitiesB.map((e) => [e.id, e]));
    const diffs: HighlightDiff[] = [];

    for (const [id, entity] of mapB) {
      if (!mapA.has(id)) {
        diffs.push({
          type: 'added',
          bounds: entity.bounds,
          description: `新增 ${entity.type}`,
          color: HIGHLIGHT_COLORS.added,
          entityId: id,
        });
      } else if (mapA.get(id)!.hash !== entity.hash) {
        diffs.push({
          type: 'modified',
          bounds: this.mergeBounds(entity.bounds, mapA.get(id)!.bounds),
          description: `修改 ${entity.type}`,
          color: HIGHLIGHT_COLORS.modified,
          entityId: id,
        });
      }
    }

    for (const [id, entity] of mapA) {
      if (!mapB.has(id)) {
        diffs.push({
          type: 'removed',
          bounds: entity.bounds,
          description: `删除 ${entity.type}`,
          color: HIGHLIGHT_COLORS.removed,
          entityId: id,
        });
      }
    }

    return diffs;
  }

  private mergeBounds(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  private entitiesToSvg(entities: ParsedEntity[]): string {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const e of entities) {
      minX = Math.min(minX, e.bounds.x);
      minY = Math.min(minY, e.bounds.y);
      maxX = Math.max(maxX, e.bounds.x + e.bounds.width);
      maxY = Math.max(maxY, e.bounds.y + e.bounds.height);
    }

    const padding = 20;
    const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`;

    for (const e of entities) {
      switch (e.type.toLowerCase()) {
        case 'line':
          svg += `<line x1="${e.bounds.x}" y1="${e.bounds.y}" x2="${e.bounds.x + e.bounds.width}" y2="${e.bounds.y + e.bounds.height}" stroke="#333" stroke-width="1"/>`;
          break;
        case 'circle':
          const r = Math.max(e.bounds.width, e.bounds.height) / 2;
          svg += `<circle cx="${e.bounds.x + r}" cy="${e.bounds.y + r}" r="${r}" fill="none" stroke="#333" stroke-width="1"/>`;
          break;
        case 'arc':
          svg += `<path d="M${e.bounds.x},${e.bounds.y}" stroke="#333" fill="none" stroke-width="1"/>`;
          break;
        case 'text':
          svg += `<text x="${e.bounds.x}" y="${e.bounds.y}" fill="#333" font-size="12">Text</text>`;
          break;
        default:
          svg += `<rect x="${e.bounds.x}" y="${e.bounds.y}" width="${e.bounds.width}" height="${e.bounds.height}" fill="none" stroke="#333" stroke-width="1"/>`;
      }
    }

    svg += '</svg>';
    return svg;
  }

  private injectHighlightLayers(svg: string, diffs: HighlightDiff[]): string {
    const highlightLayer = this.generateHighlightLayer(diffs);

    const svgEndIndex = svg.lastIndexOf('</svg>');
    if (svgEndIndex === -1) {
      return svg + highlightLayer + '</svg>';
    }

    return svg.slice(0, svgEndIndex) + highlightLayer + svg.slice(svgEndIndex);
  }

  private generateHighlightLayer(diffs: HighlightDiff[]): string {
    let layer = '<g id="diff-highlights">';

    for (let i = 0; i < diffs.length; i++) {
      const diff = diffs[i];
      const { x, y, width, height } = diff.bounds;
      const opacity = diff.type === 'removed' ? 0.3 : 0.5;

      layer += `<rect
        class="diff-highlight diff-${diff.type}"
        data-diff-index="${i}"
        data-diff-type="${diff.type}"
        x="${x}"
        y="${y}"
        width="${Math.max(width, 5)}"
        height="${Math.max(height, 5)}"
        fill="${diff.color}"
        fill-opacity="${opacity}"
        stroke="${diff.color}"
        stroke-width="2"
        stroke-opacity="0.8"
        rx="2"
      />`;

      layer += `<text
        class="diff-label"
        x="${x}"
        y="${y - 5}"
        fill="${diff.color}"
        font-size="10"
        font-weight="bold"
      >${diff.type === 'added' ? '+' : diff.type === 'removed' ? '-' : '~'}</text>`;
    }

    layer += this.generateDiffLegend(diffs);
    layer += '</g>';

    return layer;
  }

  private generateDiffLegend(diffs: HighlightDiff[]): string {
    if (diffs.length === 0) return '';

    const added = diffs.filter((d) => d.type === 'added').length;
    const removed = diffs.filter((d) => d.type === 'removed').length;
    const modified = diffs.filter((d) => d.type === 'modified').length;

    return `
      <g id="diff-legend" transform="translate(10, 10)" style="font-family: sans-serif; font-size: 12px;">
        <rect x="0" y="0" width="180" height="80" fill="white" fill-opacity="0.9" stroke="#ccc" rx="4"/>
        <rect x="10" y="15" width="12" height="12" fill="${HIGHLIGHT_COLORS.added}" fill-opacity="0.5" rx="2"/>
        <text x="30" y="25" fill="#333">新增 (${added})</text>
        <rect x="10" y="35" width="12" height="12" fill="${HIGHLIGHT_COLORS.removed}" fill-opacity="0.5" rx="2"/>
        <text x="30" y="45" fill="#333">删除 (${removed})</text>
        <rect x="10" y="55" width="12" height="12" fill="${HIGHLIGHT_COLORS.modified}" fill-opacity="0.5" rx="2"/>
        <text x="30" y="65" fill="#333">修改 (${modified})</text>
      </g>
    `;
  }

  async generateHighlightFromFiles(
    fileA: DrawingFile,
    fileB: DrawingFile
  ): Promise<HighlightResult> {
    const bufferA = await fs.readFile(fileA.path);
    const bufferB = await fs.readFile(fileB.path);

    const entitiesA = this.extractEntities(bufferA, fileA.format);
    const entitiesB = this.extractEntities(bufferB, fileB.format);

    const diffs = this.computeHighlightDiffs(entitiesA, entitiesB);

    let originalSvg = bufferB.toString('utf-8');
    if (fileB.format !== 'svg') {
      originalSvg = this.entitiesToSvg(entitiesB);
    }

    const highlightedSvg = this.injectHighlightLayers(originalSvg, diffs);

    return {
      originalSvg,
      highlightedSvg,
      diffs,
      summary: {
        added: diffs.filter((d) => d.type === 'added').length,
        removed: diffs.filter((d) => d.type === 'removed').length,
        modified: diffs.filter((d) => d.type === 'modified').length,
      },
    };
  }
}

export const drawingComparator = new DrawingComparator();
export { DrawingComparator };
