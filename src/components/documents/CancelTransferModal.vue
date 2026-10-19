<script setup>
import { ref, watch } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { cancelTransfer } from '../../services/documentService'
import { AlertTriangle, X, Undo2 } from 'lucide-vue-next'

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

const emit = defineEmits(['close', 'cancelled'])

const reason = ref('')
const cancelledBy = ref('Desk Officer')
const errorMessage = ref('')
const isSubmitting = ref(false)

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      reason.value = ''
      cancelledBy.value = 'Desk Officer'
      errorMessage.value = ''
    }
  }
)

const handleSubmit = async () => {
  if (!props.document) return
  if (!reason.value.trim()) {
    errorMessage.value = 'A cancellation reason is required for audit history.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await cancelTransfer(props.document.id, {
      cancellationReason: reason.value.trim(),
      cancelledBy: cancelledBy.value.trim()
    })

    emit('cancelled')
    emit('close')
  } catch (err) {
    errorMessage.value = err.message || 'Failed to cancel transfer.'
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
          <div class="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <Undo2 class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              Cancel Active Transfer
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              Revert in-transit dispatch before physical receipt
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
        <div
          v-if="errorMessage"
          class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
        >
          <AlertTriangle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>{{ errorMessage }}</div>
        </div>

        <div v-if="document" class="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] font-bold text-zinc-800">
              {{ document.trackingNumber }}
            </span>
            <span class="text-[10px] uppercase font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
              In Transit
            </span>
          </div>
          <div class="font-medium text-zinc-900 truncate">
            {{ document.title }}
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            Destination: <strong>{{ document.activeDestinationOfficeName || 'Selected Office' }}</strong>
          </div>
        </div>

        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Cancellation Reason <span class="text-red-500">*</span>
          </label>
          <textarea
            v-model="reason"
            rows="3"
            placeholder="e.g. Erroneous destination selected; messenger recalled due to missing signature..."
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs resize-none"
            required
          ></textarea>
        </div>

        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Authorized Officer Name
          </label>
          <input
            v-model="cancelledBy"
            type="text"
            placeholder="e.g. Desk Officer Reyes"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
          />
        </div>

        <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
          The in-transit movement record will be preserved with status <strong>Cancelled</strong> for audit history. The document's confirmed location will be restored to <strong>{{ document?.lastConfirmedOfficeName || 'its last confirmed office' }}</strong>.
        </div>

        <!-- Footer -->
        <div class="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            @click="emit('close')"
          >
            Go Back
          </BaseButton>

          <BaseButton
            type="submit"
            variant="danger"
            size="sm"
            :loading="isSubmitting"
          >
            Confirm Cancellation
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
