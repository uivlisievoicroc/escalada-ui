import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  count?: number;
}

/**
 * Skeleton loading placeholder component.
 * Provides visual feedback while content is loading.
 */
const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  count = 1,
}) => {
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700';

  const variantClasses = {
    text: 'rounded',
    rectangular: 'rounded-md',
    circular: 'rounded-full',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  const elements = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  ));

  return count === 1 ? elements[0] : <>{elements}</>;
};

/**
 * Skeleton for a card-like container
 */
export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 p-4 ${className}`}>
    <Skeleton variant="text" height={20} className="w-1/3 mb-3" />
    <Skeleton variant="text" height={16} className="w-full mb-2" />
    <Skeleton variant="text" height={16} className="w-2/3" />
  </div>
);

/**
 * Skeleton for a table row
 */
export const TableRowSkeleton: React.FC<{ columns?: number; className?: string }> = ({
  columns = 4,
  className = '',
}) => (
  <div className={`flex gap-4 py-3 ${className}`}>
    {Array.from({ length: columns }, (_, i) => (
      <Skeleton
        key={i}
        variant="text"
        height={16}
        className={i === 0 ? 'w-8' : 'flex-1'}
      />
    ))}
  </div>
);

/**
 * Skeleton for rankings/leaderboard
 */
export const RankingsSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 py-2">
        <Skeleton variant="circular" width={32} height={32} />
        <Skeleton variant="text" height={18} className="flex-1" />
        <Skeleton variant="text" width={60} height={18} />
      </div>
    ))}
  </div>
);

/**
 * Skeleton for control panel box card
 */
export const BoxCardSkeleton: React.FC = () => (
  <div className="animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800 p-5 space-y-4">
    {/* Header */}
    <div className="flex justify-between items-center">
      <Skeleton variant="text" width={120} height={24} />
      <Skeleton variant="circular" width={40} height={40} />
    </div>

    {/* Timer area */}
    <div className="flex justify-center py-4">
      <Skeleton variant="rectangular" width={160} height={48} className="rounded-lg" />
    </div>

    {/* Current climber */}
    <div className="space-y-2">
      <Skeleton variant="text" width={100} height={14} />
      <Skeleton variant="text" className="w-full" height={20} />
    </div>

    {/* Holds counter */}
    <div className="flex justify-between items-center py-2">
      <Skeleton variant="text" width={80} height={16} />
      <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />
    </div>

    {/* Action buttons */}
    <div className="flex gap-2 pt-2">
      <Skeleton variant="rectangular" height={40} className="flex-1 rounded-lg" />
      <Skeleton variant="rectangular" height={40} className="flex-1 rounded-lg" />
    </div>
  </div>
);

/**
 * Skeleton for judge page
 */
export const JudgePageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
    <span className="sr-only">Loading…</span>
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <Skeleton variant="text" width={200} height={32} className="mx-auto" />
        <Skeleton variant="text" width={150} height={20} className="mx-auto" />
      </div>

      {/* Timer */}
      <div className="flex justify-center py-8">
        <Skeleton variant="rectangular" width={200} height={80} className="rounded-2xl" />
      </div>

      {/* Current climber card */}
      <CardSkeleton className="bg-white dark:bg-gray-800" />

      {/* Hold buttons */}
      <div className="grid grid-cols-2 gap-4 py-4">
        <Skeleton variant="rectangular" height={80} className="rounded-xl" />
        <Skeleton variant="rectangular" height={80} className="rounded-xl" />
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <Skeleton variant="rectangular" height={56} className="rounded-xl" />
        <Skeleton variant="rectangular" height={56} className="rounded-xl" />
      </div>
    </div>
  </div>
);

/**
 * Skeleton for contest page (public display)
 */
export const ContestPageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
    <span className="sr-only">Loading…</span>
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <Skeleton variant="text" width={300} height={40} className="mx-auto bg-gray-700" />
        <Skeleton variant="text" width={200} height={24} className="mx-auto bg-gray-700" />
      </div>

      {/* Timer display */}
      <div className="flex justify-center py-6">
        <Skeleton variant="rectangular" width={280} height={120} className="rounded-2xl bg-gray-700" />
      </div>

      {/* Current competitor */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <Skeleton variant="text" width={100} height={16} className="bg-gray-700" />
        <Skeleton variant="text" className="w-full bg-gray-700" height={32} />
        <div className="flex justify-between pt-2">
          <Skeleton variant="text" width={80} height={20} className="bg-gray-700" />
          <Skeleton variant="text" width={60} height={20} className="bg-gray-700" />
        </div>
      </div>

      {/* Rankings preview */}
      <div className="bg-gray-800 rounded-xl p-6">
        <Skeleton variant="text" width={120} height={20} className="bg-gray-700 mb-4" />
        <RankingsSkeleton rows={3} />
      </div>
    </div>
  </div>
);

/**
 * Skeleton for control panel (admin view)
 */
export const ControlPanelSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
    <span className="sr-only">Loading…</span>
    {/* Header */}
    <div className="flex justify-between items-center mb-6">
      <Skeleton variant="text" width={200} height={32} />
      <div className="flex gap-2">
        <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />
        <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />
      </div>
    </div>

    {/* Box cards grid */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <BoxCardSkeleton />
      <BoxCardSkeleton />
      <BoxCardSkeleton />
    </div>
  </div>
);

/**
 * Skeleton for rankings page
 */
export const RankingsPageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-900 p-4">
    <span className="sr-only">Loading…</span>
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Left column */}
      <div className="space-y-4">
        {/* Info bar */}
        <div className="flex gap-2">
          <Skeleton variant="rectangular" width={100} height={28} className="rounded-full bg-gray-800" />
          <Skeleton variant="rectangular" width={120} height={28} className="rounded-full bg-gray-800" />
          <Skeleton variant="rectangular" width={80} height={28} className="rounded-full bg-gray-800" />
        </div>

        {/* Rankings */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton variant="text" width={24} height={20} className="bg-gray-700" />
              <Skeleton variant="text" className="flex-1 bg-gray-700" height={20} />
              <Skeleton variant="text" width={50} height={20} className="bg-gray-700" />
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton variant="rectangular" width={100} height={28} className="rounded-full bg-gray-800" />
          <Skeleton variant="rectangular" width={120} height={28} className="rounded-full bg-gray-800" />
        </div>

        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton variant="text" width={24} height={20} className="bg-gray-700" />
              <Skeleton variant="text" className="flex-1 bg-gray-700" height={20} />
              <Skeleton variant="text" width={50} height={20} className="bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default Skeleton;
