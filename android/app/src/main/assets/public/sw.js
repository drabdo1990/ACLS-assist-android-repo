/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "manifest.webmanifest",
    "revision": "9805d745b8ed6870472c30674e310ae8"
  }, {
    "url": "index.html",
    "revision": "46709383cc984dba4577bd187ac30cf2"
  }, {
    "url": "favicon.svg",
    "revision": "ff718a1203358d954d1631f8347d97fb"
  }, {
    "url": "icons/maskable-512.png",
    "revision": "174052764454aff1fc1db6e2c46a8c50"
  }, {
    "url": "icons/icon-512.png",
    "revision": "900d977c6f68f206cc98008b718aa5cf"
  }, {
    "url": "icons/icon-192.png",
    "revision": "22069e6aa59a68676ae162f1f93174a0"
  }, {
    "url": "assets/web-DL0u_rzY.js",
    "revision": null
  }, {
    "url": "assets/index-t5mOa3q6.css",
    "revision": null
  }, {
    "url": "assets/index-CJl55lYu.js",
    "revision": null
  }, {
    "url": "favicon.svg",
    "revision": "ff718a1203358d954d1631f8347d97fb"
  }, {
    "url": "icons/icon-192.png",
    "revision": "22069e6aa59a68676ae162f1f93174a0"
  }, {
    "url": "icons/icon-512.png",
    "revision": "900d977c6f68f206cc98008b718aa5cf"
  }, {
    "url": "icons/maskable-512.png",
    "revision": "174052764454aff1fc1db6e2c46a8c50"
  }, {
    "url": "manifest.webmanifest",
    "revision": "9805d745b8ed6870472c30674e310ae8"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
