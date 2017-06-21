/* eslint-env browser */
/* globals Mediator, interact */
(function () {
  'use strict';

  String.prototype.replaceAll = function (search, replacement) {
    return this.replace(new RegExp(search, 'g'), replacement);
  };
  var common = {
    commands: {
      ADD_TEXT: 'add-text',
      ADD_IMG: 'add-img',
      ADD_COLOR: 'add-color',
      ADD_FORM: 'add-form',
      ADD_COMP: 'add-comp',
      ADD_AUDIO: 'add-audio',
      ADD_VIDEO: 'add-video'
    },
    utils: {
      getElOffsetCenter: function (target) {
        return {
          cx: ~~(target.attr('data-x') || 0) + target.outerWidth() / 2,
          cy: ~~(target.attr('data-y') || 0) + target.outerHeight() / 2
        }
      },
      updatePosition: function (target, x, y) {
        this.setCSSTransform2D(target, x, y);
        target.attr('data-x', x).attr('data-y', y);
      },
      updateSize: function (target, w, h) {
        target.outerWidth(w);
        target.outerHeight(h);
      },
      setCSSTransform2D: function (target, x, y) {
        target.css(
          {
            '-webkit-transform': 'translate(' + x + 'px,' + y + 'px)',
            'transform': 'translate(' + x + 'px,' + y + 'px)'
          });
      },
      setCtnEditable: function (htmlEl, setting) {
        $(htmlEl).find('.inner').attr('contenteditable', setting);
      },
      docExecCmd: function (command, ui, options) {
        return document.execCommand(command, ui || false, options || null);
      },
      makeElResizable: function (selector, options) {
        var self = this;
        options = options || {};
        interact(selector)
          .resizable({
            preserveAspectRatio: options.preserveAspectRatio || false,
            edges: {
              left: options.left || false,
              top: options.top || false,
              right: options.right || false,
              bottom: options.bottom || false
            },
            invert: options.invert || 'reposition'
          })
          .on('resizemove', function (event) {
            var target = $(event.target);
            var x = parseFloat(target.attr('data-x') || 0);
            var y = parseFloat(target.attr('data-y') || 0);

            target.width(event.rect.width);
            target.height(event.rect.height);

            x += event.deltaRect.left;
            y += event.deltaRect.top;

            self.updatePosition(target, x, y);

            if (options.action && options.action === 'resizeSelected') {
              self.updatePosition(target.siblings('.element'), x, y);
              self.updateSize(
                target.siblings('.element'), target.outerWidth(), target.outerHeight()
              );
            }
          });
      },
      makeElDraggable: function (selector, options) {
        options = options || {};
        var self = this;
        interact(selector, {
          context: options.context || document
        })
          .draggable({
            inertia: options.inertia || false,
            autoScroll: options.autoScroll || true,
            onstart: function (event) {
              event.target.style.pointerEvents = 'none';
              event.target.classList.add('dragging');
              if ('onstart' in options) {
                options['onstart'](event);
              }
            },
            onmove: function (event) {
              var target = $(event.target);
              var x = parseFloat(target.attr('data-x') || 0) + event.dx;
              var y = parseFloat(target.attr('data-y') || 0) + event.dy;

              self.updatePosition(target, x, y);
              if ('onmove' in options) {
                options['onmove'](event);
              }
              if (options.action && options.action === 'moveSelected') {
                self.updatePosition(target.siblings('.element'), parseFloat(target.attr('data-x') || 0), parseFloat(target.attr('data-y') || 0));
              }
            },
            onend: function (event) {
              event.target.style.pointerEvents = 'auto';
              event.target.classList.remove('dragging');
              if ('onend' in options) {
                options['onend'](event);
              }
            }
          });
      },
      getElemFromTpl: function (tplSelector) {
        return $(
          $.parseHTML($(tplSelector).html().trim())
        );
      },
      getPageHTML: function (selector, template, cb) {
        var pageCtn = $(selector);
        if (!pageCtn.length) {
          return;
        }
        $.get(template, function (response) {
          for (var i = 0; i < pageCtn.length; i++) {
            var dcm = document.createElement('html');
            var elHtml = pageCtn.get(i).outerHTML;
            dcm.innerHTML = response;
            var p = dcm.querySelector('.page');
            p.style.width = pageCtn.get(i).clientWidth + 'px';
            p.style.height = pageCtn.get(i).clientHeight + 'px';
            p.innerHTML = elHtml;
            cb(dcm.outerHTML);
          }
        });
      },
      download: function (filename, mimeType, text) {
        var link = document.createElement('a');
        mimeType = mimeType || 'text/plain';
        link.setAttribute('download', filename);
        link.setAttribute('href', 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(text));
        link.click();
      },
      print: function (text, win) {
        var hmlCtn = (text.match(/<html>((\s|.)*)<\/html>/)[1]);
        win.document.write(hmlCtn);
        win.document.close();
        win.focus();
        var waitLoadId = setInterval(function () {
          if (win.document.querySelector('.elements')) {
            win.print();
            clearInterval(waitLoadId);
            win.close();
          }
        }, 200);
      }
    }
  };

  /**
   * @class canvasCtrl
   * @type {Mediator}
   */
  var canvasCtrl = new Mediator();
  var uiCtrl = new Mediator();

  (function (canvasCtrl) {
    var overlays = $('#overlays');
    var selectionBox = common.utils.getElemFromTpl('#tpl--selection-box');
    var selectedPageCtn;
    var activeEl;
    var alLines = $('#alignment-lines');
    alLines.remove();

    /**
     * When anything but currently active element is clicked,
     * the active element will be inactive.
     * @param {Event} event - Get touched target from this event
     */
    function onCanvasPageClick(event) {
      uiCtrl.publish('updatePageSizeMd', $(this).width(), $(this).height());
      $(this).addClass('selected').siblings('.page').removeClass('selected');
      selectedPageCtn = $(this).find('.elements');
      var target = $(event.target).closest('.element');
      if (activeEl) {
        if (!target.is(activeEl)) {
          setElActive(activeEl, false);
        }
      }
      if (target.is('.element')) {
        setElActive(target, true);
      }
    }

    /**
     * When subscribed 'addPage' event is published
     * @param {object} pageEl - jQuery object of page elem
     */
    function onAddPage(pageEl) {
      pageEl.click(onCanvasPageClick);
      pageEl.click();
    }

    function onChangePageSize(width, height) {
      if (activeEl) {
        setElActive(activeEl, false);
      }
      if (selectedPageCtn) {
        var page = selectedPageCtn.closest('.page');
        if (width && height) {
          page.width(width).height(height);
        } else {
          page.width(page.width()).height(page.height());
        }
      }
      var left = ($('#canvas-pages').outerWidth() - page.width()) / 2;
      left = left > 0 ? left : 0;
      page.css({
        left: left
      });
    }

    function onRmItem(target) {
      if (target) {
        target.remove();
        if (target.is('.page')) {
          rearrangePages();
          if (target.is(selectedPageCtn.closest('.page'))) {
            selectedPageCtn = null;
          }
        }
      } else {
        if (activeEl) {
          activeEl.remove();
          activeEl = null;
          uiCtrl.publish('showHotTools', {action: false});
        } else if (selectedPageCtn) {
          selectedPageCtn.closest('.page').remove();
          selectedPageCtn = null;
          rearrangePages();
        }
      }
      selectionBox.remove();
    }

    function rearrangePages() {
      var offsetY = 0;
      $('.page').each(function () {
        $(this).css('top', offsetY);
        offsetY += $(this).height() + 75;
      });
    }

    function changeBg(imgSrc) {
      var bgCSSObj = {
        'background-image': 'url(' + imgSrc + ')'
      };
      if (activeEl) {
        if (activeEl.is('.comp.card-wide') || activeEl.is('.comp.card-square')) {
          activeEl.find('.mdl-card__title').css(bgCSSObj);
        } else if (activeEl.is('.comp.card-note') || activeEl.is('.comp.card-tag')) {
          activeEl.find('.mdl-card').css(bgCSSObj);
        } else {
          activeEl.find('.inner').css(bgCSSObj);
        }
      } else if (selectedPageCtn) {
        selectedPageCtn.css(bgCSSObj);
      }
    }

    function changeBgColor(colorCode) {
      var bgCSSObj = {
        'background-color': colorCode,
        'background-image': 'url()'
      };
      if (activeEl) {
        if (activeEl.is('.comp.card-wide') || activeEl.is('.comp.card-square')) {
          activeEl.find('.mdl-card__title').css(bgCSSObj);
        } else if (activeEl.is('.comp.card-note') || activeEl.is('.comp.card-tag')) {
          activeEl.find('.mdl-card').css(bgCSSObj);
        } else {
          activeEl.find('.inner').css(bgCSSObj);
        }
      } else if (selectedPageCtn) {
        selectedPageCtn.css(bgCSSObj);
      }
    }

    function blurActiveEl() {
      if (activeEl) {
        setElActive(activeEl, false);
      }
    }

    function applyAnimation(x) {
      if (activeEl) {
        activeEl.find('.inner').removeClass().addClass('inner animated').addClass(x);
      } else {
        uiCtrl.publish('showWarning', '先选择想要应用动画的物件');
      }
    }

    canvasCtrl.subscribe('addPage', onAddPage);
    canvasCtrl.subscribe('removeItem', onRmItem);
    canvasCtrl.subscribe('addNewItem', addNewItem);
    canvasCtrl.subscribe('changePageSize', onChangePageSize);
    canvasCtrl.subscribe('changeBg', changeBg);
    canvasCtrl.subscribe('changeBgColor', changeBgColor);
    canvasCtrl.subscribe('blurActiveEl', blurActiveEl);
    canvasCtrl.subscribe('rearrangePages', rearrangePages);
    canvasCtrl.subscribe('applyAnimation', applyAnimation);

    canvasCtrl.getActiveEl = function () {
      return activeEl;
    };
    canvasCtrl.getSelectedPageCtn = function () {
      return selectedPageCtn;
    };

    common.utils.makeElResizable('.page',
      {right: '.resize-handle', bottom: '.resize-handle'});
    common.utils.makeElResizable('.selection-box.text, .selection-box.form, .selection-box.video', {
      top: '.t, .lt, .rt',
      right: '.r, .rt, .rb',
      bottom: '.b, .lb, .rb',
      left: '.l, .lt, .lb',
      action: 'resizeSelected'
    });
    common.utils.makeElResizable('.selection-box.image', {
      preserveAspectRatio: true,
      top: '.t, .lt, .rt',
      right: '.r, .rt, .rb',
      bottom: '.b, .lb, .rb',
      left: '.l, .lt, .lb',
      action: 'resizeSelected'
    });
    common.utils.makeElDraggable('.selection-box', {
      action: 'moveSelected',
      onstart: function (event) {
        alLines.appendTo(selectedPageCtn.closest('.page'));
      },
      onmove: function (event) {
        var target = $(event.target);
        var offsetCenter = common.utils.getElOffsetCenter(target);
        var pagePos = selectedPageCtn.closest('.page').position();
        var dx = pagePos.left;
        var dy = pagePos.top;
        offsetCenter.cx -= dx;
        offsetCenter.cy -= dy;
        var hasH = false, hasV = false;
        selectedPageCtn.find('.element').each(function () {
          var siblingOC = common.utils.getElOffsetCenter($(this));
          if (Math.abs(siblingOC.cx - offsetCenter.cx) <= 2) {
            hasV = true;
            common.utils.updatePosition(alLines.children('.v'), siblingOC.cx, 0);
            offsetCenter.cx = siblingOC.cx;
          }
          if (Math.abs(siblingOC.cy - offsetCenter.cy) <= 2) {
            hasH = true;
            common.utils.updatePosition(alLines.children('.h'), 0, siblingOC.cy);
            offsetCenter.cy = siblingOC.cy;
          }
        });
        if (Math.abs(offsetCenter.cx - selectedPageCtn.outerWidth() / 2) <= 2) {
          hasV = true;
          common.utils.updatePosition(alLines.children('.v'), selectedPageCtn.outerWidth() / 2, 0);
          offsetCenter.cx = selectedPageCtn.outerWidth() / 2;
        }
        if (Math.abs(offsetCenter.cy - selectedPageCtn.outerHeight() / 2) <= 2) {
          hasH = true;
          common.utils.updatePosition(alLines.children('.h'), 0, selectedPageCtn.outerHeight() / 2);
          offsetCenter.cy = selectedPageCtn.outerHeight() / 2;
        }
        common.utils.updatePosition(target, offsetCenter.cx + dx - target.outerWidth() / 2, offsetCenter.cy + dy - target.outerHeight() / 2);
        if (hasH) {
          alLines.addClass('show-h').children('.h').attr('width', selectedPageCtn.outerWidth() + 'px');
        } else {
          alLines.removeClass('show-h');
        }
        if (hasV) {
          alLines.addClass('show-v').children('.v').attr('height', selectedPageCtn.outerHeight() + 'px');
        } else {
          alLines.removeClass('show-v');
        }
      },
      onend: function (event) {
        alLines.remove().removeClass('show-h show-v');
      }
    });
    common.utils.makeElDraggable('.element', {
      context: document.getElementById('pages'),
      onstart: function (event) {
        alLines.appendTo(selectedPageCtn.closest('.page'));
      },
      onmove: function (event) {
        var target = $(event.target);
        var offsetCenter = common.utils.getElOffsetCenter(target);
        var hasH = false, hasV = false;
        target.siblings('.element').each(function () {
          var siblingOC = common.utils.getElOffsetCenter($(this));
          if (Math.abs(siblingOC.cx - offsetCenter.cx) <= 2) {
            hasV = true;
            common.utils.updatePosition(alLines.children('.v'), siblingOC.cx, 0);
            offsetCenter.cx = siblingOC.cx;
          }
          if (Math.abs(siblingOC.cy - offsetCenter.cy) <= 2) {
            hasH = true;
            common.utils.updatePosition(alLines.children('.h'), 0, siblingOC.cy);
            offsetCenter.cy = siblingOC.cy;
          }
        });
        if (Math.abs(offsetCenter.cx - selectedPageCtn.outerWidth() / 2) <= 2) {
          hasV = true;
          common.utils.updatePosition(alLines.children('.v'), selectedPageCtn.outerWidth() / 2, 0);
          offsetCenter.cx = selectedPageCtn.outerWidth() / 2;
        }
        if (Math.abs(offsetCenter.cy - selectedPageCtn.outerHeight() / 2) <= 2) {
          hasH = true;
          common.utils.updatePosition(alLines.children('.h'), 0, selectedPageCtn.outerHeight() / 2);
          offsetCenter.cy = selectedPageCtn.outerHeight() / 2;
        }
        common.utils.updatePosition(target, offsetCenter.cx - target.outerWidth() / 2, offsetCenter.cy - target.outerHeight() / 2);
        if (hasH) {
          alLines.addClass('show-h').children('.h').attr('width', selectedPageCtn.outerWidth() + 'px');
        } else {
          alLines.removeClass('show-h');
        }
        if (hasV) {
          alLines.addClass('show-v').children('.v').attr('height', selectedPageCtn.outerHeight() + 'px');
        } else {
          alLines.removeClass('show-v');
        }
      },
      onend: function (event) {
        alLines.remove().removeClass('show-h show-v');
      }
    });

    /**
     * When an element is focused/blur, show/hide the selection box
     * @param {object} elem - jQuery object
     * @param {boolean} wrap - show or hide the selection box
     */
    function setWrapSelectionBox(elem, wrap) {
      var ctt = elem.data('type');
      selectionBox.removeClass('text image form').addClass(ctt);
      wrap = typeof wrap === 'undefined' ? true : wrap;
      var x = parseFloat(elem.attr('data-x') || 0);
      var y = parseFloat(elem.attr('data-y') || 0);

      var pagePos = selectedPageCtn.closest('.page').position();
      var dx = pagePos.left;
      var dy = pagePos.top;
      if (wrap) {
        x += dx;
        y += dy;

        elem.prevElem = elem.prev('.element');
        elem.nextElem = elem.next('.element');

        overlays.append(selectionBox, elem);
        common.utils.updateSize(selectionBox, elem.outerWidth(), elem.outerHeight());
        common.utils.updateSize(elem, elem.outerWidth(), elem.outerHeight());
      } else {
        x -= dx;
        y -= dy;
        selectionBox.remove();
        if (elem.prevElem && elem.prevElem.length) {
          elem.insertAfter(elem.prevElem);
        } else if (elem.nextElem && elem.nextElem.length) {
          elem.insertBefore(elem.nextElem);
        } else {
          selectedPageCtn.append(elem);
        }
      }
      common.utils.updatePosition(elem, x, y);
      common.utils.updatePosition(selectionBox, x, y);
    }

    /**
     * Active elements are meant to be selected
     * @param {object} elem - jQuery object
     * @param {boolean} active - make the elem active or inactive
     */
    function setElActive(elem, active) {
      elem = $(elem);
      if (active) {
        activeEl = elem.addClass('active');
        setWrapSelectionBox(activeEl);
        if (activeEl.hasClass('text') || activeEl.hasClass('comp')) {
          common.utils.setCtnEditable(activeEl, true);
          elem.find('.inner').focus();
        }
        uiCtrl.publish('showHotTools', {action: true, type: activeEl.data('type')});
      } else {
        activeEl.removeClass('active');
        setWrapSelectionBox(activeEl, false);
        common.utils.setCtnEditable(activeEl, false);
        activeEl = null;
        uiCtrl.publish('showHotTools', {action: false});
      }
    }

    /**
     * Create new common node for specific use
     * @param {string} nodeName - name of the node, mostly 'div'
     * @param {object} cssOptions - wrapped with css styles
     * @return {object} - built jQuery object
     */
    function createNode(nodeName, cssOptions) {
      var node = $(document.createElement('div'));
      var innerNode = $(document.createElement(nodeName)).addClass('inner');
      node.append(innerNode);
      return node.css(cssOptions || {}).addClass('element');
    }

    /**
     * Create a new text element
     */
    function addText() {
      var textNode = createNode('div');
      textNode.addClass('text').data('type', 'text').find('.inner').text('ini canvas canvas ini');
      setElActive(textNode, true);
      document.execCommand('selectAll', false);
    }

    function addImg(imgSrc) {
      var img = new Image();
      img.src = imgSrc;
      img.onload = function () {
        var imgNode = createNode('div');
        imgNode.addClass('image').data('type', 'image').find('.inner').append(img);
        setElActive(imgNode, true);
      };
    }

    function addForm(rndHTML) {
      var formNode = createNode('div');
      formNode.addClass('form').data('type', 'form').find('.inner').append(rndHTML);
      setElActive(formNode, true);
    }

    function addComp(args) {
      args = args || {};
      var htm = args.html;
      var type = args.type;
      var compNode = createNode('div');
      compNode.addClass(type).addClass('comp').data('type', type).find('.inner').append(htm);
      setElActive(compNode, true);
    }

    function addAudio(args) {
      var loop = args.loop;
      var autoplay = args.autoplay;
      var src = args.src;
      src = decodeURIComponent(src);

      var audioWrap = document.createElement('div');
      audioWrap.className = 'p-2';
      var audio = document.createElement('audio');
      audio.src = src;
      audio.loop = loop;
      audio.autoplay = autoplay;
      audio.controls = true;

      audioWrap.appendChild(audio);

      var audioNode = createNode('div');
      audioNode.addClass('audio').data('type', 'audio').find('.inner').append(audioWrap.outerHTML);
      setElActive(audioNode, true);
    }

    function addVideo(args) {
      var embedCode = args.embedCode;
      var videoWrap = document.createElement('div');
      videoWrap.className = 'p-2';
      videoWrap.innerHTML = embedCode;

      var videoNode = createNode('div');
      videoNode.addClass('video').data('type', 'video').find('.inner').append(videoWrap.outerHTML);
      setElActive(videoNode, true);
    }

    /**
     * Create any rich text element like text, pictures, etc
     * @param {string} command - used to specifically create an element
     * @param {string} extra - optional but sometimes we need
     */
    function addNewItem(command, extra) {
      if (!selectedPageCtn) {
        return;
      }
      if (activeEl) {
        setElActive(activeEl, false);
      }
      switch (command) {
        case common.commands.ADD_TEXT:
          addText();
          break;
        case common.commands.ADD_IMG:
          addImg(extra);
          break;
        case common.commands.ADD_FORM:
          addForm(extra);
          break;
        case common.commands.ADD_COMP:
          addComp(extra);
          break;
        case common.commands.ADD_AUDIO:
          addAudio(extra);
          break;
        case common.commands.ADD_VIDEO:
          addVideo(extra);
          break;
        default:
          break;
      }
    }
  })(canvasCtrl);

  (function (canvasCtrl) {
    var tbMain = $('#tb--main');
    var closeBtn = $('.close-btn');

    /**
     * Handle it when user click a button on the main toolbar
     */
    function onMainTbItemClick() {
      var targetEl = $(this);
      var command = targetEl.attr('data-command');
      if (command) {
        canvasCtrl.publish('addNewItem', command);
      }
      var toggleId = targetEl.attr('data-toggle-id');
      if (toggleId) {
        var target = $('#' + toggleId).toggleClass('show');
        target.siblings('.slidebar').removeClass('show');
        if (target.hasClass('show')) {
          $(document.body).addClass('slidebar-open');
        } else {
          $(document.body).removeClass('slidebar-open');
        }
        uiCtrl.publish('load-' + toggleId);
        // canvasCtrl.publish('changePageSize');
      }
    }

    tbMain.children().click(onMainTbItemClick);
    closeBtn.click(function () {
      $(this).closest('.slidebar').removeClass('show');
      $(document.body).removeClass('slidebar-open');
      // canvasCtrl.publish('changePageSize');
    });
  })(canvasCtrl);

  (function (canvasCtrl) {
    var addPageBtn = $('#add-page');
    var canvasPages = $('#canvas-pages');
    var rmItemBtn = $('#remove-item');
    var hotTools = $('.hot-tools');
    var pageSizeMd = $('#tb--page-size');
    var currentCmd;
    var imgLib = $('#image-lib');
    var imgLibLoaded = false;
    var addColorBtn = $('#add-color-fp');
    var currentFontSize;
    var doExpOpts = $('#do-export-options');
    var fb;
    var fbContainer = $('#form-builder-container');
    var compStore = $('#popular-components');
    var snackbarContainer = document.querySelector('#demo-snackbar-example');

    /**
     * When right-bottom add-page button is clicked
     */
    function onAddPageBtnClick() {
      var pageEl = common.utils.getElemFromTpl('#tpl--page');
      var lastPage = $('.page').last();
      if (lastPage.length) {
        pageEl.css('top', lastPage.position().top + lastPage.height() + 75);
      }
      pageEl.attr('id', 'page-' + new Date().getTime());
      canvasPages.children('#pages').append(pageEl);
      canvasCtrl.publish('addPage', pageEl);
      canvasCtrl.publish('changePageSize');
    }

    onAddPageBtnClick();

    function onRmItemBtnClick() {
      canvasCtrl.publish('removeItem');
    }

    function showHotTools(options) {
      options = options || {};
      if (options.action) {
        hotTools.filter('.' + options.type).addClass('show');
      } else {
        hotTools.removeClass('show');
      }
    }

    function doPopupCommand(command, promptText, promptDefault) {
      var usrInput = prompt(promptText, promptDefault);
      if (usrInput) {
        document.execCommand(command, false, usrInput);
      }
    }

    function onHotToolsClick() {
      var self = $(this);
      var extraParam = null;
      currentCmd = self.data('command');
      if (!currentCmd) {
        return;
      }
      if (currentCmd === 'createLink') {
        doPopupCommand(currentCmd, '输入链接');
        return;
      }
      if (currentCmd === 'insertImage') {
        doPopupCommand(currentCmd, '输入图片URL');
        return;
      }
      if (currentCmd === 'formatBlock' || currentCmd === 'fontName') {
        extraParam = self.text();
      }
      if (self.data('detail')) {
        extraParam = self.data('detail');
      }
      document.execCommand(currentCmd, false, extraParam);
      if (currentCmd === 'fontSize') {
        currentFontSize = self.text();
        var ff = $('font[size]');
        var canvasActiveEl = canvasCtrl.getActiveEl();
        if (ff.length) {
          ff.css('font-size', currentFontSize + 'px').removeAttr('size').css('line-height', '1em');
        } else {
          if (canvasActiveEl) {
            var innerEl = canvasActiveEl.find('.inner').get(0);
            innerEl.addEventListener('keyup', changeEdFontSz);
          }
        }
      }
    }

    function changeEdFontSz() {
      $('font[size]').css('font-size', currentFontSize + 'px').removeAttr('size');
      this.removeEventListener('keyup', changeEdFontSz);
    }

    function installPickers() {
      bindColorPicker('#fgcolor-button', '#000000', function (color) {
        document.execCommand('foreColor', false, color.toHexString());
      });
      bindColorPicker('#bgcolor-button', '#ffffff', function (color) {
        document.execCommand('backColor', false, color.toHexString());
      });
      bindColorPicker('#add-color-fp', '#780fa8', function (color) {
        appendColorPlatte(color.toHexString());
      });
    }

    function bindColorPicker(selector, setupColor, cb) {
      $(selector).spectrum({
        color: setupColor,
        showInput: true,
        className: "full-spectrum",
        showInitial: true,
        showPalette: true,
        showSelectionPalette: true,
        maxSelectionSize: 10,
        preferredFormat: "hex",
        localStorageKey: "spectrum.demo",
        move: function (color) {

        },
        show: function () {

        },
        beforeShow: function () {

        },
        hide: function () {

        },
        change: cb,
        palette: [
          ["rgb(0, 0, 0)", "rgb(67, 67, 67)", "rgb(102, 102, 102)",
            "rgb(204, 204, 204)", "rgb(217, 217, 217)", "rgb(255, 255, 255)"],
          ["rgb(152, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 153, 0)", "rgb(255, 255, 0)", "rgb(0, 255, 0)",
            "rgb(0, 255, 255)", "rgb(74, 134, 232)", "rgb(0, 0, 255)", "rgb(153, 0, 255)", "rgb(255, 0, 255)"],
          ["rgb(230, 184, 175)", "rgb(244, 204, 204)", "rgb(252, 229, 205)", "rgb(255, 242, 204)", "rgb(217, 234, 211)",
            "rgb(208, 224, 227)", "rgb(201, 218, 248)", "rgb(207, 226, 243)", "rgb(217, 210, 233)", "rgb(234, 209, 220)",
            "rgb(221, 126, 107)", "rgb(234, 153, 153)", "rgb(249, 203, 156)", "rgb(255, 229, 153)", "rgb(182, 215, 168)",
            "rgb(162, 196, 201)", "rgb(164, 194, 244)", "rgb(159, 197, 232)", "rgb(180, 167, 214)", "rgb(213, 166, 189)",
            "rgb(204, 65, 37)", "rgb(224, 102, 102)", "rgb(246, 178, 107)", "rgb(255, 217, 102)", "rgb(147, 196, 125)",
            "rgb(118, 165, 175)", "rgb(109, 158, 235)", "rgb(111, 168, 220)", "rgb(142, 124, 195)", "rgb(194, 123, 160)",
            "rgb(166, 28, 0)", "rgb(204, 0, 0)", "rgb(230, 145, 56)", "rgb(241, 194, 50)", "rgb(106, 168, 79)",
            "rgb(69, 129, 142)", "rgb(60, 120, 216)", "rgb(61, 133, 198)", "rgb(103, 78, 167)", "rgb(166, 77, 121)",
            "rgb(91, 15, 0)", "rgb(102, 0, 0)", "rgb(120, 63, 4)", "rgb(127, 96, 0)", "rgb(39, 78, 19)",
            "rgb(12, 52, 61)", "rgb(28, 69, 135)", "rgb(7, 55, 99)", "rgb(32, 18, 77)", "rgb(76, 17, 48)"]
        ]
      });
    }

    function changePageSize() {
      var w = pageSizeMd.find('.page-width').val();
      var h = pageSizeMd.find('.page-height').val();
      canvasCtrl.publish('changePageSize', w, h);
    }

    function onPageSizeMdKeyup(event) {
      if (event.keyCode === 13) {
        changePageSize();
      }
    }

    function updatePageSizeMd(width, height) {
      pageSizeMd.find('.page-width').val(width).end().find('.page-height').val(height).end().find('.mdl-textfield').addClass('is-dirty');
    }

    function loadImgLib() {
      if (imgLibLoaded) {
        return;
      }
      imgLibLoaded = true;
      loadSpecialImages();
      loadColorPlatte();
    }

    function loadColorPlatte() {
      var colors = ['#2d0921', '#c5c159', '#ffc0cb', '#012d5a', '#ad0725', '#913053', '#59112c',
        '#37a2b2', '#99ffdd', '#aaf1be', '#000000', '#f97508', '#66217e', '#ffe5fc', '#e5d0d7', '#beffab', '#abbeff', '#c2abff'];
      var len = colors.length;
      for (var i = 0; i < len; i++) {
        appendColorPlatte(colors[i]);
      }
    }

    function appendColorPlatte(color) {
      var tpl = $('#tpl--color-platte').html();
      $(tpl.replaceAll('{{color-code}}', color)).insertBefore(addColorBtn);
    }

    function appendSpecialImage(imgSrc) {
      var tpl = $('#tpl--lib-img-item').html();
      imgLib.find('#special-bg-images .inner').append(tpl.replaceAll('{{img-src}}', imgSrc));
    }

    function loadSpecialImages() {
      var images = [
        'http://www.amazingwallpaperz.com/wp-content/uploads/Abstract-Painting-Wallpaper-Mobile-Phones.jpg',
        'https://static.pexels.com/photos/5836/yellow-metal-design-decoration.jpg',
        'http://www.cianellistudios.com/images/abstract-paintings/abstract-paintings-splash.jpg',
        'http://img3.xiazaizhijia.com/walls/20161209/1920x1080_e33062551f5890f.jpg',
        'http://4493bz.1985t.com/uploads/allimg/141014/3-141014100632.jpg',
        'http://4493bz.1985t.com/uploads/allimg/150722/1-150H2142Q0.jpg',
        'http://pic1.win4000.com/wallpaper/1/50445a0a38168.jpg',
        'https://inspirationseek.com/wp-content/uploads/2014/06/Art-Abstract-Painting.jpg',
        'http://www.wmpic.me/wp-content/uploads/2013/12/20131225172517256.jpg',
        'http://www.amazingwallpaperz.com/wp-content/uploads/Abstract-Painting-Background-HD-Wallpapers.jpg',
        'images/comp_zard_purple.jpg',
        'images/comp_zard_smile.png',
        'images/comp_zard_smile_wide.jpg',
        'https://images.fineartamerica.com/images-medium-large-5/grid-3-jane-davies.jpg',
        'http://www.artworkcanvas.com/images/388_02.jpg',

      ];
      var imgNum = images.length;
      for (var i = 0; i < imgNum; i++) {
        var img = new Image();
        img.src = images[i];
        img.onload = function () {
          appendSpecialImage(this.src);
        };
        img.onerror = function () {
          console.log('img load error for ', this.src);
        }
      }
    }

    function onImgLibClick(event) {
      var target = $(event.target);
      if (target.is('.option')) {
        var imgSrc = target.closest('.img-item').data('imgSrc');
        if (target.is('.is-bg')) {
          canvasCtrl.publish('changeBg', imgSrc);
        } else if (target.is('.is-item')) {
          canvasCtrl.publish('addNewItem', common.commands.ADD_IMG, imgSrc);
        }
      } else if (target.is('.color-brick')) {
        canvasCtrl.publish('changeBgColor', target.data('colorCode'));
      } else if (target.is('#add-color-fp')) {

      }
    }

    function initializeFormBuilder() {
      if (!fb) {
        var options = {
          i18n: {
            locale: 'zh-CN'
          },
          disabledActionButtons: ['save', 'clear', 'data']
        };
        fb = $('#form-builder-mounter').formBuilder(options);
      }
    }

    function dlHTML() {
      common.utils.getPageHTML('.elements', 'index.template.html', function (hml) {
        common.utils.download('page.html', 'text/html', hml);
      });
    }

    function printHTML() {
      var win = window.open('', 'Preview', 'height=800,width=1280,toolbar=no,scrollbars=yes');
      common.utils.getPageHTML('.elements', 'index.template.html', function (hml) {
        common.utils.print(hml, win);
      });
    }

    function onFBContainerClick(event) {
      var target = $(event.target);
      if (fb && fb.actions && fb.actions.getData) {
        if (target.closest('.clear').length) {
          fb.actions.clearFields();
        } else if (target.closest('.submit').length) {
          var rndHTML = getRenderedHTML(fb.actions.getData('xml')) || '';
          if (!rndHTML) {
            showWarning('开始制作表单吧');
          } else {
            canvasCtrl.publish('addNewItem', common.commands.ADD_FORM, rndHTML);
            fb.actions.clearFields();
            fbContainer.modal('hide');
          }
        }
      }
    }

    function showWarning(warning) {
      var data = {
        message: warning,
        timeout: 2000,
        actionHandler: null
      };
      snackbarContainer.MaterialSnackbar.showSnackbar(data);
    }

    function getRenderedHTML(formData) {
      var formRenderOpts = {
        dataType: 'xml',
        formData: formData
      };
      var formField = $('<form />');
      formField.formRender(formRenderOpts);
      return formField.html();
    }

    function onExpOptsClick(event) {
      var target = $(event.target);
      canvasCtrl.publish('blurActiveEl');
      if (target.is('.dl')) {
        dlHTML();
      } else if (target.is('.print')) {
        printHTML();
      }
    }

    function initializeCtxMenu() {
      $.contextMenu({
        selector: '#canvas-pages .page',
        items: {
          clone: {
            name: "复制页面", callback: function () {
              canvasCtrl.publish('blurActiveEl');
              this.clone(true).removeClass('selected context-menu-active').insertAfter(this);
              canvasCtrl.publish('rearrangePages');
            }
          },
          applyBgToAll: {
            name: "应用页面背景到全部", callback: function () {
              this.siblings('.page').find('.elements').css('background', this.find('.elements').css('background'));
            }
          },
          removePage: {
            name: '删除本页', callback: function () {
              canvasCtrl.publish('removeItem', this);
            }
          }
        },
        animation: {duration: 100, show: 'fadeIn', hide: 'fadeOut'}
      });
      $.contextMenu({
        selector: '#overlays .element',
        items: {
          OK: {
            name: "确定", callback: function () {
              canvasCtrl.publish('blurActiveEl');
            }
          },
          remove: {
            name: "移除", callback: function () {
              canvasCtrl.publish('removeItem');
            }
          }
        },
        animation: {duration: 100, show: 'fadeIn', hide: 'fadeOut'}
      });
      $.contextMenu({
        // define which elements trigger this menu
        selector: ".elements .element",
        // define the elements of the menu
        items: {
          sendUpward: {
            name: "往上一层", callback: function () {
              if (this.next('.element').length) {
                this.insertAfter(this.next('.element'));
              }
            }
          },
          sendDownward: {
            name: "往下一层", callback: function () {
              if (this.prev('.element')) {
                this.insertBefore(this.prev('.element'));
              }
            }
          },
          sendTop: {
            name: "移向顶层", callback: function () {
              this.closest('.elements').append(this);
            }
          },
          sendBottom: {
            name: "移向底部", callback: function () {
              this.closest('.elements').prepend(this);
            }
          },
          clone: {
            name: "复制", callback: function () {
              this.clone().removeClass('context-menu-active').insertAfter(this);
            }
          },
          removeItem: {
            name: "移除", callback: function () {
              canvasCtrl.publish('removeItem', this);
            }
          }
        },
        animation: {duration: 100, show: 'fadeIn', hide: 'fadeOut'}
      });
    }

    function bugFixes() {
      document.addEventListener('mouseup', function () {
        document.documentElement.style.cursor = 'auto'
      }, false);
      window.addEventListener('resize', function () {
        canvasCtrl.publish('changePageSize');
      });
    }

    function onUpImgFieldChange() {
      var files = this.files;
      var i;
      var fileNum = files.length;
      for (i = 0; i < fileNum; i++) {
        appendSpecialImage(window.URL.createObjectURL(files[i]));
      }
    }

    function onCompStoreClick(event) {
      var target = $(event.target);
      var component = target.closest('.component');
      if (component.length) {
        var compType = component.data('component');
        var htm = $('#tpl--' + compType).html();
        if (htm) {
          canvasCtrl.publish('addNewItem', common.commands.ADD_COMP, {html: htm, type: compType});
        }
      }
    }

    function installClickFocusBtns() {
      $('.click-focus').on('click', function () {
        var $self = $(this);
        $self.closest('.component-container').addClass('focus');
      });
      $('.click-un-focus').on('click', function () {
        var $self = $(this);
        $self.closest('.component-container').removeClass('focus');
      });
    }

    function installMediaComp() {
      var audioSrc;
      var autoplayAudio;
      var loopAudio;
      var embedVideoCode;
      $('#create-audio').on('click', function () {
        audioSrc = $('#music-src').val();
        if (!audioSrc) {
          showWarning('告诉我们音乐链接吧');
          return;
        }
        autoplayAudio = $('label[for="autoplay-cb"]').hasClass('is-checked');
        loopAudio = $('label[for="loop-cb"]').hasClass('is-checked');
        canvasCtrl.publish('addNewItem', common.commands.ADD_AUDIO, {
          src: audioSrc,
          loop: loopAudio,
          autoplay: autoplayAudio
        });
      });
      $('#create-video-embed').on('click', function () {
        embedVideoCode = $('#embed-video-code').val();
        if (!embedVideoCode) {
          showWarning('告诉我们嵌入视频代码吧');
          return;
        }
        canvasCtrl.publish('addNewItem', common.commands.ADD_VIDEO, {embedCode: embedVideoCode});
      });
    }

    function installAnimationTool() {
      var animation;
      $('#activate-animation').on('click', function () {
        animation = $('#select-animation').val();
        canvasCtrl.publish('applyAnimation', animation);
      });
    }

    uiCtrl.subscribe('showWarning', showWarning);
    uiCtrl.subscribe('showHotTools', showHotTools);
    uiCtrl.subscribe('updatePageSizeMd', updatePageSizeMd);
    uiCtrl.subscribe('load-image-lib', loadImgLib);
    addPageBtn.click(onAddPageBtnClick);
    rmItemBtn.click(onRmItemBtnClick);
    hotTools.find('button, .mdl-menu__item').click(onHotToolsClick);
    pageSizeMd.on('keyup', onPageSizeMdKeyup);
    imgLib.on('click', onImgLibClick);
    compStore.on('click', onCompStoreClick);
    installPickers();
    installClickFocusBtns();
    installMediaComp();
    installAnimationTool();
    doExpOpts.click(onExpOptsClick);
    fbContainer.on('shown.bs.modal', initializeFormBuilder).on('click', onFBContainerClick);
    initializeCtxMenu();
    bugFixes();
    $('#upload-img-field').on('change', onUpImgFieldChange);
    loadImgLib();
  })(canvasCtrl);
})();
