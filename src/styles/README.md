# Modern Dark Theme - Design System

## Overview

Escalada UI folosește un sistem de design modern cu tema dark/black, bazat pe principiile glassmorphism și micro-interactions. Toate culorile, spacing, shadows și animații sunt standardizate prin CSS custom properties.

## 📁 Structura Fișierelor

```
src/styles/
├── theme.ts          # Definițiile TypeScript ale temei
├── animations.css    # Animații și micro-interactions
└── utilities.css     # Clase utilitare pentru componente
```

## 🎨 Sistemul de Culori

### Background Layers
```css
--bg-primary: #0a0a0a      /* Almost black - main background */
--bg-secondary: #141414    /* Card backgrounds */
--bg-tertiary: #1a1a1a     /* Elevated elements */
--bg-glass: rgba(20, 20, 20, 0.7)  /* Glass panels */
```

### Accent Colors
```css
--accent-primary: #00d9ff   /* Cyan - primary actions */
--accent-secondary: #b366ff /* Purple - secondary actions */
--accent-success: #00ff88   /* Green - success states */
--accent-warning: #ffb800   /* Amber - warnings */
--accent-danger: #ff3366    /* Pink-red - danger */
--accent-info: #4da6ff      /* Blue - informational */
```

### Text Hierarchy
```css
--text-primary: #ffffff     /* Main text */
--text-secondary: #a0a0a0   /* Secondary text */
--text-tertiary: #666666    /* Tertiary text */
--text-disabled: #404040    /* Disabled text */
```

## 🧩 Componente Moderne

### Butoane

#### Variante
```tsx
<button className="modern-btn">Default</button>
<button className="modern-btn modern-btn-primary">Primary</button>
<button className="modern-btn modern-btn-danger">Danger</button>
<button className="modern-btn modern-btn-success">Success</button>
<button className="modern-btn modern-btn-ghost">Ghost</button>
```

#### Dimensiuni
```tsx
<button className="modern-btn modern-btn-sm">Small</button>
<button className="modern-btn">Medium</button>
<button className="modern-btn modern-btn-lg">Large</button>
<button className="modern-btn modern-btn-icon">🔥</button>
```

### Card-uri

```tsx
<div className="modern-card">
  <h3>Card Title</h3>
  <p>Card content...</p>
</div>

<div className="modern-card modern-card-highlighted">
  <h3>Highlighted Card</h3>
</div>
```

### Input Fields

```tsx
<input 
  className="modern-input" 
  placeholder="Enter text..."
/>

<input 
  className="modern-input modern-input-error" 
  placeholder="Error state"
/>
```

### Badges

```tsx
<span className="modern-badge modern-badge-success">✓ Completed</span>
<span className="modern-badge modern-badge-warning">⚠ Warning</span>
<span className="modern-badge modern-badge-danger">✕ Error</span>
<span className="modern-badge modern-badge-info">ℹ Info</span>
```

### Status Indicators

```tsx
<span className="status-dot status-dot-success"></span>
<span className="status-dot status-dot-warning"></span>
<span className="status-dot status-dot-danger"></span>
```

## ✨ Animații

### Fade Animations
```tsx
<div className="fade-in">Fade in</div>
<div className="fade-in-up">Fade in from bottom</div>
<div className="fade-in-down">Fade in from top</div>
```

### Slide Animations
```tsx
<div className="slide-in-right">Slide from right</div>
<div className="slide-in-left">Slide from left</div>
```

### Interactive Animations
```tsx
<button className="modern-btn btn-press-effect">Press me</button>
<div className="hover-lift">Lifts on hover</div>
<div className="hover-scale">Scales on hover</div>
```

### Loading States
```tsx
<div className="skeleton skeleton-text"></div>
<div className="spinner"></div>
<div className="pulse">Pulsing element</div>
```

### Stagger Children
```tsx
<div className="stagger-container">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
  {/* Each child fades in with a delay */}
</div>
```

## 🎯 Micro-interactions

### Button Press Effect
```css
.btn-press-effect:active {
  animation: button-press 0.2s ease-out;
}
```

### Success Ripple
```tsx
<div className="success-ripple">
  {/* Shows a ripple effect after success */}
</div>
```

### Error Shake
```tsx
<div className="error-shake">
  {/* Shakes on error */}
</div>
```

### Glow Effects
```tsx
<div className="glow-cyan">
  {/* Pulsing cyan glow */}
</div>
```

## 📐 Layout Utilities

### Containers
```tsx
<div className="container">Max-width 1200px</div>
<div className="container-narrow">Max-width 800px</div>
<div className="container-fluid">Full width</div>
```

### Grid System
```tsx
<div className="grid grid-cols-2">
  <div>Column 1</div>
  <div>Column 2</div>
</div>

<div className="grid grid-cols-3 gap-lg">
  <div>Card 1</div>
  <div>Card 2</div>
  <div>Card 3</div>
</div>
```

### Flexbox Utilities
```tsx
<div className="flex items-center justify-between gap-md">
  <span>Left</span>
  <span>Right</span>
</div>
```

## 🎭 Glassmorphism

Pentru efecte glassmorphism, combină:
```tsx
<div className="glass-effect glass-border modern-card">
  {/* Transparent background with blur */}
</div>
```

CSS:
```css
.glass-effect {
  background: var(--bg-glass);
  backdrop-filter: blur(16px);
}
```

## 📱 Responsive Design

### Breakpoints
- Mobile: < 768px
- Tablet: < 1024px
- Desktop: ≥ 1024px

### Utilities
```tsx
<div className="hide-mobile">Hidden on mobile</div>
<div className="hide-tablet">Hidden on tablet</div>
```

## 🎨 Cum să Folosești Tema

### În TypeScript/React
```tsx
import { darkTheme } from './styles/theme';

// Accesează culori
const primaryColor = darkTheme.colors.accent.primary;
const bgColor = darkTheme.colors.bg.secondary;
```

### În CSS
```css
/* Folosește direct variabilele CSS */
.my-component {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
}

.my-component:hover {
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-md);
}
```

## 🚀 Best Practices

1. **Folosește variabilele CSS** în loc de valori hard-coded
2. **Aplică animații** pentru micro-interactions (hover, focus, active)
3. **Menține consistența** folosind clase utilitare
4. **Glassmorphism** pentru overlay-uri și modals
5. **Accessibility**: asigură contrast suficient (WCAG AA+)
6. **Performance**: folosește `transform` și `opacity` pentru animații

## 🔧 Customizare

Pentru a modifica tema, editează `src/styles/theme.ts`:

```typescript
export const darkTheme = {
  colors: {
    accent: {
      primary: '#FF00FF', // Schimbă culoarea primară
      // ...
    }
  }
};
```

## 📖 Exemple Complete

### Modern Card cu Animații
```tsx
<div className="modern-card hover-lift fade-in-up">
  <div className="flex items-center gap-md mb-md">
    <span className="status-dot status-dot-success"></span>
    <h3 className="text-xl font-semibold">Active Competition</h3>
  </div>
  <p className="text-secondary mb-lg">
    Competition is currently running...
  </p>
  <button className="modern-btn modern-btn-primary btn-press-effect">
    View Details
  </button>
</div>
```

### Timer Display Modern
```tsx
<div className="modern-card text-center glass-effect">
  <div className="text-6xl font-bold text-accent mb-md blink">
    05:30
  </div>
  <div className="flex items-center justify-center gap-sm">
    <span className="status-dot status-dot-success"></span>
    <span className="text-sm text-secondary">RUNNING</span>
  </div>
</div>
```

---

**Creat pentru Escalada UI - Modern Dark Theme v1.0**
