<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  checkScannerAvailability,
  discoverScanners,
  startScanSession,
  executeScan,
  deleteScanPage,
  getScanSessionPreview,
  getScanPdfBuffer,
  cancelScan,
  discardScanSession,
  finalizeScan,
  getScannerSettings,
  saveScannerSettings,
  selectNaps2Executable,
  isDesktopApp,
  attachFileBrowserMode
} from '../../services/scannerService'
import { toast } from '../../composables/useToast'
import {
  Scan,
  RefreshCw,
  X,
  FileText,
  Trash2,
  Download,
  CheckCircle2,
  AlertTriangle,
  FilePlus2,
  HardDrive,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  FolderOpen,
  Sliders,
  Settings2,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  UploadCloud,
  FileDown
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  activityDesign: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'attached', 'saved'])

// Application state
const isDesktop = computed(() => isDesktopApp())
const isCheckingAvailability = ref(false)
const naps2Info = ref({ available: false, version: null, path: null, message: '' })
const isLocatingExe = ref(false)

// Discovery state
const isDiscovering = ref(false)
const discoveredDevices = ref([])
const discoveryError = ref('')

// Scanner configuration settings
const selectedDeviceId = ref('')
const selectedDriver = ref('wia')
const paperSource = ref('glass')
const resolutionDpi = ref(300)
const colorMode = ref('color')

// Active scan session state
const activeSessionId = ref(null)
const isScanning = ref(false)
const scanProgressStatus = ref('')
const scanError = ref('')
const scannedPages = ref([])
const selectedPageIndex = ref(0)
const isPdfReady = ref(false)
const pdfPreviewDataUrl = ref(null)
const previewMode = ref('pages') // 'pages' | 'pdf'
const zoomLevel = ref(100)

// Document saving / attachment state
const documentName = ref('')
const isFinalizing = ref(false)
const browserUploadInput = ref(null)
const isBrowserUploading = ref(false)

// Verified available drivers for the selected device
const selectedDevice = computed(() => {
  return discoveredDevices.value.find(d => d.id === selectedDeviceId.value) || null
})

const availableDriversForDevice = computed(() => {
  if (!selectedDevice.value) return ['wia', 'twain', 'escl']
  // Filter devices that match the physical name
  const matches = discoveredDevices.value.filter(d => d.name === selectedDevice.value.name)
  const drivers = matches.map(m => m.driver)
  return drivers.length > 0 ? Array.from(new Set(drivers)) : [selectedDevice.value.driver]
})

// Current high-resolution preview page
const currentSelectedPage = computed(() => {
  if (scannedPages.value.length === 0) return null
  const idx = Math.max(0, Math.min(selectedPageIndex.value, scannedPages.value.length - 1))
  return scannedPages.value[idx] || null
})

// Initialize default document name based on Activity Design or timestamp
const generateDefaultDocName = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  
  if (props.activityDesign?.id) {
    const rawTitle = props.activityDesign.activityDesign || props.activityDesign.columnK || 'ActivityDesign'
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30)
    return `AD-${props.activityDesign.id}_${safeTitle}_${dateStr}.pdf`
  }
  return `FlowDesk_Scan_${dateStr}.pdf`
}

// Check NAPS2 CLI availability
const verifyNaps2 = async () => {
  isCheckingAvailability.value = true
  discoveryError.value = ''
  try {
    const status = await checkScannerAvailability()
    naps2Info.value = status
    if (status.available) {
      // Automatically run discovery once NAPS2 is verified
      await handleDiscoverDevices()
    }
  } catch (err) {
    naps2Info.value = {
      available: false,
      message: 'Failed to communicate with scanner service: ' + err.message
    }
  } finally {
    isCheckingAvailability.value = false
  }
}

// Discover real connected scanner hardware
const handleDiscoverDevices = async () => {
  if (!isDesktop.value) return
  isDiscovering.value = true
  discoveryError.value = ''

  try {
    const res = await discoverScanners()
    if (res.success) {
      discoveredDevices.value = res.devices || []
      
      // Auto-select preferred or first device if available
      const savedPrefs = await getScannerSettings()
      if (savedPrefs?.lastDevice) {
        const found = discoveredDevices.value.find(d => d.name === savedPrefs.lastDevice)
        if (found) {
          selectedDeviceId.value = found.id
          selectedDriver.value = found.driver
        }
      }

      if (!selectedDeviceId.value && discoveredDevices.value.length > 0) {
        selectedDeviceId.value = discoveredDevices.value[0].id
        selectedDriver.value = discoveredDevices.value[0].driver
      }

      if (savedPrefs) {
        if (savedPrefs.source) paperSource.value = savedPrefs.source
        if (savedPrefs.dpi) resolutionDpi.value = savedPrefs.dpi
        if (savedPrefs.bitdepth) colorMode.value = savedPrefs.bitdepth
      }
    } else {
      discoveryError.value = res.error || 'Failed to detect scanners.'
      discoveredDevices.value = []
    }
  } catch (err) {
    discoveryError.value = err.message || 'Error occurred during scanner discovery.'
    discoveredDevices.value = []
  } finally {
    isDiscovering.value = false
  }
}

// User selects device
const handleDeviceChange = () => {
  if (selectedDevice.value) {
    selectedDriver.value = selectedDevice.value.driver
    saveCurrentSettings()
  }
}

// Save user preferences
const saveCurrentSettings = () => {
  if (!selectedDevice.value) return
  saveScannerSettings({
    lastDevice: selectedDevice.value.name,
    lastDriver: selectedDriver.value,
    source: paperSource.value,
    dpi: resolutionDpi.value,
    bitdepth: colorMode.value
  })
}

// 1-click fallback from feeder error to flatbed glass
const handleSwitchToGlassAndScan = () => {
  paperSource.value = 'glass'
  saveCurrentSettings()
  scanError.value = ''
  handleStartScan()
}

// Browse for custom NAPS2.Console.exe
const handleBrowseNaps2 = async () => {
  isLocatingExe.value = true
  try {
    const chosen = await selectNaps2Executable()
    if (chosen) {
      await verifyNaps2()
    }
  } catch (err) {
    toast.error('Could not set custom NAPS2 path: ' + err.message)
  } finally {
    isLocatingExe.value = false
  }
}

// Start scanning operation
const handleStartScan = async () => {
  if (!selectedDevice.value) {
    toast.warning('No scanner selected. Please pick a discovered scanner from the list.')
    return
  }

  isScanning.value = true
  scanError.value = ''
  scanProgressStatus.value = `Connecting to ${selectedDevice.value.name} via ${selectedDriver.value.toUpperCase()}...`

  try {
    if (!activeSessionId.value) {
      const sess = await startScanSession({
        activityDesignId: props.activityDesign?.id || null,
        deviceName: selectedDevice.value.name,
        driver: selectedDriver.value
      })
      activeSessionId.value = sess.sessionId
    }

    scanProgressStatus.value = `Scanning via ${paperSource.value === 'feeder' ? 'Document Feeder (ADF)' : (paperSource.value === 'duplex' ? 'Duplex Feeder' : 'Flatbed / Glass')} at ${resolutionDpi.value} DPI...`

    const scanResult = await executeScan({
      sessionId: activeSessionId.value,
      deviceName: selectedDevice.value.name,
      driver: selectedDriver.value,
      source: paperSource.value,
      dpi: resolutionDpi.value,
      bitdepth: colorMode.value
    })

    if (scanResult.success) {
      scannedPages.value = scanResult.pages || []
      isPdfReady.value = scanResult.pdfReady
      selectedPageIndex.value = scannedPages.value.length - 1 // select the latest scanned page
      
      // Load PDF preview in background
      loadPdfPreview()
      toast.success(`Successfully scanned ${scannedPages.value.length} page${scannedPages.value.length > 1 ? 's' : ''}.`)
      saveCurrentSettings()
    }
  } catch (err) {
    scanError.value = err.message || 'Scanning operation failed.'
    toast.error('Scanning failed', err.message)
  } finally {
    isScanning.value = false
    scanProgressStatus.value = ''
  }
}

// Load compiled PDF buffer for preview
const loadPdfPreview = async () => {
  if (!activeSessionId.value) return
  try {
    const pdfUrl = await getScanPdfBuffer(activeSessionId.value)
    if (pdfUrl) {
      pdfPreviewDataUrl.value = pdfUrl
    }
  } catch (e) {
    console.warn('Failed to load PDF preview buffer:', e)
  }
}

// Cancel in-progress scan
const handleCancelScan = async () => {
  if (!activeSessionId.value) return
  await cancelScan(activeSessionId.value)
  isScanning.value = false
  scanProgressStatus.value = 'Scan cancelled by user.'
  toast.info('Scan operation cancelled.')
}

// Remove an individual page from the scan session
const handleRemovePage = async (pageNumber) => {
  if (!activeSessionId.value) return
  if (!confirm(`Remove Page #${pageNumber}? This page will be excluded from the final PDF.`)) return

  try {
    const res = await deleteScanPage(activeSessionId.value, pageNumber)
    scannedPages.value = res.pages || []
    isPdfReady.value = res.pdfReady
    if (selectedPageIndex.value >= scannedPages.value.length) {
      selectedPageIndex.value = Math.max(0, scannedPages.value.length - 1)
    }
    loadPdfPreview()
    toast.info(`Page #${pageNumber} removed.`)
  } catch (err) {
    toast.error('Failed to remove page: ' + err.message)
  }
}

// Discard entire session
const handleDiscardSession = async (promptConfirm = true) => {
  if (promptConfirm && scannedPages.value.length > 0) {
    if (!confirm('Discard all scanned pages? Any unsaved pages will be permanently deleted.')) {
      return false
    }
  }

  if (activeSessionId.value) {
    await discardScanSession(activeSessionId.value)
  }

  activeSessionId.value = null
  scannedPages.value = []
  pdfPreviewDataUrl.value = null
  isPdfReady.value = false
  selectedPageIndex.value = 0
  scanError.value = ''
  return true
}

// Finalize: Save PDF locally
const handleSavePdfLocally = async () => {
  if (scannedPages.value.length === 0) {
    toast.warning('No scanned pages to save.')
    return
  }

  isFinalizing.value = true
  try {
    const res = await finalizeScan({
      sessionId: activeSessionId.value,
      targetFileName: documentName.value || generateDefaultDocName(),
      activityDesignId: null,
      scanMetadata: {
        driver: selectedDriver.value,
        deviceName: selectedDevice.value?.name,
        dpi: resolutionDpi.value,
        source: paperSource.value,
        bitdepth: colorMode.value
      }
    })

    if (res.canceled) {
      isFinalizing.value = false
      return
    }

    toast.success('Document saved successfully.', `Saved as: ${res.attachment?.fileName}`)
    emit('saved', res.attachment)
    handleCloseModal(false)
  } catch (err) {
    toast.error('Failed to save document: ' + err.message)
  } finally {
    isFinalizing.value = false
  }
}

// Finalize: Save and Attach directly to the Activity Design
const handleAttachToActivityDesign = async () => {
  if (!props.activityDesign?.id) {
    toast.error('No Activity Design selected to attach document to.')
    return
  }

  if (scannedPages.value.length === 0) {
    toast.warning('Please scan at least one page before attaching.')
    return
  }

  isFinalizing.value = true
  try {
    const res = await finalizeScan({
      sessionId: activeSessionId.value,
      targetFileName: documentName.value || generateDefaultDocName(),
      activityDesignId: props.activityDesign.id,
      scanMetadata: {
        driver: selectedDriver.value,
        deviceName: selectedDevice.value?.name,
        dpi: resolutionDpi.value,
        source: paperSource.value,
        bitdepth: colorMode.value
      }
    })

    toast.success(
      'Document attached to Activity Design.',
      `Attached "${res.attachment?.fileName}" directly to Activity Design #${props.activityDesign.id}.`
    )
    emit('attached', res.attachment)
    handleCloseModal(false)
  } catch (err) {
    toast.error('Failed to attach scanned document: ' + err.message)
  } finally {
    isFinalizing.value = false
  }
}

// Browser Mode: Handle manual PDF file upload
const handleBrowserFileUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast.warning('Only PDF files are supported for document attachment.')
    return
  }

  isBrowserUploading.value = true
  try {
    const record = await attachFileBrowserMode({
      entityType: 'finance',
      entityId: props.activityDesign?.id || 0,
      file,
      notes: 'Attached via FlowDesk Browser Upload'
    })
    toast.success('Scanned PDF attached successfully.', `Linked "${file.name}" to Activity Design.`)
    emit('attached', record)
    handleCloseModal(false)
  } catch (err) {
    toast.error('Failed to upload PDF in browser mode: ' + err.message)
  } finally {
    isBrowserUploading.value = false
  }
}

// Close modal handler with protection against accidental unsaved page loss
const handleCloseModal = async (checkUnsaved = true) => {
  if (checkUnsaved && scannedPages.value.length > 0) {
    const discardConfirmed = await handleDiscardSession(true)
    if (!discardConfirmed) return
  } else {
    await handleDiscardSession(false)
  }
  emit('close')
}

// Watch modal open/close
watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      documentName.value = generateDefaultDocName()
      if (isDesktop.value) {
        await verifyNaps2()
      }
    } else {
      handleDiscardSession(false)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (activeSessionId.value) {
    discardScanSession(activeSessionId.value)
  }
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/60 backdrop-blur-xs overflow-y-auto"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white rounded-2xl shadow-2xl border border-zinc-200/90 w-full max-w-6xl my-auto overflow-hidden flex flex-col h-[90vh] max-h-[880px] animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 1. Header Bar -->
      <div class="px-5 py-3.5 border-b border-zinc-200 bg-[#FFFDFE] flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-forest-800 text-white flex items-center justify-center shadow-xs">
            <Scan class="w-5 h-5 text-forest-100" />
          </div>
          <div>
            <div class="flex items-center gap-2.5">
              <h2 class="text-base font-bold text-zinc-900 tracking-tight">
                Scan Document
              </h2>
              <span
                v-if="isDesktop && naps2Info.available"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                NAPS2 Ready
              </span>
              <span
                v-else-if="isDesktop"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
              >
                <AlertTriangle class="w-3 h-3 text-amber-600" />
                NAPS2 Setup Required
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200"
              >
                Browser Mode
              </span>
            </div>
            <p class="text-xs text-zinc-500 mt-0.5">
              Scan physical documents via WIA / TWAIN hardware and attach them to your Activity Design.
            </p>
          </div>
        </div>

        <!-- Target Activity Design Context Indicator & Close Button -->
        <div class="flex items-center gap-3">
          <div
            v-if="activityDesign"
            class="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-50/60 border border-pink-200/80 text-xs"
          >
            <span class="text-[10px] font-bold text-pink-700 uppercase tracking-wider">Target AD:</span>
            <span class="font-semibold text-zinc-800 truncate max-w-[200px]" :title="activityDesign.activityDesign || activityDesign.columnK">
              #{{ activityDesign.id }} • {{ activityDesign.activityDesign || activityDesign.columnK || 'Record' }}
            </span>
          </div>

          <button
            @click="handleCloseModal(true)"
            type="button"
            class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close scanner dialog"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Main Body: Two-Column Workspace -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-zinc-50/50">
        
        <!-- LEFT PANEL: Scanner Configuration & Hardware Discovery -->
        <div class="w-full lg:w-84 xl:w-92 border-b lg:border-b-0 lg:border-r border-zinc-200 bg-white p-4 overflow-y-auto space-y-4 shrink-0">
          
          <!-- BROWSER MODE EXPLANATION -->
          <div v-if="!isDesktop" class="p-4 rounded-xl bg-sky-50/80 border border-sky-200 space-y-3 text-xs">
            <div class="flex items-start gap-2.5">
              <UploadCloud class="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-sky-950">Web Browser Mode</h4>
                <p class="text-sky-800 text-[11px] mt-1 leading-relaxed">
                  Direct physical scanner hardware control (WIA, TWAIN, and eSCL) requires the <strong>FlowDesk Windows Desktop application</strong>.
                </p>
              </div>
            </div>
            <div class="p-2.5 rounded-lg bg-white border border-sky-200/60 text-[11px] text-zinc-700 font-mono">
              npm run electron:dev
            </div>
            <p class="text-[11px] text-sky-900 font-medium">
              In browser mode, you can upload an existing scanned PDF file:
            </p>
            <input
              type="file"
              ref="browserUploadInput"
              accept=".pdf"
              class="hidden"
              @change="handleBrowserFileUpload"
            />
            <button
              @click="$refs.browserUploadInput.click()"
              :disabled="isBrowserUploading"
              type="button"
              class="w-full py-2 px-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
            >
              <UploadCloud class="w-4 h-4" />
              <span>{{ isBrowserUploading ? 'Uploading PDF...' : 'Select Scanned PDF File' }}</span>
            </button>
          </div>

          <!-- NAPS2 UNAVAILABLE TROUBLESHOOTING CARD -->
          <div
            v-else-if="!naps2Info.available"
            class="p-4 rounded-xl bg-amber-50/90 border border-amber-200 space-y-3 text-xs"
          >
            <div class="flex items-start gap-2.5">
              <AlertTriangle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-amber-950">NAPS2 CLI Not Detected</h4>
                <p class="text-amber-800 text-[11px] mt-1 leading-relaxed">
                  FlowDesk uses the open-source <strong>NAPS2 Console</strong> utility for hardware scanning.
                </p>
              </div>
            </div>

            <div class="space-y-1.5 text-[11px] text-zinc-700 bg-white p-3 rounded-lg border border-amber-200/60">
              <p class="font-semibold text-zinc-900">How to install NAPS2:</p>
              <ol class="list-decimal list-inside space-y-1 pl-1 text-zinc-600">
                <li>Download from official site or run:</li>
                <li class="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-[10px] text-zinc-800">winget install NAPS2</li>
                <li>Or click below to browse to your existing executable:</li>
              </ol>
            </div>

            <div class="flex flex-col gap-2 pt-1">
              <button
                @click="handleBrowseNaps2"
                :disabled="isLocatingExe"
                type="button"
                class="w-full py-2 px-3 rounded-lg bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-950 font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
              >
                <FolderOpen class="w-4 h-4 text-amber-700" />
                <span>{{ isLocatingExe ? 'Browsing...' : 'Browse for NAPS2.Console.exe' }}</span>
              </button>

              <button
                @click="verifyNaps2"
                :disabled="isCheckingAvailability"
                type="button"
                class="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isCheckingAvailability }" />
                <span>Re-check Availability</span>
              </button>
            </div>
          </div>

          <!-- SCANNER DEVICE SELECTOR (REAL HARDWARE ONLY) -->
          <div v-if="isDesktop && naps2Info.available" class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                <HardDrive class="w-3.5 h-3.5 text-forest-700" />
                <span>Scanner Device</span>
              </label>

              <button
                @click="handleDiscoverDevices"
                :disabled="isDiscovering || isScanning"
                type="button"
                class="text-[11px] text-forest-700 hover:text-forest-900 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Rescan connected hardware"
              >
                <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isDiscovering }" />
                <span>Refresh Devices</span>
              </button>
            </div>

            <!-- Device Select Dropdown -->
            <div v-if="discoveredDevices.length > 0">
              <select
                v-model="selectedDeviceId"
                @change="handleDeviceChange"
                :disabled="isScanning"
                class="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-forest-600 focus:border-forest-600 shadow-2xs cursor-pointer font-medium"
              >
                <option v-for="dev in discoveredDevices" :key="dev.id" :value="dev.id">
                  {{ dev.name }} ({{ dev.driver.toUpperCase() }})
                </option>
              </select>
            </div>

            <!-- EMPTY STATE: NO SCANNERS DETECTED -->
            <div
              v-else-if="!isDiscovering"
              class="p-3.5 rounded-xl bg-zinc-50 border border-dashed border-zinc-300 space-y-2 text-center"
            >
              <AlertTriangle class="w-6 h-6 text-amber-500 mx-auto" />
              <h5 class="text-xs font-bold text-zinc-800">No Scanners Detected</h5>
              <p class="text-[11px] text-zinc-500 leading-relaxed">
                Connect a USB scanner or ensure your network scanner is online, then click Refresh Devices.
              </p>
              <button
                @click="handleDiscoverDevices"
                type="button"
                class="mt-1 px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw class="w-3 h-3" />
                <span>Retry Discovery</span>
              </button>
            </div>

            <!-- Loading Discovery Indicator -->
            <div v-if="isDiscovering" class="p-3 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <RefreshCw class="w-3.5 h-3.5 animate-spin text-forest-700" />
              <span>Probing WIA, TWAIN & eSCL drivers...</span>
            </div>

            <!-- DRIVER SELECTOR -->
            <div v-if="selectedDevice" class="space-y-1.5 pt-1">
              <label class="text-[11px] font-semibold text-zinc-700 block">
                Compatible Driver
              </label>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  v-for="drv in ['wia', 'twain', 'escl']"
                  :key="drv"
                  @click="selectedDriver = drv; saveCurrentSettings()"
                  :disabled="isScanning || !availableDriversForDevice.includes(drv)"
                  type="button"
                  :class="[
                    'py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-all text-center',
                    selectedDriver === drv
                      ? 'bg-forest-800 text-white border-forest-900 shadow-2xs'
                      : availableDriversForDevice.includes(drv)
                      ? 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200 cursor-pointer'
                      : 'bg-zinc-50 text-zinc-300 border-zinc-100 cursor-not-allowed opacity-60'
                  ]"
                >
                  {{ drv.toUpperCase() }}
                </button>
              </div>
              <p class="text-[10px] text-zinc-400">
                {{ selectedDriver === 'wia' ? 'Native Windows Image Acquisition (Recommended)' : (selectedDriver === 'twain' ? 'Manufacturer TWAIN Driver' : 'Network Driverless eSCL') }}
              </p>
            </div>

            <!-- PAPER SOURCE SELECTOR (Default Flatbed / Glass) -->
            <div class="space-y-1.5 pt-2 border-t border-zinc-100">
              <label class="text-[11px] font-semibold text-zinc-700 block">
                Paper Source
              </label>
              <div class="grid grid-cols-1 gap-1.5">
                <label
                  :class="[
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all',
                    paperSource === 'glass' ? 'bg-forest-50/70 border-forest-300 text-forest-950 font-semibold' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  ]"
                >
                  <input
                    type="radio"
                    value="glass"
                    v-model="paperSource"
                    @change="saveCurrentSettings"
                    class="text-forest-700 focus:ring-forest-600 mt-0.5"
                  />
                  <div>
                    <span class="block font-medium">Flatbed / Glass</span>
                    <span class="text-[10px] text-zinc-500 font-normal">Single document on the scanner glass (Recommended)</span>
                  </div>
                </label>

                <label
                  :class="[
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all',
                    paperSource === 'feeder' ? 'bg-forest-50/70 border-forest-300 text-forest-950 font-semibold' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  ]"
                >
                  <input
                    type="radio"
                    value="feeder"
                    v-model="paperSource"
                    @change="saveCurrentSettings"
                    class="text-forest-700 focus:ring-forest-600 mt-0.5"
                  />
                  <div>
                    <span class="block font-medium">Document Feeder (ADF)</span>
                    <span class="text-[10px] text-zinc-500 font-normal">Multi-page stack loaded in top feeder tray</span>
                  </div>
                </label>

                <label
                  :class="[
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all',
                    paperSource === 'duplex' ? 'bg-forest-50/70 border-forest-300 text-forest-950 font-semibold' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  ]"
                >
                  <input
                    type="radio"
                    value="duplex"
                    v-model="paperSource"
                    @change="saveCurrentSettings"
                    class="text-forest-700 focus:ring-forest-600 mt-0.5"
                  />
                  <div>
                    <span class="block font-medium">Duplex Feeder (Two-sided)</span>
                    <span class="text-[10px] text-zinc-500 font-normal">Two-sided automatic document feeder</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- RESOLUTION & COLOR MODE -->
            <div class="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100">
              <!-- Resolution DPI (Default 300) -->
              <div class="space-y-1">
                <label class="text-[11px] font-semibold text-zinc-700 block">
                  Resolution
                </label>
                <select
                  v-model.number="resolutionDpi"
                  @change="saveCurrentSettings"
                  :disabled="isScanning"
                  class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-forest-600"
                >
                  <option :value="150">150 DPI (Draft)</option>
                  <option :value="200">200 DPI (Standard)</option>
                  <option :value="300">300 DPI (High Quality)</option>
                  <option :value="600">600 DPI (Archival)</option>
                </select>
              </div>

              <!-- Color Mode (Default Color) -->
              <div class="space-y-1">
                <label class="text-[11px] font-semibold text-zinc-700 block">
                  Color Mode
                </label>
                <select
                  v-model="colorMode"
                  @change="saveCurrentSettings"
                  :disabled="isScanning"
                  class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-forest-600"
                >
                  <option value="color">Full Color (24-bit)</option>
                  <option value="gray">Grayscale</option>
                  <option value="bw">Black & White (1-bit)</option>
                </select>
              </div>
            </div>

            <!-- START SCANNING BUTTONS -->
            <div class="pt-3 space-y-2">
              <button
                v-if="!isScanning"
                @click="handleStartScan"
                :disabled="!selectedDevice"
                type="button"
                class="w-full py-2.5 px-4 rounded-xl bg-forest-800 hover:bg-forest-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
              >
                <Scan class="w-4 h-4 text-rose-200" />
                <span>{{ scannedPages.length > 0 ? 'Scan Additional Pages' : 'Start Scan' }}</span>
              </button>

              <button
                v-else
                @click="handleCancelScan"
                type="button"
                class="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
              >
                <X class="w-4 h-4" />
                <span>Cancel Active Scan</span>
              </button>
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL: Scan Workspace (Preview, Thumbnails & Document Details) -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-100/60">
          
          <!-- WORKSPACE STATUS / CONTROLS BAR -->
          <div class="px-5 py-2.5 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0">
            <!-- Left: Scanned Pages Counter & View Switcher -->
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                <Layers class="w-4 h-4 text-forest-700" />
                <span>{{ scannedPages.length }} Page{{ scannedPages.length === 1 ? '' : 's' }} Scanned</span>
              </div>

              <!-- Switch between Page Inspection & Combined PDF -->
              <div v-if="scannedPages.length > 0" class="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-xs">
                <button
                  @click="previewMode = 'pages'"
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                    previewMode === 'pages' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-900'
                  ]"
                >
                  Page Thumbnails
                </button>
                <button
                  @click="previewMode = 'pdf'"
                  type="button"
                  :class="[
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                    previewMode === 'pdf' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-900'
                  ]"
                >
                  PDF Document Preview
                </button>
              </div>
            </div>

            <!-- Right: Zoom & Remove Page Controls -->
            <div v-if="scannedPages.length > 0 && previewMode === 'pages'" class="flex items-center gap-2">
              <button
                @click="zoomLevel = Math.max(50, zoomLevel - 25)"
                type="button"
                class="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut class="w-3.5 h-3.5" />
              </button>
              <span class="text-[11px] font-mono text-zinc-600 min-w-10 text-center">{{ zoomLevel }}%</span>
              <button
                @click="zoomLevel = Math.min(200, zoomLevel + 25)"
                type="button"
                class="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn class="w-3.5 h-3.5" />
              </button>

              <button
                v-if="currentSelectedPage"
                @click="handleRemovePage(currentSelectedPage.pageNumber)"
                type="button"
                class="ml-2 px-2 py-1 rounded-md text-[11px] text-rose-600 hover:bg-rose-50 border border-rose-200 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                title="Remove current selected page"
              >
                <Trash2 class="w-3 h-3" />
                <span>Remove Page {{ currentSelectedPage.pageNumber }}</span>
              </button>
            </div>
          </div>

          <!-- ACTIVE SCANNING IN-PROGRESS BANNER -->
          <div v-if="isScanning" class="p-4 bg-forest-50 border-b border-forest-200/80 animate-in fade-in">
            <div class="flex items-center gap-3">
              <RefreshCw class="w-5 h-5 text-forest-800 animate-spin shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-forest-950">
                  Scanning in progress...
                </p>
                <p class="text-[11px] text-forest-800 truncate">
                  {{ scanProgressStatus }}
                </p>
              </div>
            </div>
            <!-- Indeterminate Progress bar -->
            <div class="w-full bg-forest-200/60 rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div class="bg-forest-800 h-1.5 rounded-full w-2/5 animate-[pulse_1.5s_infinite]"></div>
            </div>
          </div>

          <!-- ERROR BANNER -->
          <div v-if="scanError" class="p-3.5 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle class="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div class="flex-1">
              <strong class="font-semibold block">Scan Notice:</strong>
              <span>{{ scanError }}</span>
              <div v-if="scanError.toLowerCase().includes('feeder') || scanError.toLowerCase().includes('glass')" class="mt-2.5">
                <button
                  @click="handleSwitchToGlassAndScan"
                  type="button"
                  class="px-3 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Scan class="w-3.5 h-3.5 text-rose-200" />
                  <span>Switch to Flatbed / Glass & Scan Now</span>
                </button>
              </div>
            </div>
            <button @click="scanError = ''" class="text-rose-500 hover:text-rose-800 cursor-pointer">
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- WORKSPACE VIEWER CONTENT -->
          <div class="flex-1 overflow-hidden flex flex-col p-4">
            
            <!-- EMPTY WORKSPACE (No pages scanned yet) -->
            <div
              v-if="scannedPages.length === 0"
              class="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 bg-white rounded-xl border border-zinc-200/80 shadow-2xs"
            >
              <div class="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3">
                <Scan class="w-8 h-8" />
              </div>
              <h4 class="text-sm font-bold text-zinc-800">Ready to Scan</h4>
              <p class="text-xs text-zinc-500 max-w-md mt-1 leading-relaxed">
                Select your scanner on the left, choose your paper source (Feeder / ADF recommended for multi-page documents), and click <strong>Start Scan</strong>.
              </p>
            </div>

            <!-- PDF EMBEDDED PREVIEW MODE -->
            <div
              v-else-if="previewMode === 'pdf'"
              class="flex-1 bg-zinc-800 rounded-xl overflow-hidden flex flex-col shadow-inner"
            >
              <iframe
                v-if="pdfPreviewDataUrl"
                :src="pdfPreviewDataUrl"
                class="w-full h-full border-0 rounded-xl"
                title="Compiled PDF Preview"
              ></iframe>
              <div v-else class="flex-1 flex items-center justify-center text-white/60 text-xs">
                Generating PDF Preview...
              </div>
            </div>

            <!-- PAGE THUMBNAILS & LARGE INSPECTION VIEW -->
            <div v-else class="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
              
              <!-- Left: Horizontal / Vertical Thumbnail Strip -->
              <div class="w-full lg:w-48 overflow-x-auto lg:overflow-y-auto flex lg:flex-col gap-2.5 p-2 bg-white rounded-xl border border-zinc-200/80 shrink-0">
                <div
                  v-for="(pg, idx) in scannedPages"
                  :key="pg.pageNumber"
                  @click="selectedPageIndex = idx"
                  :class="[
                    'group relative rounded-lg border-2 p-1.5 transition-all cursor-pointer flex flex-col items-center shrink-0 w-28 lg:w-full',
                    selectedPageIndex === idx
                      ? 'border-forest-700 bg-forest-50/40 shadow-xs'
                      : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                  ]"
                >
                  <img
                    :src="pg.thumbnail"
                    :alt="'Page ' + pg.pageNumber"
                    class="w-full h-32 lg:h-36 object-contain rounded bg-white border border-zinc-100 shadow-2xs"
                  />
                  <div class="w-full flex items-center justify-between mt-1.5 px-1">
                    <span class="text-[10px] font-bold text-zinc-700 font-mono">
                      Page {{ pg.pageNumber }}
                    </span>
                    <button
                      @click.stop="handleRemovePage(pg.pageNumber)"
                      type="button"
                      class="text-zinc-400 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                      title="Remove page"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Right: Large Selected Page Preview -->
              <div class="flex-1 bg-zinc-200/70 rounded-xl border border-zinc-300/80 overflow-auto flex items-center justify-center p-4 relative shadow-inner">
                <div
                  v-if="currentSelectedPage"
                  class="transition-transform duration-150 ease-out"
                  :style="{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }"
                >
                  <img
                    :src="currentSelectedPage.previewUrl"
                    :alt="'Page ' + currentSelectedPage.pageNumber"
                    class="max-h-[68vh] object-contain rounded-md shadow-lg bg-white border border-zinc-200"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- FOOTER / DOCUMENT FINALIZATION BAR -->
          <div class="px-5 py-3 bg-white border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <!-- Filename input -->
            <div class="flex items-center gap-2 flex-1 max-w-md">
              <label class="text-xs font-semibold text-zinc-700 shrink-0">
                PDF File Name:
              </label>
              <input
                v-model="documentName"
                type="text"
                placeholder="document_scan.pdf"
                class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest-600 truncate"
              />
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center justify-end gap-2.5">
              <button
                v-if="scannedPages.length > 0"
                @click="handleDiscardSession(true)"
                type="button"
                class="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Discard Pages
              </button>

              <!-- Local Save Button -->
              <button
                v-if="isDesktop"
                @click="handleSavePdfLocally"
                :disabled="isFinalizing || scannedPages.length === 0"
                type="button"
                class="px-3 py-1.5 rounded-lg border border-zinc-300 hover:bg-zinc-100 text-zinc-700 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                <Download class="w-3.5 h-3.5" />
                <span>Save PDF Locally</span>
              </button>

              <!-- Attach to Activity Design Button (Primary) -->
              <button
                v-if="activityDesign"
                @click="handleAttachToActivityDesign"
                :disabled="isFinalizing || scannedPages.length === 0"
                type="button"
                class="px-4 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 class="w-4 h-4 text-emerald-300" />
                <span>{{ isFinalizing ? 'Attaching Document...' : 'Save & Attach to AD #' + activityDesign.id }}</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
