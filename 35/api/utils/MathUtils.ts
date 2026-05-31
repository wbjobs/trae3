import type { Vector2 } from '../../shared/types.js';

export class MathUtils {
  static distance(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static distanceSquared(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  static normalize(v: Vector2): Vector2 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  static direction(from: Vector2, to: Vector2): Vector2 {
    return this.normalize({
      x: to.x - from.x,
      y: to.y - from.y
    });
  }

  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  static randomRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  static angle(from: Vector2, to: Vector2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  static rotatePoint(point: Vector2, center: Vector2, angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  }

  static rectContains(rect: { x: number; y: number; width: number; height: number }, point: Vector2): boolean {
    return point.x >= rect.x && 
           point.x <= rect.x + rect.width &&
           point.y >= rect.y && 
           point.y <= rect.y + rect.height;
  }

  static circleIntersectsRect(
    circle: { x: number; y: number; radius: number },
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const closestX = this.clamp(circle.x, rect.x, rect.x + rect.width);
    const closestY = this.clamp(circle.y, rect.y, rect.y + rect.height);
    const distanceSquared = Math.pow(circle.x - closestX, 2) + Math.pow(circle.y - closestY, 2);
    return distanceSquared < Math.pow(circle.radius, 2);
  }

  static floatsEqual(a: number, b: number, epsilon: number = 0.0001): boolean {
    return Math.abs(a - b) < epsilon;
  }
}
