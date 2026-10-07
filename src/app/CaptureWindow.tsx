import { useEffect, useState } from 'react';
import { CaptureBox } from './QuickCapture';
import { hideCaptureWindow, onCaptureShown, sendCapture } from '@/platform/native';
import { t } from '@/i18n';
import { playUiSound } from '@/platform/sound';
import { isTauri } from '@/platform/env';

/**
 * Ventana flotante de captura global (⌃⇧Espacio desde cualquier app). No toca la base de
 * datos: envía lo capturado a la ventana principal, que es la única que escribe.
 */
export function CaptureWindow() {
  const [shownKey, setShownKey] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add('capture-window');
    // La ventana se crea con vidrio nativo (Liquid Glass en macOS 26+).
    if (isTauri()) document.documentElement.setAttribute('data-window-glass', '');
    document.getElementById('splash')?.remove();
    let un: (() => void) | undefined;
    void onCaptureShown(() => {
      setSaved(false);
      setShownKey((k) => k + 1);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);
  return (
    <div className="capture-floating">
      <div className="capture-brand">
        <span className="brand-orb" />
        <span className="eyebrow">{saved ? t('capture.savedInbox') : t('capture.title')}</span>
      </div>
      <CaptureBox
        autoFocusKey={shownKey}
        onCancel={() => void hideCaptureWindow()}
        onSubmit={(text, kind) => {
          void sendCapture({ text, kind });
          playUiSound('complete');
          setSaved(true);
          setTimeout(() => void hideCaptureWindow(), 420);
          return true;
        }}
      />
    </div>
  );
}
