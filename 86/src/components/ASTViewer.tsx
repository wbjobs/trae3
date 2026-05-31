import { useState } from 'react';
import { Card, Tabs, Empty, Tag } from 'antd';
import type { ParseResult, Token, ASTNode } from '@/types';

interface ASTViewerProps {
  result: ParseResult;
}

function ASTViewer({ result }: ASTViewerProps) {
  const [activeKey, setActiveKey] = useState('tokens');

  if (!result) {
    return <Empty description="请先解析脚本" />;
  }

  const renderTokenType = (type: string) => {
    const colorMap: Record<string, string> = {
      keyword: 'purple',
      identifier: 'blue',
      string: 'green',
      number: 'orange',
      operator: 'red',
      punctuation: 'default',
      comment: 'gray',
      whitespace: 'default'
    };
    return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
  };

  const renderASTNode = (node: ASTNode | undefined, depth = 0) => {
    if (!node) return null;

    return (
      <div className="ast-node" style={{ marginLeft: depth * 16 }}>
        <span className="ast-node-type">{node.type}</span>
        {node.value && (
          <span>
            {' '}= <span className="ast-node-value">"{node.value}"</span>
          </span>
        )}
        {node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child, index) => (
              <div key={index}>
                <span className="ast-node-key">{child.name}:</span>
                {renderASTNode(child.node, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ 
      flex: 1, 
      overflow: 'auto', 
      padding: 16,
      background: '#1e1e1e'
    }}>
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        items={[
          {
            key: 'tokens',
            label: `Tokens (${result.tokens.length})`,
            children: (
              <Card size="small" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 8,
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 12
                }}>
                  {result.tokens.map((token: Token, index: number) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        background: '#141414',
                        borderRadius: 4,
                        border: '1px solid #2a2a2a'
                      }}
                      title={`行 ${token.line}, 列 ${token.column}`}
                    >
                      {renderTokenType(token.type)}
                      <span style={{ color: '#ffffff' }}>{token.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )
          },
          {
            key: 'ast',
            label: '语法树',
            children: result.ast ? (
              <Card size="small" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <div className="ast-viewer">
                  {renderASTNode(result.ast)}
                </div>
              </Card>
            ) : (
              <Empty description="该语言暂不支持AST可视化" />
            )
          },
          {
            key: 'stats',
            label: '统计',
            children: (
              <Card size="small" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  <StatItem label="Token总数" value={result.tokens.length} />
                  <StatItem label="关键字" value={result.tokens.filter((t: Token) => t.type === 'keyword').length} />
                  <StatItem label="字符串" value={result.tokens.filter((t: Token) => t.type === 'string').length} />
                  <StatItem label="数字" value={result.tokens.filter((t: Token) => t.type === 'number').length} />
                  <StatItem label="标识符" value={result.tokens.filter((t: Token) => t.type === 'identifier').length} />
                  <StatItem label="注释" value={result.tokens.filter((t: Token) => t.type === 'comment').length} />
                </div>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      padding: 12,
      background: '#141414',
      borderRadius: 8,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#1677ff', marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
        {label}
      </div>
    </div>
  );
}

export default ASTViewer;
