<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseButton from '../components/common/BaseButton.vue'
import {
  getOffices,
  createOffice,
  updateOffice,
  deleteOffice,
  toggleFavoriteOffice,
  generateCodeFromName
} from '../services/officeService'
import { toast } from '../composables/useToast'
import {
  Building2,
  Search,
  MapPin,
  Plus,
  Star,
  Edit2,
  Trash2,
  X
} from 'lucide-vue-next'

const route = useRoute()
const searchQuery = ref(route.query.search ? String(route.query.search) : '')
const categoryFilter = ref('all')
const officesList = ref([])
const isLoading = ref(true)

// Add & Edit Office Modal state
const isModalOpen = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const editingOfficeId = ref(null)

const formName = ref('')
const formCode = ref('')
const formType = ref('Internal')
const formRoom = ref('')
const codeManuallyEdited = ref(false)
const isSubmitting = ref(false)

// Delete Office Modal state
const isDeleteModalOpen = ref(false)
const officeToDelete = ref(null)
const isDeleting = ref(false)

const loadOfficesData = async () => {
  isLoading.value = true
  try {
    officesList.value = await getOffices({
      search: searchQuery.value,
      type: categoryFilter.value
    })
  } catch (err) {
    console.error('Failed to load offices:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  if (route.query.search) {
    searchQuery.value = String(route.query.search)
  }
  loadOfficesData()
})

watch(
  () => route.query.search,
  (newSearch) => {
    if (newSearch !== undefined) {
      searchQuery.value = String(newSearch || '')
    }
  }
)

watch([searchQuery, categoryFilter], () => {
  loadOfficesData()
})

const handleToggleFavorite = async (office) => {
  try {
    await toggleFavoriteOffice(office.id)
    await loadOfficesData()
  } catch (err) {
    console.error('Error toggling favorite:', err)
  }
}

const onNameInput = () => {
  if (!codeManuallyEdited.value && modalMode.value === 'add') {
    formCode.value = generateCodeFromName(formName.value)
  }
}

const openAddModal = () => {
  modalMode.value = 'add'
  editingOfficeId.value = null
  formName.value = ''
  formCode.value = ''
  formType.value = 'Internal'
  formRoom.value = ''
  codeManuallyEdited.value = false
  isModalOpen.value = true
}

const openEditModal = (office) => {
  modalMode.value = 'edit'
  editingOfficeId.value = office.id
  formName.value = office.name || ''
  formCode.value = office.code || generateCodeFromName(office.name)
  formType.value = office.type || 'Internal'
  formRoom.value = office.room || ''
  codeManuallyEdited.value = true
  isModalOpen.value = true
}

const openDeleteModal = (office) => {
  if (
    (office.name || '').trim().toUpperCase() === 'TCYSDO OFFICE' ||
    (office.code || '').trim().toUpperCase() === 'TCYSDO'
  ) {
    toast.warning('Default Office Protected', 'TCYSDO OFFICE is the primary system routing destination and cannot be deleted.')
    return
  }
  officeToDelete.value = office
  isDeleteModalOpen.value = true
}

const confirmDeleteOffice = async () => {
  if (!officeToDelete.value) return
  isDeleting.value = true
  try {
    await deleteOffice(officeToDelete.value.id)
    toast.success('Office removed.', `"${officeToDelete.value.name}" was removed from the directory.`)
    isDeleteModalOpen.value = false
    officeToDelete.value = null
    await loadOfficesData()
  } catch (err) {
    toast.error('Failed to remove office', err.message)
  } finally {
    isDeleting.value = false
  }
}

const handleSaveOffice = async () => {
  if (!formName.value.trim()) {
    toast.warning('Office name is required.', 'Please provide a valid name for the government office.')
    return
  }

  const finalCode = formCode.value.trim().toUpperCase() || generateCodeFromName(formName.value)

  isSubmitting.value = true
  try {
    const payload = {
      name: formName.value.trim(),
      code: finalCode,
      type: formType.value,
      room: formRoom.value.trim()
    }

    if (modalMode.value === 'edit' && editingOfficeId.value) {
      await updateOffice(editingOfficeId.value, payload)
      toast.success('Government office updated successfully.')
    } else {
      await createOffice({
        ...payload,
        isFavorite: false
      })
      toast.success('Government office saved successfully.')
    }

    isModalOpen.value = false
    await loadOfficesData()
  } catch (err) {
    toast.error('Unable to save changes. Please try again.', err.message)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Office Directory
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Official directory of government units, division offices, short codes, and room locations.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton variant="primary" size="sm" @click="openAddModal">
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Add Office Entry
        </BaseButton>
      </div>
    </div>

    <!-- Filter & Search -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        <button
          v-for="tab in [
            { id: 'all', label: 'All Offices' },
            { id: 'favorites', label: 'Frequent / Favorites' },
            { id: 'internal', label: 'Internal Divisions' },
            { id: 'external', label: 'External Agencies' }
          ]"
          :key="tab.id"
          @click="categoryFilter = tab.id"
          type="button"
          :class="[
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer h-7 leading-none inline-flex items-center',
            categoryFilter === tab.id
              ? 'bg-forest-800 text-white shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200/80 hover:bg-zinc-50'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="relative w-full sm:w-72">
        <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search office name, short code, room..."
          class="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-200/80 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="p-8 text-center text-xs text-zinc-400">
      Loading office directory...
    </div>

    <!-- Office Cards Grid -->
    <div v-else-if="officesList.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="office in officesList"
        :key="office.id"
        class="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between gap-3 text-xs relative group"
      >
        <div class="space-y-2.5">
          <!-- Top Tag & Code + Action Buttons -->
          <div class="flex items-center justify-between">
            <span class="font-mono text-[10px] font-bold bg-forest-50 text-forest-800 px-2 py-0.5 rounded border border-forest-100 uppercase tracking-wide">
              {{ office.code || generateCodeFromName(office.name) || 'OFFICE' }}
            </span>
            <div class="flex items-center gap-1">
              <span class="text-[10px] font-medium text-zinc-400 uppercase mr-1">
                {{ office.type }}
              </span>
              <!-- Quick Edit Button -->
              <button
                @click="openEditModal(office)"
                type="button"
                class="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer"
                title="Edit office details"
                aria-label="Edit office"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <!-- Delete Button -->
              <button
                v-if="(office.code || '').toUpperCase() !== 'TCYSDO' && (office.name || '').toUpperCase() !== 'TCYSDO OFFICE'"
                @click="openDeleteModal(office)"
                type="button"
                class="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                title="Remove office"
                aria-label="Remove office"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
              <!-- Favorite Button -->
              <button
                @click="handleToggleFavorite(office)"
                type="button"
                :class="[
                  'p-1 rounded hover:bg-zinc-100 transition-colors cursor-pointer',
                  office.isFavorite ? 'text-amber-500' : 'text-zinc-300 hover:text-zinc-500'
                ]"
                :title="office.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
              >
                <Star class="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>

          <!-- Office Name -->
          <h3 class="font-semibold text-zinc-900 text-sm leading-snug">
            {{ office.name }}
          </h3>

          <!-- Room Location -->
          <div v-if="office.room" class="flex items-start gap-1.5 text-zinc-600 text-[11px]">
            <MapPin class="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <span>{{ office.room }}</span>
          </div>
          <div v-else class="text-[11px] text-zinc-400 italic">
            <span>Location not specified</span>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="pt-2.5 border-t border-zinc-100 flex items-center justify-between text-[11px]">
          <span class="text-zinc-400 text-[10px] font-mono">
            #{{ office.id }}
          </span>

          <div class="flex items-center gap-2">
            <button
              @click="openEditModal(office)"
              type="button"
              class="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
            >
              <Edit2 class="w-3 h-3" />
              <span>Edit</span>
            </button>
            <button
              v-if="(office.code || '').toUpperCase() !== 'TCYSDO' && (office.name || '').toUpperCase() !== 'TCYSDO OFFICE'"
              @click="openDeleteModal(office)"
              type="button"
              class="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-800 hover:underline cursor-pointer ml-1"
            >
              <Trash2 class="w-3 h-3" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 text-zinc-400 text-xs">
      No offices found matching search criteria.
    </div>

    <!-- Add / Edit Office Entry Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto"
    >
      <div
        class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden text-left my-8"
        role="dialog"
        aria-modal="true"
      >
        <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
              <Building2 class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-base font-bold text-zinc-900 leading-tight">
                {{ modalMode === 'edit' ? 'Edit Government Office Entry' : 'Add Government Office Entry' }}
              </h3>
              <p class="text-xs text-zinc-500 mt-0.5">
                {{ modalMode === 'edit' ? 'Update official name, code, or room location' : 'Register government office or internal division' }}
              </p>
            </div>
          </div>

          <button
            @click="isModalOpen = false"
            type="button"
            class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleSaveOffice" class="p-5 space-y-3.5 text-xs">
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Office / Division Full Name <span class="text-red-500">*</span>
            </label>
            <input
              v-model="formName"
              @input="onNameInput"
              type="text"
              placeholder="e.g. City Legal Office"
              class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
              required
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-zinc-800 mb-1">
                Office Code / Acronym <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formCode"
                @input="codeManuallyEdited = true"
                type="text"
                placeholder="e.g. CLO, PIO, HRMD"
                class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 uppercase focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs font-mono font-medium"
                required
              />
              <p class="text-[10px] text-zinc-400 mt-0.5">Short badge code used in routing slips</p>
            </div>

            <div>
              <label class="block font-semibold text-zinc-800 mb-1">
                Office Type
              </label>
              <select
                v-model="formType"
                class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs cursor-pointer"
              >
                <option value="Internal">Internal Division</option>
                <option value="Executive">Executive Office</option>
                <option value="External">External Agency</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Room / Floor / Building Location
            </label>
            <input
              v-model="formRoom"
              type="text"
              placeholder="e.g. 2nd Floor, Room 208, Executive Building"
              class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
            />
          </div>

          <div class="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              @click="isModalOpen = false"
            >
              Cancel
            </BaseButton>

            <BaseButton
              type="submit"
              variant="primary"
              size="sm"
              :loading="isSubmitting"
            >
              {{ modalMode === 'edit' ? 'Save Changes' : 'Save Office Entry' }}
            </BaseButton>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal Dialog -->
    <div
      v-if="isDeleteModalOpen && officeToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="bg-white rounded-xl shadow-xl border border-zinc-200 p-5 w-full max-w-sm space-y-4 animate-in fade-in duration-150">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <Trash2 class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-sm font-semibold text-zinc-900">Remove Office Entry</h4>
            <p class="text-xs text-zinc-500 mt-1 leading-relaxed">
              Are you sure you want to remove <strong class="text-zinc-800">"{{ officeToDelete.name }}"</strong> ({{ officeToDelete.code || 'UNIT' }}) from the directory?
            </p>
            <p class="text-[11px] text-zinc-400 mt-1.5 leading-normal">
              Existing document movement records will remain intact in audit logs.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            @click="isDeleteModalOpen = false; officeToDelete = null"
          >
            Cancel
          </BaseButton>
          <button
            type="button"
            @click="confirmDeleteOffice"
            :disabled="isDeleting"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {{ isDeleting ? 'Removing...' : 'Confirm Remove' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
