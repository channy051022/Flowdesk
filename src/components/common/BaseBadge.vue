<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'routine',
    validator: (v) => ['urgent', 'high', 'routine', 'forest', 'info', 'success', 'warning'].includes(v)
  },
  size: {
    type: String,
    default: 'sm',
    validator: (v) => ['xs', 'sm', 'md'].includes(v)
  },
  dot: {
    type: Boolean,
    default: false
  }
})

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'urgent':
      return {
        badge: 'bg-[#FFF0F5] dark:bg-[#331520] text-[#C2415D] dark:text-[#FB7185] border-[#F3C4D7] dark:border-[#4D2030]',
        dot: 'bg-[#C2415D] dark:bg-[#FB7185]'
      }
    case 'high':
    case 'warning':
      return {
        badge: 'bg-amber-50 dark:bg-[#33240D] text-[#B7791F] dark:text-[#FBBF24] border-amber-200 dark:border-[#4A3515]',
        dot: 'bg-[#B7791F] dark:bg-[#FBBF24]'
      }
    case 'forest':
    case 'rose':
      return {
        badge: 'bg-[#FFF7FA] dark:bg-[#2B1722] text-[#D9467B] dark:text-[#F472B6] border-[#F3C4D7] dark:border-[#482238]',
        dot: 'bg-[#D9467B] dark:bg-[#F472B6]'
      }
    case 'success':
      return {
        badge: 'bg-emerald-50 dark:bg-[#152E22] text-[#27845A] dark:text-[#4ADE80] border-emerald-200 dark:border-[#1E4632]',
        dot: 'bg-[#27845A] dark:bg-[#4ADE80]'
      }
    case 'info':
      return {
        badge: 'bg-sky-50 dark:bg-[#122438] text-[#4777B8] dark:text-[#60A5FA] border-sky-200 dark:border-[#1E3A5A]',
        dot: 'bg-[#4777B8] dark:bg-[#60A5FA]'
      }
    case 'routine':
    default:
      return {
        badge: 'bg-[#FAF4F7] dark:bg-[#241E23] text-[#806B76] dark:text-[#BCAEBA] border-[#F0E3E9] dark:border-[#382E36]',
        dot: 'bg-[#A18D98] dark:bg-[#8A7B87]'
      }
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'text-[10px] px-1.5 py-0.5 rounded'
    case 'md':
      return 'text-xs px-2.5 py-1 rounded-md'
    case 'sm':
    default:
      return 'text-[11px] px-2 py-0.5 rounded-md'
  }
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 font-medium border transition-colors',
      variantClasses.badge,
      sizeClasses
    ]"
  >
    <span
      v-if="dot"
      :class="['w-1.5 h-1.5 rounded-full shrink-0', variantClasses.dot]"
    />
    <slot />
  </span>
</template>
