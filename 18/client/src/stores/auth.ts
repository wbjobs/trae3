import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api';

interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'analyst' | 'viewer';
  department: string;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));

  const isAdmin = computed(() => user.value?.role === 'admin');
  const isAnalyst = computed(() => user.value?.role === 'analyst' || isAdmin.value);
  const isViewer = computed(() => !!user.value);

  async function login(username: string, password: string) {
    const res: any = await authApi.login({ username, password });
    token.value = res.accessToken;
    user.value = res.user;
    localStorage.setItem('token', res.accessToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    return res;
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  async function fetchProfile() {
    const res: any = await authApi.profile();
    user.value = res;
    localStorage.setItem('user', JSON.stringify(res));
    return res;
  }

  return {
    token,
    user,
    isAdmin,
    isAnalyst,
    isViewer,
    login,
    logout,
    fetchProfile,
  };
});
