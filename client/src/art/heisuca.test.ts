import { expect, it } from 'vitest';
import { HEISUCA } from './heisuca';
function luminance(color: string) {
  const c = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
it('texto, texto secundário e acento dos dois temas atendem WCAG AA nas superfícies', () => {
  for (const theme of Object.values(HEISUCA)) for (const foreground of [theme.text,theme.muted,theme.accent]) for (const background of [theme.background,theme.surface]) {
    const l = [luminance(foreground),luminance(background)].sort((a,b)=>b-a);
    expect((l[0]+.05)/(l[1]+.05), `${foreground} sobre ${background}`).toBeGreaterThanOrEqual(4.5);
  }
});
