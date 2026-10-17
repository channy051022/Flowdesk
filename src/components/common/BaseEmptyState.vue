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
  <div class="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50">
    <div v-if="$slots.icon" class="w-12 h-12 rounded-xl bg-forest-50 border border-forest-100 flex items-center justify-center text-forest-800 mb-3.5 shadow-2xs">
      <slot name="icon" />
    </div>

    <h4 class="text-sm font-semibold text-zinc-900 mb-1">
      {{ title }}
    </h4>

    <p v-if="description" class="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed">
      {{ description }}
    </p>

    <div v-if="$slots.action" class="flex items-center gap-2 mt-1">
      <slot name="action" />
    </div>
  </div>
</template>
