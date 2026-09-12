'use client';

import { api } from './api';

const SUB_KEY = 'tf-push-subscribed';

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  return reg.pushManager.getSubscription();
}

// Cached server readiness (set when the VAPID key is fetched/subscribed).
let serverPushReady: boolean | null = null;
export function isServerPushReady(): boolean {
  return serverPushReady === true;
}

/** True when this browser has an active push subscription AND server push is ready. */
export async function isPushActive(): Promise<boolean> {
  try {
    if (!isPushSupported()) return false;
    if (Notification.permission !== 'granted') return false;
    if (serverPushReady === false) return false;
    const sub = await getPushSubscription().catch(() => null);
    return sub !== null;
  } catch {
    return false;
  }
}

export async function subscribePush(): Promise<void> {
  if (!isPushSupported()) throw new Error('Этот браузер не поддерживает push-уведомления');
  if (Notification.permission !== 'granted') {
    const res = await Notification.requestPermission();
    if (res !== 'granted') throw new Error('Разрешите уведомления в браузере');
  }
  const { key, pushReady } = await api.getVapidKey();
  serverPushReady = Boolean(pushReady);
  if (!key || !pushReady) throw new Error('Push не настроен на сервере (нет VAPID-ключей)');
  const reg = await getRegistration();
  // Wait until the worker controls the page so push fires reliably.
  try {
    await navigator.serviceWorker.ready;
  } catch {}
  let sub = await reg.pushManager.getSubscription().catch(() => null);
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  const json = sub.toJSON();
  await api.subscribePush({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
    userAgent: navigator.userAgent.slice(0, 500),
  });
  try {
    localStorage.setItem(SUB_KEY, '1');
  } catch {}
}

export async function unsubscribePush(): Promise<void> {
  try {
    const sub = await getPushSubscription().catch(() => null);
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await api.unsubscribePush(endpoint).catch(() => {});
    }
  } finally {
    try {
      localStorage.removeItem(SUB_KEY);
    } catch {}
  }
}

export function wasPushSubscribed(): boolean {
  try {
    return localStorage.getItem(SUB_KEY) === '1';
  } catch {
    return false;
  }
}
