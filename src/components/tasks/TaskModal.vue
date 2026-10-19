<script setup>
import { ref, watch, computed } from 'vue'
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_CATEGORY_OPTIONS
} from '../../services/taskService'
import { X, Save, AlertCircle, CheckSquare, Calendar, Tag } from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  taskToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEditMode = computed(() => !!props.taskToEdit)

const formData = ref({
  title: '',
  description: '',
  status: 'To Do',
  priority: 'Medium',
  startDate: '',
  dueDate: '',
  category: 'Administrative',
  notes: ''
})

const customCategory = ref(false)
const errorMessage = ref('')
const isSubmitting = ref(false)

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      errorMessage.value = ''
      if (props.taskToEdit) {
        formData.value = {
          title: props.taskToEdit.title || '',
          description: props.taskToEdit.description || '',
          status: props.taskToEdit.status || 'To Do',
          priority: props.taskToEdit.priority || 'Medium',
          startDate: props.taskToEdit.startDate || '',
          dueDate: props.taskToEdit.dueDate || '',
          category: props.taskToEdit.category || 'Administrative',
          notes: props.taskToEdit.notes || ''
        }
        customCategory.value = !TASK_CATEGORY_OPTIONS.includes(formData.value.category) && !!formData.value.category
      } else {
        formData.value = {
          title: '',
          description: '',
          status: 'To Do',
          priority: 'Medium',
          startDate: new Date().toISOString().split('T')[0],
          dueDate: new Date().toISOString().split('T')[0],
          category: 'Administrative',
          notes: ''
        }
        customCategory.value = false
      }
    }
  },
  { immediate: true }
)

const handleKeyDown = (e) => {
  if (e.key === 'Escape') {
    emit('close')
  }
}

const validateForm = () => {
  errorMessage.value = ''
  if (!formData.value.title.trim()) {
    errorMessage.value = 'Task title is required.'
    return false
  }

  if (formData.value.startDate && formData.value.dueDate) {
    if (formData.value.startDate > formData.value.dueDate) {
      errorMessage.value = 'Start date cannot be after due date.'
      return false
    }
  }

  return true
}

const handleSave = () => {
  if (!validateForm()) return

  isSubmitting.value = true
  try {
    emit('saved', {
      isEdit: isEditMode.value,
      id: props.taskToEdit?.id,
      data: { ...formData.value }
    })
  } catch (err) {
    errorMessage.value = err.message || 'Failed to save task.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/40 backdrop-blur-xs overflow-y-auto"
    @keydown="handleKeyDown"
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-modal-title"
  >
    <div
      class="bg-white rounded-xl shadow-xl border border-zinc-200/90 w-full max-w-lg my-6 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in duration-150"
    >
      <!-- Dialog Header -->
      <div class="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/60 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-forest-100 text-forest-800 flex items-center justify-center shrink-0">
            <CheckSquare class="w-4 h-4" />
          </div>
          <div>
            <h3 id="task-modal-title" class="text-sm font-semibold text-zinc-900">
              {{ isEditMode ? 'Edit Task' : 'Create New Task' }}
            </h3>
            <p class="text-[11px] text-zinc-500">
              FlowDesk Task Management • Saved to Local Database
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label="Close dialog"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <div class="p-5 overflow-y-auto space-y-4 text-xs">
        <!-- Error Alert -->
        <div
          v-if="errorMessage"
          class="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-2 text-xs"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Title -->
        <div class="space-y-1">
          <label for="taskTitle" class="block font-medium text-zinc-700">
            Task Title <span class="text-red-500">*</span>
          </label>
          <input
            id="taskTitle"
            v-model="formData.title"
            type="text"
            placeholder="e.g. Review and verify procurement documents for PR-2026-0318"
            class="w-full px-3 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 focus:border-transparent text-xs text-zinc-900 bg-white"
            autofocus
          />
        </div>

        <!-- Description -->
        <div class="space-y-1">
          <label for="taskDescription" class="block font-medium text-zinc-700">
            Description <span class="text-zinc-400 font-normal">(Optional)</span>
          </label>
          <textarea
            id="taskDescription"
            v-model="formData.description"
            rows="2"
            placeholder="Brief details or scope of this administrative task..."
            class="w-full px-3 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 focus:border-transparent text-xs text-zinc-900 bg-white resize-y"
          />
        </div>

        <!-- Status & Priority Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div class="space-y-1">
            <label for="taskStatus" class="block font-medium text-zinc-700">
              Status
            </label>
            <select
              id="taskStatus"
              v-model="formData.status"
              class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs text-zinc-800 bg-white"
            >
              <option v-for="st in TASK_STATUS_OPTIONS" :key="st" :value="st">
                {{ st }}
              </option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="taskPriority" class="block font-medium text-zinc-700">
              Priority
            </label>
            <select
              id="taskPriority"
              v-model="formData.priority"
              class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs text-zinc-800 bg-white"
            >
              <option v-for="pr in TASK_PRIORITY_OPTIONS" :key="pr" :value="pr">
                {{ pr }}
              </option>
            </select>
          </div>
        </div>

        <!-- Dates Row (Start Date & Due Date) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div class="space-y-1">
            <label for="taskStartDate" class="block font-medium text-zinc-700">
              Start Date <span class="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <input
              id="taskStartDate"
              v-model="formData.startDate"
              type="date"
              class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs text-zinc-800 bg-white"
            />
          </div>

          <div class="space-y-1">
            <label for="taskDueDate" class="block font-medium text-zinc-700">
              Due Date <span class="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <input
              id="taskDueDate"
              v-model="formData.dueDate"
              type="date"
              class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs text-zinc-800 bg-white"
            />
          </div>
        </div>

        <!-- Category -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label for="taskCategory" class="block font-medium text-zinc-700">
              Category
            </label>
            <button
              @click="customCategory = !customCategory"
              type="button"
              class="text-[10px] text-forest-700 hover:underline"
            >
              {{ customCategory ? 'Select preset category' : 'Type custom category' }}
            </button>
          </div>

          <input
            v-if="customCategory"
            id="taskCategory"
            v-model="formData.category"
            type="text"
            placeholder="e.g. Special Committee, Audit Review"
            class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs text-zinc-900 bg-white"
          />
          <select
            v-else
            id="taskCategory"
            v-model="formData.category"
            class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs text-zinc-800 bg-white"
          >
            <option v-for="cat in TASK_CATEGORY_OPTIONS" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
        </div>

        <!-- Notes -->
        <div class="space-y-1">
          <label for="taskNotes" class="block font-medium text-zinc-700">
            Notes <span class="text-zinc-400 font-normal">(Optional remarks or references)</span>
          </label>
          <textarea
            id="taskNotes"
            v-model="formData.notes"
            rows="2"
            placeholder="Additional notes, room locations, or document reference numbers..."
            class="w-full px-3 py-1.5 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-forest-600 focus:border-transparent text-xs text-zinc-900 bg-white resize-y"
          />
        </div>
      </div>

      <!-- Dialog Footer -->
      <div class="px-5 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end gap-2 shrink-0">
        <button
          @click="emit('close')"
          type="button"
          class="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 text-xs font-medium transition-colors cursor-pointer"
        >
          Cancel
        </button>

        <button
          @click="handleSave"
          :disabled="isSubmitting"
          type="button"
          class="px-3.5 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Save class="w-3.5 h-3.5 text-rose-200" />
          <span>{{ isSubmitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Task') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
