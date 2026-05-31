interface ProcessEnv {
  DATABASE_HOST: string;
  DATABASE_PORT: string;
  DATABASE_USER: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;
  MINIO_ENDPOINT: string;
  MINIO_PORT: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  LLM_API_BASE: string;
  LLM_MODEL_NAME: string;
  LLM_API_KEY: string;
  EMBEDDING_API_BASE: string;
  EMBEDDING_MODEL_NAME: string;
  EMBEDDING_DIMENSION: string;
  FAISS_INDEX_PATH: string;
  UPLOAD_MAX_FILE_SIZE: string;
  LOG_LEVEL: string;
  AUDIT_LOG_ENABLED: string;
  NODE_ENV: string;
  PORT: string;
  CORS_ORIGIN: string;
}

declare namespace NodeJS {
  interface ProcessEnv extends ProcessEnv {}
}
