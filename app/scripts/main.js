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
      ADD_VIDEO: 'add-video',
      ADD_SHAPE: 'add-shape'
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
        }, 100);
      }
    }
  };

  /**
   * 新建一个中介者，主要针对画布上的操作行为进行处理控制
   * @class canvasCtrl
   * @constructor {Mediator}
   */
  var canvasCtrl = new Mediator();
  /**
   * 新建一个中介者，对与网页主界面相关的用户操作进行控制
   * @class uiCtrl
   * @constructor {Mediator}
   */
  var uiCtrl = new Mediator();

  /**
   * 在下列函数包里面集中处置关于编辑页面内容本身相关的操作
   */
  (function (canvasCtrl) {
    var overlays = $('#overlays');
    var selectionBox = common.utils.getElemFromTpl('#tpl--selection-box');
    var selectedPageCtn;
    var activeEl;
    var alLines = $('#alignment-lines');
    alLines.remove();

    /**
     * 处理编辑页面的范围内的点击事件
     * @param {Event} event 点击事件
     */
    function onCanvasPageClick(event) {
      uiCtrl.publish('updatePageSizeMd', $(this).width(), $(this).height());
      $(this).addClass('selected').siblings('.page').removeClass('selected');
      var target = $(event.target).closest('.element');
      if (activeEl) {
        if (!target.is(activeEl)) {
          setElActive(activeEl, false);
        }
      }
      selectedPageCtn = $(this).find('.elements');
      $(document.body, document).animate({
        scrollTop: selectedPageCtn.offset().top - 90
      }, 200);
      if (target.is('.element')) {
        setElActive(target, true);
      }
    }

    /**
     * 当“新增页面”事件发生的时候，触发此事件，为新增的页面增加事件处理函数
     * @param {Object} pageEl - 新增页面的JQuery对象
     */
    function onAddPage(pageEl) {
      pageEl.click(onCanvasPageClick);
      pageEl.click();
    }

    /**
     * 时间处理函数，设定当前被选择页面的宽度和长度
     * @param {Number} width 设定的目标宽度
     * @param {Number} height 设定的目标长度
     */
    function onChangePageSize(width, height) {
      var bk = activeEl;
      if (activeEl) {
        setElActive(activeEl, false);
      }
      if (selectedPageCtn) {
        var page = selectedPageCtn.closest('.page');
        if (width && height && ~~width > 0 && ~~height > 0) {
          page.width(width).height(height);
        } else {
          page.width(page.width()).height(page.height());
        }
      }
      rearrangePages();
      if (bk) {
        setElActive(bk, true);
      }
    }

    /**
     * 当首页上面的“移除元素”按钮触发的时候，这个函数被调用
     * @param {Object} target - JQuery Object, 想要删除的元素，可选，如果有传入就移除它，否则就移除活跃的元素/页面
     */
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

    /**
     * （页面删除之后，或是修改尺寸之后）重新组织所有页面布局
     */
    function rearrangePages() {
      var offsetY = 0;
      var left;
      var outerWidth = $('#canvas-pages').outerWidth();
      var maxScale = 1;
      $('.page').each(function () {
        $(this).css('top', offsetY);
        offsetY += $(this).height() + 36;
        left = (outerWidth - $(this).width()) / 2;
        left = left > 0 ? left : 0;
        $(this).css({
          left: left
        });
      });
    }

    /**
     * 根据传入的图片链接修改元素/页面的背景图片
     * @param {String} imgSrc 图片URL
     */
    function changeBg(imgSrc) {
      var bgCSSObj = {
        'background-image': 'url(' + imgSrc + ')'
      };
      if (activeEl) {
        if (activeEl.is('.comp.card-wide') || activeEl.is('.comp.card-square')) {
          activeEl.find('.mdl-card__title').css(bgCSSObj);
        } else if (activeEl.is('.comp.card-note') || activeEl.is('.comp.card-tag')) {
          activeEl.find('.mdl-card').css(bgCSSObj);
        } else if (activeEl.is('.shape')) {
          uiCtrl.publish('showWarning', '形状元素无法设置复杂图案作为背景');
        } else {
          activeEl.find('.inner').css(bgCSSObj);
        }
      } else if (selectedPageCtn) {
        selectedPageCtn.css(bgCSSObj);
      }
    }

    /**
     * 根据传入的色值修改元素/页面背景颜色
     * @param {String} colorCode 颜色值，例如rgba(...), #XXXXXX
     */
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
        } else if (activeEl.is('.shape')) {
          activeEl.find('svg > *').attr('fill', colorCode);
        } else {
          activeEl.find('.inner').css(bgCSSObj);
        }
      } else if (selectedPageCtn) {
        selectedPageCtn.css(bgCSSObj);
      }
    }

    /**
     * 撤销元素活跃（编辑）状态
     */
    function blurActiveEl() {
      if (activeEl) {
        setElActive(activeEl, false);
      }
    }

    /**
     * 对处于编辑状态的元素应用动画效果
     * @param x
     */
    function applyAnimation(options) {
      if (activeEl) {
        activeEl.find('.inner').removeClass().addClass('inner animated').addClass(options.name).css({
          'animation-duration': options.duration + 'ms',
          'animation-delay': options.delay + 'ms',
          '-webkit-animation-duration': options.duration + 'ms',
          '-webkit-animation-delay': options.delay + 'ms'
        });
      } else {
        uiCtrl.publish('showWarning', '先选择想要应用动画的物件');
      }
    }

    /**
     * 中介者canvasCtrl订阅一系列侦听事件
     */
    canvasCtrl.subscribe('addPage', onAddPage);
    canvasCtrl.subscribe('removeItem', onRmItem);
    canvasCtrl.subscribe('addNewItem', addNewItem);
    canvasCtrl.subscribe('changePageSize', onChangePageSize);
    canvasCtrl.subscribe('changeBg', changeBg);
    canvasCtrl.subscribe('changeBgColor', changeBgColor);
    canvasCtrl.subscribe('blurActiveEl', blurActiveEl);
    canvasCtrl.subscribe('rearrangePages', rearrangePages);
    canvasCtrl.subscribe('applyAnimation', applyAnimation);

    /**
     * 传递给外界处于编辑状态的元素
     * @returns {Object} activeEl
     */
    canvasCtrl.getActiveEl = function () {
      return activeEl;
    };
    /**
     * 传递给外界被选择的页面元素
     * @returns {*}
     */
    canvasCtrl.getSelectedPageCtn = function () {
      return selectedPageCtn;
    };

    /**
     * 对可编辑页面和元素进行处理，所以可以拖动、缩放
     */
    common.utils.makeElResizable('.page',
      {right: '.resize-handle', bottom: '.resize-handle'});
    common.utils.makeElResizable('.selection-box.text, .selection-box.form, .selection-box.video', {
      top: '.t, .lt, .rt',
      right: '.r, .rt, .rb',
      bottom: '.b, .lb, .rb',
      left: '.l, .lt, .lb',
      action: 'resizeSelected'
    });
    common.utils.makeElResizable('.selection-box.image, .selection-box.shape', {
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
          if (Math.abs(siblingOC.cx - offsetCenter.cx) <= 3) {
            hasV = true;
            common.utils.updatePosition(alLines.children('.v'), siblingOC.cx, 0);
            offsetCenter.cx = siblingOC.cx;
          }
          if (Math.abs(siblingOC.cy - offsetCenter.cy) <= 3) {
            hasH = true;
            common.utils.updatePosition(alLines.children('.h'), 0, siblingOC.cy);
            offsetCenter.cy = siblingOC.cy;
          }
        });
        if (Math.abs(offsetCenter.cx - selectedPageCtn.outerWidth() / 2) <= 3) {
          hasV = true;
          common.utils.updatePosition(alLines.children('.v'), selectedPageCtn.outerWidth() / 2, 0);
          offsetCenter.cx = selectedPageCtn.outerWidth() / 2;
        }
        if (Math.abs(offsetCenter.cy - selectedPageCtn.outerHeight() / 2) <= 3) {
          hasH = true;
          common.utils.updatePosition(alLines.children('.h'), 0, selectedPageCtn.outerHeight() / 2);
          offsetCenter.cy = selectedPageCtn.outerHeight() / 2;
        }
        common.utils.updatePosition(target, offsetCenter.cx + dx - target.outerWidth() / 2, offsetCenter.cy + dy - target.outerHeight() / 2);
        if (hasH) {
          alLines.addClass('show-h').children('.h').attr('width', selectedPageCtn.outerWidth());
        } else {
          alLines.removeClass('show-h');
        }
        if (hasV) {
          alLines.addClass('show-v').children('.v').attr('height', selectedPageCtn.outerHeight());
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
          if (Math.abs(siblingOC.cx - offsetCenter.cx) <= 3) {
            hasV = true;
            common.utils.updatePosition(alLines.children('.v'), siblingOC.cx, 0);
            offsetCenter.cx = siblingOC.cx;
          }
          if (Math.abs(siblingOC.cy - offsetCenter.cy) <= 3) {
            hasH = true;
            common.utils.updatePosition(alLines.children('.h'), 0, siblingOC.cy);
            offsetCenter.cy = siblingOC.cy;
          }
        });
        if (Math.abs(offsetCenter.cx - selectedPageCtn.outerWidth() / 2) <= 3) {
          hasV = true;
          common.utils.updatePosition(alLines.children('.v'), selectedPageCtn.outerWidth() / 2, 0);
          offsetCenter.cx = selectedPageCtn.outerWidth() / 2;
        }
        if (Math.abs(offsetCenter.cy - selectedPageCtn.outerHeight() / 2) <= 3) {
          hasH = true;
          common.utils.updatePosition(alLines.children('.h'), 0, selectedPageCtn.outerHeight() / 2);
          offsetCenter.cy = selectedPageCtn.outerHeight() / 2;
        }
        common.utils.updatePosition(target, offsetCenter.cx - target.outerWidth() / 2, offsetCenter.cy - target.outerHeight() / 2);
        if (hasH) {
          alLines.addClass('show-h').children('.h').attr('width', selectedPageCtn.outerWidth());
        } else {
          alLines.removeClass('show-h');
        }
        if (hasV) {
          alLines.addClass('show-v').children('.v').attr('height', selectedPageCtn.outerHeight());
        } else {
          alLines.removeClass('show-v');
        }
      },
      onend: function (event) {
        alLines.remove().removeClass('show-h show-v');
      }
    });

    /**
     * 给元素套上/撤去选择盒子
     * @param {Object} elem - JQuery object 针对的目标元素
     * @param {Boolean} wrap - 套上/撤去选择盒子
     */
    function setWrapSelectionBox(elem, wrap) {
      var ctt = elem.data('type');
      selectionBox.removeClass().addClass('selection-box').addClass(ctt);
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
     * 设置某个元素为编辑状态或是取消此状态
     * @param {Object} elem - JQuery object 目标元素
     * @param {Boolean} active - 设置编辑状态/取消
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
     * 新增一个通用节点
     * @param {String} nodeName - 节点（标签）名称，通常是“div”
     * @param {Object} cssOptions - 作为CSS键值对传入到JQuery的$.css方法中
     * @return {Object} - 返回初步构建好的节点对象，是JQuery对象
     */
    function createNode(nodeName, cssOptions) {
      var node = $(document.createElement('div'));
      var innerNode = $(document.createElement(nodeName)).addClass('inner').attr('spellcheck', false);
      node.append(innerNode);
      return node.css(cssOptions || {}).addClass('element');
    }

    /**
     * 添加新的文本以供编辑
     */
    function addText() {
      var textNode = createNode('div');
      textNode.addClass('text').data('type', 'text').find('.inner').text('ini canvas canvas ini');
      setElActive(textNode, true);
      document.execCommand('selectAll', false);
    }

    /**
     * 添加新的图片块
     * @param {String} imgSrc 要创建的图片的URL
     */
    function addImg(imgSrc) {
      var img = new Image();
      img.src = imgSrc;
      img.onload = function () {
        var imgNode = createNode('div');
        imgNode.addClass('image').data('type', 'image').find('.inner').append(img);
        setElActive(imgNode, true);
      };
    }

    /**
     * 把创建好的表格添加到页面中
     * @param {String} rndHTML 新建表格的HTML代码
     */
    function addForm(rndHTML) {
      var formNode = createNode('div');
      formNode.addClass('form').data('type', 'form').find('.inner').append(rndHTML);
      setElActive(formNode, true);
    }

    /**
     * 添加部件到页面中以供编辑
     * @param {Object} args 关于部件更详细的参数信息
     */
    function addComp(args) {
      args = args || {};
      var htm = args.html;
      var type = args.type;
      var compNode = createNode('div');
      compNode.addClass(type).addClass('comp').data('type', type).find('.inner').append(htm);
      setElActive(compNode, true);
    }

    /**
     * 添加audio元素到页面中
     * @param {Object} args 关于这个audio元素的更多信息
     */
    function addAudio(args) {
      var loop = args.loop;
      var autoplay = args.autoplay;
      var src = args.src;
      src = decodeURIComponent(src);

      var audioWrap = document.createElement('div');
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

    /**
     * 添加video元素到页面中
     * @param {Object} args 关于这个video元素的更多信息
     */
    function addVideo(args) {
      var embedCode = args.embedCode;
      var videoWrap = document.createElement('div');
      videoWrap.innerHTML = embedCode;

      var videoNode = createNode('div');
      videoNode.addClass('video').data('type', 'video').find('.inner').append(videoWrap.outerHTML);
      setElActive(videoNode, true);
    }

    function addShape(args) {
      var shape = args.type;
      var width = args.width || 100;
      var height = args.height || 100;
      var code;
      if (shape === 'triangle') {
        code = '<svg width="100%" height="100%" viewBox="0 0 100 100"><polygon points="0,100 50,0 100,100" fill="greenyellow"></polygon> </svg>';
      } else if (shape === 'rectangle') {
        code = '<svg width="100%" height="100%"><rect height="100%" width="100%" fill="greenyellow"></rect></svg>';
      } else if (shape === 'circle') {
        code = '<svg width="100%" height="100%"><circle r="50%" cx="50%" cy="50%" fill="greenyellow"></circle></svg>';
      }
      var shapeNode = createNode('div');
      shapeNode.addClass('shape').data('type', 'shape ' + shape).css({
        width: width,
        height: height
      }).find('.inner').append(code);
      setElActive(shapeNode, true);
    }

    /**
     * 处理添加新元素到页面中事宜
     * @param {String} command 创建新元素的命令，指明了是要创建什么元素
     * @param {String} extra 有关这个要创建元素的更多信息，可选
     */
    function addNewItem(command, extra) {
      if (!selectedPageCtn) {
        uiCtrl.publish('showWarning', '当前没有选定任何画布，请选择一个画布，或者添加新页', 3000);
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
        case common.commands.ADD_SHAPE:
          addShape(extra);
          break;
        default:
          break;
      }
    }
  })(canvasCtrl);

  /**
   *在下列函数包里面集中处置主界面按钮操作相关的事情
   */
  (function (canvasCtrl) {
    var tbMain = $('#tb--main');
    var closeBtn = $('.close-btn');
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
    var fileImpHTML = $('#import-html');

    /**
     * 用户点击主功能栏的事件处理函数
     */
    function onMainTbItemClick() {
      var targetEl = $(this);
      var command = targetEl.attr('data-command');
      if (command) {
        canvasCtrl.publish('addNewItem', command);
      }
      var toggleId = targetEl.attr('data-toggle-id');
      if (toggleId) {
        targetEl.addClass('active').siblings('.command').removeClass('active');
        var target = $('#' + toggleId).addClass('show');
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

    /**
     * 添加页面按钮被触发的时候的事情回调函数
     */
    function onAddPageBtnClick() {
      canvasCtrl.publish('blurActiveEl');
      var pageEl = common.utils.getElemFromTpl('#tpl--page').height($(window).height() - 126);
      // var lastPage = $('.page').last();
      // if (lastPage.length) {
      //   pageEl.css('top', lastPage.position().top + lastPage.height() + 75);
      // }
      pageEl.attr('id', 'page-' + new Date().getTime());
      canvasPages.children('#pages').append(pageEl);
      canvasCtrl.publish('changePageSize');
      canvasCtrl.publish('addPage', pageEl);
    }

    /**
     * 添加一个页面
     */
    onAddPageBtnClick();

    /**
     * 用户点击删除元素按钮的事件处理函数
     */
    function onRmItemBtnClick() {
      canvasCtrl.publish('removeItem');
    }

    /**
     * 管理临时工具栏的显示
     * @param {Object} options 更多详细设定
     */
    function showHotTools(options) {
      options = options || {};
      if (options.action) {
        hotTools.filter('.' + options.type).addClass('show');
      } else {
        hotTools.removeClass('show');
      }
    }

    /**
     * 在富文本编辑状态下，会出现需要用户填写更多信息的情况，比如插入链接
     * @param command
     * @param promptText
     * @param promptDefault
     */
    function doPopupCommand(command, promptText, promptDefault) {
      var usrInput = prompt(promptText, promptDefault);
      if (usrInput) {
        document.execCommand(command, false, usrInput);
      }
    }

    /**
     * 注册临时工具栏点击事件处理函数
     */
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

    /**
     *  富文本编辑框修改字体大小
     */
    function changeEdFontSz() {
      $('font[size]').css('font-size', currentFontSize + 'px').removeAttr('size');
      this.removeEventListener('keyup', changeEdFontSz);
    }

    /**
     * 安装第三方颜色选择器
     */
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

    /**
     * 绑定第三方颜色选择器
     * @param {String} selector 想要绑定的目标元素的选择器字符串
     * @param {String} setupColor 初始化颜色
     * @param {Function} cb 用户在颜色选择器上修改颜色之后触发的事件回调函数
     */
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

    /**
     * 当用户触发网页右上角的修改页面尺寸文本域时就修改当前被选择页面的尺寸
     */
    function changePageSize() {
      var w = pageSizeMd.find('.page-width').val();
      var h = pageSizeMd.find('.page-height').val();
      canvasCtrl.publish('changePageSize', w, h);
    }

    /**
     * 右上角的修改页面尺寸文本域通过回车键触发
     * @param {Event} event
     */
    function onPageSizeMdKeyup(event) {
      if (event.keyCode === 13) {
        changePageSize();
      }
    }

    /**
     * 更新右上角页面尺寸输入域值
     * @param {Number} width
     * @param {Number} height
     */
    function updatePageSizeMd(width, height) {
      pageSizeMd.find('.page-width').val(width).end().find('.page-height').val(height).end().find('.mdl-textfield').addClass('is-dirty');
    }

    /**
     * 加载图片仓库的函数
     */
    function loadImgLib() {
      if (imgLibLoaded) {
        return;
      }
      imgLibLoaded = true;
      loadColorPlatte();
      loadSpecialImages();
    }

    /**
     * 加载图片库中的色板
     */
    function loadColorPlatte() {
      // var colors = ['#2d0921', '#c5c159', '#ffc0cb', '#012d5a', '#ad0725', '#913053', '#59112c',
      //   '#37a2b2', '#99ffdd', '#aaf1be', '#000000', '#f97508', '#66217e', '#ffe5fc', '#e5d0d7', '#beffab', '#abbeff', '#c2abff'];
      // var len = colors.length;
      for (var i = 0; i < 18; i++) {
        appendColorPlatte('#' + Math.floor(0xffffff * Math.random()).toString(16));
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

    /**
     * 加载特色图片
     */
    function loadSpecialImages() {
      var images = [
        'http://www.amazingwallpaperz.com/wp-content/uploads/Abstract-Painting-Wallpaper-Mobile-Phones.jpg',
        'http://www.cianellistudios.com/images/abstract-paintings/abstract-paintings-splash.jpg',
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
        'http://dreamatico.com/data_images/strawberry/strawberry-1.jpg',
        'https://www.pohlmans.com.au/app/uploads/2014/02/Strawberry-Sweetheart1.jpg',
        'http://www.rainbowresidence.ca/wp-content/uploads/2014/07/rainbow-accidentsm.jpg',
        'http://fullhdpictures.com/wp-content/uploads/2015/10/Sea-Wallpaper-HD.jpg',
        'http://www.eukanuba.ca/images/default-source/why-eukanuba/Articles-Assets/Dog-Articles-and-Resources/how-to-switch-from-puppy-to-adult-dog-food.jpg?sfvrsn=0',
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

    /**
     * 图片库侧边栏的点击事件回调函数
     * @param {Event} event
     */
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

    /**
     * 初始化表单创建器
     */
    function initializeFormBuilder() {
      if (!fb) {
        showWarning('开始初始化表单创建机');
        var options = {
          i18n: {
            locale: 'zh-CN'
          },
          disabledActionButtons: ['save', 'clear', 'data']
        };
        fb = $('#form-builder-mounter').formBuilder(options);
      }
    }

    /**
     * 下载每个页面都下载成单独的HTML
     */
    function dlHTML() {
      common.utils.getPageHTML('.elements', 'index.template.html', function (hml) {
        common.utils.download('page-' + new Date().getTime() + '.html', 'text/html', hml);
      });
    }

    /**
     * 打印页面
     */
    function printHTML() {
      var win = window.open('', 'Preview', 'height=800,width=1280,toolbar=no,scrollbars=yes');
      common.utils.getPageHTML('.selected .elements', 'index.template.html', function (hml) {
        common.utils.print(hml, win);
      });
    }

    /**
     * 用户在表单创建器上的事件处理函数
     * @param event
     */
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

    /**
     * 显示通知和警告
     * @param {String} warning 通知内容
     */
    function showWarning(warning, timeout) {
      var data = {
        message: warning,
        timeout: timeout || 2000,
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
      var target = $(this);
      canvasCtrl.publish('blurActiveEl');
      if (target.is('.dl')) {
        dlHTML();
      } else if (target.is('.print')) {
        printHTML();
      }
    }

    /**
     * 初始化若干重载的上下文菜单
     */
    function initializeCtxMenu() {
      $.contextMenu({
        selector: '#canvas-pages .page',
        items: {
          clone: {
            name: "拷贝画布", callback: function () {
              canvasCtrl.publish('blurActiveEl');
              this.clone(true).removeClass('selected context-menu-active').insertAfter(this);
              canvasCtrl.publish('rearrangePages');
            }
          },
          applyBgToAll: {
            name: "应用本页背景到全部画布", callback: function () {
              this.siblings('.page').find('.elements').css('background', this.find('.elements').css('background'));
            }
          },
          exportHTML: {
            name: "导出到HTML", callback: function () {
              canvasCtrl.publish('blurActiveEl');
              common.utils.getPageHTML(this.find('.elements'), 'index.template.html', function (hml) {
                common.utils.download('page-' + new Date().getTime() + '.html', 'text/html', hml);
              });
            }
          },
          loadPage: {
            name: "从文件导入", callback: function () {
              canvasCtrl.publish('blurActiveEl');
              var self = this;
              var callbackFunc = function () {
                var file = this.files[0];
                if (file) {
                  uiCtrl.publish('showWarning', '正在载入');
                  var reader = new FileReader();
                  reader.readAsText(file, 'UTF-8');
                  reader.onload = function () {
                    var template = document.createElement('template');
                    template.innerHTML = this.result;
                    var page = $(template.content.querySelector('.page'));
                    if (page.length) {
                      self.html(page.html()).width(page.width()).height(page.height());
                    }
                  };
                  reader.onerror = function () {
                    uiCtrl.publish('showWarning', '读取文件出错');
                  }
                } else {
                  uiCtrl.publish('showWarning', '未选择文件');
                }
              };
              fileImpHTML.off().click().on('change', callbackFunc);
            }
          },
          "sep1": "---------",
          clearAll: {
            name: "清空画布", callback: function () {
              canvasCtrl.publish('blurActiveEl');
              this.find('.elements').empty();
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
      // $.contextMenu({
      //   selector: '#overlays .element',
      //   items: {
      //     // paste: {
      //     //   name: "粘贴", callback: function () {
      //     //     var self = this;
      //     //     self.find('.inner').focus().off('paste').on('paste', function () {
      //     //       console.log('paste event: ')
      //     //     });
      //     //     document.execCommand('paste', false);
      //     //   }
      //     // },
      //     // pasteUnformatted: {
      //     //   name: "无格式粘贴", callback: function () {
      //     //
      //     //   }
      //     // },
      //     OK: {
      //       name: "确定编辑完成", callback: function () {
      //         canvasCtrl.publish('blurActiveEl');
      //       }
      //     },
      //     "sep1": "---------",
      //     remove: {
      //       name: "移除", callback: function () {
      //         canvasCtrl.publish('removeItem');
      //       }
      //     }
      //   },
      //   animation: {duration: 100, show: 'fadeIn', hide: 'fadeOut'}
      // });
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
          "sep1": "---------",
          removeItem: {
            name: "移除", callback: function () {
              canvasCtrl.publish('removeItem', this);
            }
          }
        },
        animation: {duration: 100, show: 'fadeIn', hide: 'fadeOut'}
      });
    }

    /**
     * 漏洞修复集中处理单元
     */
    function bugFixes() {
      document.addEventListener('mouseup', function () {
        document.documentElement.style.cursor = 'auto'
      }, false);
      window.addEventListener('resize', function () {
        canvasCtrl.publish('changePageSize');
      });
    }

    /**
     * 图片上传输入域发生修改时，也就是用户选择好了要上传的图片时的回调函数
     */
    function onUpImgFieldChange() {
      var files = this.files;
      var i;
      var fileNum = files.length;
      for (i = 0; i < fileNum; i++) {
        appendSpecialImage(window.URL.createObjectURL(files[i]));
      }
    }

    /**
     * 用户在热门部件侧边栏上点击的事件处理函数
     * @param event
     */
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

    /**
     * 当用户想要添加音乐、视频、动画的时候，需要进一步设置
     */
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

    /**
     * 安装音频、视频部件安装器
     */
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

    /**
     * 安装动画特效设置
     */
    function installAnimationTool() {
      var animationName, animationDur, animationDl;
      $('#activate-animation').on('click', function () {
        animationName = $('#select-animation').val();
        animationDl = $('#animate-delay').val();
        animationDur = $('#animate-duration').val();
        canvasCtrl.publish('applyAnimation', {name: animationName, duration: animationDur, delay: animationDl});
      });
    }

    function installShapeMaker() {
      var shape;
      $('#create-shape').on('click', function () {
        shape = $('#select-shape').val();
        canvasCtrl.publish('addNewItem', common.commands.ADD_SHAPE, {type: shape});
      });
    }

    /**
     * uiCtrl订阅一系列事件，当事件发生之时进行处理
     */
    uiCtrl.subscribe('showWarning', showWarning);
    uiCtrl.subscribe('showHotTools', showHotTools);
    uiCtrl.subscribe('updatePageSizeMd', updatePageSizeMd);
    uiCtrl.subscribe('load-image-lib', loadImgLib);

    tbMain.children().click(onMainTbItemClick);
    closeBtn.click(function () {
      $(this).closest('.slidebar').removeClass('show');
      $(document.body).removeClass('slidebar-open');
      // canvasCtrl.publish('changePageSize');
    });
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
    installShapeMaker();
    doExpOpts.children().click(onExpOptsClick);
    fbContainer.on('shown.bs.modal', initializeFormBuilder).on('click', onFBContainerClick);
    initializeCtxMenu();
    bugFixes();
    $('#upload-img-field').on('change', onUpImgFieldChange);
    loadImgLib();
  })(canvasCtrl);
})();
