/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        // Exprest Original Variables
        bg: 'var(--ex-bg)',
        surface: 'var(--ex-surface)',
        'surface-elevated': 'var(--ex-surface-elevated)',
        border: 'var(--ex-border)',
        text: 'var(--ex-text)',
        'text-secondary': 'var(--ex-text-secondary)',
        'text-tertiary': 'var(--ex-text-tertiary)',
        accent: 'var(--ex-accent)',
        
        // Stitch Generated M3 Colors
        "surface-dim": "#ddd9d9",
        "on-primary-container": "#858386",
        "surface-container": "#f1edec",
        "tertiary-container": "#1f1b19",
        "primary": "#000000",
        "outline-variant": "#c8c6ca",
        "on-error": "#ffffff",
        "on-secondary-container": "#64646b",
        "on-primary": "#ffffff",
        "success": "#197a4b",
        "tertiary-fixed": "#eae0de",
        "outline": "#77767b",
        "on-tertiary": "#ffffff",
        "info": "#3568c6",
        "background": "#fdf8f8",
        "on-error-container": "#93000a",
        "inverse-on-surface": "#f4f0ef",
        "surface-variant": "#e5e2e1",
        "error": "#ba1a1a",
        "warning": "#a15c00",
        "on-surface": "#1c1b1b",
        "on-surface-variant": "#47464a",
        "primary-fixed": "#e5e1e4",
        "on-secondary-fixed-variant": "#46464d",
        "surface-container-lowest": "#ffffff",
        "inverse-primary": "#c8c6c8",
        "danger": "#c33b3b",
        "primary-fixed-dim": "#c8c6c8",
        "error-container": "#ffdad6",
        "on-tertiary-fixed-variant": "#4b4544",
        "surface-container-highest": "#e5e2e1",
        "tertiary": "#000000",
        "inverse-surface": "#313030",
        "surface-container-low": "#f7f3f2",
        "surface-tint": "#5f5e60",
        "on-tertiary-fixed": "#1f1b19",
        "on-tertiary-container": "#8a8280",
        "on-secondary": "#ffffff",
        "secondary-fixed": "#e3e1ea",
        "on-secondary-fixed": "#1a1b21",
        "surface-container-high": "#ebe7e7",
        "primary-container": "#1b1b1d",
        "secondary-fixed-dim": "#c7c5cd",
        "secondary": "#5e5e65",
        "on-primary-fixed": "#1b1b1d",
        "secondary-container": "#e3e1ea",
        "on-primary-fixed-variant": "#474649",
        "on-background": "#1c1b1b",
        "tertiary-fixed-dim": "#cec4c2",
        "surface-bright": "#fdf8f8"
      },
      borderRadius: {
        control: 'var(--ex-radius-control)',
        card: 'var(--ex-radius-card)',
        hero: 'var(--ex-radius-hero)',
        pill: 'var(--ex-radius-pill)',
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "space-xl": "32px",
        "space-2xl": "48px",
        "space-md": "16px",
        "gutter": "16px",
        "space-xs": "4px",
        "space-sm": "8px",
        "space-lg": "24px",
        "margin": "24px"
      },
      fontFamily: {
        "display-xl": ["Inter"],
        "display-lg": ["Inter"],
        "body-lg": ["Inter"],
        "label": ["Inter"],
        "heading-lg": ["Inter"],
        "body-md": ["Inter"],
        "heading-sm": ["Inter"],
        "heading-md": ["Inter"],
        "body-sm": ["Inter"]
      },
      fontSize: {
        "body-md": ["14px", "20px"],
        "heading-md": ["16px", "24px"],
        "heading-sm": ["14px", "20px"],
        "body-lg": ["16px", "24px"],
        "display-xl": ["57px", "64px"],
        "display-lg": ["45px", "52px"],
        "body-sm": ["12px", "16px"],
        "heading-lg": ["22px", "28px"],
        "label": ["11px", "16px"]
      },
      boxShadow: {
        sm: 'var(--ex-shadow-sm)',
        md: 'var(--ex-shadow-md)'
      }
    }
  },
  plugins: []
};
