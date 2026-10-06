import { useEffect, useState } from 'react';
import { initData, useData, usePrefs } from '@/data/store';
import { restoreFocus } from './focusStore';
import { Shell } from './Shell';
import { CaptureWindow } from './CaptureWindow';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { ThemeSync } from './engines';

function hideSplash() {
  const el = document.getElementById('splash');
  if (el) {
    el.style.transition = 'opacity 220ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 240);
  }
}

export function App({ window: label }: { window: string }) {
  if (label === 'capture') return <CaptureWindow />;
  return <MainApp />;
}

function MainApp() {
  const ready = useData((s) => s.ready);
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      await initData();
      await restoreFocus();
      if (alive) setBooted(true);
      hideSplash();
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!ready || !booted) return null;
  return <Gate />;
}

function Gate() {
  const prefs = usePrefs();
  if (!prefs.onboarded) {
    return (
      <>
        <ThemeSync />
        <Onboarding />
      </>
    );
  }
  return <Shell />;
}
