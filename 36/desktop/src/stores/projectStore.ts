import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FirmwareProject, BuildRecord, BuildTask, BuildOptions } from '@shared/types';
import { generateId } from '@shared/utils';

const STORAGE_KEY = 'firmware_projects';

export const useProjectStore = defineStore('project', () => {
  const projects = ref<FirmwareProject[]>([]);
  const currentProjectId = ref<string | null>(null);
  const buildTasks = ref<BuildTask[]>([]);
  const buildHistory = ref<BuildRecord[]>([]);

  const currentProject = computed(() =>
    projects.value.find((p) => p.id === currentProjectId.value) || null
  );

  const projectCount = computed(() => projects.value.length);

  const successBuildCount = computed(() =>
    buildHistory.value.filter((b) => b.status === 'success').length
  );

  const failedBuildCount = computed(() =>
    buildHistory.value.filter((b) => b.status === 'failed').length
  );

  async function loadProjects() {
    try {
      const data = await window.electronAPI.fs.readFile(
        await getStoragePath(),
        'utf-8'
      );
      if (data) {
        projects.value = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      projects.value = [];
    }
  }

  async function saveProjects() {
    try {
      const storagePath = await getStoragePath();
      await window.electronAPI.fs.writeFile(
        storagePath,
        JSON.stringify(projects.value, null, 2)
      );
    } catch (error) {
      console.error('Failed to save projects:', error);
    }
  }

  async function getStoragePath(): Promise<string> {
    const userDataPath = await window.electronAPI.app.getPath('userData');
    return window.electronAPI.path.join(userDataPath, `${STORAGE_KEY}.json`);
  }

  function addProject(project: Omit<FirmwareProject, 'id' | 'createdAt' | 'updatedAt' | 'tags'>) {
    const newProject: FirmwareProject = {
      ...project,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: []
    };
    projects.value.push(newProject);
    saveProjects();
    return newProject;
  }

  function updateProject(id: string, updates: Partial<FirmwareProject>) {
    const index = projects.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      projects.value[index] = {
        ...projects.value[index],
        ...updates,
        updatedAt: Date.now()
      };
      saveProjects();
    }
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id);
    if (currentProjectId.value === id) {
      currentProjectId.value = null;
    }
    saveProjects();
  }

  function setCurrentProject(id: string | null) {
    currentProjectId.value = id;
  }

  function getProjectById(id: string) {
    return projects.value.find((p) => p.id === id);
  }

  function importProjects(importedProjects: Omit<FirmwareProject, 'id' | 'createdAt' | 'updatedAt'>[]) {
    const newProjects = importedProjects.map((p) => ({
      ...p,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    projects.value.push(...newProjects);
    saveProjects();
    return newProjects;
  }

  function addBuildTask(task: Omit<BuildTask, 'id'>) {
    const newTask: BuildTask = {
      ...task,
      id: generateId()
    };
    buildTasks.value.push(newTask);
    return newTask;
  }

  function updateBuildTask(id: string, updates: Partial<BuildTask>) {
    const index = buildTasks.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      buildTasks.value[index] = {
        ...buildTasks.value[index],
        ...updates
      };
    }
  }

  function addBuildRecord(record: BuildRecord) {
    buildHistory.value.unshift(record);
    
    const project = projects.value.find((p) => p.id === record.projectId);
    if (project) {
      project.lastBuild = record;
      project.updatedAt = Date.now();
      saveProjects();
    }
    
    if (buildHistory.value.length > 100) {
      buildHistory.value = buildHistory.value.slice(0, 100);
    }
  }

  function getBuildHistory(projectId?: string) {
    if (projectId) {
      return buildHistory.value.filter((b) => b.projectId === projectId);
    }
    return buildHistory.value;
  }

  function updateBuildRecord(projectId: string, updatedRecord: BuildRecord) {
    const index = buildHistory.value.findIndex((b) => b.id === updatedRecord.id);
    if (index !== -1) {
      buildHistory.value[index] = updatedRecord;
      
      const project = projects.value.find((p) => p.id === projectId);
      if (project && project.lastBuild?.id === updatedRecord.id) {
        project.lastBuild = updatedRecord;
        saveProjects();
      }
    }
  }

  function getBuildRecordById(buildId: string) {
    return buildHistory.value.find((b) => b.id === buildId);
  }

  function searchProjects(keyword: string) {
    if (!keyword) return projects.value;
    const lower = keyword.toLowerCase();
    return projects.value.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower) ||
        p.tags.some((t) => t.toLowerCase().includes(lower))
    );
  }

  function filterProjectsByType(type: FirmwareProject['type']) {
    return projects.value.filter((p) => p.type === type);
  }

  return {
    projects,
    currentProjectId,
    currentProject,
    buildTasks,
    buildHistory,
    projectCount,
    successBuildCount,
    failedBuildCount,
    loadProjects,
    saveProjects,
    addProject,
    updateProject,
    deleteProject,
    setCurrentProject,
    getProjectById,
    importProjects,
    addBuildTask,
    updateBuildTask,
    addBuildRecord,
    getBuildHistory,
    updateBuildRecord,
    getBuildRecordById,
    searchProjects,
    filterProjectsByType
  };
});
