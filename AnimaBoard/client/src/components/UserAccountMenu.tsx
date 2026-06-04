import React, { useCallback, useEffect, useRef, useState } from 'react';
import './UserAccountMenu.css';

type UserAccountMenuProps = {
  displayName: string;
  email?: string;
  roleLabel?: string;
  onLogout: () => void;
  /** When true, only the avatar toggle is shown (collapsed sidebar). */
  compact?: boolean;
};

function getInitials(displayName: string, email?: string): string {
  const fromName = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
  if (fromName.length >= 2) return fromName.toUpperCase();
  if (email && email.includes('@')) return email[0].toUpperCase();
  return displayName.slice(0, 2).toUpperCase() || '?';
}

const UserAccountMenu: React.FC<UserAccountMenuProps> = ({
  displayName,
  email,
  roleLabel,
  onLogout,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = getInitials(displayName, email);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div
      ref={rootRef}
      className={`user-account-menu ${open ? 'is-open' : ''} ${compact ? 'is-compact' : ''}`}
    >
      <button
        type="button"
        className="user-account-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={displayName}
      >
        <span className="user-account-avatar" aria-hidden>
          {initials}
        </span>
        {!compact && (
          <>
            <span className="user-account-trigger-label">{displayName}</span>
            <svg className="user-account-chevron" viewBox="0 0 24 24" aria-hidden>
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" />
            </svg>
          </>
        )}
      </button>
      {open && (
        <div className="user-account-dropdown" role="menu">
          <div className="user-account-dropdown-header">
            <span className="user-account-dropdown-avatar" aria-hidden>
              {initials}
            </span>
            <div className="user-account-dropdown-meta">
              <span className="user-account-dropdown-name">{displayName}</span>
              {roleLabel && <span className="user-account-dropdown-role">{roleLabel}</span>}
              {email && <span className="user-account-dropdown-email">{email}</span>}
            </div>
          </div>
          <button
            type="button"
            className="user-account-logout"
            role="menuitem"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
};

export default UserAccountMenu;
