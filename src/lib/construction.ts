// Reference lists used to power the "pick from a list, or just type your
// own" combo boxes on the submittal form (Division and Subcontractor /
// Party). Both are backed by an HTML <datalist>, which is what gives that
// exact behavior natively — it suggests these options as you type but
// never blocks free text, since plenty of real projects don't fit either
// list perfectly (a non-CSI spec, a trade that goes by a different name
// locally, a vendor with no obvious category).

// The 35 CSI MasterFormat 2016 divisions actually in use (the standard
// skips several reserved numbers — 15-20, 24, 29-30, 36-39, 47, 49 — which
// aren't included here since nothing is ever filed under them). This is a
// broad, division-level list for hand-picking on a submittal you're
// creating yourself; a submittal created from the Specifications registry
// gets its exact section-level code/title carried over automatically
// instead of using this list.
export const CSI_DIVISIONS: { code: string; title: string }[] = [
  { code: "00", title: "Procurement and Contracting Requirements" },
  { code: "01", title: "General Requirements" },
  { code: "02", title: "Existing Conditions" },
  { code: "03", title: "Concrete" },
  { code: "04", title: "Masonry" },
  { code: "05", title: "Metals" },
  { code: "06", title: "Wood, Plastics, and Composites" },
  { code: "07", title: "Thermal and Moisture Protection" },
  { code: "08", title: "Openings" },
  { code: "09", title: "Finishes" },
  { code: "10", title: "Specialties" },
  { code: "11", title: "Equipment" },
  { code: "12", title: "Furnishings" },
  { code: "13", title: "Special Construction" },
  { code: "14", title: "Conveying Equipment" },
  { code: "21", title: "Fire Suppression" },
  { code: "22", title: "Plumbing" },
  { code: "23", title: "Heating, Ventilating, and Air Conditioning (HVAC)" },
  { code: "25", title: "Integrated Automation" },
  { code: "26", title: "Electrical" },
  { code: "27", title: "Communications" },
  { code: "28", title: "Electronic Safety and Security" },
  { code: "31", title: "Earthwork" },
  { code: "32", title: "Exterior Improvements" },
  { code: "33", title: "Utilities" },
  { code: "34", title: "Transportation" },
  { code: "35", title: "Waterway and Marine Construction" },
  { code: "40", title: "Process Integration" },
  { code: "41", title: "Material Processing and Handling Equipment" },
  { code: "42", title: "Process Heating, Cooling, and Drying Equipment" },
  {
    code: "43",
    title:
      "Process Gas and Liquid Handling, Purification, and Storage Equipment",
  },
  { code: "44", title: "Pollution and Waste Control Equipment" },
  { code: "45", title: "Industry-Specific Manufacturing Equipment" },
  { code: "46", title: "Water and Wastewater Equipment" },
  { code: "48", title: "Electrical Power Generation" },
];

// One flat, typeable list — "03 - Concrete" — for the Division combo box.
// Division 01-33 cover the vast majority of real submittals, so those are
// what actually get used; the rest are here for completeness.
export const DIVISION_OPTIONS: string[] = CSI_DIVISIONS.map(
  (d) => `${d.code} - ${d.title}`
);

// Common parties on a construction project who'd show up as the
// "Subcontractor / trade" on a submittal — not just trade subcontractors,
// but the design team, owner side, and testing/inspection roles too, since
// a submittal reviewer is often an architect or engineer rather than a
// sub. Organized here by category for readability; the datalist itself is
// just a flat, alphabetized-by-category list for the browser to filter as
// you type. This is meant to cover the common cases well, not be
// exhaustive — typing a name that isn't listed works exactly the same as
// picking one.
export const SUBCONTRACTOR_OPTIONS: string[] = [
  // Owner side
  "Owner",
  "Owner's Representative",
  "Construction Manager",
  "Project Manager",
  "Program Manager",

  // Design team / consultants
  "Architect",
  "Structural Engineer",
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Plumbing Engineer",
  "Fire Protection Engineer",
  "Geotechnical Engineer",
  "Landscape Architect",
  "Interior Designer",
  "Acoustical Consultant",
  "Lighting Designer",
  "Code Consultant",
  "LEED / Sustainability Consultant",
  "Commissioning Agent",
  "Surveyor",

  // General / prime contractor
  "General Contractor",
  "Construction Manager at Risk",
  "Design-Builder",

  // Sitework and civil
  "Demolition Subcontractor",
  "Earthwork / Excavation Subcontractor",
  "Site Utilities Subcontractor",
  "Paving Subcontractor",
  "Landscaping Subcontractor",
  "Fencing Subcontractor",

  // Structure and envelope
  "Concrete Subcontractor",
  "Concrete Supplier (Ready-Mix)",
  "Masonry Subcontractor",
  "Structural Steel Fabricator/Erector",
  "Miscellaneous Metals Subcontractor",
  "Rough Carpentry Subcontractor",
  "Finish Carpentry / Millwork Subcontractor",
  "Waterproofing Subcontractor",
  "Roofing Subcontractor",
  "Insulation Subcontractor",
  "Firestopping Subcontractor",

  // Openings
  "Doors, Frames & Hardware Supplier",
  "Glazing / Curtain Wall Subcontractor",
  "Storefront Subcontractor",
  "Overhead Door Subcontractor",

  // Finishes
  "Drywall / Framing Subcontractor",
  "Flooring Subcontractor",
  "Tile Subcontractor",
  "Painting Subcontractor",
  "Acoustical Ceiling Subcontractor",
  "Wall Covering Subcontractor",

  // Specialties, equipment, furnishings
  "Specialties Supplier (Toilet Partitions, Signage, etc.)",
  "Fire Extinguisher Supplier",
  "Food Service Equipment Supplier",
  "Window Treatment Supplier",
  "Furniture Supplier",

  // Conveying and MEP/FP
  "Elevator Subcontractor",
  "Fire Sprinkler Subcontractor",
  "Plumbing Subcontractor",
  "HVAC Subcontractor",
  "Building Automation / Controls Subcontractor",
  "Electrical Subcontractor",
  "Low Voltage / Communications Subcontractor",
  "Security / Fire Alarm Subcontractor",
  "Solar / Renewable Energy Subcontractor",

  // Testing, inspection, misc.
  "Testing & Inspection Agency",
  "Materials Testing Lab",
  "Geotechnical Testing Firm",
  "Special Inspector",
];

// The Division combo box is a single free-typed field ("03 - Concrete", or
// anything else for a non-CSI spec), not two separate inputs — splitting it
// into a code/title pair here is what lets the Submittal Log group it the
// same way the Specifications registry already groups its rows. Anything
// that doesn't look like "<code> - <title>" is kept whole as the title
// with no code, which still groups fine — it just sorts by that raw text.
export function parseDivisionInput(raw: string): {
  code: string | null;
  title: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { code: null, title: null };

  const match = trimmed.match(/^(\d{2,})\s*-\s*(.+)$/);
  if (match) {
    return { code: match[1], title: match[2].trim() };
  }
  return { code: null, title: trimmed };
}

// The inverse — rebuilds the combo box's text value from stored
// code/title, so editing a submittal shows what you'd expect to see
// rather than an empty field.
export function formatDivisionValue(
  code: string | null,
  title: string | null
): string {
  if (code && title) return `${code} - ${title}`;
  return title ?? code ?? "";
}
