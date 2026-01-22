/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
	],
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px",
			},
		},
		extend: {
			colors: {
				steam: {
					bg: "#111226",
					card: "#1b2838",
					purple: "#723FA6",
					blue: "#402CBF",
					light: "#5F94D9",
					highlight: "#6AASD9"
				},
				border: "rgba(255,255,255,0.1)",
				background: "#111226",
				foreground: "#F1F5F9",
			},
			backgroundImage: {
				'steam-gradient': 'linear-gradient(135deg, #111226 0%, #1b1429 100%)',
				'accent-gradient': 'linear-gradient(to right, #723FA6, #402CBF)',
			},
			keyframes: {
				float: {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-10px)' },
				}
			},
			animation: {
				float: 'float 6s ease-in-out infinite',
			}
		},
	},
	plugins: [require("tailwindcss-animate")],
}