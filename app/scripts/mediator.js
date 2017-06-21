/**
 * Created by hao on 17-4-15.
 */
// Define a "class" containing publish(), subscribe(), and unsubscribe() methods to implement
// the mediator pattern. Note the similarilty to the observer pattern, the only difference is
// that we are creating a "class" here for creating object instances from later, and that we
// initialize the events array afresh for each object instance to avoid all instances sharing
// the same array in memory.
/**
 * class Mediator
 * @constructor
 */
function Mediator() {
  /**
   * 记录事件处理函数
   * @property {Object} events
   */
  this.events = {};
}

/**
 * 订阅一个事件
 * @method subscribe
 * @param {String} eventName 订阅事件的名称
 * @param {Function} callback 订阅事件的回调函数
 */
Mediator.prototype.subscribe = function (eventName, callback) {
  if (!this.events.hasOwnProperty(eventName)) {
    this.events[eventName] = [];
  }

  this.events[eventName].push(callback);
};

/**
 * 取消订阅一个事件
 * @method unsubscribe
 * @param {String} eventName 取消订阅事件的名称
 * @param {Function} callback 取消订阅事件的回调函数
 */
Mediator.prototype.unsubscribe = function (eventName, callback) {
  var index = 0;
  var length = 0;

  if (this.events.hasOwnProperty(eventName)) {
    length = this.events[eventName].length;

    for (; index < length; index++) {
      if (this.events[eventName][index] === callback) {
        this.events[eventName].splice(index, 1);
        break;
      }
    }
  }
};

/**
 * 发布一个事件，调用这个事件订阅的所有回调函数
 * @param {String} eventName 发布事件的名称
 */
Mediator.prototype.publish = function (eventName) {
  var data = Array.prototype.slice.call(arguments, 1);
  var index = 0;
  var length = 0;

  if (this.events.hasOwnProperty(eventName)) {
    length = this.events[eventName].length;

    for (; index < length; index++) {
      this.events[eventName][index].apply(this, data);
    }
  }
};
