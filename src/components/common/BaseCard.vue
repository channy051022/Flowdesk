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
  <div class="bg-white dark:bg-[#1A1719] rounded-xl border border-[#F0E3E9] dark:border-[#2D252B] shadow-2xs overflow-hidden flex flex-col transition-colors duration-150">
    <!-- Card Header -->
    <header
      v-if="title || $slots.header || $slots.actions"
      :class="[
        'flex items-center justify-between border-b border-[#F0E3E9] dark:border-[#2D252B]',
        compact ? 'px-4 py-3' : 'px-5 py-3.5'
      ]"
    >
      <slot name="header">
        <div>
          <h3 class="text-sm font-bold text-[#3D2934] dark:text-[#F5EDF1] tracking-tight">
            {{ title }}
          </h3>
          <p v-if="subtitle" class="text-xs text-[#806B76] dark:text-[#BCAEBA] mt-0.5">
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
        'border-t border-[#F0E3E9] dark:border-[#2D252B] bg-[#FFF7FA]/50 dark:bg-[#1F191D]/50',
        compact ? 'px-4 py-2.5' : 'px-5 py-3'
      ]"
    >
      <slot name="footer" />
    </footer>
  </div>
</template>
