/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  devIndicators: false,
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
