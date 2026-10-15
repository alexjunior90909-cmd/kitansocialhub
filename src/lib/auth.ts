import type { User } from '@/types';
import { getStorageItem, setStorageItem, removeStorageItem, generateId } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const AUTH_KEY = 'kitan_auth_user';
const USERS_KEY = 'kitan_users';

// Designated admin emails — always granted admin role on login/register
const ADMIN_EMAILS = ['alexjnr909@gmail.com', 'alexroseline345@gmail.com'];

function getUsers(): User[] {
  return getStorageItem<User[]>(USERS_KEY, []);
}

function saveUsers(users: User[]): void {
  setStorageItem(USERS_KEY, users);
}

export function getCurrentUser(): User | null {
  return getStorageItem<User | null>(AUTH_KEY, null);
}

function persistSession(user: User): void {
  setStorageItem(AUTH_KEY, user);
  const users = getUsers();
  const existing = users.find(u => u.email.toLowerCase() === user.email.toLowerCase());
  if (existing) {
    saveUsers(users.map(u => (u.email.toLowerCase() === user.email.toLowerCase() ? user : u)));
  } else {
    saveUsers([...users, user]);
  }
}

/**
 * Resolve the app-level User record for a verified email, PRESERVING the
 * legacy app id (wallets, payments, orders and subscriptions are keyed by it).
 * Looks the account up in `registered_users` (server-side, cross-device);
 * falls back to the device-local record; creates the server row if missing.
 */
async function resolveAppUser(email: string, fallbackName?: string): Promise<User | null> {
  const lower = email.toLowerCase().trim();
  const isAdminEmail = ADMIN_EMAILS.includes(lower);
  const local = getUsers().find(u => u.email.toLowerCase() === lower);

  const { data } = await supabase
    .from('registered_users')
    .select('*')
    .eq('email', lower)
    .maybeSingle();

  let user: User;
  if (data) {
    user = {
      id: data.id as string, // legacy id — data continuity for wallets/orders
      name: (data.username as string) || local?.name || fallbackName || lower.split('@')[0],
      email: lower,
      phone: local?.phone,
      role: isAdminEmail || data.role === 'admin' ? 'admin' : 'user',
      referralCode: local?.referralCode || `KITAN-${(data.username || 'USER').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'USER'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      referredBy: local?.referredBy,
      createdAt: (data.registered_at as string) || local?.createdAt || new Date().toISOString(),
      avatar: local?.avatar,
      wishlist: local?.wishlist || [],
      emailVerified: true,
    };
    // Keep admins admins on the server record too
    if (isAdminEmail && data.role !== 'admin') {
      void supabase.from('registered_users').update({ role: 'admin' }).eq('email', lower);
    }
    // Refresh last-seen (non-blocking, mirrors legacy sync behavior)
    void supabase.from('registered_users').update({ last_seen_at: new Date().toISOString() }).eq('email', lower);
  } else if (local) {
    user = { ...local, role: isAdminEmail ? 'admin' : local.role };
    void syncUserToDB(user);
  } else {
    // Verified by Supabase Auth but no app record yet (e.g. confirmed via email link)
    user = {
      id: generateId(),
      name: fallbackName || lower.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'User',
      email: lower,
      role: isAdminEmail ? 'admin' : 'user',
      referralCode: `KITAN-${(fallbackName || 'USER').toUpperCase().slice(0, 4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      wishlist: [],
      emailVerified: true,
    };
    void syncUserToDB(user);
  }

  persistSession(user);
  return user;
}

/**
 * Legacy device-local login (pre-Supabase accounts). Passwords were never
 * verifiable server-side, so this preserves the original behaviour on devices
 * that already know the account — this is what made "correct" logins fail on
 * any other device; Supabase Auth (tried first) fixes that permanently.
 */
function legacyLogin(email: string): User | null {
  const lower = email.toLowerCase().trim();
  const users = getUsers();
  const isAdminEmail = ADMIN_EMAILS.includes(lower);
  let user = users.find(u => u.email.toLowerCase() === lower);

  if (!user && isAdminEmail) {
    const adminUser: User = {
      id: generateId(),
      name: lower.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'Admin',
      email: lower,
      role: 'admin',
      referralCode: `KITAN-ADMIN-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      wishlist: [],
      emailVerified: true,
    };
    saveUsers([...users, adminUser]);
    user = adminUser;
  }

  if (user) {
    if (isAdminEmail && user.role !== 'admin') {
      user = { ...user, role: 'admin' };
      saveUsers(users.map(u => (u.email.toLowerCase() === lower ? user! : u)));
    }
    void syncUserToDB(user);
    setStorageItem(AUTH_KEY, user);
    return user;
  }
  return null;
}

/**
 * Sign in with Supabase Auth first (server-side password verification — works
 * from any device), then fall back to the legacy device-local account so no
 * existing user is locked out. A successful legacy login also tries to create
 * the Supabase Auth account with the supplied password (one-time bridge) when
 * none exists yet.
 */
export async function login(email: string, password: string): Promise<User | null> {
  const lower = email.toLowerCase().trim();

  // 1. Supabase Auth (authoritative, cross-device)
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: lower, password });
    if (!error && data.user?.email) {
      const user = await resolveAppUser(data.user.email);
      if (user) return user;
    }
  } catch { /* network problem — fall through to legacy */ }

  // 2. Legacy device-local account (existing users keep working as before)
  const legacy = legacyLogin(lower);
  if (legacy) {
    // One-time bridge: if no Supabase account existed, create it with this
    // password so future sign-ins work from every device. Errors are ignored
    // ("already registered" is expected once accounts were pre-seeded).
    if (password) {
      void supabase.auth.signUp({ email: lower, password }).catch(() => undefined);
    }
    return legacy;
  }
  return null;
}

export async function register(name: string, email: string, password: string, referralCode?: string): Promise<User | null> {
  const lower = email.toLowerCase().trim();
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === lower)) {
    return null; // Email already exists on this device
  }

  // Create the server-side credential account first.
  // If the project requires email confirmation, the session arrives after the
  // user clicks the link; either way the app account is usable immediately
  // (legacy behaviour preserved).
  let authExistsElsewhere = false;
  try {
    const { error } = await supabase.auth.signUp({ email: lower, password });
    if (error && /already registered|already exists/i.test(error.message)) {
      authExistsElsewhere = true;
    }
  } catch { /* offline — allow local registration like before */ }

  if (authExistsElsewhere) {
    // Account exists on the server but not on this device — user should sign in
    return null;
  }

  const isAdminEmail = ADMIN_EMAILS.includes(lower);
  const newUser: User = {
    id: generateId(),
    name,
    email: lower,
    role: isAdminEmail ? 'admin' : 'user',
    referralCode: `KITAN-${name.toUpperCase().slice(0, 4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    referredBy: referralCode,
    createdAt: new Date().toISOString(),
    wishlist: [],
    emailVerified: true,
  };
  saveUsers([...users, newUser]);
  setStorageItem(AUTH_KEY, newUser);

  // ── Persist signup to DB so admin CSV export captures every device/session ──
  supabase.from('registered_users').upsert({
    id: newUser.id,
    email: newUser.email.toLowerCase(),
    username: newUser.name,
    role: newUser.role,
    registered_at: newUser.createdAt,
    last_seen_at: new Date().toISOString(),
    account_status: 'active',
  }, { onConflict: 'email' }).then(({ error }) => {
    if (error) console.error('registered_users.upsert on register:', error.message);
  });

  return newUser;
}

export async function logout(): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* local-only session — clear below */ }
  removeStorageItem(AUTH_KEY);
}

/**
 * Restore the session on app start: cached (device) user first for instant UI,
 * then verified against the Supabase Auth session so a signed-in user stays
 * signed in across reloads. A cached legacy session is never dropped — this is
 * what prevents unexpected logouts.
 */
export async function restoreSession(): Promise<User | null> {
  const cached = getCurrentUser();
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.email) {
      const user = await resolveAppUser(data.session.user.email);
      if (user) return user;
    }
  } catch { /* keep cached */ }
  return cached;
}

export function updateUser(updates: Partial<User>): User | null {
  const current = getCurrentUser();
  if (!current) return null;
  const users = getUsers();
  const updated = { ...current, ...updates };
  const newUsers = users.map(u => u.id === current.id ? updated : u);
  saveUsers(newUsers);
  setStorageItem(AUTH_KEY, updated);
  if (updates.name) {
    void supabase.from('registered_users').update({ username: updates.name }).eq('id', current.id);
  }
  return updated;
}

export function getAllUsers(): User[] {
  return getUsers();
}

/** Sync current localStorage user to DB on each login (captures returning users on new devices). */
export function syncUserToDB(user: User): void {
  supabase.from('registered_users').upsert({
    id: user.id,
    email: user.email.toLowerCase(),
    username: user.name,
    role: user.role,
    registered_at: user.createdAt,
    last_seen_at: new Date().toISOString(),
    account_status: 'active',
  }, { onConflict: 'email' }).then(({ error }) => {
    if (error) console.error('registered_users.upsert on sync:', error.message);
  });
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}
