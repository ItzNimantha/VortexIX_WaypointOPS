import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          700: "#253B60",
          800: "#10233E",
          900: "#0F1F3D",
        },
        blue: {
          100: "#E6F0FD",
          600: "#1D6FDB",
        },
        surface: "#F2F5FA",
        card: "#FFFFFF",
        border: "#E5E7EB",
        text: "#1A1A2E",
        muted: "#6B7280",
        "muted-on-navy": "#A8B7CE",
        success: {
          DEFAULT: "#1E8A4C",
          surface: "#E3F4EA",
          text: "#166534",
        },
        danger: {
          DEFAULT: "#D92D3A",
          surface: "#FDECEE",
        },
        warning: {
          DEFAULT: "#F5A623",
          surface: "#FFF4D6",
          text: "#8A5A00",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        8: "8px",
        12: "12px",
        16: "16px",
        28: "28px",
        999: "999px",
        3: "3px",
        4: "4px",
        6: "6px",
      },
    },
  },
  plugins: [],
};
export default config;
