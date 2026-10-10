/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the prompt files ship with the API route on Vercel.
  outputFileTracingIncludes: { "/api/**/*": ["./prompts/**/*"] },

  // Cross-origin isolation: lets Javis's voice model use several CPU cores instead of one
  // (browsers only allow multi-threaded WebAssembly on isolated pages). Several times faster.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};
export default nextConfig;
