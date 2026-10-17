<script setup>
defineProps({
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  compact: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <div class="bg-white rounded-xl border border-[#F0E3E9] shadow-2xs overflow-hidden flex flex-col">
    <!-- Card Header -->
    <header
      v-if="title || $slots.header || $slots.actions"
      :class="[
        'flex items-center justify-between border-b border-[#F0E3E9]',
        compact ? 'px-4 py-3' : 'px-5 py-3.5'
      ]"
    >
      <slot name="header">
        <div>
          <h3 class="text-sm font-bold text-[#3D2934] tracking-tight">
            {{ title }}
          </h3>
          <p v-if="subtitle" class="text-xs text-[#806B76] mt-0.5">
            {{ subtitle }}
          </p>
        </div>
      </slot>

      <div v-if="$slots.actions" class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <!-- Card Body -->
    <div :class="['flex-1', compact ? 'p-4' : 'p-5']">
      <slot />
    </div>

    <!-- Card Footer -->
    <footer
      v-if="$slots.footer"
      :class="[
        'border-t border-[#F0E3E9] bg-[#FFF7FA]/50',
        compact ? 'px-4 py-2.5' : 'px-5 py-3'
      ]"
    >
      <slot name="footer" />
    </footer>
  </div>
</template>
