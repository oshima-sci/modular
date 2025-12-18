import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { GraphCounts } from "@/types/graph";

interface FilterPanelProps {
  counts: GraphCounts;
  showClaims: boolean;
  showObservations: boolean;
  showPremiseLinks: boolean;
  showClaimContradictsLinks: boolean;
  showSupportsLinks: boolean;
  showContradictsLinks: boolean;
  showContextualizesLinks: boolean;
  highlightContradictions: boolean;
  onToggleClaims: () => void;
  onToggleObservations: () => void;
  onTogglePremiseLinks: () => void;
  onToggleClaimContradictsLinks: () => void;
  onToggleSupportsLinks: () => void;
  onToggleContradictsLinks: () => void;
  onToggleContextualizesLinks: () => void;
  onToggleHighlightContradictions: () => void;
  onReset: () => void;
}

interface FilterCheckboxProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: () => void;
  label: string;
  count: number;
}

const FilterCheckbox: React.FC<FilterCheckboxProps> = ({
  id,
  checked,
  disabled = false,
  onCheckedChange,
  label,
  count,
}) => (
  <div className="flex items-center gap-2">
    <Checkbox
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
    <label
      htmlFor={id}
      className={`text-sm cursor-pointer ${disabled ? "text-muted-foreground" : "text-foreground"}`}
    >
      {label} ({count})
    </label>
  </div>
);

export const FilterPanel: React.FC<FilterPanelProps> = ({
  counts,
  showClaims,
  showObservations,
  showPremiseLinks,
  showClaimContradictsLinks,
  showSupportsLinks,
  showContradictsLinks,
  showContextualizesLinks,
  highlightContradictions,
  onToggleClaims,
  onToggleObservations,
  onTogglePremiseLinks,
  onToggleClaimContradictsLinks,
  onToggleSupportsLinks,
  onToggleContradictsLinks,
  onToggleContextualizesLinks,
  onToggleHighlightContradictions,
  onReset,
}) => {
  const totalContradictions = counts.claimContradictsLinks + counts.contradictsLinks;

  return (
    <Card className="absolute bottom-4 left-4 flex flex-col gap-3 p-4 min-w-[220px]">
      <div className="text-sm text-muted-foreground">
        {counts.claims} claims and {counts.observations} evidence nodes
      </div>

      {totalContradictions > 0 && (
        <Button
          size="sm"
          variant={highlightContradictions ? "default" : "destructive"}
          onClick={onToggleHighlightContradictions}
          className="w-full"
        >
          {highlightContradictions ? "Highlighting Contradictions" : "Highlight Contradictions"}{" "}
          ({totalContradictions})
        </Button>
      )}

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Filter your graph</div>

        <FilterCheckbox
          id="show-claims"
          checked={showClaims}
          disabled={counts.claims === 0}
          onCheckedChange={onToggleClaims}
          label="Claims"
          count={counts.claims}
        />

        <div className="ml-6 flex flex-col gap-1.5">
          <FilterCheckbox
            id="show-premise-links"
            checked={showPremiseLinks}
            disabled={!showClaims || highlightContradictions || counts.premiseLinks === 0}
            onCheckedChange={onTogglePremiseLinks}
            label="Premise connections"
            count={counts.premiseLinks}
          />
          <FilterCheckbox
            id="show-claim-contradicts-links"
            checked={showClaimContradictsLinks}
            disabled={!showClaims || highlightContradictions || counts.claimContradictsLinks === 0}
            onCheckedChange={onToggleClaimContradictsLinks}
            label="Contradiction connections"
            count={counts.claimContradictsLinks}
          />
        </div>

        <FilterCheckbox
          id="show-observations"
          checked={showObservations}
          disabled={counts.observations === 0}
          onCheckedChange={onToggleObservations}
          label="Evidence"
          count={counts.observations}
        />

        <div className="ml-6 flex flex-col gap-1.5">
          <FilterCheckbox
            id="show-supports-links"
            checked={showSupportsLinks}
            disabled={!showObservations || highlightContradictions || counts.supportsLinks === 0}
            onCheckedChange={onToggleSupportsLinks}
            label="Supports"
            count={counts.supportsLinks}
          />
          <FilterCheckbox
            id="show-contradicts-links"
            checked={showContradictsLinks}
            disabled={!showObservations || highlightContradictions || counts.contradictsLinks === 0}
            onCheckedChange={onToggleContradictsLinks}
            label="Contradicts"
            count={counts.contradictsLinks}
          />
          <FilterCheckbox
            id="show-contextualizes-links"
            checked={showContextualizesLinks}
            disabled={!showObservations || highlightContradictions || counts.contextualizesLinks === 0}
            onCheckedChange={onToggleContextualizesLinks}
            label="Contextualizes"
            count={counts.contextualizesLinks}
          />
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={onReset} className="w-full">
        Reset Graph
      </Button>
    </Card>
  );
};

export default FilterPanel;
