const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = 400;
const easing = 'cubic-bezier(.2,.7,.2,1)';

export function capture(element) {
  const rect = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  return {
    element: element.cloneNode(true),
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    text: element.textContent,
    style: Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'border', 'borderRadius', 'padding', 'boxShadow'].map(key => [key, computed[key]])),
  };
}

export function captureAll(container, selector) {
  return [...container.querySelectorAll(selector)].map(capture);
}

function ghost(snapshot) {
  const element = snapshot.element.cloneNode(true);
  element.removeAttribute('id');
  element.setAttribute('aria-hidden', 'true');
  element.inert = true;
  element.classList.add('motion-flight');
  Object.assign(element.style, snapshot.style, {
    position: 'fixed', left: `${snapshot.rect.left}px`, top: `${snapshot.rect.top}px`,
    width: `${snapshot.rect.width}px`, height: `${snapshot.rect.height}px`, margin: '0',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', zIndex: '50', transformOrigin: 'center',
  });
  document.body.append(element);
  return element;
}

function animate(element, keyframes, milliseconds, signal) {
  if (signal?.aborted || reducedMotion()) return Promise.resolve();
  const animation = element.animate(keyframes, { duration: milliseconds, easing });
  const cancel = () => animation.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  return animation.finished.catch(() => {}).finally(() => signal?.removeEventListener('abort', cancel));
}

export async function fly(source, target, { signal, arc = true } = {}) {
  if (reducedMotion() || signal?.aborted) return;
  const snapshot = source instanceof Element ? capture(source) : source;
  const destination = target instanceof Element ? target.getBoundingClientRect() : target;
  const dx = destination.left + destination.width / 2 - snapshot.rect.left - snapshot.rect.width / 2;
  const dy = destination.top + destination.height / 2 - snapshot.rect.top - snapshot.rect.height / 2;
  const element = ghost(snapshot);
  try {
    await animate(element, [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx / 2}px, ${dy / 2 - (arc ? 28 : 0)}px) scale(1.08)`, opacity: 1, offset: .5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.95)`, opacity: 1 },
    ], duration, signal);
  } finally { element.remove(); }
}

async function disappear(snapshot, signal) {
  if (reducedMotion() || signal?.aborted) return;
  const element = ghost(snapshot);
  try {
    await animate(element, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-18px) scale(.6)' }], 240, signal);
  } finally { element.remove(); }
}

function moveFrom(snapshot, element, signal) {
  const rect = element.getBoundingClientRect();
  return animate(element, [
    { transform: `translate(${snapshot.rect.left - rect.left}px, ${snapshot.rect.top - rect.top}px)` },
    { transform: 'translate(0, 0)' },
  ], duration, signal);
}

export function changeStack(before, after, inserted, signal) {
  if (reducedMotion() || signal?.aborted) return Promise.resolve();
  const animations = [disappear(before[0], signal)];
  for (let i = 0; i < inserted; i++) {
    const rect = after[i].getBoundingClientRect();
    animations.push(animate(after[i], [
      { opacity: 0, transform: `translate(${before[0].rect.left - rect.left}px, ${before[0].rect.top - rect.top}px) scale(.7)` },
      { opacity: 1, transform: 'translate(0, 0) scale(1)' },
    ], duration, signal));
  }
  for (let i = 1; i < before.length; i++) animations.push(moveFrom(before[i], after[inserted + i - 1], signal));
  return Promise.all(animations);
}

export function rearrangeSymbols(before, after, signal) {
  if (reducedMotion() || signal?.aborted || !before.length) return Promise.resolve();
  const remaining = [...before];
  const animations = [];
  for (const element of after) {
    const index = remaining.findIndex(snapshot => snapshot.text === element.textContent);
    if (index >= 0) animations.push(moveFrom(remaining.splice(index, 1)[0], element, signal));
    else animations.push(animate(element, [{ opacity: 0, transform: 'translateY(-16px) scale(.7)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], duration, signal));
  }
  for (const snapshot of remaining) {
    const duplicate = after.find(element => element.textContent === snapshot.text);
    animations.push(duplicate ? fly(snapshot, duplicate, { signal }) : disappear(snapshot, signal));
  }
  return Promise.all(animations);
}
