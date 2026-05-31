import { useRef, useEffect, useState } from 'react';
import { Empty } from 'antd';
import * as monaco from 'monaco-editor';
import { useAppStore } from '@/store';
import TabBar from './TabBar';
import ASTViewer from './ASTViewer';

function EditorArea() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  
  const {
    currentFile,
    openFiles,
    updateFileContent,
    parseResult,
    activeTab,
    setActiveTab
  } = useAppStore();

  useEffect(() => {
    if (!containerRef.current || isEditorReady) return;

    const initEditor = async () => {
      const monacoInstance = await import('monaco-editor');
      monacoRef.current = monacoInstance;

      self.MonacoEnvironment = {
        getWorkerUrl: function (_moduleId, label) {
          if (label === 'json') {
            return '/monaco/json.worker.js';
          }
          if (label === 'css' || label === 'scss' || label === 'less') {
            return '/monaco/css.worker.js';
          }
          if (label === 'html' || label === 'handlebars' || label === 'razor') {
            return '/monaco/html.worker.js';
          }
          if (label === 'typescript' || label === 'javascript') {
            return '/monaco/ts.worker.js';
          }
          return '/monaco/editor.worker.js';
        }
      };

      monacoInstance.languages.register({ id: 'python' });
      monacoInstance.languages.setMonarchTokensProvider('python', {
        keywords: [
          'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
          'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
          'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
          'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
          'while', 'with', 'yield'
        ],
        tokenizer: {
          root: [
            [/[a-z_$][\w$]*/, {
              cases: {
                '@keywords': 'keyword',
                '@default': 'identifier'
              }
            }],
            [/".*?"/, 'string'],
            [/'.*?'/, 'string'],
            [/#.*$/, 'comment'],
            [/\d+/, 'number'],
          ]
        }
      });

      monacoInstance.languages.register({ id: 'rust' });
      monacoInstance.languages.register({ id: 'go' });
      monacoInstance.languages.register({ id: 'powershell' });
      monacoInstance.languages.register({ id: 'bash' });

      const editor = monacoInstance.editor.create(containerRef.current!, {
        value: '',
        language: 'javascript',
        theme: 'vs-dark',
        fontSize: 14,
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        lineNumbers: 'on',
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        bracketPairColorization: { enabled: true },
        formatOnPaste: true,
        formatOnType: true,
      });

      editor.onDidChangeModelContent(() => {
        if (currentFile && editorRef.current) {
          const newValue = editorRef.current.getValue();
          if (newValue !== currentFile.content) {
            updateFileContent(currentFile.id, newValue);
          }
        }
      });

      editorRef.current = editor;
      setIsEditorReady(true);
    };

    initEditor();

    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
      }
    };
  }, [isEditorReady]);

  useEffect(() => {
    if (!editorRef.current || !currentFile) return;

    const model = editorRef.current.getModel();
    if (model) {
      if (model.getValue() !== currentFile.content) {
        editorRef.current.setValue(currentFile.content);
      }
      
      const language = mapLanguage(currentFile.language);
      if (monacoRef.current) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [currentFile?.id, currentFile?.language]);

  useEffect(() => {
    if (!editorRef.current || !currentFile) return;
    
    const model = editorRef.current.getModel();
    if (model && model.getValue() !== currentFile.content) {
      editorRef.current.setValue(currentFile.content);
    }
  }, [currentFile?.content]);

  const mapLanguage = (lang: string): string => {
    const map: Record<string, string> = {
      javascript: 'javascript',
      typescript: 'typescript',
      python: 'python',
      rust: 'rust',
      go: 'go',
      bash: 'shell',
      powershell: 'powershell',
      sql: 'sql',
      json: 'json',
      yaml: 'yaml'
    };
    return map[lang] || 'plaintext';
  };

  if (openFiles.length === 0) {
    return (
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        background: '#1e1e1e' 
      }}>
        <TabBar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="打开一个文件开始编辑" />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (activeTab === 'ast' && parseResult) {
      return <ASTViewer result={parseResult} />;
    }
    
    return (
      <div 
        ref={containerRef} 
        style={{ 
          flex: 1, 
          width: '100%', 
          height: '100%',
          overflow: 'hidden'
        }} 
      />
    );
  };

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column',
      background: '#1e1e1e',
      overflow: 'hidden'
    }}>
      <TabBar />
      {renderContent()}
    </div>
  );
}

export default EditorArea;
