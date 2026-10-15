'use strict';
// A minimal DOM for skin tests: elements with children, classes, styles and cloning; body.prepend collects what a
// skin mounts so a test can look inside it.
class Element {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.className = ''; this.textContent = ''; this.style = { setProperty() {}, removeProperty() {} }; const classes = new Set(); this.classList = { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); }, contains: c => classes.has(c) }; }
  append(...c) { this.children.push(...c); } prepend(...c) { this.children.unshift(...c); } replaceChildren(...c) { this.children = c; }
  setAttribute() {} addEventListener() {} remove() {} animate() {} get offsetWidth() { return 100; }
  set innerHTML(value) { this.html = value; }
  cloneNode(deep) { const copy = new Element(this.tagName); copy.className = this.className; copy.src = this.src; copy.textContent = this.textContent; if (deep) copy.children = this.children.map(child => child.cloneNode(true)); return copy; }
  find(className) { if (this.className.split(' ').includes(className)) return this; for (const child of this.children) { const found = child.find?.(className); if (found) return found; } return null; }
}
function fakeDocument() {
  const body = new Element('body'), html = new Element('html');
  return { body, documentElement: html, createElement: tag => new Element(tag), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
}
module.exports = { Element, fakeDocument };
