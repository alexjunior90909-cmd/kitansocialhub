import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        kitan: {
          bg:        "#0F172A",
          surface:   "#1E2940",
          card:      "#334155",
          border:    "#475569",
          teal:      "#14B8A6",
          "teal-bright": "#2DD4BF",
          "off-white": "#F8FAFC",
          muted:     "#CBD5E1",
          subtle:    "#64748B",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#14B8A6",
          foreground: "#F8FAFC",
        },
        secondary: {
          DEFAULT: "#334155",
          foreground: "#F8FAFC",
        },
        muted: {
          DEFAULT: "#1E2940",
          foreground: "#CBD5E1",
        },
        accent: {
          DEFAULT: "#2DD4BF",
          foreground: "#0F172A",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "#334155",
          foreground: "#F8FAFC",
        },
        popover: {
          DEFAULT: "#1E2940",
          foreground: "#F8FAFC",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
      },
      backgroundImage: {
        "teal-gradient": "linear-gradient(135deg, #14B8A6 0%, #2DD4BF 100%)",
        "dark-gradient": "linear-gradient(135deg, #0F172A 0%, #1E2940 100%)",
        "card-gradient": "linear-gradient(135deg, #334155 0%, #1E2940 100%)",
        "hero-gradient": "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.8) 50%, #0F172A 100%)",
      },
      boxShadow: {
        "teal-glow": "0 0 20px rgba(20,184,166,0.3)",
        "teal-glow-lg": "0 0 40px rgba(20,184,166,0.4)",
        "card-shadow": "0 4px 24px rgba(0,0,0,0.4)",
        "card-hover": "0 8px 40px rgba(20,184,166,0.15)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-left": { from: { opacity: "0", transform: "translateX(-20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "slide-in-right": { from: { opacity: "0", transform: "translateX(20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "pulse-teal": { "0%,100%": { boxShadow: "0 0 0 0 rgba(20,184,166,0.4)" }, "50%": { boxShadow: "0 0 0 10px rgba(20,184,166,0)" } },
        "float": { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        "glow-pulse": { "0%,100%": { opacity: "0.6" }, "50%": { opacity: "1" } },
        "spin-slow": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "pulse-teal": "pulse-teal 2s infinite",
        "float": "float 3s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
