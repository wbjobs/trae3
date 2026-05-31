import type { Particle } from '../../shared/types';

interface ParticlePoolItem extends Particle {
  active: boolean;
}

export class ParticleSystem {
  private activeParticles: ParticlePoolItem[] = [];
  private pool: ParticlePoolItem[] = [];
  private maxParticles: number = 300;
  private poolSize: number = 500;
  private stats = { totalEmits: 0, activeMax: 0 };

  constructor() {
    this.initPool();
  }

  private initPool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push({
        id: '',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        size: 4,
        type: 'explosion',
        active: false
      });
    }
  }

  private acquire(): ParticlePoolItem | null {
    for (const p of this.pool) {
      if (!p.active) {
        p.active = true;
        return p;
      }
    }

    if (this.pool.length < this.poolSize + 100) {
      const newP: ParticlePoolItem = {
        id: '',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        size: 4,
        type: 'explosion',
        active: true
      };
      this.pool.push(newP);
      return newP;
    }

    return null;
  }

  private release(p: ParticlePoolItem): void {
    p.active = false;
  }

  update(deltaTime: number): void {
    const dt = deltaTime / 1000;
    let activeCount = 0;

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      p.vx *= 0.96;
      p.vy *= 0.96;

      if (p.life <= 0) {
        this.release(p);
        this.activeParticles.splice(i, 1);
      } else {
        activeCount++;
      }
    }

    this.stats.activeMax = Math.max(this.stats.activeMax, activeCount);
  }

  render(ctx: CanvasRenderingContext2D, viewport?: { x: number; y: number; width: number; height: number }): void {
    if (this.activeParticles.length === 0) return;

    const hasViewport = !!viewport;

    const groups: Map<string, ParticlePoolItem[]> = new Map();
    for (const p of this.activeParticles) {
      if (hasViewport) {
        const margin = p.size * 2;
        if (p.x + margin < viewport!.x || p.x - margin > viewport!.x + viewport!.width ||
            p.y + margin < viewport!.y || p.y - margin > viewport!.y + viewport!.height) {
          continue;
        }
      }

      const key = `${p.type}|${p.color}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(p);
    }

    for (const [, particles] of groups) {
      const first = particles[0];
      const isExplosion = first.type === 'explosion';

      ctx.save();

      for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        if (isExplosion) {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          gradient.addColorStop(0, p.color);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'hit') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'trail') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }

      ctx.restore();
    }
  }

  emitExplosion(x: number, y: number, color: string, count: number = 12): void {
    const actualCount = Math.min(count, 12);
    for (let i = 0; i < actualCount; i++) {
      const p = this.acquire();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 80;

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.4 + Math.random() * 0.3;
      p.maxLife = 0.7;
      p.color = color;
      p.size = 3 + Math.random() * 4;
      p.type = 'explosion';

      this.activeParticles.push(p);
    }
    this.stats.totalEmits++;
  }

  emitHit(x: number, y: number, color: string): void {
    for (let i = 0; i < 3; i++) {
      const p = this.acquire();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 30;

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.2;
      p.maxLife = 0.2;
      p.color = color;
      p.size = 2;
      p.type = 'hit';

      this.activeParticles.push(p);
    }
    this.stats.totalEmits++;
  }

  emitTrail(x: number, y: number, color: string): void {
    const p = this.acquire();
    if (!p) return;

    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.life = 0.2;
    p.maxLife = 0.2;
    p.color = color;
    p.size = 6;
    p.type = 'trail';

    this.activeParticles.push(p);
  }

  emitSkillCast(x: number, y: number, color: string, radius: number): void {
    const count = Math.min(16, Math.floor(radius / 5));
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;

      const angle = (i / count) * Math.PI * 2;
      const speed = 60;

      p.x = x + Math.cos(angle) * radius * 0.4;
      p.y = y + Math.sin(angle) * radius * 0.4;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.5;
      p.maxLife = 0.5;
      p.color = color;
      p.size = 4;
      p.type = 'explosion';

      this.activeParticles.push(p);
    }
    this.stats.totalEmits++;
  }

  clear(): void {
    for (const p of this.activeParticles) {
      this.release(p);
    }
    this.activeParticles = [];
  }

  getActiveCount(): number {
    return this.activeParticles.length;
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }
}
