<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'ghost', 'forest-subtle', 'danger'].includes(v)
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'button'
  }
})

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-[#D9467B] hover:bg-[#BE3568] text-white shadow-xs border border-[#BE3568]/20 focus:ring-[#D9467B]'
    case 'secondary':
      return 'bg-white dark:bg-[#1F191D] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] text-[#3D2934] dark:text-[#F5EDF1] border border-[#F0E3E9] dark:border-[#2D252B] shadow-2xs focus:ring-[#D9467B]'
    case 'ghost':
      return 'bg-transparent hover:bg-[#FFF7FA] dark:hover:bg-[#1F191D] text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] focus:ring-[#D9467B]'
    case 'forest-subtle':
      return 'bg-[#FFF7FA] dark:bg-[#251A21] hover:bg-[#FCE7F0] dark:hover:bg-[#2E1F29] text-[#D9467B] dark:text-[#F472B6] border border-[#F3C4D7] dark:border-[#4D3341] focus:ring-[#D9467B]'
    case 'danger':
      return 'bg-[#C2415D] hover:bg-[#A8324C] text-white shadow-xs focus:ring-[#C2415D]'
    default:
      return 'bg-[#D9467B] text-white'
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'text-xs px-2.5 py-1 rounded-md gap-1.5 h-7 leading-none'
    case 'lg':
      return 'text-sm px-4 py-2 rounded-lg gap-2 h-9 leading-none'
    case 'md':
    default:
      return 'text-xs font-medium px-3 py-1.5 rounded-lg gap-1.5 h-8 leading-none'
  }
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1',
      variantClasses,
      sizeClasses
    ]"
  >
    <slot />
  </button>
</template>
