/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
        
        // Dynamic M3 / Stitch Colors (Adapt seamlessly to Dark Mode)
        "surface-dim": "var(--md-surface-dim)",
        "on-primary-container": "var(--md-on-primary-container)",
        "surface-container": "var(--md-surface-container)",
        "tertiary-container": "var(--md-primary-container)",
        "primary": "var(--md-primary)",
        "outline-variant": "var(--md-outline-variant)",
        "on-error": "#ffffff",
        "on-secondary-container": "var(--md-on-secondary-container)",
        "on-primary": "var(--md-on-primary)",
        "success": "#197a4b",
        "tertiary-fixed": "#eae0de",
        "outline": "var(--md-outline)",
        "on-tertiary": "#ffffff",
        "info": "#3568c6",
        "background": "var(--md-background)",
        "on-error-container": "#93000a",
        "inverse-on-surface": "var(--md-surface-container-low)",
        "surface-variant": "var(--md-surface-container-high)",
        "error": "#ba1a1a",
        "warning": "#a15c00",
        "on-surface": "var(--md-on-surface)",
        "on-surface-variant": "var(--md-on-surface-variant)",
        "primary-fixed": "#e5e1e4",
        "on-secondary-fixed-variant": "#46464d",
        "surface-container-lowest": "var(--md-surface-container-lowest)",
        "inverse-primary": "#c8c6c8",
        "danger": "#c33b3b",
        "primary-fixed-dim": "#c8c6c8",
        "error-container": "#ffdad6",
        "on-tertiary-fixed-variant": "#4b4544",
        "surface-container-highest": "var(--md-surface-container-highest)",
        "tertiary": "var(--md-primary)",
        "inverse-surface": "#313030",
        "surface-container-low": "var(--md-surface-container-low)",
        "surface-tint": "#5f5e60",
        "on-tertiary-fixed": "#1f1b19",
        "on-tertiary-container": "#8a8280",
        "on-secondary": "#ffffff",
        "secondary-fixed": "#e3e1ea",
        "on-secondary-fixed": "#1a1b21",
        "surface-container-high": "var(--md-surface-container-high)",
        "primary-container": "var(--md-primary-container)",
        "secondary-fixed-dim": "#c7c5cd",
        "secondary": "var(--md-secondary)",
        "on-primary-fixed": "#1b1b1d",
        "secondary-container": "var(--md-secondary-container)",
        "on-primary-fixed-variant": "#474649",
        "on-background": "var(--md-on-background)",
        "tertiary-fixed-dim": "#cec4c2",
        "surface-bright": "var(--md-surface-bright)"
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
