import { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';

/**
 * Who is signed in, and the two things to do about it.
 *
 * Changing a password and signing out used to live in the sidebar's footer, so
 * they sat behind the drawer on a phone. Here they are one tap away on every
 * screen. Only the name is hidden on a phone: leaving it in the row squeezed the
 * menu button beside it to zero width.
 */
export default function UserMenu({ user, onChangePassword, onLogout }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onClick = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '?';

  return (
    <div className="user-menu" ref={root}>
      <button
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
      >
        {user?.avatar?.url ? (
          <img src={user.avatar.url} alt="" className="user-menu__avatar" />
        ) : (
          <span className="user-menu__avatar">{initials}</span>
        )}
        <span className="user-menu__who hidden-mobile">
          <span className="user-menu__name">
            {user?.firstName} {user?.lastName}
          </span>
          <span className="user-menu__role">{user?.role}</span>
        </span>
        <ChevronDown size={16} className="hidden-mobile" />
      </button>

      {open && (
        <div className="user-menu__panel" role="menu">
          <div className="user-menu__panel-head">
            <strong>
              {user?.firstName} {user?.lastName}
            </strong>
            <span>{user?.role}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="user-menu__item"
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
          >
            <KeyRound size={16} /> Change password
          </button>
          <button
            type="button"
            role="menuitem"
            className="user-menu__item"
            onClick={onLogout}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
