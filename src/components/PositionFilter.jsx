import { POSITION_OPTIONS, setPosition, usePosition } from "../lib/positionFilter.js";
import ViewPicker from "./ViewPicker.jsx";

// The shared position filter (lib/positionFilter.js). 2026-11-05 (user: single-choice button rows -> dropdowns): one dropdown.
export default function PositionFilter() {
  const selected = usePosition();
  return (
    <div className="vp-row">
      <ViewPicker select compact label="Position" options={POSITION_OPTIONS.map((o) => [o.key, o.label])} value={selected} onChange={setPosition} />
    </div>
  );
}
