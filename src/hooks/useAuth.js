import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return {
    session,
    user: session?.user || null,
    loading: session === undefined,
    signOut: () => supabase.auth.signOut(),
  };
}
