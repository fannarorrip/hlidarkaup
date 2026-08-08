import type { Config } from "tailwindcss";

// Brand-litirnir fylgja Color Hunt pallettunni sem kassinn, bókhaldið og eldhúsið nota
// (#DB1A1A / #21323A / #2C687B / #8CC7C4) — vefverslunin var áður á sér-rauðum skala.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#DB1A1A",
          "red-dark": "#B81414",
          "red-light": "#E64848",
          ink: "#21323A",
          deep: "#2C687B",
          teal: "#8CC7C4",
          tealsoft: "#E4F1F0",
          cream: "#FFF6F6",
          mist: "#F2F5F6",
          muted: "#5C6B72",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
