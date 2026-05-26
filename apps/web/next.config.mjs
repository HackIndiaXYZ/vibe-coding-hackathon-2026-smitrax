const nextConfig = {
  transpilePackages: ["@patchpilot/core"],
  generateBuildId: async () => process.env.NEXT_BUILD_ID ?? `patchpilot-${Date.now()}`
};

export default nextConfig;
