import * as React from "react";

interface EvidenceDistributionBarProps {
  counts: {
    supports: number;
    contradicts: number;
    contextualizes: number;
    total: number;
  };
}

export const EvidenceDistributionBar: React.FC<EvidenceDistributionBarProps> = ({ counts }) => {
  if (counts.total === 0) return null;

  return (
    <div className="flex-1 flex flex-col gap-1">
      <div className="flex flex-row gap-2 items-center">

        {/* Total count badge */}
        <div className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
            {counts.total}
        </div>

        {/* Distribution Bar */}
        <div className="w-full h-2 rounded-full overflow-hidden flex">
          {counts.supports > 0 && (
            <div
              className="bg-green-500 h-full"
              style={{ width: `${(counts.supports / counts.total) * 100}%` }}
            />
          )}
          {counts.contradicts > 0 && (
            <div
              className="bg-red-500 h-full"
              style={{ width: `${(counts.contradicts / counts.total) * 100}%` }}
            />
          )}
          {counts.contextualizes > 0 && (
            <div
              className="bg-gray-400 h-full"
              style={{ width: `${(counts.contextualizes / counts.total) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 ml-1 text-[10px] text-gray-500">
        {counts.supports > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {counts.supports} supporting
          </span>
        )}
        {counts.contradicts > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {counts.contradicts} contradicting
          </span>
        )}
        {counts.contextualizes > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            {counts.contextualizes} context
          </span>
        )}
      </div>
    </div>
  );
};
