<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { getOffices } from '../../services/officeService'
import { FOLDER_BEHAVIORS } from '../../db/database'
import { Folder, X, AlertCircle, Building2, Check } from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  folderToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => !!props.folderToEdit)

const name = ref('')
const description = ref('')
const behavior = ref('internal')
const associatedOfficeId = ref('')
const color = ref('forest')
const isDefaultRegistration = ref(false)
const isCompletedFolder = ref(false)

const officesList = ref([])
const errorMessage = ref('')
const isSubmitting = ref(false)

const COLOR_OPTIONS = [
  { id: 'forest', name: 'Rose Pink', bg: 'bg-[#D9467B]' },
  { id: 'blush', name: 'Soft Blush', bg: 'bg-[#F3C4D7]' },
  { id: 'mauve', name: 'Deep Mauve', bg: 'bg-[#806B76]' },
  { id: 'lavender', name: 'Lavender', bg: 'bg-purple-400' },
  { id: 'slate', name: 'Neutral Slate', bg: 'bg-slate-400' },
  { id: 'sky', name: 'Sky Blue', bg: 'bg-sky-500' },
  { id: 'amber', name: 'Warm Amber', bg: 'bg-amber-500' },
  { id: 'emerald', name: 'Calm Sage', bg: 'bg-emerald-600' }
]

const loadOffices = async () => {
  officesList.value = await getOffices()
}

onMounted(() => {
  loadOffices()
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      loadOffices()
      errorMessage.value = ''
      if (props.folderToEdit) {
        name.value = props.folderToEdit.name || ''
        description.value = props.folderToEdit.description || ''
        behavior.value = props.folderToEdit.behavior || 'internal'
        associatedOfficeId.value = props.folderToEdit.associatedOfficeId ? String(props.folderToEdit.associatedOfficeId) : ''
        color.value = props.folderToEdit.color || 'forest'
        isDefaultRegistration.value = Boolean(props.folderToEdit.isDefaultRegistration)
        isCompletedFolder.value = Boolean(props.folderToEdit.isCompletedFolder)
      } else {
        name.value = ''
        description.value = ''
        behavior.value = 'internal'
        associatedOfficeId.value = ''
        color.value = 'forest'
        isDefaultRegistration.value = false
        isCompletedFolder.value = false
      }
    }
  }
)

const handleSubmit = async () => {
  if (!name.value.trim()) {
    errorMessage.value = 'Folder name is required.'
    return
  }

  if (behavior.value === 'destination' && !associatedOfficeId.value) {
    errorMessage.value = 'Please select an associated destination office for this routing folder.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const payload = {
      name: name.value.trim(),
      description: description.value.trim(),
      behavior: behavior.value,
      associatedOfficeId: behavior.value === 'destination' ? Number(associatedOfficeId.value) : null,
      color: color.value,
      isDefaultRegistration: isDefaultRegistration.value,
      isCompletedFolder: isCompletedFolder.value
    }

    emit('saved', {
      isEdit: isEdit.value,
      id: props.folderToEdit?.id,
      data: payload
    })
  } catch (err) {
    errorMessage.value = err.message || 'Failed to save routing folder.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden text-left my-8"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-forest-100 text-forest-800 flex items-center justify-center shrink-0">
            <Folder class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              {{ isEdit ? 'Configure Routing Folder' : 'Add Routing Folder' }}
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              Customize workflow column and routing behavior
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <form @submit.prevent="handleSubmit" class="p-5 space-y-3.5 text-xs">
        <div
          v-if="errorMessage"
          class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
        >
          <AlertCircle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>{{ errorMessage }}</div>
        </div>

        <!-- Folder Name -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Folder Title <span class="text-red-500">*</span>
          </label>
          <input
            v-model="name"
            type="text"
            placeholder="e.g. Regional Director Signature, Budget Audit Tray"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            required
          />
        </div>

        <!-- Folder Behavior: Internal vs Physical Destination -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Folder Behavior
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label
              :class="[
                'p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col gap-1',
                behavior === 'internal'
                  ? 'border-forest-600 bg-forest-50/50 text-forest-950 font-semibold shadow-2xs'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              ]"
            >
              <input
                type="radio"
                value="internal"
                v-model="behavior"
                class="sr-only"
              />
              <span class="text-xs">Internal Stage</span>
              <span class="text-[10px] text-zinc-500 font-normal leading-tight">
                Desk, tray, or review within the same office
              </span>
            </label>

            <label
              :class="[
                'p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col gap-1',
                behavior === 'destination'
                  ? 'border-sky-600 bg-sky-50/50 text-sky-950 font-semibold shadow-2xs'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              ]"
            >
              <input
                type="radio"
                value="destination"
                v-model="behavior"
                class="sr-only"
              />
              <span class="text-xs">Physical Destination</span>
              <span class="text-[10px] text-zinc-500 font-normal leading-tight">
                Dispatches paper file to another office
              </span>
            </label>
          </div>
        </div>

        <!-- Associated Office (Required if behavior === 'destination') -->
        <div v-if="behavior === 'destination'">
          <label class="block font-semibold text-zinc-800 mb-1">
            Target Destination Office <span class="text-red-500">*</span>
          </label>
          <select
            v-model="associatedOfficeId"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
            required
          >
            <option value="" disabled>Select government office...</option>
            <option v-for="off in officesList" :key="off.id" :value="off.id">
              [{{ off.code }}] {{ off.name }}
            </option>
          </select>
          <p class="text-[10px] text-zinc-400 mt-1">
            Dragging a card into this folder will automatically initiate a physical transfer to this office.
          </p>
        </div>

        <!-- Description -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Description / Instruction (Optional)
          </label>
          <input
            v-model="description"
            type="text"
            placeholder="e.g. Papers awaiting review by Atty. Reyes..."
            class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
          />
        </div>

        <!-- Color Accent -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1.5">
            Folder Color Tag
          </label>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="c in COLOR_OPTIONS"
              :key="c.id"
              type="button"
              @click="color = c.id"
              :class="[
                'w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer',
                c.bg,
                color === c.id ? 'ring-2 ring-offset-2 ring-forest-700 scale-110' : 'opacity-80 hover:opacity-100'
              ]"
              :title="c.name"
            >
              <Check v-if="color === c.id" class="w-3.5 h-3.5 text-white stroke-[3]" />
            </button>
          </div>
        </div>

        <!-- Advanced Workflow Toggles -->
        <div class="pt-2 border-t border-zinc-100 space-y-2">
          <!-- Initial Registration Folder -->
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="isDefaultRegistration"
              type="checkbox"
              class="mt-0.5 rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
            />
            <div>
              <span class="font-semibold text-zinc-800 block text-xs">Initial Registration Folder</span>
              <span class="text-[10px] text-zinc-500">
                New documents registered in Document Tracker will appear in this folder by default.
              </span>
            </div>
          </label>

          <!-- Completed Folder -->
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="isCompletedFolder"
              type="checkbox"
              class="mt-0.5 rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
            />
            <div>
              <span class="font-semibold text-zinc-800 block text-xs">Completed / Archive Stage</span>
              <span class="text-[10px] text-zinc-500">
                Moving a card here marks document processing as completed/released.
              </span>
            </div>
          </label>
        </div>

        <!-- Footer -->
        <div class="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            @click="emit('close')"
          >
            Cancel
          </BaseButton>

          <BaseButton
            type="submit"
            variant="primary"
            size="sm"
            :loading="isSubmitting"
          >
            {{ isEdit ? 'Save Folder' : 'Create Folder' }}
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
