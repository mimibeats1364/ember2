/**
 * Código QR en SVG. La librería se carga solo cuando se muestra uno (no pesa en el arranque).
 * Siempre oscuro sobre claro, con margen: así lo leen todas las cámaras, sea cual sea el tema.
 */
import { useEffect, useState } from 'react';

export function QrCode({ value, size = 208, label }: { value: string; size?: number; label: string }) {
  const [path, setPath] = useState<{ d: string; n: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      if (alive) setPath({ d, n });
    });
    return () => {
      alive = false;
    };
  }, [value]);
  const quiet = 4;
  return (
    <div className="qr" style={{ width: size, height: size }} role="img" aria-label={label}>
      {path && (
        <svg viewBox={`${-quiet} ${-quiet} ${path.n + quiet * 2} ${path.n + quiet * 2}`} width={size} height={size} shapeRendering="crispEdges">
          <rect x={-quiet} y={-quiet} width={path.n + quiet * 2} height={path.n + quiet * 2} fill="#ffffff" />
          <path d={path.d} fill="#0a0a0b" />
        </svg>
      )}
    </div>
  );
}
