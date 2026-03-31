import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function getInitials(email?: string | null) {
  if (!email) return 'U';
  return email.charAt(0).toUpperCase();
}

function getShortEmail(email?: string | null) {
  if (!email) return '';
  if (email.length <= 24) return email;
  return `${email.slice(0, 21)}...`;
}

export default function AccountAccessButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setChecking(false);
      return;
    }

    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (location.pathname === '/login') {
    return null;
  }

  const handleMainClick = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setOpen((prev) => !prev);
  };

  const handleGoToLogin = () => {
    setOpen(false);
    navigate('/login');
  };

  const handleSignOut = async () => {
    if (!supabase) return;

    await supabase.auth.signOut();
    setOpen(false);
    navigate('/login');
  };

  return (
    <div className="account-access-root" ref={rootRef}>
      <button
        type="button"
        className={`account-access-trigger ${user ? 'is-authenticated' : 'is-guest'}`}
        onClick={handleMainClick}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="account-access-avatar" aria-hidden="true">
          {user ? getInitials(user.email) : '↗'}
        </span>

        <span className="account-access-text">
          <span className="account-access-label">
            {checking ? 'Account' : user ? 'Account' : 'Login'}
          </span>

          {user ? (
            <span className="account-access-email">{getShortEmail(user.email)}</span>
          ) : (
            <span className="account-access-email">Sign in to continue</span>
          )}
        </span>
      </button>

      {user && open ? (
        <div className="account-access-dropdown" role="menu">
          <div className="account-access-dropdown-header">
            <div className="account-access-dropdown-title">Signed in</div>
            <div className="account-access-dropdown-email">{user.email}</div>
          </div>

          <button
            type="button"
            className="account-access-menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/my-reports');
            }}
            role="menuitem"
          >
            My Reports
          </button>

          <button
            type="button"
            className="account-access-menu-item"
            onClick={handleGoToLogin}
            role="menuitem"
          >
            Account
          </button>

          <button
            type="button"
            className="account-access-menu-item danger"
            onClick={handleSignOut}
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
