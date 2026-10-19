import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const THEME_PREFERENCES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
}

export const useThemeStore = defineStore('theme', () => {
  // Retrieve saved preference or default to 'light'
  const getInitialPreference = () => {
    if (typeof localStorage === 'undefined') return 'light'
    try {
      const saved = localStorage.getItem('flowdesk_theme')
      if (saved === 'dark' || saved === 'system' || saved === 'light') {
        return saved
      }
    } catch (_) {}
    return 'light'
  }

  const preference = ref(getInitialPreference())

  // System OS theme detector
  const isSystemDark = ref(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )

  // Resolved active theme ('light' or 'dark')
  const resolvedTheme = computed(() => {
    if (preference.value === 'system') {
      return isSystemDark.value ? 'dark' : 'light'
    }
    return preference.value === 'dark' ? 'dark' : 'light'
  })

  const isDark = computed(() => resolvedTheme.value === 'dark')

  // Apply theme class and data-theme attribute to <html> root
  const applyTheme = () => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const theme = resolvedTheme.value

    if (theme === 'dark') {
      root.classList.add('dark')
      root.setAttribute('data-theme', 'dark')
      root.style.colorScheme = 'dark'
    } else {
      root.classList.remove('dark')
      root.setAttribute('data-theme', 'light')
      root.style.colorScheme = 'light'
    }
  }

  // Set explicit preference: 'light' | 'dark' | 'system'
  const setPreference = (newPref) => {
    if (!['light', 'dark', 'system'].includes(newPref)) return
    preference.value = newPref
    try {
      localStorage.setItem('flowdesk_theme', newPref)
    } catch (_) {}
    applyTheme()
  }

  // Quick toggle (switches between light and dark)
  const toggleTheme = () => {
    setPreference(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  }

  // Media query listener reference
  let mediaQuery = null

  const handleSystemChange = (e) => {
    isSystemDark.value = e.matches
    if (preference.value === 'system') {
      applyTheme()
    }
  }

  const initTheme = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      isSystemDark.value = mediaQuery.matches

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemChange)
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleSystemChange)
      }
    }
    applyTheme()
  }

  const cleanupTheme = () => {
    if (mediaQuery) {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemChange)
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(handleSystemChange)
      }
      mediaQuery = null
    }
  }

  return {
    preference,
    resolvedTheme,
    isDark,
    isSystemDark,
    setPreference,
    toggleTheme,
    applyTheme,
    initTheme,
    cleanupTheme
  }
})
