# FlowDesk — Desktop Scanner Integration Guide (NAPS2)

This document provides complete instructions for configuring, operating, testing, and troubleshooting physical hardware scanner integration in the **FlowDesk Windows Desktop application**.

---

## 1. Overview & Architecture

FlowDesk interfaces with document scanners using a secure, decoupled Electron architecture powered by the **NAPS2 (Not Another PDF Scanner)** command-line interface (`NAPS2.Console.exe`).

### Key Principles
- **No Mock Devices:** Hardware discovery queries real device interfaces via Windows WIA, TWAIN, and eSCL backends. No hardcoded or dummy scanner lists are ever used.
- **Strict Process Security:** Scanning processes are spawned using `child_process.spawn()` with fixed binary paths and argument arrays. No shell commands are constructed from user input.
- **Isolated Sessions:** Scans are captured as individual lossless PNG pages in isolated temporary session folders, allowing multi-page inspection, page deletion, renumbering, and live compilation into a single PDF.
- **Unified Attachment Model:** Finalized PDFs are saved into FlowDesk's permanent application storage (`attachments/finance/<activityDesignId>/`) and registered in SQLite (and mirrored in Dexie schema v11 for cross-mode parity).

---

## 2. Windows Prerequisites

1. **Operating System:** Windows 10 or Windows 11 (64-bit).
2. **Scanner Drivers:**
   - **WIA (Windows Image Acquisition):** Default built-in driver system on Windows. Supported by almost all modern flatbed scanners and Multi-Function Printers (MFPs).
   - **TWAIN:** Required for specialized high-speed document scanners (e.g., Fujitsu fi-series, Canon DR-series, Epson WorkForce). Install the official manufacturer TWAIN driver.
   - **eSCL / AirScan:** Driverless scanning protocol for compatible network scanners and MFPs connected over Wi-Fi or Ethernet.
3. **NAPS2 Console CLI:** Required for hardware communication.

---

## 3. Installing & Configuring NAPS2

FlowDesk searches for `NAPS2.Console.exe` in the following order:
1. **Custom Configured Path:** Path explicitly selected by the user via the FlowDesk UI (`settings` table key `naps2_custom_path`).
2. **Bundled / Application Directory:** `<install_directory>/resources/bin/naps2/` or `<app_root>/bin/naps2/`.
3. **Standard 64-bit Installation:** `C:\Program Files\NAPS2\NAPS2.Console.exe`
4. **Standard 32-bit Installation:** `C:\Program Files (x86)\NAPS2\NAPS2.Console.exe`
5. **Per-User AppData Installation:** `%LOCALAPPDATA%\Programs\NAPS2\NAPS2.Console.exe`
6. **Chocolatey / Tools:** `C:\ProgramData\chocolatey\bin\naps2.console.exe` or `C:\tools\naps2\NAPS2.Console.exe`
7. **System PATH:** Any directory registered in the system `PATH` environment variable.

### Option A: Install via Windows Package Manager (Recommended)
Open PowerShell or Command Prompt and run:
```powershell
winget install NAPS2
```

### Option B: Install via Chocolatey
```powershell
choco install naps2
```

### Option C: Manual Installer or Portable Zip
1. Download the latest installer or Portable `.zip` from the official website: [https://www.naps2.com/download](https://www.naps2.com/download)
2. Run the installer or extract the portable archive.
3. If using the portable version in a custom folder, open FlowDesk's **Scan Document** modal, click **Browse for NAPS2.Console.exe**, and select the executable.

---

## 4. Verifying the CLI Independently

Before testing inside FlowDesk, you can verify your scanner and NAPS2 setup in PowerShell or Command Prompt:

### Check Version
```cmd
"C:\Program Files\NAPS2\NAPS2.Console.exe" --version
```

### Discover Scanners by Driver
- **Query WIA Devices:**
  ```cmd
  "C:\Program Files\NAPS2\NAPS2.Console.exe" --driver wia --listdevices
  ```
- **Query TWAIN Devices:**
  ```cmd
  "C:\Program Files\NAPS2\NAPS2.Console.exe" --driver twain --listdevices
  ```
- **Query Network (eSCL) Devices:**
  ```cmd
  "C:\Program Files\NAPS2\NAPS2.Console.exe" --driver escl --listdevices
  ```

### Perform a Test Scan
```cmd
"C:\Program Files\NAPS2\NAPS2.Console.exe" -o "C:\Temp\test_scan.pdf" --noprofile --driver wia --device "<Device_Name>" --source feeder --dpi 300 --bitdepth color
```

---

## 5. Storage Locations & Directory Layout

FlowDesk organizes data under Windows standard `%APPDATA%\FlowDesk\` (`app.getPath('userData')/FlowDesk/`):

```text
%APPDATA%\FlowDesk\
├── data/
│   └── flowdesk.db            (Primary SQLite database)
├── attachments/
│   └── finance/
│       └── <activityDesignId>/
│           └── <timestamp>_<sanitized_filename>.pdf
├── temp_scans/
│   └── scan_<timestamp>_<id>/ (Isolated scratch session; automatically cleaned up)
│       ├── page_001.png
│       ├── page_002.png
│       └── session_preview.pdf
└── backups/                   (Compressed SQLite & attachment backup archives)
```

- **Temporary Scan Files:** Written exclusively under `temp_scans/`. When a user finalizes a scan, discards a session, or closes the application, temporary files are wiped safely without touching saved attachments.
- **Permanent Attachments:** Stored in `attachments/finance/<activityDesignId>/` and referenced by relative path in the SQLite `attachments` table.

---

## 6. How Backup & Restore Works

1. **Backup Creation:** FlowDesk's backup service (`electron/services/backupService.js`) creates a unified `.zip` archive containing the SQLite database file and the entire `attachments/` tree.
2. **Restore:** Unpacks the archive back into the active data directory and reinitializes the database connection. All attached scanned documents, metadata, and Activity Design links remain intact.

---

## 7. Desktop vs. Browser Mode

- **Desktop Mode (Electron):** Direct access to hardware scanners via local process execution, WIA/TWAIN hardware drivers, local file storage, and SQLite database.
- **Browser Mode (PWA / Web):** Web browsers cannot execute native OS binaries or communicate directly with WIA/TWAIN hardware due to browser sandbox security models.
  - In browser mode, FlowDesk informs the user that physical scanning requires the desktop app.
  - Users can upload existing scanned PDFs, which are saved in local Dexie IndexedDB storage (Version 11 schema) linked to the Activity Design.

---

## 8. Troubleshooting Guide

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **"NAPS2 CLI Not Detected"** | NAPS2 is not installed in standard paths and not in PATH. | Run `winget install NAPS2` or click **Browse for NAPS2.Console.exe** in FlowDesk. |
| **"No Scanners Detected"** | Scanner is powered off, USB disconnected, or driver not installed. | Check cable/power, install manufacturer WIA/TWAIN driver, and click **Refresh Devices**. |
| **"Document feeder (ADF) is empty"** | Paper source set to "Feeder / ADF" but no paper loaded. | Load paper into the feeder or switch Paper Source to **Flatbed / Glass**. |
| **"Scanner is busy or in use"** | Another scanning software or Windows Fax & Scan is holding the driver lock. | Close other scanning tools and retry. |
| **Network scanner not appearing** | eSCL/AirScan disabled on printer or subnet firewall blocking mDNS. | Enable eSCL/AirScan in printer web interface (EWS) and ensure computer is on same subnet. |

---

## 9. Licensing & Redistribution

- **NAPS2:** Released under the **GNU General Public License v2.0 (GPLv2+)**.
- FlowDesk executes NAPS2 as an external standalone CLI tool via standard system process invocation (`child_process.spawn`). No GPL code is compiled into or statically linked with FlowDesk's source code.
- Enterprises redistributing NAPS2 bundled alongside installers can place the NAPS2 portable binary into `bin/naps2/` and include the standard NAPS2 license notice.
