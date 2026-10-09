/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the prompt files ship with the API route on Vercel.
  outputFileTracingIncludes: { "/api/**/*": ["./prompts/**/*"] },
};
export default nextConfig;
