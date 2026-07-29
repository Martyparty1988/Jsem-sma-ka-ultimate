import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readRoot } from './bundle-source.mjs';

function observerHubSource() {
  const app = readRoot('app.js');
  const comment = app.indexOf('Incremental UI layers used to create their own MutationObserver');
  const start = app.indexOf('  (() => {', comment);
  const end = app.indexOf('\n\n  const $', start);
  assert.ok(start > -1 && end > start, 'shared observer hub must remain extractable');
  return app.slice(start, end);
}

test('shared observer hub multiplexes filters, subtrees and reconnects', () => {
  const nativeInstances = [];

  class NativeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnectCalls = 0;
      nativeInstances.push(this);
    }

    observe(target, options) {
      this.observed.push({ target, options });
    }

    disconnect() {
      this.disconnectCalls += 1;
      this.observed = [];
    }
  }

  const window = {
    MutationObserver: NativeMutationObserver,
    setTimeout(callback) { callback(); }
  };
  const context = { window, TypeError, Set, Map, Array, Boolean };
  context.globalThis = context;
  vm.runInNewContext(observerHubSource(), context);

  const parent = {
    contains(target) {
      return target === child;
    }
  };
  const child = { contains: () => false };
  const classRecords = [];
  const childRecords = [];
  const classObserver = new window.SmazkaMutationObserver((records) => classRecords.push(...records));
  const childObserver = new window.SmazkaMutationObserver((records) => childRecords.push(...records));

  classObserver.observe(parent, { attributes: true, attributeFilter: ['class'] });
  childObserver.observe(parent, { childList: true, subtree: true });
  assert.equal(nativeInstances.length, 1, 'all logical observers share one native instance');

  const native = nativeInstances[0];
  const classRecord = { type: 'attributes', target: parent, attributeName: 'class' };
  const ignoredAttribute = { type: 'attributes', target: parent, attributeName: 'id' };
  const childRecord = { type: 'childList', target: child };
  native.callback([classRecord, ignoredAttribute, childRecord]);

  assert.deepEqual(classRecords, [classRecord]);
  assert.deepEqual(childRecords, [childRecord]);

  classObserver.disconnect();
  classObserver.observe(child, { attributes: true });
  native.callback([{ type: 'attributes', target: child, attributeName: 'data-state' }]);
  assert.equal(classRecords.length, 2, 'a disconnected logical observer can observe again');
});
