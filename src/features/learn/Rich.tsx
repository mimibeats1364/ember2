import { Fragment } from 'react';
import { Kbd } from '@/ui/components/primitives';

/** Texto con **negrita** y `teclas` (se muestran como teclas). */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith('`') ? (
          <Kbd key={i}>{p.slice(1, -1)}</Kbd>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
