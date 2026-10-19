<script setup>
import { ref, watch, computed } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { confirmReceipt } from '../../services/documentService'
import {
  CheckCircle2,
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

const emit = defineEmits(['close', 'received'])

const receiptDateTime = ref('')
const receivingPersonName = ref('Desk Officer')
const nextStatus = ref('received')
const notes = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      errorMessage.value = ''
      const now = new Date()
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
      receiptDateTime.value = now.toISOString().slice(0, 16)

      receivingPersonName.value = 'Desk Officer'
      nextStatus.value = 'received'
      notes.value = ''
    }
  }
)

const handleSubmit = async () => {
  if (!props.document) return

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await confirmReceipt(props.document.id, {
      receiptDate: new Date(receiptDateTime.value).toISOString(),
      receivingPersonName: receivingPersonName.value,
      nextStatus: nextStatus.value,
      notes: notes.value
    })

    emit('received')
    emit('close')
  } catch (err) {
    errorMessage.value = err.message || 'Failed to confirm receipt.'
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
          <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <CheckCircle2 class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              Confirm Physical Receipt
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              Verify that the paper file has arrived and stamp receiving location
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
        <!-- Error Alert -->
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

        <!-- Transfer Movement Context -->
        <div class="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between gap-2">
          <!-- Dispatched From -->
          <div class="flex-1 min-w-0">
            <span class="text-[10px] text-zinc-400 uppercase font-semibold block">Dispatched From</span>
            <div class="font-semibold text-zinc-800 truncate text-xs mt-0.5">
              {{ document?.currentOfficeName || 'Previous Office' }}
            </div>
          </div>

          <div class="shrink-0 px-2 text-zinc-400">
            <ArrowRight class="w-4 h-4 text-zinc-400" />
          </div>

          <!-- Receiving Office -->
          <div class="flex-1 min-w-0 text-right">
            <span class="text-[10px] text-zinc-400 uppercase font-semibold block">Now Receiving At</span>
            <div class="font-semibold text-emerald-800 truncate text-xs mt-0.5">
              {{ document?.activeDestinationOfficeName || 'Destination Office' }}
            </div>
          </div>
        </div>

        <!-- 2-Col Grid: Receipt Date & Receiving Officer -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <!-- Receipt Date & Time -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Physical Receipt Date & Time
            </label>
            <input
              v-model="receiptDateTime"
              type="datetime-local"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              required
            />
          </div>

          <!-- Receiving Officer Name -->
          <div>
            <label class="block font-semibold text-zinc-800 mb-1">
              Receiving Officer / Clerk
            </label>
            <input
              v-model="receivingPersonName"
              type="text"
              placeholder="e.g. Staff Reyes, Receiving Clerk"
              class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              required
            />
          </div>
        </div>

        <!-- Next Processing Status -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Immediate Processing Status
          </label>
          <select
            v-model="nextStatus"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
          >
            <option value="received">Received by Office (Awaiting triage)</option>
            <option value="under_review">Under Review (On officer's desk)</option>
            <option value="for_approval">For Signature/Approval (Executive box)</option>
            <option value="completed">Completed / Released</option>
          </select>
          <p class="text-[10px] text-zinc-400 mt-1">
            Receiving a document does not automatically complete it. Choose the realistic workflow state.
          </p>
        </div>

        <!-- Receipt Notes / Shelf Location -->
        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Physical Desk / Tray / Cabinet Note
          </label>
          <textarea
            v-model="notes"
            rows="2"
            placeholder="e.g. Placed on Desk Tray A, handed to division chief, stamped Received copy 1..."
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs resize-none"
          ></textarea>
        </div>

        <!-- Explanatory note -->
        <div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-900 leading-relaxed">
          Confirming receipt will close the active <strong>In Transit</strong> status and permanently assign the document's confirmed location to <strong>{{ document?.activeDestinationOfficeName || 'the receiving office' }}</strong>.
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
            <CheckCircle2 class="w-3.5 h-3.5 mr-1.5 text-emerald-200" />
            Confirm Physical Receipt
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
