-- ByldGo Submittals — organize the Submittal Log by CSI/spec division
--
-- What this does, in plain terms:
--   - Adds two columns to `submittals`: division_code and division_title.
--     For a submittal created from the Specifications registry, these
--     carry over automatically from the spec section it came from (e.g.
--     "03 30 00" / "CAST-IN-PLACE CONCRETE"). For a submittal you create
--     by hand, you pick (or type) a division yourself.
--   - Nothing here changes existing rows — older submittals just show up
--     under "Ungrouped" in the Submittal Log until you give them one.

alter table public.submittals
  add column if not exists division_code text,
  add column if not exists division_title text;

comment on column public.submittals.division_code is
  'CSI MasterFormat division/section code (e.g. "03 30 00"), or a
   project''s own spec division code for a non-CSI spec book. Carried over
   automatically when created from the Specifications registry; editable
   by hand otherwise. Null means "not yet assigned" — shown as
   "Ungrouped" in the Submittal Log.';

comment on column public.submittals.division_title is
  'The division/section title that goes with division_code (e.g.
   "CAST-IN-PLACE CONCRETE").';
