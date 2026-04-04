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
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
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
        /* --- Code block tokens --- */
        code: {
          DEFAULT: "hsl(var(--code-surface))",
          foreground: "hsl(var(--code-foreground) / <alpha-value>)",
        },
        /* --- Status tokens --- */
        "status-running": {
          DEFAULT: "hsl(var(--status-running))",
          bg: "hsl(var(--status-running-bg))",
          border: "hsl(var(--status-running-border))",
        },
        "status-success": {
          DEFAULT: "hsl(var(--status-success))",
          bg: "hsl(var(--status-success-bg))",
          border: "hsl(var(--status-success-border))",
        },
        "status-error": {
          DEFAULT: "hsl(var(--status-error))",
          bg: "hsl(var(--status-error-bg))",
          border: "hsl(var(--status-error-border))",
        },
        "status-warning": {
          DEFAULT: "hsl(var(--status-warning))",
          bg: "hsl(var(--status-warning-bg))",
          border: "hsl(var(--status-warning-border))",
        },
        "status-info": {
          DEFAULT: "hsl(var(--status-info))",
          bg: "hsl(var(--status-info-bg))",
          border: "hsl(var(--status-info-border))",
        },
        "status-special": {
          DEFAULT: "hsl(var(--status-special))",
          bg: "hsl(var(--status-special-bg))",
          border: "hsl(var(--status-special-border))",
        },
        "status-neutral": {
          DEFAULT: "hsl(var(--status-neutral))",
          bg: "hsl(var(--status-neutral-bg))",
          border: "hsl(var(--status-neutral-border))",
        },
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
        lg: "calc(var(--radius) + 4px)",
        md: "var(--radius)",
        sm: "calc(var(--radius) - 2px)",
        xl: "calc(var(--radius) + 8px)",
        "2xl": "calc(var(--radius) + 12px)",
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
