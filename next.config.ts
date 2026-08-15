import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /share/* pages are public by design (no login) but must never be
  // indexed — they carry attendee names, agencies and verbatim eval quotes.
  // The page-level `robots` metadata covers HTML crawls; this header also
  // covers non-HTML fetches and crawlers that only read response headers.
  async headers() {
    return [
      {
        source: "/share/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
