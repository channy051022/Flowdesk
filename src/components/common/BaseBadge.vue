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
        badge: 'bg-[#FFF0F5] text-[#C2415D] border-[#F3C4D7]',
        dot: 'bg-[#C2415D]'
      }
    case 'high':
    case 'warning':
      return {
        badge: 'bg-amber-50 text-[#B7791F] border-amber-200',
        dot: 'bg-[#B7791F]'
      }
    case 'forest':
    case 'rose':
      return {
        badge: 'bg-[#FFF7FA] text-[#D9467B] border-[#F3C4D7]',
        dot: 'bg-[#D9467B]'
      }
    case 'success':
      return {
        badge: 'bg-emerald-50 text-[#27845A] border-emerald-200',
        dot: 'bg-[#27845A]'
      }
    case 'info':
      return {
        badge: 'bg-sky-50 text-[#4777B8] border-sky-200',
        dot: 'bg-[#4777B8]'
      }
    case 'routine':
    default:
      return {
        badge: 'bg-[#FAF4F7] text-[#806B76] border-[#F0E3E9]',
        dot: 'bg-[#A18D98]'
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
