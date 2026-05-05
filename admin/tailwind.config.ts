import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#C4622D",
          hover: "#A8521F",
          foreground: "#FFFFFF",
          light: "#F5ECD7",
        },
        accent: {
          DEFAULT: "#D4944A",
          light: "#FDEEC8",
          foreground: "#FFFFFF",
        },
        umber: "#2C1F14",
        mocha: "#6B5040",
        sand: "#B8A898",
        cream: "#F5ECD7",
        muted: {
          DEFAULT: "#F2EDE4",
          foreground: "#6B5040",
        },
        border: "#EDE6DA",
        input: "#F2EDE4",
        ring: "#C4622D",
        success: {
          DEFAULT: "#16A34A",
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "#C0392B",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#D4944A",
          foreground: "#FFFFFF",
        },
        status: {
          pending: "#D4944A",
          confirmed: "#3B82F6",
          preparing: "#8B5CF6",
          ready: "#10B981",
          onTheWay: "#C4622D",
          delivered: "#16A34A",
          cancelled: "#C0392B",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        pill: "100px",
        card: "16px",
        "card-lg": "18px",
        input: "14px",
        icon: "12px",
        "icon-sm": "10px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(44, 31, 20, 0.07)",
        "card-md": "0 4px 16px rgba(44, 31, 20, 0.09)",
        float: "0 8px 32px rgba(196, 98, 45, 0.13)",
      },
    },
  },
  plugins: [],
};
export default config;
