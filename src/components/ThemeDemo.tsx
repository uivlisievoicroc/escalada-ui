import React from 'react';
import '../styles/animations.css';
import '../styles/utilities.css';

/**
 * Demo Component - Showcases Modern Dark Theme
 * Remove this file after implementation is complete
 */
const ThemeDemo: React.FC = () => {
  return (
    <div style={{ padding: '40px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div className="container">
        <h1 className="text-3xl font-bold mb-lg fade-in-down">
          🎨 Modern Dark Theme - Demo
        </h1>

        {/* Color Palette */}
        <section className="modern-card mb-lg fade-in-up">
          <h2 className="text-2xl font-semibold mb-md">Color Palette</h2>
          <div className="grid grid-cols-4 gap-md">
            <div>
              <div style={{ background: 'var(--accent-primary)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Primary</p>
            </div>
            <div>
              <div style={{ background: 'var(--accent-success)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Success</p>
            </div>
            <div>
              <div style={{ background: 'var(--accent-warning)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Warning</p>
            </div>
            <div>
              <div style={{ background: 'var(--accent-danger)', height: '80px', borderRadius: 'var(--radius-md)' }}></div>
              <p className="text-sm mt-sm text-center">Danger</p>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-semibold mb-md">Buttons</h2>
          <div className="flex flex-wrap gap-md mb-md">
            <button className="modern-btn">Default</button>
            <button className="modern-btn modern-btn-primary">Primary</button>
            <button className="modern-btn modern-btn-success">Success</button>
            <button className="modern-btn modern-btn-warning">Warning</button>
            <button className="modern-btn modern-btn-danger">Danger</button>
            <button className="modern-btn modern-btn-ghost">Ghost</button>
          </div>
          <div className="flex flex-wrap gap-md items-center">
            <button className="modern-btn modern-btn-sm modern-btn-primary">Small</button>
            <button className="modern-btn modern-btn-primary">Medium</button>
            <button className="modern-btn modern-btn-lg modern-btn-primary">Large</button>
            <button className="modern-btn modern-btn-icon">🔥</button>
          </div>
        </section>

        {/* Cards */}
        <section className="mb-lg">
          <h2 className="text-2xl font-semibold mb-md">Cards</h2>
          <div className="grid grid-cols-3 gap-lg">
            <div className="modern-card hover-lift fade-in-up" style={{ animationDelay: '0.15s' }}>
              <div className="flex items-center gap-sm mb-md">
                <span className="status-dot status-dot-success"></span>
                <h3 className="text-xl font-semibold">Active</h3>
              </div>
              <p className="text-secondary">This is a modern card with hover lift effect.</p>
            </div>
            <div className="modern-card hover-lift fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-sm mb-md">
                <span className="status-dot status-dot-warning"></span>
                <h3 className="text-xl font-semibold">Warning</h3>
              </div>
              <p className="text-secondary">Card with warning status indicator.</p>
            </div>
            <div className="modern-card modern-card-highlighted hover-lift fade-in-up" style={{ animationDelay: '0.25s' }}>
              <div className="flex items-center gap-sm mb-md">
                <span className="status-dot status-dot-success"></span>
                <h3 className="text-xl font-semibold">Highlighted</h3>
              </div>
              <p className="text-secondary">This card is highlighted with accent colors.</p>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-2xl font-semibold mb-md">Badges</h2>
          <div className="flex flex-wrap gap-md">
            <span className="modern-badge modern-badge-success">✓ Completed</span>
            <span className="modern-badge modern-badge-warning">⚠ Warning</span>
            <span className="modern-badge modern-badge-danger">✕ Error</span>
            <span className="modern-badge modern-badge-info">ℹ Info</span>
            <span className="modern-badge modern-badge-neutral">Neutral</span>
          </div>
        </section>

        {/* Inputs */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.35s' }}>
          <h2 className="text-2xl font-semibold mb-md">Input Fields</h2>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="text-sm text-secondary mb-sm" style={{ display: 'block' }}>Normal Input</label>
              <input className="modern-input" placeholder="Enter your name..." />
            </div>
            <div>
              <label className="text-sm text-secondary mb-sm" style={{ display: 'block' }}>Error State</label>
              <input className="modern-input modern-input-error" placeholder="Error input" />
            </div>
          </div>
        </section>

        {/* Loading States */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.4s' }}>
          <h2 className="text-2xl font-semibold mb-md">Loading States</h2>
          <div className="flex items-center gap-xl">
            <div>
              <p className="text-sm text-secondary mb-sm">Spinner</p>
              <div className="spinner"></div>
            </div>
            <div style={{ flex: 1 }}>
              <p className="text-sm text-secondary mb-sm">Skeleton</p>
              <div className="skeleton skeleton-text mb-sm"></div>
              <div className="skeleton skeleton-text" style={{ width: '80%' }}></div>
            </div>
            <div>
              <p className="text-sm text-secondary mb-sm">Pulse</p>
              <div className="pulse" style={{ 
                width: '60px', 
                height: '60px', 
                background: 'var(--accent-primary)', 
                borderRadius: 'var(--radius-md)' 
              }}></div>
            </div>
          </div>
        </section>

        {/* Timer Example */}
        <section className="modern-card text-center glass-effect fade-in-up" style={{ animationDelay: '0.45s' }}>
          <h2 className="text-2xl font-semibold mb-lg">Timer Display Example</h2>
          <div className="text-6xl font-bold mb-md" style={{ 
            color: 'var(--accent-primary)',
            textShadow: '0 0 20px rgba(0, 217, 255, 0.5)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-2px'
          }}>
            05<span className="blink">:</span>30<span className="blink">:</span>00
          </div>
          <div className="flex items-center justify-center gap-md">
            <span className="status-dot status-dot-success"></span>
            <span className="text-sm text-secondary font-semibold" style={{ letterSpacing: '2px' }}>RUNNING</span>
          </div>
        </section>

        {/* Animation Examples */}
        <section className="modern-card mb-lg fade-in-up" style={{ animationDelay: '0.5s' }}>
          <h2 className="text-2xl font-semibold mb-md">Interactive Elements</h2>
          <div className="grid grid-cols-3 gap-md">
            <button className="modern-btn modern-btn-primary btn-press-effect">
              Press Effect
            </button>
            <div className="modern-card hover-lift text-center">
              <p className="text-sm">Hover Lift</p>
            </div>
            <div className="modern-card hover-scale text-center">
              <p className="text-sm">Hover Scale</p>
            </div>
          </div>
        </section>

        {/* Stagger Animation Example */}
        <section className="mb-lg">
          <h2 className="text-2xl font-semibold mb-md">Stagger Animation</h2>
          <div className="stagger-container grid grid-cols-2 gap-md">
            <div className="modern-card">Item 1</div>
            <div className="modern-card">Item 2</div>
            <div className="modern-card">Item 3</div>
            <div className="modern-card">Item 4</div>
            <div className="modern-card">Item 5</div>
            <div className="modern-card">Item 6</div>
          </div>
        </section>

        {/* Glass Effect */}
        <section className="modern-card glass-effect mb-lg" style={{ animationDelay: '0.55s' }}>
          <h2 className="text-2xl font-semibold mb-md">Glassmorphism Effect</h2>
          <p className="text-secondary">
            This card uses backdrop-filter blur with transparent background for a modern glassmorphism look.
          </p>
        </section>
      </div>
    </div>
  );
};

export default ThemeDemo;
