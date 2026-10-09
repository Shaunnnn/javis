// pdf.js worker entry with the Safari ReadableStream fix applied first
// (same patch as lib/client/polyfills.js). The real worker is copied in on npm install.
if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
  const iterate = async function* () {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
  ReadableStream.prototype[Symbol.asyncIterator] = iterate;
  ReadableStream.prototype.values ??= iterate;
}
await import("./pdf.worker.min.mjs");
