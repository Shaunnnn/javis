// Safari doesn't yet support looping over a ReadableStream (for await ... of stream),
// which pdf.js relies on. This adds it. Mirrored in public/pdf.worker.safari.mjs for the worker.
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
