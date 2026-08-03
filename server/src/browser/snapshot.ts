import type { Page } from 'playwright';

export interface SnapshotElement {
  ref: number;
  tag: string;
  role: string;
  name: string;
  value?: string;
  bbox: { x: number; y: number; w: number; h: number };
  href?: string;
  inputType?: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface SnapshotResult {
  url: string;
  title: string;
  elements: SnapshotElement[];
  visibleText: string;
}

// Injected into the page — must be a plain serialisable function
const SNAPSHOT_SCRIPT = /* js */ `
(function () {
  const QUERY = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type=hidden])',
    'select',
    'textarea',
    '[role=button]',
    '[role=link]',
    '[role=checkbox]',
    '[role=radio]',
    '[role=combobox]',
    '[role=listbox]',
    '[role=menuitem]',
    '[role=option]',
    '[role=tab]',
    '[role=switch]',
    '[role=slider]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const seen = new WeakSet();
  const elements = Array.from(document.querySelectorAll(QUERY)).filter((el) => {
    if (seen.has(el)) return false;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight * 1.5) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    return true;
  });

  let ref = 1;
  const result = [];

  for (const el of elements) {
    el.setAttribute('data-ariadne-ref', String(ref));
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const role =
      el.getAttribute('role') ||
      (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'input' ? 'input' : tag);

    const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
      ? (document.getElementById(el.getAttribute('aria-labelledby') || '') || el).textContent
      : null;

    const name = (
      ariaLabel ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      el.textContent?.trim() ||
      el.getAttribute('value') ||
      ''
    ).trim().slice(0, 100);

    const entry = {
      ref,
      tag,
      role,
      name,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    };

    if (el instanceof HTMLInputElement) {
      entry.value = el.value;
      entry.inputType = el.type;
      entry.checked = el.type === 'checkbox' || el.type === 'radio' ? el.checked : undefined;
      entry.disabled = el.disabled;
    } else if (el instanceof HTMLSelectElement) {
      entry.value = el.value;
      entry.disabled = el.disabled;
    } else if (el instanceof HTMLTextAreaElement) {
      entry.value = el.value;
    } else if (el instanceof HTMLAnchorElement) {
      entry.href = el.href;
    }

    result.push(entry);
    ref++;
  }

  return {
    elements: result,
    visibleText: (document.body.innerText || '').trim().slice(0, 8000),
    url: location.href,
    title: document.title,
  };
})()
`;

export async function takSnapshot(page: Page): Promise<SnapshotResult> {
  const raw = await page.evaluate(SNAPSHOT_SCRIPT) as SnapshotResult;
  return raw;
}

export function formatSnapshotForModel(snap: SnapshotResult): string {
  const lines: string[] = [
    `URL: ${snap.url}`,
    `Title: ${snap.title}`,
    '',
    '=== Interactive elements ===',
  ];

  for (const el of snap.elements) {
    const parts: string[] = [`[${el.ref}]`, el.role];
    if (el.name) parts.push(`"${el.name}"`);
    if (el.inputType && el.inputType !== 'text') parts.push(`(type=${el.inputType})`);
    if (el.value) parts.push(`value="${el.value.slice(0, 40)}"`);
    if (el.checked !== undefined) parts.push(el.checked ? 'checked' : 'unchecked');
    if (el.href) parts.push(`→ ${el.href.slice(0, 80)}`);
    lines.push(parts.join(' '));
  }

  lines.push('', '=== Visible text ===', snap.visibleText.slice(0, 4000));
  return lines.join('\n');
}
