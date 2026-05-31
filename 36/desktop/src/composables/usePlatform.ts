import { ref, onMounted, onUnmounted, computed } from 'vue';

interface PlatformInfo {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  platform: string;
  isDark: boolean;
  isCompact: boolean;
  windowWidth: number;
  windowHeight: number;
}

const platformRef = ref<PlatformInfo>({
  isMac: false,
  isWindows: false,
  isLinux: false,
  platform: 'unknown',
  isDark: false,
  isCompact: false,
  windowWidth: 1280,
  windowHeight: 720
});

let initialized = false;
const listeners: (() => void)[] = [];

function updatePlatform() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  
  platformRef.value.windowWidth = w;
  platformRef.value.windowHeight = h;
  platformRef.value.isCompact = w < 1024;
  platformRef.value.isDark = document.documentElement.classList.contains('dark');
}

export function usePlatform() {
  if (!initialized) {
    onMounted(async () => {
      try {
        const p = await window.electronAPI.process.platform();
        platformRef.value.platform = p;
        platformRef.value.isMac = p === 'darwin';
        platformRef.value.isWindows = p === 'win32';
        platformRef.value.isLinux = p === 'linux';

        document.documentElement.setAttribute('data-platform', p);
      } catch {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('mac')) {
          platformRef.value.platform = 'darwin';
          platformRef.value.isMac = true;
        } else if (ua.includes('linux')) {
          platformRef.value.platform = 'linux';
          platformRef.value.isLinux = true;
        } else {
          platformRef.value.platform = 'win32';
          platformRef.value.isWindows = true;
        }
        document.documentElement.setAttribute('data-platform', platformRef.value.platform);
      }

      updatePlatform();
      
      const resizeHandler = () => updatePlatform();
      window.addEventListener('resize', resizeHandler);
      listeners.push(() => window.removeEventListener('resize', resizeHandler));

      const observer = new MutationObserver(() => {
        platformRef.value.isDark = document.documentElement.classList.contains('dark');
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      listeners.push(() => observer.disconnect());

      initialized = true;
    });

    onUnmounted(() => {
      listeners.forEach(fn => fn());
      listeners.length = 0;
    });
  }

  const sidebarWidth = computed(() => {
    if (platformRef.value.isCompact) return 60;
    return 220;
  });

  const titleBarHeight = computed(() => {
    if (platformRef.value.isMac) return 38;
    return 48;
  });

  const fontSize = computed(() => {
    if (platformRef.value.isCompact) return 13;
    return 14;
  });

  const layoutMode = computed(() => {
    if (platformRef.value.windowWidth < 768) return 'mobile';
    if (platformRef.value.windowWidth < 1024) return 'compact';
    return 'desktop';
  });

  const showSidebarLabels = computed(() => {
    return layoutMode.value !== 'compact';
  });

  const contentPadding = computed(() => {
    if (layoutMode.value === 'mobile') return '12px';
    if (layoutMode.value === 'compact') return '16px';
    return '24px';
  });

  return {
    platform: platformRef,
    sidebarWidth,
    titleBarHeight,
    fontSize,
    layoutMode,
    showSidebarLabels,
    contentPadding,
    isCompact: computed(() => platformRef.value.isCompact),
    isMobile: computed(() => layoutMode.value === 'mobile'),
    isDark: computed(() => platformRef.value.isDark)
  };
}
