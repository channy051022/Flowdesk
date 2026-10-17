<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskComplete,
  seedSampleTasksIfEmpty,
  clearSampleTasks,
  formatTaskDate,
  isTaskOverdue,
  isTaskDueToday,
  calculateChecklistProgress,
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_CATEGORY_OPTIONS
} from '../services/taskService'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import TaskModal from '../components/tasks/TaskModal.vue'
import TaskDetailDrawer from '../components/tasks/TaskDetailDrawer.vue'
import { toast } from '../composables/useToast'
import {
  CheckSquare,
  Plus,
  Filter,
  Calendar,
  Clock,
  AlertCircle,
  Search,
  Tag,
  X,
  Edit2,
  Trash2,
  ListTodo,
  Layers,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Landmark
} from 'lucide-vue-next'

// State
const tasks = ref([])
const isLoading = ref(true)
const errorMessage = ref('')

const outstandingPrReminders = computed(() => {
  return tasks.value.filter(
    (t) =>
      t.relatedFinanceRecordId &&
      t.prReminder &&
      t.prReminder.isOutstanding &&
      t.status !== 'Completed' &&
      !t.isCompleted
  )
})

// Filters
const searchQuery = ref('')
const activeQuickFilter = ref('all')
const selectedStatus = ref('all')
const selectedPriority = ref('all')
const selectedCategory = ref('all')

// Modals & Drawer
const isTaskModalOpen = ref(false)
const taskToEdit = ref(null)
const isDetailDrawerOpen = ref(false)
const selectedTask = ref(null)

// Delete confirmation modal
const isDeleteConfirmOpen = ref(false)
const taskToDelete = ref(null)

// Quick add inline title input
const quickAddTitle = ref('')

const loadTasks = async () => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const data = await getTasks({
      search: searchQuery.value,
      quickFilter: activeQuickFilter.value,
      status: selectedStatus.value,
      priority: selectedPriority.value,
      category: selectedCategory.value
    })
    tasks.value = data
  } catch (err) {
    console.error('Failed to load tasks:', err)
    errorMessage.value = 'Failed to load tasks from local offline database.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await clearSampleTasks()
  await loadTasks()
})

const handleFilterChange = () => {
  loadTasks()
}

const clearFilters = () => {
  searchQuery.value = ''
  activeQuickFilter.value = 'all'
  selectedStatus.value = 'all'
  selectedPriority.value = 'all'
  selectedCategory.value = 'all'
  loadTasks()
}

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== '' ||
    activeQuickFilter.value !== 'all' ||
    selectedStatus.value !== 'all' ||
    selectedPriority.value !== 'all' ||
    selectedCategory.value !== 'all'
  )
})

// Quick Add Inline
const handleQuickAdd = async () => {
  if (!quickAddTitle.value.trim()) return
  try {
    await createTask({
      title: quickAddTitle.value.trim(),
      status: 'To Do',
      priority: 'Medium',
      dueDate: new Date().toISOString().split('T')[0],
      category: 'Administrative'
    })
    quickAddTitle.value = ''
    toast.success('Task added to your list.')
    await loadTasks()
  } catch (err) {
    toast.error('Error adding task: ' + err.message)
  }
}

// Modal Handlers
const openCreateModal = () => {
  taskToEdit.value = null
  isTaskModalOpen.value = true
}

const openEditModal = (task) => {
  taskToEdit.value = task
  isTaskModalOpen.value = true
  if (isDetailDrawerOpen.value) {
    isDetailDrawerOpen.value = false
  }
}

const openDetails = (task) => {
  selectedTask.value = task
  isDetailDrawerOpen.value = true
}

const handleTaskSaved = async ({ isEdit, id, data }) => {
  try {
    if (isEdit) {
      await updateTask(id, data)
      toast.success('Task updated successfully.')
    } else {
      await createTask(data)
      toast.success('New task created.')
    }
    isTaskModalOpen.value = false
    await loadTasks()
  } catch (err) {
    toast.error('Error saving task: ' + err.message)
  }
}

// Fast Toggle checkbox directly from list
const handleToggleComplete = async (task) => {
  try {
    const updated = await toggleTaskComplete(task.id)
    if (updated) {
      task.status = updated.status
      task.isCompleted = updated.isCompleted
      task.completedAt = updated.completedAt
      toast.success(task.isCompleted ? 'Task marked completed.' : 'Task reopened.')
      await loadTasks()
    }
  } catch (err) {
    console.error('Error toggling complete:', err)
  }
}

// Live update from drawer
const handleDrawerTaskUpdated = async ({ id, data }) => {
  try {
    await updateTask(id, data)
    await loadTasks()
    // Update local selectedTask
    if (selectedTask.value && selectedTask.value.id === id) {
      Object.assign(selectedTask.value, data)
    }
  } catch (err) {
    console.error('Error updating task from drawer:', err)
  }
}

// Delete Confirmation
const confirmDelete = (task) => {
  taskToDelete.value = task
  isDeleteConfirmOpen.value = true
  if (isDetailDrawerOpen.value) {
    isDetailDrawerOpen.value = false
  }
}

const executeDelete = async () => {
  if (!taskToDelete.value) return
  try {
    await deleteTask(taskToDelete.value.id)
    toast.success('Task deleted.')
    isDeleteConfirmOpen.value = false
    taskToDelete.value = null
    await loadTasks()
  } catch (err) {
    toast.error('Error deleting task: ' + err.message)
  }
}

// Demo Sample Tasks
const handleSeedSamples = async () => {
  try {
    await seedSampleTasksIfEmpty()
    toast.info('Loaded sample administrative tasks for testing.')
    await loadTasks()
  } catch (err) {
    console.error('Error seeding sample tasks:', err)
  }
}

const handleClearSamples = async () => {
  if (confirm('Clear all sample demo tasks from database? Real tasks will be preserved.')) {
    await clearSampleTasks()
    toast.info('Sample tasks cleared.')
    await loadTasks()
  }
}

// Badge Helpers
const getStatusBadge = (status) => {
  if (status === 'Completed') return { variant: 'success', label: 'Completed' }
  if (status === 'In Progress') return { variant: 'forest', label: 'In Progress' }
  if (status === 'On Hold') return { variant: 'warning', label: 'On Hold' }
  return { variant: 'routine', label: 'To Do' }
}

const getPriorityBadge = (priority) => {
  if (priority === 'Urgent') return 'urgent'
  if (priority === 'High') return 'warning'
  if (priority === 'Medium') return 'info'
  return 'routine'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header & Action Controls -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-forest-800 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckSquare class="w-4 h-4 text-rose-100" />
          </div>
          <div>
            <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
              My Tasks
            </h2>
            <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Organize daily government office matters, reviews, checklists, and compliance deadlines.
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton variant="primary" size="sm" @click="openCreateModal">
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Add Task
        </BaseButton>
      </div>
    </div>

    <!-- Outstanding PR Creation Reminder Alert Banner (Informational Only) -->
    <div
      v-if="outstandingPrReminders.length > 0"
      class="p-4 rounded-xl bg-[#FFF0F5] border border-[#F3C4D7] text-[#3D2934] shadow-xs space-y-3"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-[#FCE7F0] text-[#D9467B] flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-xs font-bold text-[#BE3568] uppercase tracking-wider">
              PR Creation Reminder ({{ outstandingPrReminders.length }})
            </h4>
            <p class="text-[11px] text-[#806B76] mt-0.5">
              The following Activity Design(s) reached or passed the 40-day Purchase Request (PR) creation deadline.
            </p>
          </div>
        </div>

        <router-link
          to="/finance"
          class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#D9467B] text-white hover:bg-[#BE3568] transition-colors shrink-0 inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Open Finance</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </router-link>
      </div>

      <div class="divide-y divide-[#F3C4D7]/70 pt-1">
        <div
          v-for="item in outstandingPrReminders"
          :key="item.id"
          class="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
        >
          <div class="space-y-1 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-[#3D2934]">
                “{{ item.relatedFinanceRecord?.activityDesign || item.title.replace('PR Reminder: ', '') }}”
              </span>
              <BaseBadge :variant="item.prReminder?.badgeVariant || 'urgent'" size="xs">
                {{ item.prReminder?.label || 'PR Due' }}
              </BaseBadge>
            </div>
            <p class="text-[11px] text-[#806B76] leading-relaxed">
              The Activity Design ‘<strong>{{ item.relatedFinanceRecord?.activityDesign || item.title.replace('PR Reminder: ', '') }}</strong>’ was created 40 days ago. Please create the Purchase Request (PR) for this AD.
            </p>
          </div>

          <div class="flex items-center gap-2 text-[11px] text-[#806B76] shrink-0">
            <span>Due: <strong class="text-[#3D2934]">{{ formatTaskDate(item.dueDate) }}</strong></span>
            <router-link
              to="/finance"
              class="text-xs text-[#D9467B] hover:text-[#BE3568] font-semibold underline ml-1 cursor-pointer"
            >
              View in Finance
            </router-link>
          </div>
        </div>
      </div>
    </div>



    <!-- Filter & Search Toolbar -->
    <div class="bg-white rounded-xl border border-zinc-200/80 p-3.5 shadow-2xs space-y-3">
      <!-- Quick Filter Tabs -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            v-for="tab in [
              { id: 'all', label: 'All' },
              { id: 'today', label: 'Due Today' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'completed', label: 'Completed' }
            ]"
            :key="tab.id"
            @click="activeQuickFilter = tab.id; handleFilterChange()"
            type="button"
            :class="[
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer h-7 leading-none inline-flex items-center',
              activeQuickFilter === tab.id
                ? 'bg-forest-800 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>


      </div>

      <!-- Search & Specific Filters -->
      <div class="pt-2 border-t border-zinc-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            @input="handleFilterChange"
            type="text"
            placeholder="Search task title, description, or notes..."
            class="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200/80 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 transition-colors"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''; handleFilterChange()"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Status Select -->
          <select
            v-model="selectedStatus"
            @change="handleFilterChange"
            class="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600 h-7"
          >
            <option value="all">All Statuses</option>
            <option v-for="st in TASK_STATUS_OPTIONS" :key="st" :value="st">
              {{ st }}
            </option>
          </select>

          <!-- Priority Select -->
          <select
            v-model="selectedPriority"
            @change="handleFilterChange"
            class="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600 h-7"
          >
            <option value="all">All Priorities</option>
            <option v-for="pr in TASK_PRIORITY_OPTIONS" :key="pr" :value="pr">
              {{ pr }}
            </option>
          </select>

          <!-- Category Select -->
          <select
            v-model="selectedCategory"
            @change="handleFilterChange"
            class="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600 h-7"
          >
            <option value="all">All Categories</option>
            <option v-for="cat in TASK_CATEGORY_OPTIONS" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>

          <!-- Clear Filters Button -->
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            type="button"
            class="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer h-7"
          >
            <X class="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-if="errorMessage"
      class="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-between text-xs"
    >
      <div class="flex items-center gap-2">
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span>{{ errorMessage }}</span>
      </div>
      <button
        @click="loadTasks"
        type="button"
        class="text-xs font-medium underline hover:text-red-900"
      >
        Retry
      </button>
    </div>

    <!-- Tasks List Card -->
    <BaseCard>
      <template #header>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-zinc-900">
            Tasks Checklist
          </h3>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forest-50 text-forest-800 border border-forest-100">
            {{ tasks.length }} {{ tasks.length === 1 ? 'Task' : 'Tasks' }}
          </span>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="isLoading" class="py-12 text-center text-zinc-400 text-xs">
        <div class="inline-flex items-center gap-2">
          <span class="w-3.5 h-3.5 rounded-full border-2 border-forest-600 border-t-transparent animate-spin"></span>
          <span>Loading tasks from local database...</span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="tasks.length === 0" class="py-12 text-center">
        <div class="flex flex-col items-center justify-center space-y-2">
          <div class="w-10 h-10 rounded-xl bg-forest-50 text-forest-700 flex items-center justify-center">
            <CheckSquare class="w-5 h-5" />
          </div>
          <h4 class="text-xs font-semibold text-zinc-800">
            {{ hasActiveFilters ? 'No matching tasks found' : 'No tasks created yet' }}
          </h4>
          <p class="text-[11px] text-zinc-400 max-w-sm">
            {{ hasActiveFilters ? 'Try adjusting your search criteria or clearing filters.' : 'Click "Add Task" to create your first task.' }}
          </p>
          <div class="pt-2 flex items-center gap-2">
            <button
              v-if="hasActiveFilters"
              @click="clearFilters"
              type="button"
              class="px-3 py-1.5 rounded-md border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Clear Filters
            </button>
            <BaseButton v-else variant="primary" size="sm" @click="openCreateModal">
              <Plus class="w-3.5 h-3.5 text-rose-200 mr-1" />
              Add Task
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Task Items List -->
      <div v-else class="divide-y divide-zinc-100 -mx-5 -my-5">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="p-4 sm:px-5 hover:bg-zinc-50/80 transition-colors flex items-start justify-between gap-3 group"
        >
          <!-- Left: Checkbox & Info -->
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <!-- Fast Completion Checkbox -->
            <input
              type="checkbox"
              :checked="task.status === 'Completed' || task.isCompleted"
              @change="handleToggleComplete(task)"
              class="mt-1 w-4 h-4 rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
              :title="task.status === 'Completed' ? 'Mark task incomplete' : 'Mark task completed'"
            />

            <div class="space-y-1.5 min-w-0 flex-1 cursor-pointer" @click="openDetails(task)">
              <!-- Title -->
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  :class="[
                    'text-xs sm:text-sm font-medium',
                    task.status === 'Completed' || task.isCompleted ? 'line-through text-zinc-400' : 'text-zinc-900'
                  ]"
                >
                  {{ task.title }}
                </span>

                <!-- Activity Design indicator badge -->
                <span
                  v-if="task.relatedFinanceRecordId"
                  class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#FFF0F5] text-[#D9467B] border border-[#F3C4D7] uppercase shrink-0"
                >
                  Activity Design
                </span>

                <!-- PR Reminder Status Badge -->
                <BaseBadge
                  v-if="task.prReminder"
                  :variant="task.prReminder.badgeVariant"
                  size="xs"
                >
                  {{ task.prReminder.label }}
                </BaseBadge>

                <!-- Sample badge -->
                <span
                  v-if="task.isSample"
                  class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 uppercase shrink-0"
                >
                  SAMPLE
                </span>

                <!-- Status Badge -->
                <BaseBadge :variant="getStatusBadge(task.status).variant" size="xs" dot>
                  {{ task.status }}
                </BaseBadge>

                <!-- Priority Badge -->
                <BaseBadge :variant="getPriorityBadge(task.priority)" size="xs">
                  {{ task.priority }}
                </BaseBadge>
              </div>

              <!-- Description Snippet -->
              <p v-if="task.description" class="text-[11px] text-zinc-500 line-clamp-1">
                {{ task.description }}
              </p>

              <!-- Meta Row: Category, Due Date, Checklist progress, Subtask counts, AD link -->
              <div class="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap">
                <!-- Linked AD router link -->
                <router-link
                  v-if="task.relatedFinanceRecordId"
                  to="/finance"
                  @click.stop
                  class="inline-flex items-center gap-1 font-semibold text-[#D9467B] hover:text-[#BE3568] bg-[#FFF0F5] px-1.5 py-0.2 rounded border border-[#F3C4D7] text-[10px] cursor-pointer"
                  title="View Activity Design in Finance Monitoring"
                >
                  <Landmark class="w-3 h-3 text-[#D9467B]" />
                  <span>AD #{{ task.relatedFinanceRecordId }}</span>
                </router-link>

                <!-- Category -->
                <span class="inline-flex items-center gap-1 font-medium text-zinc-700 bg-zinc-100 px-1.5 py-0.2 rounded">
                  <Tag class="w-3 h-3 text-zinc-400" />
                  {{ task.category || 'General' }}
                </span>

                <!-- Due Date & Overdue Indicator -->
                <span
                  :class="[
                    'inline-flex items-center gap-1 font-medium',
                    isTaskOverdue(task)
                      ? 'text-red-700 font-semibold'
                      : isTaskDueToday(task)
                      ? 'text-amber-700 font-semibold'
                      : 'text-zinc-600'
                  ]"
                >
                  <Calendar class="w-3 h-3 text-zinc-400" />
                  {{ formatTaskDate(task.dueDate) }}
                  <span v-if="isTaskOverdue(task)" class="text-[9px] px-1 rounded bg-red-100 text-red-700">OVERDUE</span>
                  <span v-else-if="isTaskDueToday(task)" class="text-[9px] px-1 rounded bg-amber-100 text-amber-800">TODAY</span>
                </span>

                <!-- Checklist Progress Indicator -->
                <span
                  v-if="task.checklist && task.checklist.length > 0"
                  class="inline-flex items-center gap-1 font-mono text-zinc-600 bg-zinc-50 px-1.5 py-0.2 rounded border border-zinc-200/70 text-[10px]"
                >
                  <ListTodo class="w-3 h-3 text-forest-700" />
                  {{ calculateChecklistProgress(task.checklist).completed }}/{{ task.checklist.length }}
                </span>

                <!-- Subtasks Indicator -->
                <span
                  v-if="task.subtasks && task.subtasks.length > 0"
                  class="inline-flex items-center gap-1 text-zinc-600 text-[10px]"
                >
                  <Layers class="w-3 h-3 text-zinc-400" />
                  {{ task.subtasks.filter(s => s.isCompleted).length }}/{{ task.subtasks.length }} subtasks
                </span>
              </div>
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-1 shrink-0 self-center">
            <button
              @click="openDetails(task)"
              type="button"
              class="p-1.5 rounded-md text-zinc-400 hover:text-forest-800 hover:bg-forest-50 transition-colors"
              title="Open task checklist & details"
            >
              <ChevronRight class="w-4 h-4" />
            </button>

            <button
              @click="openEditModal(task)"
              type="button"
              class="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              title="Edit task properties"
            >
              <Edit2 class="w-3.5 h-3.5" />
            </button>

            <button
              @click="confirmDelete(task)"
              type="button"
              class="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete task"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </BaseCard>

    <!-- Create/Edit Task Modal -->
    <TaskModal
      :is-open="isTaskModalOpen"
      :task-to-edit="taskToEdit"
      @close="isTaskModalOpen = false"
      @saved="handleTaskSaved"
    />

    <!-- Task Detail Drawer (Checklists, Subtasks, Notes) -->
    <TaskDetailDrawer
      :is-open="isDetailDrawerOpen"
      :task="selectedTask"
      @close="isDetailDrawerOpen = false"
      @edit="openEditModal"
      @delete="confirmDelete"
      @task-updated="handleDrawerTaskUpdated"
    />

    <!-- Delete Confirmation Modal Dialog -->
    <div
      v-if="isDeleteConfirmOpen && taskToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs"
      @click.self="isDeleteConfirmOpen = false"
      role="alertdialog"
    >
      <div class="bg-white rounded-xl shadow-xl border border-zinc-200 p-5 w-full max-w-sm space-y-4 animate-in fade-in duration-150">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <Trash2 class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-sm font-semibold text-zinc-900">Delete Task</h4>
            <p class="text-xs text-zinc-500 mt-1 leading-relaxed">
              Are you sure you want to delete
              <strong class="text-zinc-800">"{{ taskToDelete.title }}"</strong>?
              Associated checklists and subtasks will also be removed.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 text-xs">
          <button
            @click="isDeleteConfirmOpen = false"
            type="button"
            class="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            @click="executeDelete"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors cursor-pointer"
          >
            Delete Task
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
