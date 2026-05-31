import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { IndexFlatL2, IndexIVFFlat, IndexScalarQuantizer, Index, MetricType } from 'faiss-node';

export interface VectorMetadata {
  documentId: string;
  chunkIndex: number;
  originalText: string;
  charStart: number;
  charEnd: number;
  securityLevel?: number;
  hash?: string;
  [key: string]: any;
}

export interface SearchResult {
  chunkText: string;
  score: number;
  metadata: VectorMetadata;
  documentId: string;
}

export interface VectorStoreStats {
  collection: string;
  totalVectors: number;
  dimension: number;
  indexType: 'flat' | 'ivf' | 'quantized';
  memoryUsageMB: number;
  documentCount: number;
}

interface VectorCollection {
  index: Index;
  indexType: 'flat' | 'ivf' | 'quantized';
  metadata: VectorMetadata[];
  docIdToIndices: Map<string, number[]>;
  vectorCache?: Float32Array;
}

@Injectable()
export class FaissStore {
  private readonly logger = new Logger(FaissStore.name);
  private collections: Map<string, VectorCollection> = new Map();
  private indexPath: string;
  private dimension: number;
  private readonly IVF_THRESHOLD = 10000;
  private readonly QUANTIZE_THRESHOLD = 50000;
  private readonly BATCH_SIZE = 1000;

  constructor() {
    this.indexPath = process.env.FAISS_INDEX_PATH || './data/faiss-indexes';
    this.dimension = parseInt(process.env.EMBEDDING_DIMENSION, 10) || 768;
    this.ensureIndexPath();
    this.loadExistingIndexes();
  }

  private ensureIndexPath(): void {
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }
  }

  private loadExistingIndexes(): void {
    try {
      const files = fs.readdirSync(this.indexPath);
      const indexFiles = files.filter((f) => f.endsWith('.index'));

      for (const file of indexFiles) {
        const collectionName = path.basename(file, '.index');
        try {
          this.loadCollection(collectionName);
          this.logger.log(`Loaded existing index: ${collectionName}`);
        } catch (e) {
          this.logger.warn(`Failed to load index ${collectionName}: ${e}`);
        }
      }
    } catch (e) {
      this.logger.warn('No existing indexes found');
    }
  }

  private loadCollection(collectionName: string): void {
    const indexFilePath = path.join(this.indexPath, `${collectionName}.index`);
    const metaFilePath = path.join(this.indexPath, `${collectionName}-meta.json`);
    const configFilePath = path.join(this.indexPath, `${collectionName}-config.json`);

    let indexType: 'flat' | 'ivf' | 'quantized' = 'flat';
    if (fs.existsSync(configFilePath)) {
      const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
      indexType = config.indexType || 'flat';
    }

    let index: Index;
    if (indexType === 'ivf') {
      index = IndexIVFFlat.read(indexFilePath);
    } else if (indexType === 'quantized') {
      index = IndexScalarQuantizer.read(indexFilePath);
    } else {
      index = IndexFlatL2.read(indexFilePath);
    }

    let metadata: VectorMetadata[] = [];
    if (fs.existsSync(metaFilePath)) {
      metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
    }

    const docIdToIndices = new Map<string, number[]>();
    metadata.forEach((meta, idx) => {
      const indices = docIdToIndices.get(meta.documentId) || [];
      indices.push(idx);
      docIdToIndices.set(meta.documentId, indices);
    });

    this.collections.set(collectionName, {
      index,
      indexType,
      metadata,
      docIdToIndices,
    });
  }

  async addVectors(
    collectionName: string,
    vectors: number[][],
    metadatas: VectorMetadata[],
  ): Promise<void> {
    if (vectors.length !== metadatas.length) {
      throw new Error('Vectors and metadatas length mismatch');
    }

    const totalVectors = vectors.length;
    let processed = 0;

    while (processed < totalVectors) {
      const batchEnd = Math.min(processed + this.BATCH_SIZE, totalVectors);
      const batchVectors = vectors.slice(processed, batchEnd);
      const batchMetadatas = metadatas.slice(processed, batchEnd);

      this.addBatch(collectionName, batchVectors, batchMetadatas);
      processed = batchEnd;

      if (totalVectors > this.BATCH_SIZE) {
        this.logger.log(`Processed ${processed}/${totalVectors} vectors`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    this.autoOptimizeIndex(collectionName);
    this.persistCollection(collectionName);
  }

  private addBatch(
    collectionName: string,
    vectors: number[][],
    metadatas: VectorMetadata[],
  ): void {
    let collection = this.collections.get(collectionName);

    if (!collection) {
      const index = new IndexFlatL2(this.dimension);
      collection = {
        index,
        indexType: 'flat',
        metadata: [],
        docIdToIndices: new Map(),
      };
      this.collections.set(collectionName, collection);
    }

    const float32Vectors = new Float32Array(vectors.length * this.dimension);
    for (let i = 0; i < vectors.length; i++) {
      for (let j = 0; j < this.dimension; j++) {
        float32Vectors[i * this.dimension + j] = vectors[i][j] || 0;
      }
    }

    collection.index.add(float32Vectors);

    const baseIdx = collection.metadata.length;
    metadatas.forEach((meta, i) => {
      const idx = baseIdx + i;
      collection.metadata.push(meta);
      const indices = collection.docIdToIndices.get(meta.documentId) || [];
      indices.push(idx);
      collection.docIdToIndices.set(meta.documentId, indices);
    });
  }

  private autoOptimizeIndex(collectionName: string): void {
    const collection = this.collections.get(collectionName);
    if (!collection) return;

    const total = collection.index.ntotal();

    if (total >= this.QUANTIZE_THRESHOLD && collection.indexType !== 'quantized') {
      this.convertToQuantizedIndex(collectionName);
    } else if (total >= this.IVF_THRESHOLD && collection.indexType === 'flat') {
      this.convertToIVFIndex(collectionName);
    }
  }

  private convertToIVFIndex(collectionName: string): void {
    this.logger.log(`Converting ${collectionName} to IVF index for better performance`);
    const collection = this.collections.get(collectionName);
    if (!collection || collection.indexType !== 'flat') return;

    try {
      const total = collection.index.ntotal();
      const nlist = Math.min(Math.floor(Math.sqrt(total)), 4096);
      const ivfIndex = new IndexIVFFlat(this.dimension, nlist, MetricType.METRIC_L2);

      const flatIndex = collection.index as IndexFlatL2;
      const vectors = new Float32Array(total * this.dimension);
      for (let i = 0; i < total; i++) {
        const vec = flatIndex.reconstruct(i);
        for (let j = 0; j < this.dimension; j++) {
          vectors[i * this.dimension + j] = vec[j];
        }
      }

      ivfIndex.train(vectors);
      ivfIndex.add(vectors);
      ivfIndex.nprobe = Math.min(Math.ceil(nlist / 10), 128);

      collection.index = ivfIndex;
      collection.indexType = 'ivf';

      this.logger.log(`Converted to IVF index with nlist=${nlist}, nprobe=${ivfIndex.nprobe}`);
    } catch (e) {
      this.logger.error(`Failed to convert to IVF index: ${e}`);
    }
  }

  private convertToQuantizedIndex(collectionName: string): void {
    this.logger.log(`Converting ${collectionName} to quantized index for memory efficiency`);
    const collection = this.collections.get(collectionName);
    if (!collection) return;

    try {
      const total = collection.index.ntotal();
      const quantizer = new IndexScalarQuantizer(this.dimension, MetricType.METRIC_L2);

      const vectors = new Float32Array(total * this.dimension);
      if (collection.indexType === 'ivf') {
        const ivfIndex = collection.index as IndexIVFFlat;
        for (let i = 0; i < total; i++) {
          const vec = ivfIndex.reconstruct(i);
          for (let j = 0; j < this.dimension; j++) {
            vectors[i * this.dimension + j] = vec[j];
          }
        }
      } else {
        const flatIndex = collection.index as IndexFlatL2;
        for (let i = 0; i < total; i++) {
          const vec = flatIndex.reconstruct(i);
          for (let j = 0; j < this.dimension; j++) {
            vectors[i * this.dimension + j] = vec[j];
          }
        }
      }

      quantizer.train(vectors);
      quantizer.add(vectors);

      collection.index = quantizer;
      collection.indexType = 'quantized';

      const memSaved = (total * this.dimension * 4) - (total * this.dimension * 1);
      this.logger.log(`Converted to quantized index, saved ~${(memSaved / 1024 / 1024).toFixed(1)} MB`);
    } catch (e) {
      this.logger.error(`Failed to convert to quantized index: ${e}`);
    }
  }

  search(
    collectionName: string,
    queryVector: number[],
    topK = 5,
    threshold = 0.5,
    documentIds?: string[],
  ): SearchResult[] {
    const collection = this.collections.get(collectionName);
    if (!collection || collection.index.ntotal() === 0) {
      return [];
    }

    const queryFloat32 = new Float32Array(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      queryFloat32[i] = queryVector[i] || 0;
    }

    if (collection.indexType === 'ivf') {
      const ivfIndex = collection.index as IndexIVFFlat;
      const origNprobe = ivfIndex.nprobe;
      ivfIndex.nprobe = Math.min(origNprobe, Math.ceil(topK * 2));
    }

    const searchK = documentIds && documentIds.length > 0
      ? Math.min(topK * 5, collection.index.ntotal())
      : Math.min(topK * 2, collection.index.ntotal());

    const result = collection.index.search(queryFloat32, searchK);
    const results: SearchResult[] = [];

    const docFilter = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    for (let i = 0; i < result.labels.length; i++) {
      const idx = result.labels[i];
      if (idx < 0 || idx >= collection.metadata.length) continue;

      const score = result.distances[i];
      if (score > threshold) continue;

      const metadata = collection.metadata[idx];
      if (!metadata) continue;

      if (docFilter && !docFilter.has(metadata.documentId)) continue;

      results.push({
        chunkText: metadata.originalText,
        score: 1 - score,
        metadata,
        documentId: metadata.documentId,
      });

      if (results.length >= topK) break;
    }

    return results;
  }

  async batchSearch(
    collectionName: string,
    queryVectors: number[][],
    topK = 5,
    threshold = 0.5,
  ): Promise<SearchResult[][]> {
    const results: SearchResult[][] = [];
    for (const vec of queryVectors) {
      results.push(this.search(collectionName, vec, topK, threshold));
    }
    return results;
  }

  deleteByDocumentId(collectionName: string, documentId: string): boolean {
    const collection = this.collections.get(collectionName);
    if (!collection) return false;

    const indicesToRemove = collection.docIdToIndices.get(documentId);
    if (!indicesToRemove || indicesToRemove.length === 0) return false;

    const removeSet = new Set(indicesToRemove);
    const total = collection.metadata.length;
    const remainingMeta: VectorMetadata[] = [];
    const remainingVectors: number[][] = [];

    let flatIndex: IndexFlatL2;
    if (collection.indexType === 'ivf') {
      flatIndex = this.reconstructToFlat(collection);
    } else if (collection.indexType === 'quantized') {
      flatIndex = this.reconstructToFlat(collection);
    } else {
      flatIndex = collection.index as IndexFlatL2;
    }

    for (let i = 0; i < total; i++) {
      if (!removeSet.has(i)) {
        remainingMeta.push(collection.metadata[i]);
        const vec = flatIndex.reconstruct(i);
        remainingVectors.push(Array.from(vec));
      }
    }

    collection.docIdToIndices.delete(documentId);
    remainingMeta.forEach((meta, idx) => {
      const indices = collection.docIdToIndices.get(meta.documentId) || [];
      indices.push(idx);
      collection.docIdToIndices.set(meta.documentId, indices);
    });

    if (remainingVectors.length > 0) {
      const newIndex = new IndexFlatL2(this.dimension);
      const float32Vectors = new Float32Array(remainingVectors.length * this.dimension);
      for (let i = 0; i < remainingVectors.length; i++) {
        for (let j = 0; j < this.dimension; j++) {
          float32Vectors[i * this.dimension + j] = remainingVectors[i][j];
        }
      }
      newIndex.add(float32Vectors);

      collection.index = newIndex;
      collection.indexType = 'flat';
      collection.metadata = remainingMeta;

      this.autoOptimizeIndex(collectionName);
      this.persistCollection(collectionName);
    } else {
      this.collections.delete(collectionName);
      this.removePersistedCollection(collectionName);
    }

    return true;
  }

  private reconstructToFlat(collection: VectorCollection): IndexFlatL2 {
    const total = collection.index.ntotal();
    const flat = new IndexFlatL2(this.dimension);
    const vectors = new Float32Array(total * this.dimension);

    for (let i = 0; i < total; i++) {
      const vec = collection.index.reconstruct(i);
      for (let j = 0; j < this.dimension; j++) {
        vectors[i * this.dimension + j] = vec[j];
      }
    }

    flat.add(vectors);
    return flat;
  }

  getStats(): VectorStoreStats[] {
    const stats: VectorStoreStats[] = [];
    for (const [collection, data] of this.collections.entries()) {
      const docIds = new Set(data.metadata.map((m) => m.documentId));
      const memBytes = data.index.ntotal() * this.dimension * (data.indexType === 'quantized' ? 1 : 4);

      stats.push({
        collection,
        totalVectors: data.index.ntotal(),
        dimension: this.dimension,
        indexType: data.indexType,
        memoryUsageMB: memBytes / 1024 / 1024,
        documentCount: docIds.size,
      });
    }
    return stats;
  }

  private persistCollection(collectionName: string): void {
    const collection = this.collections.get(collectionName);
    if (!collection) return;

    const indexFilePath = path.join(this.indexPath, `${collectionName}.index`);
    const metaFilePath = path.join(this.indexPath, `${collectionName}-meta.json`);
    const configFilePath = path.join(this.indexPath, `${collectionName}-config.json`);

    try {
      collection.index.write(indexFilePath);
      fs.writeFileSync(metaFilePath, JSON.stringify(collection.metadata));
      fs.writeFileSync(configFilePath, JSON.stringify({
        indexType: collection.indexType,
        dimension: this.dimension,
        createdAt: Date.now(),
      }));
    } catch (e) {
      this.logger.error(`Failed to persist collection ${collectionName}: ${e}`);
    }
  }

  private removePersistedCollection(collectionName: string): void {
    const files = [
      path.join(this.indexPath, `${collectionName}.index`),
      path.join(this.indexPath, `${collectionName}-meta.json`),
      path.join(this.indexPath, `${collectionName}-config.json`),
    ];
    files.forEach((p) => {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
      }
    });
  }

  getDocumentIds(collectionName: string): string[] {
    const collection = this.collections.get(collectionName);
    if (!collection) return [];
    return Array.from(collection.docIdToIndices.keys());
  }

  optimizeAll(): void {
    for (const name of this.collections.keys()) {
      this.autoOptimizeIndex(name);
      this.persistCollection(name);
    }
  }
}
