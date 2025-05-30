/**
 * This file includes polyfills needed by Angular and is loaded before the app.
 * You can add your own extra polyfills to this file.
 *
 * This file is divided into 2 sections:
 *   1. Browser polyfills. These are applied before loading ZoneJS and are sorted by browsers.
 *   2. Application imports. Files imported after ZoneJS that should be loaded before your main
 *      file.
 *
 * The current setup is for so-called "evergreen" browsers; the last versions of browsers that
 * automatically update themselves. This includes Safari >= 10, Chrome >= 55 (including Opera),
 * Edge >= 13 on the desktop, and iOS 10 and Chrome on mobile.
 *
 * Learn more in https://angular.io/guide/browser-support
 */

/***************************************************************************************************
 * BROWSER POLYFILLS
 */

/** IE11 requires the following for NgClass support on SVG elements */
// import 'classlist.js';  // Run `npm install --save classlist.js`.

/**
 * Web Animations `@angular/animations`
 * Only required if AnimationBuilder is used within the application and using IE/Edge or Safari.
 * Standard animation support in Angular DOES NOT require any polyfills (as of Angular 6.0).
 */
// import 'web-animations-js';  // Run `npm install --save web-animations-js`.

/**
 * By default, zone.js will patch all possible macroTask and DomEvents
 * user can disable parts of macroTask/DomEvents patch by setting following flags
 * because those flags need to be set before `zone.js` being loaded, and webpack
 * will put import in the top of bundle, so user need to create a separate file
 * in this directory (for example: zone-flags.ts), and put the following flags
 * into that file, and then add the following code before importing zone.js.
 * import './zone-flags';
 *
 * The flags allowed in zone-flags.ts are listed here.
 *
 * The following flags will disable zone patch for all modules:
 *
 *  (window as any).__Zone_disable_requestAnimationFrame = true; // disable patch requestAnimationFrame
 *  (window as any).__Zone_disable_on_property = true; // disable patch onProperty such as onclick
 *  (window as any).__Zone_disable_geolocation = true; // disable patch geolocation
 *  (window as any).__Zone_disable_file = true; // disable patch file
 *  (window as any).__Zone_disable_fs = true; // disable patch fs
 */

// iOS Safari polyfills
import 'core-js/es/array';
import 'core-js/es/object';
import 'core-js/es/promise';
import 'core-js/es/set';
import 'core-js/es/map';
import 'core-js/es/string';
import 'core-js/es/symbol';
import 'core-js/es/function';

// Zone JS is required by default for Angular itself.
import 'zone.js';  // Included with Angular CLI.

/***************************************************************************************************
 * APPLICATION IMPORTS
 */ 