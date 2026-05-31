import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import Editor, { OnChange, Monaco } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { ProjectFile } from '../../shared/types';
import { useAppStore } from '@/store/useAppStore';
import { debounce } from '../../shared/utils';

interface CodeEditorProps {
  file: ProjectFile;
  onChange: (content: string) => void;
  fontSize?: number;
  tabSize?: number;
  theme?: 'light' | 'dark';
}

const CodeEditorComponent: React.FC<CodeEditorProps> = ({
  file,
  onChange,
  fontSize = 14,
  tabSize = 2,
  theme = 'dark',
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const fileRef = useRef<ProjectFile>(file);
  const themeDefinedRef = useRef(false);

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  const editorOptions = useMemo<editor.IStandaloneEditorConstructionOptions>(() => ({
    fontSize,
    tabSize,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontLigatures: true,
    lineNumbers: 'on',
    minimap: { enabled: true, side: 'right' },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    wrappingIndent: 'indent',
    formatOnPaste: true,
    formatOnType: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoIndent: 'full',
    bracketPairColorization: { enabled: true },
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    smoothScrolling: true,
    renderWhitespace: 'selection',
    renderLineHighlight: 'all',
    selectOnLineNumbers: true,
    hover: { enabled: true },
    parameterHints: { enabled: true },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    quickSuggestions: true,
    folding: true,
    foldingHighlight: true,
    links: true,
    colorDecorators: true,
  }), [fontSize, tabSize]);

  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monacoInstance;

      if (!themeDefinedRef.current) {
        monacoInstance.editor.defineTheme('project-studio-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#1e1e1e',
            'editor.foreground': '#d4d4d4',
            'editor.lineHighlightBackground': '#2d2d2d',
            'editor.selectionBackground': '#264f78',
            'editorCursor.foreground': '#aeafad',
            'editorWhitespace.foreground': '#3b3b3b',
            'editorIndentGuide.background': '#404040',
            'editorLineNumber.foreground': '#858585',
            'editorLineNumber.activeForeground': '#c6c6c6',
          },
        });
        themeDefinedRef.current = true;
      }

      editorInstance.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
        () => {
          useAppStore.getState().saveProject();
        }
      );

      editorInstance.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyV,
        () => {
          const currentFile = fileRef.current;
          const content = editorInstance.getValue();
          const updatedFile = { ...currentFile, content };
          useAppStore.getState().validateFile(updatedFile);
        }
      );
    },
    []
  );

  const debouncedValidate = useMemo(
    () => debounce((fileId: string, content: string) => {
      const currentFile = fileRef.current;
      const updatedFile = { ...currentFile, content };
      useAppStore.getState().validateFile(updatedFile);
    }, 2000),
    []
  );

  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        onChange(value);
        debouncedValidate(fileRef.current.id, value);
      }
    },
    [onChange, debouncedValidate]
  );

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const results = useAppStore.getState().validationResults;
    const fileResult = results.find((r) => r.fileId === file.id);

    if (!fileResult) {
      monacoRef.current.editor.setModelMarkers(model, 'owner', []);
      return;
    }

    const markers: editor.IMarkerData[] = [];
    fileResult.errors.forEach((err) => {
      markers.push({
        startLineNumber: err.line,
        startColumn: err.column,
        endLineNumber: err.line,
        endColumn: err.column + 10,
        severity: 8,
        message: err.message,
        source: err.ruleId,
      });
    });

    fileResult.warnings.forEach((warn) => {
      markers.push({
        startLineNumber: warn.line,
        startColumn: warn.column,
        endLineNumber: warn.line,
        endColumn: warn.column + 10,
        severity: 4,
        message: warn.message,
        source: warn.ruleId,
      });
    });

    monacoRef.current.editor.setModelMarkers(model, 'owner', markers);
  }, [file.id]);

  const editorTheme = useMemo(() => 
    theme === 'dark' ? 'project-studio-dark' : 'light',
    [theme]
  );

  return (
    <div className="w-full h-full">
      <Editor
        key={file.id}
        height="100%"
        language={file.language}
        value={file.content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={editorTheme}
        options={editorOptions}
        loading={<div className="w-full h-full flex items-center justify-center text-gray-500">加载编辑器...</div>}
      />
    </div>
  );
};

export const CodeEditor = React.memo(CodeEditorComponent, (prev, next) => {
  return (
    prev.file.id === next.file.id &&
    prev.file.content === next.file.content &&
    prev.file.language === next.file.language &&
    prev.fontSize === next.fontSize &&
    prev.tabSize === next.tabSize &&
    prev.theme === next.theme
  );
});
