/*!
 *
 *  Web Starter Kit
 *  Copyright 2015 Google Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the 'License');
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License
 *
 */
/* eslint-env browser */
/* globals interact, Mustache */
(function(common) {
  'use strict';

  /** Run service worker */
  function runServiceWorker() {
    // Check to make sure service workers are supported in the current browser,
    // and that the current page is accessed from a secure origin. Using a
    // service worker from an insecure origin will trigger JS console errors. See
    // http://www.chromium.org/Home/chromium-security/prefer-secure-origins-for-powerful-new-features
    var isLocalhost = Boolean(window.location.hostname === 'localhost' ||
      // [::1] is the IPv6 localhost address.
      window.location.hostname === '[::1]' ||
      // 127.0.0.1/8 is considered localhost for IPv4.
      window.location.hostname.match(
        /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
      )
    );

    if ('serviceWorker' in navigator &&
      (window.location.protocol === 'https:' || isLocalhost)) {
      navigator.serviceWorker.register('service-worker.js')
        .then(function(registration) {
          // updatefound is fired if service-worker.js changes.
          registration.onupdatefound = function() {
            // updatefound is also fired the very first time the SW is installed,
            // and there's no need to prompt for a reload at that point.
            // So check here to see if the page is already controlled,
            // i.e. whether there's an existing service worker.
            if (navigator.serviceWorker.controller) {
              // The updatefound event implies that registration.installing is set:
              // https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#service-worker-container-updatefound-event
              var installingWorker = registration.installing;

              installingWorker.onstatechange = function() {
                switch (installingWorker.state) {
                  case 'installed':
                    // At this point, the old content will have been purged and the
                    // fresh content will have been added to the cache.
                    // It's the perfect time to display a 'New content is
                    // available; please refresh.' message in the page's interface.
                    break;

                  case 'redundant':
                    throw new Error('The installing ' +
                      'service worker became redundant.');

                  default:
                  // Ignore
                }
              };
            }
          };
        }).catch(function(e) {
          console.error('Error during service worker registration:', e);
        });
    }
  }

  var uiCtrl = {
    init: function() {
      this.mainHamburger = $('#main-hamburger');
      this.mainNavigation = $('#main-navigation');
      this.mainNavBar = $('#main-navbar');
      this.canvasPlayground = $('#canvas-playground');

      this.registerEvtListeners();
      return this;
    },
    registerEvtListeners: function() {
      var self = this;
      /** hide or show the side navigation */
      function toggleSideNav() {
        self.mainNavigation.add(self.mainHamburger).toggleClass('clicked');
      }
      /** Event handler on window resize */
      function onWindowResize() {
        var mainNavHeight = self.mainNavBar.height();
        self.mainNavigation.css({top: mainNavHeight + 'px'})
          .add(self.mainHamburger).removeClass('clicked');
        self.canvasPlayground.css('margin-top', mainNavHeight + 'px');
      }
      /**
       * Event handler for navigation items
       * @param {Event} event - Get touched target from this event
       * */
      function onNavTouched(event) {
        var targetEl = $(event.target);
        self.mainNavigation.find('a').removeClass('active');
        targetEl.addClass('active');
      }
      onWindowResize();
      self.mainHamburger.click(toggleSideNav);
      self.mainNavigation.click(onNavTouched);
      $(window).on('resize', onWindowResize);
      return self;
    }
  };
  var canvasCtrl = {
    init: function() {
      this.canvasPages = $('#canvas-pages');
      this.selectedPageCtn = this.canvasPages.find('.elements');
      this.selectionBox = $(
        $.parseHTML($('#tpl--selection-box').html().trim())
      );

      this.registerEvtListeners();
      common.utils.makeElResizable('.page',
        {right: '.resize-handle', bottom: '.resize-handle'});
      common.utils.makeElResizable('.selection-box', {
        top: '.t, .lt, .rt',
        right: '.r, .rt, .rb',
        bottom: '.b, .lb, .rb',
        left: '.l, .lt, .lb',
        action: 'resizeSelected'
      });
      common.utils.makeElDraggable('.selection-box', {
        action: 'moveSelected'
      });
    },
    registerEvtListeners: function() {
      var self = this;

      /**
       * When anything but currently active element is clicked,
       * that element will be de-active.
       * @param {Event} event - Get touched target from this event
       */
      function onCanvasPagesClick(event) {
        var target = $(event.target).closest('.element');
        if (self.activeEl) {
          if (!target.is(self.activeEl)) {
            self.setElActive(self.activeEl, false);
          }
        }
        if (target.is('.element')) {
          self.setElActive(target, true);
        }
      }
      this.canvasPages.children('.page').click(onCanvasPagesClick);

      self.subscribe('addRichTextEl', self.addRichTextEl);
    },
    setWrapSelectionBox: function(elem, wrap) {
      wrap = typeof wrap === 'undefined'? true : wrap;
      var x = parseFloat(elem.attr('data-x') || 0);
      var y = parseFloat(elem.attr('data-y') || 0);

      var pagePos = this.selectedPageCtn.closest('.page').position();
      var dx = pagePos.left;
      var dy = pagePos.top;

      if(wrap) {
        x += dx;
        y += dy;

        elem.prevElem = elem.prev('.element');
        elem.nextElem = elem.next('.element');

        this.canvasPages.find('#overlays').append(this.selectionBox, elem);
        this.selectionBox
          .width(elem.width())
          .height(elem.height());
      } else {
        x -= dx;
        y -= dy;
        this.selectionBox.remove();
        if (elem.prevElem && elem.prevElem.length) {
          elem.insertAfter(elem.prevElem);
        } else if (elem.nextElem && elem.nextElem.length) {
          elem.insertBefore(elem.nextElem);
        } else {
          this.selectedPageCtn.append(elem);
        }
      }
      common.utils.updatePosition(elem, x, y);
      common.utils.updatePosition(this.selectionBox, x, y);
    },
    setElActive: function(elem, active) {
      common.utils.setCtnEditable(elem, active);
      if (active) {
        this.activeEl = elem.addClass('active');
        this.setWrapSelectionBox(elem);
      } else {
        elem.removeClass('active');
        this.activeEl = null;
        this.setWrapSelectionBox(elem, false);
      }
      return this;
    },
    createNode: function(nodeName, cssOptions) {
      var node = $(document.createElement('div'));
      var innerNode = $(document.createElement(nodeName)).addClass('inner');
      node.append(innerNode);

      common.utils.makeElDraggable('.element', {
        context: this.selectedPageCtn.get(0)
      });

      return node.css(cssOptions || {}).addClass('element');
    },
    addText: function() {
      var textNode = this.createNode('div');
      textNode.addClass('text').find('.inner').text('请输入文本内容');
      if (this.activeEl) {
        this.setElActive(this.activeEl, false);
      }
      this.setElActive(textNode, true);
      textNode.find('.inner').focus();
    },
    addRichTextEl: function(command) {
      switch (command) {
        case common.commands.ADD_TEXT:
          this.addText();
          break;
        default:
          break;
      }
    }
  };
  var toolbarCtrl = {
    init: function() {
      this.tbRichText = $('#tb--rich-text');

      this.registerEvtListeners();
    },
    registerEvtListeners: function() {
      var self = this;

      /**
       * Handle it when user click a button on the toolbar
       */
      function onTbRichTextClick() {
        var targetEl = $(this);
        var command = targetEl.attr('data-command');
        canvasCtrl.publish('addRichTextEl', command);
      }
      self.tbRichText.children().click(onTbRichTextClick);
    }
  };
  var iniApp = {
    boot: function() {
      runServiceWorker();

      $.extend(true, uiCtrl, new Mediator());
      $.extend(true, canvasCtrl, new Mediator());
      $.extend(true, toolbarCtrl, new Mediator());
      uiCtrl.init();
      toolbarCtrl.init();
      canvasCtrl.init();
    }
  };
  iniApp.boot();
})(_common);
