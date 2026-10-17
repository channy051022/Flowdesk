<script setup>
import { ref, watch, computed } from 'vue'
import {
  PAYMENT_STATUS_OPTIONS,
  AD_STATUS_OPTIONS,
  INTERNAL_ARRANGEMENT_OPTIONS,
  formatCurrency,
  getBudgetUtilizationsForRecord,
  calculateAdAmount
} from '../../services/financeService'
import { normalizeChargedTo } from '../../constants/chargedToOptions'
import ChargedToSelect from './ChargedToSelect.vue'
import {
  X,
  Save,
  AlertCircle,
  Plus,
  Trash2,
  Landmark,
  Calculator,
  Edit3
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  recordToEdit: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEditMode = computed(() => !!props.recordToEdit)

// Form state matching the requested field order
const formData = ref({
  activityDesign: '',
  adAmount: 0,
  chargedTo: [],
  eventDate: '',
  ppmpNumber: '',
  prNumber: '',
  poNumber: '',
  internalArrangement: 'Not specified',
  paymentStatus: 'Pending Payment',
  adStatus: 'Pending'
})

// Repeatable Budget Utilization entries
const budgetEntries = ref([])
const errorMessage = ref('')
const isSubmitting = ref(false)
const isLoadingBudget = ref(false)

// Running total of all budget utilization entries (using safe centavos arithmetic)
const runningBudgetTotal = computed(() => {
  return calculateAdAmount(budgetEntries.value)
})

// Determine whether budget utilization entries currently exist
const hasBudgetEntries = computed(() => {
  return budgetEntries.value.length > 0
})

// Keep Amount of AD automatically updated when budget entries exist
watch(
  runningBudgetTotal,
  (newTotal) => {
    if (budgetEntries.value.length > 0) {
      formData.value.adAmount = newTotal
    }
  }
)

const addBudgetEntry = () => {
  budgetEntries.value.push({
    tempId: Date.now() + Math.random(),
    name: '',
    amount: '',
    supplier: '',
    status: 'Unpaid'
  })
  // When first entry is added, immediately lock and calculate
  formData.value.adAmount = runningBudgetTotal.value
}

const removeBudgetEntry = (index) => {
  budgetEntries.value.splice(index, 1)
  if (budgetEntries.value.length > 0) {
    formData.value.adAmount = runningBudgetTotal.value
  }
  // When all entries are removed, manual editing is restored.
}

// Reset and load form when dialog opens
watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      errorMessage.value = ''
      if (props.recordToEdit) {
        formData.value = {
          activityDesign: props.recordToEdit.activityDesign || props.recordToEdit.columnK || '',
          adAmount: props.recordToEdit.adAmount !== undefined && props.recordToEdit.adAmount !== null ? props.recordToEdit.adAmount : 0,
          chargedTo: normalizeChargedTo(props.recordToEdit.chargedTo),
          eventDate: props.recordToEdit.eventDate || '',
          ppmpNumber: props.recordToEdit.ppmpNumber || '',
          prNumber: props.recordToEdit.prNumber || '',
          poNumber: props.recordToEdit.poNumber || '',
          internalArrangement: props.recordToEdit.internalArrangement || 'Not specified',
          paymentStatus: props.recordToEdit.paymentStatus || 'Pending Payment',
          adStatus: props.recordToEdit.adStatus || 'Pending'
        }

        // Load existing Budget Utilization entries
        isLoadingBudget.value = true
        try {
          const loaded = await getBudgetUtilizationsForRecord(props.recordToEdit.id)
          budgetEntries.value = (loaded || []).map((e) => ({
            id: e.id,
            tempId: e.id,
            name: e.name,
            amount: e.amount,
            supplier: e.supplier || '',
            status: e.status || 'Unpaid'
          }))
          if (budgetEntries.value.length > 0) {
            formData.value.adAmount = runningBudgetTotal.value
          } else {
            formData.value.adAmount = props.recordToEdit.adAmount !== undefined ? props.recordToEdit.adAmount : 0
          }
        } catch (err) {
          console.warn('Failed to load budget utilizations:', err)
          budgetEntries.value = []
        } finally {
          isLoadingBudget.value = false
        }
      } else {
        // Reset defaults for new record
        formData.value = {
          activityDesign: '',
          adAmount: 0,
          chargedTo: [],
          eventDate: new Date().toISOString().split('T')[0],
          ppmpNumber: '',
          prNumber: '',
          poNumber: '',
          internalArrangement: 'Not specified',
          paymentStatus: 'Pending Payment',
          adStatus: 'Pending'
        }
        budgetEntries.value = []
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

  // 1. Activity Design is the first and primary field. If empty, check other identifiers
  const hasIdentifier =
    Boolean(formData.value.activityDesign?.trim()) ||
    Boolean(formData.value.prNumber?.trim()) ||
    Boolean(formData.value.poNumber?.trim()) ||
    Boolean(formData.value.ppmpNumber?.trim())

  if (!hasIdentifier) {
    errorMessage.value = 'Please provide an Activity Design title or at least one official reference (PR, PO, or PPMP).'
    return false
  }

  // 2. Validate Amount of AD if manual mode (no budget entries)
  if (!hasBudgetEntries.value) {
    const raw = formData.value.adAmount
    const manualVal = Number(String(raw !== undefined && raw !== null && raw !== '' ? raw : 0).replace(/,/g, ''))
    if (isNaN(manualVal) || manualVal < 0) {
      errorMessage.value = 'Amount of AD must be a valid, non-negative monetary number.'
      return false
    }
  }

  // 3. Validate Budget Utilization entries if any are present
  const activeEntries = budgetEntries.value.filter((e) => (e.name && e.name.trim()) || (Number(e.amount) > 0))
  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i]
    if (!entry.name || !entry.name.trim()) {
      errorMessage.value = `Budget Utilization #${i + 1} requires a description.`
      return false
    }
    const amt = Number(entry.amount)
    if (isNaN(amt) || amt < 0) {
      errorMessage.value = `Budget Utilization #${i + 1} ("${entry.name}") must have a valid non-negative amount.`
      return false
    }
  }

  return true
}

const handleSave = async () => {
  try {
    if (!validateForm()) return

    isSubmitting.value = true

    // Format sanitized budget entries (filtering out completely blank placeholder rows)
    const sanitizedEntries = budgetEntries.value
      .filter((e) => (e.name && e.name.trim()) || (Number(e.amount) > 0) || (e.supplier && e.supplier.trim()))
      .map((e) => ({
        name: (e.name || '').trim() || 'Budget Allocation',
        amount: Number(e.amount) || 0,
        supplier: (e.supplier || '').trim(),
        status: e.status === 'Paid' ? 'Paid' : 'Unpaid'
      }))

    let finalAmount = 0
    if (sanitizedEntries.length > 0) {
      finalAmount = calculateAdAmount(sanitizedEntries)
    } else {
      const raw = formData.value.adAmount
      const manualVal = Number(String(raw !== undefined && raw !== null && raw !== '' ? raw : 0).replace(/,/g, '')) || 0
      finalAmount = Math.max(0, Math.round(manualVal * 100) / 100)
    }

    const payload = {
      ...formData.value,
      activityDesign: (formData.value.activityDesign || '').trim(),
      supplierName: props.recordToEdit?.supplierName || '',
      ppmpNumber: (formData.value.ppmpNumber || '').trim(),
      prNumber: (formData.value.prNumber || '').trim(),
      poNumber: (formData.value.poNumber || '').trim(),
      internalArrangement: formData.value.internalArrangement || 'Not specified',
      paymentStatus: formData.value.paymentStatus || 'Pending Payment',
      adStatus: formData.value.adStatus || 'Pending',
      chargedTo: normalizeChargedTo(formData.value.chargedTo),
      adAmount: finalAmount,
      // Maintain backward-compatible columnK mapping
      columnK: (formData.value.activityDesign || '').trim()
    }

    emit('saved', {
      isEdit: isEditMode.value,
      id: props.recordToEdit?.id,
      data: payload,
      budgetEntries: sanitizedEntries
    })
  } catch (err) {
    errorMessage.value = err.message || 'Failed to save record.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/40 backdrop-blur-xs overflow-y-auto"
    @click.self="emit('close')"
    @keydown="handleKeyDown"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div
      class="bg-white rounded-2xl shadow-2xl border border-[#F0E3E9] w-full max-w-3xl my-6 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Modal Header -->
      <div class="px-6 py-4.5 border-b border-[#F0E3E9] flex items-center justify-between bg-[#FFF7FA] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-forest-100 text-forest-800 flex items-center justify-center shrink-0">
            <Landmark class="w-5 h-5" />
          </div>
          <div>
            <h3 id="modal-title" class="text-sm sm:text-base font-bold text-[#3D2934]">
              {{ isEditMode ? 'Edit Finance Monitoring Record' : 'New Finance Monitoring Record' }}
            </h3>
            <p class="text-[11px] text-[#806B76]">
              Finance Internal Control Monitoring • Activity Design & Budget Utilization Breakdown
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1.5 rounded-lg text-[#A18D98] hover:text-[#3D2934] hover:bg-[#FCE7F0] transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Form Body with 2-Column Responsive Grid -->
      <div class="p-6 overflow-y-auto space-y-4.5 text-xs flex-1">
        <!-- Error Alert -->
        <div
          v-if="errorMessage"
          class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[#C2415D] flex items-start gap-2.5 text-xs shadow-2xs"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="font-medium leading-relaxed">{{ errorMessage }}</span>
        </div>

        <!-- 2-Column Form Fields Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- 1. Activity Design (Full width) -->
          <div class="sm:col-span-2 space-y-1">
            <label for="activityDesign" class="block font-semibold text-[#3D2934]">
              1. Activity Design
              <span class="text-[#D9467B] font-bold">*</span>
            </label>
            <input
              id="activityDesign"
              v-model="formData.activityDesign"
              type="text"
              placeholder="e.g. 2-Day Strategic Planning Workshop & Executive Review"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] focus:border-transparent text-xs text-[#3D2934] bg-white placeholder:text-[#A18D98]"
              autofocus
            />
          </div>

          <!-- 2. Amount of AD (Dynamic: Auto-computed when budget entries exist, manually editable when none) -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label for="adAmount" class="block font-semibold text-[#3D2934]">
                2. Amount of AD
              </label>
              <span
                class="text-[10px] font-medium flex items-center gap-1"
                :class="hasBudgetEntries ? 'text-[#D9467B]' : 'text-emerald-700'"
              >
                <component :is="hasBudgetEntries ? Calculator : Edit3" class="w-3 h-3" />
                <span>{{ hasBudgetEntries ? 'Calculated from Budget' : 'Manual Entry' }}</span>
              </span>
            </div>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#806B76] font-mono font-bold text-xs">
                ₱
              </span>
              <!-- Read-only when budget entries exist -->
              <input
                v-if="hasBudgetEntries"
                id="adAmount"
                :value="formatCurrency(formData.adAmount).replace('₱', '').trim()"
                type="text"
                readonly
                tabindex="-1"
                placeholder="0.00"
                class="w-full pl-7 pr-3 py-2 rounded-lg border border-[#F0E3E9] bg-[#FFF7FA] text-xs font-mono font-bold text-[#3D2934] cursor-not-allowed select-all"
                title="Automatically calculated from Budget Utilization."
              />
              <!-- Manually editable when no budget entries exist -->
              <input
                v-else
                id="adAmount"
                v-model.number="formData.adAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-full pl-7 pr-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] focus:border-transparent bg-white text-xs font-mono font-bold text-[#3D2934]"
                title="Enter the AD amount manually if no Budget Utilization applies."
              />
            </div>
            <p class="text-[10px] text-[#806B76]">
              {{ hasBudgetEntries ? 'Automatically calculated from Budget Utilization.' : 'Enter the AD amount manually if no Budget Utilization applies.' }}
            </p>
          </div>

          <!-- 3. Charged to (Multi-Select Searchable Dropdown) -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label for="chargedTo" class="block font-semibold text-[#3D2934]">
                3. Charged to
              </label>
              <span class="text-[10px] text-[#806B76]">
                Multi-select MOOE & LFP
              </span>
            </div>

            <ChargedToSelect
              id="chargedTo"
              v-model="formData.chargedTo"
              placeholder="Select MOOE / LFP fund source(s)..."
            />
            <p class="text-[10px] text-[#806B76]">
              Select multiple funds/categories or add custom ones. Click any chip's '×' to remove.
            </p>
          </div>

          <!-- 4. Date of Event -->
          <div class="space-y-1">
            <label for="eventDate" class="block font-semibold text-[#3D2934]">
              4. Date of Event
            </label>
            <input
              id="eventDate"
              v-model="formData.eventDate"
              type="date"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white cursor-pointer"
            />
          </div>

          <!-- 5. PPMP Number -->
          <div class="space-y-1">
            <label for="ppmpNumber" class="block font-semibold text-[#3D2934]">
              5. PPMP Number
            </label>
            <input
              id="ppmpNumber"
              v-model="formData.ppmpNumber"
              type="text"
              placeholder="e.g. PPMP-2026-ADM-004"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white placeholder:text-[#A18D98] font-mono"
            />
          </div>

          <!-- 6. PR Number -->
          <div class="space-y-1">
            <label for="prNumber" class="block font-semibold text-[#3D2934]">
              6. PR Number
            </label>
            <input
              id="prNumber"
              v-model="formData.prNumber"
              type="text"
              placeholder="e.g. PR-2026-0112"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white placeholder:text-[#A18D98] font-mono font-medium"
            />
          </div>

          <!-- 7. PO Number -->
          <div class="space-y-1">
            <label for="poNumber" class="block font-semibold text-[#3D2934]">
              7. PO Number
            </label>
            <input
              id="poNumber"
              v-model="formData.poNumber"
              type="text"
              placeholder="e.g. PO-2026-0088"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white placeholder:text-[#A18D98] font-mono"
            />
          </div>

          <!-- 8. Is there internal arrangement? -->
          <div class="sm:col-span-2 space-y-1">
            <label for="internalArrangement" class="block font-semibold text-[#3D2934]">
              8. Is there internal arrangement?
            </label>
            <select
              id="internalArrangement"
              v-model="formData.internalArrangement"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white cursor-pointer"
            >
              <option v-for="opt in INTERNAL_ARRANGEMENT_OPTIONS" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </div>

          <!-- Preserved Status Fields: Status of Payment & Status of AD -->
          <div class="space-y-1">
            <label for="paymentStatus" class="block font-semibold text-[#3D2934]">
              Status of Payment
            </label>
            <select
              id="paymentStatus"
              v-model="formData.paymentStatus"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white cursor-pointer"
            >
              <option v-for="status in PAYMENT_STATUS_OPTIONS" :key="status" :value="status">
                {{ status }}
              </option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="adStatus" class="block font-semibold text-[#3D2934]">
              Status of AD
            </label>
            <select
              id="adStatus"
              v-model="formData.adStatus"
              class="w-full px-3 py-2 rounded-lg border border-[#F0E3E9] focus:outline-none focus:ring-2 focus:ring-[#D9467B] text-xs text-[#3D2934] bg-white cursor-pointer"
            >
              <option v-for="status in AD_STATUS_OPTIONS" :key="status" :value="status">
                {{ status }}
              </option>
            </select>
          </div>
        </div>

        <!-- 10. Repeatable Budget Utilization Section (Full Width Container) -->
        <div class="pt-3 border-t border-[#F0E3E9] space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="text-xs font-bold text-[#3D2934] flex items-center gap-1.5">
                <Landmark class="w-4 h-4 text-[#D9467B]" />
                <span>10. Budget Utilization Breakdown</span>
              </h4>
              <p class="text-[10px] text-[#806B76] mt-0.5">
                Itemize individual budget allocations. When entries exist, their sum automatically sets the Amount of AD.
              </p>
            </div>

            <!-- Add Budget Utilization Button -->
            <button
              @click="addBudgetEntry"
              type="button"
              class="px-3 py-1.5 rounded-lg border border-[#D9467B] bg-[#FFF7FA] hover:bg-[#FCE7F0] text-[#D9467B] font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Add Budget Utilization</span>
            </button>
          </div>

          <!-- Entries List Container -->
          <div class="p-3.5 rounded-xl border border-[#F0E3E9] bg-[#FFF7FA]/50 space-y-2.5">
            <!-- Loading Existing Entries -->
            <div v-if="isLoadingBudget" class="py-4 text-center text-[#806B76] text-xs">
              Loading budget utilization entries...
            </div>

            <!-- Empty State -->
            <div
              v-else-if="budgetEntries.length === 0"
              class="py-6 text-center text-[#806B76] space-y-1.5"
            >
              <p class="font-medium text-[#3D2934]">No budget utilization entries added.</p>
              <p class="text-[11px] max-w-md mx-auto">
                No items are itemized. Amount of AD is currently in <strong class="text-[#D9467B]">manual entry mode</strong> (Field #2). Click "Add Budget Utilization" above if you want to break down specific items.
              </p>
            </div>

            <!-- Repeatable Entries Rows -->
            <div v-else class="space-y-2">
              <!-- Desktop Column Headers -->
              <div class="hidden sm:flex items-center gap-2 px-2 text-[10px] font-bold text-[#806B76] uppercase tracking-wider">
                <span class="w-6 text-center">#</span>
                <span class="flex-1">1. Budget Utilization Name / Description</span>
                <span class="w-36 md:w-40 text-right">2. Amount</span>
                <span class="w-44 md:w-52">3. Supplier (Optional)</span>
                <span class="w-7 text-center"></span>
              </div>

              <div
                v-for="(entry, index) in budgetEntries"
                :key="entry.tempId || entry.id || index"
                class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2.5 rounded-lg border border-[#F0E3E9] shadow-2xs hover:border-[#D9467B]/40 transition-colors"
              >
                <!-- Row Number -->
                <span class="w-6 text-center font-mono text-[11px] font-bold text-[#806B76] shrink-0 hidden sm:inline-block">
                  #{{ index + 1 }}
                </span>

                <!-- 1. Budget Description Input -->
                <div class="flex-1 min-w-0">
                  <label class="block sm:hidden text-[10px] font-semibold text-[#806B76] mb-0.5">
                    #{{ index + 1 }} Budget Utilization Description
                  </label>
                  <input
                    v-model="entry.name"
                    type="text"
                    placeholder="e.g. Food and Accommodation, Transportation, Supplies..."
                    class="w-full px-2.5 py-1.5 rounded-md border border-[#F0E3E9] focus:outline-none focus:ring-1 focus:ring-[#D9467B] text-xs text-[#3D2934] placeholder:text-[#A18D98]"
                  />
                </div>

                <!-- 2. Amount Input with Peso Prefix -->
                <div class="w-full sm:w-36 md:w-40 shrink-0 relative">
                  <label class="block sm:hidden text-[10px] font-semibold text-[#806B76] mb-0.5">Amount</label>
                  <div class="relative">
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#806B76] font-mono font-semibold text-xs">
                      ₱
                    </span>
                    <input
                      v-model.number="entry.amount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      class="w-full pl-6 pr-2.5 py-1.5 rounded-md border border-[#F0E3E9] focus:outline-none focus:ring-1 focus:ring-[#D9467B] text-xs font-mono font-medium text-[#3D2934] text-right"
                    />
                  </div>
                </div>

                <!-- 3. Supplier Input (Optional) -->
                <div class="w-full sm:w-44 md:w-52 shrink-0">
                  <label class="block sm:hidden text-[10px] font-semibold text-[#806B76] mb-0.5">Supplier (Optional)</label>
                  <input
                    v-model="entry.supplier"
                    type="text"
                    placeholder="Supplier name (optional)..."
                    class="w-full px-2.5 py-1.5 rounded-md border border-[#F0E3E9] focus:outline-none focus:ring-1 focus:ring-[#D9467B] text-xs text-[#3D2934] placeholder:text-[#A18D98]"
                    title="Optional supplier name for this specific budget item"
                  />
                </div>

                <!-- Remove Button -->
                <button
                  @click="removeBudgetEntry(index)"
                  type="button"
                  class="p-1.5 rounded-md text-[#A18D98] hover:text-[#C2415D] hover:bg-rose-50 transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                  title="Remove this budget entry"
                  :aria-label="'Remove entry ' + (index + 1)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Running Total Summary Footer -->
            <div
              v-if="budgetEntries.length > 0"
              class="pt-2 border-t border-[#F0E3E9] flex items-center justify-between text-xs font-bold text-[#3D2934]"
            >
              <span>Total Budget Utilization:</span>
              <span class="font-mono text-sm text-[#D9467B] bg-white px-2.5 py-1 rounded-md border border-[#F0E3E9] shadow-2xs">
                {{ formatCurrency(runningBudgetTotal) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer Action Buttons -->
      <div class="px-6 py-4 border-t border-[#F0E3E9] bg-[#FFF7FA] flex items-center justify-between shrink-0">
        <button
          @click="emit('close')"
          type="button"
          class="px-4 py-2 rounded-xl border border-[#F0E3E9] text-[#3D2934] hover:bg-[#FCE7F0] font-medium text-xs transition-colors cursor-pointer"
        >
          Cancel
        </button>

        <button
          @click="handleSave"
          :disabled="isSubmitting"
          type="button"
          class="px-5 py-2 rounded-xl bg-[#D9467B] hover:bg-[#B83260] active:scale-[0.98] text-white font-semibold text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save class="w-4 h-4" />
          <span>{{ isSubmitting ? 'Saving Record...' : (isEditMode ? 'Update Record' : 'Save Finance Record') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
