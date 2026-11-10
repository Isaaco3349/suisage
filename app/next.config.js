/** @type {import('next').NextConfig} */
const nextConfig = {
  // MemWal lazily imports an optional peer and gRPC loads .proto files from disk, so keep them out of the bundle.
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
  // Make sure the Sui proto files ship with the serverless functions on Vercel.
  outputFileTracingIncludes: { "/api/*": ["./proto/**/*", "./memwal-runtime/**/*"] },
};
module.exports = nextConfig;
