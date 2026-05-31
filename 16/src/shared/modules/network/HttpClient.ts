import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { createModuleLogger } from '../logger';
import { ApiResponse } from '@shared/types';

const logger = createModuleLogger('HttpClient');

export interface HttpClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class HttpClient {
  private instance: AxiosInstance;
  private defaultConfig: HttpClientConfig;

  constructor(config: HttpClientConfig = {}) {
    this.defaultConfig = {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      },
      ...config
    };

    this.instance = axios.create(this.defaultConfig);
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.instance.interceptors.request.use(
      (config) => {
        logger.debug('request', `${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params,
          data: config.data
        });
        return config;
      },
      (error) => {
        logger.error('request_error', '请求发送失败', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.instance.interceptors.response.use(
      (response) => {
        logger.debug('response', `${response.status} ${response.config.url}`, {
          status: response.status
        });
        return response;
      },
      (error) => {
        logger.error('response_error', '请求响应错误', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.instance.request(config);
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: ApiResponse<T> }; message: string };
      if (err.response?.data) {
        return err.response.data;
      }
      return {
        success: false,
        error: err.message || '请求失败'
      };
    }
  }

  async get<T>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url, params });
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  async download(url: string, config?: AxiosRequestConfig): Promise<ArrayBuffer> {
    const response = await this.instance.get(url, {
      ...config,
      responseType: 'arraybuffer'
    });
    return response.data;
  }

  async upload<T>(url: string, formData: FormData, onProgress?: (percent: number) => void): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    });
  }
}

export const createHttpClient = (config?: HttpClientConfig): HttpClient => {
  return new HttpClient(config);
};

export default HttpClient;
