import type { Session } from '@supabase/supabase-js';

type PaddlePlan = 'pro_monthly' | 'pro_yearly';

type PaddleCheckoutOptions = {
  plan: PaddlePlan;
  session: Session;
};

type PaddleInstance = {
  Environment?: {
    set(environment: 'sandbox' | 'production'): void;
  };
  Initialize(options: {
    token: string;
    eventCallback?: (event: { name?: string; data?: unknown }) => void;
  }): void;
  Checkout: {
    open(options: {
      settings: {
        displayMode: 'overlay';
        theme: 'light' | 'dark';
        locale?: string;
        successUrl: string;
      };
      items: Array<{ priceId: string; quantity: number }>;
      customer?: { email?: string };
      customData: Record<string, string>;
    }): void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleInstance;
  }
}

const PADDLE_SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const paddleEnvironment = (import.meta.env.VITE_PADDLE_ENV || import.meta.env.PADDLE_ENV || 'production') as string;

const priceIds: Record<PaddlePlan, string | undefined> = {
  pro_monthly: import.meta.env.VITE_PADDLE_MONTHLY_PRICE_ID as string | undefined,
  pro_yearly: import.meta.env.VITE_PADDLE_YEARLY_PRICE_ID as string | undefined,
};

let paddleScriptPromise: Promise<PaddleInstance> | null = null;
let isInitialized = false;

export const isPaddleConfigured = Boolean(clientToken && priceIds.pro_monthly && priceIds.pro_yearly);

function loadPaddleScript() {
  if (window.Paddle) {
    return Promise.resolve(window.Paddle);
  }

  if (paddleScriptPromise) {
    return paddleScriptPromise;
  }

  paddleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_SCRIPT_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.Paddle) resolve(window.Paddle);
      });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Paddle.js.')));
      return;
    }

    const script = document.createElement('script');
    script.src = PADDLE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Paddle) {
        resolve(window.Paddle);
      } else {
        reject(new Error('Paddle.js loaded without Paddle global.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Paddle.js.'));
    document.head.appendChild(script);
  });

  return paddleScriptPromise;
}

export async function openPaddleCheckout({ plan, session }: PaddleCheckoutOptions) {
  if (!clientToken) {
    throw new Error('Missing VITE_PADDLE_CLIENT_TOKEN.');
  }

  const priceId = priceIds[plan];
  if (!priceId) {
    throw new Error(`Missing Paddle price ID for ${plan}.`);
  }

  const paddle = await loadPaddleScript();

  if (!isInitialized) {
    if (paddleEnvironment === 'sandbox') {
      paddle.Environment?.set('sandbox');
    }

    paddle.Initialize({ token: clientToken });
    isInitialized = true;
  }

  paddle.Checkout.open({
    settings: {
      displayMode: 'overlay',
      theme: 'dark',
      locale: 'zh-Hans',
      successUrl: `${window.location.origin}/?checkout=success`,
    },
    items: [{ priceId, quantity: 1 }],
    customer: {
      email: session.user.email || undefined,
    },
    customData: {
      user_id: session.user.id,
      plan,
      source: 'app_upgrade_panel',
    },
  });
}
