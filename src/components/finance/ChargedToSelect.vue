<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  CHARGED_TO_GROUPS,
  ALL_CHARGED_TO_OPTIONS,
  normalizeChargedTo,
  getChargeCategory
} from '../../constants/chargedToOptions'
import {
  Search,
  X,
  ChevronDown,
  Check,
  Tag,
  Plus,
  AlertCircle
} from 'lucide-vue-next'

const props = defineProps({
  modelValue: {
    type: [Array, String],
    default: () => []
  },
  id: {
    type: String,
    default: 'chargedToSelect'
  },
  placeholder: {
    type: String,
    default: 'Select one or more MOOE / LFP categories...'
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const searchQuery = ref('')
const containerRef = ref(null)
const searchInputRef = ref(null)
const customInput = ref('')
const showCustomInput = ref(false)

// Internal normalized selected array of strings
const selectedValues = computed(() => {
  return normalizeChargedTo(props.modelValue)
})

// Check if an option is currently selected
const isSelected = (val) => {
  return selectedValues.value.includes(val)
}

// Toggle an option in the selection list
const toggleOption = (val) => {
  if (props.disabled) return
  const current = [...selectedValues.value]
  const idx = current.indexOf(val)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(val)
  }
  emit('update:modelValue', current)
}

// Remove single chip
const removeOption = (val) => {
  if (props.disabled) return
  const current = selectedValues.value.filter((item) => item !== val)
  emit('update:modelValue', current)
}

// Clear all selections
const clearAll = () => {
  if (props.disabled) return
  emit('update:modelValue', [])
}

// Add custom tag if not matching predefined
const addCustomOption = () => {
  const trimmed = customInput.value.trim()
  if (!trimmed) return
  if (!selectedValues.value.includes(trimmed)) {
    emit('update:modelValue', [...selectedValues.value, trimmed])
  }
  customInput.value = ''
  showCustomInput.value = false
}

// Filtered groups based on search query
const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    return CHARGED_TO_GROUPS
  }
  return CHARGED_TO_GROUPS.map((group) => {
    const matched = group.options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.category.toLowerCase().includes(q)
    )
    return {
      ...group,
      options: matched
    }
  }).filter((group) => group.options.length > 0)
})

const totalFilteredOptions = computed(() => {
  return filteredGroups.value.reduce((acc, g) => acc + g.options.length, 0)
})

// Identify any currently selected values that do not exist in predefined list (legacy / custom)
const customSelectedValues = computed(() => {
  const predefinedValues = ALL_CHARGED_TO_OPTIONS.map((o) => o.value)
  return selectedValues.value.filter((val) => !predefinedValues.includes(val))
})

// Toggle dropdown open/close
const toggleDropdown = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    setTimeout(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus()
      }
    }, 50)
  }
}

// Close when clicking outside
const handleClickOutside = (e) => {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    isOpen.value = false
    showCustomInput.value = false
  }
}

// Keyboard navigation
const handleKeyDown = (e) => {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
    e.stopPropagation()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full text-xs">
    <!-- Trigger Box with Selected Chips & Toggle Arrow -->
    <div
      @click="toggleDropdown"
      :class="[
        'min-h-[38px] w-full px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2',
        isOpen
          ? 'border-[#D9467B] ring-2 ring-[#D9467B]/20 bg-white'
          : 'border-[#F0E3E9] bg-white hover:border-[#D9467B]/50'
      ]"
      tabindex="0"
      @keydown.enter.prevent="toggleDropdown"
      @keydown.space.prevent="toggleDropdown"
      role="combobox"
      :aria-expanded="isOpen"
      :aria-controls="id + '-dropdown'"
    >
      <!-- Selected Chips Display -->
      <div class="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        <template v-if="selectedValues.length > 0">
          <span
            v-for="item in selectedValues"
            :key="item"
            :class="[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors max-w-full',
              getChargeCategory(item) === 'MOOE'
                ? 'bg-[#FDF2F8] text-[#9D174D] border-[#FBCFE8]'
                : getChargeCategory(item) === 'LFP'
                ? 'bg-[#FAF5FF] text-[#6B21A8] border-[#E9D5FF]'
                : 'bg-zinc-100 text-zinc-700 border-zinc-200'
            ]"
            @click.stop
          >
            <span class="truncate max-w-[200px]" :title="item">{{ item }}</span>
            <button
              @click.stop="removeOption(item)"
              type="button"
              class="p-0.5 rounded-full hover:bg-black/10 transition-colors text-current shrink-0 cursor-pointer"
              :aria-label="'Remove ' + item"
            >
              <X class="w-3 h-3" />
            </button>
          </span>
        </template>

        <span v-else class="text-[#A18D98] select-none text-xs">
          {{ placeholder }}
        </span>
      </div>

      <!-- Action Icons: Clear All & Caret -->
      <div class="flex items-center gap-1 shrink-0 text-[#806B76]">
        <button
          v-if="selectedValues.length > 0"
          @click.stop="clearAll"
          type="button"
          class="p-1 rounded text-[#A18D98] hover:text-[#C2415D] hover:bg-rose-50 transition-colors"
          title="Clear all selections"
        >
          <X class="w-3.5 h-3.5" />
        </button>

        <div class="p-0.5">
          <ChevronDown
            class="w-4 h-4 transition-transform duration-200"
            :class="isOpen ? 'rotate-180 text-[#D9467B]' : ''"
          />
        </div>
      </div>
    </div>

    <!-- Dropdown Menu -->
    <transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="transform opacity-0 scale-95 -translate-y-1"
      enter-to-class="transform opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="transform opacity-100 scale-100 translate-y-0"
      leave-to-class="transform opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="isOpen"
        :id="id + '-dropdown'"
        class="absolute z-50 mt-1.5 w-full bg-white rounded-xl shadow-xl border border-[#F0E3E9] overflow-hidden flex flex-col max-h-80 animate-in"
      >
        <!-- Search Bar Header -->
        <div class="p-2.5 border-b border-[#F0E3E9] bg-[#FFF7FA] flex items-center gap-2 shrink-0">
          <div class="relative flex-1">
            <Search class="w-3.5 h-3.5 text-[#A18D98] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Search MOOE or LFP category..."
              class="w-full pl-8 pr-7 py-1.5 bg-white border border-[#F0E3E9] rounded-lg text-xs text-[#3D2934] placeholder:text-[#A18D98] focus:outline-none focus:ring-2 focus:ring-[#D9467B] focus:border-transparent"
              @keydown.stop
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-[#A18D98] hover:text-[#3D2934]"
            >
              <X class="w-3 h-3" />
            </button>
          </div>

          <!-- Add Custom Category Toggle -->
          <button
            @click="showCustomInput = !showCustomInput"
            type="button"
            class="px-2 py-1.5 rounded-lg border border-[#F0E3E9] bg-white hover:bg-[#FDF2F7] text-[11px] font-medium text-[#D9467B] transition-colors shrink-0 inline-flex items-center gap-1 cursor-pointer"
            title="Add a custom or legacy charge category"
          >
            <Plus class="w-3 h-3" />
            <span>Custom</span>
          </button>
        </div>

        <!-- Custom Input Bar -->
        <div
          v-if="showCustomInput"
          class="p-2 bg-[#FDF2F7] border-b border-[#F0E3E9] flex items-center gap-2 shrink-0"
        >
          <input
            v-model="customInput"
            type="text"
            placeholder="Type custom charge and click Add..."
            class="flex-1 px-2.5 py-1 text-xs bg-white border border-[#F0E3E9] rounded-md text-[#3D2934] focus:outline-none focus:ring-1 focus:ring-[#D9467B]"
            @keydown.enter.prevent="addCustomOption"
          />
          <button
            @click="addCustomOption"
            type="button"
            class="px-2.5 py-1 rounded-md bg-[#D9467B] hover:bg-[#B83260] text-white text-xs font-medium cursor-pointer"
          >
            Add
          </button>
        </div>

        <!-- Options Scrollable Container -->
        <div class="overflow-y-auto p-1.5 divide-y divide-zinc-50 flex-1 space-y-2">
          <!-- Active Custom / Legacy Selections Section -->
          <div v-if="customSelectedValues.length > 0" class="pb-1.5 space-y-1">
            <div class="px-2 pt-1 text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center justify-between">
              <span>Custom / Legacy Selections</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">Preserved</span>
            </div>
            <div
              v-for="customVal in customSelectedValues"
              :key="customVal"
              class="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-amber-50/60 text-xs text-[#3D2934]"
            >
              <span class="truncate pr-2 font-medium">{{ customVal }}</span>
              <button
                @click="removeOption(customVal)"
                type="button"
                class="text-xs text-rose-600 hover:text-rose-800 p-0.5 hover:bg-rose-50 rounded"
                title="Remove custom category"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Grouped Predefined Options -->
          <template v-if="filteredGroups.length > 0">
            <div
              v-for="group in filteredGroups"
              :key="group.group"
              class="pt-1.5 first:pt-0 space-y-1"
            >
              <!-- Group Section Header -->
              <div class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between"
                :class="group.group === 'MOOE' ? 'text-[#9D174D] bg-[#FDF2F8]/70 rounded-md' : 'text-[#6B21A8] bg-[#FAF5FF]/70 rounded-md'"
              >
                <span>{{ group.label }}</span>
                <span class="text-[10px] font-mono font-normal opacity-75">
                  {{ group.options.length }} option{{ group.options.length !== 1 ? 's' : '' }}
                </span>
              </div>

              <!-- Options List in Group -->
              <div class="space-y-0.5">
                <div
                  v-for="opt in group.options"
                  :key="opt.id"
                  @click="toggleOption(opt.value)"
                  :class="[
                    'w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer flex items-center justify-between gap-2',
                    isSelected(opt.value)
                      ? 'bg-[#FDF2F8] text-[#831843] font-semibold'
                      : 'text-[#3D2934] hover:bg-[#FFF7FA]'
                  ]"
                  role="option"
                  :aria-selected="isSelected(opt.value)"
                >
                  <span class="leading-relaxed flex-1">{{ opt.label }}</span>
                  <div
                    :class="[
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      isSelected(opt.value)
                        ? 'bg-[#D9467B] border-[#D9467B] text-white shadow-2xs'
                        : 'border-[#F0E3E9] bg-white'
                    ]"
                  >
                    <Check v-if="isSelected(opt.value)" class="w-3 h-3 stroke-[2.5]" />
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Empty State when search matches nothing -->
          <div
            v-else
            class="py-6 px-4 text-center text-xs text-[#806B76] space-y-2"
          >
            <div class="w-8 h-8 rounded-full bg-[#FFF7FA] text-[#D9467B] flex items-center justify-center mx-auto">
              <Search class="w-4 h-4" />
            </div>
            <p>No matching categories found for "<strong class="text-[#3D2934]">{{ searchQuery }}</strong>"</p>
            <button
              v-if="searchQuery"
              @click="customInput = searchQuery; showCustomInput = true; addCustomOption()"
              type="button"
              class="text-xs text-[#D9467B] hover:underline font-medium cursor-pointer inline-flex items-center gap-1"
            >
              <Plus class="w-3 h-3" />
              <span>Add "{{ searchQuery }}" as custom category</span>
            </button>
          </div>
        </div>

        <!-- Footer Info: Total Selected -->
        <div class="px-3 py-2 border-t border-[#F0E3E9] bg-[#FFF7FA] flex items-center justify-between text-[11px] text-[#806B76] shrink-0">
          <span>
            Selected: <strong class="text-[#3D2934]">{{ selectedValues.length }}</strong>
          </span>
          <button
            @click="isOpen = false"
            type="button"
            class="px-2.5 py-1 rounded bg-white hover:bg-zinc-100 text-[#3D2934] border border-[#F0E3E9] font-medium text-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
