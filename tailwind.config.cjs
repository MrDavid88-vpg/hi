module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        neon: {
          400: '#8b5cf6',
          500: '#6366f1',
          700: '#4338ca',
        },
      },
      boxShadow: {
        glow: '0 0 25px rgba(99,102,241,0.5)',
      },
    },
  },
  plugins: [],
};
