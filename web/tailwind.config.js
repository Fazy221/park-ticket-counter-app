/** @type {import('tailwindcss').Config} */
// Same design system as the mobile app (see mobile/src/theme/colors.ts):
// "professional and calm rather than playful" - deep forest green primary,
// warm amber accent, Tailwind's own slate scale for neutrals. Named
// `gatemark-*` rather than overriding Tailwind's built-ins so both the
// stock slate scale and the brand colors stay available side by side.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gatemark: {
          primary: "#1F4D3A",
          primaryDark: "#153A2A",
          accent: "#D98E30",
          success: "#1E8E3E",
          successBg: "#E6F4EA",
          danger: "#D93025",
          dangerBg: "#FCE8E6",
          pending: "#D98E30",
          pendingBg: "#FCEEDA",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
