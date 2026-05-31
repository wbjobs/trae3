import dataStore from '../data/store.js';
import type { ArchiveMetadata, QualityRecord, QualityResult, QualityIssue } from '../../shared/types.js';

export interface BatchQualityResult {
  total: number;
  success: number;
  failed: number;
  results: Array<{ archiveId: string; success: boolean; message?: string }>;
}

export interface QualityReport {
  reportId: string;
  generatedAt: string;
  inspector: string;
  summary: {
    totalChecked: number;
    passed: number;
    rejected: number;
    averageScore: number;
  };
  details: Array<{
    archive: ArchiveMetadata;
    record?: QualityRecord;
  }>;
  issuesSummary: {
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

export class ProcessControlService {
  submitQualityCheck(
    archiveId: string,
    result: QualityResult,
    inspector: string,
    issues: QualityIssue[] = [],
    comments: string = ''
  ): { record: QualityRecord; archive: ArchiveMetadata } | null {
    const archive = dataStore.getArchiveById(archiveId);
    if (!archive) return null;
    if (archive.status !== 'PENDING' && archive.status !== 'QUALITY_CHECKING') return null;

    const qualityScore = this.calculateQualityScore({
      result,
      issues
    });

    const status = result === 'PASS' ? 'APPROVED' : 'REJECTED';
    
    const newRecord = dataStore.addQualityRecord({
      archiveId,
      inspector,
      result,
      comments,
      issues,
      checkTime: new Date().toLocaleString()
    });

    dataStore.updateArchiveStatus(archiveId, status, qualityScore);
    const updatedArchive = dataStore.getArchiveById(archiveId)!;

    return { record: newRecord, archive: updatedArchive };
  }

  async batchQualityCheck(
    archiveIds: string[],
    result: QualityResult,
    inspector: string,
    defaultComments: string = '',
    onProgress?: (current: number, total: number) => void
  ): Promise<BatchQualityResult> {
    const batchResult: BatchQualityResult = {
      total: archiveIds.length,
      success: 0,
      failed: 0,
      results: []
    };

    for (let i = 0; i < archiveIds.length; i++) {
      const archiveId = archiveIds[i];
      try {
        const resultData = this.submitQualityCheck(
          archiveId,
          result,
          inspector,
          [],
          defaultComments
        );
        
        if (resultData) {
          batchResult.success++;
          batchResult.results.push({ archiveId, success: true });
        } else {
          batchResult.failed++;
          batchResult.results.push({ archiveId, success: false, message: '档案不存在或状态异常' });
        }
      } catch (e: any) {
        batchResult.failed++;
        batchResult.results.push({ archiveId, success: false, message: e.message });
      }
      
      if (onProgress) {
        onProgress(i + 1, archiveIds.length);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return batchResult;
  }

  generateQualityReport(
    dateRange?: { start: string; end: string },
    inspector?: string
  ): QualityReport {
    const archives = dataStore.getArchives();
    const allRecords = [];
    
    for (const archive of archives) {
      const records = dataStore.getQualityRecordsByArchiveId(archive.id);
      if (records.length > 0) {
        allRecords.push(...records.map(r => ({ archive, record: r })));
      }
    }

    let filtered = allRecords;
    if (inspector) {
      filtered = filtered.filter(item => item.record.inspector === inspector);
    }

    const passed = filtered.filter(item => item.record.result === 'PASS').length;
    const rejected = filtered.length - passed;
    const scores = filtered
      .filter(item => item.archive.qualityScore !== undefined)
      .map(item => item.archive.qualityScore!);
    const averageScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
      : 0;

    const issuesSummary: QualityReport['issuesSummary'] = {
      byType: {},
      bySeverity: {}
    };

    for (const item of filtered) {
      for (const issue of item.record.issues) {
        issuesSummary.byType[issue.type] = (issuesSummary.byType[issue.type] || 0) + 1;
        issuesSummary.bySeverity[issue.severity] = (issuesSummary.bySeverity[issue.severity] || 0) + 1;
      }
    }

    return {
      reportId: `RPT-${Date.now()}`,
      generatedAt: new Date().toLocaleString(),
      inspector: inspector || 'ALL',
      summary: {
        totalChecked: filtered.length,
        passed,
        rejected,
        averageScore
      },
      details: filtered,
      issuesSummary
    };
  }

  generateReportHtml(report: QualityReport): string {
    const typeLabels: Record<string, string> = {
      FORMAT: '格式问题',
      CONTENT: '内容问题',
      METADATA: '元数据问题',
      OTHER: '其他问题'
    };
    const severityLabels: Record<string, string> = {
      CRITICAL: '严重',
      MAJOR: '主要',
      MINOR: '轻微'
    };

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>质检报告 - ${report.reportId}</title>
<style>
  body { font-family: 'Microsoft YaHei', sans-serif; max-width: 1000px; margin: 0 auto; padding: 40px; color: #333; }
  h1 { color: #165DFF; border-bottom: 3px solid #165DFF; padding-bottom: 10px; }
  h2 { color: #165DFF; margin-top: 30px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
  .summary-item { background: #f5f7fa; padding: 20px; border-radius: 8px; text-align: center; }
  .summary-value { font-size: 32px; font-weight: bold; color: #165DFF; }
  .summary-label { font-size: 14px; color: #666; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #f0f5ff; color: #165DFF; padding: 12px; text-align: left; }
  td { padding: 12px; border-bottom: 1px solid #e8e8e8; }
  .pass { color: #0FC6C2; font-weight: bold; }
  .fail { color: #F53F3F; font-weight: bold; }
  .issue-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 4px; }
  .CRITICAL { background: #FFECE8; color: #F53F3F; }
  .MAJOR { background: #FFF7E8; color: #FF7D00; }
  .MINOR { background: #E8F3FF; color: #165DFF; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
</style>
</head>
<body>
  <h1>📋 测绘成果质量检查报告</h1>
  <div class="meta">
    <p><strong>报告编号：</strong>${report.reportId}</p>
    <p><strong>生成时间：</strong>${report.generatedAt}</p>
    <p><strong>质检员：</strong>${report.inspector}</p>
  </div>

  <h2>📊 质检汇总</h2>
  <div class="summary">
    <div class="summary-item">
      <div class="summary-value">${report.summary.totalChecked}</div>
      <div class="summary-label">总检查数</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color:#0FC6C2">${report.summary.passed}</div>
      <div class="summary-label">通过</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color:#F53F3F">${report.summary.rejected}</div>
      <div class="summary-label">驳回</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color:#722ED1">${report.summary.averageScore}</div>
      <div class="summary-label">平均分</div>
    </div>
  </div>

  <h2>🔍 问题统计</h2>
  <table>
    <tr><th>问题类型</th><th>数量</th></tr>
    ${Object.entries(report.issuesSummary.byType).map(([type, count]) => 
      `<tr><td>${typeLabels[type] || type}</td><td>${count}</td></tr>`
    ).join('')}
  </table>
  
  <table>
    <tr><th>严重程度</th><th>数量</th></tr>
    ${Object.entries(report.issuesSummary.bySeverity).map(([sev, count]) => 
      `<tr><td>${severityLabels[sev] || sev}</td><td>${count}</td></tr>`
    ).join('')}
  </table>

  <h2>📑 详细记录</h2>
  <table>
    <tr><th>项目名称</th><th>文件类型</th><th>结果</th><th>评分</th><th>问题</th></tr>
    ${report.details.map(d => `
      <tr>
        <td>${d.archive.projectName}</td>
        <td>${d.archive.fileType}</td>
        <td class="${d.record?.result === 'PASS' ? 'pass' : 'fail'}">
          ${d.record?.result === 'PASS' ? '✓ 通过' : '✗ 驳回'}
        </td>
        <td>${d.archive.qualityScore || '-'}</td>
        <td>
          ${d.record?.issues.map(i => 
            `<span class="issue-badge ${i.severity}">${typeLabels[i.type] || i.type}</span>`
          ).join('') || '无'}
        </td>
      </tr>
    `).join('')}
  </table>

  <div class="footer">
    本报告由测绘档案管理系统自动生成 · ${report.generatedAt}
  </div>
</body>
</html>`;
  }

  getPendingArchives(): ArchiveMetadata[] {
    return dataStore.getArchives().filter(a => 
      a.status === 'PENDING' || a.status === 'QUALITY_CHECKING'
    );
  }

  getCheckedArchives(): ArchiveMetadata[] {
    return dataStore.getArchives().filter(a => 
      a.status === 'APPROVED' || a.status === 'REJECTED'
    );
  }

  createArchive(metadata: Omit<ArchiveMetadata, 'id' | 'version'>): ArchiveMetadata {
    return dataStore.addArchive({
      ...metadata,
      version: 1
    });
  }

  private calculateQualityScore(record: {
    result: QualityResult;
    issues: QualityIssue[];
  }): number {
    if (record.result === 'FAIL') {
      const criticalCount = record.issues.filter(i => i.severity === 'CRITICAL').length;
      const majorCount = record.issues.filter(i => i.severity === 'MAJOR').length;
      const minorCount = record.issues.filter(i => i.severity === 'MINOR').length;
      return Math.max(0, 100 - criticalCount * 30 - majorCount * 15 - minorCount * 5);
    }
    const minorCount = record.issues.filter(i => i.severity === 'MINOR').length;
    return Math.max(80, 100 - minorCount * 5);
  }
}

export default new ProcessControlService();
