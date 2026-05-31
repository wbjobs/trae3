import { v4 as uuidv4 } from 'uuid';

export class IDGenerator {
  static generate(): string {
    return uuidv4();
  }

  static generateShort(): string {
    return uuidv4().split('-')[0];
  }

  static generateRoomId(): string {
    return `ROOM_${uuidv4().split('-')[0].toUpperCase()}`;
  }

  static generateEntityId(prefix: string = 'ENT'): string {
    return `${prefix}_${uuidv4().split('-')[0]}`;
  }
}
