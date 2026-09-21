/**
 * Settings page — tabbed configuration for System, Cameras, AI, Alerts, and Security.
 */
import { useState } from 'react';
import { Bell, Camera, HardDrive, Lock, Sliders } from 'lucide-react';
import { tokens } from '@/theme/designTokens';

type Tab = 'system' | 'cameras' | 'ai' | 'alerts' | 'security';

const tabs = [
  { id: 'system' as Tab, label: 'System & Storage', icon: HardDrive },
  { id: 'cameras' as Tab, label: 'Cameras', icon: Camera },
  { id: 'ai' as Tab, label: 'AI & Detection', icon: Sliders },
  { id: 'alerts' as Tab, label: 'Alerts & Notifications', icon: Bell },
  { id: 'security' as Tab, label: 'Security', icon: Lock },
];

const containerStyles = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  '@media (max-width: 768px)': {
    flexDirection: 'column' as const,
  },
};

const sidebarStyles = {
  width: '220px',
  borderRight: `1px solid ${tokens.colors.border.subtle}`,
  padding: `${tokens.spacing.md} ${tokens.spacing.sm}`,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '4px',
  '@media (max-width: 768px)': {
    width: '100%',
    flexDirection: 'row' as const,
    overflowX: 'auto' as const,
    borderRight: 'none',
    borderBottom: `1px solid ${tokens.colors.border.subtle}`,
    padding: tokens.spacing.xs,
  },
};

const tabItemStyles = (active: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.sm,
  padding: '8px 12px',
  borderRadius: tokens.radii.sm,
  fontSize: '13px',
  fontWeight: tokens.fontWeights.medium,
  color: active ? tokens.colors.text.primary : tokens.colors.text.muted,
  background: active ? tokens.colors.surface.subtle : 'transparent',
  border: 'none',
  textAlign: 'left' as const,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  transition: `background ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
  '&:hover': {
    background: tokens.colors.surface.raised,
    color: tokens.colors.text.primary,
  },
});

const contentStyles = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: `${tokens.spacing.lg} ${tokens.spacing.xl}`,
};

const cardStyles = {
  background: tokens.colors.surface.default,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.lg,
  padding: tokens.spacing.lg,
  marginBottom: tokens.spacing.lg,
  maxWidth: '720px',
};

const cardTitleStyles = {
  fontSize: tokens.fontSizes.base,
  fontWeight: tokens.fontWeights.semibold,
  color: tokens.colors.text.primary,
  marginBottom: tokens.spacing.xs,
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.sm,
};

const cardDescStyles = {
  fontSize: '13px',
  color: tokens.colors.text.muted,
  marginBottom: tokens.spacing.md,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('system');

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Settings</span>
        <span className="page-header__spacer" />
      </header>

      <div css={containerStyles}>
        <aside css={sidebarStyles}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                css={tabItemStyles(activeTab === tab.id)}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        <main css={contentStyles}>
          {activeTab === 'system' && (
            <div css={cardStyles}>
              <div css={cardTitleStyles}>
                <HardDrive size={18} />
                Storage & Retention Policy
              </div>
              <p css={cardDescStyles}>
                Manage recording retention, disk space thresholds, and database maintenance.
              </p>
              <div style={{ color: tokens.colors.text.secondary, fontSize: '13px' }}>
                System diagnostic statistics and retention controls will be fully manageable here in
                Phase 5.
              </div>
            </div>
          )}

          {activeTab === 'cameras' && (
            <div css={cardStyles}>
              <div css={cardTitleStyles}>
                <Camera size={18} />
                Camera Configuration
              </div>
              <p css={cardDescStyles}>
                Add, edit, or test RTSP and webcam streams, and configure detection activity zones.
              </p>
              <div style={{ color: tokens.colors.text.secondary, fontSize: '13px' }}>
                Camera stream manager and interactive polygon zone editor will be available in Phase
                5.
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div css={cardStyles}>
              <div css={cardTitleStyles}>
                <Sliders size={18} />
                Vision & Detection Parameters
              </div>
              <p css={cardDescStyles}>
                Tune YOLO detection confidence, InsightFace ArcFace matching threshold, and
                loitering timers.
              </p>
              <div style={{ color: tokens.colors.text.secondary, fontSize: '13px' }}>
                Threshold tuning sliders will be available in Phase 5.
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div css={cardStyles}>
              <div css={cardTitleStyles}>
                <Bell size={18} />
                Notifications & Integrations
              </div>
              <p css={cardDescStyles}>
                Configure Telegram bot notifications, ntfy.sh topics, and cooldown settings.
              </p>
              <div style={{ color: tokens.colors.text.secondary, fontSize: '13px' }}>
                Alert settings and 'Send Test Alert' verification will be available in Phase 5.
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div css={cardStyles}>
              <div css={cardTitleStyles}>
                <Lock size={18} />
                Security & Authentication
              </div>
              <p css={cardDescStyles}>Update admin credentials and manage authentication tokens.</p>
              <div style={{ color: tokens.colors.text.secondary, fontSize: '13px' }}>
                Credential manager will be available in Phase 5.
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
