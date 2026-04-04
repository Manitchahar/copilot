import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        /* --- shadcn semantic tokens (CSS-variable-driven) --- */
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        /* --- Material 3 palette (kept for existing components) --- */
        "secondary-container": "#e0e5cc",
        "surface-tint": "#d97757",
        "surface-container-highest": "#e0e0db",
        "outline-variant": "#d4d4d0",
        "surface-container-high": "#ececea",
        "on-surface-variant": "#55433d",
        "on-secondary-fixed-variant": "#444937",
        "on-primary": "#ffffff",
        "on-tertiary-container": "#2b2c1a",
        "surface-container-low": "#ffffff",
        outline: "#999999",
        "on-surface": "#1a1a1a",
        "tertiary-fixed": "#e5e4ca",
        "on-secondary": "#ffffff",
        surface: "#f3f3ee",
        "on-primary-fixed": "#390b00",
        "inverse-on-surface": "#f2f1ee",
        "secondary-fixed": "#e0e5cc",
        "on-tertiary-fixed": "#1c1d0c",
        "on-error-container": "#93000a",
        "surface-container-lowest": "#ffffff",
        "tertiary-fixed-dim": "#c8c8af",
        "on-primary-container": "#541400",
        "on-error": "#ffffff",
        "secondary-fixed-dim": "#c4c9b1",
        "error-container": "#ffdad6",
        "surface-bright": "#faf9f6",
        "surface-dim": "#dbdad7",
        "on-secondary-container": "#626753",
        "primary-container": "#d97757",
        error: "#ba1a1a",
        "primary-fixed": "#ffdbd0",
        "surface-variant": "#e3e2e0",
        "on-background": "#1a1c1a",
        "surface-container": "#e8e8e3",
        "on-primary-fixed-variant": "#7a2f15",
        "on-tertiary-fixed-variant": "#474835",
        "on-secondary-fixed": "#191d0e",
        "inverse-primary": "#ffb59e",
        "on-tertiary": "#ffffff",
        tertiary: "#5f604b",
        "primary-fixed-dim": "#ffb59e",
        "inverse-surface": "#2f312f",
        "tertiary-container": "#93937c"
      },
      fontFamily: {
        headline: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        body: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        label: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        newsreader: ["'Newsreader'", "Georgia", "serif"],
        manrope: ["'Manrope'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'Fira Code'", "'Fira Mono'", "Menlo", "Consolas", "'DejaVu Sans Mono'", "monospace"],
      },
      borderRadius: {
        DEFAULT: "1rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-in": "fadeIn 600ms ease-out both"
      }
    }
  },
  plugins: [forms]
};
