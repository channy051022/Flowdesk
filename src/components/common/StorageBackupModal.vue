<script setup>
import { ref, onMounted, computed } from 'vue'
import {
  HardDrive,
  Database,
  FolderOpen,
  Archive,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  FileText,
  CheckSquare,
  Landmark,
  ExternalLink,
  Info
} from 'lucide-vue-next'
import BaseButton from './BaseButton.vue'
import BaseBadge from './BaseBadge.vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'backupRestored'])

const isDesktop = computed(() => {
  return typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop)
})

const storageInfo = ref(null)
const stats = ref({
  documents: 0,
  tasks: 0,
  finance: 0,
  movements: 0,
  attachments: 0
})
const isLoading = ref(false)
const actionStatus = ref(null)
const isBackingUp = ref(false)
const isRestoring = ref(false)

const loadSystemInfo = async () => {
  if (!isDesktop.value) return

  isLoading.value = true
  actionStatus.value = null
  try {
    const info = await window.flowdeskAPI.files.getStorageInfo()
    storageInfo.value = info

    // Load record stats from SQLite
    const docs = await window.flowdeskAPI.db.count('documents')
    const tasks = await window.flowdeskAPI.db.count('tasks')
    const finance = await window.flowdeskAPI.db.count('financeRecords')
    const movements = await window.flowdeskAPI.db.count('movements')
    const attachments = await window.flowdeskAPI.db.count('attachments')

    stats.value = {
      documents: docs,
      tasks,
      finance,
      movements,
      attachments
    }
  } catch (err) {
    console.error('Failed to load storage info:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  if (props.isOpen) {
    loadSystemInfo()
  }
})

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleOpenFolder = async (type) => {
  if (!isDesktop.value) return
  try {
    await window.flowdeskAPI.files.openFolder(type)
  } catch (err) {
    actionStatus.value = {
      type: 'error',
      message: `Failed to open folder: ${err.message}`
    }
  }
}

const handleCreateBackup = async () => {
  if (!isDesktop.value) return
  isBackingUp.value = true
  actionStatus.value = null
  try {
    const res = await window.flowdeskAPI.backup.createBackup()
    actionStatus.value = {
      type: 'success',
      message: `Safe local backup created successfully at: ${res.backupFolder}`,
      manifest: res.manifest
    }
    await loadSystemInfo()
  } catch (err) {
    actionStatus.value = {
      type: 'error',
      message: `Backup failed: ${err.message}`
    }
  } finally {
    isBackingUp.value = false
  }
}

const handleRestoreBackup = async () => {
  if (!isDesktop.value) return
  actionStatus.value = null

  try {
    // 1. Prompt user to select backup folder
    const selectedFolder = await window.flowdeskAPI.backup.selectBackupFolder()
    if (!selectedFolder) return

    // 2. Clear confirmation prompt
    const confirmed = window.confirm(
      `WARNING: Restoring will safely replace your current active database with the contents from: \n\n${selectedFolder}\n\nFlowDesk will automatically take an emergency snapshot of your current data before proceeding. Do you wish to continue?`
    )
    if (!confirmed) return

    isRestoring.value = true
    const res = await window.flowdeskAPI.backup.restoreBackup(selectedFolder)
    actionStatus.value = {
      type: 'success',
      message: `Database and attachments restored successfully! Restored ${res.currentCounts.documents} documents, ${res.currentCounts.tasks} tasks, and ${res.currentCounts.financeRecords} finance records.`
    }
    await loadSystemInfo()
    emit('backupRestored')
  } catch (err) {
    actionStatus.value = {
      type: 'error',
      message: `Restore failed: ${err.message}`
    }
  } finally {
    isRestoring.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#F0E3E9] overflow-hidden flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-[#F0E3E9] flex items-center justify-between bg-[#FFF7FA]">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-forest-100 text-forest-800">
            <HardDrive class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-[#3D2934]">
              Desktop Storage & Local Backups
            </h3>
            <p class="text-xs text-[#806B76]">
              Single-user offline data management and Windows filesystem integration
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1.5 rounded-lg text-[#A18D98] hover:text-[#3D2934] hover:bg-[#FCE7F0] transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-5 overflow-y-auto flex-1">
        <!-- Status Notification Banner -->
        <div
          v-if="actionStatus"
          :class="[
            'p-3.5 rounded-xl border text-xs flex items-start gap-2.5',
            actionStatus.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-[#C2415D] border-rose-200'
          ]"
        >
          <CheckCircle2 v-if="actionStatus.type === 'success'" class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <AlertTriangle v-else class="w-4 h-4 text-[#C2415D] shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="font-medium leading-relaxed">{{ actionStatus.message }}</p>
            <div v-if="actionStatus.manifest" class="mt-1.5 pt-1.5 border-t border-emerald-200/60 text-[11px] space-y-0.5">
              <span>Timestamp: <strong>{{ actionStatus.manifest.timestamp }}</strong></span>
              <div>
                Documents: {{ actionStatus.manifest.statistics.documents }} |
                Tasks: {{ actionStatus.manifest.statistics.tasks }} |
                Attachments: {{ actionStatus.manifest.statistics.attachments }}
              </div>
            </div>
          </div>
        </div>

        <!-- Mode Indicator Card -->
        <div class="p-4 rounded-xl border border-[#F0E3E9] bg-[#FFF9FB] flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Database class="w-5 h-5 text-forest-700" />
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-[#3D2934]">Storage Engine:</span>
                <BaseBadge :variant="isDesktop ? 'success' : 'neutral'">
                  {{ isDesktop ? 'SQLite 3 (Windows Desktop)' : 'IndexedDB / Dexie (Browser Mode)' }}
                </BaseBadge>
              </div>
              <p class="text-xs text-[#806B76] mt-0.5">
                {{ isDesktop
                  ? 'Active desktop storage with foreign key constraints and WAL logging'
                  : 'Web browser development mode using client-side IndexedDB'
                }}
              </p>
            </div>
          </div>

          <div v-if="isDesktop && storageInfo" class="text-right">
            <span class="text-[10px] text-[#A18D98] uppercase tracking-wider block">Database Size</span>
            <span class="text-sm font-bold font-mono text-[#3D2934]">{{ formatBytes(storageInfo.dbSize) }}</span>
          </div>
        </div>

        <!-- Desktop Storage Locations Section -->
        <div v-if="isDesktop && storageInfo" class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#624A58] flex items-center gap-1.5">
            <FolderOpen class="w-4 h-4 text-[#806B76]" />
            Computer Storage Locations
          </h4>

          <div class="space-y-2">
            <!-- Database File -->
            <div class="p-3 rounded-xl bg-white border border-[#F0E3E9] flex items-center justify-between text-xs shadow-2xs">
              <div class="min-w-0 pr-3">
                <span class="font-semibold text-[#3D2934] block">SQLite Database File</span>
                <code class="text-[11px] text-[#806B76] truncate block font-mono" :title="storageInfo.storagePaths.dbPath">
                  {{ storageInfo.storagePaths.dbPath }}
                </code>
              </div>
              <button
                @click="handleOpenFolder('data')"
                type="button"
                class="shrink-0 px-2.5 py-1 text-xs font-medium text-forest-800 bg-forest-50 hover:bg-forest-100 rounded-lg border border-forest-200 transition-colors inline-flex items-center gap-1"
              >
                <FolderOpen class="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
            </div>

            <!-- Attachments Folder -->
            <div class="p-3 rounded-xl bg-white border border-[#F0E3E9] flex items-center justify-between text-xs shadow-2xs">
              <div class="min-w-0 pr-3">
                <span class="font-semibold text-[#3D2934] block">Attachments Directory</span>
                <code class="text-[11px] text-[#806B76] truncate block font-mono" :title="storageInfo.storagePaths.attachmentsDir">
                  {{ storageInfo.storagePaths.attachmentsDir }}
                </code>
              </div>
              <button
                @click="handleOpenFolder('attachments')"
                type="button"
                class="shrink-0 px-2.5 py-1 text-xs font-medium text-forest-800 bg-forest-50 hover:bg-forest-100 rounded-lg border border-forest-200 transition-colors inline-flex items-center gap-1"
              >
                <FolderOpen class="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
            </div>

            <!-- Backups Folder -->
            <div class="p-3 rounded-xl bg-white border border-[#F0E3E9] flex items-center justify-between text-xs shadow-2xs">
              <div class="min-w-0 pr-3">
                <span class="font-semibold text-[#3D2934] block">Local Backups Directory</span>
                <code class="text-[11px] text-[#806B76] truncate block font-mono" :title="storageInfo.storagePaths.backupsDir">
                  {{ storageInfo.storagePaths.backupsDir }}
                </code>
              </div>
              <button
                @click="handleOpenFolder('backups')"
                type="button"
                class="shrink-0 px-2.5 py-1 text-xs font-medium text-forest-800 bg-forest-50 hover:bg-forest-100 rounded-lg border border-forest-200 transition-colors inline-flex items-center gap-1"
              >
                <FolderOpen class="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Record Counts Grid -->
        <div v-if="isDesktop" class="space-y-2">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#624A58]">
            Stored Active Records
          </h4>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div class="p-2.5 rounded-xl bg-[#FFF9FB] border border-[#F0E3E9] text-center">
              <span class="text-[10px] text-[#A18D98] uppercase block">Documents</span>
              <span class="text-sm font-bold text-[#3D2934]">{{ stats.documents }}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-[#FFF9FB] border border-[#F0E3E9] text-center">
              <span class="text-[10px] text-[#A18D98] uppercase block">Tasks</span>
              <span class="text-sm font-bold text-[#3D2934]">{{ stats.tasks }}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-[#FFF9FB] border border-[#F0E3E9] text-center">
              <span class="text-[10px] text-[#A18D98] uppercase block">Finance</span>
              <span class="text-sm font-bold text-[#3D2934]">{{ stats.finance }}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-[#FFF9FB] border border-[#F0E3E9] text-center">
              <span class="text-[10px] text-[#A18D98] uppercase block">Movements</span>
              <span class="text-sm font-bold text-[#3D2934]">{{ stats.movements }}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-[#FFF9FB] border border-[#F0E3E9] text-center">
              <span class="text-[10px] text-[#A18D98] uppercase block">Attachments</span>
              <span class="text-sm font-bold text-[#3D2934]">{{ stats.attachments }}</span>
            </div>
          </div>
        </div>

        <!-- Backup & Restore Actions -->
        <div v-if="isDesktop" class="p-4 rounded-xl border border-[#F0E3E9] bg-[#FFF7FA] space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#3D2934] flex items-center gap-1.5">
            <ShieldCheck class="w-4 h-4 text-forest-700" />
            Reliable Offline Backup & Recovery
          </h4>
          <p class="text-xs text-[#806B76] leading-relaxed">
            FlowDesk creates a complete timestamped backup containing the SQLite database and all associated file attachments. Backups remain strictly local to your machine.
          </p>

          <div class="flex flex-wrap items-center gap-2.5 pt-1">
            <BaseButton
              @click="handleCreateBackup"
              variant="primary"
              size="sm"
              :disabled="isBackingUp || isRestoring"
            >
              <Archive class="w-3.5 h-3.5 mr-1.5" />
              <span>{{ isBackingUp ? 'Creating Backup...' : 'Create Local Backup Now' }}</span>
            </BaseButton>

            <BaseButton
              @click="handleRestoreBackup"
              variant="outline"
              size="sm"
              :disabled="isBackingUp || isRestoring"
            >
              <RotateCcw class="w-3.5 h-3.5 mr-1.5" />
              <span>{{ isRestoring ? 'Restoring...' : 'Restore from Backup' }}</span>
            </BaseButton>
          </div>
        </div>

        <!-- Browser Mode Guidance Banner (when opened in browser) -->
        <div v-if="!isDesktop" class="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs space-y-2">
          <div class="flex items-center gap-2 font-bold text-amber-950">
            <Info class="w-4 h-4 text-amber-700" />
            <span>Web Browser Development Environment</span>
          </div>
          <p class="leading-relaxed">
            You are currently viewing FlowDesk via the local Vite web browser server (<code class="bg-amber-100 px-1 py-0.5 rounded">http://localhost:5173</code>). In browser mode, records are safely stored in your browser's IndexedDB.
          </p>
          <p class="leading-relaxed font-medium">
            To run FlowDesk as a full Windows Desktop application with native SQLite database, attachments directory, and Windows installer:
          </p>
          <code class="block p-2 bg-amber-100/80 rounded font-mono text-[11px] text-amber-950">
            npm run electron:dev
          </code>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-3 border-t border-[#F0E3E9] bg-[#FFF9FB] flex items-center justify-between text-xs text-[#806B76]">
        <span>FlowDesk • Windows Desktop SQLite System</span>
        <BaseButton @click="emit('close')" variant="secondary" size="sm">
          Close
        </BaseButton>
      </div>
    </div>
  </div>
</template>
