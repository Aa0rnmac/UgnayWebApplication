import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#F5F4F1",
        panel: "#FFFFFF",
        accent: "#2E44A8",
        accentWarm: "#D4A800",
        muted: "#6B6B7A",
        brandRed: "#CC2828",
        brandYellow: "#D4A800",
        brandGreen: "#2A8C3F",
        brandBlue: "#2E44A8",
        brandBlueLight: "#E8ECF8",
        brandGreenLight: "#E8F5EB",
        brandYellowLight: "#FFF8D6",
        brandRedLight: "#FDE8E8",
        brandBorder: "#E2E2EA",
        brandMutedSurface: "#EEEDF2",
        brandOffWhite: "#F5F4F1",
        brandNavy: "#1C1C2E",
        brandWhite: "#FFFFFF"
      },
      boxShadow: {
        soft: "0 10px 24px rgba(28, 28, 46, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
