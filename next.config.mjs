/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  images: {
    localPatterns: [
      {
        pathname: '/api/photo',
      },
    ],
  },
};

export default nextConfig;
