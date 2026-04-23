'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  buildMountainChartPaths,
  formatCompactTokenCount,
  formatTokenCount,
  formatTrackedCoverage,
  PROVIDER_LABELS,
  type UsageDashboardResponse,
  type UsageRangeKey,
  type UsageSeriesPoint
} from '@/lib/usageDashboard';
import {
  formatFileSize,
  getUserDisplayName,
  getUserInitials,
  PROFILE_IMAGE_ACCEPT,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_LABEL,
  type PublicUser
} from '@/lib/userProfile';

type ProfileResponse = {
  user: PublicUser;
};

type SettingsSection = 'profile' | 'usage';

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? payload.error?.message ?? 'Request failed'
        : 'Request failed';
    throw new Error(message);
  }

  return payload as T;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [fullName, setFullName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [usageDashboard, setUsageDashboard] = useState<UsageDashboardResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageLoadError, setUsageLoadError] = useState('');
  const [usageGrain, setUsageGrain] = useState<UsageRangeKey>('day');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('success');

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const response = await fetch('/api/settings/profile', { cache: 'no-store' });
        if (response.status === 401) {
          router.replace('/app?auth=login');
          return;
        }

        const payload = await readJsonResponse<ProfileResponse>(response);
        if (!mounted) {
          return;
        }

        setUser(payload.user);
        setFullName(payload.user.fullName ?? '');
      } catch (error) {
        if (!mounted) {
          return;
        }

        setNotice(error instanceof Error ? error.message : 'Failed to load your profile settings.');
        setNoticeTone('error');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    let mounted = true;

    const loadUsageDashboard = async () => {
      try {
        const response = await fetch('/api/usage/dashboard', { cache: 'no-store' });
        if (response.status === 401) {
          router.replace('/app?auth=login');
          return;
        }

        const payload = await readJsonResponse<UsageDashboardResponse>(response);
        if (!mounted) {
          return;
        }

        setUsageDashboard(payload);
        setUsageGrain(payload.defaultGrain);
        setUsageLoadError('');
      } catch (error) {
        if (!mounted) {
          return;
        }

        setUsageDashboard(null);
        setUsageLoadError(error instanceof Error ? error.message : 'Usage dashboard is unavailable right now.');
      } finally {
        if (mounted) {
          setUsageLoading(false);
        }
      }
    };

    void loadUsageDashboard();

    return () => {
      mounted = false;
    };
  }, [router]);

  const previewName = fullName.trim() || getUserDisplayName(user);
  const previewInitials = useMemo(() => getUserInitials({ email: user?.email ?? '', fullName }), [fullName, user?.email]);
  const previewImage = localPreviewUrl ?? user?.profileImageUrl ?? null;
  const selectedUsageRange = usageDashboard?.ranges[usageGrain] ?? null;
  const usageChartPoints = selectedUsageRange?.series ?? [];
  const usageChartMax = Math.max(1, ...usageChartPoints.map((point) => point.totalTokens));
  const usageHasTrackedReplies = (selectedUsageRange?.coverage.messagesWithUsage ?? 0) > 0;
  const usageHasRecentReplies =
    ((selectedUsageRange?.coverage.messagesWithUsage ?? 0) + (selectedUsageRange?.coverage.messagesWithoutUsage ?? 0)) > 0;
  const peakUsagePoint = useMemo<UsageSeriesPoint | null>(() => {
    if (usageChartPoints.length === 0) {
      return null;
    }

    return usageChartPoints.slice(1).reduce<UsageSeriesPoint>(
      (best, point) => (point.totalTokens > best.totalTokens ? point : best),
      usageChartPoints[0]
    );
  }, [usageChartPoints]);
  const { areaPath: usageMountainAreaPath, linePath: usageMountainLinePath } = useMemo(
    () => buildMountainChartPaths(usageChartPoints, 100, 56),
    [usageChartPoints]
  );
  const usageMountainFillId = `usage-mountain-fill-${usageGrain}`;
  const usageMountainLineId = `usage-mountain-line-${usageGrain}`;
  const firstUsageLabel = usageChartPoints[0]?.label ?? 'Start';
  const lastUsageLabel = usageChartPoints[usageChartPoints.length - 1]?.label ?? 'Now';

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setNotice('');

    if (!nextFile) {
      setSelectedFile(null);
      return;
    }

    if (nextFile.size > PROFILE_IMAGE_MAX_BYTES) {
      setNotice(`Profile image must be ${PROFILE_IMAGE_MAX_LABEL} or smaller.`);
      setNoticeTone('error');
      event.target.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(nextFile);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');

    try {
      const formData = new FormData();
      formData.append('fullName', fullName.trim());
      if (selectedFile) {
        formData.append('profileImage', selectedFile);
      }

      const response = await fetch('/api/settings/profile', {
        method: 'POST',
        body: formData
      });

      if (response.status === 401) {
        router.replace('/app?auth=login');
        return;
      }

      const payload = await readJsonResponse<ProfileResponse>(response);
      setUser(payload.user);
      setFullName(payload.user.fullName ?? '');
      setSelectedFile(null);
      setNotice('Profile updated successfully.');
      setNoticeTone('success');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to save your profile settings.');
      setNoticeTone('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="app-container">Loading settings...</main>;
  }

  return (
    <main className="settings-screen">
      <div className="settings-shell-layout">
        <aside className="card settings-shell-sidebar">
          <div className="settings-shell-sidebar-top">
            <span className="badge glow">Settings</span>
            <h1>Workspace settings</h1>
            <p>Claude-style settings panel with separate sections for your profile and usage analytics.</p>
          </div>

          <nav className="settings-shell-nav" aria-label="Settings navigation">
            <button
              className={`settings-shell-nav-item ${activeSection === 'profile' ? 'active' : ''}`}
              type="button"
              aria-current={activeSection === 'profile' ? 'page' : undefined}
              onClick={() => setActiveSection('profile')}
            >
              Profile
            </button>
            <button
              className={`settings-shell-nav-item ${activeSection === 'usage' ? 'active' : ''}`}
              type="button"
              aria-current={activeSection === 'usage' ? 'page' : undefined}
              onClick={() => setActiveSection('usage')}
            >
              Usage Analytics
            </button>
          </nav>

          <Link className="button secondary settings-shell-back" href="/app">
            Back to chat
          </Link>
        </aside>

        <section className="card settings-shell-content">
          {activeSection === 'profile' ? (
            <>
              <div className="settings-shell-header">
                <div>
                  <span className="tag">Profile</span>
                  <h2>Manage your profile</h2>
                  <p>
                    Upload a profile picture up to {PROFILE_IMAGE_MAX_LABEL} and set the full name shown in your `/app`
                    welcome message.
                  </p>
                </div>
              </div>

              {notice && <p className={`settings-notice ${noticeTone === 'success' ? 'success' : 'error'}`}>{notice}</p>}

              <div className="profile-settings-layout">
                <div className="profile-preview-panel">
                  <div className="profile-avatar-large" aria-hidden="true">
                    {previewImage ? <img src={previewImage} alt="Profile preview" /> : <span>{previewInitials}</span>}
                  </div>
                  <div className="profile-preview-copy">
                    <strong>{previewName}</strong>
                    <span>{user?.email}</span>
                    <p>This is how your profile will appear inside your KeyLM workspace.</p>
                  </div>
                </div>

                <form className="profile-settings-form" onSubmit={handleSubmit}>
                  <label className="profile-field" htmlFor="full-name">
                    <span>Full name</span>
                    <input
                      className="input"
                      id="full-name"
                      type="text"
                      maxLength={120}
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </label>

                  <label className="profile-field" htmlFor="email-address">
                    <span>Email</span>
                    <input className="input" id="email-address" type="email" value={user?.email ?? ''} readOnly disabled />
                  </label>

                  <label className="profile-field" htmlFor="profile-image">
                    <span>Profile picture</span>
                    <input
                      className="input profile-file-input"
                      id="profile-image"
                      type="file"
                      accept={PROFILE_IMAGE_ACCEPT}
                      onChange={handleFileChange}
                    />
                    <small>
                      Upload JPG, PNG, or WEBP. Max {PROFILE_IMAGE_MAX_LABEL}.
                      {selectedFile ? ` Selected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})` : ''}
                    </small>
                  </label>

                  <div className="profile-actions-row">
                    <button className="button" type="submit" disabled={saving}>
                      {saving ? 'Saving...' : 'Save profile'}
                    </button>
                    <Link className="button secondary" href="/app">
                      Cancel
                    </Link>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <section className="settings-token-usage-card">
              <div className="settings-shell-header settings-shell-header-inline">
                <div>
                  <span className="tag">Usage Analytics</span>
                  <h2>Token usage overview</h2>
                  <p>Review your token volume with day, week, and month views in a dedicated analytics section.</p>
                </div>
                <div className="usage-grain-toggle" role="tablist" aria-label="Token usage time range">
                  {([
                    ['day', 'Day'],
                    ['week', 'Week'],
                    ['month', 'Month']
                  ] as const).map(([grain, label]) => (
                    <button
                      key={grain}
                      className={`usage-grain-button ${usageGrain === grain ? 'active' : ''}`}
                      type="button"
                      onClick={() => setUsageGrain(grain)}
                      aria-pressed={usageGrain === grain}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {usageLoading ? (
                <p className="usage-empty-state">Loading your token dashboard...</p>
              ) : usageLoadError ? (
                <p className="usage-empty-state">{usageLoadError}</p>
              ) : selectedUsageRange ? (
                <>
                  <div className="usage-summary-grid settings-usage-summary-grid">
                    <div className="usage-summary-stat">
                      <span>{selectedUsageRange.windowLabel}</span>
                      <strong>{formatCompactTokenCount(selectedUsageRange.totals.totalTokens)}</strong>
                      <small>
                        {formatTokenCount(selectedUsageRange.totals.promptTokens)} in ·{' '}
                        {formatTokenCount(selectedUsageRange.totals.completionTokens)} out
                      </small>
                    </div>
                    <div className="usage-summary-stat">
                      <span>Tracked replies</span>
                      <strong>{formatTokenCount(selectedUsageRange.totals.requestCount)}</strong>
                      <small>{formatTrackedCoverage(selectedUsageRange.coverage)}</small>
                    </div>
                    <div className="usage-summary-stat">
                      <span>Data density</span>
                      <strong>{Math.round(selectedUsageRange.density.densityPercentage)}%</strong>
                      <small>
                        {selectedUsageRange.density.activeBuckets} active periods of {selectedUsageRange.density.totalBuckets}
                      </small>
                    </div>
                    <div className="usage-summary-stat">
                      <span>Peak volume</span>
                      <strong>{formatCompactTokenCount(selectedUsageRange.density.peakTokens)}</strong>
                      <small>
                        Highest token burst in a single {usageGrain === 'day' ? 'day' : usageGrain === 'week' ? 'week' : 'month'}
                      </small>
                    </div>
                  </div>

                  <p className="usage-coverage-note">{formatTrackedCoverage(selectedUsageRange.coverage)}</p>

                  {usageHasTrackedReplies ? (
                    <>
                      <div className="settings-usage-visual-grid">
                        <div className="usage-chart-panel usage-section-card">
                          <div className="usage-chart-header">
                            <strong>Token bar chart</strong>
                            <span>{selectedUsageRange.windowLabel}</span>
                          </div>
                          <div className="usage-chart" role="img" aria-label="Token usage bar chart">
                            {usageChartPoints.map((point, index) => {
                              const height = point.totalTokens > 0 ? Math.max(8, (point.totalTokens / usageChartMax) * 100) : 4;
                              const showLabel = usageGrain !== 'day' || index % 2 === 0 || index === usageChartPoints.length - 1;

                              return (
                                <div
                                  key={`${point.bucketStart}-${usageGrain}`}
                                  className="usage-chart-point"
                                  title={`${point.label}: ${formatTokenCount(point.totalTokens)} total tokens`}
                                >
                                  <div className="usage-chart-track">
                                    <div className="usage-chart-bar" style={{ height: `${height}%` }} />
                                  </div>
                                  <span className="usage-chart-label">{showLabel ? point.label : ''}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="usage-mountain-card usage-section-card">
                          <div className="usage-chart-header">
                            <strong>Volume mountain</strong>
                            <span>{selectedUsageRange.windowLabel}</span>
                          </div>
                          <div className="usage-mountain-surface">
                            {usageMountainLinePath ? (
                              <svg className="usage-mountain-svg" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true">
                                <defs>
                                  <linearGradient id={usageMountainFillId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgba(229, 111, 46, 0.6)" />
                                    <stop offset="100%" stopColor="rgba(47, 127, 119, 0.08)" />
                                  </linearGradient>
                                  <linearGradient id={usageMountainLineId} x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#e56f2e" />
                                    <stop offset="100%" stopColor="#2f7f77" />
                                  </linearGradient>
                                </defs>
                                <path d={usageMountainAreaPath} fill={`url(#${usageMountainFillId})`} />
                                <path
                                  d={usageMountainLinePath}
                                  fill="none"
                                  stroke={`url(#${usageMountainLineId})`}
                                  strokeWidth="1.8"
                                  strokeLinejoin="round"
                                  strokeLinecap="round"
                                />
                              </svg>
                            ) : (
                              <p className="usage-empty-inline">No mountain graph data yet.</p>
                            )}
                          </div>
                          <div className="usage-mountain-axis">
                            <span>{firstUsageLabel}</span>
                            <span>{peakUsagePoint?.label ?? 'Peak'}</span>
                            <span>{lastUsageLabel}</span>
                          </div>
                          <div className="usage-mountain-stats">
                            <div className="usage-density-stat">
                              <span>Avg active volume</span>
                              <strong>{formatCompactTokenCount(Math.round(selectedUsageRange.density.averageTokensPerActiveBucket))}</strong>
                              <small>Average tokens in active periods</small>
                            </div>
                            <div className="usage-density-stat">
                              <span>Peak replies</span>
                              <strong>{formatTokenCount(selectedUsageRange.density.peakRequestCount)}</strong>
                              <small>Most tracked replies in one period</small>
                            </div>
                            <div className="usage-density-stat">
                              <span>Density note</span>
                              <strong>{Math.round(selectedUsageRange.density.densityPercentage)}% active</strong>
                              <small>How packed your activity is across the selected range</small>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="settings-usage-detail-grid">
                        <div className="usage-provider-list usage-section-card">
                          <div className="usage-section-header">
                            <strong>Providers</strong>
                            <span>{selectedUsageRange.windowLabel}</span>
                          </div>
                          {selectedUsageRange.providers.map((provider) => (
                            <div key={provider.provider} className="usage-provider-row">
                              <div className="usage-provider-row-top">
                                <strong>{PROVIDER_LABELS[provider.provider]}</strong>
                                <span>{formatCompactTokenCount(provider.totalTokens)}</span>
                              </div>
                              <div className="usage-provider-row-meta">
                                {formatTokenCount(provider.promptTokens)} in · {formatTokenCount(provider.completionTokens)} out ·{' '}
                                {Math.round(provider.percentageOfTotal)}%
                              </div>
                              <div className="usage-provider-bar">
                                <span style={{ width: `${Math.max(provider.percentageOfTotal, provider.totalTokens > 0 ? 6 : 0)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="usage-model-list usage-section-card">
                          <div className="usage-section-header">
                            <strong>Top models</strong>
                            <span>{selectedUsageRange.windowLabel}</span>
                          </div>
                          {selectedUsageRange.models.length > 0 ? (
                            selectedUsageRange.models.map((model) => (
                              <div key={`${model.provider}:${model.model}`} className="usage-model-row">
                                <div>
                                  <strong>{model.model}</strong>
                                  <span>{PROVIDER_LABELS[model.provider]}</span>
                                </div>
                                <div className="usage-model-metrics">
                                  <strong>{formatCompactTokenCount(model.totalTokens)}</strong>
                                  <span>{formatTokenCount(model.requestCount)} replies</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="usage-empty-inline">No model-level token data yet.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : usageHasRecentReplies ? (
                    <p className="usage-empty-state">
                      Recent assistant replies exist, but token metadata was not returned for this {usageGrain} range.
                    </p>
                  ) : (
                    <p className="usage-empty-state">Start chatting to see your token usage charts here.</p>
                  )}
                </>
              ) : (
                <p className="usage-empty-state">Usage data is not available yet.</p>
              )}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}