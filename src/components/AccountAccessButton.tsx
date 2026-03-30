import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function AccountAccessButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (location.pathname === '/login') {
    return null;
  }

  const label = loading ? 'Account' : user ? 'Account' : 'Login';
  const detail = loading ? 'Checking session…' : user?.email ?? 'Sign in';

  return (
    <Link className="account-access-button" to="/login" aria-label={user ? 'Open account' : 'Log in'}>
      <span className="account-access-icon" aria-hidden="true">
        {user ? '●' : '○'}
      </span>
      <span className="account-access-copy">
        <span className="account-access-label">{label}</span>
        <span className="account-access-detail">{detail}</span>
      </span>
    </Link>
  );
}
