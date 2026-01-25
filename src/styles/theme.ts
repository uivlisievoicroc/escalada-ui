/**
 * Modern Dark Theme System for Escalada
 * Design System: Glassmorphism + Vibrant Accents
 */

export const darkTheme = {
  colors: {
    // Background layers (glassmorphism)
    bg: {
      primary: '#0a0a0a',      // Almost black - main background
      secondary: '#141414',    // Card backgrounds
      tertiary: '#1a1a1a',     // Elevated elements
      glass: 'rgba(20, 20, 20, 0.7)', // Glass panels with transparency
      overlay: 'rgba(10, 10, 10, 0.95)', // Modal overlays
    },
    
    // Accent colors (vibrant against black)
    accent: {
      primary: '#00d9ff',      // Cyan - primary actions, active states
      secondary: '#b366ff',    // Purple - secondary actions
      success: '#00ff88',      // Green - success states, completed
      warning: '#ffb800',      // Amber - warnings, paused states
      danger: '#ff3366',       // Pink-red - danger, errors, delete
      info: '#4da6ff',         // Blue - informational
    },
    
    // Text hierarchy
    text: {
      primary: '#ffffff',      // Main text
      secondary: '#a0a0a0',    // Secondary text
      tertiary: '#666666',     // Tertiary text, placeholders
      disabled: '#404040',     // Disabled text
      inverse: '#0a0a0a',      // Text on light backgrounds
    },
    
    // Borders & dividers
    border: {
      subtle: 'rgba(255, 255, 255, 0.05)',   // Very subtle borders
      medium: 'rgba(255, 255, 255, 0.1)',    // Standard borders
      strong: 'rgba(255, 255, 255, 0.2)',    // Emphasized borders
      focus: 'rgba(0, 217, 255, 0.5)',       // Focus states
    },
    
    // State colors with opacity variants
    state: {
      success: {
        bg: 'rgba(0, 255, 136, 0.1)',
        border: 'rgba(0, 255, 136, 0.3)',
        text: '#00ff88',
      },
      warning: {
        bg: 'rgba(255, 184, 0, 0.1)',
        border: 'rgba(255, 184, 0, 0.3)',
        text: '#ffb800',
      },
      danger: {
        bg: 'rgba(255, 51, 102, 0.1)',
        border: 'rgba(255, 51, 102, 0.3)',
        text: '#ff3366',
      },
      info: {
        bg: 'rgba(0, 217, 255, 0.1)',
        border: 'rgba(0, 217, 255, 0.3)',
        text: '#00d9ff',
      },
    },
  },
  
  // Shadow system
  shadows: {
    none: 'none',
    sm: '0 2px 8px rgba(0, 0, 0, 0.4)',
    md: '0 4px 16px rgba(0, 0, 0, 0.5)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
    xl: '0 16px 48px rgba(0, 0, 0, 0.7)',
    
    // Glow effects for emphasis
    glow: {
      cyan: '0 0 20px rgba(0, 217, 255, 0.3)',
      purple: '0 0 20px rgba(179, 102, 255, 0.3)',
      green: '0 0 20px rgba(0, 255, 136, 0.3)',
      amber: '0 0 20px rgba(255, 184, 0, 0.3)',
      red: '0 0 20px rgba(255, 51, 102, 0.3)',
    },
    
    // Inner shadows
    inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
  },
  
  // Blur effects for glassmorphism
  blur: {
    none: 'blur(0)',
    sm: 'blur(8px)',
    md: 'blur(16px)',
    lg: 'blur(24px)',
    xl: 'blur(32px)',
  },
  
  // Border radius system
  radius: {
    none: '0',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  
  // Spacing system (8px base)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },
  
  // Typography system
  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
    },
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '32px',
      '4xl': '48px',
      '5xl': '64px',
      '6xl': '72px',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  
  // Transitions
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  
  // Z-index layers
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 300,
    popover: 400,
    tooltip: 500,
  },
};

// Type definitions for TypeScript
export type DarkTheme = typeof darkTheme;

// CSS custom properties generator
export const generateCSSVariables = (theme: DarkTheme): string => {
  return `
    :root {
      /* Background colors */
      --bg-primary: ${theme.colors.bg.primary};
      --bg-secondary: ${theme.colors.bg.secondary};
      --bg-tertiary: ${theme.colors.bg.tertiary};
      --bg-glass: ${theme.colors.bg.glass};
      --bg-overlay: ${theme.colors.bg.overlay};
      
      /* Accent colors */
      --accent-primary: ${theme.colors.accent.primary};
      --accent-secondary: ${theme.colors.accent.secondary};
      --accent-success: ${theme.colors.accent.success};
      --accent-warning: ${theme.colors.accent.warning};
      --accent-danger: ${theme.colors.accent.danger};
      --accent-info: ${theme.colors.accent.info};
      
      /* Text colors */
      --text-primary: ${theme.colors.text.primary};
      --text-secondary: ${theme.colors.text.secondary};
      --text-tertiary: ${theme.colors.text.tertiary};
      --text-disabled: ${theme.colors.text.disabled};
      
      /* Border colors */
      --border-subtle: ${theme.colors.border.subtle};
      --border-medium: ${theme.colors.border.medium};
      --border-strong: ${theme.colors.border.strong};
      --border-focus: ${theme.colors.border.focus};
      
      /* Shadows */
      --shadow-sm: ${theme.shadows.sm};
      --shadow-md: ${theme.shadows.md};
      --shadow-lg: ${theme.shadows.lg};
      --shadow-xl: ${theme.shadows.xl};
      
      /* Border radius */
      --radius-sm: ${theme.radius.sm};
      --radius-md: ${theme.radius.md};
      --radius-lg: ${theme.radius.lg};
      --radius-xl: ${theme.radius.xl};
      
      /* Transitions */
      --transition-fast: ${theme.transitions.fast};
      --transition-base: ${theme.transitions.base};
      --transition-slow: ${theme.transitions.slow};
    }
  `;
};

export default darkTheme;
