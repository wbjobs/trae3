import { createHash } from 'crypto';

export interface VirtualNode {
  hash: number;
  nodeId: string;
  virtualIndex: number;
}

export interface MigratedShard {
  shardId: string;
  fromNode: string;
  toNode: string;
}

export interface LoadDistribution {
  nodeId: string;
  shardCount: number;
  percentage: number;
}

export class ConsistentHashRing {
  private virtualNodes: VirtualNode[] = [];
  private sortedHashes: number[] = [];
  private hashToNode: Map<number, string> = new Map();
  private nodeToVirtualHashes: Map<string, number[]> = new Map();
  private readonly virtualNodeCount: number;

  constructor(virtualNodeCount: number = 100) {
    this.virtualNodeCount = virtualNodeCount;
  }

  private hash(key: string): number {
    const hashBuffer = createHash('md5').update(key).digest();
    return hashBuffer.readUInt32BE(0) * 0x100000000 + hashBuffer.readUInt32BE(4);
  }

  private binarySearch(hashes: number[], target: number): number {
    let left = 0;
    let right = hashes.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (hashes[mid] === target) {
        return mid;
      } else if (hashes[mid] < target) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return left;
  }

  addNode(nodeId: string): void {
    if (this.nodeToVirtualHashes.has(nodeId)) {
      return;
    }

    const virtualHashes: number[] = [];

    for (let i = 0; i < this.virtualNodeCount; i++) {
      const virtualKey = `${nodeId}#${i}`;
      const hashValue = this.hash(virtualKey);

      this.virtualNodes.push({
        hash: hashValue,
        nodeId,
        virtualIndex: i,
      });

      this.hashToNode.set(hashValue, nodeId);
      virtualHashes.push(hashValue);
    }

    this.nodeToVirtualHashes.set(nodeId, virtualHashes);
    this.sortedHashes = Array.from(this.hashToNode.keys()).sort((a, b) => a - b);
  }

  removeNode(nodeId: string): void {
    const virtualHashes = this.nodeToVirtualHashes.get(nodeId);
    if (!virtualHashes) {
      return;
    }

    for (const hash of virtualHashes) {
      this.hashToNode.delete(hash);
    }

    this.virtualNodes = this.virtualNodes.filter(vn => vn.nodeId !== nodeId);
    this.nodeToVirtualHashes.delete(nodeId);
    this.sortedHashes = Array.from(this.hashToNode.keys()).sort((a, b) => a - b);
  }

  getShardLocation(shardId: string): string | null {
    if (this.sortedHashes.length === 0) {
      return null;
    }

    const shardHash = this.hash(shardId);
    const index = this.binarySearch(this.sortedHashes, shardHash);
    const ringIndex = index % this.sortedHashes.length;
    const targetHash = this.sortedHashes[ringIndex];

    return this.hashToNode.get(targetHash) || null;
  }

  getShardReplicas(shardId: string, replicaCount: number = 3): string[] {
    if (this.sortedHashes.length === 0) {
      return [];
    }

    const replicas: string[] = [];
    const usedNodes = new Set<string>();
    const shardHash = this.hash(shardId);

    let index = this.binarySearch(this.sortedHashes, shardHash);

    while (replicas.length < Math.min(replicaCount, this.getNodeCount())) {
      const ringIndex = index % this.sortedHashes.length;
      const targetHash = this.sortedHashes[ringIndex];
      const nodeId = this.hashToNode.get(targetHash);

      if (nodeId && !usedNodes.has(nodeId)) {
        usedNodes.add(nodeId);
        replicas.push(nodeId);
      }

      index++;
      if (index > this.sortedHashes.length * 2) {
        break;
      }
    }

    return replicas;
  }

  getMigratedShards(oldNodes: string[], newNodes: string[], shardIds: string[]): MigratedShard[] {
    const migrations: MigratedShard[] = [];
    const newNodeSet = new Set(newNodes);

    const tempRing = new ConsistentHashRing(this.virtualNodeCount);
    for (const node of oldNodes) {
      tempRing.addNode(node);
    }

    for (const shardId of shardIds) {
      const oldLocation = tempRing.getShardLocation(shardId);

      if (oldLocation && !newNodeSet.has(oldLocation)) {
        const newRing = new ConsistentHashRing(this.virtualNodeCount);
        for (const node of newNodes) {
          newRing.addNode(node);
        }
        const newLocation = newRing.getShardLocation(shardId);

        if (newLocation && newLocation !== oldLocation) {
          migrations.push({
            shardId,
            fromNode: oldLocation,
            toNode: newLocation,
          });
        }
      }
    }

    return migrations;
  }

  getLoadDistribution(shardIds: string[]): LoadDistribution[] {
    const nodeShardCount: Map<string, number> = new Map();
    const nodes = this.getNodes();

    for (const node of nodes) {
      nodeShardCount.set(node, 0);
    }

    for (const shardId of shardIds) {
      const nodeId = this.getShardLocation(shardId);
      if (nodeId) {
        nodeShardCount.set(nodeId, (nodeShardCount.get(nodeId) || 0) + 1);
      }
    }

    const total = shardIds.length;
    const distribution: LoadDistribution[] = [];

    nodeShardCount.forEach((count, nodeId) => {
      distribution.push({
        nodeId,
        shardCount: count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      });
    });

    return distribution.sort((a, b) => b.shardCount - a.shardCount);
  }

  getNodes(): string[] {
    return Array.from(this.nodeToVirtualHashes.keys());
  }

  getNodeCount(): number {
    return this.nodeToVirtualHashes.size;
  }

  getVirtualNodeCount(): number {
    return this.virtualNodeCount;
  }

  clear(): void {
    this.virtualNodes = [];
    this.sortedHashes = [];
    this.hashToNode.clear();
    this.nodeToVirtualHashes.clear();
  }
}

export const consistentHashRing = new ConsistentHashRing(100);
export default ConsistentHashRing;
