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
      return 'bg-white hover:bg-[#FFF7FA] text-[#3D2934] border border-[#F0E3E9] shadow-2xs focus:ring-[#D9467B]'
    case 'ghost':
      return 'bg-transparent hover:bg-[#FFF7FA] text-[#806B76] hover:text-[#3D2934] focus:ring-[#D9467B]'
    case 'forest-subtle':
      return 'bg-[#FFF7FA] hover:bg-[#FCE7F0] text-[#D9467B] border border-[#F3C4D7] focus:ring-[#D9467B]'
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
