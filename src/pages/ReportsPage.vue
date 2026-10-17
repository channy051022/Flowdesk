<script setup>
import { ref } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import {
  BarChart3,
  TrendingUp,
  Clock,
  FileText,
  Send,
  Download,
  Info,
  Calendar,
  AlertCircle
} from 'lucide-vue-next'

const selectedPeriod = ref('month')

// Sample metrics for reports
const sampleReportMetrics = [
  {
    title: 'Average Desk Turnaround Time',
    value: '1.8 Days',
    subtitle: 'Target: Under 3.0 days (Citizen Charter compliance)',
    change: '-0.4 days vs last month',
    positive: true
  },
  {
    title: 'Monthly Document Volume',
    value: '48 Slips',
    subtitle: '32 Received • 16 Dispatched',
    change: '+12% vs last month',
    positive: true
  },
  {
    title: 'Overdue / Aging Matters (> 3 Days)',
    value: '1 Document',
    subtitle: 'ORD-2026-0088 awaiting legal inputs',
    change: 'Requires priority endorsement',
    positive: false
  }
]

// Sample division volume breakdown
const divisionBreakdown = [
  { name: 'Planning & Policy Management Division', incoming: 14, outgoing: 6, avgDays: '1.5 days' },
  { name: 'Office of the Regional Director', incoming: 10, outgoing: 12, avgDays: '1.2 days' },
  { name: 'General Services Division', incoming: 8, outgoing: 4, avgDays: '2.1 days' },
  { name: 'Budget & Finance Management Division', incoming: 7, outgoing: 5, avgDays: '1.9 days' },
  { name: 'Human Resource Management Division', incoming: 5, outgoing: 3, avgDays: '2.4 days' }
]
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs">
      <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div>
        <span class="font-semibold text-forest-950">Reports Module Shell:</span>
        Metrics and turnaround calculations below demonstrate compliance reporting for administrative audits. In the Reports Phase, these will calculate automatically from your local Dexie routing records.
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Reports & Analytics
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Government citizen charter turnaround times, routing volume, and aging document monitors.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton variant="secondary" size="sm">
          <Download class="w-3.5 h-3.5 text-zinc-500 mr-1.5" />
          Export Local Report (CSV)
        </BaseButton>
      </div>
    </div>

    <!-- Metric Highlight Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BaseCard
        v-for="(metric, idx) in sampleReportMetrics"
        :key="idx"
        compact
      >
        <div class="text-xs font-medium text-zinc-500">
          {{ metric.title }}
        </div>
        <div class="mt-2 text-2xl font-bold text-zinc-900">
          {{ metric.value }}
        </div>
        <div class="text-[11px] text-zinc-500 mt-1">
          {{ metric.subtitle }}
        </div>
        <div
          :class="[
            'text-[10px] font-medium mt-2 pt-2 border-t border-zinc-100 flex items-center gap-1',
            metric.positive ? 'text-emerald-700' : 'text-amber-700'
          ]"
        >
          <span>{{ metric.change }}</span>
        </div>
      </BaseCard>
    </div>

    <!-- Division Volume Breakdown Table -->
    <BaseCard title="Inter-Division Document Turnaround Breakdown" subtitle="Compliance metrics by originating division">
      <div class="overflow-x-auto -mx-5 -my-5">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
              <th class="py-3 px-4 font-semibold">Division / Unit</th>
              <th class="py-3 px-4 font-semibold text-center">Incoming Slips</th>
              <th class="py-3 px-4 font-semibold text-center">Dispatched Slips</th>
              <th class="py-3 px-4 font-semibold text-center">Avg Turnaround</th>
              <th class="py-3 px-4 font-semibold text-right">Charter Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr
              v-for="row in divisionBreakdown"
              :key="row.name"
              class="hover:bg-zinc-50/80 transition-colors"
            >
              <td class="py-3.5 px-4 font-medium text-zinc-900">
                {{ row.name }}
              </td>
              <td class="py-3.5 px-4 text-center font-mono font-medium text-zinc-700">
                {{ row.incoming }}
              </td>
              <td class="py-3.5 px-4 text-center font-mono font-medium text-zinc-700">
                {{ row.outgoing }}
              </td>
              <td class="py-3.5 px-4 text-center text-zinc-600">
                {{ row.avgDays }}
              </td>
              <td class="py-3.5 px-4 text-right">
                <BaseBadge variant="success" size="xs">
                  Compliant (&lt;3d)
                </BaseBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>
  </div>
</template>
