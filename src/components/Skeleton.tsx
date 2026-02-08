import React from 'react';

/**
 * SkeletonProps - Configuration for skeleton loading placeholders
 * 
 * Prop Details:
 * - className: Additional CSS classes for custom styling (merged with base classes)
 * - variant: Shape preset (text = rounded corners, rectangular = medium rounding, circular = full circle)
 * - width: Size in px (number) or CSS unit (string); omit for full-width via parent
 * - height: Size in px (number) or CSS unit (string); omit for default line height
 * - count: Number of repeated elements (1-10 typical); renders as array if >1
 * 
 * Usage Examples:
 * - <Skeleton variant="text" height={20} className="w-1/3" /> → Text line 20px tall, 33% width
 * - <Skeleton variant="circular" width={40} height={40} /> → Avatar placeholder 40x40px
 * - <Skeleton variant="rectangular" height={200} className="w-full" /> → Image placeholder full width
 * - <Skeleton variant="text" count={3} /> → 3 text lines stacked vertically
 */
interface SkeletonProps {
  className?: string;  // Tailwind classes or custom CSS (e.g., "w-full mb-2")
  variant?: 'text' | 'rectangular' | 'circular';  // Shape preset affects border-radius
  width?: string | number;  // Explicit width (overrides className width if both present)
  height?: string | number;  // Explicit height (overrides className height if both present)
  count?: number;  // Render N skeletons (1 returns single element, >1 returns fragment)
}

/**
 * Skeleton Component - Shimmer Loading Placeholder
 * 
 * Purpose:
 * - Show placeholder UI while content loads (prevents layout shift)
 * - Provides visual feedback that data is being fetched
 * - Maintains perceived performance (user sees structure immediately)
 * - Improves UX over spinners for content-heavy pages
 * 
 * Animation:
 * - Tailwind's animate-pulse: Fades between 100% and 50% opacity (2s cycle)
 * - GPU accelerated (transform/opacity) for smooth 60fps animation
 * - Pauses on prefers-reduced-motion for accessibility
 * 
 * Variants:
 * - text: Rounded corners (4px), use for text lines, labels, headings
 * - rectangular: Medium rounding (6px), use for cards, images, buttons
 * - circular: Full circle (border-radius: 9999px), use for avatars, icons
 * 
 * Color Scheme:
 * - Light mode: bg-gray-200 (subtle contrast on white backgrounds)
 * - Dark mode: bg-gray-700 (visible on dark backgrounds)
 * - Color chosen to be non-distracting while clearly indicating loading
 * 
 * Layout Considerations:
 * - Width: Use Tailwind width classes (w-full, w-1/2, w-32) for responsive sizing
 * - Height: Pass explicit height prop for precise vertical spacing
 * - Spacing: Apply margin classes (mb-2, mt-4) to match actual content spacing
 * - Grouping: Wrap multiple skeletons in containers to match final layout
 * 
 * Accessibility:
 * - No ARIA labels needed (purely decorative during load)
 * - Page-level skeletons should include sr-only "Loading..." text
 * - Content replacement should maintain focus management (no focus lost on load)
 * 
 * Performance:
 * - Lightweight: No JavaScript overhead (pure CSS animation)
 * - Efficient rendering: Count prop creates array with single loop
 * - Memoization not needed: Component renders once until data arrives
 */
const Skeleton: React.FC<SkeletonProps> = ({
  className = '',  // Additional CSS classes (merged after base + variant)
  variant = 'rectangular',  // Default to medium rounding (most versatile)
  width,  // Optional explicit width (in px or CSS unit)
  height,  // Optional explicit height (in px or CSS unit)
  count = 1,  // Single element by default
}) => {
  // Base animation + color classes (applied to all variants)
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700';

  // Border radius mapping for each variant
  const variantClasses = {
    text: 'rounded',  // 4px - subtle rounding for text lines
    rectangular: 'rounded-md',  // 6px - medium rounding for cards/images
    circular: 'rounded-full',  // 9999px - perfect circles for avatars
  };

  // Convert numeric dimensions to px units (strings pass through)
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,  // 40 → "40px", "100%" → "100%"
    height: typeof height === 'number' ? `${height}px` : height,  // 20 → "20px", "auto" → "auto"
  };

  // Generate array of skeleton elements (count > 1 creates multiple placeholders)
  const elements = Array.from({ length: count }, (_, i) => (
    <div
      key={i}  // Unique key for each skeleton in array
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}  // Merge all classes
      style={style}  // Apply explicit dimensions if provided
    />
  ));

  // Return single element unwrapped (count=1) or fragment for multiple (count>1)
  return count === 1 ? elements[0] : <>{elements}</>;
};

/**
 * CardSkeleton - Placeholder for Card-Style Content
 * 
 * Purpose:
 * - Mimics typical card structure: title (1 line) + body text (2-3 lines)
 * - Use while loading competitor cards, route info, admin settings panels
 * 
 * Visual Structure:
 * - Container: Light background (gray-100/800), rounded corners, padding
 * - Title line: 20px tall, 33% width (short heading)
 * - Body line 1: 16px tall, full width (complete sentence)
 * - Body line 2: 16px tall, 66% width (partial sentence, natural text wrap)
 * 
 * Spacing:
 * - mb-3: 12px gap after title (visual hierarchy)
 * - mb-2: 8px gap between body lines (line height simulation)
 * 
 * Usage:
 * - <CardSkeleton /> → Default card placeholder
 * - <CardSkeleton className="min-h-[200px]" /> → Taller card variant
 */
export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 p-4 ${className}`}>
    {/* Title line - Short width suggests heading */}
    <Skeleton variant="text" height={20} className="w-1/3 mb-3" />
    {/* Body line 1 - Full width paragraph line */}
    <Skeleton variant="text" height={16} className="w-full mb-2" />
    {/* Body line 2 - Partial width (natural text wrap effect) */}
    <Skeleton variant="text" height={16} className="w-2/3" />
  </div>
);

/**
 * TableRowSkeleton - Placeholder for Tabular Data Row
 * 
 * Purpose:
 * - Mimics table row with multiple columns
 * - Use while loading competitor lists, rankings, audit logs
 * 
 * Column Layout:
 * - First column: Fixed 32px width (typically row number or icon)
 * - Remaining columns: flex-1 (equal width distribution)
 * - Gap: 16px between columns
 * 
 * Vertical Spacing:
 * - py-3: 12px top/bottom padding (matches table row height)
 * 
 * Customization:
 * - columns prop: Adjust column count (default 4)
 * - className: Add borders, background, hover states
 * 
 * Usage:
 * - <TableRowSkeleton columns={3} /> → 3-column row (rank, name, score)
 * - <TableRowSkeleton columns={5} className="border-b" /> → 5 columns with bottom border
 */
export const TableRowSkeleton: React.FC<{ columns?: number; className?: string }> = ({
  columns = 4,  // Default 4 columns (typical table structure)
  className = '',
}) => (
  <div className={`flex gap-4 py-3 ${className}`}>
    {/* Generate N columns with first column narrower (row number) */}
    {Array.from({ length: columns }, (_, i) => (
      <Skeleton
        key={i}
        variant="text"
        height={16}  // Standard text line height
        className={i === 0 ? 'w-8' : 'flex-1'}  // First col fixed 32px, rest equal width
      />
    ))}
  </div>
);

/**
 * RankingsSkeleton - Placeholder for Leaderboard/Rankings List
 * 
 * Purpose:
 * - Mimics ranked list structure: position indicator + name + score
 * - Use while loading rankings, competitor queues, route lists
 * 
 * Row Structure (left to right):
 * - Avatar/Rank circle: 32x32px circular placeholder (position badge or avatar)
 * - Name/Label: flex-1 text line (competitor name, route name)
 * - Score/Value: 60px fixed width text line (score, time, holds)
 * 
 * Vertical Spacing:
 * - space-y-2: 8px gap between rows (compact list)
 * - py-2: 8px top/bottom padding per row (touch-friendly targets)
 * 
 * Alignment:
 * - items-center: Vertical center alignment (circle + text baselines match)
 * - gap-3: 12px horizontal spacing between elements
 * 
 * Customization:
 * - rows prop: Number of placeholder rows (default 5, adjust for viewport)
 * 
 * Usage:
 * - <RankingsSkeleton rows={10} /> → Top 10 leaderboard
 * - <RankingsSkeleton rows={3} /> → Podium preview (top 3 only)
 */
export const RankingsSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-2">  {/* Vertical stack with 8px gaps */}
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 py-2">  {/* Single ranking row */}
        {/* Position circle - Avatar or rank badge placeholder */}
        <Skeleton variant="circular" width={32} height={32} />
        {/* Competitor name - Flexible width takes remaining space */}
        <Skeleton variant="text" height={18} className="flex-1" />
        {/* Score value - Fixed width for right-aligned scores */}
        <Skeleton variant="text" width={60} height={18} />
      </div>
    ))}
  </div>
);

/**
 * BoxCardSkeleton - Placeholder for Control Panel Box Card
 * 
 * Purpose:
 * - Mimics multi-box admin control panel card structure
 * - Use while loading box states, route configurations, competitor queues
 * 
 * Card Structure (top to bottom):
 * 1. Header: Box name (120px) + status icon (40px circle)
 * 2. Timer area: Large timer display (160x48px centered)
 * 3. Current climber: Label + name (2 lines)
 * 4. Holds counter: Label + value display (horizontal pair)
 * 5. Action buttons: 2 equal-width buttons (Start/Stop, Submit)
 * 
 * Spacing:
 * - p-5: 20px padding around entire card
 * - space-y-4: 16px vertical gaps between sections
 * - py-4: Extra vertical space around timer (visual emphasis)
 * - gap-2: 8px gap between action buttons
 * 
 * Visual Hierarchy:
 * - Rounded corners (rounded-xl = 12px) for modern card look
 * - Timer centered + larger (most important element)
 * - Buttons at bottom (primary actions)
 * 
 * Usage:
 * - Rendered in grid layout (3 columns on desktop)
 * - Each card represents one climbing box/route
 * - Placeholder until box state WebSocket connects
 */
export const BoxCardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800 p-5 space-y-4">
      {/* Header - Box name left, status indicator right */}
      <div className="flex justify-between items-center">
        <Skeleton variant="text" width={120} height={24} />  {/* Box name (e.g., "Box 1 - Youth") */}
        <Skeleton variant="circular" width={40} height={40} />  {/* Status dot (green/orange/red) */}
      </div>

      {/* Timer area - Centered large display for visibility */}
      <div className="flex justify-center py-4">
        <Skeleton variant="rectangular" width={160} height={48} className="rounded-lg" />  {/* Timer: "05:30" */}
      </div>

      {/* Current climber section - Label + name */}
      <div className="space-y-2">
        <Skeleton variant="text" width={100} height={14} />  {/* Label: "Current Climber:" */}
        <Skeleton variant="text" className="w-full" height={20} />  {/* Climber name (variable length) */}
      </div>

      {/* Holds counter - Label left, value right */}
      <div className="flex justify-between items-center py-2">
        <Skeleton variant="text" width={80} height={16} />  {/* Label: "Holds:" */}
        <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />  {/* Counter: "15 / 25" */}
      </div>

      {/* Action buttons - Equal width side by side */}
      <div className="flex gap-2 pt-2">
        <Skeleton variant="rectangular" height={40} className="flex-1 rounded-lg" />  {/* Start/Stop timer */}
        <Skeleton variant="rectangular" height={40} className="flex-1 rounded-lg" />  {/* Submit score */}
      </div>

      {/* End BoxCardSkeleton */}
    </div>
  );
};

/**
 * JudgePageSkeleton - Placeholder for Mobile Judge Scoring Interface
 * 
 * Purpose:
 * - Mimics touch-optimized judge scoring page layout
 * - Use while loading box state, competitor queue, timer sync
 * 
 * Page Structure (top to bottom):
 * 1. Header: Route name + category (centered, 2 lines)
 * 2. Timer: Large display (200x80px) with extra vertical space
 * 3. Current climber card: Name, club, holds info
 * 4. Hold adjustment buttons: Plus/Minus grid (2 columns, large tap targets)
 * 5. Action buttons: Submit score + other actions (full-width stacked)
 * 
 * Layout Constraints:
 * - max-w-2xl: 672px max width (readable on tablets, not too wide)
 * - mx-auto: Horizontally centered
 * - p-4: 16px padding (safe area for mobile notches)
 * 
 * Spacing:
 * - space-y-6: 24px gaps between major sections (visual breathing room)
 * - space-y-3: 12px gaps within sections (related content grouping)
 * - py-8: 32px vertical space around timer (most prominent element)
 * 
 * Accessibility:
 * - sr-only "Loading..." announces loading state to screen readers
 * - Large button skeletons (56px, 80px height) match touch targets
 * 
 * Usage:
 * - Shown while WebSocket connects to box
 * - Replaced with live JudgePage once state arrives
 */
export const JudgePageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
    {/* Screen reader loading announcement */}
    <span className="sr-only">Loading…</span>
    <div className="max-w-2xl mx-auto space-y-6">  {/* Centered content container */}
      {/* Header - Route and category centered */}
      <div className="text-center space-y-2">
        <Skeleton variant="text" width={200} height={32} className="mx-auto" />  {/* Route name */}
        <Skeleton variant="text" width={150} height={20} className="mx-auto" />  {/* Category (Youth, Seniors) */}
      </div>

      {/* Timer - Large display with emphasis spacing */}
      <div className="flex justify-center py-8">
        <Skeleton variant="rectangular" width={200} height={80} className="rounded-2xl" />  {/* Timer: "05:30" */}
      </div>

      {/* Current climber card - Reuses CardSkeleton (name, club, info) */}
      <CardSkeleton className="bg-white dark:bg-gray-800" />

      {/* Hold adjustment buttons - 2x2 grid for +/- controls */}
      <div className="grid grid-cols-2 gap-4 py-4">
        <Skeleton variant="rectangular" height={80} className="rounded-xl" />  {/* Plus button (add hold) */}
        <Skeleton variant="rectangular" height={80} className="rounded-xl" />  {/* Minus button (subtract hold) */}
      </div>

      {/* Action buttons - Stacked full-width (submit, reset, etc.) */}
      <div className="space-y-3">
        <Skeleton variant="rectangular" height={56} className="rounded-xl" />  {/* Submit score (primary) */}
        <Skeleton variant="rectangular" height={56} className="rounded-xl" />  {/* Secondary action */}
      </div>
    </div>  {/* End content container */}

    {/* End page wrapper */}
  </div>
);

/**
 * ContestPageSkeleton - Placeholder for Public Contest Display
 * 
 * Purpose:
 * - Mimics large-screen public display layout (projected for spectators)
 * - Use while loading live contest state, rankings, current climber
 * 
 * Page Structure (top to bottom):
 * 1. Header: Route name + category (centered, large text)
 * 2. Timer: Huge display (280x120px) for visibility from distance
 * 3. Current competitor card: Who's climbing, holds completed, progress
 * 4. Rankings preview: Top 3-5 competitors (leaderboard)
 * 
 * Visual Design:
 * - Dark gradient background (gray-900 → gray-800) reduces eye strain
 * - Large spacing (space-y-8 = 32px gaps) for readability at distance
 * - Prominent timer (120px height) is focal point
 * - Card backgrounds (gray-800) provide contrast on dark gradient
 * 
 * Layout Constraints:
 * - max-w-4xl: 896px max width (readable on HD displays)
 * - mx-auto: Horizontally centered
 * - p-6: 24px padding (safe area for projector edges)
 * 
 * Accessibility:
 * - sr-only "Loading..." for screen readers (though typically not used on public display)
 * - High contrast text ensures visibility in bright rooms
 * 
 * Usage:
 * - Shown while WebSocket connects to box for live updates
 * - Replaced with live ContestPage once state broadcast arrives
 */
export const ContestPageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
    {/* Screen reader loading announcement */}
    <span className="sr-only">Loading…</span>
    <div className="max-w-4xl mx-auto space-y-8">  {/* Centered content container */}
      {/* Header - Route name and category centered */}
      <div className="text-center space-y-3">
        <Skeleton variant="text" width={300} height={40} className="mx-auto bg-gray-700" />  {/* Route name (large) */}
        <Skeleton variant="text" width={200} height={24} className="mx-auto bg-gray-700" />  {/* Category */}
      </div>

      {/* Timer display - Extra large for visibility at distance */}
      <div className="flex justify-center py-6">
        <Skeleton variant="rectangular" width={280} height={120} className="rounded-2xl bg-gray-700" />  {/* Timer: "05:30" */}
      </div>

      {/* Current competitor card - Who's climbing now */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <Skeleton variant="text" width={100} height={16} className="bg-gray-700" />  {/* Label: "Now Climbing:" */}
        <Skeleton variant="text" className="w-full bg-gray-700" height={32} />  {/* Climber name (large, prominent) */}
        <div className="flex justify-between pt-2">  {/* Progress indicators */}
          <Skeleton variant="text" width={80} height={20} className="bg-gray-700" />  {/* Holds: "15/25" */}
          <Skeleton variant="text" width={60} height={20} className="bg-gray-700" />  {/* Score: "85" */}
        </div>
      </div>

      {/* Rankings preview - Top 3 leaderboard */}
      <div className="bg-gray-800 rounded-xl p-6">
        <Skeleton variant="text" width={120} height={20} className="bg-gray-700 mb-4" />  {/* "Top Rankings" */}
        <RankingsSkeleton rows={3} />  {/* Top 3 competitors */}
      </div>
    </div>  {/* End content container */}

    {/* End page wrapper */}
  </div>
);

/**
 * ControlPanelSkeleton - Placeholder for Admin Multi-Box Control Panel
 * 
 * Purpose:
 * - Mimics admin dashboard layout with multiple box cards
 * - Use while loading initial box states, WebSocket connections initializing
 * 
 * Page Structure:
 * 1. Header bar: Page title left, action buttons right (export, settings)
 * 2. Box cards grid: Responsive 1/2/3 columns based on screen width
 * 
 * Grid Layout:
 * - Mobile: 1 column (full width, stacked vertically)
 * - Tablet (md): 2 columns (side-by-side pairs)
 * - Desktop (lg): 3 columns (optimal for HD/4K displays)
 * - gap-6: 24px spacing between cards (breathing room)
 * 
 * Header Layout:
 * - justify-between: Title left, buttons right (standard dashboard header)
 * - mb-6: 24px gap below header (separates from content)
 * - Buttons: 100px width each, 36px height (compact but clickable)
 * 
 * Accessibility:
 * - sr-only "Loading..." announces loading state
 * - Skeleton maintains layout (prevents shift when cards load)
 * 
 * Usage:
 * - Shown on initial page load before box states fetch
 * - Each BoxCardSkeleton replaced with live BoxCard once WebSocket connects
 * - Typically shows 3 cards (Youth, Seniors, Adults boxes)
 */
export const ControlPanelSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
    {/* Screen reader loading announcement */}
    <span className="sr-only">Loading…</span>
    {/* Header bar - Title and action buttons */}
    <div className="flex justify-between items-center mb-6">
      <Skeleton variant="text" width={200} height={32} />  {/* Page title: "Control Panel" */}
      <div className="flex gap-2">  {/* Action buttons group */}
        <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />  {/* Export button */}
        <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />  {/* Settings button */}
      </div>
    </div>

    {/* Box cards grid - Responsive columns (1 mobile, 2 tablet, 3 desktop) */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <BoxCardSkeleton />  {/* Box 0 - Youth */}
      <BoxCardSkeleton />  {/* Box 1 - Seniors */}
      <BoxCardSkeleton />  {/* Box 2 - Adults */}
    </div>

    {/* End page wrapper */}
  </div>
);

/**
 * RankingsPageSkeleton - Placeholder for Dual-Column Rankings Display
 * 
 * Purpose:
 * - Mimics split-screen rankings layout (2 categories side-by-side)
 * - Use while loading live rankings data for multiple boxes
 * 
 * Page Structure:
 * - 2-column grid (50/50 split)
 * - Each column: Info bar (filters/labels) + rankings list card
 * 
 * Left Column:
 * - Info badges: Category badge + timer badge + other metadata (rounded pills)
 * - Rankings card: Dark background with 8 placeholder rows
 * 
 * Right Column:
 * - Same structure as left (mirrors for visual balance)
 * 
 * Layout Details:
 * - grid-cols-2: Equal width columns (50% each)
 * - gap-4: 16px gap between columns (subtle separation)
 * - h-full: Full viewport height (rankings fill screen)
 * 
 * Visual Design:
 * - bg-gray-900: Dark background (reduces eye strain for long viewing)
 * - bg-gray-800: Card backgrounds (contrast against page background)
 * - bg-gray-700: Skeleton lines (visible on card backgrounds)
 * - Rounded badges (rounded-full) at top for category labels
 * 
 * Accessibility:
 * - sr-only "Loading..." announces state
 * - High contrast for visibility at distance
 * 
 * Usage:
 * - Public rankings display (projected for spectators)
 * - Shows 2 categories simultaneously (Youth + Seniors, or similar)
 * - Replaced with live RankingsPage once WebSocket data arrives
 */
export const RankingsPageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-900 p-4">
    {/* Screen reader loading announcement */}
    <span className="sr-only">Loading…</span>
    <div className="grid grid-cols-2 gap-4 h-full">  {/* 2-column layout */}
      {/* Left column - First category (e.g., Youth) */}
      <div className="space-y-4">
        {/* Info bar - Category badges and metadata */}
        <div className="flex gap-2">
          <Skeleton variant="rectangular" width={100} height={28} className="rounded-full bg-gray-800" />  {/* Category: "Youth" */}
          <Skeleton variant="rectangular" width={120} height={28} className="rounded-full bg-gray-800" />  {/* Timer status */}
          <Skeleton variant="rectangular" width={80} height={28} className="rounded-full bg-gray-800" />  {/* Other info */}
        </div>

        {/* Rankings card - Top 8 competitors */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">  {/* Single ranking row */}
              <Skeleton variant="text" width={24} height={20} className="bg-gray-700" />  {/* Rank number */}
              <Skeleton variant="text" className="flex-1 bg-gray-700" height={20} />  {/* Competitor name */}
              <Skeleton variant="text" width={50} height={20} className="bg-gray-700" />  {/* Score */}
            </div>
          ))}
        </div>
      </div>

      {/* Right column - Second category (e.g., Seniors) */}
      <div className="space-y-4">
        {/* Info bar - Category badges */}
        <div className="flex gap-2">
          <Skeleton variant="rectangular" width={100} height={28} className="rounded-full bg-gray-800" />  {/* Category: "Seniors" */}
          <Skeleton variant="rectangular" width={120} height={28} className="rounded-full bg-gray-800" />  {/* Timer status */}
        </div>

        {/* Rankings card - Top 8 competitors */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">  {/* Single ranking row */}
              <Skeleton variant="text" width={24} height={20} className="bg-gray-700" />  {/* Rank number */}
              <Skeleton variant="text" className="flex-1 bg-gray-700" height={20} />  {/* Competitor name */}
              <Skeleton variant="text" width={50} height={20} className="bg-gray-700" />  {/* Score */}
            </div>
          ))}
        </div>
      </div>
    </div>  {/* End grid */}

    {/* End page wrapper */}
  </div>
);

// Default export: Base Skeleton component for custom compositions
// Named exports: Pre-built skeleton variants for common page layouts
export default Skeleton;
