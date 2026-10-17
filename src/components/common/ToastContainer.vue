<script setup>
import { useToast } from '../../composables/useToast'
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  AlertCircle,
  X
} from 'lucide-vue-next'

const { toasts, removeToast } = useToast()

const getIcon = (type) => {
  switch (type) {
    case 'success':
      return CheckCircle2
    case 'warning':
      return AlertTriangle
    case 'error':
      return AlertCircle
    case 'info':
    default:
      return Info
  }
}

const getStyles = (type) => {
  switch (type) {
    case 'success':
      return {
        card: 'border-emerald-200 bg-white text-emerald-950 shadow-md',
        iconBg: 'bg-emerald-100 text-emerald-700',
        badge: 'text-emerald-700'
      }
    case 'warning':
      return {
        card: 'border-amber-200 bg-white text-amber-950 shadow-md',
        iconBg: 'bg-amber-100 text-amber-700',
        badge: 'text-amber-700'
      }
    case 'error':
      return {
        card: 'border-rose-200 bg-white text-rose-950 shadow-md',
        iconBg: 'bg-rose-100 text-rose-700',
        badge: 'text-rose-700'
      }
    case 'info':
    default:
      return {
        card: 'border-pink-200 bg-white text-[#3D2934] shadow-md',
        iconBg: 'bg-pink-100 text-[#D9467B]',
        badge: 'text-[#D9467B]'
      }
  }
}
</script>

<template>
  <div
    class="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    role="region"
    aria-label="Notifications"
  >
    <transition-group
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-4"
      enter-to-class="transform translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto rounded-xl border p-3.5 shadow-lg flex items-start gap-3 transition-all duration-200"
        :class="getStyles(item.type).card"
        role="alert"
      >
        <div
          class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs mt-0.5"
          :class="getStyles(item.type).iconBg"
        >
          <component :is="getIcon(item.type)" class="w-4 h-4" />
        </div>

        <div class="flex-1 min-w-0 pr-1">
          <p class="text-xs font-semibold leading-tight text-zinc-900">
            {{ item.title }}
          </p>
          <p v-if="item.description" class="text-[11px] text-zinc-600 mt-1 leading-snug">
            {{ item.description }}
          </p>
        </div>

        <button
          @click="removeToast(item.id)"
          type="button"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss notification"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition-group>
  </div>
</template>
