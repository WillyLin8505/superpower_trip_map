import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        paper: "#FBF7F0",
        surface: "#FFFDF9",
        border: { DEFAULT: "#EBE3D7", strong: "#DED3C3" },
        ink: "#2B2320",
        muted: "#7A6F66",
        clay: { DEFAULT: "#C65D3B", deep: "#A94A2E", tint: "#F6E7DF" },
        sea: { DEFAULT: "#3E7C7B", tint: "#E1EBEA" },
        attraction: { DEFAULT: "#E8B04B", tint: "#F7EBCF", ink: "#8A6516" },
        restaurant: { DEFAULT: "#D98C6A", tint: "#F5E4DA", ink: "#A5512E" },
        lodging: { DEFAULT: "#7C8B6A", tint: "#E7ECDF", ink: "#4D5A3A" },
        dessert: { DEFAULT: "#C17B9B", tint: "#F3E4EC", ink: "#8A4C6B" },
        success: "#4E8A5B",
        warn: "#D08A2C",
        error: "#C0392B",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "var(--font-noto-serif-tc)", "serif"],
        body: ["var(--font-noto-sans-tc)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
