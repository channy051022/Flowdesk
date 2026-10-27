<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import AppSidebar from '../components/layouts/AppSidebar.vue'
import AppHeader from '../components/layouts/AppHeader.vue'
import ToastContainer from '../components/common/ToastContainer.vue'
import DueOverdueReminderModal from '../components/common/DueOverdueReminderModal.vue'

const appStore = useAppStore()
const isDesktop = computed(() => typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop))
</script>

<template>
  <div class="min-h-screen bg-[#FFF9FB] dark:bg-[#121113] flex text-[#3D2934] dark:text-[#F5EDF1] antialiased transition-colors duration-150">
    <!-- Global Shadcn-style Notifications -->
    <ToastContainer />

    <!-- Due & Overdue System Reminder Modal Popup -->
    <DueOverdueReminderModal />

    <!-- Application Sidebar -->
    <AppSidebar />

    <!-- Main Content Shell -->
    <div
      :class="[
        'flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out',
        appStore.isSidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
      ]"
    >
      <!-- Top Sticky Header -->
      <AppHeader />

      <!-- Page Main Content Area -->
      <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <slot />
      </main>

      <!-- Elegant Minimalist Footer -->
      <!-- <footer class="py-4 px-6 border-t border-[#F0E3E9] dark:border-[#2D252B] bg-white/60 dark:bg-[#1A1719]/80 text-center text-[11px] text-[#806B76] dark:text-[#BCAEBA] transition-colors duration-150">
        <div class="flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto gap-2">
          <span>FlowDesk • Local Document Tracking & Office Productivity Workspace</span>
          <span class="inline-flex items-center gap-1.5 font-medium">
            <span :class="['w-1.5 h-1.5 rounded-full', isDesktop ? 'bg-[#D9467B]' : 'bg-[#27845A]']"></span>
            {{ isDesktop ? 'Windows Desktop (SQLite 3 Local Database)' : 'Private Single-User PWA (Dexie IndexedDB)' }}
          </span>
        </div>
      </footer> -->
    </div>
  </div>
</template>
