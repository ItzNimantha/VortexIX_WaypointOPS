// Paste into tailwind.config.ts -> theme.extend (see design/STYLE.md)
module.exports = {
  colors: {
    navy: { 900: "#0F1F3D", 700: "#253B60" },
    brand: { 600: "#1D6FDB", 100: "#E6F0FD" },
    surface: "#F2F5FA",
    line: "#E5E7EB",
    ink: "#1A1A2E",
    muted: "#6B7280",
    "muted-on-navy": "#A8B7CE",
    success: { DEFAULT: "#1E8A4C", soft: "#E3F4EA" },
    danger: { DEFAULT: "#D92D3A", soft: "#FDECEE" },
    warning: { DEFAULT: "#F5A623", soft: "#FFF4D6", ink: "#8A5A00" },
  },
  borderRadius: { chip: "8px", card: "12px", panel: "16px", hero: "28px" },
  fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
};
