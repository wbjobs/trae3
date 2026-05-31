import * as os from 'os';
import * as ping from 'ping';
import * as dns from 'dns';
import { createModuleLogger } from '../logger';
import { NetworkScanResult } from '@shared/types';

const logger = createModuleLogger('TerminalDiscoverer');

export interface DiscoverOptions {
  timeout?: number;
  concurrency?: number;
  port?: number;
}

export class TerminalDiscoverer {
  private options: DiscoverOptions;
  private cancelRequested = false;

  constructor(options: DiscoverOptions = {}) {
    this.options = {
      timeout: 2000,
      concurrency: 50,
      port: 80,
      ...options
    };
  }

  getLocalNetworks(): { network: string; netmask: string; gateway?: string }[] {
    const interfaces = os.networkInterfaces();
    const networks: { network: string; netmask: string; gateway?: string }[] = [];

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;

      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const network = this.calculateNetwork(addr.address, addr.netmask);
          networks.push({
            network,
            netmask: addr.netmask
          });
        }
      }
    }

    logger.info('get_local_networks', `发现 ${networks.length} 个本地网络`, { networks });
    return networks;
  }

  private calculateNetwork(ip: string, netmask: string): string {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    const networkParts = ipParts.map((part, i) => part & maskParts[i]);
    return networkParts.join('.');
  }

  private generateIPRange(network: string, netmask: string): string[] {
    const maskBits = this.netmaskToCIDR(netmask);
    const hostCount = Math.pow(2, 32 - maskBits) - 2;

    if (hostCount <= 0 || hostCount > 65536) {
      return [];
    }

    const networkInt = this.ipToInt(network);
    const ips: string[] = [];

    for (let i = 1; i <= hostCount; i++) {
      ips.push(this.intToIp(networkInt + i));
    }

    return ips;
  }

  private ipToInt(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  private intToIp(num: number): string {
    return [
      (num >>> 24) & 0xFF,
      (num >>> 16) & 0xFF,
      (num >>> 8) & 0xFF,
      num & 0xFF
    ].join('.');
  }

  private netmaskToCIDR(netmask: string): number {
    return netmask
      .split('.')
      .map(Number)
      .reduce((acc, part) => acc + (part.toString(2).match(/1/g) || []).length, 0);
  }

  private async pingIP(ip: string): Promise<NetworkScanResult> {
    try {
      const isWin = process.platform === 'win32';
      const timeoutSec = Math.max(1, Math.ceil((this.options.timeout || 2000) / 1000));

      const result = await ping.promise.probe(ip, {
        timeout: timeoutSec,
        extra: isWin ? [] : ['-c', '1']
      });

      let hostname: string | undefined;
      try {
        const hostnames = await dns.promises.reverse(ip);
        hostname = hostnames[0];
      } catch {
        // DNS reverse lookup failed
      }

      return {
        ip,
        hostname,
        isAlive: result.alive,
        responseTime: result.time !== 'unknown' ? Number(result.time) : undefined
      };
    } catch (error) {
      logger.warn('ping_error', `Ping ${ip} 失败`, { error: (error as Error).message });
      return { ip, isAlive: false };
    }
  }

  async discoverViaArp(): Promise<NetworkScanResult[]> {
    const { exec } = require('child_process');
    const isWin = process.platform === 'win32';
    const command = isWin ? 'arp -a' : 'arp -a';

    return new Promise((resolve) => {
      exec(command, { timeout: 5000 }, (error: Error | null, stdout: string) => {
        if (error) {
          logger.warn('arp_scan_error', 'ARP表查询失败', { error: error.message });
          resolve([]);
          return;
        }

        const results: NetworkScanResult[] = [];
        const lines = stdout.split('\n');
        const ipRegex = isWin
          ? /(\d+\.\d+\.\d+\.\d+)\s+([\da-fA-F-]{17})\s+(\w+)/
          : /(\S+)\s+\S+\s+([\da-fA-F:]{17})\s+\S+\s+(\w+)/;

        for (const line of lines) {
          const match = line.match(ipRegex);
          if (match) {
            const ip = match[1];
            const mac = match[2];
            if (ip !== '0.0.0.0' && !ip.startsWith('224.') && !ip.startsWith('255.')) {
              results.push({ ip, mac, isAlive: true });
            }
          }
        }

        logger.info('arp_scan_complete', 'ARP表扫描完成', { count: results.length });
        resolve(results);
      });
    });
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  async scanNetwork(network?: string, netmask?: string): Promise<NetworkScanResult[]> {
    let targetNetwork = network;
    let targetNetmask = netmask;

    if (!targetNetwork || !targetNetmask) {
      const networks = this.getLocalNetworks();
      if (networks.length === 0) {
        throw new Error('未发现可用的本地网络');
      }
      targetNetwork = networks[0].network;
      targetNetmask = networks[0].netmask;
    }

    const ips = this.generateIPRange(targetNetwork, targetNetmask);
    if (ips.length === 0) {
      throw new Error('IP范围过大或无效');
    }

    logger.info('scan_network', `开始扫描网络 ${targetNetwork}/${targetNetmask}`, {
      ipCount: ips.length
    });

    const results: NetworkScanResult[] = [];
    const concurrency = this.options.concurrency!;

    for (let i = 0; i < ips.length; i += concurrency) {
      if (this.cancelRequested) break;
      const batch = ips.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(ip => this.pingIP(ip)));
      results.push(...batchResults);
    }

    this.cancelRequested = false;

    const aliveCount = results.filter(r => r.isAlive).length;
    logger.info('scan_network_complete', `网络扫描完成，发现 ${aliveCount} 个在线设备`, {
      total: results.length,
      alive: aliveCount
    });

    return results;
  }

  async fastDiscover(): Promise<NetworkScanResult[]> {
    const arpResults = await this.discoverViaArp();
    const arpIps = new Set(arpResults.map(r => r.ip));

    const networks = this.getLocalNetworks();
    const results: NetworkScanResult[] = [...arpResults];

    for (const net of networks) {
      const ips = this.generateIPRange(net.network, net.netmask);
      const candidates = ips.filter(ip => !arpIps.has(ip)).slice(0, 50);

      const pingResults = await Promise.all(
        candidates.map(ip => this.pingIP(ip))
      );
      results.push(...pingResults.filter(r => r.isAlive));
    }

    return results;
  }

  async scanAllNetworks(): Promise<NetworkScanResult[]> {
    const networks = this.getLocalNetworks();
    const allResults: NetworkScanResult[] = [];

    for (const net of networks) {
      try {
        const results = await this.scanNetwork(net.network, net.netmask);
        allResults.push(...results);
      } catch (error) {
        logger.warn('scan_network_error', `扫描网络 ${net.network} 失败`, {
          error: (error as Error).message
        });
      }
    }

    return allResults;
  }

  async discoverTerminal(ip: string, apiPort: number = 8080): Promise<{ ip: string; info?: Record<string, unknown> } | null> {
    const scanResult = await this.pingIP(ip);
    if (!scanResult.isAlive) {
      return null;
    }

    try {
      const axios = require('axios').default;
      const response = await axios.get(`http://${ip}:${apiPort}/api/device/info`, {
        timeout: 3000
      });
      return {
        ip,
        info: response.data
      };
    } catch {
      return { ip };
    }
  }
}

export const createTerminalDiscoverer = (options?: DiscoverOptions): TerminalDiscoverer => {
  return new TerminalDiscoverer(options);
};

export default TerminalDiscoverer;
