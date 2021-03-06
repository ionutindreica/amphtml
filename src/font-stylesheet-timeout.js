/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {onDocumentReady} from './document-ready';
import {urls} from './config';

/**
 * While browsers put a timeout on font downloads (3s by default,
 * some less on slow connections), there is no such timeout for style
 * sheets. In the case of AMP external stylesheets are ONLY used to
 * download fonts, but browsers have no reasonable timeout for
 * stylesheets. Users may thus wait a long time for these to download
 * even though all they do is reference fonts.
 *
 * For that reasons this function identifies (or rather infers) font
 * stylesheets that have not downloaded within 1 second of the page
 * response starting and reinserts equivalent link tags  dynamically. This
 * removes their page-render-blocking nature and lets the doc render.
 *
 * 1 second was picked, because the font-stylesheets are typically
 * tiny. If a connection wasn't able to deliver them within 1s
 * of page load start, then it is unlikely that it will be able
 * to download the font itself within 3s.
 *
 * @param {!Window} win
 */
export function fontStylesheetTimeout(win) {
  onDocumentReady(win.document, () => maybeTimeoutStyleSheets(win));
}

/**
 * @param {!Window} win
 */
function maybeTimeoutStyleSheets(win) {
  let timeSinceResponseStart = 0;
  // If available, we start counting from the time the HTTP response
  // for the page started. The preload scanner should then quickly
  // start the CSS download.
  const perf = win.performance;
  if (perf && perf.timing && perf.timing.responseStart) {
    timeSinceResponseStart = Date.now() - perf.timing.responseStart;
  }
  const timeout = Math.max(1, 500 - timeSinceResponseStart);

  // Avoid timer dependency since this runs very early in execution.
  win.setTimeout(() => {
    const styleSheets = win.document.styleSheets;
    if (!styleSheets) {
      return;
    }
    // Find all stylesheets that aren't loaded from the AMP CDN (those are
    // critical if they are present).
    const styleLinkElements = win.document.querySelectorAll(
        'link[rel~="stylesheet"]:not([href^="' + urls.cdn + '"])');
    // Compare external sheets against elements of document.styleSheets.
    // They do not appear in this list until they have been loaded.
    const timedoutStyleSheets = [];
    for (let i = 0; i < styleLinkElements.length; i++) {
      const link = styleLinkElements[i];
      let found = false;
      for (let n = 0; n < styleSheets.length; n++) {
        if (styleSheets[n].ownerNode == link) {
          found = true;
          break;
        }
      }
      if (!found) {
        timedoutStyleSheets.push(link);
      }
    }

    for (let i = 0; i < timedoutStyleSheets.length; i++) {
      const existingLink = timedoutStyleSheets[i];
      const newLink = existingLink.cloneNode(/* not deep */ false);
      // To avoid blocking the render, we assign a non-matching media
      // attribute first…
      const media = existingLink.media || 'all';
      newLink.media = 'not-matching';
      // And then switch it back to the original after the stylesheet
      // loaded.
      newLink.onload = () => {
        newLink.media = media;
      };
      newLink.setAttribute('i-amphtml-timeout', timeout);
      const parent = existingLink.parentElement;
      // Insert the stylesheet. We do it right before the existing one,
      // so that
      // - we pick up its HTTP request.
      // - CSS evaluation order doesn't change.
      parent.insertBefore(newLink, existingLink);
      // And remove the blocking stylesheet.
      parent.removeChild(existingLink);
    }
  }, timeout);
}
