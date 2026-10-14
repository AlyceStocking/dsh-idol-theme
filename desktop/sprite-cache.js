// Decode sprites before the renderer changes its visible image. Explicit loads
// take priority over background warming; focus changes cancel obsolete requests.
export function createSpriteCache({ createImage = () => new Image(), concurrency = 4, timeout = 12000, maxEntries = 32 } = {}) {
  if (typeof createImage !== 'function') throw new TypeError('createImage must be a function');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError('concurrency must be a positive integer');
  if (!Number.isFinite(timeout) || timeout < 0) throw new TypeError('timeout must be a non-negative number');
  if (!Number.isInteger(maxEntries) || maxEntries <= concurrency) throw new TypeError('maxEntries must exceed concurrency');

  const entries = new Map(), foreground = [], background = [];
  let active = 0, draining = false;
  const validUrl = url => typeof url === 'string' && url.length > 0;
  function discard(entry) {
    if (entries.get(entry.url) === entry) entries.delete(entry.url);
    if (entry.status === 'loading') { entry.cancel(); return; }
    if (entry.status === 'queued') {
      const queue = entry.priority ? foreground : background;
      queue.splice(queue.indexOf(entry), 1);
      entry.resolve(null);
    }
  }

  function start(entry) {
    active++;
    entry.status = 'loading';
    let image, settled = false, loaded = false;
    const timer = setTimeout(() => finish(null), timeout);
    entry.cancel = () => finish(null);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (image) {
        try { image.onload = null; image.onerror = null; if (!result) image.src = ''; } catch { /* A failed image factory still releases its slot. */ }
      }
      if (result) entry.status = 'ready';
      else if (entries.get(entry.url) === entry) entries.delete(entry.url);
      active--;
      entry.resolve(result);
      drain();
    }

    try {
      image = createImage();
      image.fetchPriority = entry.priority ? 'high' : 'low';
      image.onload = () => {
        if (settled || loaded) return;
        loaded = true;
        Promise.resolve().then(() => {
          if (typeof image.decode === 'function') return image.decode();
        }).then(() => finish(image), () => finish(null));
      };
      image.onerror = () => finish(null);
      image.src = entry.url;
    } catch {
      finish(null);
    }
  }

  function drain() {
    if (draining) return;
    draining = true;
    try {
      while (active < concurrency && (foreground.length || background.length)) start(foreground.length ? foreground.shift() : background.shift());
    } finally {
      draining = false;
    }
  }

  function getEntry(url, priority) {
    let entry = entries.get(url);
    if (entry) {
      entries.delete(url); entries.set(url, entry);
      if (priority && entry.status === 'queued' && !entry.priority) {
        background.splice(background.indexOf(entry), 1);
        entry.priority = true;
        foreground.push(entry);
      }
      if (priority) entry.priority = true;
      return entry;
    }
    if (entries.size >= maxEntries) {
      const victim = [...entries.values()].find(item => item.status === 'ready')
        ?? background[0] ?? (priority ? foreground[0] : null);
      if (!victim) return { promise: Promise.resolve(null) };
      discard(victim);
    }
    entry = { url, priority, status: 'queued' };
    entry.promise = new Promise(resolve => { entry.resolve = resolve; });
    entries.set(url, entry);
    (priority ? foreground : background).push(entry);
    return entry;
  }

  return {
    get size() { return entries.size; },
    focus(url) {
      // Batch cancellation: finishing one request must not start another stale one.
      draining = true;
      try { for (const entry of [...entries.values()]) if (entry.status !== 'ready' && entry.url !== url) discard(entry); }
      finally { draining = false; }
      return this.load(url);
    },
    retainWarm(urls) {
      const keep = new Set(urls);
      draining = true;
      try { for (const entry of [...entries.values()]) if (!entry.priority && entry.status !== 'ready' && !keep.has(entry.url)) discard(entry); }
      finally { draining = false; }
      drain();
    },
    load(url) {
      if (!validUrl(url)) return Promise.resolve(null);
      const entry = getEntry(url, true);
      drain();
      return entry.promise;
    },
    warm(urls) {
      if (!urls || typeof urls === 'string' || typeof urls[Symbol.iterator] !== 'function') return;
      for (const url of urls) if (validUrl(url)) getEntry(url, false);
      drain();
    },
  };
}
