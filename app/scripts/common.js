/**
 * Created by hao on 17-4-15.
 */
var _common = {
  commands: {
    ADD_TEXT: 'add-text'
  },
  utils: {
    updatePosition: function(target, x, y) {
      this.setCSSTransform2D(target, x, y);
      target.attr('data-x', x).attr('data-y', y);
    },
    updateSize: function(target, w, h) {
      target.width(w);
      target.height(h);
    },
    setCSSTransform2D: function(target, x, y) {
      target.css(
        {
          '-webkit-transform': 'translate('+x+'px,'+y+'px)',
          'transform': 'translate('+x+'px,'+y+'px)'
        });
    },
    setCtnEditable: function(htmlEl, setting) {
      $(htmlEl).find('.inner').attr('contenteditable', setting);
    },
    docExecCmd: function(command, ui, options) {
      return document.execCommand(command, ui || false, options || null);
    },
    makeElResizable: function(selector, options) {
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
        .on('resizemove', function(event) {
          var target = $(event.target);
          var x = parseFloat(target.attr('data-x') || 0);
          var y = parseFloat(target.attr('data-y') || 0);

          target.width(event.rect.width);
          target.height(event.rect.height);

          x += event.deltaRect.left;
          y += event.deltaRect.top;

          self.updatePosition(target, x, y);

          if(options.action && options.action === 'resizeSelected') {
            self.updatePosition(target.siblings('.element'), x, y);
            self.updateSize(target.siblings('.element'), target.width(), target.height());
          }
        });
    },
    makeElDraggable: function(selector, options) {
      options = options || {};
      var self = this;
      interact(selector, {
        context: options.context || document
      })
        .draggable({
          inertia: options.inertia || true,
          autoScroll: options.autoScroll || true,
          onstart: function(event) {
            event.target.style.pointerEvents = 'none';
          },
          onmove: function(event) {
            var target = $(event.target);
            var x = parseFloat(target.attr('data-x') || 0) + event.dx;
            var y = parseFloat(target.attr('data-y') || 0) + event.dy;

            self.updatePosition(target, x, y);

            if(options.action && options.action === 'moveSelected') {
              self.updatePosition(target.siblings('.element'), x, y);
            }
          },
          onend: function(event) {
            event.target.style.pointerEvents = 'auto';
          }
        });
    }
  }
};
