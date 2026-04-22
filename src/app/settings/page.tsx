'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
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

  const previewName = fullName.trim() || getUserDisplayName(user);
  const previewInitials = useMemo(() => getUserInitials({ email: user?.email ?? '', fullName }), [fullName, user?.email]);
  const previewImage = localPreviewUrl ?? user?.profileImageUrl ?? null;

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
            <p>Claude-style settings panel with your account profile at the center.</p>
          </div>

          <nav className="settings-shell-nav" aria-label="Settings navigation">
            <button className="settings-shell-nav-item active" type="button" aria-current="page">
              Profile
            </button>
          </nav>

          <Link className="button secondary settings-shell-back" href="/app">
            Back to chat
          </Link>
        </aside>

        <section className="card settings-shell-content">
          <div className="settings-shell-header">
            <div>
              <span className="tag">Profile</span>
              <h2>Manage your profile</h2>
              <p>Update your full name and photo. Your name will appear in the `/app` welcome message.</p>
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
        </section>
      </div>
    </main>
  );
}