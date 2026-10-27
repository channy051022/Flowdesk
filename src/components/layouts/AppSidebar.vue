<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../../stores/app'
import { useThemeStore } from '../../stores/theme'
import {
  LayoutDashboard,
  Landmark,
  CheckSquare,
  FileText,
  Kanban,
  Calendar,
  History,
  Building2,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
  Sun,
  Moon,
  Monitor,
  Settings
} from 'lucide-vue-next'
import appLogo from '../../assets/icon.png'
import { getFinanceSummaryMetrics } from '../../services/financeService'
import { getTaskSummaryMetrics } from '../../services/taskService'
import { getDocumentSummaryMetrics } from '../../services/documentService'

const appStore = useAppStore()
const themeStore = useThemeStore()
const route = useRoute()
const router = useRouter()

// Real-time dynamic counts from local Dexie / SQLite database
const counts = ref({
  finance: 0,
  tasks: 0,
  documents: 0
})

const loadSidebarCounts = async () => {
  try {
    const [finMetrics, taskMetrics, docMetrics] = await Promise.all([
      getFinanceSummaryMetrics().catch(() => ({ totalRecords: 0 })),
      getTaskSummaryMetrics().catch(() => ({ pendingCount: 0 })),
      getDocumentSummaryMetrics().catch(() => ({ totalActive: 0 }))
    ])
    counts.value = {
      finance: finMetrics?.totalRecords || 0,
      tasks: taskMetrics?.pendingCount ?? taskMetrics?.totalTasks ?? 0,
      documents: docMetrics?.totalActive ?? 0
    }
  } catch (err) {
    console.warn('Failed to load sidebar navigation counts:', err)
  }
}

let countTimer = null

onMounted(() => {
  loadSidebarCounts()
  countTimer = setInterval(loadSidebarCounts, 3000)
  window.addEventListener('flowdesk:refresh-counts', loadSidebarCounts)
  window.addEventListener('focus', loadSidebarCounts)
})

onUnmounted(() => {
  if (countTimer) clearInterval(countTimer)
  window.removeEventListener('flowdesk:refresh-counts', loadSidebarCounts)
  window.removeEventListener('focus', loadSidebarCounts)
})

watch(() => route.fullPath, () => {
  loadSidebarCounts()
})

// Grouped navigation items for clean visual hierarchy with dynamic counts
const navSections = computed(() => [
  {
    title: 'Work Desk',
    items: [
      {
        name: 'Dashboard',
        to: '/dashboard',
        icon: LayoutDashboard,
        badge: null
      },
      {
        name: 'Finance Monitoring',
        to: '/finance',
        icon: Landmark,
        badge: counts.value.finance > 0 ? String(counts.value.finance) : null
      },
      {
        name: 'My Tasks',
        to: '/tasks',
        icon: CheckSquare,
        badge: counts.value.tasks > 0 ? String(counts.value.tasks) : null
      },
      {
        name: 'Document Tracker',
        to: '/documents',
        icon: FileText,
        badge: counts.value.documents > 0 ? String(counts.value.documents) : null,
        badgeUrgent: true
      },
      {
        name: 'Workflow Board',
        to: '/workflow',
        icon: Kanban,
        badge: null
      }
    ]
  },
  {
    title: 'Records & Reference',
    items: [
      {
        name: 'Calendar',
        to: '/calendar',
        icon: Calendar,
        badge: null
      },
      {
        name: 'Activity History',
        to: '/activity',
        icon: History,
        badge: null
      },
      {
        name: 'Office Directory',
        to: '/directory',
        icon: Building2,
        badge: null
      },
      {
        name: 'Reports',
        to: '/reports',
        icon: BarChart3,
        badge: null
      }
    ]
  },
  {
    title: 'System & Preferences',
    items: [
      {
        name: 'Settings',
        to: '/settings',
        icon: Settings,
        badge: null
      }
    ]
  }
])

const handleNavClick = () => {
  if (appStore.isMobileSidebarOpen) {
    appStore.closeMobileSidebar()
  }
}
</script>

<template>
  <div>
    <!-- Mobile Backdrop -->
    <transition
      enter-active-class="transition-opacity ease-linear duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity ease-linear duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="appStore.isMobileSidebarOpen"
        class="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-xs lg:hidden"
        @click="appStore.closeMobileSidebar"
        aria-hidden="true"
      />
    </transition>

    <!-- Sidebar Container -->
    <aside
      :class="[
        'fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-[#FFFDFE] dark:bg-[#1A1719] border-r border-[#F0E3E9] dark:border-[#2D252B] transition-all duration-200 ease-in-out',
        // Desktop collapse width
        appStore.isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
        // Mobile visibility
        appStore.isMobileSidebarOpen ? 'translate-x-0 w-72 shadow-xl' : '-translate-x-full lg:translate-x-0'
      ]"
    >
      <!-- Top Brand Header -->
      <div
        :class="[
          'h-14 flex items-center border-b border-[#F0E3E9] dark:border-[#2D252B] shrink-0 transition-all',
          appStore.isSidebarCollapsed && !appStore.isMobileSidebarOpen
            ? 'justify-center px-2'
            : 'justify-between px-3.5'
        ]"
      >
        <router-link
          to="/dashboard"
          @click="handleNavClick"
          class="flex items-center gap-2.5 overflow-hidden group focus:outline-none"
        >
          <!-- Logo Mark -->
          <img
            :src="appLogo"
            alt="FlowDesk Logo"
            class="w-8 h-8 object-contain shrink-0 group-hover:scale-105 transition-transform"
          />

          <!-- Logo Text -->
          <div
            v-if="!appStore.isSidebarCollapsed || appStore.isMobileSidebarOpen"
            class="flex flex-col min-w-0"
          >
            <span class="text-sm font-bold tracking-tight text-[#3D2934] dark:text-[#F5EDF1] truncate">
              FlowDesk
            </span>
            <span class="text-[10px] font-medium text-[#D9467B] dark:text-[#F294B7] tracking-wider uppercase truncate">
              Gov Document Desk
            </span>
          </div>
        </router-link>

        <!-- Mobile Close Button -->
        <button
          @click="appStore.closeMobileSidebar"
          type="button"
          class="lg:hidden p-1.5 rounded-md text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] transition-colors"
          aria-label="Close navigation sidebar"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Navigation Links List -->
      <div class="flex-1 overflow-y-auto px-2.5 py-4 space-y-6">
        <div
          v-for="(section, sIdx) in navSections"
          :key="sIdx"
          class="space-y-1"
        >
          <!-- Section Heading -->
          <div
            v-if="(!appStore.isSidebarCollapsed || appStore.isMobileSidebarOpen)"
            class="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-[#A18D98] dark:text-[#806B76] uppercase"
          >
            {{ section.title }}
          </div>

          <div
            v-else
            class="h-px bg-[#F0E3E9] dark:bg-[#2D252B] my-2 mx-1"
            aria-hidden="true"
          />

          <!-- Links -->
          <router-link
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            @click="handleNavClick"
            v-slot="{ isActive }"
            custom
          >
            <a
              :href="item.to"
              @click.prevent="router.push(item.to); handleNavClick()"
              :class="[
                'group flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 relative select-none',
                isActive
                  ? 'bg-[#FCE7F0] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7] font-semibold shadow-2xs'
                  : 'text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23]',
                appStore.isSidebarCollapsed && !appStore.isMobileSidebarOpen
                  ? 'justify-center px-0'
                  : ''
              ]"
              :title="item.name"
            >
              <component
                :is="item.icon"
                :class="[
                  'w-4 h-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-[#D9467B] dark:text-[#F294B7]'
                    : 'text-[#A18D98] dark:text-[#806B76] group-hover:text-[#D9467B] dark:group-hover:text-[#F294B7]'
                ]"
              />

              <!-- Label -->
              <span
                v-if="!appStore.isSidebarCollapsed || appStore.isMobileSidebarOpen"
                class="truncate flex-1"
              >
                {{ item.name }}
              </span>

              <!-- Badge -->
              <span
                v-if="item.badge && (!appStore.isSidebarCollapsed || appStore.isMobileSidebarOpen)"
                :class="[
                  'text-[10px] font-semibold px-1.5 py-0.2 rounded-full transition-colors',
                  isActive
                    ? 'bg-[#D9467B] text-white'
                    : item.badgeUrgent
                    ? 'bg-[#FFF0F5] dark:bg-rose-950/40 text-[#C2415D] dark:text-rose-300 border border-[#F3C4D7] dark:border-rose-900/50'
                    : 'bg-[#FAF4F7] dark:bg-[#251F23] text-[#806B76] dark:text-[#BCAEBA] border border-[#F0E3E9] dark:border-[#3D2D38]'
                ]"
              >
                {{ item.badge }}
              </span>

              <!-- Dot indicator when collapsed -->
              <span
                v-if="item.badge && appStore.isSidebarCollapsed && !appStore.isMobileSidebarOpen"
                class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#D9467B]"
              />
            </a>
          </router-link>
        </div>
      </div>

      <!-- Desktop Sidebar Footer / Theme Switcher / Collapse Toggle -->
      <div class="p-2.5 border-t border-[#F0E3E9] dark:border-[#2D252B] bg-[#FFF7FA]/60 dark:bg-[#141214]/60 shrink-0 space-y-2">
        <!-- Theme Segmented Control (Expanded mode) -->
        <div
          v-if="!appStore.isSidebarCollapsed || appStore.isMobileSidebarOpen"
          class="flex items-center justify-between p-1 bg-white dark:bg-[#251F23] border border-[#F0E3E9] dark:border-[#2D252B] rounded-lg"
        >
          <button
            @click="themeStore.setPreference('light')"
            type="button"
            :class="[
              'flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer',
              themeStore.preference === 'light'
                ? 'bg-[#FFF0F5] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7] font-semibold shadow-2xs'
                : 'text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1]'
            ]"
            title="Light Theme"
          >
            <Sun class="w-3.5 h-3.5 text-amber-500" />
            <span>Light</span>
          </button>
          <button
            @click="themeStore.setPreference('dark')"
            type="button"
            :class="[
              'flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer',
              themeStore.preference === 'dark'
                ? 'bg-[#FFF0F5] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7] font-semibold shadow-2xs'
                : 'text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1]'
            ]"
            title="Dark Theme"
          >
            <Moon class="w-3.5 h-3.5 text-rose-400" />
            <span>Dark</span>
          </button>
          <button
            @click="themeStore.setPreference('system')"
            type="button"
            :class="[
              'flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer',
              themeStore.preference === 'system'
                ? 'bg-[#FFF0F5] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7] font-semibold shadow-2xs'
                : 'text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1]'
            ]"
            title="System OS Theme"
          >
            <Monitor class="w-3.5 h-3.5 text-[#D9467B]" />
            <span>Auto</span>
          </button>
        </div>

        <!-- Collapsed Theme Button (Icon Only) -->
        <div v-else class="flex justify-center">
          <button
            @click="themeStore.toggleTheme"
            type="button"
            class="p-1.5 rounded-lg text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] transition-colors cursor-pointer"
            :title="`Theme: ${themeStore.preference} (Click to toggle)`"
          >
            <Sun v-if="themeStore.preference === 'light'" class="w-4 h-4 text-amber-500" />
            <Moon v-else-if="themeStore.preference === 'dark'" class="w-4 h-4 text-rose-400" />
            <Monitor v-else class="w-4 h-4 text-[#D9467B]" />
          </button>
        </div>

        <!-- Desktop Collapse Button -->
        <button
          @click="appStore.toggleSidebar"
          type="button"
          class="hidden lg:flex w-full items-center justify-center gap-2 px-2 py-1.5 text-xs text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] rounded-lg transition-colors cursor-pointer"
          :title="appStore.isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :aria-label="appStore.isSidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'"
        >
          <component
            :is="appStore.isSidebarCollapsed ? ChevronRight : ChevronLeft"
            class="w-4 h-4 text-[#A18D98] dark:text-[#806B76]"
          />
          <span v-if="!appStore.isSidebarCollapsed" class="text-[11px] font-medium">
            Collapse sidebar
          </span>
        </button>
      </div>
    </aside>
  </div>
</template>
