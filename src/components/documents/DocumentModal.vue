<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { DOCUMENT_TYPES, DOCUMENT_STATUSES, DOCUMENT_PRIORITIES } from '../../db/database'
import { getOffices } from '../../services/officeService'
import { getFinanceRecords, formatCurrency } from '../../services/financeService'
import { getWorkflowFolders } from '../../services/workflowService'
import { X, FileText, AlertCircle, Landmark, Folder } from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  documentToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => !!props.documentToEdit)

// Form fields
const title = ref('')
const documentType = ref('Memo')
const isCustomType = ref(false)
const customType = ref('')
const referenceNumber = ref('')
const description = ref('')
const originatingOfficeId = ref('')
const currentOfficeId = ref('')
const workflowFolderId = ref('')
const status = ref('registered')
const priority = ref('Routine')
const dueDate = ref('')
const relatedFinanceRecordId = ref('')
const registeredBy = ref('Desk Officer')
const initialNotes = ref('')

const errors = ref({})
const isSubmitting = ref(false)
const officesList = ref([])
const financeRecordsList = ref([])
const workflowFoldersList = ref([])

const loadDependencies = async () => {
  try {
    const [offices, finance, folders] = await Promise.all([
      getOffices(),
      getFinanceRecords(),
      getWorkflowFolders()
    ])
    officesList.value = offices
    financeRecordsList.value = finance
    workflowFoldersList.value = folders
  } catch (err) {
    console.error('Failed to load offices, finance records, or folders in DocumentModal:', err)
  }
}

onMounted(() => {
  loadDependencies()
})

watch(
  () => props.isOpen,
  async (val) => {
    if (val) {
      await loadDependencies()
      errors.value = {}
      if (props.documentToEdit) {
        title.value = props.documentToEdit.title || ''
        if (DOCUMENT_TYPES.includes(props.documentToEdit.documentType)) {
          documentType.value = props.documentToEdit.documentType
          isCustomType.value = false
          customType.value = ''
        } else {
          documentType.value = 'Other'
          isCustomType.value = true
          customType.value = props.documentToEdit.documentType || ''
        }
        referenceNumber.value = props.documentToEdit.referenceNumber || ''
        description.value = props.documentToEdit.description || ''
        originatingOfficeId.value = props.documentToEdit.originatingOfficeId || ''
        currentOfficeId.value = props.documentToEdit.currentOfficeId || ''
        workflowFolderId.value = props.documentToEdit.workflowFolderId ? String(props.documentToEdit.workflowFolderId) : ''
        status.value = props.documentToEdit.status || 'registered'
        priority.value = props.documentToEdit.priority || 'Routine'
        dueDate.value = props.documentToEdit.dueDate || ''
        relatedFinanceRecordId.value = props.documentToEdit.relatedFinanceRecordId || ''
        registeredBy.value = ''
        initialNotes.value = ''
      } else {
        // Reset form for new document
        title.value = ''
        documentType.value = 'Memo'
        isCustomType.value = false
        customType.value = ''
        referenceNumber.value = ''
        description.value = ''
        originatingOfficeId.value = officesList.value.length > 0 ? officesList.value[0].id : ''
        currentOfficeId.value = originatingOfficeId.value

        const defFolder = workflowFoldersList.value.find((f) => f.isDefaultRegistration) || workflowFoldersList.value[0]
        workflowFolderId.value = defFolder ? String(defFolder.id) : ''

        status.value = 'registered'
        priority.value = 'Routine'
        dueDate.value = ''
        relatedFinanceRecordId.value = ''
        registeredBy.value = 'Desk Officer'
        initialNotes.value = ''
      }
    }
  }
)

watch(originatingOfficeId, (newVal) => {
  if (!isEdit.value && !currentOfficeId.value) {
    currentOfficeId.value = newVal
  }
})

const handleTypeChange = (e) => {
  if (e.target.value === 'Other') {
    isCustomType.value = true
  } else {
    isCustomType.value = false
  }
}

const validate = () => {
  errors.value = {}
  if (!title.value.trim()) {
    errors.value.title = 'Document title is required'
  }
  if (!originatingOfficeId.value) {
    errors.value.originatingOfficeId = 'Originating office is required'
  }
  return Object.keys(errors.value).length === 0
}

const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    const finalDocType = isCustomType.value && customType.value.trim()
      ? customType.value.trim()
      : documentType.value

    const payload = {
      title: title.value.trim(),
      documentType: finalDocType,
      referenceNumber: referenceNumber.value.trim(),
      description: description.value.trim(),
      originatingOfficeId: Number(originatingOfficeId.value),
      currentOfficeId: Number(currentOfficeId.value || originatingOfficeId.value),
      workflowFolderId: workflowFolderId.value ? Number(workflowFolderId.value) : null,
      status: status.value,
      priority: priority.value,
      dueDate: dueDate.value,
      relatedFinanceRecordId: relatedFinanceRecordId.value ? Number(relatedFinanceRecordId.value) : null,
      registeredBy: registeredBy.value.trim(),
      initialNotes: initialNotes.value.trim()
    }

    emit('saved', {
      isEdit: isEdit.value,
      id: props.documentToEdit?.id,
      data: payload
    })
  } catch (err) {
    console.error('Error submitting document form:', err)
  } finally {
    isSubmitting.value = false
  }
}

const getPriorityChipClass = (p) => {
  if (priority.value === p) {
    if (p === 'Urgent') return 'bg-red-700 text-white border-red-700 font-semibold'
    if (p === 'High') return 'bg-amber-600 text-white border-amber-600 font-semibold'
    if (p === 'Medium') return 'bg-sky-700 text-white border-sky-700 font-semibold'
    return 'bg-forest-800 text-white border-forest-800 font-semibold'
  }
  return 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden text-left my-8"
      role="dialog"
      aria-modal="true"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-forest-100 text-forest-800 flex items-center justify-center shrink-0">
            <FileText class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              {{ isEdit ? 'Edit Document Details' : 'Register New Paper Document' }}
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              {{ isEdit ? 'Update metadata without altering past movement history' : 'Record official routing slip and assign tracking number' }}
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <form @submit.prevent="handleSubmit" class="p-5 space-y-4 text-xs">
        <!-- Document Title (Required) -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Document Title & Subject <span class="text-red-500">*</span>
          </label>
          <input
            v-model="title"
            type="text"
            placeholder="e.g. Endorsement for FY2026 Regional Logistics Plan"
            class="w-full px-3 py-2 bg-white border rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            :class="errors.title ? 'border-red-400 bg-red-50/20' : 'border-zinc-200'"
          />
          <p v-if="errors.title" class="text-red-600 text-[11px] mt-1 flex items-center gap-1">
            <AlertCircle class="w-3 h-3" />
            {{ errors.title }}
          </p>
        </div>

        <!-- 2-Col Grid: Document Type & Reference Number -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <!-- Document Type -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Document Type
            </label>
            <select
              v-model="documentType"
              @change="handleTypeChange"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
            >
              <option v-for="t in DOCUMENT_TYPES" :key="t" :value="t">
                {{ t }}
              </option>
            </select>

            <!-- Custom Type text field if 'Other' selected -->
            <input
              v-if="isCustomType"
              v-model="customType"
              type="text"
              placeholder="Specify custom document type..."
              class="w-full mt-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            />
          </div>

          <!-- Reference Number -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Official Reference No. / Series
            </label>
            <input
              v-model="referenceNumber"
              type="text"
              placeholder="e.g. MEMO-2026-088, DV-042"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs font-mono"
            />
          </div>
        </div>

        <!-- 2-Col Grid: Originating Office & Initial/Current Office -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <!-- Originating Office -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Originating Office <span class="text-red-500">*</span>
            </label>
            <select
              v-model="originatingOfficeId"
              class="w-full px-3 py-2 bg-white border rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
              :class="errors.originatingOfficeId ? 'border-red-400 bg-red-50/20' : 'border-zinc-200'"
              :disabled="isEdit"
            >
              <option value="" disabled>Select originating office...</option>
              <option v-for="off in officesList" :key="off.id" :value="off.id">
                [{{ off.code }}] {{ off.name }}
              </option>
            </select>
            <p v-if="isEdit" class="text-[10px] text-zinc-400 mt-0.5">
              Originating office cannot be altered after registration.
            </p>
          </div>

          <!-- Current / Initial Office -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              {{ isEdit ? 'Current Confirmed Office' : 'Initial Physical Location' }}
            </label>
            <select
              v-model="currentOfficeId"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
              :disabled="isEdit"
            >
              <option v-for="off in officesList" :key="off.id" :value="off.id">
                [{{ off.code }}] {{ off.name }}
              </option>
            </select>
            <p v-if="isEdit" class="text-[10px] text-zinc-400 mt-0.5">
              To move this document, use the official Transfer action.
            </p>
          </div>
        </div>

        <!-- Priority Selector -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1.5">
            Priority Level
          </label>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="p in DOCUMENT_PRIORITIES"
              :key="p"
              type="button"
              @click="priority = p"
              :class="[
                'px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all',
                getPriorityChipClass(p)
              ]"
            >
              {{ p }}
            </button>
          </div>
        </div>

        <!-- 3-Col Grid: Workflow Folder, Status & Due Date -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <!-- Workflow Routing Folder -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1 flex items-center gap-1">
              <Folder class="w-3 h-3 text-forest-700" />
              <span>Routing Folder</span>
            </label>
            <select
              v-model="workflowFolderId"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer font-medium"
            >
              <option v-for="f in workflowFoldersList" :key="f.id" :value="f.id">
                {{ f.name }}
              </option>
            </select>
          </div>

          <!-- Status -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Processing Status
            </label>
            <select
              v-model="status"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
            >
              <option v-for="st in DOCUMENT_STATUSES" :key="st.value" :value="st.value">
                {{ st.label }}
              </option>
            </select>
          </div>

          <!-- Due Date -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Target Due Date
            </label>
            <input
              v-model="dueDate"
              type="date"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            />
          </div>
        </div>

        <!-- Optional Link to Finance Monitoring Record -->
        <div>
          <div class="flex items-center gap-1.5 mb-1 font-semibold text-zinc-800">
            <Landmark class="w-3.5 h-3.5 text-forest-700" />
            <span>Link to Finance Internal Control Record (Optional)</span>
          </div>
          <select
            v-model="relatedFinanceRecordId"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
          >
            <option value="">— No linked finance record —</option>
            <option v-for="rec in financeRecordsList" :key="rec.id" :value="rec.id">
              #{{ rec.id }} | {{ rec.activityDesign || rec.supplierName }} (PR: {{ rec.prNumber || 'N/A' }} | {{ formatCurrency(rec.adAmount) }})
            </option>
          </select>
          <p class="text-[10px] text-zinc-400 mt-0.5">
            Associates this physical paper slip with a disbursement voucher or supplier transaction.
          </p>
        </div>

        <!-- Description / Subject Notes -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Description & Key Routing Instructions
          </label>
          <textarea
            v-model="description"
            rows="2"
            placeholder="Key attachments, routing notes, or special compliance requirements..."
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs resize-none"
          ></textarea>
        </div>

        <!-- Initial Registration fields (Only for new documents) -->
        <div v-if="!isEdit" class="pt-2 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label class="block font-semibold text-zinc-700 mb-1">
              Registered By Officer
            </label>
            <input
              v-model="registeredBy"
              type="text"
              placeholder="Desk Officer name..."
              class="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            />
          </div>

          <div>
            <label class="block font-semibold text-zinc-700 mb-1">
              Initial Desk / Box Tag
            </label>
            <input
              v-model="initialNotes"
              type="text"
              placeholder="e.g. Tray 1, Incoming Cabinet A"
              class="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            />
          </div>
        </div>

        <!-- Modal Footer -->
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
            {{ isEdit ? 'Save Changes' : 'Register Document' }}
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
