<script setup>
import { ref } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  Info
} from 'lucide-vue-next'

const currentMonth = ref('October 2026')

// Sample calendar deadline events
const sampleEvents = ref([
  {
    id: 1,
    title: 'Submission of Regional Logistics Endorsement',
    date: 'Oct 16, 2026',
    time: '11:30 AM',
    type: 'Deadline',
    priority: 'urgent',
    office: 'Planning Division'
  },
  {
    id: 2,
    title: 'Inventory Compliance Report Deadline',
    date: 'Oct 19, 2026',
    time: '3:00 PM',
    type: 'Submission',
    priority: 'high',
    office: 'General Services'
  },
  {
    id: 3,
    title: 'Weekly Administrative Outgoing Courier Run',
    date: 'Oct 21, 2026',
    time: '2:00 PM',
    type: 'Routing Run',
    priority: 'routine',
    office: 'Records Section'
  },
  {
    id: 4,
    title: 'Monthly Document Routing Turnaround Summary',
    date: 'Oct 30, 2026',
    time: '5:00 PM',
    type: 'Report',
    priority: 'routine',
    office: 'Office of Director'
  }
])
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs">
      <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div>
        <span class="font-semibold text-forest-950">Calendar Module Shell:</span>
        Deadlines and events shown below represent administrative compliance schedules. Full monthly grid interaction will be connected in the Calendar Phase.
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Calendar & Deadlines
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Track statutory deadlines, courier pickup schedules, and submission dates.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton variant="primary" size="sm">
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Add Deadline Reminder
        </BaseButton>
      </div>
    </div>

    <!-- Calendar Controls & Schedule Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Agenda List (Col 12 -> lg:7) -->
      <div class="lg:col-span-7 space-y-4">
        <BaseCard title="Upcoming Official Deadlines">
          <div class="divide-y divide-zinc-100 -mx-5 -my-5">
            <div
              v-for="ev in sampleEvents"
              :key="ev.id"
              class="p-4 hover:bg-zinc-50/80 transition-colors flex items-start justify-between gap-3"
            >
              <div class="flex items-start gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-forest-50 border border-forest-100 flex flex-col items-center justify-center text-forest-800 shrink-0">
                  <span class="text-[10px] font-semibold uppercase leading-none">{{ ev.date.split(' ')[0] }}</span>
                  <span class="text-sm font-bold leading-tight">{{ ev.date.split(' ')[1].replace(',', '') }}</span>
                </div>

                <div class="space-y-1 min-w-0">
                  <h4 class="text-xs sm:text-sm font-medium text-zinc-900">
                    {{ ev.title }}
                  </h4>
                  <div class="flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
                    <span class="text-zinc-700 font-medium">{{ ev.office }}</span>
                    <span>•</span>
                    <span class="flex items-center gap-1 text-zinc-600">
                      <Clock class="w-3 h-3 text-zinc-400" />
                      {{ ev.time }}
                    </span>
                    <span>•</span>
                    <span class="text-zinc-500">{{ ev.type }}</span>
                  </div>
                </div>
              </div>

              <BaseBadge :variant="ev.priority" size="xs">
                {{ ev.priority }}
              </BaseBadge>
            </div>
          </div>
        </BaseCard>
      </div>

      <!-- Month Overview Mini-Calendar (Col 12 -> lg:5) -->
      <div class="lg:col-span-5 space-y-4">
        <BaseCard>
          <template #header>
            <div class="flex items-center justify-between w-full">
              <span class="text-xs font-semibold text-zinc-900">{{ currentMonth }}</span>
              <div class="flex items-center gap-1">
                <button type="button" class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <button type="button" class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          </template>

          <!-- Simple Calendar Days Grid -->
          <div class="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500 mb-2 font-medium">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
          </div>
          <div class="grid grid-cols-7 gap-1 text-center text-xs">
            <div class="p-2 text-zinc-300">27</div>
            <div class="p-2 text-zinc-300">28</div>
            <div class="p-2 text-zinc-300">29</div>
            <div class="p-2 text-zinc-300">30</div>
            <div class="p-2 rounded hover:bg-zinc-100">1</div>
            <div class="p-2 rounded hover:bg-zinc-100">2</div>
            <div class="p-2 rounded hover:bg-zinc-100">3</div>

            <div class="p-2 rounded hover:bg-zinc-100">4</div>
            <div class="p-2 rounded hover:bg-zinc-100">5</div>
            <div class="p-2 rounded hover:bg-zinc-100">6</div>
            <div class="p-2 rounded hover:bg-zinc-100">7</div>
            <div class="p-2 rounded hover:bg-zinc-100">8</div>
            <div class="p-2 rounded hover:bg-zinc-100">9</div>
            <div class="p-2 rounded hover:bg-zinc-100">10</div>

            <div class="p-2 rounded hover:bg-zinc-100">11</div>
            <div class="p-2 rounded hover:bg-zinc-100">12</div>
            <div class="p-2 rounded hover:bg-zinc-100">13</div>
            <div class="p-2 rounded hover:bg-zinc-100 relative">
              14
              <span class="w-1 h-1 rounded-full bg-zinc-400 absolute bottom-1 left-1/2 -translate-x-1/2"></span>
            </div>
            <div class="p-2 rounded hover:bg-zinc-100 relative">
              15
              <span class="w-1 h-1 rounded-full bg-amber-500 absolute bottom-1 left-1/2 -translate-x-1/2"></span>
            </div>
            <div class="p-2 rounded bg-forest-800 text-white font-bold relative shadow-xs">
              16
              <span class="w-1 h-1 rounded-full bg-emerald-300 absolute bottom-1 left-1/2 -translate-x-1/2"></span>
            </div>
            <div class="p-2 rounded hover:bg-zinc-100">17</div>

            <div class="p-2 rounded hover:bg-zinc-100">18</div>
            <div class="p-2 rounded hover:bg-zinc-100 relative">
              19
              <span class="w-1 h-1 rounded-full bg-red-500 absolute bottom-1 left-1/2 -translate-x-1/2"></span>
            </div>
            <div class="p-2 rounded hover:bg-zinc-100">20</div>
            <div class="p-2 rounded hover:bg-zinc-100">21</div>
            <div class="p-2 rounded hover:bg-zinc-100">22</div>
            <div class="p-2 rounded hover:bg-zinc-100">23</div>
            <div class="p-2 rounded hover:bg-zinc-100">24</div>

            <div class="p-2 rounded hover:bg-zinc-100">25</div>
            <div class="p-2 rounded hover:bg-zinc-100">26</div>
            <div class="p-2 rounded hover:bg-zinc-100">27</div>
            <div class="p-2 rounded hover:bg-zinc-100">28</div>
            <div class="p-2 rounded hover:bg-zinc-100">29</div>
            <div class="p-2 rounded hover:bg-zinc-100">30</div>
            <div class="p-2 rounded hover:bg-zinc-100">31</div>
          </div>
        </BaseCard>
      </div>
    </div>
  </div>
</template>
