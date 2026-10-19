<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-zinc-200 dark:border-[#2D252B] bg-zinc-50/50 dark:bg-[#1F191D]/50 transition-colors">
    <div v-if="$slots.icon" class="w-12 h-12 rounded-xl bg-forest-50 dark:bg-[#2B1822] border border-forest-100 dark:border-[#4D3341] flex items-center justify-center text-forest-800 dark:text-[#F472B6] mb-3.5 shadow-2xs">
      <slot name="icon" />
    </div>

    <h4 class="text-sm font-semibold text-zinc-900 dark:text-[#F5EDF1] mb-1">
      {{ title }}
    </h4>

    <p v-if="description" class="text-xs text-zinc-500 dark:text-[#BCAEBA] max-w-sm mb-4 leading-relaxed">
      {{ description }}
    </p>

    <div v-if="$slots.action" class="flex items-center gap-2 mt-1">
      <slot name="action" />
    </div>
  </div>
</template>
