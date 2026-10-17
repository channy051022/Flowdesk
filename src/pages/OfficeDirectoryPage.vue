<script setup>
import { ref, watch, onMounted } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'
import BaseButton from '../components/common/BaseButton.vue'
import {
  getOffices,
  createOffice,
  updateOffice,
  toggleFavoriteOffice
} from '../services/officeService'
import { toast } from '../composables/useToast'
import {
  Building2,
  Search,
  Phone,
  Mail,
  MapPin,
  User,
  Plus,
  Info,
  Star,
  Edit2,
  X
} from 'lucide-vue-next'

const searchQuery = ref('')
const categoryFilter = ref('all')
const officesList = ref([])
const isLoading = ref(true)

// Add & Edit Office Modal state
const isModalOpen = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const editingOfficeId = ref(null)

const formName = ref('')
const formType = ref('Internal')
const formContactPerson = ref('')
const formRoom = ref('')
const formExtension = ref('')
const formEmail = ref('')
const formMessengerNotes = ref('')
const isSubmitting = ref(false)

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
  loadOfficesData()
})

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

const openAddModal = () => {
  modalMode.value = 'add'
  editingOfficeId.value = null
  formName.value = ''
  formType.value = 'Internal'
  formContactPerson.value = ''
  formRoom.value = ''
  formExtension.value = ''
  formEmail.value = ''
  formMessengerNotes.value = ''
  isModalOpen.value = true
}

const openEditModal = (office) => {
  modalMode.value = 'edit'
  editingOfficeId.value = office.id
  formName.value = office.name || ''
  formType.value = office.type || 'Internal'
  formContactPerson.value = office.contactPerson || ''
  formRoom.value = office.room || ''
  formExtension.value = office.extension || ''
  formEmail.value = office.email || ''
  formMessengerNotes.value = office.messengerNotes || ''
  isModalOpen.value = true
}

const handleSaveOffice = async () => {
  if (!formName.value.trim()) {
    toast.warning('Office name is required.', 'Please provide a valid name for the government office.')
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      name: formName.value.trim(),
      type: formType.value,
      contactPerson: formContactPerson.value.trim(),
      room: formRoom.value.trim(),
      extension: formExtension.value.trim(),
      email: formEmail.value.trim(),
      messengerNotes: formMessengerNotes.value.trim()
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
    <!-- Notice Banner -->
    <!-- <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs">
      <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div>
        <span class="font-semibold text-forest-950">Official Government Office Directory:</span>
        These units represent internal divisions, regional executive suites, and external oversight bodies used across FlowDesk's Document Tracker and dispatch workflows.
      </div>
    </div> -->

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Office Directory
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Directory of government units, division chiefs, room locations, and routing messenger notes.
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
          placeholder="Search office name, extension, code..."
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
        <div class="space-y-2">
          <!-- Top Tag & Code + Action Buttons -->
          <div class="flex items-center justify-between">
            <span class="font-mono text-[10px] font-semibold bg-forest-50 text-forest-800 px-2 py-0.5 rounded border border-forest-100">
              {{ office.code || 'UNIT' }}
            </span>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-medium text-zinc-400 uppercase">
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

          <!-- Contact Person -->
          <div v-if="office.contactPerson" class="flex items-start gap-1.5 text-zinc-600 text-[11px]">
            <User class="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <span>{{ office.contactPerson }}</span>
          </div>

          <!-- Room Location -->
          <div v-if="office.room" class="flex items-start gap-1.5 text-zinc-600 text-[11px]">
            <MapPin class="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <span>{{ office.room }}</span>
          </div>

          <!-- Phone / Extension -->
          <div v-if="office.extension" class="flex items-center gap-1.5 text-forest-800 font-medium text-[11px]">
            <Phone class="w-3.5 h-3.5 text-forest-700 shrink-0" />
            <span>Ext. {{ office.extension }}</span>
          </div>
        </div>

        <!-- Messenger Notes & Action Footer -->
        <div class="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
          <div v-if="office.messengerNotes" class="text-[10px] text-zinc-500 truncate flex-1" :title="office.messengerNotes">
            <span class="font-medium text-zinc-700">Note:</span> {{ office.messengerNotes }}
          </div>
          <div v-else-if="office.email" class="text-[10px] text-zinc-400 truncate flex-1">
            {{ office.email }}
          </div>
          <div v-else class="flex-1"></div>

          <button
            @click="openEditModal(office)"
            type="button"
            class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline shrink-0 cursor-pointer"
          >
            <Edit2 class="w-3 h-3" />
            <span>Edit</span>
          </button>
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
      @click.self="isModalOpen = false"
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
                {{ modalMode === 'edit' ? 'Update official details, division chief, room, or extension' : 'Register internal division or external oversight agency' }}
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
              type="text"
              placeholder="e.g. Regional Information & Communications Section"
              class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
              required
            />
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

          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Contact Person / Division Chief
            </label>
            <input
              v-model="formContactPerson"
              type="text"
              placeholder="e.g. Juanita Cruz (Section Chief)"
              class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-zinc-800 mb-1">
                Room / Floor Location
              </label>
              <input
                v-model="formRoom"
                type="text"
                placeholder="e.g. 2nd Floor, Room 208"
                class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
              />
            </div>

            <div>
              <label class="block font-semibold text-zinc-800 mb-1">
                Telephone / Extension
              </label>
              <input
                v-model="formExtension"
                type="text"
                placeholder="e.g. 208, (02) 8800-4100"
                class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
              />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Official Email Address
            </label>
            <input
              v-model="formEmail"
              type="email"
              placeholder="e.g. office@tagumcity.gov.ph"
              class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
            />
          </div>

          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Courier / Messenger Routing Notes
            </label>
            <textarea
              v-model="formMessengerNotes"
              rows="2"
              placeholder="e.g. Receiving hours 9:00 AM - 4:00 PM; stamped copies required..."
              class="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs resize-none"
            ></textarea>
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
  </div>
</template>
