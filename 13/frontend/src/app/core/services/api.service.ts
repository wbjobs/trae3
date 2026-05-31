// API服务 - 通用HTTP请求封装

import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  HttpResponse,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, catchError, tap, of, Subject, filter, take, timer, race, EMPTY } from 'rxjs';
import { retryWhen, delay, mergeMap, take as rxjsTake } from 'rxjs/operators';

/**
 * 请求选项接口
 */
export interface RequestOptions {
  headers?: HttpHeaders | { [header: string]: string | string[] };
  params?: HttpParams | { [param: string]: string | number | boolean | readonly (string | number | boolean)[] };
  observe?: 'body' | 'events' | 'response';
  reportProgress?: boolean;
  responseType?: 'json' | 'arraybuffer' | 'blob' | 'text';
  withCredentials?: boolean;
  retryCount?: number;
  enableDeduplication?: boolean;
}

interface PendingRequest {
  timestamp: number;
  subject: Subject<any>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';
  private readonly defaultRetryCount = 3;
  private readonly dedupWindow = 100;

  private pendingRequests = new Map<string, PendingRequest>();

  constructor(private http: HttpClient) {}

  /**
   * GET请求
   * @param url 请求路径
   * @param options 请求选项
   */
  get<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.request<T>('GET', url, null, options);
  }

  /**
   * POST请求
   * @param url 请求路径
   * @param body 请求体
   * @param options 请求选项
   */
  post<T>(url: string, body: any, options?: RequestOptions): Observable<T> {
    return this.request<T>('POST', url, body, options);
  }

  /**
   * PUT请求
   * @param url 请求路径
   * @param body 请求体
   * @param options 请求选项
   */
  put<T>(url: string, body: any, options?: RequestOptions): Observable<T> {
    return this.request<T>('PUT', url, body, options);
  }

  /**
   * PATCH请求
   * @param url 请求路径
   * @param body 请求体
   * @param options 请求选项
   */
  patch<T>(url: string, body: any, options?: RequestOptions): Observable<T> {
    return this.request<T>('PATCH', url, body, options);
  }

  /**
   * DELETE请求
   * @param url 请求路径
   * @param options 请求选项
   */
  delete<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.request<T>('DELETE', url, null, options);
  }

  /**
   * 获取完整响应（包含headers、status等）
   */
  getFullResponse<T>(url: string, options?: RequestOptions): Observable<HttpResponse<T>> {
    return this.http
      .get<T>(this.buildUrl(url), {
        ...this.buildOptions(options),
        observe: 'response'
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * 文件上传
   * @param url 请求路径
   * @param formData 表单数据
   * @param onProgress 进度回调
   */
  uploadFile(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Observable<any> {
    return this.http
      .post(this.buildUrl(url), formData, {
        reportProgress: true,
        observe: 'events'
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * 文件下载
   * @param url 请求路径
   * @param filename 文件名
   */
  downloadFile(url: string, filename?: string): Observable<Blob> {
    return this.http
      .get(this.buildUrl(url), {
        responseType: 'blob'
      })
      .pipe(
        tap((blob) => {
          if (filename) {
            this.saveBlob(blob, filename);
          }
        }),
        catchError(this.handleError)
      );
  }

  /**
   * 通用请求方法
   */
  private request<T>(method: string, url: string, body: any, options?: RequestOptions): Observable<T> {
    const fullUrl = this.buildUrl(url);
    const requestKey = this.generateRequestKey(method, fullUrl, body, options);

    const enableDedup = options?.enableDeduplication ?? true;
    if (enableDedup) {
      const existing = this.pendingRequests.get(requestKey);
      if (existing && (Date.now() - existing.timestamp) < this.dedupWindow) {
        console.debug('请求去重命中:', requestKey);
        return existing.subject.asObservable();
      }

      const subject = new Subject<T>();
      this.pendingRequests.set(requestKey, {
        timestamp: Date.now(),
        subject
      });

      this.executeRequest<T>(method, fullUrl, body, options)
        .subscribe({
          next: (value) => {
            subject.next(value);
            subject.complete();
            this.cleanupRequest(requestKey);
          },
          error: (error) => {
            subject.error(error);
            this.cleanupRequest(requestKey);
          }
        });

      return subject.asObservable();
    }

    return this.executeRequest<T>(method, fullUrl, body, options);
  }

  /**
   * 执行实际的HTTP请求
   */
  private executeRequest<T>(method: string, url: string, body: any, options?: RequestOptions): Observable<T> {
    const retryCount = options?.retryCount ?? this.defaultRetryCount;
    const httpOptions = this.buildOptions(options);

    let request$: Observable<any>;

    switch (method) {
      case 'GET':
        request$ = this.http.get<T>(url, httpOptions);
        break;
      case 'POST':
        request$ = this.http.post<T>(url, body, httpOptions);
        break;
      case 'PUT':
        request$ = this.http.put<T>(url, body, httpOptions);
        break;
      case 'PATCH':
        request$ = this.http.patch<T>(url, body, httpOptions);
        break;
      case 'DELETE':
        request$ = this.http.delete<T>(url, httpOptions);
        break;
      default:
        return throwError(() => new Error('不支持的请求方法: ' + method));
    }

    return request$.pipe(
      retryWhen((errors) =>
        errors.pipe(
          mergeMap((error, index) => {
            const attempt = index + 1;

            if (!this.isRetryableError(error) || attempt >= retryCount) {
              return throwError(() => error);
            }

            const delayMs = this.calculateBackoff(attempt);
            console.warn(`请求失败，正在重试 (${attempt}/${retryCount})，${delayMs}ms后重试: ${url}`, error.message);

            return timer(delayMs);
          }),
          rxjsTake(retryCount)
        )
      ),
      catchError(this.handleError)
    );
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0 || error.status >= 500) {
        return true;
      }
      if (error.status === 408 || error.status === 429) {
        return true;
      }
    }
    return false;
  }

  /**
   * 计算指数退避延迟
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = 100;
    const maxDelay = 3000;
    const delay = baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, maxDelay);
  }

  /**
   * 生成请求去重key
   */
  private generateRequestKey(method: string, url: string, body: any, options?: RequestOptions): string {
    let paramsStr = '';
    if (options?.params) {
      paramsStr = options.params.toString();
    }
    const bodyStr = body ? JSON.stringify(body) : '';
    return `${method}:${url}:${paramsStr}:${bodyStr}`;
  }

  /**
   * 清理已完成的请求
   */
  private cleanupRequest(key: string): void {
    setTimeout(() => {
      this.pendingRequests.delete(key);
    }, this.dedupWindow);
  }

  /**
   * 构建完整URL
   */
  private buildUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * 构建请求选项
   */
  private buildOptions(options?: RequestOptions): any {
    const defaultHeaders = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return {
      headers: options?.headers ?? defaultHeaders,
      params: options?.params,
      observe: options?.observe ?? 'body',
      reportProgress: options?.reportProgress ?? false,
      responseType: options?.responseType ?? 'json',
      withCredentials: options?.withCredentials ?? false
    };
  }

  /**
   * 保存Blob到本地
   */
  private saveBlob(blob: Blob, filename: string): void {
    const link = document.createElement('a');
    const url = window.URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * 错误处理
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = '未知错误';

    if (error.error instanceof ErrorEvent) {
      // 客户端错误
      errorMessage = `客户端错误: ${error.error.message}`;
    } else if (error.status) {
      // 服务端错误
      errorMessage = `服务端错误: ${error.status} - ${error.message}`;

      switch (error.status) {
        case 400:
          errorMessage = error.error?.message || '请求参数错误';
          break;
        case 401:
          errorMessage = '未授权，请重新登录';
          break;
        case 403:
          errorMessage = '拒绝访问';
          break;
        case 404:
          errorMessage = '资源不存在';
          break;
        case 429:
          errorMessage = error.error?.message || '请求过于频繁，请稍后重试';
          break;
        case 500:
          errorMessage = error.error?.message || '服务器内部错误';
          break;
        case 503:
          errorMessage = '服务不可用';
          break;
      }
    }

    console.error('API请求错误:', error);
    return throwError(() => new Error(errorMessage));
  }
}
