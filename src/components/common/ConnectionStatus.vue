<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../../stores/app'
import { Wifi, WifiOff, HardDrive, Database, ShieldCheck, Info, X, FolderOpen, Archive } from 'lucide-vue-next'
import StorageBackupModal from './StorageBackupModal.vue'

const appStore = useAppStore()
const showDetails = ref(false)
const showStorageModal = ref(false)

const isDesktop = computed(() => {
  return typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop)
})

const toggleDetails = () => {
  showDetails.value = !showDetails.value
}

const openStorageManager = () => {
  showDetails.value = false
  showStorageModal.value = true
}
</script>

<template>
  <div class="relative inline-block">
    <!-- Status Trigger Badge -->
    <button
      @click="toggleDetails"
      type="button"
      :class="[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#D9467B] h-7 leading-none cursor-pointer',
        isDesktop
          ? 'bg-[#FFF0F5] text-[#D9467B] border-[#F3C4D7] hover:bg-[#FCE7F0]'
          : (appStore.isOnline
              ? 'bg-emerald-50 text-[#27845A] border-emerald-200 hover:bg-emerald-100/80'
              : 'bg-amber-50 text-[#B7791F] border-amber-200 hover:bg-amber-100/80')
      ]"
      :aria-label="isDesktop ? 'System status: Windows Desktop (SQLite 3)' : (appStore.isOnline ? 'Network status: Online (Local Storage)' : 'Network status: Offline (Local Storage)')"
      :title="isDesktop ? 'FlowDesk Desktop • SQLite 3 Database' : (appStore.isOnline ? 'Online • Local DB' : 'Offline • Local DB')"
    >
      <span
        :class="[
          'w-1.5 h-1.5 rounded-full',
          isDesktop ? 'bg-[#D9467B]' : (appStore.isOnline ? 'bg-[#27845A] animate-pulse' : 'bg-[#B7791F]')
        ]"
      ></span>
      
      <component :is="isDesktop ? Database : (appStore.isOnline ? Wifi : WifiOff)" class="w-3.5 h-3.5" />
      
      <span class="hidden sm:inline">
        {{ isDesktop ? 'Desktop • SQLite' : (appStore.isOnline ? 'Browser • Local DB' : 'Offline Mode') }}
      </span>
    </button>

    <!-- Detailed Status Modal / Popover -->
    <div
      v-if="showDetails"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:bg-transparent sm:p-0"
    >
      <div class="w-full max-w-sm sm:max-w-none bg-white rounded-xl shadow-lg border border-[#F0E3E9] p-4 text-left text-[#3D2934]">
        <div class="flex items-center justify-between pb-2 mb-3 border-b border-[#F0E3E9]">
          <div class="flex items-center gap-2">
            <span
              :class="[
                'w-2 h-2 rounded-full',
                isDesktop ? 'bg-[#D9467B]' : (appStore.isOnline ? 'bg-[#27845A]' : 'bg-[#B7791F]')
              ]"
            ></span>
            <span class="text-xs font-bold uppercase tracking-wider text-[#A18D98]">
              System & Storage Status
            </span>
          </div>
          <button
            @click="showDetails = false"
            type="button"
            class="p-1 rounded-md text-[#806B76] hover:text-[#3D2934] hover:bg-[#FFF7FA] transition-colors"
            aria-label="Close status dialog"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Connection Summary -->
        <div class="space-y-2.5 text-xs">
          <div class="flex items-center justify-between p-2 rounded-lg bg-[#FFF7FA] border border-[#F0E3E9]">
            <span class="text-[#806B76] flex items-center gap-1.5">
              <HardDrive class="w-3.5 h-3.5 text-[#D9467B]" />
              Storage Engine
            </span>
            <span class="font-bold text-[#D9467B]">
              {{ isDesktop ? 'SQLite 3 (Desktop)' : 'IndexedDB (Browser)' }}
            </span>
          </div>

          <div class="flex items-center justify-between p-2 rounded-lg bg-[#FFF7FA] border border-[#F0E3E9]">
            <span class="text-[#806B76] flex items-center gap-1.5">
              <component :is="appStore.isOnline ? Wifi : WifiOff" class="w-3.5 h-3.5 text-[#806B76]" />
              Network State
            </span>
            <span :class="appStore.isOnline ? 'text-[#27845A] font-semibold' : 'text-[#B7791F] font-semibold'">
              {{ appStore.isOnline ? 'Online / Localhost' : 'Offline' }}
            </span>
          </div>

          <div class="flex items-center justify-between p-2 rounded-lg bg-[#FFF7FA] border border-[#F0E3E9]">
            <span class="text-[#806B76] flex items-center gap-1.5">
              <ShieldCheck class="w-3.5 h-3.5 text-[#D9467B]" />
              Data Privacy
            </span>
            <span class="text-[#3D2934] font-medium">
              100% Local Device
            </span>
          </div>

          <!-- Explanatory Notice -->
          <div class="p-2.5 rounded-lg bg-[#FFF0F5] border border-[#F3C4D7] text-[11px] text-[#3D2934] leading-relaxed">
            <div class="flex items-start gap-1.5">
              <Info class="w-3.5 h-3.5 text-[#D9467B] shrink-0 mt-0.5" />
              <span>
                {{ isDesktop
                  ? 'Running as an installed Windows desktop application. All document routing slips, tasks, and file attachments are stored locally.'
                  : 'FlowDesk is running in browser development mode. Use npm run electron:dev to open as desktop.'
                }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-3 pt-2 flex items-center justify-between gap-2">
          <button
            @click="openStorageManager"
            type="button"
            class="text-xs px-2.5 py-1.5 font-medium rounded-lg bg-[#FCE7F0] text-[#D9467B] hover:bg-[#F8CFDF] transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <Archive class="w-3.5 h-3.5" />
            <span>Manage Storage</span>
          </button>
          
          <button
            @click="showDetails = false"
            type="button"
            class="text-xs px-3 py-1.5 font-medium rounded-lg bg-[#FFF7FA] text-[#806B76] hover:bg-[#FAF4F7] transition-colors cursor-pointer border border-[#F0E3E9]"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Storage and Backup Modal -->
    <StorageBackupModal
      :isOpen="showStorageModal"
      @close="showStorageModal = false"
    />
  </div>
</template>
