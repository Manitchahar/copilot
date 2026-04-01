import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "secondary-container": "#e0e5cc",
        primary: "#99462a",
        "surface-tint": "#99462a",
        "surface-container-highest": "#e3e2e0",
        "outline-variant": "#dbc1b9",
        "surface-container-high": "#e9e8e5",
        "on-surface-variant": "#55433d",
        "on-secondary-fixed-variant": "#444937",
        "on-primary": "#ffffff",
        "on-tertiary-container": "#2b2c1a",
        background: "#faf9f6",
        "surface-container-low": "#f4f3f1",
        outline: "#88726c",
        "on-surface": "#1a1c1a",
        "tertiary-fixed": "#e5e4ca",
        "on-secondary": "#ffffff",
        surface: "#faf9f6",
        "on-primary-fixed": "#390b00",
        "inverse-on-surface": "#f2f1ee",
        "secondary-fixed": "#e0e5cc",
        secondary: "#5c614d",
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
        "surface-container": "#efeeeb",
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
        headline: ["Newsreader", "serif"],
        body: ["Manrope", "sans-serif"],
        label: ["Manrope", "sans-serif"],
        newsreader: ["Newsreader", "serif"],
        manrope: ["Manrope", "sans-serif"]
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
