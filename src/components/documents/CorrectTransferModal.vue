<script setup>
import { ref, watch, onMounted } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { getOffices } from '../../services/officeService'
import { correctMovement } from '../../services/documentService'
import { AlertCircle, X, ShieldAlert } from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  movement: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'corrected'])

const reason = ref('')
const correctedBy = ref('Internal Auditor / Desk Officer')
const correctedOfficeId = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const officesList = ref([])

onMounted(async () => {
  officesList.value = await getOffices()
})

watch(
  () => props.isOpen,
  async (val) => {
    if (val) {
      officesList.value = await getOffices()
      reason.value = ''
      correctedBy.value = 'Internal Auditor / Desk Officer'
      correctedOfficeId.value = props.movement?.toOfficeId ? String(props.movement.toOfficeId) : ''
      errorMessage.value = ''
    }
  }
)

const handleSubmit = async () => {
  if (!props.movement) return
  if (!reason.value.trim()) {
    errorMessage.value = 'A correction reason is required for administrative audit.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await correctMovement(props.movement.id, {
      correctionReason: reason.value.trim(),
      correctedBy: correctedBy.value.trim(),
      correctedOfficeId: correctedOfficeId.value ? Number(correctedOfficeId.value) : null
    })

    emit('corrected')
    emit('close')
  } catch (err) {
    errorMessage.value = err.message || 'Failed to record movement correction.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden text-left my-8"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <ShieldAlert class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-zinc-900 leading-tight">
              Audit Correction on Movement Record
            </h3>
            <p class="text-xs text-zinc-500 mt-0.5">
              Formally log correction on completed transfer without erasing history
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
          <AlertCircle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>{{ errorMessage }}</div>
        </div>

        <div v-if="movement" class="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-1">
          <div class="text-[10px] uppercase font-bold text-zinc-500">
            Movement Entry #{{ movement.id }}
          </div>
          <div class="font-semibold text-zinc-900">
            {{ movement.fromOfficeName || 'Origin' }} &rarr; {{ movement.toOfficeName || 'Destination' }}
          </div>
          <div class="text-[11px] text-zinc-500">
            Status: <span class="capitalize font-medium">{{ movement.status }}</span>
          </div>
        </div>

        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Corrected Destination Office (Optional Reassignment)
          </label>
          <select
            v-model="correctedOfficeId"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
          >
            <option value="">Keep current office assignment</option>
            <option v-for="off in officesList" :key="off.id" :value="off.id">
              [{{ off.code }}] {{ off.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Correction / Reversal Reason <span class="text-red-500">*</span>
          </label>
          <textarea
            v-model="reason"
            rows="3"
            placeholder="Explain why this historical movement record is being amended (e.g. Document was delivered to Room 214 instead of Room 205)..."
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs resize-none"
            required
          ></textarea>
        </div>

        <div>
          <label class="block font-semibold text-zinc-800 mb-1">
            Auditing Officer / Corrected By
          </label>
          <input
            v-model="correctedBy"
            type="text"
            class="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
            required
          />
        </div>

        <div class="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100 text-[11px] text-zinc-500 leading-relaxed">
          The original dispatch will not be deleted. Its status will be permanently marked as <strong>Corrected</strong> with the stamp of the auditing officer.
        </div>

        <!-- Footer -->
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
            Save Audit Correction
          </BaseButton>
        </div>
      </form>
    </div>
  </div>
</template>
