import { useState } from 'react';
import { Tabs, Empty, Tag, Alert } from 'antd';
import {
  BugOutlined,
  WarningOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useAppStore } from '@/store';
import type { SyntaxIssue } from '@/types';

function ProblemPanel() {
  const { syntaxResult, currentFile, setActiveTab } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!syntaxResult) {
    return null;
  }

  const errors = syntaxResult.issues.filter(i => i.severity === 'error');
  const warnings = syntaxResult.issues.filter(i => i.severity === 'warning');
  const infos = syntaxResult.issues.filter(i => i.severity === 'info');

  const handleClickIssue = (issue: SyntaxIssue) => {
    setActiveTab('editor');
    // TODO: 跳转到编辑器对应行
  };

  const renderIssueList = (issues: SyntaxIssue[], type: 'error' | 'warning' | 'info') => {
    if (issues.length === 0) {
      return <Empty description={`无${type === 'error' ? '错误' : type === 'warning' ? '警告' : '提示'}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {issues.map((issue, index) => (
          <div
            key={index}
            className={`error-item error-severity-${type}`}
            onClick={() => handleClickIssue(issue)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {type === 'error' && <BugOutlined style={{ color: '#ff4d4f' }} />}
              {type === 'warning' && <WarningOutlined style={{ color: '#faad14' }} />}
              {type === 'info' && <InfoCircleOutlined style={{ color: '#1677ff' }} />}
              <span style={{ fontWeight: 500 }}>{issue.message}</span>
              <Tag color={type === 'error' ? 'red' : type === 'warning' ? 'orange' : 'blue'} style={{ marginLeft: 'auto' }}>
                {issue.ruleId}
              </Tag>
            </div>
            <div style={{ fontSize: 12, color: '#8c8c8c', paddingLeft: 24 }}>
              {currentFile?.name} - 行 {issue.line}, 列 {issue.column}
              {issue.suggestion && (
                <span style={{ marginLeft: 16, color: '#52c41a' }}>
                  建议: {issue.suggestion}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (collapsed) {
    return (
      <div
        style={{
          height: 32,
          background: '#1a1a1a',
          borderTop: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          cursor: 'pointer',
          gap: 16
        }}
        onClick={() => setCollapsed(false)}
      >
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>问题面板</span>
        {errors.length > 0 && (
          <Tag color="red">{errors.length} 错误</Tag>
        )}
        {warnings.length > 0 && (
          <Tag color="orange">{warnings.length} 警告</Tag>
        )}
        {infos.length > 0 && (
          <Tag color="blue">{infos.length} 提示</Tag>
        )}
        <span style={{ marginLeft: 'auto', color: '#8c8c8c', fontSize: 12 }}>
          点击展开
        </span>
      </div>
    );
  }

  return (
    <div className="problem-panel">
      <div style={{
        height: 32,
        background: '#141414',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        justifyContent: 'space-between'
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          问题
        </span>
        <span
          style={{ color: '#8c8c8c', cursor: 'pointer', fontSize: 12 }}
          onClick={() => setCollapsed(true)}
        >
          收起
        </span>
      </div>

      {syntaxResult.issues.length === 0 ? (
        <Empty description="未检测到问题" style={{ paddingTop: 40 }} />
      ) : (
        <Tabs
          size="small"
          items={[
            {
              key: 'all',
              label: `全部 (${syntaxResult.issues.length})`,
              children: renderIssueList(syntaxResult.issues, 'info')
            },
            {
              key: 'errors',
              label: `错误 (${errors.length})`,
              children: renderIssueList(errors, 'error')
            },
            {
              key: 'warnings',
              label: `警告 (${warnings.length})`,
              children: renderIssueList(warnings, 'warning')
            },
            {
              key: 'infos',
              label: `提示 (${infos.length})`,
              children: renderIssueList(infos, 'info')
            }
          ]}
        />
      )}

      {syntaxResult.metrics && (
        <div style={{
          padding: '8px 16px',
          background: '#141414',
          borderTop: '1px solid #2a2a2a',
          display: 'flex',
          gap: 24,
          fontSize: 12
        }}>
          <span>圈复杂度: <strong style={{ color: syntaxResult.metrics.complexity > 10 ? '#faad14' : '#52c41a' }}>{syntaxResult.metrics.complexity}</strong></span>
          <span>代码行数: <strong>{syntaxResult.metrics.loc}</strong></span>
          <span>函数数量: <strong>{syntaxResult.metrics.functions}</strong></span>
          <span>代码重复率: <strong style={{ color: syntaxResult.metrics.duplication > 20 ? '#faad14' : '#52c41a' }}>{syntaxResult.metrics.duplication}%</strong></span>
        </div>
      )}
    </div>
  );
}

export default ProblemPanel;
