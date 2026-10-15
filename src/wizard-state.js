'use strict';
// The install wizard opens by itself only on a library nobody has configured yet. Any one setting counts as configured,
// so an existing install never sees it unasked (it can still be run from Dashboard Settings).
const configured = library => Boolean(library && (
  library.skin || library.xenia_executable || library.rom_directory ||
  (Array.isArray(library.rom_directories) && library.rom_directories.length)
));
const isFirstRun = library => library != null && !library.wizard_done && !configured(library);
const markDone = library => ({ ...library, wizard_done: true });
module.exports = { isFirstRun, markDone, configured };
