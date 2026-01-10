'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiJson } from '@/lib/client/api';

export default function ResetPage() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'error' | 'success'>('error');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(searchParams.get('token') ?? '');
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice('');
    setNoticeTone('error');
    if (!token.trim()) {
      setNotice('Paste the reset token from your email.');
      return;
    }
    if (password.length < 8) {
      setNotice('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setNotice('Passwords do not match.');
      return;
    }
    try {
      await apiJson('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim(), password })
      });
      setDone(true);
      setNoticeTone('success');
      setNotice('Password updated. You can sign in now.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Reset failed');
    }
  };

  return (
    <main className="auth-container">
      <div className="auth-wrapper">
        <div className="auth-branding">
          <span className="badge glow">BYOK Workspace</span>
          <h1>KeyLM</h1>
          <p className="auth-tagline">Set a new password to unlock your workspace again.</p>
        </div>
        {done ? (
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Password updated</h2>
              <p>Use your new password to sign in.</p>
            </div>
            {notice && (
              <p className={`auth-notice ${noticeTone === 'success' ? 'success' : ''}`}>{notice}</p>
            )}
            <Link className="auth-button primary" href="/app">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="auth-card" onSubmit={handleSubmit}>
            <div className="auth-card-header">
              <h2>Create a new password</h2>
              <p>Enter the reset token and pick a new password.</p>
            </div>
            <div className="auth-form-group">
              <label htmlFor="reset-token">Reset token</label>
              <input
                className="auth-input"
                id="reset-token"
                type="text"
                placeholder="Paste reset token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="new-password">New password</label>
              <input
                className="auth-input"
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="auth-form-group">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                className="auth-input"
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>
            <button className="auth-button primary" type="submit">
              Update password
            </button>
            <Link className="auth-button secondary" href="/app">
              Back to sign in
            </Link>
            {notice && (
              <p className={`auth-notice ${noticeTone === 'success' ? 'success' : ''}`}>{notice}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
