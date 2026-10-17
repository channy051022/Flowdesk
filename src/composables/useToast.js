import { ref } from 'vue'

const toasts = ref([])
let toastCounter = 0

/**
 * Toast item shape:
 * {
 *   id: number,
 *   type: 'success' | 'info' | 'warning' | 'error',
 *   title: string,
 *   description?: string,
 *   duration?: number
 * }
 */

export function useToast() {
  const addToast = ({ type = 'info', title, description = '', duration = 4000 }) => {
    // Avoid exact duplicate toasts within 1 second
    const duplicate = toasts.value.find(
      (t) => t.title === title && t.description === description && t.type === type
    )
    if (duplicate) return duplicate.id

    const id = ++toastCounter
    const newToast = { id, type, title, description, duration }
    toasts.value.push(newToast)

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  const removeToast = (id) => {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx > -1) {
      toasts.value.splice(idx, 1)
    }
  }

  const success = (title, description = '', duration = 4000) => {
    return addToast({ type: 'success', title, description, duration })
  }

  const info = (title, description = '', duration = 4000) => {
    return addToast({ type: 'info', title, description, duration })
  }

  const warning = (title, description = '', duration = 5000) => {
    return addToast({ type: 'warning', title, description, duration })
  }

  const error = (title, description = '', duration = 5000) => {
    return addToast({ type: 'error', title, description, duration })
  }

  return {
    toasts,
    addToast,
    removeToast,
    success,
    info,
    warning,
    error
  }
}

// Global singleton instance for direct export
export const toast = {
  success: (title, description = '', duration = 4000) => useToast().success(title, description, duration),
  info: (title, description = '', duration = 4000) => useToast().info(title, description, duration),
  warning: (title, description = '', duration = 5000) => useToast().warning(title, description, duration),
  error: (title, description = '', duration = 5000) => useToast().error(title, description, duration),
  dismiss: (id) => useToast().removeToast(id)
}
