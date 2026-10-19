<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { getOffices, generateCodeFromName } from '../../services/officeService'
import { initiateTransfer } from '../../services/documentService'
import {
  Send,
  X,
  AlertTriangle,
  Building2,
  Calendar,
  User,
  ArrowRight
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  document: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'transferred'])

const destinationOfficeId = ref('')
const dispatchDateTime = ref('')
const senderName = ref('Desk Officer')
const receivingPersonName = ref('')
const notes = ref('')
const allowSameOffice = ref(false)
const errorMessage = ref('')
const isSubmitting = ref(false)

const officesList = ref([])

const loadOffices = async () => {
  officesList.value = await getOffices()
}

onMounted(() => {
  loadOffices()
})

const currentOffice = computed(() => {
  if (!props.document || !officesList.value.length) return null
  return officesList.value.find((o) => o.id === props.document.currentOfficeId)
})

const isSameOffice = computed(() => {
  if (!props.document || !destinationOfficeId.value) return false
  return Number(destinationOfficeId.value) === props.document.currentOfficeId
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      loadOffices()
      errorMessage.value = ''
      allowSameOffice.value = false
      // Format current local datetime for datetime-local input
      const now = new Date()
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
      dispatchDateTime.value = now.toISOString().slice(0, 16)

      destinationOfficeId.value = ''
      senderName.value = 'Desk Officer'
      receivingPersonName.value = ''
      notes.value = ''
    }
  }
)

const handleSubmit = async () => {
  if (!props.document) return
  if (!destinationOfficeId.value) {
    errorMessage.value = 'Please select a destination office.'
    return
  }
  if (isSameOffice.value && !allowSameOffice.value) {
    errorMessage.value = 'Destination office is the same as current office. Please confirm the exception or select a different office.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await initiateTransfer(props.document.id, {
      toOfficeId: destinationOfficeId.value,
      dispatchDate: new Date(dispatchDateTime.value).toISOString(),
      senderName: senderName.value,
      receivingPersonName: receivingPersonName.value,
      notes: notes.value,
      allowSameOffice: allowSameOffice.value
    })

    emit('transferred')
    emit('close')
  } catch (err) {
    errorMessage.value = err.message || 'Failed to dispatch document.'
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
      class="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden text-left my-8"
      role="dialog"
      aria-modal="true"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
            <Send class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              Initiate Document Transfer
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              Dispatch paper document to another office or division
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
        <!-- Error Message Alert -->
        <div
          v-if="errorMessage"
          class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
        >
          <AlertTriangle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>{{ errorMessage }}</div>
        </div>

        <!-- Document Reference Strip -->
        <div v-if="document" class="p-3 rounded-xl bg-forest-50/60 border border-forest-100 space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] font-bold text-forest-900 bg-white px-2 py-0.5 rounded border border-forest-200">
              {{ document.trackingNumber }}
            </span>
            <span class="text-[11px] text-forest-800 font-medium">
              {{ document.documentType }}
            </span>
          </div>
          <div class="font-semibold text-zinc-900 text-xs line-clamp-1 mt-1">
            {{ document.title }}
          </div>
        </div>

        <!-- Transfer Route Visual Indicator -->
        <div class="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between gap-2">
          <!-- From Office -->
          <div class="flex-1 min-w-0">
            <span class="text-[10px] text-zinc-400 uppercase font-semibold block">Origin / Current</span>
            <div class="font-semibold text-zinc-800 truncate text-xs mt-0.5">
              {{ currentOffice ? `[${currentOffice.code || generateCodeFromName(currentOffice.name)}] ${currentOffice.name}` : 'Current Office' }}
            </div>
          </div>

          <div class="shrink-0 px-2 text-zinc-400">
            <ArrowRight class="w-4 h-4 text-zinc-400" />
          </div>

          <!-- To Office -->
          <div class="flex-1 min-w-0 text-right">
            <span class="text-[10px] text-zinc-400 uppercase font-semibold block">Destination</span>
            <div class="font-semibold text-forest-800 truncate text-xs mt-0.5">
              {{ destinationOfficeId ? officesList.find(o => o.id === Number(destinationOfficeId))?.name || 'Selected' : 'Select below...' }}
            </div>
          </div>
        </div>

        <!-- Destination Office (Required) -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Destination Office <span class="text-red-500">*</span>
          </label>
          <select
            v-model="destinationOfficeId"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
            required
          >
            <option value="" disabled>Choose receiving office or division...</option>
            <option
              v-for="off in officesList"
              :key="off.id"
              :value="off.id"
            >
              [{{ off.code || generateCodeFromName(off.name) }}] {{ off.name }} {{ off.id === document?.currentOfficeId ? '(Current Office)' : '' }}
            </option>
          </select>
        </div>

        <!-- Same Office Confirmation Warning if applicable -->
        <div
          v-if="isSameOffice"
          class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-2"
        >
          <div class="flex items-start gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div class="text-[11px] leading-relaxed">
              <strong>Same-Office Routing:</strong> You selected the same office where the document currently sits. If this is an internal desk transfer, please confirm below.
            </div>
          </div>
          <label class="flex items-center gap-2 cursor-pointer font-medium text-xs">
            <input
              v-model="allowSameOffice"
              type="checkbox"
              class="rounded border-amber-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
            />
            <span>Yes, confirm transfer to another desk within the same office</span>
          </label>
        </div>

        <!-- 2-Col Grid: Dispatch Date/Time & Sender/Messenger Name -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <!-- Dispatch Date & Time -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Dispatch Date & Time
            </label>
            <input
              v-model="dispatchDateTime"
              type="datetime-local"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              required
            />
          </div>

          <!-- Carrier / Sender Name -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Messenger / Carrier Name
            </label>
            <input
              v-model="senderName"
              type="text"
              placeholder="e.g. Courier Juan, Desk Officer"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            />
          </div>
        </div>

        <!-- Intended Recipient / Attention To -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Intended Recipient / Attention To (Optional)
          </label>
          <input
            v-model="receivingPersonName"
            type="text"
            placeholder="e.g. Atty. Reyes, Receiving Clerk Ms. Santos"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
          />
        </div>

        <!-- Routing Notes -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Dispatch Notes / Instructions
          </label>
          <textarea
            v-model="notes"
            rows="2"
            placeholder="e.g. Rush review needed, original copy with attachments, envelope marked confidential..."
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs resize-none"
          ></textarea>
        </div>

        <!-- Note Notice -->
        <div class="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100 text-[11px] text-zinc-500">
          The document will be tagged as <strong>In Transit</strong>. Its confirmed location will remain at <em>{{ currentOffice?.name || 'current office' }}</em> until the receiving office formally confirms physical receipt.
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
            <Send class="w-3.5 h-3.5 mr-1.5" />
            Dispatch Document
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
