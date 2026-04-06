import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#07090c",
        panel: "#12181f",
        accent: "#f41328",
        accentWarm: "#ece51e",
        muted: "#b9c2cb",
        brandRed: "#f41328",
        brandYellow: "#ece51e",
        brandGreen: "#49b649",
        brandBlue: "#4655a6",
        brandWhite: "#f2f2f2"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0, 0, 0, 0.25)"
      }
    }
  },
  plugins: []
};

export default config;
