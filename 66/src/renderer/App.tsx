import React, { useState, useEffect, useCallback } from 'react';
import { X, Home } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { Sidebar } from '@/components/Sidebar';
import { Toolbar } from '@/components/Toolbar';
import { FileTree } from '@/components/FileTree';
import { EditorTabs } from '@/components/EditorTabs';
import { CodeEditor } from '@/components/CodeEditor';
import { ValidationPanel } from '@/components/ValidationPanel';
import { CloudPanel } from '@/components/CloudPanel';
import { VersionsPanel } from '@/components/VersionsPanel';
import { ProjectList } from '@/components/ProjectList';
import { NewProjectDialog } from '@/components/NewProjectDialog';
import { ProjectFile } from '../shared/types';
import '@/styles/theme.css';

function App() {
  const {
    projects,
    currentProject,
    openFiles,
    activeFileId,
    validationResults,
    cloudProjects,
    versions,
    syncStatus,
    config,
    isLoading,
    error,
    activePanel,
    loadProjects,
    createProject,
    openProject,
    deleteProject,
    closeProject,
    openFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    createNewFile,
    pullFromCloud,
    loadCloudProjects,
    getSyncStatus,
    loadConfig,
    setActivePanel,
    setError,
  } = useAppStore();

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [currentSyncStatus, setCurrentSyncStatus] = useState(null);

  useEffect(() => {
    loadProjects();
    loadCloudProjects();
    loadConfig();
  }, []);

  useEffect(() => {
    if (currentProject) {
      const interval = setInterval(async () => {
        const status = await getSyncStatus(currentProject.id);
        setCurrentSyncStatus(status);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleCreateProject = async (name: string, description: string) => {
    const project = await createProject(name, description);
    if (project) {
      setShowNewProjectDialog(false);
      await createNewFile('README.md', 'README.md', `# ${name}\n\n${description || ''}`);
    }
  };

  const handleNewFile = useCallback(() => {
    if (!currentProject) return;
    const name = prompt('请输入文件名（包含路径，如：src/main.ts）');
    if (name) {
      createNewFile(name.split('/').pop() || name, name, '');
    }
  }, [currentProject, createNewFile]);

  const handleFileSelect = useCallback(
    (file: ProjectFile) => {
      openFile(file);
    },
    [openFile]
  );

  const handleFileContentChange = useCallback(
    (fileId: string, content: string) => {
      updateFileContent(fileId, content);
    },
    [updateFileContent]
  );

  const handleValidationErrorClick = useCallback(
    (fileId: string, line: number, column: number) => {
      const file = currentProject?.files.find((f) => f.id === fileId);
      if (file) {
        openFile(file);
      }
    },
    [currentProject, openFile]
  );

  const handleCloudPull = useCallback(
    async (cloudId: string) => {
      await pullFromCloud(cloudId);
    },
    [pullFromCloud]
  );

  const activeFile = openFiles.find((f) => f.id === activeFileId);
  const totalErrors = validationResults.reduce((sum, r) => sum + r.errors.length, 0);

  if (!currentProject) {
    return (
      <div className="h-full w-full flex flex-col">
        {error && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-700 rounded">
              <X size={16} />
            </button>
          </div>
        )}
        <ProjectList
          projects={projects}
          onProjectSelect={openProject}
          onProjectDelete={deleteProject}
          onNewProject={() => setShowNewProjectDialog(true)}
          isLoading={isLoading}
        />
        <NewProjectDialog
          isOpen={showNewProjectDialog}
          onClose={() => setShowNewProjectDialog(false)}
          onCreate={handleCreateProject}
          isLoading={isLoading}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 text-white">
      {error && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-700 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      <Toolbar
        currentProject={currentProject}
        syncStatus={currentSyncStatus}
        onNewProject={() => setShowNewProjectDialog(true)}
        onNewFile={handleNewFile}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          validationErrorCount={totalErrors}
        />

        <div className="w-64 border-r border-gray-700 flex-shrink-0 flex flex-col overflow-hidden">
          {activePanel === 'files' && (
            <FileTree
              files={currentProject.files}
              onFileSelect={handleFileSelect}
              activeFileId={activeFileId}
            />
          )}
          {activePanel === 'cloud' && (
            <CloudPanel
              projects={cloudProjects}
              currentProject={currentProject}
              onPull={handleCloudPull}
            />
          )}
          {activePanel === 'versions' && (
            <VersionsPanel versions={versions} currentProject={currentProject} />
          )}
          {activePanel === 'validation' && (
            <ValidationPanel
              results={validationResults}
              files={currentProject.files}
              onFileClick={handleFileSelect}
              onErrorClick={handleValidationErrorClick}
            />
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <button
                onClick={closeProject}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                title="返回项目列表"
              >
                <Home size={16} />
              </button>
              <span className="text-sm font-medium text-gray-200">{currentProject.name}</span>
              {currentProject.description && (
                <span className="text-xs text-gray-500">— {currentProject.description}</span>
              )}
            </div>
            {currentProject.cloudId && (
              <span className="text-xs text-gray-500">
                云端ID: {currentProject.cloudId.substring(0, 8)}...
              </span>
            )}
          </div>

          <EditorTabs
            files={openFiles}
            activeFileId={activeFileId}
            onTabClick={setActiveFile}
            onTabClose={closeFile}
          />

          <div className="flex-1 overflow-hidden">
            {activeFile ? (
              <CodeEditor
                key={activeFile.id}
                file={activeFile}
                onChange={(content) => handleFileContentChange(activeFile.id, content)}
                fontSize={config?.fontSize || 14}
                tabSize={config?.tabSize || 2}
                theme={config?.theme || 'dark'}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">📂</div>
                  <p className="text-lg mb-2">选择一个文件开始编辑</p>
                  <p className="text-sm">
                    从左侧文件树中选择文件，或点击 + 创建新文件
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <NewProjectDialog
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
        onCreate={handleCreateProject}
        isLoading={isLoading}
      />
    </div>
  );
}

export default App;
