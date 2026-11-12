import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { whenNear } from './nearViewport';

function mockObserver(t: { after: (fn: () => void) => void }, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'IntersectionObserver', original); else Reflect.deleteProperty(globalThis, 'IntersectionObserver'); });
}

test('cards share viewport work and shelves wait for both page and horizontal visibility', t => {
  const instances: FakeObserver[] = [];
  class FakeObserver {
    targets = new Set<Element>();
    constructor(public callback: IntersectionObserverCallback, public options: IntersectionObserverInit) { instances.push(this); }
    observe(el: Element) { this.targets.add(el); }
    unobserve(el: Element) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
    enter(el: Element) { this.callback([{ target: el, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  }
  mockObserver(t, FakeObserver);
  const row = {} as Element;
  const card = { parentElement: { closest: () => row } } as unknown as Element;
  let first = 0, second = 0;
  const cancelFirst = whenNear(card, () => first++);
  const cancelSecond = whenNear(card, () => second++);
  assert.equal(instances.length, 1);
  assert.deepEqual([...instances[0].targets], [row]);
  instances[0].enter(row);
  assert.equal(first, 0);
  assert.equal(instances.length, 2);
  assert.equal(instances[1].options.root, row);
  cancelFirst();
  instances[1].enter(card);
  assert.equal(first, 0);
  assert.equal(second, 1);
  assert.equal(instances[0].targets.size + instances[1].targets.size, 0);
  cancelSecond();
});

test('unmounted cards cancel observations and browsers without observers load normally', t => {
  let disconnected = 0;
  class FakeObserver {
    observe() {}
    unobserve() {}
    disconnect() { disconnected++; }
  }
  mockObserver(t, FakeObserver);
  const card = { parentElement: null } as Element;
  let loaded = 0;
  whenNear(card, () => loaded++)();
  assert.equal(disconnected, 1);
  assert.equal(loaded, 0);
  Reflect.set(globalThis, 'IntersectionObserver', undefined);
  whenNear(card, () => loaded++)();
  assert.equal(loaded, 1);
});
