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
  const authEnabled = isSupabaseConfigured() && !!supabase;
  const [user, setUser] = useState<User | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(authEnabled);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authEnabled || !supabase) {
      return;
    }

    const authClient = supabase;
    let mounted = true;

    const loadUser = async () => {
      const { data } = await authClient.auth.getUser();
      if (!mounted) return;
      setUser(data.user ?? null);
      setChecking(false);
    };

    void loadUser();

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [authEnabled]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpenPath(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (location.pathname === '/login') {
    return null;
  }

  const open = openPath === location.pathname;

  const handleMainClick = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setOpenPath((prev) => (prev === location.pathname ? null : location.pathname));
  };

  const handleGoToLogin = () => {
    setOpenPath(null);
    navigate('/login');
  };

  const handleSignOut = async () => {
    if (!supabase) return;

    await supabase.auth.signOut();
    setOpenPath(null);
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
              setOpenPath(null);
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
