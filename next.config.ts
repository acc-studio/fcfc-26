import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Telegram webhook shells out to two binaries that Next's file tracing
  // can't discover on its own (they're referenced by runtime path, not import):
  // the yt-dlp binary fetched into ./bin at build time, and ffmpeg from
  // ffmpeg-static. Force both into that function's deployment bundle.
  outputFileTracingIncludes: {
    "/api/telegram": [
      "./bin/**",
      "./node_modules/ffmpeg-static/**",
    ],
  },
};

export default nextConfig;
