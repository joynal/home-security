/**
 * Settings page — Scrypted-style tabbed configuration suite.
 * Tabs: System & Storage, Cameras & Zones, AI & Detection, Alerts & Notifications, Security.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Send,
  Sliders,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { settingsService } from '@/services/settings';
import { systemService } from '@/services/system';
import { tokens } from '@/theme/designTokens';
import type { AppSettingsConfig, CameraConfigDto, SystemHealthResponse, ZoneDto } from '@/types';

type Tab = 'system' | 'cameras' | 'ai' | 'alerts' | 'security';

const tabs = [
  { id: 'system' as Tab, label: 'System & Storage', icon: HardDrive },
  { id: 'cameras' as Tab, label: 'Cameras & Zones', icon: Camera },
  { id: 'ai' as Tab, label: 'AI & Detection', icon: Sliders },
  { id: 'alerts' as Tab, label: 'Alerts & Notifications', icon: Bell },
  { id: 'security' as Tab, label: 'Security & Auth', icon: Lock },
];

export default function SettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('system');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppSettingsConfig | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);

  // System & Storage state
  const [retainDays, setRetainDays] = useState(30);
  const [minDiskFreeGb, setMinDiskFreeGb] = useState(10.0);
  const [deleteOnlyIfDiskFull, setDeleteOnlyIfDiskFull] = useState(true);
  const [vacuuming, setVacuuming] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);

  // AI state
  const [similarityThreshold, setSimilarityThreshold] = useState(0.4);
  const [loiteringSeconds, setLoiteringSeconds] = useState(30);
  const [autoEnrichment, setAutoEnrichment] = useState(true);
  const [savingAi, setSavingAi] = useState(false);

  // Alerts state
  const [activeAlert, setActiveAlert] = useState('console');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [testAlertMessage, setTestAlertMessage] = useState('Test alert from Aegis Vision AI');
  const [sendingTestAlert, setSendingTestAlert] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);

  // Camera modal state
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [cameraForm, setCameraForm] = useState<CameraConfigDto>({
    id: '',
    name: '',
    type: 'rtsp',
    rtsp_url: '',
    rtsp_sub_url: '',
    camera_index: 0,
    detect: { width: 640, height: 360, fps: 5 },
    record: {
      enabled: true,
      retain_days: 30,
      min_disk_free_gb: 10.0,
      delete_only_if_disk_full: true,
    },
    zones: [],
  });
  const [testingCamera, setTestingCamera] = useState(false);
  const [cameraTestResult, setCameraTestResult] = useState<{
    success: boolean;
    text: string;
  } | null>(null);
  const [zoneInputName, setZoneInputName] = useState('');
  const [zoneInputCoords, setZoneInputCoords] = useState(
    '[[0, 0], [300, 0], [300, 360], [0, 360]]',
  );
  const [deletingCameraId, setDeletingCameraId] = useState<string | null>(null);

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Initial load
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, hlt] = await Promise.all([
        settingsService.getConfig(),
        systemService.getSystemHealth().catch(() => null),
      ]);
      setConfig(cfg);
      setHealth(hlt);

      setRetainDays(cfg.retention.retain_days ?? 30);
      setMinDiskFreeGb(cfg.retention.min_disk_free_gb ?? 10.0);
      setDeleteOnlyIfDiskFull(cfg.retention.delete_only_if_disk_full ?? true);

      setSimilarityThreshold(cfg.ai.similarity_threshold ?? 0.4);
      setLoiteringSeconds(cfg.ai.loitering_seconds ?? 30);
      setAutoEnrichment(cfg.ai.auto_enrichment ?? true);

      setActiveAlert(cfg.active_alert ?? 'console');
      setNtfyTopic(cfg.alerts.ntfy_topic ?? '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load configuration';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Retention handler
  const handleSaveRetention = async () => {
    try {
      setSavingRetention(true);
      await settingsService.updateConfig({
        retention: {
          retain_days: Number(retainDays),
          min_disk_free_gb: Number(minDiskFreeGb),
          delete_only_if_disk_full: Boolean(deleteOnlyIfDiskFull),
        },
      });
      toast.success('Storage retention policy saved');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update retention';
      toast.error(msg);
    } finally {
      setSavingRetention(false);
    }
  };

  // Vacuum handler
  const handleVacuum = async () => {
    try {
      setVacuuming(true);
      const res = await settingsService.vacuumDatabase();
      toast.success(
        `Database vacuumed! Before: ${res.size_before_mb} MB, After: ${res.size_after_mb} MB`,
      );
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Vacuum failed';
      toast.error(msg);
    } finally {
      setVacuuming(false);
    }
  };

  // AI handler
  const handleSaveAi = async () => {
    try {
      setSavingAi(true);
      await settingsService.updateConfig({
        ai: {
          similarity_threshold: Number(similarityThreshold),
          loitering_seconds: Number(loiteringSeconds),
          auto_enrichment: Boolean(autoEnrichment),
        },
      });
      toast.success('AI vision parameters updated');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update AI settings';
      toast.error(msg);
    } finally {
      setSavingAi(false);
    }
  };

  // Alerts handler
  const handleSaveAlerts = async () => {
    try {
      setSavingAlerts(true);
      const payload: Record<string, unknown> = {
        active_alert: activeAlert,
      };
      if (activeAlert === 'telegram') {
        if (telegramBotToken) payload.telegram_bot_token = telegramBotToken;
        if (telegramChatId) payload.telegram_chat_id = telegramChatId;
      } else if (activeAlert === 'ntfy') {
        payload.ntfy_topic = ntfyTopic;
      }
      await settingsService.updateConfig(payload);
      toast.success('Alert settings saved');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update alert settings';
      toast.error(msg);
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleTestAlert = async () => {
    try {
      setSendingTestAlert(true);
      const res = await settingsService.testAlert({
        provider: activeAlert,
        message: testAlertMessage,
      });
      if (res.success) {
        toast.success(res.detail);
      } else {
        toast.error(res.detail);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test alert failed';
      toast.error(msg);
    } finally {
      setSendingTestAlert(false);
    }
  };

  // Camera Handlers
  const openAddCameraModal = () => {
    setEditingCameraId(null);
    setCameraForm({
      id: '',
      name: '',
      type: 'rtsp',
      rtsp_url: '',
      rtsp_sub_url: '',
      camera_index: 0,
      detect: { width: 640, height: 360, fps: 5 },
      record: {
        enabled: true,
        retain_days: 30,
        min_disk_free_gb: 10.0,
        delete_only_if_disk_full: true,
      },
      zones: [],
    });
    setCameraTestResult(null);
    setCameraModalOpen(true);
  };

  const openEditCameraModal = (cam: CameraConfigDto) => {
    setEditingCameraId(cam.id);
    setCameraForm(JSON.parse(JSON.stringify(cam)));
    setCameraTestResult(null);
    setCameraModalOpen(true);
  };

  const handleTestCameraConnection = async () => {
    try {
      setTestingCamera(true);
      setCameraTestResult(null);
      const res = await settingsService.testCamera({
        type: cameraForm.type,
        rtsp_url: cameraForm.rtsp_url || undefined,
        camera_index: cameraForm.camera_index,
      });
      if (res.success) {
        setCameraTestResult({
          success: true,
          text: `Connected successfully (${res.width}x${res.height} @ ${res.fps} FPS)`,
        });
      } else {
        setCameraTestResult({
          success: false,
          text: res.error || 'Connection failed',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      setCameraTestResult({ success: false, text: msg });
    } finally {
      setTestingCamera(false);
    }
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cameraForm.id.trim() || !cameraForm.name.trim()) {
      toast.error('Camera ID and Name are required');
      return;
    }
    try {
      if (editingCameraId) {
        await settingsService.updateCamera(editingCameraId, cameraForm);
        toast.success(`Camera '${cameraForm.name}' updated`);
      } else {
        await settingsService.addCamera(cameraForm);
        toast.success(`Camera '${cameraForm.name}' added`);
      }
      setCameraModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save camera';
      toast.error(msg);
    }
  };

  const handleDeleteCamera = async (id: string) => {
    try {
      await settingsService.deleteCamera(id);
      toast.success('Camera deleted');
      setDeletingCameraId(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete camera';
      toast.error(msg);
    }
  };

  const handleAddZone = () => {
    if (!zoneInputName.trim()) {
      toast.error('Zone name is required');
      return;
    }
    try {
      const parsed = JSON.parse(zoneInputCoords);
      if (!Array.isArray(parsed) || parsed.length < 3) {
        toast.error('Zone must contain at least 3 [x, y] coordinates');
        return;
      }
      const newZone: ZoneDto = {
        name: zoneInputName.trim(),
        coordinates: parsed,
      };
      setCameraForm((prev) => ({
        ...prev,
        zones: [...(prev.zones || []), newZone],
      }));
      setZoneInputName('');
    } catch {
      toast.error('Invalid JSON coordinates format (e.g. [[0, 0], [100, 0], [100, 100]])');
    }
  };

  const handleRemoveZone = (idx: number) => {
    setCameraForm((prev) => ({
      ...prev,
      zones: (prev.zones || []).filter((_, i) => i !== idx),
    }));
  };

  // Password Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    try {
      setUpdatingPassword(true);
      await settingsService.changePassword(currentPassword, newPassword);
      toast.success('Admin password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      toast.error(msg);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const ruleLen = newPassword.length >= 8;
  const ruleUpper = /[A-Z]/.test(newPassword);
  const ruleLower = /[a-z]/.test(newPassword);
  const ruleDigit = /[0-9]/.test(newPassword);

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Settings</span>
        <span className="page-header__spacer" />
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            background: 'transparent',
            border: `1px solid ${tokens.colors.border.subtle}`,
            color: tokens.colors.text.secondary,
            padding: '6px 12px',
            borderRadius: tokens.radii.sm,
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.xs,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </header>

      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Navigation Tabs Sidebar */}
        <aside
          style={{
            width: '240px',
            borderRight: `1px solid ${tokens.colors.border.subtle}`,
            padding: `${tokens.spacing.md} ${tokens.spacing.sm}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.spacing.sm,
                  padding: '9px 12px',
                  borderRadius: tokens.radii.md,
                  fontSize: '13px',
                  fontWeight: active ? tokens.fontWeights.semibold : tokens.fontWeights.medium,
                  color: active ? tokens.colors.text.primary : tokens.colors.text.muted,
                  background: active ? tokens.colors.surface.subtle : 'transparent',
                  border: active
                    ? `1px solid ${tokens.colors.border.strong}`
                    : '1px solid transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: `background ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
                }}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Tab Content Panel */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: `${tokens.spacing.xl} ${tokens.spacing.xxl}`,
            maxWidth: '860px',
          }}
        >
          {/* TAB 1: SYSTEM & STORAGE */}
          {activeTab === 'system' && (
            <div>
              {/* Visual Storage Bar */}
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                  marginBottom: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: tokens.spacing.md,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: tokens.spacing.sm,
                      fontSize: tokens.fontSizes.base,
                      fontWeight: tokens.fontWeights.semibold,
                      color: tokens.colors.text.primary,
                    }}
                  >
                    <HardDrive size={18} />
                    <span>Disk Storage Breakdown</span>
                  </div>
                  {health && (
                    <span style={{ fontSize: '13px', color: tokens.colors.text.muted }}>
                      {health.disk.used_gb} GB used of {health.disk.total_gb} GB (
                      {health.disk.percent_used}%)
                    </span>
                  )}
                </div>

                {health && (
                  <>
                    <div
                      style={{
                        height: '10px',
                        borderRadius: '5px',
                        background: tokens.colors.bg.canvas,
                        overflow: 'hidden',
                        display: 'flex',
                        marginBottom: tokens.spacing.md,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (health.disk.recordings_gb / (health.disk.total_gb || 1)) * 100)}%`,
                          background: tokens.colors.accent.primary,
                        }}
                        title={`Recordings: ${health.disk.recordings_gb} GB`}
                      />
                      <div
                        style={{
                          width: `${Math.min(100, (health.disk.thumbnails_gb / (health.disk.total_gb || 1)) * 100)}%`,
                          background: tokens.colors.status.warning,
                        }}
                        title={`Thumbnails: ${health.disk.thumbnails_gb} GB`}
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: tokens.spacing.sm,
                      }}
                    >
                      <div
                        style={{
                          background: tokens.colors.surface.subtle,
                          padding: '10px 12px',
                          borderRadius: tokens.radii.sm,
                        }}
                      >
                        <div style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                          Recordings
                        </div>
                        <div
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: tokens.colors.accent.primary,
                          }}
                        >
                          {health.disk.recordings_gb} GB
                        </div>
                      </div>
                      <div
                        style={{
                          background: tokens.colors.surface.subtle,
                          padding: '10px 12px',
                          borderRadius: tokens.radii.sm,
                        }}
                      >
                        <div style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                          Thumbnails
                        </div>
                        <div
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: tokens.colors.status.warning,
                          }}
                        >
                          {health.disk.thumbnails_gb} GB
                        </div>
                      </div>
                      <div
                        style={{
                          background: tokens.colors.surface.subtle,
                          padding: '10px 12px',
                          borderRadius: tokens.radii.sm,
                        }}
                      >
                        <div style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                          SQLite DB
                        </div>
                        <div
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: tokens.colors.text.primary,
                          }}
                        >
                          {health.disk.database_mb} MB
                        </div>
                      </div>
                      <div
                        style={{
                          background: tokens.colors.surface.subtle,
                          padding: '10px 12px',
                          borderRadius: tokens.radii.sm,
                        }}
                      >
                        <div style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                          Free Space
                        </div>
                        <div
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: tokens.colors.status.online,
                          }}
                        >
                          {health.disk.free_gb} GB
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Retention Policy Card */}
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                  marginBottom: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.fontSizes.base,
                    fontWeight: tokens.fontWeights.semibold,
                    color: tokens.colors.text.primary,
                    marginBottom: tokens.spacing.xs,
                  }}
                >
                  Retention Rules & Disk Quotas
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: tokens.colors.text.muted,
                    marginBottom: tokens.spacing.lg,
                  }}
                >
                  Configure continuous recording lifecycle rules and automated cleanup thresholds.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.lg }}>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        marginBottom: '6px',
                      }}
                    >
                      <span style={{ color: tokens.colors.text.secondary }}>
                        Retention Window (Days)
                      </span>
                      <span style={{ fontWeight: 600, color: tokens.colors.text.primary }}>
                        {retainDays} days
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={180}
                      value={retainDays}
                      onChange={(e) => setRetainDays(Number(e.target.value))}
                      style={{ width: '100%', accentColor: tokens.colors.accent.primary }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '6px',
                      }}
                    >
                      Minimum Free Disk Space (GB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={0.5}
                      value={minDiskFreeGb}
                      onChange={(e) => setMinDiskFreeGb(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: tokens.radii.sm,
                        border: `1px solid ${tokens.colors.border.strong}`,
                        background: tokens.colors.surface.subtle,
                        color: tokens.colors.text.primary,
                        fontSize: '13px',
                      }}
                    />
                    <span style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                      When available volume space drops below this limit, oldest recording segments
                      are pruned.
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.sm }}>
                    <input
                      type="checkbox"
                      id="delDiskFull"
                      checked={deleteOnlyIfDiskFull}
                      onChange={(e) => setDeleteOnlyIfDiskFull(e.target.checked)}
                      style={{
                        accentColor: tokens.colors.accent.primary,
                        width: '16px',
                        height: '16px',
                      }}
                    />
                    <label
                      htmlFor="delDiskFull"
                      style={{
                        fontSize: '13px',
                        color: tokens.colors.text.primary,
                        cursor: 'pointer',
                      }}
                    >
                      Delete only if disk reaches limit (Preserve older recordings if disk has ample
                      free space)
                    </label>
                  </div>

                  <div>
                    <button
                      onClick={handleSaveRetention}
                      disabled={savingRetention}
                      style={{
                        background: tokens.colors.accent.primary,
                        color: '#fff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: tokens.radii.sm,
                        fontSize: '13px',
                        fontWeight: tokens.fontWeights.medium,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing.xs,
                      }}
                    >
                      <Save size={15} />
                      <span>{savingRetention ? 'Saving...' : 'Save Retention Policy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Maintenance Card */}
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.fontSizes.base,
                    fontWeight: tokens.fontWeights.semibold,
                    color: tokens.colors.text.primary,
                    marginBottom: tokens.spacing.xs,
                  }}
                >
                  Database Maintenance
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: tokens.colors.text.muted,
                    marginBottom: tokens.spacing.md,
                  }}
                >
                  Run SQLite VACUUM to defragment tables, rebuild indexes, and reclaim disk space
                  from deleted events.
                </p>
                <button
                  onClick={handleVacuum}
                  disabled={vacuuming}
                  style={{
                    background: tokens.colors.surface.raised,
                    border: `1px solid ${tokens.colors.border.strong}`,
                    color: tokens.colors.text.primary,
                    padding: '8px 16px',
                    borderRadius: tokens.radii.sm,
                    fontSize: '13px',
                    fontWeight: tokens.fontWeights.medium,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: tokens.spacing.xs,
                  }}
                >
                  <Database size={15} />
                  <span>{vacuuming ? 'Defragmenting Database...' : 'Run SQLite Vacuum'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CAMERAS & ZONES */}
          {activeTab === 'cameras' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: tokens.spacing.lg,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: tokens.fontSizes.lg,
                      fontWeight: tokens.fontWeights.semibold,
                      color: tokens.colors.text.primary,
                    }}
                  >
                    Camera Streams & Zones
                  </div>
                  <div style={{ fontSize: '13px', color: tokens.colors.text.muted }}>
                    Manage connected RTSP, WebRTC, and webcam camera sources.
                  </div>
                </div>
                <button
                  onClick={openAddCameraModal}
                  style={{
                    background: tokens.colors.accent.primary,
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: tokens.radii.sm,
                    fontSize: '13px',
                    fontWeight: tokens.fontWeights.medium,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: tokens.spacing.xs,
                  }}
                >
                  <Plus size={16} />
                  <span>Add Camera</span>
                </button>
              </div>

              {/* Cameras List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.md }}>
                {config?.cameras.map((cam) => (
                  <div
                    key={cam.id}
                    style={{
                      background: tokens.colors.surface.default,
                      border: `1px solid ${tokens.colors.border.subtle}`,
                      borderRadius: tokens.radii.md,
                      padding: tokens.spacing.lg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: tokens.spacing.sm,
                          marginBottom: '4px',
                        }}
                      >
                        <Video size={16} color={tokens.colors.text.secondary} />
                        <span
                          style={{
                            fontWeight: tokens.fontWeights.semibold,
                            color: tokens.colors.text.primary,
                            fontSize: '14px',
                          }}
                        >
                          {cam.name}
                        </span>
                        <span
                          style={{
                            background: tokens.colors.bg.canvas,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: tokens.colors.text.muted,
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {cam.id}
                        </span>
                        <span
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: tokens.colors.accent.primary,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}
                        >
                          {cam.type}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: tokens.colors.text.muted,
                          display: 'flex',
                          gap: tokens.spacing.md,
                        }}
                      >
                        <span>
                          Resolution: {cam.detect?.width ?? 640}x{cam.detect?.height ?? 360} @{' '}
                          {cam.detect?.fps ?? 5} FPS
                        </span>
                        <span>
                          Zones: {cam.zones?.length ? `${cam.zones.length} active` : 'None'}
                        </span>
                        <span>
                          Recording: {cam.record?.enabled ? `${cam.record.retain_days}d` : 'Off'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.sm }}>
                      <button
                        onClick={() => openEditCameraModal(cam)}
                        style={{
                          background: tokens.colors.surface.subtle,
                          border: `1px solid ${tokens.colors.border.subtle}`,
                          color: tokens.colors.text.primary,
                          padding: '6px 12px',
                          borderRadius: tokens.radii.sm,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingCameraId(cam.id)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${tokens.colors.status.danger}`,
                          color: tokens.colors.status.danger,
                          padding: '6px 10px',
                          borderRadius: tokens.radii.sm,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Delete camera"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AI & DETECTION */}
          {activeTab === 'ai' && (
            <div>
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.fontSizes.base,
                    fontWeight: tokens.fontWeights.semibold,
                    color: tokens.colors.text.primary,
                    marginBottom: tokens.spacing.xs,
                    display: 'flex',
                    alignItems: 'center',
                    gap: tokens.spacing.sm,
                  }}
                >
                  <Sliders size={18} />
                  <span>AI Detection & Recognition Parameters</span>
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: tokens.colors.text.muted,
                    marginBottom: tokens.spacing.xl,
                  }}
                >
                  Tune computer vision thresholds for face verification, loitering state machine,
                  and automatic background learning.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.xl }}>
                  {/* Face Similarity */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: tokens.fontWeights.medium,
                          color: tokens.colors.text.primary,
                        }}
                      >
                        Face Recognition Match Threshold
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: tokens.colors.accent.primary,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {similarityThreshold.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={0.8}
                      step={0.02}
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                      style={{ width: '100%', accentColor: tokens.colors.accent.primary }}
                    />
                    <div
                      style={{
                        fontSize: '11px',
                        color: tokens.colors.text.muted,
                        marginTop: '4px',
                      }}
                    >
                      Cosine similarity threshold for ArcFace embeddings. Default 0.40 provides high
                      accuracy with low false rejection.
                    </div>
                  </div>

                  {/* Loitering Timeout */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: tokens.fontWeights.medium,
                          color: tokens.colors.text.primary,
                        }}
                      >
                        Loitering Dwell Timeout
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: tokens.colors.accent.primary,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {loiteringSeconds}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={120}
                      step={5}
                      value={loiteringSeconds}
                      onChange={(e) => setLoiteringSeconds(Number(e.target.value))}
                      style={{ width: '100%', accentColor: tokens.colors.accent.primary }}
                    />
                    <div
                      style={{
                        fontSize: '11px',
                        color: tokens.colors.text.muted,
                        marginTop: '4px',
                      }}
                    >
                      Duration a tracked person must linger in a defined activity zone before
                      triggering a loitering security alert.
                    </div>
                  </div>

                  {/* Passive Auto-Enrichment */}
                  <div
                    style={{
                      background: tokens.colors.surface.subtle,
                      padding: tokens.spacing.md,
                      borderRadius: tokens.radii.md,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: tokens.fontWeights.medium,
                          color: tokens.colors.text.primary,
                          display: 'flex',
                          alignItems: 'center',
                          gap: tokens.spacing.xs,
                        }}
                      >
                        <CheckCircle2 size={15} color={tokens.colors.status.online} />
                        <span>Passive Auto-Enrichment Loop</span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: tokens.colors.text.muted,
                          marginTop: '2px',
                          maxWidth: '520px',
                        }}
                      >
                        Automatically save sharp frontal sightings of verified persons to expand
                        reference galleries and improve accuracy under varying lighting.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoEnrichment}
                      onChange={(e) => setAutoEnrichment(e.target.checked)}
                      style={{
                        accentColor: tokens.colors.accent.primary,
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                      }}
                    />
                  </div>

                  <div>
                    <button
                      onClick={handleSaveAi}
                      disabled={savingAi}
                      style={{
                        background: tokens.colors.accent.primary,
                        color: '#fff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: tokens.radii.sm,
                        fontSize: '13px',
                        fontWeight: tokens.fontWeights.medium,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing.xs,
                      }}
                    >
                      <Save size={15} />
                      <span>{savingAi ? 'Saving...' : 'Save AI Parameters'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ALERTS & NOTIFICATIONS */}
          {activeTab === 'alerts' && (
            <div>
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                  marginBottom: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.fontSizes.base,
                    fontWeight: tokens.fontWeights.semibold,
                    color: tokens.colors.text.primary,
                    marginBottom: tokens.spacing.xs,
                    display: 'flex',
                    alignItems: 'center',
                    gap: tokens.spacing.sm,
                  }}
                >
                  <Bell size={18} />
                  <span>Notification Delivery Provider</span>
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: tokens.colors.text.muted,
                    marginBottom: tokens.spacing.lg,
                  }}
                >
                  Select the active dispatch target for unknown face, intrusion, and loitering
                  security alerts.
                </p>

                {/* Provider Radio Segment */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: tokens.spacing.sm,
                    marginBottom: tokens.spacing.xl,
                  }}
                >
                  {(['console', 'telegram', 'ntfy'] as const).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setActiveAlert(prov)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: tokens.radii.md,
                        background:
                          activeAlert === prov
                            ? tokens.colors.surface.raised
                            : tokens.colors.surface.subtle,
                        border:
                          activeAlert === prov
                            ? `1px solid ${tokens.colors.accent.primary}`
                            : `1px solid ${tokens.colors.border.subtle}`,
                        color:
                          activeAlert === prov
                            ? tokens.colors.text.primary
                            : tokens.colors.text.secondary,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: tokens.fontWeights.semibold,
                          fontSize: '13px',
                          textTransform: 'capitalize',
                          marginBottom: '2px',
                        }}
                      >
                        {prov}
                      </div>
                      <div style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                        {prov === 'console' && 'Terminal stdout'}
                        {prov === 'telegram' && 'Bot API with photo'}
                        {prov === 'ntfy' && 'ntfy.sh push notifications'}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Dynamic Provider Config */}
                {activeAlert === 'telegram' && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: tokens.spacing.md,
                      marginBottom: tokens.spacing.xl,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: tokens.colors.text.secondary,
                          marginBottom: '4px',
                        }}
                      >
                        Telegram Bot Token
                      </label>
                      <input
                        type="password"
                        placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                        value={telegramBotToken}
                        onChange={(e) => setTelegramBotToken(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: tokens.radii.sm,
                          border: `1px solid ${tokens.colors.border.strong}`,
                          background: tokens.colors.surface.subtle,
                          color: tokens.colors.text.primary,
                          fontSize: '13px',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: tokens.colors.text.secondary,
                          marginBottom: '4px',
                        }}
                      >
                        Telegram Chat ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. -100123456789 or 987654321"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: tokens.radii.sm,
                          border: `1px solid ${tokens.colors.border.strong}`,
                          background: tokens.colors.surface.subtle,
                          color: tokens.colors.text.primary,
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>
                )}

                {activeAlert === 'ntfy' && (
                  <div style={{ marginBottom: tokens.spacing.xl }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '4px',
                      }}
                    >
                      ntfy.sh Topic Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. aegis-vision-home-alerts"
                      value={ntfyTopic}
                      onChange={(e) => setNtfyTopic(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: tokens.radii.sm,
                        border: `1px solid ${tokens.colors.border.strong}`,
                        background: tokens.colors.surface.subtle,
                        color: tokens.colors.text.primary,
                        fontSize: '13px',
                        marginBottom: '6px',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                      Subscribe on your mobile phone or web browser at{' '}
                      <span style={{ color: tokens.colors.accent.primary }}>
                        https://ntfy.sh/{ntfyTopic || '<topic>'}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <button
                    onClick={handleSaveAlerts}
                    disabled={savingAlerts}
                    style={{
                      background: tokens.colors.accent.primary,
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: tokens.radii.sm,
                      fontSize: '13px',
                      fontWeight: tokens.fontWeights.medium,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: tokens.spacing.xs,
                    }}
                  >
                    <Save size={15} />
                    <span>{savingAlerts ? 'Saving...' : 'Save Alert Configuration'}</span>
                  </button>
                </div>
              </div>

              {/* Test Alert Dispatch Card */}
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.fontSizes.base,
                    fontWeight: tokens.fontWeights.semibold,
                    color: tokens.colors.text.primary,
                    marginBottom: tokens.spacing.xs,
                  }}
                >
                  Send Verification Test Alert
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: tokens.colors.text.muted,
                    marginBottom: tokens.spacing.md,
                  }}
                >
                  Dispatch an immediate test notification to verify delivery to your phone or
                  terminal.
                </p>
                <div style={{ display: 'flex', gap: tokens.spacing.sm }}>
                  <input
                    type="text"
                    value={testAlertMessage}
                    onChange={(e) => setTestAlertMessage(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: tokens.radii.sm,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      background: tokens.colors.surface.subtle,
                      color: tokens.colors.text.primary,
                      fontSize: '13px',
                    }}
                  />
                  <button
                    onClick={handleTestAlert}
                    disabled={sendingTestAlert}
                    style={{
                      background: tokens.colors.surface.raised,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      color: tokens.colors.text.primary,
                      padding: '8px 16px',
                      borderRadius: tokens.radii.sm,
                      fontSize: '13px',
                      fontWeight: tokens.fontWeights.medium,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: tokens.spacing.xs,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Send size={14} />
                    <span>{sendingTestAlert ? 'Sending...' : 'Send Test Alert'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY & AUTH */}
          {activeTab === 'security' && (
            <div>
              <div
                style={{
                  background: tokens.colors.surface.default,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.xl,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.fontSizes.base,
                    fontWeight: tokens.fontWeights.semibold,
                    color: tokens.colors.text.primary,
                    marginBottom: tokens.spacing.xs,
                    display: 'flex',
                    alignItems: 'center',
                    gap: tokens.spacing.sm,
                  }}
                >
                  <Lock size={18} />
                  <span>Update Admin Password</span>
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    color: tokens.colors.text.muted,
                    marginBottom: tokens.spacing.lg,
                  }}
                >
                  Modify the primary credentials used to log into Aegis Vision AI.
                </p>

                <form
                  onSubmit={handleChangePassword}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: tokens.spacing.md,
                    maxWidth: '440px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '4px',
                      }}
                    >
                      Current Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 36px 8px 12px',
                          borderRadius: tokens.radii.sm,
                          border: `1px solid ${tokens.colors.border.strong}`,
                          background: tokens.colors.surface.subtle,
                          color: tokens.colors.text.primary,
                          fontSize: '13px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: tokens.colors.text.muted,
                          cursor: 'pointer',
                        }}
                      >
                        {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '4px',
                      }}
                    >
                      New Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 36px 8px 12px',
                          borderRadius: tokens.radii.sm,
                          border: `1px solid ${tokens.colors.border.strong}`,
                          background: tokens.colors.surface.subtle,
                          color: tokens.colors.text.primary,
                          fontSize: '13px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: tokens.colors.text.muted,
                          cursor: 'pointer',
                        }}
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '4px',
                      }}
                    >
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: tokens.radii.sm,
                        border: `1px solid ${tokens.colors.border.strong}`,
                        background: tokens.colors.surface.subtle,
                        color: tokens.colors.text.primary,
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  {/* Password Requirements Checklist */}
                  <div
                    style={{
                      background: tokens.colors.surface.subtle,
                      padding: tokens.spacing.sm,
                      borderRadius: tokens.radii.sm,
                      fontSize: '11px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: ruleLen ? tokens.colors.status.online : tokens.colors.text.muted,
                      }}
                    >
                      {ruleLen ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
                      <span>At least 8 characters</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: ruleUpper ? tokens.colors.status.online : tokens.colors.text.muted,
                      }}
                    >
                      {ruleUpper ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
                      <span>Uppercase letter</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: ruleLower ? tokens.colors.status.online : tokens.colors.text.muted,
                      }}
                    >
                      {ruleLower ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
                      <span>Lowercase letter</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: ruleDigit ? tokens.colors.status.online : tokens.colors.text.muted,
                      }}
                    >
                      {ruleDigit ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
                      <span>At least one digit</span>
                    </div>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={updatingPassword}
                      style={{
                        background: tokens.colors.accent.primary,
                        color: '#fff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: tokens.radii.sm,
                        fontSize: '13px',
                        fontWeight: tokens.fontWeights.medium,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing.xs,
                      }}
                    >
                      <Save size={15} />
                      <span>{updatingPassword ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ADD / EDIT CAMERA MODAL */}
      {cameraModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: tokens.spacing.md,
          }}
        >
          <div
            style={{
              background: tokens.colors.surface.default,
              border: `1px solid ${tokens.colors.border.subtle}`,
              borderRadius: tokens.radii.lg,
              width: '100%',
              maxWidth: '580px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: tokens.spacing.xl,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: tokens.spacing.md,
              }}
            >
              <div
                style={{
                  fontSize: tokens.fontSizes.md,
                  fontWeight: tokens.fontWeights.semibold,
                  color: tokens.colors.text.primary,
                }}
              >
                {editingCameraId ? 'Edit Camera' : 'Add New Camera'}
              </div>
              <button
                onClick={() => setCameraModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: tokens.colors.text.muted,
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveCamera}
              style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.md }}
            >
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacing.md }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: tokens.colors.text.secondary,
                      marginBottom: '4px',
                    }}
                  >
                    Camera ID (unique slug)
                  </label>
                  <input
                    type="text"
                    disabled={!!editingCameraId}
                    placeholder="e.g. front_door"
                    value={cameraForm.id}
                    onChange={(e) =>
                      setCameraForm((p) => ({
                        ...p,
                        id: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                      }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: tokens.radii.sm,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      background: editingCameraId
                        ? tokens.colors.bg.canvas
                        : tokens.colors.surface.subtle,
                      color: tokens.colors.text.primary,
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: tokens.colors.text.secondary,
                      marginBottom: '4px',
                    }}
                  >
                    Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Front Door"
                    value={cameraForm.name}
                    onChange={(e) => setCameraForm((p) => ({ ...p, name: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: tokens.radii.sm,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      background: tokens.colors.surface.subtle,
                      color: tokens.colors.text.primary,
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacing.md }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: tokens.colors.text.secondary,
                      marginBottom: '4px',
                    }}
                  >
                    Camera Type
                  </label>
                  <select
                    value={cameraForm.type}
                    onChange={(e) => setCameraForm((p) => ({ ...p, type: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: tokens.radii.sm,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      background: tokens.colors.surface.subtle,
                      color: tokens.colors.text.primary,
                      fontSize: '13px',
                    }}
                  >
                    <option value="rtsp">RTSP Stream (Generic)</option>
                    <option value="tapo">Tapo Camera</option>
                    <option value="macbook">Macbook Webcam</option>
                    <option value="file">Video File (Dev/Test)</option>
                  </select>
                </div>
                {cameraForm.type === 'macbook' ? (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '4px',
                      }}
                    >
                      Device Index
                    </label>
                    <input
                      type="number"
                      value={cameraForm.camera_index ?? 0}
                      onChange={(e) =>
                        setCameraForm((p) => ({ ...p, camera_index: Number(e.target.value) }))
                      }
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: tokens.radii.sm,
                        border: `1px solid ${tokens.colors.border.strong}`,
                        background: tokens.colors.surface.subtle,
                        color: tokens.colors.text.primary,
                        fontSize: '13px',
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: tokens.colors.text.secondary,
                        marginBottom: '4px',
                      }}
                    >
                      Stream URL
                    </label>
                    <input
                      type="text"
                      placeholder="rtsp://user:pass@ip:554/stream1"
                      value={cameraForm.rtsp_url ?? ''}
                      onChange={(e) => setCameraForm((p) => ({ ...p, rtsp_url: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: tokens.radii.sm,
                        border: `1px solid ${tokens.colors.border.strong}`,
                        background: tokens.colors.surface.subtle,
                        color: tokens.colors.text.primary,
                        fontSize: '13px',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Stream Connection Tester */}
              <div
                style={{
                  background: tokens.colors.surface.subtle,
                  padding: tokens.spacing.md,
                  borderRadius: tokens.radii.md,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '13px', color: tokens.colors.text.secondary }}>
                    Test stream handshake & frame grab
                  </span>
                  <button
                    type="button"
                    onClick={handleTestCameraConnection}
                    disabled={testingCamera}
                    style={{
                      background: tokens.colors.surface.raised,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      color: tokens.colors.text.primary,
                      padding: '5px 12px',
                      borderRadius: tokens.radii.sm,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: tokens.spacing.xs,
                    }}
                  >
                    <Radio size={13} />
                    <span>{testingCamera ? 'Testing Stream...' : 'Test Connection'}</span>
                  </button>
                </div>

                {cameraTestResult && (
                  <div
                    style={{
                      marginTop: tokens.spacing.sm,
                      fontSize: '12px',
                      padding: '6px 10px',
                      borderRadius: tokens.radii.sm,
                      background: cameraTestResult.success
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                      color: cameraTestResult.success
                        ? tokens.colors.status.online
                        : tokens.colors.status.danger,
                      display: 'flex',
                      alignItems: 'center',
                      gap: tokens.spacing.xs,
                    }}
                  >
                    {cameraTestResult.success ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                    <span>{cameraTestResult.text}</span>
                  </div>
                )}
              </div>

              {/* Zones Section */}
              <div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: tokens.fontWeights.medium,
                    color: tokens.colors.text.primary,
                    marginBottom: '6px',
                  }}
                >
                  Activity Zones
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    marginBottom: tokens.spacing.sm,
                  }}
                >
                  {cameraForm.zones?.map((zone, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: tokens.colors.bg.canvas,
                        padding: '6px 10px',
                        borderRadius: tokens.radii.sm,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: tokens.colors.text.primary }}>
                        {zone.name}
                      </span>
                      <span style={{ color: tokens.colors.text.muted, fontSize: '11px' }}>
                        {zone.coordinates.length} points
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveZone(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: tokens.colors.status.danger,
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: tokens.spacing.xs }}>
                  <input
                    type="text"
                    placeholder="Zone Name (e.g. porch)"
                    value={zoneInputName}
                    onChange={(e) => setZoneInputName(e.target.value)}
                    style={{
                      width: '140px',
                      padding: '6px 8px',
                      borderRadius: tokens.radii.sm,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      background: tokens.colors.surface.subtle,
                      color: tokens.colors.text.primary,
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="[[0, 0], [300, 0], [300, 360], [0, 360]]"
                    value={zoneInputCoords}
                    onChange={(e) => setZoneInputCoords(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      borderRadius: tokens.radii.sm,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      background: tokens.colors.surface.subtle,
                      color: tokens.colors.text.primary,
                      fontSize: '12px',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddZone}
                    style={{
                      background: tokens.colors.surface.raised,
                      border: `1px solid ${tokens.colors.border.strong}`,
                      color: tokens.colors.text.primary,
                      padding: '6px 10px',
                      borderRadius: tokens.radii.sm,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Add Zone
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: tokens.spacing.sm,
                  marginTop: tokens.spacing.md,
                }}
              >
                <button
                  type="button"
                  onClick={() => setCameraModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${tokens.colors.border.subtle}`,
                    color: tokens.colors.text.secondary,
                    padding: '8px 14px',
                    borderRadius: tokens.radii.sm,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: tokens.colors.accent.primary,
                    border: 'none',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: tokens.radii.sm,
                    fontSize: '13px',
                    fontWeight: tokens.fontWeights.medium,
                    cursor: 'pointer',
                  }}
                >
                  Save Camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingCameraId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: tokens.spacing.md,
          }}
        >
          <div
            style={{
              background: tokens.colors.surface.default,
              border: `1px solid ${tokens.colors.border.subtle}`,
              borderRadius: tokens.radii.lg,
              width: '100%',
              maxWidth: '400px',
              padding: tokens.spacing.xl,
            }}
          >
            <div
              style={{
                fontSize: tokens.fontSizes.base,
                fontWeight: tokens.fontWeights.semibold,
                color: tokens.colors.text.primary,
                marginBottom: tokens.spacing.xs,
              }}
            >
              Delete Camera Configuration?
            </div>
            <p
              style={{
                fontSize: '13px',
                color: tokens.colors.text.muted,
                marginBottom: tokens.spacing.lg,
              }}
            >
              Are you sure you want to remove camera '{deletingCameraId}'? This will stop active
              inference and remove it from the grid. Recorded files on disk will not be deleted.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.spacing.sm }}>
              <button
                type="button"
                onClick={() => setDeletingCameraId(null)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  color: tokens.colors.text.secondary,
                  padding: '7px 12px',
                  borderRadius: tokens.radii.sm,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCamera(deletingCameraId)}
                style={{
                  background: tokens.colors.status.danger,
                  border: 'none',
                  color: '#fff',
                  padding: '7px 14px',
                  borderRadius: tokens.radii.sm,
                  fontSize: '12px',
                  fontWeight: tokens.fontWeights.medium,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
