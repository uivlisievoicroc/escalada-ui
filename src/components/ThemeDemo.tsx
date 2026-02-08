import React from 'react';
import '../styles/animations.css';  // Animation utilities (fade-in, slide, pulse, etc.)
import '../styles/utilities.css';  // Spacing, layout, typography utilities

/**
 * ThemeDemo Component - Comprehensive Design System Showcase
 * 
 * Purpose:
 * - Visual reference for all available UI components and patterns
 * - Interactive demo of modern dark theme design system
 * - Testing ground for new styles before integration
 * - Documentation for developers implementing UI features
 * 
 * Design System Elements:
 * - Color palette: Primary, success, warning, danger accents (CSS variables)
 * - Buttons: 6 variants (default, primary, success, warning, danger, ghost) + 3 sizes
 * - Cards: Standard, highlighted, glass effect with hover animations
 * - Badges: 5 semantic colors (success, warning, danger, info, neutral)
 * - Inputs: Normal and error states with modern styling
 * - Loading states: Spinner, skeleton, pulse animations
 * - Status indicators: Colored dots for active/warning/error states
 * 
 * Animation Patterns:
 * - Fade-in-up/down: Entrance animations with stagger delays (0.05s increments)
 * - Hover effects: Lift (translateY + shadow), scale (transform), glow (box-shadow)
 * - Press effect: Button feedback (scale down on click)
 * - Blink: Colon separator in timer (1s interval, attention grabber)
 * - Pulse: Breathing effect for status indicators (2s cycle)
 * 
 * CSS Architecture:
 * - CSS custom properties (--accent-primary, --bg-primary, etc.) for theming
 * - Utility classes (.modern-card, .modern-btn, .flex, .grid) for rapid composition
 * - BEM-style naming (.modern-btn-primary, .status-dot-success) for clarity
 * - Animation delays via inline style.animationDelay for stagger effect
 * 
 * Usage:
 * - Access via /theme-demo route (development only)
 * - Copy-paste sections for new features (preserve class names + structure)
 * - Reference color palette for consistent accent usage
 * - Test responsive behavior (grid → single column on mobile)
 * 
 * Removal:
 * - Delete this file after theme implementation complete
 * - Keep animations.css and utilities.css (used throughout app)
 * - Migrate needed patterns to component library
 * 
 * Dependencies:
 * - styles/animations.css: Animation keyframes + utility classes
 * - styles/utilities.css: Layout helpers (flex, grid, spacing)
 * - CSS variables in index.css: --accent-*, --bg-*, --text-*
 */
const ThemeDemo: React.FC = () => {
  return (
    <div style={{ padding: '40px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div className="container">
        {/* Main title with fade-in-down animation (slides from top) */}
        <h1 className="text-3xl font-bold mb-lg fade-in-down">
          🎨 Modern Dark Theme - Demo
        </h1>

        {/* 
          Color Palette Section
          
          Showcases the 4 primary accent colors used throughout the app:
          - Primary (cyan/blue): Main actions, links, focus states
          - Success (green): Completion, active status, positive feedback
          - Warning (orange): Caution, pending states, requires attention
          - Danger (red): Errors, destructive actions, critical alerts
          
          Implementation:
          - Colors defined as CSS variables (--accent-primary, etc.)
          - Height 80px shows color + provides hover target
          - Border radius --radius-md (8px) for consistency
          - Grid layout with 4 columns (responsive to 2 cols on mobile)
        */}
        <section className="modern-card mb-lg fade-in-up">
          <h2 className="text-2xl font-semibold mb-md">Color Palette</h2>
          <div className="grid grid-cols-4 gap-md">
            {/* Primary accent - Use for: CTA buttons, links, active states, progress indicators */}
            <div>
              <div style={{ background: 'var(--accent-primary)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Primary</p>
            </div>
            {/* Success accent - Use for: Completed tasks, active timers, positive feedback, checkmarks */}
            <div>
              <div style={{ background: 'var(--accent-success)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Success</p>
            </div>
            {/* Warning accent - Use for: Alerts, paused states, "needs attention" indicators */}
            <div>
              <div style={{ background: 'var(--accent-warning)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Warning</p>
            </div>
            {/* Danger accent - Use for: Errors, delete buttons, critical warnings, stop actions */}
            <div>
              <div style={{ background: 'var(--accent-danger)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Danger</p>
            </div>
          </div>
        </section>

        {/* 
          Button Showcase
          
          Demonstrates all button variants and sizes:
          - Variants: default (neutral), primary (CTA), success (confirm), warning (caution), danger (destructive), ghost (subtle)
          - Sizes: sm (32px height), default (40px), lg (48px), icon (40x40px square)
          - States: hover (brightness), active (scale down), disabled (opacity + no-pointer)
          
          Class structure:
          - .modern-btn: Base styles (padding, border-radius, transition)
          - .modern-btn-{variant}: Color scheme (background, text, border)
          - .modern-btn-{size}: Height + padding overrides
          - .btn-press-effect: Scale-down animation on click
          
          Animation delay: 0.1s (second element after title, creates stagger effect)
        */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-semibold mb-md">Buttons</h2>
          {/* Button variants row - shows semantic color coding */}
          <div className="flex flex-wrap gap-md mb-md">
            <button className="modern-btn">Default</button>  {/* Neutral gray, general actions */}
            <button className="modern-btn modern-btn-primary">Primary</button>  {/* Cyan, main CTAs */}
            <button className="modern-btn modern-btn-success">Success</button>  {/* Green, confirmations */}
            <button className="modern-btn modern-btn-warning">Warning</button>  {/* Orange, caution actions */}
            <button className="modern-btn modern-btn-danger">Danger</button>  {/* Red, destructive actions */}
            <button className="modern-btn modern-btn-ghost">Ghost</button>  {/* Transparent, subtle actions */}
          </div>
          {/* Button sizes row - demonstrates 3 sizes + icon variant */}
          <div className="flex flex-wrap gap-md items-center">
            <button className="modern-btn modern-btn-sm modern-btn-primary">Small</button>  {/* 32px height, compact UI */}
            <button className="modern-btn modern-btn-primary">Medium</button>  {/* 40px height, default size */}
            <button className="modern-btn modern-btn-lg modern-btn-primary">Large</button>  {/* 48px height, prominent actions */}
            <button className="modern-btn modern-btn-icon">🔥</button>  {/* 40x40px square, emoji/icon only */}
          </div>
        </section>

        {/* 
          Cards Showcase
          
          Demonstrates card variants and interactive effects:
          - Standard card: .modern-card (dark background, subtle border, rounded corners)
          - Highlighted card: .modern-card-highlighted (accent border glow, draws attention)
          - Hover effects: .hover-lift (translateY -4px + shadow increase)
          
          Status dots:
          - .status-dot: 8px circle indicator
          - .status-dot-success: Green (active, running, online)
          - .status-dot-warning: Orange (paused, pending, caution)
          - .status-dot-danger: Red (error, stopped, offline)
          
          Grid layout:
          - 3 columns on desktop
          - Auto-responsive to 2 cols tablet, 1 col mobile
          - gap-lg (24px) for breathing room
          
          Stagger animation:
          - Each card has increasing animationDelay (0.15s, 0.2s, 0.25s)
          - Creates cascading entrance effect (left to right)
        */}
        <section className="mb-lg">
          <h2 className="text-2xl font-semibold mb-md">Cards</h2>
          <div className="grid grid-cols-3 gap-lg">
            {/* Standard card - Default styling, green status (active state) */}
            <div className="modern-card hover-lift fade-in-up" style={{ animationDelay: '0.15s' }}>
              <div className="flex items-center gap-sm mb-md">
                <span className="status-dot status-dot-success"></span>  {/* 8px green circle */}
                <h3 className="text-xl font-semibold">Active</h3>
              </div>
              <p className="text-secondary">This is a modern card with hover lift effect.</p>
            </div>
            {/* Standard card - Orange status (warning/pending state) */}
            <div className="modern-card hover-lift fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-sm mb-md">
                <span className="status-dot status-dot-warning"></span>  {/* 8px orange circle */}
                <h3 className="text-xl font-semibold">Warning</h3>
              </div>
              <p className="text-secondary">Card with warning status indicator.</p>
            </div>
            {/* Highlighted card - Accent border glow, stands out from others */}
            <div className="modern-card modern-card-highlighted hover-lift fade-in-up" style={{ animationDelay: '0.25s' }}>
              <div className="flex items-center gap-sm mb-md">
                <span className="status-dot status-dot-success"></span>
                <h3 className="text-xl font-semibold">Highlighted</h3>
              </div>
              <p className="text-secondary">This card is highlighted with accent colors.</p>
            </div>
          </div>
        </section>

        {/* 
          Badges Showcase
          
          Small labeled indicators for status, categories, or counts:
          - Success: Green background, checkmark icon (completed, active)
          - Warning: Orange background, caution icon (pending, review)
          - Danger: Red background, X icon (error, failed)
          - Info: Blue background, info icon (informational)
          - Neutral: Gray background, no icon (default, inactive)
          
          Usage:
          - Status labels: "Active", "Pending", "Completed"
          - Category tags: Route difficulty, climber level
          - Count indicators: "3 routes", "5 climbers"
          
          Styling:
          - Small font (12px), uppercase for emphasis
          - Rounded pill shape (border-radius: 9999px)
          - Padding: 4px 12px (compact but readable)
          - Icons provide quick visual recognition
        */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-2xl font-semibold mb-md">Badges</h2>
          <div className="flex flex-wrap gap-md">
            <span className="modern-badge modern-badge-success">✓ Completed</span>  {/* Green, positive outcome */}
            <span className="modern-badge modern-badge-warning">⚠ Warning</span>  {/* Orange, needs attention */}
            <span className="modern-badge modern-badge-danger">✕ Error</span>  {/* Red, critical issue */}
            <span className="modern-badge modern-badge-info">ℹ Info</span>  {/* Blue, informational */}
            <span className="modern-badge modern-badge-neutral">Neutral</span>  {/* Gray, default state */}
          </div>
        </section>

        {/* 
          Input Fields Showcase
          
          Demonstrates text input states and styling:
          - Normal state: Subtle border, focus glow (cyan accent)
          - Error state: Red border, shake animation on invalid input
          
          Styling features:
          - Dark background (--bg-secondary) for contrast
          - 40px height for touch-friendly targets
          - Smooth transitions on focus (200ms border color + box-shadow)
          - Placeholder text dimmed (--text-tertiary)
          
          Accessibility:
          - Labels always visible (not placeholder-only)
          - High contrast text (--text-primary)
          - Focus visible (outline + glow)
          - Error state communicated via color + icon (not color alone)
          
          Usage:
          - Form fields: Name, email, timer presets
          - Search inputs: Competitor search, route filter
          - Inline edits: Category name, box label
        */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.35s' }}>
          <h2 className="text-2xl font-semibold mb-md">Input Fields</h2>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="text-sm text-secondary mb-sm" style={{ display: 'block' }}>Normal Input</label>
              <input className="modern-input" placeholder="Enter your name..." />  {/* Default state */}
            </div>
            <div>
              <label className="text-sm text-secondary mb-sm" style={{ display: 'block' }}>Error State</label>
              <input className="modern-input modern-input-error" placeholder="Error input" />  {/* Red border + shake */}
            </div>
          </div>
        </section>

        {/* 
          Loading States Showcase
          
          Three loading patterns for different use cases:
          
          1. Spinner:
             - Circular rotating animation (1s duration)
             - Use for: Button loading states, small async operations
             - Size: 24px (can scale with font-size)
          
          2. Skeleton:
             - Shimmer animation across gray placeholder (1.5s cycle)
             - Use for: Content loading (text, cards, lists)
             - Preserves layout (prevents content shift on load)
          
          3. Pulse:
             - Scale + opacity breathing effect (2s cycle)
             - Use for: Status indicators, "live" badges, attention grabbers
             - Subtle movement keeps UI feeling alive
          
          Performance:
          - CSS animations (GPU accelerated, no JS overhead)
          - Infinite loops with alternate direction for smooth cycles
          - Paused on prefers-reduced-motion (accessibility)
        */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.4s' }}>
          <h2 className="text-2xl font-semibold mb-md">Loading States</h2>
          <div className="flex items-center gap-xl">
            <div>
              <p className="text-sm text-secondary mb-sm">Spinner</p>
              {/* Rotating circle loader - Use for button states, small async ops */}
              <div className="spinner"></div>
            </div>
            <div style={{ flex: 1 }}>
              <p className="text-sm text-secondary mb-sm">Skeleton</p>
              {/* Shimmer placeholder - Use for content loading (preserves layout) */}
              <div className="skeleton skeleton-text mb-sm"></div>  {/* Full width line */}
              <div className="skeleton skeleton-text" style={{ width: '80%' }}></div>  {/* Shorter line */}
            </div>
            <div>
              <p className="text-sm text-secondary mb-sm">Pulse</p>
              {/* Breathing animation - Use for live indicators, status badges */}
              <div className="pulse" style={{ 
                width: '60px', 
                height: '60px', 
                background: 'var(--accent-primary)', 
                borderRadius: 'var(--radius-md)' 
              }}></div>
            </div>
          </div>
        </section>

        {/* 
          Timer Display Example
          
          Demonstrates large-format timer for competition use:
          - Size: text-6xl (60px) for visibility from distance
          - Color: Cyan accent with glow for attention
          - Font features: Tabular nums (fixed-width digits prevent jitter)
          - Animation: Blinking colon separators (1s interval)
          
          Typography:
          - fontVariantNumeric: 'tabular-nums' ensures all digits same width
          - letterSpacing: -2px tightens spacing for compact look
          - textShadow adds glow effect (matches accent color)
          
          Status indicator:
          - Green dot + "RUNNING" label below timer
          - letterSpacing: 2px for uppercase label (improves readability)
          
          Glass effect:
          - .glass-effect applies backdrop-blur + transparent background
          - Creates modern glassmorphism look
          - Works best over gradients or images
        */}
        <section className="modern-card text-center glass-effect fade-in-up" style={{ animationDelay: '0.45s' }}>
          <h2 className="text-2xl font-semibold mb-lg">Timer Display Example</h2>
          {/* Large timer with glow effect - Digits use tabular-nums to prevent width changes */}
          <div className="text-6xl font-bold mb-md" style={{ 
            color: 'var(--accent-primary)',  // Cyan accent for visibility
            textShadow: '0 0 20px rgba(0, 217, 255, 0.5)',  // Glow effect
            fontVariantNumeric: 'tabular-nums',  // Fixed-width digits
            letterSpacing: '-2px'  // Tighter spacing
          }}>
            05<span className="blink">:</span>30<span className="blink">:</span>00  {/* Blinking colons animate */}
          </div>
          {/* Status indicator - Shows timer state (running/paused/stopped) */}
          <div className="flex items-center justify-center gap-md">
            <span className="status-dot status-dot-success"></span>  {/* Green = running */}
            <span className="text-sm text-secondary font-semibold" style={{ letterSpacing: '2px' }}>RUNNING</span>
          </div>
        </section>

        {/* 
          Interactive Elements Showcase
          
          Demonstrates micro-interactions for user feedback:
          
          1. Press Effect:
             - Scale down to 0.95 on active state (button click)
             - Provides tactile feedback (feels responsive)
             - 100ms transition for snappy feel
          
          2. Hover Lift:
             - translateY -4px + increased shadow on hover
             - Creates depth, element "lifts" off page
             - Use for: Cards, clickable items, draggable elements
          
          3. Hover Scale:
             - Scale up to 1.02 on hover
             - Subtle zoom effect draws attention
             - Use for: Images, profile avatars, thumbnails
          
          Why micro-interactions matter:
          - Confirms user action (button pressed)
          - Provides affordance (card is clickable)
          - Makes UI feel polished and responsive
          - Improves perceived performance
        */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.5s' }}>
          <h2 className="text-2xl font-semibold mb-md">Interactive Elements</h2>
          <div className="grid grid-cols-3 gap-md">
            {/* Button with press feedback - Scales down on click */}
            <button className="modern-btn modern-btn-primary btn-press-effect">
              Press Effect
            </button>
            {/* Card with lift effect - Moves up + shadow on hover */}
            <div className="modern-card hover-lift text-center">
              <p className="text-sm">Hover Lift</p>
            </div>
            {/* Card with scale effect - Grows slightly on hover */}
            <div className="modern-card hover-scale text-center">
              <p className="text-sm">Hover Scale</p>
            </div>
          </div>
        </section>

        {/* 
          Stagger Animation Example
          
          Demonstrates cascading entrance animation:
          - Container: .stagger-container triggers child animations
          - Children: Fade in sequentially with increasing delay
          - Timing: Each child delays by 0.1s more than previous
          
          How it works:
          - CSS targets .stagger-container > * (all direct children)
          - Uses nth-child(n) with calc() for delay: calc(n * 0.1s)
          - Creates wave effect (top-left to bottom-right)
          
          Usage:
          - List reveals: Competitor list, route list, box grid
          - Content loading: Cards appear one by one
          - Page transitions: Elements cascade in on route change
          
          Performance:
          - Pure CSS (no JS overhead)
          - GPU accelerated (transform + opacity)
          - Runs once on mount (no infinite loops)
        */}
        <section className="mb-lg">
          <h2 className="text-2xl font-semibold mb-md">Stagger Animation</h2>
          {/* Container triggers stagger - Each child animates with increasing delay */}
          <div className="stagger-container grid grid-cols-2 gap-md">
            <div className="modern-card">Item 1</div>  {/* Delay: 0s */}
            <div className="modern-card">Item 2</div>  {/* Delay: 0.1s */}
            <div className="modern-card">Item 3</div>  {/* Delay: 0.2s */}
            <div className="modern-card">Item 4</div>  {/* Delay: 0.3s */}
            <div className="modern-card">Item 5</div>  {/* Delay: 0.4s */}
            <div className="modern-card">Item 6</div>  {/* Delay: 0.5s */}
          </div>
        </section>

        {/* 
          Glassmorphism Effect Example
          
          Modern UI technique using backdrop blur:
          - backdrop-filter: blur(10px) - Blurs content behind element
          - Transparent background (rgba with low alpha)
          - Subtle border for definition
          
          How it works:
          - Element must be semi-transparent (background: rgba(...))
          - backdrop-filter applies blur to content underneath
          - Creates frosted glass appearance
          
          Browser support:
          - Works in Chrome, Safari, Edge (95% coverage)
          - Graceful degradation: Falls back to solid background
          - Consider -webkit- prefix for older Safari
          
          Usage:
          - Modals: Blur page content behind dialog
          - Floating panels: Timer overlay, notifications
          - Headers: Sticky nav with blur effect
          
          Performance:
          - Can be expensive (blur is GPU intensive)
          - Use sparingly (1-2 elements max per view)
          - Avoid on scrolling content (causes jank)
        */}
        <section className="modern-card glass-effect mb-lg" style={{ animationDelay: '0.55s' }}>
          <h2 className="text-2xl font-semibold mb-md">Glassmorphism Effect</h2>
          <p className="text-secondary">
            This card uses backdrop-filter blur with transparent background for a modern glassmorphism look.
            Best used for modals, floating panels, or overlays where content underneath should remain visible.
          </p>
        </section>
      </div>  {/* End container */}
      {/* End page wrapper */}
    </div>
  );  // End return
};  // End ThemeDemo component

// Export for use in router (typically at /theme-demo route)
export default ThemeDemo;
