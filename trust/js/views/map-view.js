// Campaign map — placeholder (fully built in the campaign-map phase).
let go = null;
export function initMapView(navigateFn) { go = navigateFn; }
export function showMap(params = {}) { go('map'); }
