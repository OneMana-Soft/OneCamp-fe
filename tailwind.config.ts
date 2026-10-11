import type { Config } from "tailwindcss";

export default {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
	"./types/**/*.{ts,tsx}",
	"./lib/**/*.{ts,tsx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		// Mirrors design v3's scale in app/globals.css (@theme), which is
  		// what Tailwind v4 actually reads: this file is not loaded (no @config)
  		// and stays only for the shadcn CLI (components.json). --radius is 8px:
  		// xs 4, sm 6, md 8, lg and xl 12, 2xl 16, 3xl 20.
  		borderRadius: {
  			xs: 'calc(var(--radius) - 4px)',
  			sm: 'calc(var(--radius) - 2px)',
  			md: 'var(--radius)',
  			lg: 'calc(var(--radius) + 4px)',
  			xl: 'calc(var(--radius) + 4px)',
  			'2xl': 'calc(var(--radius) + 8px)',
  			'3xl': 'calc(var(--radius) + 12px)'
  		},
  		// The elevation ladder (globals.css :root and .dark).
  		boxShadow: {
  			e1: 'var(--e1)',
  			sel: 'var(--e-sel)',
  			e2: 'var(--e2)',
  			e3: 'var(--e3)',
  			e4: 'var(--e4)',
  			sheet: 'var(--e-sheet)'
  		},
  		keyframes: {
  			blink: {
  				'50%': { opacity: '0' },
  			},
  			'text-shimmer': {
  				'0%': { backgroundPosition: '200% 0' },
  				'100%': { backgroundPosition: '-200% 0' },
  			},
  			'msg-fade-in': {
  				'0%': { opacity: '0', transform: 'translateY(4px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' },
  			},
  		},
  		animation: {
  			blink: 'blink 1s infinite',
  			'text-shimmer': 'text-shimmer 1.5s infinite linear',
  			'msg-fade-in': 'msg-fade-in 0.2s ease-out',
  		}
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography")
  ],
} satisfies Config;
