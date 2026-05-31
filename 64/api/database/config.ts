export class InMemoryDatabase {
  private static instance: InMemoryDatabase;
  private initialized = false;

  private constructor() {}

  static getInstance(): InMemoryDatabase {
    if (!InMemoryDatabase.instance) {
      InMemoryDatabase.instance = new InMemoryDatabase();
    }
    return InMemoryDatabase.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('In-memory database initialized successfully');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getRepository<T>(entityName: string): {
    find: () => Promise<T[]>;
    findOne: (options: any) => Promise<T | null>;
    save: (entity: T) => Promise<T>;
    update: (criteria: any, data: Partial<T>) => Promise<void>;
    delete: (criteria: any) => Promise<void>;
    createQueryBuilder: () => any;
  } {
    const data: T[] = [];
    return {
      find: async () => data,
      findOne: async () => null,
      save: async (entity) => entity,
      update: async () => {},
      delete: async () => {},
      createQueryBuilder: () => ({
        where: () => ({ getMany: async () => data, getOne: async () => null }),
        orderBy: () => ({ getMany: async () => data }),
        skip: () => ({ take: () => ({ getManyAndCount: async () => [data, 0] }) }),
      }),
    };
  }
}

export const AppDataSource = InMemoryDatabase.getInstance();

export const initDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};
