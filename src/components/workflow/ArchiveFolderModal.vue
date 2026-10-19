<script setup>
import { ref, watch, computed } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { archiveWorkflowFolder } from '../../services/workflowService'
import { AlertTriangle, X, Archive, ArrowRight } from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  folder: {
    type: Object,
    default: null
  },
  documentCount: {
    type: Number,
    default: 0
  },
  availableFolders: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'archived'])

const targetFolderId = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

const otherFolders = computed(() => {
  if (!props.folder) return []
  return props.availableFolders.filter((f) => f.id !== props.folder.id && !f.isArchived)
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      errorMessage.value = ''
      targetFolderId.value = otherFolders.value.length > 0 ? String(otherFolders.value[0].id) : ''
    }
  }
)

const handleArchive = async () => {
  if (!props.folder) return

  if (props.folder.isDefaultRegistration) {
    errorMessage.value = 'Cannot archive the default registration folder. Please designate another folder as the registration folder before archiving this one.'
    return
  }

  if (props.documentCount > 0 && !targetFolderId.value) {
    errorMessage.value = 'Please select a destination folder to safely move the active documents.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await archiveWorkflowFolder(
      props.folder.id,
      props.documentCount > 0 ? Number(targetFolderId.value) : null
    )
    emit('archived')
    emit('close')
  } catch (err) {
    errorMessage.value = err.message || 'Failed to archive folder.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto"
  >
    <div
      class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden text-left my-8"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <Archive class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              Archive Routing Folder
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              Remove folder column without deleting documents
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

      <!-- Body -->
      <div class="p-5 space-y-4 text-xs">
        <div
          v-if="errorMessage"
          class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
        >
          <AlertTriangle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>{{ errorMessage }}</div>
        </div>

        <div v-if="folder" class="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-1.5">
          <div class="font-semibold text-zinc-900 text-sm">
            Folder: {{ folder.name }}
          </div>
          <div class="text-[11px] text-zinc-600">
            Current documents in folder: <strong>{{ documentCount }}</strong> active file(s)
          </div>
        </div>

        <!-- Warning banner if folder has documents -->
        <div v-if="documentCount > 0" class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
          <div class="flex items-start gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div class="text-[11px] leading-relaxed">
              <strong>Active Document Migration:</strong> To avoid losing track of files, all <strong>{{ documentCount }}</strong> document(s) in this column must be safely moved to another active routing folder.
            </div>
          </div>

          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Move Documents To:
            </label>
            <select
              v-model="targetFolderId"
              class="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-forest-600 cursor-pointer"
              required
            >
              <option v-for="f in otherFolders" :key="f.id" :value="f.id">
                {{ f.name }} ({{ f.behavior === 'destination' ? 'Physical Destination' : 'Internal Stage' }})
              </option>
            </select>
          </div>
        </div>

        <p v-else class="text-zinc-600 text-xs">
          This folder currently contains no active documents. It can be safely archived from the board view.
        </p>

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
            type="button"
            variant="danger"
            size="sm"
            :loading="isSubmitting"
            @click="handleArchive"
          >
            Archive Folder
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
