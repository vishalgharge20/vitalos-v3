import { useState } from 'react'
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineClipboardDocument,
  HiOutlineClipboardDocumentCheck,
  HiOutlineArrowPath,
  HiOutlineBolt,
  HiOutlineClock,
  HiOutlineShieldCheck,
  HiOutlineDevicePhoneMobile,
} from 'react-icons/hi2'
import Modal from './Modal'
import { generateSyncToken, getSyncEndpointUrl, getShortcutDownloadUrl } from '@/api/client'

function formatRelativeTime(dateString) {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Never'
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

function formatExactTime(dateString) {
  if (!dateString) return 'No sync recorded yet'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Invalid date'
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const METRIC_LABELS = {
  steps: 'Steps',
  distance: 'Distance',
  activeCalories: 'Active Calories',
  basalCalories: 'Basal Calories',
  exerciseMinutes: 'Exercise Time',
  standHours: 'Stand Hours',
  heartRate: 'Heart Rate',
  restingHeartRate: 'Resting HR',
  walkingHeartRate: 'Walking HR',
  hrv: 'HRV (SDNN)',
  spo2: 'Blood Oxygen',
  respiratoryRate: 'Respiratory Rate',
  vo2max: 'VO2 Max',
  sleep: 'Sleep Stages',
  weight: 'Weight',
  bodyFat: 'Body Fat %',
  walkingSpeed: 'Walking Speed',
  walkingAsymmetry: 'Walking Asymmetry',
  temperature: 'Body Temp',
  workouts: 'Workouts',
}

export default function SyncStatusModal({ open, onClose, syncStatus, onRefreshStatus }) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('status') // 'status' | 'setup'

  const endpointUrl = getSyncEndpointUrl()
  const token = syncStatus?.syncToken || 'vitalos-sync-token'

  const handleCopy = (text, setter) => {
    navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefreshStatus?.()
    } finally {
      setTimeout(() => setRefreshing(false), 400)
    }
  }

  const handleRegenerateToken = async () => {
    if (!confirm('Generate a new sync token? You will need to update your iPhone Shortcut.')) return
    try {
      await generateSyncToken()
      await onRefreshStatus?.()
    } catch (err) {
      alert(`Could not regenerate token: ${err.message}`)
    }
  }

  const isLive = Boolean(syncStatus?.connected)
  const activeMetrics = syncStatus?.activeMetrics || []

  const sampleShortcutPayload = `{
  "client": "shortcuts",
  "date": "CURRENT_DATE_YYYY_MM_DD",
  "metrics": {
    "steps": 7500,
    "distanceKm": 5.4,
    "activeCalories": 380,
    "exerciseMinutes": 30,
    "standHours": 10,
    "heartRate": { "average": 72, "resting": 58, "walkingAverage": 90 },
    "hrv": 52,
    "spo2": 98,
    "respiratoryRate": 15,
    "vo2max": 43.5,
    "weight": 72.0,
    "bodyFat": 16.5,
    "sleep": { "duration": 7.4, "deep": 1.5, "rem": 1.8, "light": 4.1 }
  }
}`

  return (
    <Modal open={open} onClose={onClose} title="Apple Health Automatic Sync" subtitle="100% Free Background Sync Pipeline" maxWidth="max-w-2xl">
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-[var(--color-border)]">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-4 text-xs font-medium transition-colors border-b-2 ${
              activeTab === 'status'
                ? 'border-[var(--color-ion-500)] text-white'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-white'
            }`}
          >
            Connection Status
          </button>
          <button
            onClick={() => setActiveTab('setup')}
            className={`pb-2.5 px-4 text-xs font-medium transition-colors border-b-2 ${
              activeTab === 'setup'
                ? 'border-[var(--color-ion-500)] text-white'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-white'
            }`}
          >
            iPhone Shortcut Setup Guide
          </button>
        </div>

        {activeTab === 'status' ? (
          <>
            {/* Live Status Hero */}
            <div className="glass rounded-2xl p-5 border border-[var(--color-border)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      isLive
                        ? 'bg-[var(--color-vital-teal)]/20 text-[var(--color-vital-teal)]'
                        : 'bg-[var(--color-vital-amber)]/20 text-[var(--color-vital-amber)]'
                    }`}
                  >
                    {isLive ? <HiOutlineCheckCircle size={24} /> : <HiOutlineExclamationTriangle size={24} />}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-white">
                      {isLive ? 'Apple Health Connected' : 'Waiting for First iPhone Sync'}
                    </h3>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {isLive
                        ? `Last sync: ${formatRelativeTime(syncStatus.lastSyncAt)} (${formatExactTime(syncStatus.lastSyncAt)})`
                        : 'Configure your free iOS Shortcut to begin automated hourly syncing.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="rounded-lg border border-[var(--color-border)] p-2 text-xs text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] hover:text-white"
                  title="Refresh Sync Status"
                >
                  <HiOutlineArrowPath size={16} className={refreshing ? 'animate-spin' : ''} />
                </button>
              </div>

              {syncStatus?.lastSyncMessage && (
                <div className="mt-4 rounded-xl bg-[var(--color-surface)]/60 px-3.5 py-2.5 text-xs text-[var(--color-text-secondary)] font-mono">
                  {syncStatus.lastSyncMessage}
                </div>
              )}

              {syncStatus?.lastError && (
                <div className="mt-3 rounded-xl border border-[var(--color-vital-rose)]/40 bg-[var(--color-vital-rose)]/10 px-3.5 py-2.5 text-xs text-[var(--color-vital-rose)]">
                  <b>Last Error:</b> {syncStatus.lastError}
                </div>
              )}
            </div>

            {/* Sync Summary Counters */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-center">
                <p className="font-display tabular-nums text-xl font-bold text-white">
                  {syncStatus?.totalDays ?? 0}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Total Days Logged</p>
              </div>
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-center">
                <p className="font-display tabular-nums text-xl font-bold text-[var(--color-vital-teal)]">
                  {syncStatus?.totalSamples ? syncStatus.totalSamples.toLocaleString() : 0}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Raw Samples Preserved</p>
              </div>
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-center">
                <p className="font-display tabular-nums text-xl font-bold text-[var(--color-ion-500)]">
                  {syncStatus?.totalWorkouts ?? 0}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">Workouts Synced</p>
              </div>
            </div>

            {/* Active Synced Metrics */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Available & Detected Health Metrics ({activeMetrics.length || 0})
                </h4>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">Auto-detected from iPhone</span>
              </div>

              {activeMetrics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {activeMetrics.map((key) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-vital-teal)]/30 bg-[var(--color-vital-teal)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--color-vital-teal)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-vital-teal)]" />
                      {METRIC_LABELS[key] || key}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-tertiary)]">
                  No metrics received yet. Once your iOS Shortcut runs, your active HealthKit types will populate here automatically.
                </div>
              )}
            </div>

            {/* Quick credentials teaser */}
            <div className="rounded-2xl bg-[var(--color-surface)]/70 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white">Need to connect or update your iPhone?</p>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">View endpoint URL and 3-step setup guide.</p>
              </div>
              <button
                onClick={() => setActiveTab('setup')}
                className="rounded-xl bg-[var(--color-ion-500)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                View Setup Guide
              </button>
            </div>
          </>
        ) : (
          /* Setup Guide Tab */
          <div className="space-y-5">
            <div className="rounded-xl bg-[var(--color-ion-500)]/10 border border-[var(--color-ion-500)]/30 p-4 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <p className="font-semibold text-white mb-1 flex items-center gap-1.5">
                <HiOutlineBolt className="text-[var(--color-ion-500)]" />
                100% Free Automatic Hourly Sync with iOS Shortcuts
              </p>
              Apple Shortcuts runs directly on your iPhone at zero cost. By setting up a Personal Automation with &quot;Run Immediately&quot; enabled, your iPhone will sync your steps, heart rate, sleep, and workouts automatically in the background without any manual taps!
            </div>

            {/* Direct Download Card */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--color-vital-teal)]/40 bg-[var(--color-vital-teal)]/10 p-3.5">
              <div>
                <p className="text-xs font-semibold text-white">Pre-Built Shortcut File</p>
                <p className="text-[11px] text-[var(--color-text-secondary)]">Download directly to your iPhone and open in Shortcuts</p>
              </div>
              <a
                href={getShortcutDownloadUrl()}
                download="VitalOS-Sync.shortcut"
                className="rounded-xl bg-[var(--color-vital-teal)] px-3.5 py-1.5 text-xs font-semibold text-black transition hover:opacity-90"
              >
                Download Shortcut
              </a>
            </div>

            {/* Credentials Card */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  1. Your VitalOS Webhook Endpoint URL
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={endpointUrl}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(endpointUrl, setCopiedUrl)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white transition hover:bg-[var(--color-surface-hover)]"
                  >
                    {copiedUrl ? <HiOutlineClipboardDocumentCheck size={16} className="text-[var(--color-vital-teal)]" /> : <HiOutlineClipboardDocument size={16} />}
                    {copiedUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                    2. Device Sync Secret Token
                  </label>
                  {!syncStatus?.isEnvSecret && (
                    <button
                      onClick={handleRegenerateToken}
                      className="text-[11px] text-[var(--color-ion-500)] hover:underline"
                    >
                      Regenerate
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="password"
                    readOnly
                    value={token}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(token, setCopiedToken)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white transition hover:bg-[var(--color-surface-hover)]"
                  >
                    {copiedToken ? <HiOutlineClipboardDocumentCheck size={16} className="text-[var(--color-vital-teal)]" /> : <HiOutlineClipboardDocument size={16} />}
                    {copiedToken ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 text-xs space-y-3">
              <p className="font-semibold text-white">How to Build the Shortcut (No Dictionary Action Needed!):</p>
              <ol className="list-decimal pl-4 space-y-2.5 text-[var(--color-text-secondary)]">
                <li>
                  <b className="text-white">Query Health Metrics:</b> In the iPhone <span className="text-white font-medium">Shortcuts</span> app, create a new shortcut named <span className="font-mono text-white">VitalOS Sync</span>. Add actions to query Health data:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li><span className="font-mono text-white">Find Health Samples</span> (Type: Step Count, Date: Today) → Calculate Statistics (Sum)</li>
                    <li><span className="font-mono text-white">Find Health Samples</span> (Type: Heart Rate, Date: Today) → Calculate Statistics (Average)</li>
                    <li><span className="font-mono text-white">Find Health Samples</span> (Type: Active Energy, Date: Today) → Calculate Statistics (Sum)</li>
                    <li>(Optional) Add Resting HR, HRV, SpO2, Sleep Duration.</li>
                  </ul>
                </li>
                <li>
                  <b className="text-white">Send Data (Skip Dictionary):</b> Add <span className="text-white font-medium">&quot;Get Contents of URL&quot;</span>:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li><b>URL:</b> Paste your endpoint URL from box 1 above.</li>
                    <li><b>Method:</b> Change from GET to <span className="text-white font-semibold">POST</span>.</li>
                    <li><b>Headers:</b> Tap &quot;Add new header&quot; → Key: <span className="font-mono text-white">x-webhook-secret</span>, Value: Paste your token from box 2.</li>
                    <li><b>Request Body:</b> Select <span className="text-white font-semibold">JSON</span>. Tap <span className="text-[var(--color-ion-500)] font-semibold">&quot;Add new field&quot;</span>:
                      <br />• Key: <span className="font-mono text-white">steps</span> (Number) → choose the Step Count variable
                      <br />• Key: <span className="font-mono text-white">heartRate</span> (Number) → choose the Heart Rate variable
                      <br />• Key: <span className="font-mono text-white">activeCalories</span> (Number) → choose the Active Energy variable
                    </li>
                  </ul>
                </li>
                <li>
                  <b className="text-white">Set Up Background Automation:</b> Go to the <span className="text-white font-medium">Automation</span> tab in Shortcuts → tap <b>+</b> → select <b>&quot;When Connected to Charger&quot;</b> or <b>&quot;Time of Day&quot;</b>. Choose <span className="text-[var(--color-vital-teal)] font-medium">&quot;Run Immediately&quot;</span> and toggle <span className="text-white font-medium">&quot;Notify When Run&quot;</span> OFF.
                </li>
              </ol>
            </div>

            {/* Sample Payload Reference */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-tertiary)] font-mono">Shortcuts JSON Payload Format</span>
                <button
                  onClick={() => handleCopy(sampleShortcutPayload, setCopiedPayload)}
                  className="text-xs text-[var(--color-ion-500)] hover:underline flex items-center gap-1"
                >
                  {copiedPayload ? 'Copied!' : 'Copy Template'}
                </button>
              </div>
              <pre className="max-h-40 overflow-y-auto rounded-xl bg-[var(--color-base)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                {sampleShortcutPayload}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
