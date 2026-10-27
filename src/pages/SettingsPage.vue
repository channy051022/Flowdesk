<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import { useThemeStore, THEME_PREFERENCES } from '../stores/theme'
import { useAppStore } from '../stores/app'
import { toast } from '../composables/useToast'
import db from '../db/database'
import {
  Settings,
  Sliders,
  HardDrive,
  Database,
  Palette,
  ShieldCheck,
  Info,
  FolderOpen,
  Archive,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Sun,
  Moon,
  Monitor,
  Check,
  ExternalLink,
  FileText,
  RefreshCw,
  User,
  Building2,
  Save,
  Laptop
} from 'lucide-vue-next'

const router = useRouter()
const themeStore = useThemeStore()
const appStore = useAppStore()

// Active tab
const activeTab = ref('general') // 'general' | 'backup' | 'scanner' | 'about'

// Desktop Electron detection
const isDesktop = computed(() => {
  return typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop)
})

// General Preferences
const userName = ref(localStorage.getItem('flowdesk_user_name') || 'Swettie')
const officeName = ref(localStorage.getItem('flowdesk_office_name') || 'Internal Control & Finance Unit')

const handleSaveProfile = () => {
  localStorage.setItem('flowdesk_user_name', userName.value.trim() || 'Swettie')
  localStorage.setItem('flowdesk_office_name', officeName.value.trim() || 'Internal Control & Finance Unit')
  window.dispatchEvent(new Event('flowdesk:profile-updated'))
  toast.success('Profile and display preferences saved!')
}

// Storage & Backup State
const storageInfo = ref(null)
const stats = ref({
  documents: 0,
  tasks: 0,
  finance: 0,
  movements: 0,
  attachments: 0
})
const isLoadingStorage = ref(false)
const isBackingUp = ref(false)
const isRestoring = ref(false)
const backupStatus = ref(null)

const loadStorageData = async () => {
  isLoadingStorage.value = true
  try {
    if (isDesktop.value) {
      storageInfo.value = await window.flowdeskAPI.files.getStorageInfo()
      const [docs, tasks, finance, movements, attachments] = await Promise.all([
        window.flowdeskAPI.db.count('documents').catch(() => 0),
        window.flowdeskAPI.db.count('tasks').catch(() => 0),
        window.flowdeskAPI.db.count('financeRecords').catch(() => 0),
        window.flowdeskAPI.db.count('movements').catch(() => 0),
        window.flowdeskAPI.db.count('attachments').catch(() => 0)
      ])
      stats.value = { documents: docs, tasks, finance, movements, attachments }
    } else {
      // Browser Dexie mode
      const [docs, tasks, finance, movements] = await Promise.all([
        db.documents.count().catch(() => 0),
        db.tasks.count().catch(() => 0),
        db.financeRecords.count().catch(() => 0),
        db.movements.count().catch(() => 0)
      ])
      stats.value = { documents: docs, tasks, finance, movements, attachments: 0 }
    }
  } catch (err) {
    console.warn('Failed to load storage details:', err)
  } finally {
    isLoadingStorage.value = false
  }
}

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleOpenFolder = async (type) => {
  if (!isDesktop.value) {
    toast.error('Filesystem folder opening is available on Desktop installation.')
    return
  }
  try {
    await window.flowdeskAPI.files.openFolder(type)
  } catch (err) {
    toast.error(`Could not open folder: ${err.message}`)
  }
}

const handleCreateBackup = async () => {
  if (!isDesktop.value) {
    toast.error('Backup creation is available in Desktop mode.')
    return
  }
  isBackingUp.value = true
  backupStatus.value = null
  try {
    const res = await window.flowdeskAPI.backup.createBackup()
    backupStatus.value = {
      type: 'success',
      message: `Complete local backup saved successfully!`,
      folder: res.backupFolder
    }
    toast.success('Local backup created successfully!')
    await loadStorageData()
  } catch (err) {
    backupStatus.value = {
      type: 'error',
      message: `Backup failed: ${err.message}`
    }
    toast.error('Backup failed: ' + err.message)
  } finally {
    isBackingUp.value = false
  }
}

const handleRestoreBackup = async () => {
  if (!isDesktop.value) {
    toast.error('Backup restore is available in Desktop mode.')
    return
  }
  backupStatus.value = null

  try {
    const selectedFolder = await window.flowdeskAPI.backup.selectBackupFolder()
    if (!selectedFolder) return

    const confirmed = window.confirm(
      `WARNING: Restoring will safely replace your current active database with the contents from:\n\n${selectedFolder}\n\nFlowDesk will automatically take an emergency snapshot of your current data before proceeding. Continue?`
    )
    if (!confirmed) return

    isRestoring.value = true
    const res = await window.flowdeskAPI.backup.restoreBackup(selectedFolder)
    backupStatus.value = {
      type: 'success',
      message: `Database restored! Restored ${res.currentCounts.documents} documents, ${res.currentCounts.tasks} tasks, and ${res.currentCounts.financeRecords} finance records.`
    }
    toast.success('Backup restored successfully!')
    await loadStorageData()
    window.dispatchEvent(new Event('flowdesk:refresh-counts'))
  } catch (err) {
    backupStatus.value = {
      type: 'error',
      message: `Restore failed: ${err.message}`
    }
    toast.error('Restore failed: ' + err.message)
  } finally {
    isRestoring.value = false
  }
}

// Hardware Scanner State
const scannerInfo = ref({
  available: false,
  devices: [],
  settings: {
    dpi: 200,
    colorMode: 'color',
    naps2Path: ''
  }
})
const isCheckingScanner = ref(false)

const loadScannerDetails = async () => {
  if (!isDesktop.value) return
  isCheckingScanner.value = true
  try {
    const isAvail = await window.flowdeskAPI.scanner.checkAvailability().catch(() => false)
    const settings = await window.flowdeskAPI.scanner.getSettings().catch(() => ({ dpi: 200, colorMode: 'color' }))
    scannerInfo.value.available = isAvail
    scannerInfo.value.settings = { ...scannerInfo.value.settings, ...settings }
  } catch (err) {
    console.warn('Failed to load scanner details:', err)
  } finally {
    isCheckingScanner.value = false
  }
}

const handleSaveScannerSettings = async () => {
  if (!isDesktop.value) return
  try {
    await window.flowdeskAPI.scanner.saveSettings(scannerInfo.value.settings)
    toast.success('Scanner hardware settings saved!')
  } catch (err) {
    toast.error('Failed to save scanner settings: ' + err.message)
  }
}

const handleBrowseNaps2 = async () => {
  if (!isDesktop.value) return
  try {
    const selected = await window.flowdeskAPI.scanner.selectNaps2Path()
    if (selected) {
      scannerInfo.value.settings.naps2Path = selected
      await handleSaveScannerSettings()
      await loadScannerDetails()
    }
  } catch (err) {
    toast.error('Failed to select scanner executable: ' + err.message)
  }
}

onMounted(() => {
  loadStorageData()
  if (isDesktop.value) {
    loadScannerDetails()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1] tracking-tight">
          System Settings & Management
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
          Configure appearance, offline backup files, hardware scanner, and local storage safety.
        </p>
      </div>

      <!-- <div class="flex items-center gap-2">
        <BaseBadge :variant="isDesktop ? 'success' : 'info'" size="sm" dot>
          {{ isDesktop ? 'Desktop SQLite 3' : 'Browser IndexedDB' }}
        </BaseBadge>
      </div> -->
    </div>

    <!-- Main Settings Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left Column: Navigation Tabs -->
      <div class="lg:col-span-3">
        <div class="bg-white dark:bg-[#1E171C] rounded-2xl border border-zinc-200/80 dark:border-[#2D252B] p-2 space-y-1 shadow-2xs">
          <button
            @click="activeTab = 'general'"
            type="button"
            :class="[
              'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left',
              activeTab === 'general'
                ? 'bg-forest-800 text-white shadow-2xs'
                : 'text-zinc-600 dark:text-[#DDD2D9] hover:bg-zinc-50 dark:hover:bg-[#251F23]'
            ]"
          >
            <Palette class="w-4 h-4 shrink-0" />
            <span>General & Appearance</span>
          </button>

          <button
            @click="activeTab = 'backup'"
            type="button"
            :class="[
              'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left',
              activeTab === 'backup'
                ? 'bg-forest-800 text-white shadow-2xs'
                : 'text-zinc-600 dark:text-[#DDD2D9] hover:bg-zinc-50 dark:hover:bg-[#251F23]'
            ]"
          >
            <HardDrive class="w-4 h-4 shrink-0" />
            <span>Storage & Local Backups</span>
          </button>

          <button
            @click="activeTab = 'scanner'"
            type="button"
            :class="[
              'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left',
              activeTab === 'scanner'
                ? 'bg-forest-800 text-white shadow-2xs'
                : 'text-zinc-600 dark:text-[#DDD2D9] hover:bg-zinc-50 dark:hover:bg-[#251F23]'
            ]"
          >
            <Printer class="w-4 h-4 shrink-0" />
            <span>Hardware Scanner</span>
          </button>

          <button
            @click="activeTab = 'about'"
            type="button"
            :class="[
              'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left',
              activeTab === 'about'
                ? 'bg-forest-800 text-white shadow-2xs'
                : 'text-zinc-600 dark:text-[#DDD2D9] hover:bg-zinc-50 dark:hover:bg-[#251F23]'
            ]"
          >
            <ShieldCheck class="w-4 h-4 shrink-0" />
            <span>Privacy & System About</span>
          </button>
        </div>
      </div>

      <!-- Right Column: Tab Panels -->
      <div class="lg:col-span-9 space-y-6">
        <!-- 1. GENERAL & APPEARANCE TAB -->
        <div v-if="activeTab === 'general'" class="space-y-6">
          <!-- Theme Preference Card -->
          <BaseCard title="Theme & Display Mode" subtitle="Choose how FlowDesk looks on this device. Preference is saved permanently.">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
              <!-- Light Mode Option -->
              <button
                @click="themeStore.setPreference('light')"
                type="button"
                :class="[
                  'p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative',
                  themeStore.preference === 'light'
                    ? 'border-[#D9467B] ring-2 ring-[#D9467B]/20 bg-rose-50/20 dark:bg-rose-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-[#2D252B] hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-[#1A1719]'
                ]"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Sun class="w-4 h-4" />
                  </div>
                  <Check v-if="themeStore.preference === 'light'" class="w-4 h-4 text-[#D9467B]" />
                </div>
                <div>
                  <h4 class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1]">Light Theme</h4>
                  <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] mt-0.5">Clean, bright daytime styling</p>
                </div>
              </button>

              <!-- Dark Mode Option -->
              <button
                @click="themeStore.setPreference('dark')"
                type="button"
                :class="[
                  'p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative',
                  themeStore.preference === 'dark'
                    ? 'border-[#D9467B] ring-2 ring-[#D9467B]/20 bg-rose-50/20 dark:bg-rose-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-[#2D252B] hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-[#1A1719]'
                ]"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="w-8 h-8 rounded-lg bg-rose-50 text-[#D9467B] dark:bg-rose-950/50 flex items-center justify-center">
                    <Moon class="w-4 h-4" />
                  </div>
                  <Check v-if="themeStore.preference === 'dark'" class="w-4 h-4 text-[#D9467B]" />
                </div>
                <div>
                  <h4 class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1]">Dark Theme</h4>
                  <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] mt-0.5">Sleek, low-glare evening palette</p>
                </div>
              </button>

              <!-- System Option -->
              <button
                @click="themeStore.setPreference('system')"
                type="button"
                :class="[
                  'p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative',
                  themeStore.preference === 'system'
                    ? 'border-[#D9467B] ring-2 ring-[#D9467B]/20 bg-rose-50/20 dark:bg-rose-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-[#2D252B] hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-[#1A1719]'
                ]"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 flex items-center justify-center">
                    <Monitor class="w-4 h-4" />
                  </div>
                  <Check v-if="themeStore.preference === 'system'" class="w-4 h-4 text-[#D9467B]" />
                </div>
                <div>
                  <h4 class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1]">Follow System</h4>
                  <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] mt-0.5">Matches Windows OS dark mode</p>
                </div>
              </button>
            </div>
          </BaseCard>

          <!-- User Profile & Display Name -->
          <BaseCard title="User Identity & Workspace Greeting" subtitle="Customize the greeting name displayed across your dashboard.">
            <form @submit.prevent="handleSaveProfile" class="space-y-4 pt-2">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-zinc-700 dark:text-[#DDD2D9] mb-1">
                    Display Name / Greeting
                  </label>
                  <div class="relative">
                    <input
                      v-model="userName"
                      type="text"
                      placeholder="e.g. Swettie"
                      class="w-full px-3 py-2 pl-9 rounded-lg border border-zinc-200 dark:border-[#2D252B] bg-white dark:bg-[#251F23] text-xs text-zinc-900 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-forest-800"
                    />
                    <User class="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  </div>
                  <p class="text-[11px] text-zinc-400 mt-1">Appears on the Dashboard header (e.g. "Good morning, {{ userName }} 💕")</p>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-zinc-700 dark:text-[#DDD2D9] mb-1">
                    Office / Department Name
                  </label>
                  <div class="relative">
                    <input
                      v-model="officeName"
                      type="text"
                      placeholder="e.g. Internal Control & Finance Unit"
                      class="w-full px-3 py-2 pl-9 rounded-lg border border-zinc-200 dark:border-[#2D252B] bg-white dark:bg-[#251F23] text-xs text-zinc-900 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-forest-800"
                    />
                    <Building2 class="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  </div>
                  <p class="text-[11px] text-zinc-400 mt-1">Identifies this workstation</p>
                </div>
              </div>

              <div class="flex justify-end pt-2 border-t border-zinc-100 dark:border-[#2D252B]">
                <BaseButton variant="primary" size="sm" type="submit">
                  <Save class="w-3.5 h-3.5 text-white mr-1.5" />
                  Save Identity Preferences
                </BaseButton>
              </div>
            </form>
          </BaseCard>
        </div>

        <!-- 2. STORAGE & LOCAL BACKUPS TAB -->
        <div v-if="activeTab === 'backup'" class="space-y-6">
          <!-- Uninstall Safety Notice -->
          <div class="p-4 rounded-xl bg-forest-50/80 dark:bg-forest-950/40 border border-forest-200/80 dark:border-forest-900/60 flex items-start gap-3 text-xs text-forest-900 dark:text-forest-200 shadow-2xs">
            <ShieldCheck class="w-5 h-5 text-forest-700 dark:text-forest-400 shrink-0 mt-0.5" />
            <div class="flex-1 space-y-1">
              <h4 class="font-bold text-forest-950 dark:text-forest-100">Uninstall Safety & Permanent Data Protection</h4>
              <p class="leading-relaxed text-[11px] sm:text-xs text-forest-800 dark:text-forest-300">
                FlowDesk is specifically configured so that your database (<code class="font-mono">flowdesk.db</code>), scanned PDF attachments, and transaction history are stored inside your Windows User Profile (<code class="font-mono">%APPDATA%\FlowDesk</code>).
                Even if you uninstall FlowDesk or upgrade to a newer version, <strong>your records will remain intact</strong>.
              </p>
            </div>
          </div>

          <!-- Status Banner -->
          <div v-if="backupStatus" :class="[
            'p-3.5 rounded-xl border text-xs flex items-start gap-2.5',
            backupStatus.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          ]">
            <CheckCircle2 v-if="backupStatus.type === 'success'" class="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <AlertTriangle v-else class="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div class="flex-1">
              <p class="font-semibold">{{ backupStatus.message }}</p>
              <p v-if="backupStatus.folder" class="font-mono text-[10px] mt-0.5 opacity-80">{{ backupStatus.folder }}</p>
            </div>
          </div>

          <!-- Database Record Counts -->
          <BaseCard title="Active Database Content" subtitle="Live record count stored locally in SQLite 3.">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                <span class="text-[10px] uppercase font-bold text-zinc-400 block">Documents</span>
                <span class="text-xl font-bold text-zinc-900 dark:text-[#F5EDF1] font-mono mt-0.5 block">{{ stats.documents }}</span>
              </div>
              <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                <span class="text-[10px] uppercase font-bold text-zinc-400 block">Tasks</span>
                <span class="text-xl font-bold text-zinc-900 dark:text-[#F5EDF1] font-mono mt-0.5 block">{{ stats.tasks }}</span>
              </div>
              <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                <span class="text-[10px] uppercase font-bold text-zinc-400 block">Finance Records</span>
                <span class="text-xl font-bold text-zinc-900 dark:text-[#F5EDF1] font-mono mt-0.5 block">{{ stats.finance }}</span>
              </div>
              <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                <span class="text-[10px] uppercase font-bold text-zinc-400 block">Attachments Size</span>
                <span class="text-xl font-bold text-forest-800 dark:text-forest-400 font-mono mt-0.5 block">
                  {{ formatBytes(storageInfo?.attachmentsSize || 0) }}
                </span>
              </div>
            </div>
          </BaseCard>

          <!-- Windows Storage Folders -->
          <BaseCard v-if="isDesktop && storageInfo" title="Local Windows Storage Locations" subtitle="Direct access to your offline database, attachments, and backup directories.">
            <div class="divide-y divide-zinc-100 dark:divide-[#2D252B] -mx-5 -my-4 pt-1">
              <!-- SQLite Database Path -->
              <div class="p-4 flex items-center justify-between gap-3 text-xs">
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-zinc-900 dark:text-[#F5EDF1]">SQLite 3 Database File</div>
                  <code class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] truncate block font-mono mt-0.5">
                    {{ storageInfo.storagePaths.dbPath }}
                  </code>
                </div>
                <BaseButton variant="secondary" size="xs" @click="handleOpenFolder('data')">
                  <FolderOpen class="w-3.5 h-3.5 text-zinc-500 mr-1" />
                  Open Data
                </BaseButton>
              </div>

              <!-- Attachments Folder -->
              <div class="p-4 flex items-center justify-between gap-3 text-xs">
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-zinc-900 dark:text-[#F5EDF1]">Scanned Attachments & PDFs</div>
                  <code class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] truncate block font-mono mt-0.5">
                    {{ storageInfo.storagePaths.attachmentsDir }}
                  </code>
                </div>
                <BaseButton variant="secondary" size="xs" @click="handleOpenFolder('attachments')">
                  <FolderOpen class="w-3.5 h-3.5 text-zinc-500 mr-1" />
                  Open PDFs
                </BaseButton>
              </div>

              <!-- Backups Folder -->
              <div class="p-4 flex items-center justify-between gap-3 text-xs">
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-zinc-900 dark:text-[#F5EDF1]">Local Backups Folder</div>
                  <code class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] truncate block font-mono mt-0.5">
                    {{ storageInfo.storagePaths.backupsDir }}
                  </code>
                </div>
                <BaseButton variant="secondary" size="xs" @click="handleOpenFolder('backups')">
                  <FolderOpen class="w-3.5 h-3.5 text-zinc-500 mr-1" />
                  Open Backups
                </BaseButton>
              </div>
            </div>
          </BaseCard>

          <!-- Backup Operations -->
          <BaseCard title="Manual Backup & Restore" subtitle="Generate a complete snapshot of your office data or restore from a previous backup.">
            <div class="flex flex-col sm:flex-row items-stretch gap-4 pt-2">
              <div class="flex-1 p-4 rounded-xl border border-zinc-200 dark:border-[#2D252B] bg-zinc-50/50 dark:bg-[#1E171C] space-y-3">
                <div class="flex items-center gap-2">
                  <Archive class="w-4 h-4 text-forest-800 dark:text-forest-300" />
                  <h4 class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1]">Create Safe Local Backup</h4>
                </div>
                <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] leading-relaxed">
                  Generates a full timestamped copy of your SQLite database and all scanned paper attachments.
                </p>
                <BaseButton
                  variant="primary"
                  size="sm"
                  :disabled="isBackingUp || !isDesktop"
                  @click="handleCreateBackup"
                >
                  <Archive class="w-3.5 h-3.5 text-white mr-1.5" :class="{ 'animate-spin': isBackingUp }" />
                  {{ isBackingUp ? 'Backing Up...' : 'Create Backup Now' }}
                </BaseButton>
              </div>

              <div class="flex-1 p-4 rounded-xl border border-zinc-200 dark:border-[#2D252B] bg-zinc-50/50 dark:bg-[#1E171C] space-y-3">
                <div class="flex items-center gap-2">
                  <RotateCcw class="w-4 h-4 text-amber-700 dark:text-amber-300" />
                  <h4 class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1]">Restore from Backup</h4>
                </div>
                <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] leading-relaxed">
                  Select a previously generated backup folder to restore your database and documents.
                </p>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :disabled="isRestoring || !isDesktop"
                  @click="handleRestoreBackup"
                >
                  <RotateCcw class="w-3.5 h-3.5 text-zinc-600 mr-1.5" :class="{ 'animate-spin': isRestoring }" />
                  {{ isRestoring ? 'Restoring...' : 'Restore from Folder' }}
                </BaseButton>
              </div>
            </div>
          </BaseCard>
        </div>

        <!-- 3. HARDWARE SCANNER TAB -->
        <div v-if="activeTab === 'scanner'" class="space-y-6">
          <BaseCard title="Hardware Scanner Integration (NAPS2 Engine)" subtitle="Configure physical scanner support for digitizing routing slips and attachments.">
            <div class="space-y-4 pt-2 text-xs">
              <!-- Engine Status Strip -->
              <div class="p-3.5 rounded-xl border border-zinc-200 dark:border-[#2D252B] bg-zinc-50 dark:bg-[#251F23] flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <Printer class="w-4 h-4 text-forest-800 dark:text-forest-400" />
                  <div>
                    <span class="font-semibold text-zinc-900 dark:text-[#F5EDF1]">NAPS2 CLI Engine Status:</span>
                    <span :class="[
                      'ml-2 font-bold',
                      scannerInfo.available ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500'
                    ]">
                      {{ scannerInfo.available ? 'Ready & Active' : 'Emulation Mode (NAPS2 not detected)' }}
                    </span>
                  </div>
                </div>

                <BaseButton variant="secondary" size="xs" :disabled="isCheckingScanner" @click="loadScannerDetails">
                  <RefreshCw class="w-3 h-3 text-zinc-500 mr-1" :class="{ 'animate-spin': isCheckingScanner }" />
                  Check Engine
                </BaseButton>
              </div>

              <!-- Scanner Configurations -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block font-semibold text-zinc-700 dark:text-[#DDD2D9] mb-1">
                    Default Scan Resolution (DPI)
                  </label>
                  <select
                    v-model.number="scannerInfo.settings.dpi"
                    class="w-full px-3 py-2 border border-zinc-200 dark:border-[#2D252B] rounded-lg bg-white dark:bg-[#251F23] text-xs text-zinc-900 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-forest-800"
                  >
                    <option :value="150">150 DPI (Fastest, Small File)</option>
                    <option :value="200">200 DPI (Recommended for paper routing)</option>
                    <option :value="300">300 DPI (High Quality, Archival)</option>
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-zinc-700 dark:text-[#DDD2D9] mb-1">
                    Color Mode
                  </label>
                  <select
                    v-model="scannerInfo.settings.colorMode"
                    class="w-full px-3 py-2 border border-zinc-200 dark:border-[#2D252B] rounded-lg bg-white dark:bg-[#251F23] text-xs text-zinc-900 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-forest-800"
                  >
                    <option value="color">Full 24-bit Color</option>
                    <option value="grayscale">Grayscale</option>
                    <option value="bw">Black & White (Smallest)</option>
                  </select>
                </div>
              </div>

              <!-- NAPS2 Executable Path -->
              <div>
                <label class="block font-semibold text-zinc-700 dark:text-[#DDD2D9] mb-1">
                  NAPS2 Console Executable Path
                </label>
                <div class="flex items-center gap-2">
                  <input
                    v-model="scannerInfo.settings.naps2Path"
                    type="text"
                    placeholder="Auto-detected or e.g. C:\Program Files\NAPS2\naps2.console.exe"
                    class="flex-1 px-3 py-2 border border-zinc-200 dark:border-[#2D252B] rounded-lg bg-white dark:bg-[#251F23] text-xs font-mono text-zinc-900 dark:text-[#F5EDF1]"
                  />
                  <BaseButton variant="secondary" size="sm" @click="handleBrowseNaps2">
                    Browse...
                  </BaseButton>
                </div>
                <p class="text-[11px] text-zinc-400 mt-1">Leave empty to use built-in bundled scanner driver</p>
              </div>

              <div class="flex justify-end pt-3 border-t border-zinc-100 dark:border-[#2D252B]">
                <BaseButton variant="primary" size="sm" @click="handleSaveScannerSettings">
                  <Save class="w-3.5 h-3.5 text-white mr-1.5" />
                  Save Scanner Settings
                </BaseButton>
              </div>
            </div>
          </BaseCard>
        </div>

        <!-- 4. ABOUT & PRIVACY TAB -->
        <div v-if="activeTab === 'about'" class="space-y-6">
          <BaseCard title="System Information & Diagnostics" subtitle="Technical details and environment verification.">
            <div class="space-y-3.5 text-xs pt-1">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                  <span class="text-[10px] text-zinc-400 uppercase font-semibold block">App Version</span>
                  <span class="font-bold text-zinc-900 dark:text-[#F5EDF1] font-mono mt-0.5 block">1.0.0 (Desktop)</span>
                </div>
                <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                  <span class="text-[10px] text-zinc-400 uppercase font-semibold block">Database</span>
                  <span class="font-bold text-forest-800 dark:text-forest-400 font-mono mt-0.5 block">SQLite 3 (better-sqlite3)</span>
                </div>
                <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#251F23] border border-zinc-100 dark:border-[#2D252B]">
                  <span class="text-[10px] text-zinc-400 uppercase font-semibold block">Platform</span>
                  <span class="font-bold text-zinc-900 dark:text-[#F5EDF1] font-mono mt-0.5 block">Electron 44 / Windows x64</span>
                </div>
              </div>

              <div class="p-4 rounded-xl border border-zinc-200 dark:border-[#2D252B] bg-zinc-50/40 dark:bg-[#1E171C] space-y-2">
                <h4 class="font-bold text-zinc-900 dark:text-[#F5EDF1] flex items-center gap-1.5">
                  <ShieldCheck class="w-4 h-4 text-emerald-600" />
                  Local-First Privacy Guarantee
                </h4>
                <p class="text-[11px] text-zinc-600 dark:text-[#BCAEBA] leading-relaxed">
                  FlowDesk is engineered to operate 100% offline. All purchase requests, supplier records, paper tracking routing logs, and daily tasks remain strictly on this laptop's local hard drive. No external tracking, analytical telemetry, or cloud synchronization occurs without your direct manual export.
                </p>
              </div>
            </div>
          </BaseCard>
        </div>
      </div>
    </div>
  </div>
</template>
