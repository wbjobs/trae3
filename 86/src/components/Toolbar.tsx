import { Button, Select, Space, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  BugOutlined,
  CodeOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  ShareAltOutlined
} from '@ant-design/icons';
import { useAppStore } from '@/store';
import { invokeParseScript, invokeCheckSyntax, invokeFormatCode } from '@/api/invoke';
import { message } from 'antd';
import type { ScriptLanguage } from '@/types';

const { Option } = Select;

function Toolbar() {
  const {
    currentFile,
    updateFileLanguage,
    setParseResult,
    setSyntaxResult,
    setIsLoading
  } = useAppStore();

  const languages: ScriptLanguage[] = [
    'javascript', 'typescript', 'python', 'rust',
    'go', 'bash', 'powershell', 'sql', 'json', 'yaml'
  ];

  const handleParse = async () => {
    if (!currentFile) {
      message.warning('请先打开一个文件');
      return;
    }

    setIsLoading(true);
    try {
      const result = await invokeParseScript(currentFile.content, currentFile.language);
      setParseResult(result);
      message.success(`解析完成: ${result.tokens.length} 个Token, ${result.ast ? '有AST' : '无AST'}`);
    } catch (error) {
      message.error('解析失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheck = async () => {
    if (!currentFile) {
      message.warning('请先打开一个文件');
      return;
    }

    setIsLoading(true);
    try {
      const result = await invokeCheckSyntax(currentFile.content, currentFile.language);
      setSyntaxResult(result);
      
      if (result.issues.length === 0) {
        message.success('未检测到问题');
      } else {
        const errorCount = result.issues.filter(i => i.severity === 'error').length;
        const warningCount = result.issues.filter(i => i.severity === 'warning').length;
        message.warning(`检测到 ${errorCount} 个错误, ${warningCount} 个警告`);
      }
    } catch (error) {
      message.error('语法检测失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormat = async () => {
    if (!currentFile) {
      message.warning('请先打开一个文件');
      return;
    }

    try {
      const formatted = await invokeFormatCode(currentFile.content, currentFile.language);
      if (currentFile) {
        useAppStore.getState().updateFileContent(currentFile.id, formatted);
        message.success('格式化完成');
      }
    } catch (error) {
      message.error('格式化失败');
    }
  };

  const handleLanguageChange = (value: ScriptLanguage) => {
    if (currentFile) {
      updateFileLanguage(currentFile.id, value);
    }
  };

  const handleVersionHistory = () => {
    // 打开版本历史面板
  };

  const handleShare = () => {
    // 分享功能
  };

  return (
    <div className="toolbar">
      <Space>
        <Tooltip title="解析脚本">
          <Button
            type="text"
            icon={<CodeOutlined />}
            onClick={handleParse}
            disabled={!currentFile}
          >
            解析
          </Button>
        </Tooltip>

        <Tooltip title="语法检测">
          <Button
            type="text"
            icon={<BugOutlined />}
            onClick={handleCheck}
            disabled={!currentFile}
          >
            检测
          </Button>
        </Tooltip>

        <Tooltip title="格式化代码">
          <Button
            type="text"
            icon={<FileSearchOutlined />}
            onClick={handleFormat}
            disabled={!currentFile}
          >
            格式化
          </Button>
        </Tooltip>

        <Tooltip title="运行脚本">
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            disabled={!currentFile}
          >
            运行
          </Button>
        </Tooltip>
      </Space>

      <div style={{ flex: 1 }} />

      <Space>
        <Select
          value={currentFile?.language || 'javascript'}
          onChange={handleLanguageChange}
          style={{ width: 140 }}
          size="small"
          disabled={!currentFile}
        >
          {languages.map(lang => (
            <Option key={lang} value={lang}>
              {lang.charAt(0).toUpperCase() + lang.slice(1)}
            </Option>
          ))}
        </Select>

        <Tooltip title="版本历史">
          <Button
            type="text"
            icon={<HistoryOutlined />}
            onClick={handleVersionHistory}
            disabled={!currentFile}
          />
        </Tooltip>

        <Tooltip title="分享">
          <Button
            type="text"
            icon={<ShareAltOutlined />}
            onClick={handleShare}
            disabled={!currentFile}
          />
        </Tooltip>
      </Space>
    </div>
  );
}

export default Toolbar;
