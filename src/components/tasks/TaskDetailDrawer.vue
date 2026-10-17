<script setup>
import { ref, computed, watch } from 'vue'
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  formatTaskDate,
  isTaskOverdue,
  isTaskDueToday,
  calculateChecklistProgress
} from '../../services/taskService'
import BaseBadge from '../common/BaseBadge.vue'
import {
  X,
  CheckSquare,
  Clock,
  Calendar,
  Tag,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ListTodo,
  Layers,
  Save,
  Check
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  task: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'edit', 'delete', 'task-updated'])

// Local working copy of the task to allow instant interactions
const localTask = ref(null)

// Inputs for new items
const newChecklistText = ref('')
const newSubtaskTitle = ref('')
const isSavingNotes = ref(false)
const notesSavedNotice = ref(false)

watch(
  () => props.task,
  (t) => {
    if (t) {
      localTask.value = JSON.parse(JSON.stringify(t))
      if (!Array.isArray(localTask.value.checklist)) localTask.value.checklist = []
      if (!Array.isArray(localTask.value.subtasks)) localTask.value.subtasks = []
    } else {
      localTask.value = null
    }
  },
  { immediate: true }
)

const progress = computed(() => {
  return calculateChecklistProgress(localTask.value?.checklist || [])
})

const isOverdue = computed(() => {
  return localTask.value ? isTaskOverdue(localTask.value) : false
})

const isDueToday = computed(() => {
  return localTask.value ? isTaskDueToday(localTask.value) : false
})

// Quick update helper that emits and updates
const persistTaskChange = () => {
  if (!localTask.value) return
  emit('task-updated', {
    id: localTask.value.id,
    data: {
      status: localTask.value.status,
      priority: localTask.value.priority,
      checklist: localTask.value.checklist,
      subtasks: localTask.value.subtasks,
      notes: localTask.value.notes
    }
  })
}

// Status & Priority changes
const handleStatusChange = (newStatus) => {
  if (!localTask.value) return
  localTask.value.status = newStatus
  localTask.value.isCompleted = newStatus === 'Completed'
  persistTaskChange()
}

const handlePriorityChange = (newPriority) => {
  if (!localTask.value) return
  localTask.value.priority = newPriority
  persistTaskChange()
}

// Checklist operations
const addChecklistItem = () => {
  if (!newChecklistText.value.trim() || !localTask.value) return
  localTask.value.checklist.push({
    id: Date.now(),
    text: newChecklistText.value.trim(),
    isDone: false
  })
  newChecklistText.value = ''
  persistTaskChange()
}

const toggleChecklistItem = (item) => {
  item.isDone = !item.isDone
  persistTaskChange()
}

const removeChecklistItem = (index) => {
  localTask.value.checklist.splice(index, 1)
  persistTaskChange()
}

// Subtasks operations
const addSubtask = () => {
  if (!newSubtaskTitle.value.trim() || !localTask.value) return
  localTask.value.subtasks.push({
    id: Date.now(),
    title: newSubtaskTitle.value.trim(),
    isCompleted: false
  })
  newSubtaskTitle.value = ''
  persistTaskChange()
}

const toggleSubtask = (subtask) => {
  subtask.isCompleted = !subtask.isCompleted
  persistTaskChange()
}

const removeSubtask = (index) => {
  localTask.value.subtasks.splice(index, 1)
  persistTaskChange()
}

// Notes save
const saveNotes = () => {
  isSavingNotes.value = true
  persistTaskChange()
  setTimeout(() => {
    isSavingNotes.value = false
    notesSavedNotice.value = true
    setTimeout(() => {
      notesSavedNotice.value = false
    }, 2000)
  }, 300)
}

const getPriorityBadgeVariant = (priority) => {
  if (priority === 'Urgent') return 'urgent'
  if (priority === 'High') return 'warning'
  if (priority === 'Medium') return 'info'
  return 'routine'
}

const getStatusBadgeVariant = (status) => {
  if (status === 'Completed') return 'success'
  if (status === 'In Progress') return 'forest'
  if (status === 'On Hold') return 'warning'
  return 'routine'
}
</script>

<template>
  <div>
    <!-- Backdrop -->
    <transition
      enter-active-class="transition-opacity ease-linear duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity ease-linear duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-xs"
        @click="emit('close')"
        aria-hidden="true"
      />
    </transition>

    <!-- Slide-in Drawer Container -->
    <aside
      :class="[
        'fixed top-0 bottom-0 right-0 z-50 w-full sm:w-[500px] bg-white border-l border-zinc-200/90 shadow-2xl flex flex-col transition-transform duration-200 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      ]"
      role="dialog"
      aria-modal="true"
      aria-label="Task details drawer"
    >
      <!-- Drawer Header -->
      <div v-if="localTask" class="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
        <div class="flex items-center gap-2">
          <BaseBadge :variant="getStatusBadgeVariant(localTask.status)" size="sm" dot>
            {{ localTask.status }}
          </BaseBadge>
          <BaseBadge :variant="getPriorityBadgeVariant(localTask.priority)" size="sm">
            {{ localTask.priority }} Priority
          </BaseBadge>
          <span v-if="localTask.isSample" class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
            SAMPLE
          </span>
        </div>

        <div class="flex items-center gap-1">
          <button
            @click="emit('edit', localTask)"
            type="button"
            class="p-1.5 rounded-md text-zinc-400 hover:text-forest-700 hover:bg-forest-50 transition-colors"
            title="Edit full task properties"
          >
            <Edit2 class="w-4 h-4" />
          </button>

          <button
            @click="emit('delete', localTask)"
            type="button"
            class="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete task"
          >
            <Trash2 class="w-4 h-4" />
          </button>

          <button
            @click="emit('close')"
            type="button"
            class="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors ml-1"
            aria-label="Close task details"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Drawer Body -->
      <div v-if="localTask" class="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        <!-- Title & Category -->
        <div class="space-y-1.5">
          <div class="flex items-start gap-2.5">
            <input
              type="checkbox"
              :checked="localTask.status === 'Completed'"
              @change="handleStatusChange(localTask.status === 'Completed' ? 'To Do' : 'Completed')"
              class="mt-1 w-4 h-4 rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
            />
            <div class="flex-1">
              <h3
                :class="[
                  'text-base font-semibold text-zinc-900 leading-snug',
                  localTask.status === 'Completed' ? 'line-through text-zinc-400' : ''
                ]"
              >
                {{ localTask.title }}
              </h3>
            </div>
          </div>

          <div class="flex items-center gap-2 pl-6 text-[11px] text-zinc-500">
            <span class="inline-flex items-center gap-1 font-medium bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded">
              <Tag class="w-3 h-3 text-zinc-400" />
              {{ localTask.category || 'General' }}
            </span>
          </div>
        </div>

        <!-- Description -->
        <div v-if="localTask.description" class="p-3 rounded-lg bg-zinc-50 border border-zinc-100 text-zinc-700 leading-relaxed text-xs">
          {{ localTask.description }}
        </div>

        <!-- Status & Priority Controls Bar -->
        <div class="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50/80 border border-zinc-200/70">
          <div>
            <label class="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              :value="localTask.status"
              @change="handleStatusChange($event.target.value)"
              class="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600"
            >
              <option v-for="st in TASK_STATUS_OPTIONS" :key="st" :value="st">
                {{ st }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Priority
            </label>
            <select
              :value="localTask.priority"
              @change="handlePriorityChange($event.target.value)"
              class="w-full px-2 py-1 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600"
            >
              <option v-for="pr in TASK_PRIORITY_OPTIONS" :key="pr" :value="pr">
                {{ pr }} Priority
              </option>
            </select>
          </div>
        </div>

        <!-- Dates Card -->
        <div class="p-3 rounded-xl bg-white border border-zinc-200/80 flex items-center justify-between text-xs">
          <div class="space-y-0.5">
            <span class="text-[10px] text-zinc-400 block font-medium">Due Date</span>
            <div class="flex items-center gap-1.5 font-medium text-zinc-800">
              <Calendar class="w-3.5 h-3.5 text-zinc-400" />
              <span>{{ formatTaskDate(localTask.dueDate) }}</span>
            </div>
          </div>

          <!-- Status badge indicator for due dates -->
          <div>
            <span
              v-if="isOverdue"
              class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse"
            >
              <AlertCircle class="w-3 h-3" />
              Overdue
            </span>
            <span
              v-else-if="isDueToday"
              class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
            >
              <Clock class="w-3 h-3" />
              Due Today
            </span>
            <span
              v-else-if="localTask.status === 'Completed'"
              class="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"
            >
              Completed
            </span>
            <span v-else class="text-[11px] text-zinc-400">
              Scheduled
            </span>
          </div>
        </div>

        <!-- Checklist Section -->
        <div class="space-y-2.5 pt-2 border-t border-zinc-100">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ListTodo class="w-4 h-4 text-forest-700" />
              <h4 class="font-semibold text-zinc-900">Checklist Items</h4>
            </div>
            <span class="text-[11px] text-zinc-500 font-medium font-mono">
              {{ progress.completed }}/{{ progress.total }} ({{ progress.percent }}%)
            </span>
          </div>

          <!-- Progress Bar -->
          <div v-if="progress.total > 0" class="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div
              class="bg-forest-700 h-1.5 rounded-full transition-all duration-300"
              :style="{ width: progress.percent + '%' }"
            />
          </div>

          <!-- Checklist Items List -->
          <div class="space-y-1.5">
            <div
              v-for="(item, idx) in localTask.checklist"
              :key="item.id || idx"
              class="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-50 hover:bg-zinc-100/70 transition-colors group"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  :checked="item.isDone"
                  @change="toggleChecklistItem(item)"
                  class="rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
                />
                <span
                  :class="[
                    'text-xs flex-1 truncate',
                    item.isDone ? 'line-through text-zinc-400' : 'text-zinc-800'
                  ]"
                >
                  {{ item.text }}
                </span>
              </div>

              <button
                @click="removeChecklistItem(idx)"
                type="button"
                class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition-opacity p-0.5"
                title="Remove checklist item"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Add Checklist Item Input -->
            <div class="flex items-center gap-2 pt-1">
              <input
                v-model="newChecklistText"
                @keyup.enter="addChecklistItem"
                type="text"
                placeholder="Add checklist item (Press Enter)..."
                class="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
              <button
                @click="addChecklistItem"
                :disabled="!newChecklistText.trim()"
                type="button"
                class="px-2.5 py-1.5 rounded-lg bg-forest-800 text-white text-xs font-medium hover:bg-forest-900 disabled:opacity-40 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <!-- Subtasks Section -->
        <div class="space-y-2.5 pt-2 border-t border-zinc-100">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Layers class="w-4 h-4 text-forest-700" />
              <h4 class="font-semibold text-zinc-900">Subtasks</h4>
            </div>
            <span class="text-[11px] text-zinc-500 font-medium">
              {{ localTask.subtasks.filter(s => s.isCompleted).length }}/{{ localTask.subtasks.length }} completed
            </span>
          </div>

          <div class="space-y-1.5">
            <div
              v-for="(sub, sIdx) in localTask.subtasks"
              :key="sub.id || sIdx"
              class="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-50 hover:bg-zinc-100/70 transition-colors group"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  :checked="sub.isCompleted"
                  @change="toggleSubtask(sub)"
                  class="rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
                />
                <span
                  :class="[
                    'text-xs flex-1 truncate',
                    sub.isCompleted ? 'line-through text-zinc-400' : 'text-zinc-800'
                  ]"
                >
                  {{ sub.title }}
                </span>
              </div>

              <button
                @click="removeSubtask(sIdx)"
                type="button"
                class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition-opacity p-0.5"
                title="Remove subtask"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Add Subtask Input -->
            <div class="flex items-center gap-2 pt-1">
              <input
                v-model="newSubtaskTitle"
                @keyup.enter="addSubtask"
                type="text"
                placeholder="Add subtask (Press Enter)..."
                class="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
              <button
                @click="addSubtask"
                :disabled="!newSubtaskTitle.trim()"
                type="button"
                class="px-2.5 py-1.5 rounded-lg bg-forest-800 text-white text-xs font-medium hover:bg-forest-900 disabled:opacity-40 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <!-- Notes Section -->
        <div class="space-y-2 pt-2 border-t border-zinc-100">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <FileText class="w-4 h-4 text-forest-700" />
              <h4 class="font-semibold text-zinc-900">Task Notes & Remarks</h4>
            </div>
            <span v-if="notesSavedNotice" class="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
              <Check class="w-3 h-3" /> Saved!
            </span>
          </div>

          <textarea
            v-model="localTask.notes"
            rows="3"
            placeholder="Type notes, references, tracking numbers, or official comments..."
            class="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 resize-y"
          />

          <div class="text-right">
            <button
              @click="saveNotes"
              type="button"
              class="px-2.5 py-1 text-xs rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <Save class="w-3 h-3 text-forest-700" />
              <span>Save Notes</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Drawer Footer -->
      <div v-if="localTask" class="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between shrink-0">
        <button
          @click="emit('delete', localTask)"
          type="button"
          class="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1.5"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Delete Task</span>
        </button>

        <button
          @click="emit('close')"
          type="button"
          class="px-3.5 py-1.5 rounded-lg bg-zinc-200 text-zinc-800 hover:bg-zinc-300 text-xs font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </aside>
  </div>
</template>
